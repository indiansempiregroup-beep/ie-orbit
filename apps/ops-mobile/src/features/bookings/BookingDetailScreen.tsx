import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import QRCodeSvg from 'react-native-qrcode-svg';
import { CalendarPicker } from '../../components/CalendarPicker';
import { FormScreen } from '../../components/FormScreen';
import { ImageLightbox } from '../../components/ImageLightbox';
import { SelectField } from '../../components/SelectField';
import { TimeSlotGrid } from '../../components/TimeSlotGrid';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { DetailRow } from '../../components/ui/DetailRow';
import { Input } from '../../components/ui/Input';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { ScreenState } from '../../components/ScreenState';
import { uploadMedia } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useBooking } from '../../hooks/useOpsData';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAvailability, useBookingMutations, useEntityMaps, useReassignableStaff } from '../../hooks/useOpsExtended';
import { canWriteBookings } from '../../utils/roles';
import { entityLabel } from '../../utils/entities';
import { formatCustomerAddressLabel } from '../../utils/customerAddress';
import { formatServicePrice } from '../../utils/services';
import { bookingPriceTotal } from '../../utils/bookingDisplay';
import { buildUpiPayUrl } from '../../utils/upiPayUrl';
import { setPaymentProofCaptureListener } from '../../utils/paymentProofCapture';
import { resolveBillingProofUrl } from '../../utils/mediaUrl';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatDateKey, formatDateTime, formatTime, getApiErrorMessage, mapBookingStatus } from '../../utils/format';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../shop/posPayment';
import { DocumentActionsSheet, type ShopDocTarget } from '../shop/DocumentActionsSheet';
import { bumpBookingsListRevision } from '../../utils/bookingsListRefresh';
import type { RootStackParamList } from '../../navigation/types';

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
}

function PaymentQrCode({ value, size }: { value: string; size: number }) {
  const Comp =
    typeof QRCodeSvg === 'function'
      ? QRCodeSvg
      : (QRCodeSvg as { default?: React.ComponentType<{ value: string; size: number }> })?.default;
  if (typeof Comp !== 'function') {
    return <Text style={styles.help}>QR unavailable</Text>;
  }
  return <Comp value={value} size={size} />;
}

function formatLineItemPrice(value?: string | number | null, currency?: string | null): string | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return formatMoney(amount, currency);
}

