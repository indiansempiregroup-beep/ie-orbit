import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { CalendarPicker } from '../../components/CalendarPicker';
import { TimePicker } from '../../components/TimePicker';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { Button } from '../../components/ui/Button';
import { GroupedList } from '../../components/ui/GroupedList';
import { Input } from '../../components/ui/Input';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useToast } from '../../contexts/ToastContext';
import { buildUpiPayUrl, openUpiInApp } from '../../utils/upi';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { useCart } from './CartContext';
import { addressSingleLine, addressTypeMeta, deliveryAddressLine } from './addressUtils';
import { QtyStepper } from './QtyStepper';
import { formatShopMoney, formatShopDateIso, formatShopDateLabel, formatShopTimeLabel, isPickupTimeAfterNow, nextAvailablePickupTime, shopLinePayable } from './shopHelpers';
import {
  cartLinesFromProducts,
  computeCartTotals,
  couponPayableToTaxableDiscount,
  isInterstateSupply,
  type DiscountType,
} from './cartPricing';
import { splitGstDisplay } from './shopOrderBill';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  ApiClientError,
  type CustomerAddress,
  type MerchantCashfreeCheckout,
  type MerchantRazorpayCheckout,
  type ShopCouponOffer,
} from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { GatewayCheckoutModal } from './GatewayCheckoutModal';
import {
  startCashfreeCheckout,
  startRazorpayCheckout,
  verifyCashfreeCheckout,
  verifyRazorpayCheckout,
} from './payShopOrderOnline';

type CheckoutPaymentMethod = 'cash' | 'upi' | 'razorpay' | 'cashfree';

const PLACE_ORDER_TIMEOUT_MS = 45000;
const PLACE_ORDER_BUSY_MESSAGE = 'Server is busy. Please try again in a moment.';

function tomorrowIso() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return formatShopDateIso(value);
}

function couponHeadline(offer: ShopCouponOffer, currency: string) {
  const value = Number(offer.discount_value || 0);
  if (String(offer.discount_type) === 'percent') {
    const cap = offer.max_discount_amount
      ? ` up to ${formatShopMoney(Number(offer.max_discount_amount), currency)}`
      : '';
    return `${value}% OFF${cap}`;
  }
  return `${formatShopMoney(value, currency)} OFF`;
}

function isAutomationOffer(offer: ShopCouponOffer) {
  return String(offer.source || '') === 'automation' || !offer.code;
}

function offerKey(offer: ShopCouponOffer) {
  if (offer.code) return `coupon:${offer.code}`;
  return `auto:${offer.workflow_id || offer.name || 'offer'}:${offer.discount_type}:${offer.discount_value}`;
}

type DeliveryMethod = 'instant' | 'standard';

type InstantDeliveryOption = {
  fee: number;
  providerLabel: string;
  quoteId: string;
  etaMinutes: number | null;
};

type StandardDeliveryOption = {
  fee: number;
  zoneName: string;
  sameDay: boolean;
  instantEnabled: boolean;
  shopInstantEnabled: boolean;
  isCatchAll: boolean;
  deliveryPromise?: { label?: string; detail?: string; arrives_by?: string | null };
  minOrderTotal: number;
};

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Cart'>>();
  const { bootstrap, branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { token } = useAuth();
  const toast = useToast();
  const { lines, setQuantity, clear, total, itemCount } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponDraft, setCouponDraft] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    name: string;
    discount: number;
  } | null>(null);
  const [appliedAutomation, setAppliedAutomation] = useState<{
    label: string;
    discount_type: 'percent' | 'amount';
    discount_value: string;
    discount: number;
  } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponOffers, setCouponOffers] = useState<ShopCouponOffer[]>([]);
  const [couponSheetOpen, setCouponSheetOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('standard');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('cash');
  const [upiUtr, setUpiUtr] = useState('');
  const [upiProofUrl, setUpiProofUrl] = useState('');
  const [upiProofPreview, setUpiProofPreview] = useState('');
  const [upiProofUploading, setUpiProofUploading] = useState(false);
  const [upiPaySheetOpen, setUpiPaySheetOpen] = useState(false);
  const [gatewayModal, setGatewayModal] = useState<
    | { provider: 'razorpay'; checkout: MerchantRazorpayCheckout }
    | { provider: 'cashfree'; checkout: MerchantCashfreeCheckout }
    | null
  >(null);
  const [pendingGatewayOrderId, setPendingGatewayOrderId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [instantDelivery, setInstantDelivery] = useState<InstantDeliveryOption | null>(null);
  const [standardDelivery, setStandardDelivery] = useState<StandardDeliveryOption | null>(null);
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [preferredDate, setPreferredDate] = useState(() => formatShopDateIso(new Date()));
  const [preferredTime, setPreferredTime] = useState(() => nextAvailablePickupTime() || '11:00');
  const [fulfillmentNote, setFulfillmentNote] = useState('');
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(Boolean(bootstrap?.loyalty?.enabled));
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [pointsPerCurrency, setPointsPerCurrency] = useState(bootstrap?.loyalty?.points_per_currency_unit ?? 10);
  const [maxRedeemPercent, setMaxRedeemPercent] = useState(bootstrap?.loyalty?.max_redeem_percent ?? 50);
  const [minRedeemPoints, setMinRedeemPoints] = useState(bootstrap?.loyalty?.min_redeem_points ?? 10);
  const [earnPointsPer100, setEarnPointsPer100] = useState(bootstrap?.loyalty?.earn_points_per_100 ?? 1);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const primary = branding?.primaryColor ?? colors.primary;
  const business = bootstrap?.business;
  const whatsappUpdatesAvailable = bootstrap?.otp_auth?.whatsapp_status === 'live';
  const currency = lines[0]?.product.currency || business?.currency || 'INR';
  const upiVpa = business?.upi_vpa || '';
  const codEnabled = Boolean(business?.cod_enabled ?? true);
  const canPayCash = codEnabled;
  const canPayQr = Boolean(upiVpa || business?.payment_qr_url);
  const canPayRazorpay = Boolean(business?.razorpay?.can_accept_payments);
  const canPayCashfree = Boolean(business?.cashfree?.can_accept_payments);
  const canPayOnline = canPayRazorpay || canPayCashfree || canPayQr;
  const cashPaymentLabel = fulfillment === 'delivery' ? 'Cash on delivery' : 'Pay at pickup';
  const cashPaymentHint =
    fulfillment === 'delivery' ? 'Pay when you receive your order' : 'Pay when you collect your order';
  const pickupAddress =
    business?.formatted_address ||
    [business?.address_line1, business?.city, business?.postal_code].filter(Boolean).join(', ');

  const selectedAddress = useMemo(
    () => addresses.find((item) => item.id === selectedAddressId) || addresses.find((item) => item.is_default) || null,
    [addresses, selectedAddressId],
  );
  const chosenAddressId = route.params?.selectedAddressId;
  useEffect(() => {
    if (chosenAddressId) setSelectedAddressId(chosenAddressId);
  }, [chosenAddressId]);

  const openAddressPicker = useCallback(() => {
    navigation.navigate('AddressBook', { mode: 'select', selectedAddressId: selectedAddress?.id });
  }, [navigation, selectedAddress?.id]);
  const openAddressForm = useCallback(() => {
    navigation.navigate('AddressForm', { selectOnSave: true });
  }, [navigation]);

  const selectedDelivery = deliveryMethod === 'instant' ? instantDelivery : standardDelivery;
  const deliveryFee = selectedDelivery?.fee ?? 0;
  const deliveryQuoteId = deliveryMethod === 'instant' ? instantDelivery?.quoteId ?? '' : '';

  const automationOffers = useMemo(
    () => couponOffers.filter((offer) => isAutomationOffer(offer) && offer.applicable),
    [couponOffers],
  );

  const cartLineInputs = useMemo(() => cartLinesFromProducts(lines), [lines]);
  const baseTotals = useMemo(() => computeCartTotals(cartLineInputs), [cartLineInputs]);

  const billDiscountType: DiscountType = appliedAutomation
    ? appliedAutomation.discount_type
    : appliedCoupon
      ? 'amount'
      : '';
  const billDiscountValue = appliedAutomation
    ? Number(appliedAutomation.discount_value) || 0
    : appliedCoupon
      ? couponPayableToTaxableDiscount(
          appliedCoupon.discount,
          baseTotals.taxableSubtotal,
          baseTotals.payable,
        )
      : 0;

  const afterBillTotals = useMemo(
    () => computeCartTotals(cartLineInputs, billDiscountType, billDiscountValue, 0),
    [billDiscountType, billDiscountValue, cartLineInputs],
  );

  const maxRedeemablePoints = useMemo(() => {
    if (!loyaltyEnabled || loyaltyBalance <= 0) return 0;
    const rate = Math.max(1, pointsPerCurrency);
    const eligible = afterBillTotals.taxableSubtotal;
    const maxByPercent = Math.floor(((eligible * maxRedeemPercent) / 100) * rate);
    return Math.max(0, Math.min(loyaltyBalance, maxByPercent));
  }, [afterBillTotals.taxableSubtotal, loyaltyEnabled, loyaltyBalance, maxRedeemPercent, pointsPerCurrency]);

  const redeemDiscount =
    pointsToRedeem > 0 ? pointsToRedeem / Math.max(1, pointsPerCurrency) : 0;

  const totals = useMemo(
    () => computeCartTotals(cartLineInputs, billDiscountType, billDiscountValue, redeemDiscount),
    [billDiscountType, billDiscountValue, cartLineInputs, redeemDiscount],
  );

  const deliveryFeeAmount = fulfillment === 'delivery' ? deliveryFee : 0;
  const grandTotal = Math.max(0, totals.payable + deliveryFeeAmount);
  const couponDiscount = appliedCoupon ? totals.billDiscountAmount : 0;
  const automationDiscount = appliedAutomation ? totals.billDiscountAmount : 0;
  const loyaltySavingsPayable = totals.loyaltyDiscountAmount;
  const merchandiseAfterCoupon = afterBillTotals.taxableSubtotal;

  const billIsInterstate =
    fulfillment === 'delivery'
      ? isInterstateSupply(business?.state, selectedAddress?.state)
      : false;
  const gstSplit = splitGstDisplay(totals.taxTotal, { isInterstate: billIsInterstate });

  const orderEarnPoints =
    loyaltyEnabled && earnPointsPer100 > 0
      ? Math.floor((grandTotal * earnPointsPer100) / 100)
      : 0;

  useEffect(() => {
    if (pointsToRedeem > maxRedeemablePoints) {
      setPointsToRedeem(maxRedeemablePoints);
    }
  }, [maxRedeemablePoints, pointsToRedeem]);

  const previewUpiUrl = useMemo(() => {
    if (!upiVpa) return '';
    return buildUpiPayUrl({
      vpa: upiVpa,
      payeeName: business?.display_name || 'Shop',
      amount: grandTotal,
      note: 'Shop order',
      currency: business?.currency || 'INR',
    });
  }, [business?.currency, business?.display_name, grandTotal, upiVpa]);

  useEffect(() => {
    if (paymentMethod !== 'upi') {
      setUpiPaySheetOpen(false);
      setUpiUtr('');
      setUpiProofUrl('');
      setUpiProofPreview('');
    }
  }, [paymentMethod]);

  async function uploadCheckoutUpiProof(source: 'camera' | 'library') {
    if (!token || !tenantSlug || !businessCode) {
      setError('Sign in to upload a payment screenshot.');
      return;
    }
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to capture the payment screenshot.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to upload a screenshot.');
          return;
        }
      }
    }
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUpiProofPreview(asset.uri);
    setUpiProofUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'payment-proof.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      const url =
        `${getApiBaseUrl()}/mobile/shop/payment-proof` +
        `?tenant_slug=${encodeURIComponent(tenantSlug)}&business_code=${encodeURIComponent(businessCode)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Upload failed');
      const mediaId = String(json?.data?.media_id || '').trim();
      const proof =
        String(json?.data?.payment_proof_url || '').trim() ||
        (mediaId ? `/api/v1/media/${mediaId}/file` : '');
      if (!proof) throw new Error('Upload did not return a proof URL.');
      setUpiProofUrl(proof);
    } catch (err) {
      setUpiProofUrl('');
      setUpiProofPreview('');
      setError(err instanceof Error ? err.message : 'Unable to upload payment screenshot.');
    } finally {
      setUpiProofUploading(false);
    }
  }

  function pickCheckoutUpiProof() {
    if (Platform.OS === 'web') {
      void uploadCheckoutUpiProof('library');
      return;
    }
    Alert.alert('Payment screenshot', 'Capture the UPI success screen after you pay.', [
      { text: 'Take photo', onPress: () => void uploadCheckoutUpiProof('camera') },
      {
        text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery',
        onPress: () => void uploadCheckoutUpiProof('library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  useEffect(() => {
    const allowed = new Set<CheckoutPaymentMethod>();
    if (canPayRazorpay) allowed.add('razorpay');
    if (canPayCashfree) allowed.add('cashfree');
    if (canPayQr) allowed.add('upi');
    if (canPayCash) allowed.add('cash');
    if (allowed.has(paymentMethod)) return;
    if (canPayRazorpay) setPaymentMethod('razorpay');
    else if (canPayCashfree) setPaymentMethod('cashfree');
    else if (canPayQr) setPaymentMethod('upi');
    else if (canPayCash) setPaymentMethod('cash');
  }, [canPayCash, canPayCashfree, canPayQr, canPayRazorpay, paymentMethod]);

  const loadAddresses = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.listAddresses({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setAddresses(res.data);
      const def = res.data.find((a) => a.is_default) || res.data[0];
      if (def?.id) setSelectedAddressId((current) => current || def.id || null);
    } catch {
      setAddresses([]);
    }
  }, [businessCode, tenantSlug]);

  async function loadLoyalty() {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.getLoyalty({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      const enabled = Boolean(res.data.enabled || bootstrap?.loyalty?.enabled);
      setLoyaltyEnabled(enabled);
      setLoyaltyBalance(res.data.points_balance ?? 0);
      setPointsPerCurrency(res.data.program?.points_per_currency_unit ?? 10);
      setMaxRedeemPercent(res.data.program?.max_redeem_percent ?? 50);
      setMinRedeemPoints(res.data.program?.min_redeem_points ?? 10);
      setEarnPointsPer100(
        res.data.program?.earn_points_per_100 ?? bootstrap?.loyalty?.earn_points_per_100 ?? 1,
      );
      if (!enabled) setPointsToRedeem(0);
    } catch {
      setLoyaltyEnabled(Boolean(bootstrap?.loyalty?.enabled));
      setLoyaltyBalance(0);
      setPointsToRedeem(0);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadAddresses();
      void loadLoyalty();
    }, [loadAddresses]),
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Coupon sheet is drag-resizable between two snap points so long offer lists
  // can be opened to nearly full screen instead of a fixed short panel.
  const sheetBounds = useMemo(() => {
    const ceiling = windowHeight - insets.top - spacing.xl - keyboardHeight;
    const max = Math.max(280, Math.round(ceiling));
    const collapsed = Math.min(max, Math.max(300, Math.round(windowHeight * 0.5)));
    return { collapsed, max };
  }, [windowHeight, insets.top, keyboardHeight]);

  const sheetHeight = useRef(new Animated.Value(sheetBounds.collapsed)).current;
  const sheetHeightRef = useRef(sheetBounds.collapsed);
  const sheetExpandedRef = useRef(false);
  const dragStartRef = useRef(sheetBounds.collapsed);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  useEffect(() => {
    const id = sheetHeight.addListener(({ value }) => {
      sheetHeightRef.current = value;
    });
    return () => sheetHeight.removeListener(id);
  }, [sheetHeight]);

  const snapSheet = useCallback(
    (to: 'collapsed' | 'expanded') => {
      sheetExpandedRef.current = to === 'expanded';
      setSheetExpanded(to === 'expanded');
      Animated.spring(sheetHeight, {
        toValue: to === 'expanded' ? sheetBounds.max : sheetBounds.collapsed,
        useNativeDriver: false,
        bounciness: 0,
        speed: 14,
      }).start();
    },
    [sheetBounds.collapsed, sheetBounds.max, sheetHeight],
  );

  // Always open at the collapsed snap point.
  useEffect(() => {
    if (!couponSheetOpen) return;
    sheetExpandedRef.current = false;
    setSheetExpanded(false);
    sheetHeight.setValue(sheetBounds.collapsed);
    // Opening should not re-run when bounds shift mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponSheetOpen]);

  // Keep the sheet on its snap point when the keyboard or orientation changes.
  useEffect(() => {
    if (!couponSheetOpen) return;
    snapSheet(sheetExpandedRef.current ? 'expanded' : 'collapsed');
  }, [couponSheetOpen, snapSheet]);

  const sheetPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          dragStartRef.current = sheetHeightRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(sheetBounds.max, dragStartRef.current - gesture.dy);
          sheetHeight.setValue(Math.max(120, next));
        },
        onPanResponderRelease: (_event, gesture) => {
          // Treat a press without travel as a toggle of the grabber.
          if (Math.abs(gesture.dy) < 4) {
            snapSheet(sheetExpandedRef.current ? 'collapsed' : 'expanded');
            return;
          }
          const flickDown = gesture.vy > 0.75;
          const flickUp = gesture.vy < -0.75;
          const current = sheetHeightRef.current;
          if (!flickUp && (flickDown || current < sheetBounds.collapsed * 0.6)) {
            setCouponSheetOpen(false);
            return;
          }
          const midpoint = (sheetBounds.collapsed + sheetBounds.max) / 2;
          snapSheet(flickUp || current > midpoint ? 'expanded' : 'collapsed');
        },
      }),
    [sheetBounds.collapsed, sheetBounds.max, sheetHeight, snapSheet],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (fulfillment !== 'delivery' || !selectedAddress || !tenantSlug || !businessCode) {
        setInstantDelivery(null);
        setStandardDelivery(null);
        setDeliveryOptionsLoading(false);
        return;
      }
      setDeliveryOptionsLoading(true);
      setInstantDelivery(null);
      setStandardDelivery(null);

      const zoneResponse = await mobileClient.mobile
        .matchDeliveryZone({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          city: selectedAddress.city || '',
          postal_code: selectedAddress.postal_code || '',
        })
        .catch(() => null);
      if (cancelled) return;
      const zone =
        zoneResponse?.data.matched && zoneResponse.data.zone ? zoneResponse.data.zone : null;
      const shopInstantEnabled = Boolean(
        (zone as { shop_instant_delivery_enabled?: boolean } | null)?.shop_instant_delivery_enabled,
      );
      const standard = zone
        ? {
            fee: Number(zone.fee || 0),
            zoneName: zone.name,
            sameDay: Boolean(zone.same_day),
            instantEnabled: Boolean(zone.instant_delivery_enabled) && shopInstantEnabled,
            shopInstantEnabled,
            isCatchAll: Boolean((zone as { is_catch_all?: boolean }).is_catch_all),
            deliveryPromise: (zone as { delivery_promise?: StandardDeliveryOption['deliveryPromise'] })
              .delivery_promise,
            minOrderTotal: Number(zone.min_order_total || 0),
          }
        : null;

      let instant: InstantDeliveryOption | null = null;
      if (
        standard?.instantEnabled &&
        selectedAddress.latitude != null &&
        selectedAddress.longitude != null
      ) {
        const response = await mobileClient.mobile
          .quoteShopDelivery({
            tenant_slug: tenantSlug,
            business_code: businessCode,
            latitude: selectedAddress.latitude,
            longitude: selectedAddress.longitude,
            address: deliveryAddressLine(selectedAddress),
            city: selectedAddress.city || '',
            state: selectedAddress.state || '',
            postal_code: selectedAddress.postal_code || '',
            phone: selectedAddress.phone_number || '',
            delivery_phone: selectedAddress.phone_number || '',
            subtotal: merchandiseAfterCoupon,
            lines: lines.map((line) => ({
              product_id: line.product.id,
              quantity: line.quantity,
            })),
          })
          .catch(() => null);
        if (response?.data.available) {
          instant = {
            fee: Number(response.data.customer_fee || 0),
            providerLabel: response.data.provider_label || 'Instant delivery',
            quoteId: response.data.quote_id || '',
            etaMinutes: response.data.eta_minutes ?? null,
          };
        }
      }
      if (cancelled) return;
      setInstantDelivery(instant);
      setStandardDelivery(standard);
      setDeliveryMethod((current) => {
        if (current === 'instant' && instant) return current;
        if (current === 'standard' && standard) return current;
        return instant ? 'instant' : 'standard';
      });
      setDeliveryOptionsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [businessCode, fulfillment, lines, merchandiseAfterCoupon, selectedAddress, tenantSlug]);

  const applyCoupon = useCallback(
    async (code: string, closeSheet = false) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized || !tenantSlug || !businessCode || !lines.length) return;
      setCouponBusy(true);
      setCouponError(null);
      try {
        const response = await mobileClient.mobile.validateShopCoupon({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          code: normalized,
          fulfillment_mode: fulfillment,
          lines: lines.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
          })),
        });
        setAppliedAutomation(null);
        setAppliedCoupon({
          code: response.data.code,
          name: response.data.name,
          discount: Number(response.data.discount_amount || 0),
        });
        setCouponDraft(response.data.code);
        if (closeSheet) setCouponSheetOpen(false);
      } catch (err) {
        setAppliedCoupon(null);
        setCouponError(err instanceof Error ? err.message : 'This coupon could not be applied.');
      } finally {
        setCouponBusy(false);
      }
    },
    [businessCode, fulfillment, lines, tenantSlug],
  );

  const applyAutomation = useCallback(
    (offer: ShopCouponOffer, closeSheet = false) => {
      const dtype = String(offer.discount_type || 'percent') === 'amount' ? 'amount' : 'percent';
      const value = String(offer.discount_value || '0');
      const savings = Number(offer.discount_amount || 0);
      if (!(savings > 0) && !(Number(value) > 0)) return;
      setAppliedCoupon(null);
      setCouponDraft('');
      setCouponError(null);
      setAppliedAutomation({
        label: String(offer.label || offer.name || 'Special offer'),
        discount_type: dtype,
        discount_value: value,
        discount:
          savings > 0
            ? savings
            : dtype === 'percent'
              ? (total * Number(value)) / 100
              : Math.min(total, Number(value)),
      });
      if (closeSheet) setCouponSheetOpen(false);
    },
    [total],
  );

  const loadCouponOffers = useCallback(async () => {
    if (!tenantSlug || !businessCode || !lines.length) {
      setCouponOffers([]);
      return;
    }
    const payload = {
      tenant_slug: tenantSlug,
      business_code: businessCode,
      fulfillment_mode: fulfillment,
      lines: lines.map((line) => ({
        product_id: line.product.id,
        quantity: line.quantity,
        unit_price: line.product.price,
      })),
    };
    try {
      const response = await mobileClient.mobile.listAvailableShopCoupons(payload);
      const rows = Array.isArray(response.data) ? response.data : [];
      if (rows.length) {
        setCouponOffers(rows);
        return;
      }
    } catch {
      // Fall through to GET so a POST 404 still shows shop coupons.
    }
    try {
      const response = await mobileClient.mobile.getAvailableShopCoupons({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        fulfillment_mode: fulfillment,
      });
      setCouponOffers(Array.isArray(response.data) ? response.data : []);
    } catch {
      setCouponOffers([]);
    }
  }, [businessCode, fulfillment, lines, tenantSlug]);

  const appliedCodeRef = useRef<string | null>(null);
  appliedCodeRef.current = appliedCoupon?.code ?? null;

  useEffect(() => {
    if (!appliedCodeRef.current) return;
    void applyCoupon(appliedCodeRef.current);
  }, [applyCoupon, itemCount, total, fulfillment]);

  useEffect(() => {
    if (!appliedAutomation) return;
    const match = automationOffers.find(
      (offer) =>
        String(offer.discount_type || 'percent') === appliedAutomation.discount_type &&
        String(Number(offer.discount_value) || 0) === String(Number(appliedAutomation.discount_value) || 0),
    );
    if (!match) {
      setAppliedAutomation(null);
      return;
    }
    const savings = Number(match.discount_amount || 0);
    if (savings > 0 && savings !== appliedAutomation.discount) {
      setAppliedAutomation((current) =>
        current ? { ...current, discount: savings, label: String(match.label || match.name || current.label) } : current,
      );
    }
  }, [appliedAutomation, automationOffers]);

  useEffect(() => {
    void loadCouponOffers();
  }, [loadCouponOffers, itemCount, total, fulfillment]);

  const today = formatShopDateIso(new Date());
  const pickupMinTime = preferredDate === today ? nextAvailablePickupTime() ?? undefined : undefined;

  useEffect(() => {
    if (fulfillment !== 'pickup') return;
    if (preferredDate !== today) return;
    const next = nextAvailablePickupTime();
    if (!next) {
      setPreferredDate(tomorrowIso());
      return;
    }
    if (!preferredTime || preferredTime < next) setPreferredTime(next);
  }, [fulfillment, preferredDate, preferredTime, today]);

  function validateCheckoutBasics(): boolean {
    if (!lines.length) return false;
    if (fulfillment === 'pickup' && (!preferredDate || !preferredTime || !isPickupTimeAfterNow(preferredDate, preferredTime))) {
      setError('Choose a pickup time after now.');
      return false;
    }
    if (fulfillment === 'delivery' && !selectedAddress) {
      setError('Add or select a delivery address.');
      return false;
    }
    if (fulfillment === 'delivery' && deliveryOptionsLoading) {
      setError('Please wait while we check delivery options.');
      return false;
    }
    if (fulfillment === 'delivery' && !selectedDelivery) {
      setError('The selected delivery option is not available for this address.');
      return false;
    }
    if (fulfillment === 'delivery' && !String(selectedAddress?.phone_number || '').trim()) {
      setError('Add a phone number to this delivery address before ordering.');
      return false;
    }
    if (!canPayCash && !canPayOnline) {
      setError('This shop has not set up online payments yet. Contact the shop to order.');
      return false;
    }
    if (paymentMethod === 'cash' && !canPayCash) {
      setError('Cash on delivery is not available for this shop.');
      return false;
    }
    if (paymentMethod === 'upi' && !canPayQr) {
      setError('Shop has not configured UPI payments yet.');
      return false;
    }
    if (paymentMethod === 'razorpay' && !canPayRazorpay) {
      setError('Online payment is not available for this shop.');
      return false;
    }
    if (paymentMethod === 'cashfree' && !canPayCashfree) {
      setError('Cashfree payment is not available for this shop.');
      return false;
    }
    setError(null);
    return true;
  }

  function onPlaceOrderPress() {
    if (!validateCheckoutBasics()) return;
    if (paymentMethod === 'upi') {
      setUpiPaySheetOpen(true);
      return;
    }
    void placeOrder();
  }

  async function placeOrder() {
    if (!validateCheckoutBasics()) return;
    if (paymentMethod === 'upi' && !upiProofUrl.trim() && !upiUtr.trim()) {
      setError('Upload a payment screenshot or enter a UPI / UTR reference.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const orderRequest = mobileClient.mobile.createShopOrder({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        fulfillment_mode: fulfillment,
        preferred_date: fulfillment === 'pickup' ? preferredDate : undefined,
        preferred_time: fulfillment === 'pickup' ? preferredTime : undefined,
        fulfillment_note: fulfillmentNote.trim(),
        delivery_address: fulfillment === 'delivery' ? deliveryAddressLine(selectedAddress) : '',
        delivery_address_line2: fulfillment === 'delivery' ? selectedAddress?.line2 || '' : '',
        delivery_city: fulfillment === 'delivery' ? selectedAddress?.city || '' : '',
        delivery_state: fulfillment === 'delivery' ? selectedAddress?.state || '' : '',
        delivery_postal_code: fulfillment === 'delivery' ? selectedAddress?.postal_code || '' : '',
        delivery_phone: fulfillment === 'delivery' ? selectedAddress?.phone_number || '' : '',
        delivery_latitude: fulfillment === 'delivery' ? selectedAddress?.latitude : undefined,
        delivery_longitude: fulfillment === 'delivery' ? selectedAddress?.longitude : undefined,
        delivery_method: fulfillment === 'delivery' ? deliveryMethod : undefined,
        delivery_quote_id: fulfillment === 'delivery' ? deliveryQuoteId : undefined,
        displayed_delivery_fee: fulfillment === 'delivery' ? deliveryFee : undefined,
        payment_method: paymentMethod,
        coupon_code: appliedCoupon?.code || undefined,
        bill_discount_type: appliedAutomation?.discount_type || undefined,
        bill_discount_value: appliedAutomation ? Number(appliedAutomation.discount_value) || 0 : undefined,
        points_to_redeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
        whatsapp_opt_in: whatsappUpdatesAvailable && whatsappOptIn ? true : undefined,
        upi_utr: paymentMethod === 'upi' ? upiUtr.trim() || undefined : undefined,
        payment_proof_url: paymentMethod === 'upi' ? upiProofUrl || undefined : undefined,
        lines: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(PLACE_ORDER_BUSY_MESSAGE)), PLACE_ORDER_TIMEOUT_MS);
      });
      const response = await Promise.race([orderRequest, timeout]);
      const orderId = response.data.id;
      setUpiPaySheetOpen(false);
      clear();
      if (paymentMethod === 'razorpay' || paymentMethod === 'cashfree') {
        setPendingGatewayOrderId(orderId);
        try {
          if (paymentMethod === 'razorpay') {
            const checkout = await startRazorpayCheckout({
              orderId,
              tenantSlug,
              businessCode,
            });
            setGatewayModal({ provider: 'razorpay', checkout });
          } else {
            const checkout = await startCashfreeCheckout({
              orderId,
              tenantSlug,
              businessCode,
            });
            setGatewayModal({ provider: 'cashfree', checkout });
          }
          return;
        } catch (gatewayErr) {
          toast.push(
            gatewayErr instanceof Error
              ? gatewayErr.message
              : 'Order placed. Complete payment from order details.',
            'error',
          );
          navigation.replace('ShopOrderDetail', { orderId, placed: true });
          return;
        }
      }
      toast.push('Order placed.', 'success');
      navigation.replace('ShopOrderDetail', { orderId, placed: true });
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 504 || err.status === 502 || err.status === 503)) {
        setError(PLACE_ORDER_BUSY_MESSAGE);
      } else if (err instanceof Error && /timeout|gateway|504/i.test(err.message)) {
        setError(PLACE_ORDER_BUSY_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : 'Checkout failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function finishGatewaySuccess(
    result:
      | { provider: 'razorpay'; payload: Parameters<typeof verifyRazorpayCheckout>[0]['result'] }
      | { provider: 'cashfree'; payload: Parameters<typeof verifyCashfreeCheckout>[0]['result'] },
  ) {
    const orderId = pendingGatewayOrderId;
    setGatewayModal(null);
    if (!orderId) return;
    setSubmitting(true);
    try {
      if (result.provider === 'razorpay') {
        await verifyRazorpayCheckout({
          orderId,
          tenantSlug,
          businessCode,
          result: result.payload,
        });
      } else {
        await verifyCashfreeCheckout({
          orderId,
          tenantSlug,
          businessCode,
          result: result.payload,
        });
      }
      toast.push('Payment successful.', 'success');
      navigation.replace('ShopOrderDetail', { orderId, placed: true });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Payment verification failed.', 'error');
      navigation.replace('ShopOrderDetail', { orderId, placed: true });
    } finally {
      setPendingGatewayOrderId(null);
      setSubmitting(false);
    }
  }

  function finishGatewayCancel(message?: string) {
    const orderId = pendingGatewayOrderId;
    setGatewayModal(null);
    setPendingGatewayOrderId(null);
    if (!orderId) return;
    if (message) toast.push(message, 'error');
    navigation.replace('ShopOrderDetail', { orderId, placed: true });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={itemCount ? `Cart (${itemCount})` : 'Cart'}
        onBack={() => navigation.goBack()}
      />

      {!lines.length ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="shopping-cart"
            title="Your cart is empty"
            description="Add products from the shop and they will show up here."
          />
          <Button
            label="Continue shopping"
            primaryColor={primary}
            onPress={() => navigation.goBack()}
            style={{ alignSelf: 'center', marginTop: spacing.lg }}
          />
        </View>
      ) : (
        <>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              padding: spacing.lg,
              paddingBottom: spacing.xxxl + (Platform.OS === 'ios' ? keyboardHeight : 0),
            }}
          >
            <Text style={styles.subtotalTop}>
              Items ({itemCount} {itemCount === 1 ? 'item' : 'items'}):{' '}
              <Text style={{ color: primary }}>
                {formatShopMoney(totals.merchandiseGross, currency)}
              </Text>
            </Text>

            <GroupedList style={styles.itemGroup}>
            {lines.map((line) => {
              const imageUri = resolveMediaUrl(line.product.image_url);
              const lineTotal = shopLinePayable(line.product, line.quantity);
              return (
                <View key={line.product.id} style={styles.itemCard}>
                  <Pressable onPress={() => navigation.navigate('ShopProductDetail', { productId: line.product.id })}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Feather name="package" size={22} color={colors.mutedForeground} />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.itemBody}>
                    <Text style={styles.name} numberOfLines={2}>
                      {line.product.name}
                    </Text>
                    <Text style={styles.unitPrice}>{formatShopMoney(line.product.price, line.product.currency)}</Text>
                    <View style={styles.itemActions}>
                      <QtyStepper
                        size="sm"
                        value={line.quantity}
                        onChange={(next) => setQuantity(line.product.id, next)}
                        max={line.product.stock_on_hand != null ? Number(line.product.stock_on_hand) : undefined}
                        primaryColor={primary}
                      />
                      <Pressable onPress={() => setQuantity(line.product.id, 0)} hitSlop={8}>
                        <Text style={styles.delete}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>{formatShopMoney(lineTotal, line.product.currency)}</Text>
                </View>
              );
            })}
            </GroupedList>

            {automationOffers.length > 0 ? (
              <View style={styles.specialOffers}>
                <Text style={styles.specialOffersTitle}>Special for you</Text>
                {automationOffers.map((offer) => {
                  const active =
                    appliedAutomation != null &&
                    appliedAutomation.discount_type ===
                      (String(offer.discount_type || 'percent') === 'amount' ? 'amount' : 'percent') &&
                    String(Number(appliedAutomation.discount_value) || 0) ===
                      String(Number(offer.discount_value) || 0);
                  const savings = Number(offer.discount_amount || 0);
                  return (
                    <Pressable
                      key={offerKey(offer)}
                      style={[styles.specialOfferCard, active ? { borderColor: primary } : null]}
                      onPress={() => {
                        if (active) {
                          setAppliedAutomation(null);
                          return;
                        }
                        applyAutomation(offer);
                      }}
                    >
                      <View style={[styles.specialOfferBadge, { backgroundColor: `${primary}14` }]}>
                        <Text style={[styles.specialOfferBadgeText, { color: primary }]}>
                          {couponHeadline(offer, currency)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.specialOfferLabel} numberOfLines={2}>
                          {offer.label || offer.name || 'Special offer'}
                        </Text>
                        <Text style={styles.meta}>
                          {active
                            ? `Applied · save ${formatShopMoney(automationDiscount, currency)}`
                            : savings > 0
                              ? `Tap to save ${formatShopMoney(savings, currency)}`
                              : 'Tap to apply'}
                        </Text>
                      </View>
                      <Feather
                        name={active ? 'check-circle' : 'chevron-right'}
                        size={18}
                        color={active ? colors.success : colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <Pressable
              style={[styles.couponEntry, automationOffers.length ? { marginTop: spacing.sm } : null]}
              onPress={() => setCouponSheetOpen(true)}
            >
              <View style={[styles.couponEntryIcon, { backgroundColor: `${primary}14` }]}>
                <Feather name="tag" size={16} color={primary} />
              </View>
              <View style={styles.couponEntryBody}>
                {appliedCoupon ? (
                  <>
                    <Text style={styles.couponEntryTitle}>{appliedCoupon.code} applied</Text>
                    <Text style={styles.couponOk}>
                      You save {formatShopMoney(couponDiscount, currency)}
                      {appliedCoupon.name ? ` · ${appliedCoupon.name}` : ''}
                    </Text>
                  </>
                ) : appliedAutomation ? (
                  <>
                    <Text style={styles.couponEntryTitle}>{appliedAutomation.label} applied</Text>
                    <Text style={styles.couponOk}>
                      You save {formatShopMoney(automationDiscount, currency)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.couponEntryTitle}>Apply coupon or offer</Text>
                    <Text style={styles.meta}>
                      {couponOffers.length
                        ? `${couponOffers.length} ${couponOffers.length === 1 ? 'offer' : 'offers'} available`
                        : 'View offers and apply a code'}
                    </Text>
                  </>
                )}
              </View>
              {appliedCoupon ? (
                <Pressable
                  onPress={() => {
                    setAppliedCoupon(null);
                    setCouponDraft('');
                    setCouponError(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.delete}>Remove</Text>
                </Pressable>
              ) : (
                <Text style={[styles.viewCoupons, { color: primary }]}>View coupons</Text>
              )}
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>

            <Text style={styles.section}>How do you want it?</Text>
            <View style={styles.modeRow}>
              {(['pickup', 'delivery'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={[styles.modeBtn, fulfillment === mode && { borderColor: primary, backgroundColor: `${primary}14` }]}
                  onPress={() => setFulfillment(mode)}
                >
                  <Feather
                    name={mode === 'pickup' ? 'map-pin' : 'truck'}
                    size={16}
                    color={fulfillment === mode ? primary : colors.mutedForeground}
                  />
                  <Text style={styles.modeText}>{mode === 'pickup' ? 'Store pickup' : 'Home delivery'}</Text>
                </Pressable>
              ))}
            </View>

            {fulfillment === 'pickup' ? (
              <View style={styles.panel}>
                <View style={styles.panelHead}>
                  <Feather name="home" size={16} color={primary} />
                  <Text style={styles.panelTitle}>Pickup from shop</Text>
                </View>
                {pickupAddress ? <Text style={styles.meta}>{pickupAddress}</Text> : null}
                <Text style={styles.fieldLabel}>Preferred pickup date</Text>
                <CalendarPicker value={preferredDate} onChange={setPreferredDate} primaryColor={primary} />
                <TimePicker
                  label="Preferred pickup time"
                  value={preferredTime}
                  onChange={setPreferredTime}
                  minTime={pickupMinTime}
                  primaryColor={primary}
                  helperText={
                    preferredDate === today
                      ? 'Today’s remaining times only — pick a time after now.'
                      : 'Choose when you will collect the order.'
                  }
                />
                <TextInput
                  style={styles.noteInput}
                  placeholder="Note for the shop (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  value={fulfillmentNote}
                  onChangeText={setFulfillmentNote}
                />
              </View>
            ) : (
              <View style={styles.panel}>
                <View style={styles.panelHead}>
                  <Feather name="truck" size={16} color={primary} />
                  <Text style={styles.panelTitle}>Deliver to</Text>
                </View>
                {selectedAddress ? (
                  <View style={[styles.addressCard, { borderColor: primary, backgroundColor: `${primary}10` }]}>
                    <View style={styles.addressCardHead}>
                      <Feather
                        name={addressTypeMeta(selectedAddress.address_type).icon}
                        size={14}
                        color={primary}
                      />
                      <Text style={[styles.name, styles.addressCardTitle]}>
                        {addressTypeMeta(selectedAddress.address_type).label}
                        {selectedAddress.is_default ? ' · Default' : ''}
                      </Text>
                      {addresses.length > 1 ? (
                        <Pressable onPress={openAddressPicker} hitSlop={8}>
                          <Text style={[styles.addressAction, { color: primary }]}>Change</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text style={styles.meta}>{addressSingleLine(selectedAddress)}</Text>
                    {selectedAddress.phone_number ? (
                      <Text style={styles.meta}>Phone: {selectedAddress.phone_number}</Text>
                    ) : (
                      <Text style={styles.error}>Add a phone number to this address.</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.meta}>Add an address so we can check delivery for your area.</Text>
                )}
                <Pressable onPress={addresses.length ? openAddressPicker : openAddressForm}>
                  <Text style={{ color: primary, fontWeight: '700' }}>
                    {addresses.length ? 'Add or manage addresses' : 'Add a delivery address'}
                  </Text>
                </Pressable>
                {selectedAddress ? (
                  <View style={styles.deliveryOptions}>
                    <View style={styles.deliveryOptionsHead}>
                      <Text style={styles.fieldLabel}>Delivery speed</Text>
                      {deliveryOptionsLoading ? <ActivityIndicator size="small" color={primary} /> : null}
                    </View>

                    {standardDelivery?.shopInstantEnabled ? (
                    <Pressable
                      disabled={!instantDelivery || deliveryOptionsLoading}
                      onPress={() => setDeliveryMethod('instant')}
                      style={[
                        styles.deliveryOption,
                        deliveryMethod === 'instant' && instantDelivery
                          ? { borderColor: primary, backgroundColor: `${primary}0D` }
                          : null,
                        !instantDelivery ? styles.deliveryOptionDisabled : null,
                      ]}
                    >
                      <View style={[styles.deliveryOptionIcon, { backgroundColor: `${primary}14` }]}>
                        <Feather name="zap" size={18} color={primary} />
                      </View>
                      <View style={styles.deliveryOptionBody}>
                        <View style={styles.deliveryOptionTitleRow}>
                          <Text style={styles.deliveryOptionTitle}>Deliver now</Text>
                          {instantDelivery?.etaMinutes ? (
                            <Text style={[styles.deliveryBadge, { color: primary }]}>
                              ~{instantDelivery.etaMinutes} min
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.meta}>
                          {instantDelivery
                            ? `${instantDelivery.providerLabel} · ${
                                instantDelivery.fee > 0
                                  ? formatShopMoney(instantDelivery.fee, currency)
                                  : 'Free delivery'
                              }`
                            : !standardDelivery
                              ? 'This address is outside the shop’s delivery zones.'
                              : !standardDelivery.instantEnabled
                                ? `Deliver now is not enabled for ${standardDelivery.zoneName}.`
                                : selectedAddress.latitude == null ||
                                    selectedAddress.longitude == null
                                  ? 'Add a map pin to this address for an instant quote.'
                                  : 'The delivery partner is unavailable right now.'}
                        </Text>
                        {instantDelivery ? (
                          <Text style={styles.deliveryHint}>
                            Rider requested after the shop finishes packing.
                          </Text>
                        ) : null}
                      </View>
                      <Feather
                        name={
                          deliveryMethod === 'instant' && instantDelivery
                            ? 'check-circle'
                            : 'circle'
                        }
                        size={20}
                        color={
                          deliveryMethod === 'instant' && instantDelivery
                            ? primary
                            : colors.mutedForeground
                        }
                      />
                    </Pressable>
                    ) : null}

                    <Pressable
                      disabled={!standardDelivery || deliveryOptionsLoading}
                      onPress={() => setDeliveryMethod('standard')}
                      style={[
                        styles.deliveryOption,
                        deliveryMethod === 'standard' && standardDelivery
                          ? { borderColor: primary, backgroundColor: `${primary}0D` }
                          : null,
                        !standardDelivery ? styles.deliveryOptionDisabled : null,
                      ]}
                    >
                      <View style={[styles.deliveryOptionIcon, { backgroundColor: colors.muted }]}>
                        <Feather name="truck" size={18} color={colors.foreground} />
                      </View>
                      <View style={styles.deliveryOptionBody}>
                        <Text style={styles.deliveryOptionTitle}>Standard delivery</Text>
                        <Text style={styles.meta}>
                          {standardDelivery
                            ? `${
                                standardDelivery.isCatchAll
                                  ? 'We deliver to your area'
                                  : standardDelivery.zoneName
                              } · ${
                                standardDelivery.fee > 0
                                  ? formatShopMoney(standardDelivery.fee, currency)
                                  : 'Free delivery'
                              }`
                            : 'No delivery zone matches this address.'}
                        </Text>
                        {standardDelivery ? (
                          <Text style={styles.deliveryHint}>
                            {standardDelivery.deliveryPromise?.label ||
                              (standardDelivery.sameDay
                                ? 'Same-day delivery is available.'
                                : 'The shop will confirm the delivery schedule.')}
                            {standardDelivery.minOrderTotal > merchandiseAfterCoupon
                              ? ` · Min order ${formatShopMoney(standardDelivery.minOrderTotal, currency)}`
                              : ''}
                          </Text>
                        ) : null}
                      </View>
                      <Feather
                        name={
                          deliveryMethod === 'standard' && standardDelivery
                            ? 'check-circle'
                            : 'circle'
                        }
                        size={20}
                        color={
                          deliveryMethod === 'standard' && standardDelivery
                            ? primary
                            : colors.mutedForeground
                        }
                      />
                    </Pressable>

                    {!deliveryOptionsLoading && !instantDelivery && !standardDelivery ? (
                      <Text style={styles.error}>Delivery is not available for this address.</Text>
                    ) : null}
                  </View>
                ) : null}
                <TextInput
                  style={styles.noteInput}
                  placeholder="Delivery instructions (gate, landmark, phone)"
                  placeholderTextColor={colors.mutedForeground}
                  value={fulfillmentNote}
                  onChangeText={setFulfillmentNote}
                />
              </View>
            )}

            <Text style={styles.section}>Payment</Text>
            <View style={styles.modeRow}>
              {canPayRazorpay ? (
                <Pressable
                  style={[
                    styles.modeBtn,
                    paymentMethod === 'razorpay' && { borderColor: primary, backgroundColor: `${primary}14` },
                  ]}
                  onPress={() => setPaymentMethod('razorpay')}
                >
                  <Feather
                    name="credit-card"
                    size={16}
                    color={paymentMethod === 'razorpay' ? primary : colors.mutedForeground}
                  />
                  <Text style={styles.modeText}>Pay online</Text>
                </Pressable>
              ) : null}
              {canPayCashfree ? (
                <Pressable
                  style={[
                    styles.modeBtn,
                    paymentMethod === 'cashfree' && { borderColor: primary, backgroundColor: `${primary}14` },
                  ]}
                  onPress={() => setPaymentMethod('cashfree')}
                >
                  <Feather
                    name="globe"
                    size={16}
                    color={paymentMethod === 'cashfree' ? primary : colors.mutedForeground}
                  />
                  <Text style={styles.modeText}>Cashfree</Text>
                </Pressable>
              ) : null}
              {canPayQr ? (
                <Pressable
                  style={[
                    styles.modeBtn,
                    paymentMethod === 'upi' && { borderColor: primary, backgroundColor: `${primary}14` },
                  ]}
                  onPress={() => setPaymentMethod('upi')}
                >
                  <Feather name="smartphone" size={16} color={paymentMethod === 'upi' ? primary : colors.mutedForeground} />
                  <Text style={styles.modeText}>Pay by UPI</Text>
                </Pressable>
              ) : null}
              {canPayCash ? (
                <Pressable
                  style={[styles.modeBtn, paymentMethod === 'cash' && { borderColor: primary, backgroundColor: `${primary}14` }]}
                  onPress={() => setPaymentMethod('cash')}
                >
                  <Feather name="dollar-sign" size={16} color={paymentMethod === 'cash' ? primary : colors.mutedForeground} />
                  <Text style={styles.modeText}>{cashPaymentLabel}</Text>
                </Pressable>
              ) : null}
            </View>
            {canPayCash && paymentMethod === 'cash' ? (
              <Text style={styles.meta}>{cashPaymentHint}</Text>
            ) : null}
            {paymentMethod === 'razorpay' || paymentMethod === 'cashfree' ? (
              <Text style={styles.meta}>
                Secure checkout opens after you place the order. Cards, UPI, and netbanking are supported.
              </Text>
            ) : null}
            {paymentMethod === 'upi' && (previewUpiUrl || business?.payment_qr_url) ? (
              <Text style={styles.meta}>
                After you tap Place order, pay {formatShopMoney(grandTotal, currency)}, then add a
                payment screenshot or UPI reference to confirm.
              </Text>
            ) : null}
            {paymentMethod === 'upi' && !previewUpiUrl && !business?.payment_qr_url ? (
              <Text style={styles.meta}>Shop UPI is not configured yet.</Text>
            ) : null}

            {loyaltyEnabled ? (
              <>
                <Text style={styles.section}>Use reward points</Text>
                <View style={styles.panel}>
                  <Text style={styles.meta}>
                    Balance {loyaltyBalance} pts · {pointsPerCurrency} pts = {formatShopMoney(1, currency)}
                  </Text>
                  {maxRedeemablePoints >= minRedeemPoints ? (
                    <>
                      <View style={styles.redeemRow}>
                        <Pressable
                          style={styles.redeemBtn}
                          onPress={() =>
                            setPointsToRedeem((current) => {
                              if (current <= 0) return 0;
                              const next = current - Math.max(1, minRedeemPoints);
                              return next < minRedeemPoints ? 0 : next;
                            })
                          }
                        >
                          <Feather name="minus" size={16} color={colors.foreground} />
                        </Pressable>
                        <Text style={styles.redeemValue}>{pointsToRedeem} pts</Text>
                        <Pressable
                          style={styles.redeemBtn}
                          onPress={() =>
                            setPointsToRedeem((current) => {
                              const stepAmount = Math.max(1, minRedeemPoints);
                              if (current <= 0) return Math.min(maxRedeemablePoints, stepAmount);
                              return Math.min(maxRedeemablePoints, current + stepAmount);
                            })
                          }
                        >
                          <Feather name="plus" size={16} color={colors.foreground} />
                        </Pressable>
                      </View>
                      {pointsToRedeem > 0 ? (
                        <Text style={styles.meta}>
                          Saves {formatShopMoney(loyaltySavingsPayable, currency)}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.meta}>
                      Earn points on paid orders. You need at least {minRedeemPoints} pts to redeem.
                    </Text>
                  )}
                </View>
              </>
            ) : null}

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Bill summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.meta}>Items</Text>
                <Text style={styles.meta}>{formatShopMoney(totals.merchandiseGross, currency)}</Text>
              </View>
              {automationDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>{appliedAutomation?.label || 'Bill discount'}</Text>
                  <Text style={[styles.meta, styles.discountValue]}>
                    −{formatShopMoney(automationDiscount, currency)}
                  </Text>
                </View>
              ) : null}
              {couponDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>
                    Coupon{appliedCoupon?.code ? ` ${appliedCoupon.code}` : ''}
                  </Text>
                  <Text style={[styles.meta, styles.discountValue]}>
                    −{formatShopMoney(couponDiscount, currency)}
                  </Text>
                </View>
              ) : null}
              {totals.loyaltyDiscountAmount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>
                    Reward points{pointsToRedeem > 0 ? ` (${pointsToRedeem} pts)` : ''}
                  </Text>
                  <Text style={[styles.meta, styles.discountValue]}>
                    −{formatShopMoney(loyaltySavingsPayable, currency)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.meta}>Taxable value</Text>
                <Text style={styles.meta}>{formatShopMoney(totals.taxableSubtotal, currency)}</Text>
              </View>
              {fulfillment === 'delivery' ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>
                    {deliveryMethod === 'instant' ? 'Delivery (now)' : 'Delivery'}
                  </Text>
                  <Text style={styles.meta}>
                    {deliveryFeeAmount > 0 ? formatShopMoney(deliveryFeeAmount, currency) : 'Free'}
                  </Text>
                </View>
              ) : (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>Pickup</Text>
                  <Text style={styles.meta}>
                    {formatShopDateLabel(preferredDate)} · {formatShopTimeLabel(preferredTime)}
                  </Text>
                </View>
              )}
              {totals.taxTotal > 0 ? (
                billIsInterstate ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.meta}>IGST</Text>
                    <Text style={styles.meta}>{formatShopMoney(gstSplit.igst || totals.taxTotal, currency)}</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.meta}>CGST</Text>
                      <Text style={styles.meta}>{formatShopMoney(gstSplit.cgst, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.meta}>SGST</Text>
                      <Text style={styles.meta}>{formatShopMoney(gstSplit.sgst, currency)}</Text>
                    </View>
                  </>
                )
              ) : (
                <View style={styles.summaryRow}>
                  <Text style={styles.meta}>GST</Text>
                  <Text style={styles.meta}>{formatShopMoney(totals.taxTotal, currency)}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Payable</Text>
                <Text style={[styles.totalLabel, { color: primary }]}>
                  {formatShopMoney(grandTotal, currency)}
                </Text>
              </View>
              {orderEarnPoints > 0 ? (
                <Text style={styles.earnHint}>
                  You'll earn {orderEarnPoints} pts when this order is paid.
                </Text>
              ) : null}
            </View>
            {whatsappUpdatesAvailable ? (
              <View style={styles.whatsappRow}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.whatsappTitle}>WhatsApp updates</Text>
                  <Text style={styles.barHint}>Get order status updates on WhatsApp</Text>
                </View>
                <Switch value={whatsappOptIn} onValueChange={setWhatsappOptIn} trackColor={{ true: primary }} />
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View
            style={[
              styles.checkoutBar,
              {
                paddingBottom: keyboardHeight > 0 ? spacing.sm : Math.max(insets.bottom, spacing.md),
                marginBottom: keyboardHeight,
              },
            ]}
          >
            <View>
              <Text style={styles.barHint}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
              <Text style={[styles.barTotal, { color: primary }]}>{formatShopMoney(grandTotal, currency)}</Text>
              {orderEarnPoints > 0 ? (
                <Text style={styles.barEarn}>Earn {orderEarnPoints} pts</Text>
              ) : null}
            </View>
            <Button
              label={submitting ? 'Placing…' : 'Place order'}
              primaryColor={primary}
              loading={submitting}
              disabled={!lines.length || submitting}
              onPress={onPlaceOrderPress}
              style={{ minWidth: 160 }}
            />
          </View>
        </>
      )}

      <Modal
        visible={upiPaySheetOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          if (!submitting && !upiProofUploading) setUpiPaySheetOpen(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.upiPayRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => {
              if (!submitting && !upiProofUploading) setUpiPaySheetOpen(false);
            }}
            accessibilityLabel="Close UPI payment"
          />
          <View
            style={[
              styles.upiPaySheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
            ]}
          >
              <View style={styles.grabArea}>
                <View style={styles.handle} />
              </View>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Pay with UPI</Text>
                  <Text style={styles.sheetSubtitle}>
                    Scan, pay, then add a screenshot or UPI reference
                  </Text>
                </View>
                <Pressable
                  style={styles.closeBtn}
                  disabled={submitting || upiProofUploading}
                  onPress={() => setUpiPaySheetOpen(false)}
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={styles.upiPayBody}
              >
                <View style={styles.upiAmountCard}>
                  <Text style={styles.upiAmountLabel}>Amount to pay</Text>
                  <Text style={[styles.upiAmountValue, { color: primary }]}>
                    {formatShopMoney(grandTotal, currency)}
                  </Text>
                  {upiVpa ? <Text style={styles.upiVpa}>{upiVpa}</Text> : null}
                </View>

                <View style={styles.upiQrCard}>
                  {previewUpiUrl ? (
                    <QRCode value={previewUpiUrl} size={168} />
                  ) : business?.payment_qr_url ? (
                    <Image
                      source={{ uri: resolveMediaUrl(business.payment_qr_url) }}
                      style={styles.upiQrImage}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Text style={styles.upiQrHint}>Scan with any UPI app, or open one below</Text>
                  {previewUpiUrl ? (
                    <View style={styles.upiAppRow}>
                      <Pressable
                        style={[styles.upiAppBtn, { borderColor: primary }]}
                        onPress={() => void openUpiInApp(previewUpiUrl, 'gpay')}
                      >
                        <Feather name="smartphone" size={15} color={primary} />
                        <Text style={[styles.upiAppBtnText, { color: primary }]}>Google Pay</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.upiAppBtn, { borderColor: primary }]}
                        onPress={() => void openUpiInApp(previewUpiUrl, 'phonepe')}
                      >
                        <Feather name="smartphone" size={15} color={primary} />
                        <Text style={[styles.upiAppBtnText, { color: primary }]}>PhonePe</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                <Pressable
                  style={[
                    styles.upiUploadZone,
                    upiProofUrl ? styles.upiUploadZoneDone : null,
                    { borderColor: upiProofUrl ? colors.success : primary },
                  ]}
                  disabled={upiProofUploading || submitting}
                  onPress={pickCheckoutUpiProof}
                >
                  {upiProofPreview || upiProofUrl ? (
                    <View style={styles.upiProofRow}>
                      <Image
                        source={{ uri: upiProofPreview || resolveMediaUrl(upiProofUrl) }}
                        style={styles.upiProofThumb}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.upiUploadTitle}>
                          {upiProofUploading ? 'Uploading…' : 'Screenshot attached'}
                        </Text>
                        <Text style={styles.upiUploadHint}>Tap to change</Text>
                      </View>
                      {!upiProofUploading ? (
                        <Feather name="check-circle" size={20} color={colors.success} />
                      ) : (
                        <ActivityIndicator color={primary} />
                      )}
                    </View>
                  ) : (
                    <View style={styles.upiUploadEmpty}>
                      <View style={[styles.upiUploadIcon, { backgroundColor: `${primary}14` }]}>
                        <Feather name="camera" size={20} color={primary} />
                      </View>
                      <Text style={[styles.upiUploadTitle, { color: primary }]}>
                        {upiProofUploading ? 'Uploading…' : 'Upload payment screenshot'}
                      </Text>
                      <Text style={styles.upiUploadHint}>
                        {upiUtr.trim()
                          ? 'Optional if you entered a reference below'
                          : 'Or enter a UPI / UTR reference below'}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <Input
                  label={
                    upiProofUrl
                      ? 'UTR / UPI reference (optional)'
                      : 'UTR / UPI reference'
                  }
                  value={upiUtr}
                  onChangeText={setUpiUtr}
                  placeholder="From your UPI app"
                  autoCapitalize="characters"
                />

                {!upiProofUrl && !upiUtr.trim() ? (
                  <Text style={[styles.meta, { color: colors.destructive }]}>
                    Screenshot or UPI reference is required.
                  </Text>
                ) : null}

                {error ? <Text style={styles.error}>{error}</Text> : null}
              </ScrollView>

              <View style={styles.upiPayFooter}>
                <Button
                  label={submitting ? 'Placing…' : 'Confirm & place order'}
                  primaryColor={primary}
                  loading={submitting}
                  fullWidth
                  disabled={
                    submitting ||
                    upiProofUploading ||
                    (!upiProofUrl && !upiUtr.trim())
                  }
                  onPress={() => void placeOrder()}
                />
              </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={couponSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCouponSheetOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setCouponSheetOpen(false)} accessibilityLabel="Close coupons" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View
              style={[
                styles.couponSheet,
                {
                  height: sheetHeight,
                  paddingBottom: Math.max(insets.bottom, spacing.lg) + (keyboardHeight && Platform.OS !== 'ios' ? keyboardHeight : 0),
                },
              ]}
            >
              <View
                style={styles.grabArea}
                {...sheetPan.panHandlers}
                accessibilityRole="adjustable"
                accessibilityLabel={sheetExpanded ? 'Collapse coupons' : 'Expand coupons'}
                accessibilityHint="Drag up or down to resize the coupon list"
              >
                <View style={styles.handle} />
              </View>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Coupons</Text>
                  <Text style={styles.sheetSubtitle}>
                    {couponOffers.length
                      ? 'Apply an offer or enter a code'
                      : 'Enter a coupon code if you have one'}
                  </Text>
                </View>
                <Pressable
                  style={styles.closeBtn}
                  onPress={() => snapSheet(sheetExpanded ? 'collapsed' : 'expanded')}
                  hitSlop={8}
                  accessibilityLabel={sheetExpanded ? 'Collapse coupon list' : 'Expand coupon list'}
                >
                  <Feather
                    name={sheetExpanded ? 'chevron-down' : 'chevron-up'}
                    size={18}
                    color={colors.foreground}
                  />
                </Pressable>
                <Pressable style={styles.closeBtn} onPress={() => setCouponSheetOpen(false)} hitSlop={8}>
                  <Feather name="x" size={18} color={colors.foreground} />
                </Pressable>
              </View>

              <View style={styles.couponRow}>
                <TextInput
                  style={[styles.noteInput, styles.couponInput]}
                  placeholder="Enter code"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                  value={couponDraft}
                  onChangeText={(value) => {
                    setCouponDraft(value.toUpperCase());
                    setCouponError(null);
                  }}
                  editable={!couponBusy}
                />
                <Pressable
                  style={styles.couponBtn}
                  disabled={couponBusy || !couponDraft.trim()}
                  onPress={() => void applyCoupon(couponDraft, true)}
                >
                  <Text style={[styles.panelTitle, { color: primary }]}>
                    {couponBusy ? 'Checking…' : 'Apply'}
                  </Text>
                </Pressable>
              </View>
              {couponError ? <Text style={styles.error}>{couponError}</Text> : null}

              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={styles.sheetList}
                contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }}
              >
                {couponOffers.length ? (
                  couponOffers.map((offer) => {
                    const automation = isAutomationOffer(offer);
                    const applied = automation
                      ? appliedAutomation != null &&
                        appliedAutomation.discount_type ===
                          (String(offer.discount_type || 'percent') === 'amount' ? 'amount' : 'percent') &&
                        String(Number(appliedAutomation.discount_value) || 0) ===
                          String(Number(offer.discount_value) || 0)
                      : appliedCoupon?.code === offer.code;
                    const savings = Number(offer.discount_amount || 0);
                    const remaining = Number(offer.remaining_to_unlock || 0);
                    return (
                      <View
                        key={offerKey(offer)}
                        style={[
                          styles.offerCard,
                          applied ? { borderColor: primary } : null,
                          !offer.applicable && !applied ? styles.offerCardLocked : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.offerAccent,
                            { backgroundColor: offer.applicable || applied ? primary : colors.mutedForeground },
                          ]}
                        />
                        <View style={styles.offerBody}>
                          <Text style={styles.offerCode}>
                            {automation ? 'SPECIAL' : offer.code}
                          </Text>
                          <Text style={styles.offerHeadline}>{couponHeadline(offer, currency)}</Text>
                          {offer.name ? <Text style={styles.offerName}>{offer.name}</Text> : null}
                          {offer.description ? (
                            <Text style={styles.offerDesc} numberOfLines={2}>
                              {offer.description}
                            </Text>
                          ) : null}
                          {offer.applicable || applied ? (
                            <Text style={styles.couponOk}>
                              {applied ? 'Applied · ' : ''}Save{' '}
                              {formatShopMoney(
                                applied
                                  ? automation
                                    ? automationDiscount
                                    : couponDiscount
                                  : savings,
                                currency,
                              )}
                            </Text>
                          ) : (
                            <Text style={styles.offerLocked}>
                              {remaining > 0
                                ? `Add ${formatShopMoney(remaining, currency)} more to unlock`
                                : offer.reason || 'Not available on this cart'}
                            </Text>
                          )}
                        </View>
                        {applied ? (
                          <Pressable
                            style={styles.offerAction}
                            onPress={() => {
                              if (automation) {
                                setAppliedAutomation(null);
                              } else {
                                setAppliedCoupon(null);
                                setCouponDraft('');
                              }
                              setCouponError(null);
                            }}
                          >
                            <Text style={styles.delete}>Remove</Text>
                          </Pressable>
                        ) : offer.applicable ? (
                          <Pressable
                            style={styles.offerAction}
                            disabled={couponBusy}
                            onPress={() => {
                              if (automation) {
                                applyAutomation(offer, true);
                                return;
                              }
                              if (offer.code) {
                                setCouponDraft(offer.code);
                                void applyCoupon(offer.code, true);
                              }
                            }}
                          >
                            <Text style={[styles.panelTitle, { color: primary }]}>
                              {couponBusy && !automation && couponDraft === offer.code ? '…' : 'APPLY'}
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.offerLockedBtn}>Locked</Text>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.meta}>No offers to show for this cart yet.</Text>
                )}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {gatewayModal?.provider === 'razorpay' ? (
        <GatewayCheckoutModal
          visible
          provider="razorpay"
          checkout={gatewayModal.checkout}
          onSuccess={(payload) => void finishGatewaySuccess({ provider: 'razorpay', payload })}
          onCancel={finishGatewayCancel}
        />
      ) : null}
      {gatewayModal?.provider === 'cashfree' ? (
        <GatewayCheckoutModal
          visible
          provider="cashfree"
          checkout={gatewayModal.checkout}
          onSuccess={(payload) => void finishGatewaySuccess({ provider: 'cashfree', payload })}
          onCancel={finishGatewayCancel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  subtotalTop: { ...typography.title, color: colors.foreground, marginBottom: spacing.lg },
  itemGroup: { marginBottom: spacing.md },
  itemCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: colors.foreground },
  unitPrice: { marginTop: 4, ...typography.body, color: colors.foreground, fontWeight: '600' },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  delete: { ...typography.caption, color: colors.destructive, fontWeight: '600' },
  lineTotal: { ...typography.label, fontWeight: '700', color: colors.foreground },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: '700', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2, ...typography.caption },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeBtn: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  modeText: { color: colors.foreground, fontWeight: '600', textAlign: 'center', fontSize: 13 },
  panel: {
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panelTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  fieldLabel: { marginTop: spacing.sm, ...typography.caption, fontWeight: '700', color: colors.foreground },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  addressCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    gap: 4,
  },
  addressCardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressCardTitle: { flex: 1 },
  addressAction: { ...typography.caption, fontWeight: '700' },
  deliveryOptions: { gap: spacing.sm },
  deliveryOptionsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deliveryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  deliveryOptionDisabled: { opacity: 0.55 },
  deliveryOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryOptionBody: { flex: 1, minWidth: 0, gap: 2 },
  deliveryOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  deliveryOptionTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  deliveryBadge: { ...typography.tiny, fontWeight: '800' },
  deliveryHint: { ...typography.tiny, color: colors.mutedForeground },
  summary: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryTotal: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  discountValue: { color: colors.success, fontWeight: '600' },
  earnHint: { ...typography.caption, color: colors.success, fontWeight: '600' },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  couponInput: { flex: 1, marginTop: 0 },
  couponBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  couponOk: { color: colors.success, ...typography.caption, fontWeight: '600' },
  specialOffers: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  specialOffersTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  specialOfferCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  specialOfferBadge: {
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  specialOfferBadgeText: { ...typography.caption, fontWeight: '800' },
  specialOfferLabel: { ...typography.label, fontWeight: '700', color: colors.foreground },
  couponEntry: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  couponEntryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponEntryBody: { flex: 1, minWidth: 0 },
  couponEntryTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  viewCoupons: { ...typography.caption, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.35)' },
  upiPayRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  upiPaySheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    maxHeight: '92%',
    width: '100%',
  },
  upiPayBody: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  upiAmountCard: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
  },
  upiAmountLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  upiAmountValue: {
    ...typography.heading,
    fontWeight: '800',
  },
  upiVpa: {
    marginTop: 4,
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  upiQrCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upiQrImage: {
    width: 168,
    height: 168,
    borderRadius: radius.md,
  },
  upiQrHint: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  upiAppRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    width: '100%',
  },
  upiAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    backgroundColor: colors.card,
  },
  upiAppBtnText: {
    ...typography.label,
    fontWeight: '700',
  },
  upiUploadZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  upiUploadZoneDone: {
    borderStyle: 'solid',
    backgroundColor: '#ECFDF5',
  },
  upiUploadEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  upiUploadIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiUploadTitle: {
    ...typography.label,
    fontWeight: '700',
    color: colors.foreground,
  },
  upiUploadHint: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  upiProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  upiProofThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  upiPayFooter: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  couponSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    overflow: 'hidden',
  },
  grabArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.foreground },
  sheetSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetList: { flex: 1 },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  offerCardLocked: { opacity: 0.72 },
  offerAccent: { width: 5, alignSelf: 'stretch' },
  offerBody: { flex: 1, minWidth: 0, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: 2 },
  offerCode: {
    alignSelf: 'flex-start',
    ...typography.tiny,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.foreground,
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  offerHeadline: { marginTop: 4, ...typography.label, fontWeight: '800', color: colors.foreground },
  offerName: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  offerDesc: { ...typography.caption, color: colors.mutedForeground },
  offerLocked: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  offerAction: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  offerLockedBtn: { paddingHorizontal: spacing.md, ...typography.tiny, fontWeight: '700', color: colors.mutedForeground },
  redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.sm },
  redeemBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  redeemValue: { fontWeight: '700', color: colors.foreground, minWidth: 72, textAlign: 'center' },
  totalLabel: { ...typography.title, fontSize: 16 },
  error: { color: colors.destructive, marginTop: spacing.sm },
  whatsappRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  whatsappTitle: { ...typography.body, fontWeight: '700', color: colors.foreground },
  checkoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  barHint: { ...typography.caption, color: colors.mutedForeground },
  barTotal: { fontSize: 18, fontWeight: '800' },
  barEarn: { ...typography.caption, color: colors.success, fontWeight: '600', marginTop: 2 },
});