export function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BookingDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, token, ensureFreshAccess } = useAuth();
  const toast = useToast();
  const client = useOpsClient();
  const { activeBusiness, businessId, tenantId } = useWorkspace();
  const currency = activeBusiness?.currency;
  const { booking, loading, error, reload } = useBooking(
    route.params.bookingId,
    route.params.initialBooking,
  );
  const { services, customers, customerMap, serviceMap, staffMap, staff } = useEntityMaps();
  const mutations = useBookingMutations();
  const [reason, setReason] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState('');
  const [lineStaffDraft, setLineStaffDraft] = useState<Record<string, string>>({});
  const [rescheduleDate, setRescheduleDate] = useState(formatDateKey(new Date()));
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [showCollect, setShowCollect] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [amountReceivedTouched, setAmountReceivedTouched] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [proofPreviewUri, setProofPreviewUri] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState('');
  const [proofMediaId, setProofMediaId] = useState('');
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);

  const canAct = canWriteBookings(user);
  const status = booking?.status ?? 'pending';
  const durationMinutes = booking?.duration_minutes ?? 30;

  const serviceIds = useMemo(
    () => (booking?.line_items?.length ? booking.line_items.map((item) => item.service_id) : undefined),
    [booking?.line_items],
  );

  const { slots, loading: slotsLoading } = useAvailability(
    rescheduleDate,
    booking?.staff_id ?? undefined,
    durationMinutes,
    booking?.service_id ?? undefined,
    serviceIds,
  );

  const billTotal = useMemo(() => {
    if (!booking) return 0;
    const gross = bookingPriceTotal(booking);
    const loyalty = booking.metadata && typeof booking.metadata === 'object'
      ? (booking.metadata as { loyalty?: { discount_amount?: string | number } }).loyalty
      : undefined;
    const reward = Number(loyalty?.discount_amount) || 0;
    return Math.max(0, Math.round((gross - reward + Number.EPSILON) * 100) / 100);
  }, [booking]);

  const paymentMeta = useMemo(() => {
    const meta = booking?.metadata;
    if (!meta || typeof meta !== 'object') return null;
    const payment = (meta as { payment?: Record<string, unknown> }).payment;
    return payment && typeof payment === 'object' ? payment : null;
  }, [booking?.metadata]);
  const recordedPaymentMethod = String(paymentMeta?.method || '').trim();
  const recordedProofUri = resolveBillingProofUrl({
    payment_proof_url:
      paymentMeta?.payment_proof_url != null ? String(paymentMeta.payment_proof_url) : null,
    payment_proof_media_id:
      paymentMeta?.payment_proof_media_id != null ? String(paymentMeta.payment_proof_media_id) : null,
  });
  const recordedAmountPaid =
    paymentMeta?.amount_paid != null && String(paymentMeta.amount_paid) !== ''
      ? Number(paymentMeta.amount_paid)
      : null;

  const payableShown = billTotal;
  const receivedAmount = useMemo(() => {
    if (paymentMethod === 'borrow' && !amountReceivedTouched && amountReceived === '') return 0;
    if (!amountReceivedTouched && amountReceived === '' && paymentMethod !== 'borrow') {
      return payableShown;
    }
    const parsed = Number(amountReceived);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [amountReceived, amountReceivedTouched, paymentMethod, payableShown]);
  const balanceDue = Math.max(0, Math.round((payableShown - receivedAmount + Number.EPSILON) * 100) / 100);

  const upiPayUrl = useMemo(() => {
    if (paymentMethod !== 'upi' || receivedAmount <= 0) return '';
    const vpa = String(activeBusiness?.upi_vpa || '').trim();
    if (!vpa) return '';
    return buildUpiPayUrl({
      vpa,
      payeeName: activeBusiness?.display_name || activeBusiness?.business_name || 'Merchant',
      amount: receivedAmount,
      note: booking?.booking_number ? `Booking ${booking.booking_number}` : 'Booking payment',
      currency: currency || 'INR',
    });
  }, [paymentMethod, receivedAmount, activeBusiness, booking?.booking_number, currency]);
  const paymentQrImageUrl = String(activeBusiness?.payment_qr_url || '').trim();

  function openCollectModal() {
    setCollectError(null);
    setPaymentMethod('cash');
    setAmountReceived('');
    setAmountReceivedTouched(false);
    setProofPreviewUri(null);
    setProofUrl('');
    setProofMediaId('');
    setProofError(null);
    setProofUploading(false);
    setShowCollect(true);
  }

  function clearUpiProof() {
    setProofPreviewUri(null);
    setProofUrl('');
    setProofMediaId('');
    setProofError(null);
  }

  async function uploadUpiProof(asset: ImagePickerAsset) {
    if (!tenantId || !businessId) {
      setProofError('Select a business before uploading payment proof.');
      return;
    }
    setProofPreviewUri(asset.uri);
    setProofUploading(true);
    setProofError(null);
    try {
      const access = (await ensureFreshAccess()) || token;
      if (!access) throw new Error('Sign in again to upload payment proof.');
      const uploaded = await uploadMedia({
        token: access,
        tenantId,
        businessId,
        asset,
        folderType: 'documents',
        tags: ['booking', 'upi_proof'],
        displayName: `Booking UPI proof ${booking?.booking_number || booking?.id || ''}`.trim(),
      });
      const relative = uploaded.public_url || uploaded.private_url || '';
      setProofMediaId(uploaded.id);
      setProofUrl(relative);
    } catch (err) {
      clearUpiProof();
      setProofPreviewUri(asset.uri);
      setProofError(getApiErrorMessage(err, 'Unable to upload payment screenshot.'));
    } finally {
      setProofUploading(false);
    }
  }

  const uploadUpiProofRef = useRef(uploadUpiProof);
  uploadUpiProofRef.current = uploadUpiProof;

  async function pickWebCameraFile(): Promise<ImagePickerAsset | null> {
    if (typeof document === 'undefined') return null;
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
      input.style.display = 'none';
      const cleanup = () => {
        input.removeEventListener('change', onChange);
        input.remove();
      };
      const onChange = () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) {
          resolve(null);
          return;
        }
        const uri = URL.createObjectURL(file);
        resolve({
          uri,
          width: 0,
          height: 0,
          mimeType: file.type || 'image/jpeg',
          fileName: file.name || `upi-proof-${Date.now()}.jpg`,
          fileSize: file.size,
          file,
        } as ImagePickerAsset & { file: File });
      };
      input.addEventListener('change', onChange);
      document.body.appendChild(input);
      input.click();
      window.setTimeout(() => {
        if (!input.parentNode) return;
        cleanup();
        resolve(null);
      }, 60_000);
    });
  }

  useEffect(() => {
    setPaymentProofCaptureListener((asset) => {
      setShowCollect(true);
      if (!asset?.uri) return;
      void uploadUpiProofRef.current({
        uri: asset.uri,
        width: asset.width || 0,
        height: asset.height || 0,
        mimeType: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || `upi-proof-${Date.now()}.jpg`,
      } as ImagePickerAsset);
    });
    return () => setPaymentProofCaptureListener(null);
  }, []);

  async function captureUpiProofFromCamera() {
    setProofError(null);
    try {
      if (Platform.OS === 'web') {
        const asset = await pickWebCameraFile();
        if (!asset) return;
        await uploadUpiProof(asset);
        return;
      }
      // Use in-app expo-camera screen — ImagePicker camera fails while collect Modal is open.
      setShowCollect(false);
      navigation.navigate('PaymentProofCamera');
    } catch (err) {
      setShowCollect(true);
      const message = getApiErrorMessage(err, 'Unable to open the camera.');
      setProofError(message);
      Alert.alert('Camera', message);
    }
  }

  async function pickUpiProofFromGallery() {
    setProofError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setProofError('Allow photo library access to choose a screenshot.');
          Alert.alert('Permission needed', 'Allow photo library access to choose a screenshot.');
          return;
        }
        setShowCollect(false);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });

      if (Platform.OS !== 'web') setShowCollect(true);
      if (result.canceled || !result.assets[0]) return;
      await uploadUpiProof(result.assets[0]);
    } catch (err) {
      if (Platform.OS !== 'web') setShowCollect(true);
      const message = getApiErrorMessage(err, 'Unable to open the photo library.');
      setProofError(message);
      Alert.alert('Gallery', message);
    }
  }

  const serviceName = useMemo(() => {
    if (booking?.service_label?.trim()) return booking.service_label;
    if (booking?.line_items?.length) {
      const names = booking.line_items
        .map((item) => item.service_name || entityLabel(serviceMap, item.service_id, ''))
        .filter(Boolean);
      if (names.length === 1) return names[0];
      if (names.length > 1) return `${names[0]} + ${names.length - 1} more`;
    }
    return entityLabel(serviceMap, booking?.service_id, 'Booking');
  }, [booking?.service_label, booking?.line_items, booking?.service_id, serviceMap]);

  const customerName = useMemo(() => {
    if (booking?.customer_name?.trim()) return booking.customer_name;
    return entityLabel(customerMap, booking?.customer_id);
  }, [booking?.customer_name, booking?.customer_id, customerMap]);

  const customer = useMemo(
    () => (booking?.customer_id ? customers.find((row) => row.id === booking.customer_id) : null),
    [booking?.customer_id, customers],
  );

  const customerPhone = booking?.customer_phone?.trim() || customer?.phone_number?.trim() || '';

  const customerAddress = useMemo(() => {
    if (!customer) return '';
    const label = formatCustomerAddressLabel(customer);
    return label === '—' ? '' : label;
  }, [customer]);

  const staffName = useMemo(() => {
    if (booking?.staff_name?.trim()) return booking.staff_name;
    return entityLabel(staffMap, booking?.staff_id, 'Unassigned');
  }, [booking?.staff_name, booking?.staff_id, staffMap]);

  const servicePriceLabel = useMemo(() => {
    if (booking?.line_items?.length) {
      const total = booking.line_items.reduce((sum, item) => sum + (Number(item.price_snapshot) || 0), 0);
      if (total > 0) {
        return formatLineItemPrice(total, currency) ?? '—';
      }
    }
    const service = services.find((item) => String(item.id) === String(booking?.service_id));
    return formatServicePrice(service) || '—';
  }, [booking?.line_items, booking?.service_id, currency, services]);

  const usePerLineReassign = (booking?.line_items?.length ?? 0) > 1;
  const {
    data: reassignableStaff,
    loading: reassignableLoading,
    error: reassignableError,
  } = useReassignableStaff(booking?.id, staffModalOpen);

  const fallbackStaffOptions = useMemo(
    () =>
      staff.map((member) => ({
        value: String(member.id),
        label: member.display_name || member.full_name || member.email || member.id,
      })),
    [staff],
  );

  const staffOptions = useMemo(() => {
    const auto = { value: '', label: 'Auto-assign' };
    let options: Array<{ value: string; label: string }> = [auto];

    if (reassignableStaff?.mode === 'single') {
      options = [
        auto,
        ...(reassignableStaff.staff_options ?? []).map((member) => ({
          value: String(member.id),
          label: member.display_name,
        })),
      ];
    } else if (reassignableStaff?.mode === 'per_line') {
      // Multi-service API payload, but this booking UI is on the single picker.
      const firstLineId = booking?.line_items?.[0]?.id;
      const lineOpts = firstLineId
        ? reassignableStaff.line_item_options?.[String(firstLineId)]
        : undefined;
      options = lineOpts?.length
        ? [
            auto,
            ...lineOpts.map((member) => ({
              value: String(member.id),
              label: member.display_name,
            })),
          ]
        : [auto, ...fallbackStaffOptions];
    } else if (!reassignableLoading || reassignableError) {
      options = [auto, ...fallbackStaffOptions];
    } else {
      // Still loading — show directory so the current assignee is selectable.
      options = [auto, ...fallbackStaffOptions];
    }

    const currentId = String(staffDraft || booking?.staff_id || '');
    if (currentId && !options.some((option) => option.value === currentId)) {
      options = [
        auto,
        {
          value: currentId,
          label: booking?.staff_name?.trim() || entityLabel(staffMap, currentId, 'Current staff'),
        },
        ...options.filter((option) => option.value !== ''),
      ];
    }
    return options;
  }, [
    reassignableStaff,
    reassignableLoading,
    reassignableError,
    fallbackStaffOptions,
    booking?.line_items,
    booking?.staff_id,
    booking?.staff_name,
    staffDraft,
    staffMap,
  ]);

  const lineStaffOptionsMap = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string }>> = {};
    const fallback = [{ value: '', label: 'Auto-assign' }, ...fallbackStaffOptions];
    if (reassignableStaff?.mode === 'per_line') {
      for (const [lineId, options] of Object.entries(reassignableStaff.line_item_options ?? {})) {
        map[lineId] = [
          { value: '', label: 'Auto-assign' },
          ...options.map((member) => ({ value: String(member.id), label: member.display_name })),
        ];
      }
    } else if (reassignableStaff?.mode === 'single') {
      const shared = [
        { value: '', label: 'Auto-assign' },
        ...(reassignableStaff.staff_options ?? []).map((member) => ({
          value: String(member.id),
          label: member.display_name,
        })),
      ];
      for (const item of booking?.line_items ?? []) {
        map[String(item.id)] = shared;
      }
    } else {
      for (const item of booking?.line_items ?? []) {
        map[String(item.id)] = fallback;
      }
    }

    for (const item of booking?.line_items ?? []) {
      const lineId = String(item.id);
      const currentId = String(lineStaffDraft[item.id] ?? item.staff_id ?? '');
      const options = map[lineId] ?? fallback;
      if (currentId && !options.some((option) => option.value === currentId)) {
        map[lineId] = [
          { value: '', label: 'Auto-assign' },
          {
            value: currentId,
            label: item.staff_name?.trim() || entityLabel(staffMap, currentId, 'Current staff'),
          },
          ...options.filter((option) => option.value !== ''),
        ];
      } else {
        map[lineId] = options;
      }
    }
    return map;
  }, [
    reassignableStaff,
    fallbackStaffOptions,
    booking?.line_items,
    lineStaffDraft,
    staffMap,
  ]);

  const staffSelectionChanged = useMemo(() => {
    if (!booking) return false;
    if (usePerLineReassign) {
      return (booking.line_items ?? []).some(
        (item) => String(lineStaffDraft[item.id] ?? '') !== String(item.staff_id ?? ''),
      );
    }
    return String(staffDraft || '') !== String(booking.staff_id ?? '');
  }, [booking, usePerLineReassign, lineStaffDraft, staffDraft]);

  function openStaffModal() {
    if (!booking) return;
    setReassignError(null);
    setActionError(null);
    setStaffDraft(String(booking.staff_id ?? ''));
    setLineStaffDraft(
      Object.fromEntries(
        (booking.line_items ?? []).map((item) => [item.id, String(item.staff_id ?? '')]),
      ),
    );
    setStaffModalOpen(true);
  }

  async function run(
    action: 'confirm' | 'checkin' | 'complete' | 'cancel' | 'reschedule' | 'reassign',
  ) {
    if (!booking) return;
    setActionLoading(action);
    setActionError(null);
    if (action === 'reassign') setReassignError(null);
    if (action === 'complete') setCollectError(null);
    try {
      if (action === 'confirm') await mutations.confirm(booking.id, reason || undefined);
      if (action === 'checkin') await mutations.checkIn(booking.id, reason || undefined);
      if (action === 'complete') {
        const body: {
          reason?: string;
          payment_method?: PaymentMethod;
          amount_paid?: number;
          payment_proof_url?: string;
          payment_proof_media_id?: string;
        } = { reason: reason || undefined };
        if (billTotal > 0) {
          body.payment_method = paymentMethod;
          if (paymentMethod === 'borrow' || amountReceivedTouched) {
            body.amount_paid = receivedAmount;
          }
          if (paymentMethod === 'upi' && receivedAmount > 0) {
            if (proofUploading) {
              throw new Error('Wait for the payment screenshot to finish uploading.');
            }
            if (!proofMediaId && !proofUrl) {
              throw new Error('Capture and upload a UPI payment screenshot before completing.');
            }
            if (proofUrl) body.payment_proof_url = proofUrl;
            if (proofMediaId) body.payment_proof_media_id = proofMediaId;
          }
          if (balanceDue > 0 && !booking.customer_id) {
            throw new Error('Customer is required when any amount is due.');
          }
        }
        await mutations.complete(booking.id, body);
        setShowCollect(false);
      }
      if (action === 'cancel') await mutations.cancel(booking.id, reason || undefined);
      if (action === 'reschedule') {
        if (!rescheduleSlot) throw new Error('Select a new time slot.');
        await mutations.reschedule(booking.id, rescheduleSlot, reason || undefined);
        setShowReschedule(false);
        setRescheduleSlot('');
      }
      if (action === 'reassign') {
        if (!staffSelectionChanged) {
          setStaffModalOpen(false);
          return;
        }
        if (usePerLineReassign) {
          await mutations.updateLineItemStaff(
            booking.id,
            (booking.line_items ?? []).map((item) => ({
              line_item_id: item.id,
              staff_id: lineStaffDraft[item.id] || null,
            })),
          );
        } else {
          await mutations.updateStaff(booking.id, staffDraft || null);
        }
        setStaffModalOpen(false);
        setReassignError(null);
        toast.push("Staff updated — they've been notified.", 'success');
      } else {
        const successMessage =
          action === 'confirm'
            ? 'Booking confirmed.'
            : action === 'checkin'
              ? 'Customer checked in.'
              : action === 'complete'
                ? 'Booking completed.'
                : action === 'cancel'
                  ? 'Booking cancelled.'
                  : action === 'reschedule'
                    ? 'Booking rescheduled.'
                    : 'Booking updated.';
        toast.push(successMessage, 'success');
      }
      bumpBookingsListRevision();
      await reload();
    } catch (err) {
      const message = getApiErrorMessage(err, "That didn't go through. Try again.");
      if (action === 'reassign') {
        setReassignError(message);
      } else if (action === 'complete') {
        setCollectError(message);
        toast.push(message, 'error');
      } else {
        setActionError(message);
        toast.push(message, 'error');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function openInvoiceActions() {
    if (!booking || !client || !businessId) return;
    setInvoiceBusy(true);
    try {
      const existingId = String(booking.books_voucher_id || '').trim();
      const existingNumber = String(
        booking.books_voucher_number || booking.booking_number || '',
      ).trim();
      if (existingId) {
        setDocActions({
          kind: 'sale',
          id: existingId,
          number: existingNumber,
          businessId,
          phone: customerPhone || undefined,
          email: customer?.email?.trim() || undefined,
        });
        return;
      }
      const response = await client.bookings.invoice(booking.id);
      if (!response.data.available || !response.data.voucher_id) {
        toast.push(response.data.reason || 'Tax invoice is not available yet.', 'error');
        return;
      }
      setDocActions({
        kind: 'sale',
        id: response.data.voucher_id,
        number: response.data.voucher_number || response.data.invoice_number || existingNumber,
        businessId,
        phone: customerPhone || undefined,
        email: customer?.email?.trim() || undefined,
      });
      await reload();
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Could not open tax invoice.'), 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  if (loading || error || !booking) {
    return (
      <ScreenState
        loading={loading}
        error={error}
        actionLabel={error ? 'Retry' : undefined}
        onAction={error ? () => void reload() : undefined}
      />
    );
  }

  const isOpenBooking = !['cancelled', 'completed', 'rejected', 'no_show'].includes(status);
  const canConfirm = ['pending', 'draft'].includes(status);
  const canCheckIn = ['confirmed', 'pending'].includes(status);
  const canComplete = ['confirmed', 'checked_in', 'in_progress'].includes(status);
  const hasInvoice =
    status === 'completed' || Boolean(String(booking.books_voucher_id || '').trim());
  const showFooter = Boolean(canAct && (isOpenBooking || hasInvoice));

  function openRescheduleModal() {
    setActionError(null);
    setRescheduleDate(formatDateKey(booking.start_at ? new Date(booking.start_at) : new Date()));
    setRescheduleSlot('');
    setShowReschedule(true);
  }

  const footer = !showFooter ? undefined : hasInvoice && !isOpenBooking ? (
    <View style={styles.footer}>
      <Button
        label={invoiceBusy ? 'Opening…' : 'View / Share invoice'}
        icon="file-text"
        loading={invoiceBusy}
        disabled={!businessId || invoiceBusy}
        style={styles.footerPrimary}
        onPress={() => void openInvoiceActions()}
      />
    </View>
  ) : (
    <View style={styles.footer}>
      <Button
        label="Cancel"
        variant="soft"
        icon="x"
        loading={actionLoading === 'cancel'}
        style={styles.footerBtn}
        onPress={() => void run('cancel')}
      />
      <Button
        label="Reschedule"
        variant="soft"
        icon="calendar"
        style={styles.footerBtn}
        onPress={openRescheduleModal}
      />
      <Button
        label="Reassign"
        variant="soft"
        icon="users"
        style={styles.footerBtn}
        onPress={openStaffModal}
      />
      {canConfirm ? (
        <Button
          label="Confirm"
          icon="check"
          loading={actionLoading === 'confirm'}
          style={styles.footerPrimary}
          onPress={() => void run('confirm')}
        />
      ) : canCheckIn ? (
        <Button
          label="Check in"
          icon="log-in"
          loading={actionLoading === 'checkin'}
          style={styles.footerPrimary}
          onPress={() => void run('checkin')}
        />
      ) : canComplete ? (
        <Button
          label="Complete"
          icon="check-circle"
          loading={actionLoading === 'complete'}
          style={styles.footerPrimary}
          onPress={() => {
            if (billTotal > 0) openCollectModal();
            else void run('complete');
          }}
        />
      ) : null}
    </View>
  );

  return (
    <FormScreen footer={footer}>
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Invoice ${docActions.number || ''}`.trim() : 'Sale invoice'}
      />
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.icon}>
            <Feather name="calendar" size={18} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{serviceName}</Text>
            <Text style={styles.ref}>#{booking.booking_number ?? booking.id.slice(0, 8)}</Text>
          </View>
          <Badge status={mapBookingStatus(status)} />
        </View>
        {booking.customer_id ? (
          <CustomerDetailLinkCard
            customerId={booking.customer_id}
            customerName={customerName}
            customerPhone={customerPhone}
            customerEmail={customer?.email?.trim() || undefined}
            addressPreview={customerAddress || undefined}
          />
        ) : (
          <DetailRow label="Customer" value={customerName} />
        )}
        <DetailRow label="Staff" value={staffName} />
        <DetailRow label="Starts" value={formatDateTime(booking.start_at)} />
        <DetailRow label="Ends" value={formatDateTime(booking.end_at)} />
        <DetailRow label="Duration" value={booking.duration_minutes ? `${booking.duration_minutes} min` : '—'} />
        {booking.line_items?.length ? (
          <View style={styles.itemsBlock}>
            <Text style={styles.itemsLabel}>Services</Text>
            {booking.line_items.map((item) => (
              <Text key={item.id} style={styles.itemRow}>
                {item.service_name || entityLabel(serviceMap, item.service_id, 'Service')}
                {' · '}
                {item.start_at ? formatTime(item.start_at) : '—'}
                {' · '}
                {item.duration_minutes} min
                {item.staff_name || item.staff_id
                  ? ` · ${item.staff_name || entityLabel(staffMap, item.staff_id, '')}`
                  : ''}
              </Text>
            ))}
          </View>
        ) : null}
        <DetailRow label="Price" value={servicePriceLabel} />
        <DetailRow label="Notes" value={booking.notes || '—'} />
      </Card>

      {booking.review ? (
        <Card>
          <SectionHeader title="Customer review" />
          <Text style={styles.rating}>
            {'★'.repeat(booking.review.rating)}
            {'☆'.repeat(5 - booking.review.rating)}
          </Text>
          <Text style={styles.reviewComment}>{booking.review.comment?.trim() || 'No written comment.'}</Text>
          <Text style={styles.reviewMeta}>{formatDateTime(booking.review.created_at)}</Text>
        </Card>
      ) : null}

      {canAct && isOpenBooking ? (
        <>
          <Input
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="Visible in audit trail"
          />
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        </>
      ) : null}

      {recordedPaymentMethod || recordedProofUri ? (
        <Card>
          <SectionHeader title="Payment" />
          {recordedPaymentMethod ? (
            <DetailRow
              label="Method"
              value={
                recordedPaymentMethod === 'borrow'
                  ? 'Credit'
                  : recordedPaymentMethod.charAt(0).toUpperCase() + recordedPaymentMethod.slice(1)
              }
            />
          ) : null}
          {recordedAmountPaid != null && Number.isFinite(recordedAmountPaid) ? (
            <DetailRow label="Amount paid" value={formatMoney(recordedAmountPaid, currency)} />
          ) : null}
          {recordedProofUri ? (
            <View style={styles.proofViewBlock}>
              <Text style={styles.fieldLabel}>Payment proof</Text>
              <Pressable onPress={() => setProofLightboxOpen(true)} accessibilityLabel="View payment proof">
                <Image source={{ uri: recordedProofUri }} style={styles.proofViewImage} resizeMode="cover" />
              </Pressable>
              <Text style={styles.help}>Tap to view full size</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {hasInvoice && String(booking.books_voucher_number || '').trim() ? (
        <Text style={styles.help}>Books · {booking.books_voucher_number}</Text>
      ) : !hasInvoice && isOpenBooking ? (
        <Text style={styles.help}>
          Tax invoice actions appear after this appointment is completed and posted to Books.
        </Text>
      ) : null}

      <ImageLightbox
        uri={recordedProofUri || null}
        visible={proofLightboxOpen}
        title="Payment proof"
        onClose={() => setProofLightboxOpen(false)}
      />

      <Modal
        visible={showReschedule}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReschedule(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowReschedule(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, styles.rescheduleSheet]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reschedule</Text>
              <Pressable onPress={() => setShowReschedule(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.sheetHint}>Pick a new date and available time for this appointment.</Text>
              <CalendarPicker
                value={rescheduleDate}
                onChange={(next) => {
                  setRescheduleDate(next);
                  setRescheduleSlot('');
                }}
              />
              <TimeSlotGrid
                slots={slots}
                selected={rescheduleSlot}
                onSelect={setRescheduleSlot}
                loading={slotsLoading}
                emptyMessage="No timeslot available for this staff on this date. Try another day."
              />
              {rescheduleSlot ? (
                <Card>
                  <Text style={styles.summaryLabel}>New time</Text>
                  <Text style={styles.summaryValue}>{formatDateTime(rescheduleSlot)}</Text>
                </Card>
              ) : null}
              {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
              <View style={styles.sheetActions}>
                <Button
                  label="Cancel"
                  variant="soft"
                  icon="x"
                  style={styles.footerBtn}
                  onPress={() => setShowReschedule(false)}
                />
                <Button
                  label="Confirm"
                  icon="check"
                  loading={actionLoading === 'reschedule'}
                  disabled={!rescheduleSlot}
                  style={styles.footerPrimary}
                  onPress={() => void run('reschedule')}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCollect}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCollect(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowCollect(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, styles.collectSheet]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Collect payment</Text>
              <Pressable onPress={() => setShowCollect(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
              <Text style={styles.sheetHint}>Record how the customer paid before completing.</Text>
              <Card>
                <Text style={styles.summaryLabel}>Bill total</Text>
                <Text style={styles.summaryValue}>{formatMoney(billTotal, currency)}</Text>
              </Card>
              <Text style={styles.fieldLabel}>Payment type</Text>
              <View style={styles.methodRow}>
                {(
                  [
                    { value: 'cash', label: 'Cash' },
                    { value: 'upi', label: 'UPI' },
                    { value: 'card', label: 'Card' },
                    { value: 'borrow', label: 'Credit' },
                  ] as const
                ).map((method) => (
                  <Chip
                    key={method.value}
                    label={method.label}
                    active={paymentMethod === method.value}
                    onPress={() => {
                      setPaymentMethod(method.value);
                      setAmountReceivedTouched(false);
                      setAmountReceived('');
                      clearUpiProof();
                    }}
                  />
                ))}
              </View>
              <Text style={styles.fieldLabel}>
                {paymentMethod === 'borrow' ? 'Amount paid now (optional)' : 'Amount received'}
              </Text>
              <TextInput
                style={styles.amountInput}
                value={
                  amountReceivedTouched || amountReceived !== ''
                    ? amountReceived
                    : paymentMethod === 'borrow'
                      ? ''
                      : payableShown > 0
                        ? String(payableShown)
                        : ''
                }
                onChangeText={(value) => {
                  setAmountReceivedTouched(true);
                  setAmountReceived(sanitizeDecimalInput(value));
                }}
                keyboardType="decimal-pad"
                placeholder={paymentMethod === 'borrow' ? '0' : String(payableShown || '')}
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={styles.help}>
                {balanceDue > 0
                  ? `Balance due ${formatMoney(balanceDue, currency)} goes to the customer’s credit.`
                  : 'Bill will be marked fully paid.'}
              </Text>
              {paymentMethod === 'upi' && receivedAmount > 0 ? (
                <View style={styles.upiQrBlock}>
                  <Text style={styles.fieldLabel}>Scan to pay</Text>
                  {upiPayUrl ? (
                    <View style={styles.upiQrCard}>
                      <PaymentQrCode value={upiPayUrl} size={180} />
                      <Text style={styles.help}>{activeBusiness?.upi_vpa}</Text>
                      <Text style={styles.summaryValue}>{formatMoney(receivedAmount, currency)}</Text>
                    </View>
                  ) : paymentQrImageUrl ? (
                    <View style={styles.upiQrCard}>
                      <Image
                        source={{ uri: paymentQrImageUrl }}
                        style={styles.upiQrImage}
                        resizeMode="contain"
                      />
                      <Text style={styles.help}>Static payment QR</Text>
                    </View>
                  ) : (
                    <Text style={styles.error}>
                      Add a UPI ID in Business Profile to show a payment QR.
                    </Text>
                  )}
                  <View style={styles.proofBlock}>
                    <Text style={styles.fieldLabel}>Payment screenshot *</Text>
                    <Text style={styles.help}>
                      After the customer pays, take a photo of their UPI success screen.
                    </Text>
                    {proofPreviewUri || proofUrl ? (
                      <Image
                        source={{ uri: proofPreviewUri || proofUrl }}
                        style={styles.proofPreview}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={styles.proofActions}>
                      <Button
                        label={proofPreviewUri || proofUrl ? 'Retake photo' : 'Take photo'}
                        icon="camera"
                        style={styles.footerPrimary}
                        disabled={proofUploading}
                        onPress={() => void captureUpiProofFromCamera()}
                      />
                      <Button
                        label="Gallery"
                        variant="soft"
                        icon="image"
                        style={styles.footerBtn}
                        disabled={proofUploading}
                        onPress={() => void pickUpiProofFromGallery()}
                      />
                    </View>
                    {proofUploading ? (
                      <View style={styles.proofUploading}>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={styles.help}>Uploading proof…</Text>
                      </View>
                    ) : null}
                    {proofError ? <Text style={styles.error}>{proofError}</Text> : null}
                  </View>
                </View>
              ) : null}
              {balanceDue > 0 && !booking.customer_id ? (
                <Text style={styles.error}>Customer is required when any amount is due.</Text>
              ) : null}
              {collectError ? <Text style={styles.error}>{collectError}</Text> : null}
              <View style={styles.sheetActions}>
                <Button
                  label="Cancel"
                  variant="soft"
                  icon="x"
                  style={styles.footerBtn}
                  onPress={() => setShowCollect(false)}
                />
                <Button
                  label="Complete"
                  icon="check-circle"
                  loading={actionLoading === 'complete'}
                  disabled={
                    proofUploading ||
                    (paymentMethod === 'upi' &&
                      receivedAmount > 0 &&
                      !proofMediaId &&
                      !proofUrl)
                  }
                  style={styles.footerPrimary}
                  onPress={() => void run('complete')}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={staffModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setStaffModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setStaffModalOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reassign staff</Text>
              <Pressable onPress={() => setStaffModalOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.sheetHint}>
                {usePerLineReassign
                  ? 'Choose staff assigned to each service. Busy staff may fail reassignment — reschedule if needed.'
                  : 'Choose a different staff member, then confirm. Busy staff may fail reassignment — reschedule if needed.'}
              </Text>
              {reassignableLoading ? <ActivityIndicator color={colors.primary} /> : null}
              {reassignableError ? <Text style={styles.error}>{reassignableError}</Text> : null}
              {reassignableError && !reassignableStaff ? (
                <Text style={styles.sheetHint}>
                  Could not load availability filter. Showing all staff — reassignment may fail if they are busy.
                </Text>
              ) : null}
              {usePerLineReassign ? (
                (booking.line_items ?? []).map((item) => (
                  <SelectField
                    key={item.id}
                    label={
                      item.service_name || entityLabel(serviceMap, item.service_id, 'Service')
                    }
                    optional
                    value={lineStaffDraft[item.id] ?? ''}
                    options={lineStaffOptionsMap[String(item.id)] ?? [{ value: '', label: 'Auto-assign' }]}
                    onChange={(next) =>
                      setLineStaffDraft((current) => ({ ...current, [item.id]: next }))
                    }
                    placeholder="Choose staff"
                  />
                ))
              ) : (
                <SelectField
                  label="Staff member"
                  optional
                  value={staffDraft}
                  options={staffOptions}
                  onChange={setStaffDraft}
                  placeholder="Choose staff"
                />
              )}
              {reassignError ? <Text style={styles.error}>{reassignError}</Text> : null}
              {!staffSelectionChanged ? (
                <Text style={styles.sheetHint}>Select a different staff member to enable confirm.</Text>
              ) : null}
              <View style={styles.sheetActions}>
                <Button
                  label="Cancel"
                  variant="soft"
                  icon="x"
                  style={styles.footerBtn}
                  onPress={() => setStaffModalOpen(false)}
                />
                <Button
                  label="Confirm"
                  icon="check"
                  loading={actionLoading === 'reassign'}
                  disabled={!staffSelectionChanged}
                  style={styles.footerPrimary}
                  onPress={() => void run('reassign')}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  ref: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  footer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  footerBtn: { flex: 1 },
  footerPrimary: { flex: 1.35 },
  error: { ...typography.caption, color: colors.destructive },
  help: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  rescheduleSheet: { maxHeight: '88%' },
  collectSheet: { maxHeight: '88%' },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch', marginTop: spacing.sm },
  fieldLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontFamily: fonts.bodySemi,
    marginBottom: 6,
  },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  upiQrBlock: { gap: spacing.sm },
  upiQrCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  upiQrImage: { width: 180, height: 180 },
  proofBlock: { gap: spacing.sm, width: '100%' },
  proofPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proofViewBlock: { gap: spacing.sm, marginTop: spacing.sm },
  proofViewImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proofActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  proofUploading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...typography.body,
    color: colors.foreground,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  summaryLabel: { ...typography.caption, color: colors.mutedForeground },
  summaryValue: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: 4 },
  rating: { ...typography.title, fontSize: 18, color: colors.primary, marginTop: spacing.xs },
  reviewComment: { ...typography.body, color: colors.mutedForeground, marginTop: spacing.sm, lineHeight: 20 },
  reviewMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  itemsBlock: { marginBottom: spacing.sm },
  itemsLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', marginBottom: spacing.xs },
  itemRow: { ...typography.body, color: colors.foreground, marginBottom: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  sheetTitle: { ...typography.title, color: colors.foreground },
  sheetContent: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl },
  sheetHint: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
});
