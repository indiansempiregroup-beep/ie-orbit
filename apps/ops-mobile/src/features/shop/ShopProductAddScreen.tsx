import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopBarcodeEnrichment, ShopGodown, ShopProduct, ShopProductCategoryItem } from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES, guessShopProductCategory } from '@ie-orbit/sdk';
import type { IEOrbitClient } from '@ie-orbit/sdk';
import { createScopedClient } from '../../api/client';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadProductImage } from '../../api/media';
import { enrichSuccessMessage } from './enrichMessages';
import { takeEnrichPrefetch } from './enrichPrefetchSession';
import { ProductImageCropModal } from './ProductImageCropModal';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { HtmlEditorField } from '../../components/HtmlEditorField';
import { ImageLightbox } from '../../components/ImageLightbox';
import { RemoteImage } from '../../components/RemoteImage';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FieldLabel } from '../../components/ui/FieldLabel';
import { FieldRow } from '../../components/ui/FieldRow';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { CURRENCIES } from '../../constants/options';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import {
  MAX_PRODUCT_IMAGES,
  buildProductImageMetadata,
  emptyProductImageSlots,
  ensureProductImageSlots,
  galleryFromProduct,
  normalizeProductGallery,
  productImageSlotLabel,
  toStoredProductImageUrl,
} from './productImages';
import { queuePosAddProductId } from './posSession';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { PlanFeature } from '../../utils/planFeatures';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopProductAdd'>;

const emptyForm = {
  sku: '',
  name: '',
  brand: '',
  description: '',
  details_html: '',
  price: '0',
  purchase_price: '0',
  tax_rate: '0',
  hsn_sac: '',
  tax_inclusive: 'included' as 'included' | 'excluded',
  currency: 'INR',
  stock_on_hand: '0',
  low_stock_threshold: '0',
  pack_size: '',
  images: emptyProductImageSlots(),
  barcode: '',
  barcode_type: 'manufacturer' as string,
  status: 'active',
  category: '',
  category_other: '',
};

type FormState = typeof emptyForm;
type FormKey = keyof FormState;

const DEFAULTS = new Set(['0', 'INR', 'active', 'manufacturer', '']);

const IDENTITY_KEYS: FormKey[] = [
  'sku',
  'name',
  'brand',
  'description',
  'details_html',
  'pack_size',
  'category',
  'images',
  'barcode',
  'barcode_type',
  'price',
  'purchase_price',
  'tax_rate',
  'hsn_sac',
  'tax_inclusive',
];

/** Clear catalog identity when the barcode changes so a new lookup can refill everything. */
function wipeIdentity(
  current: FormState,
  code: string,
  options?: { keepPriceStock?: boolean },
): FormState {
  return {
    ...current,
    sku: code,
    name: '',
    brand: '',
    description: '',
    details_html: '',
    pack_size: '',
    hsn_sac: '',
    category: '',
    images: emptyProductImageSlots(),
    barcode: code,
    barcode_type: 'manufacturer',
    category_other: '',
    ...(options?.keepPriceStock
      ? {}
      : { price: '0', purchase_price: '0', tax_rate: '0', tax_inclusive: 'included' as const }),
  };
}

function clearIdentityTouched(touched: Set<FormKey>, options?: { keepPriceStock?: boolean }) {
  for (const key of IDENTITY_KEYS) {
    if (
      options?.keepPriceStock &&
      (key === 'price' || key === 'purchase_price' || key === 'tax_rate' || key === 'tax_inclusive')
    ) {
      continue;
    }
    touched.delete(key);
  }
}

function usableEnrichmentAmount(raw?: string | null): string {
  const value = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/₹/g, '');
  if (!value) return '';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return value;
}

function packSizeFromEnrichment(data: ShopBarcodeEnrichment): string {
  const direct = String(data.pack_size || data.serving_size || '').trim();
  if (direct && /[a-zA-Z]/.test(direct)) return direct;
  const quantity = String((data.metadata as { quantity?: string } | undefined)?.quantity || '').trim();
  const fromText = `${quantity} ${data.name || ''}`.match(
    /(\d+(?:[.,]\d+)?\s*(?:ml|mL|l|L|g|kg|gm|oz|pcs?|pack|caps?|tabs?))\b/i,
  );
  if (fromText?.[1]) return fromText[1].trim();
  return direct;
}

function applyEnrichment(
  current: FormState,
  data: ShopBarcodeEnrichment,
  touched: Set<FormKey>,
  options?: { replaceIdentity?: boolean },
): FormState {
  const replace = Boolean(options?.replaceIdentity);
  const fill = (key: FormKey, value?: string | null) => {
    if (!value) return current[key];
    if (!replace && touched.has(key)) return current[key];
    const existing = String(current[key] ?? '');
    if (!replace && existing && !DEFAULTS.has(existing)) return existing;
    return value;
  };

  const usableMrp = usableEnrichmentAmount(data.mrp);
  const usableGst = usableEnrichmentAmount(data.gst_rate);
  // Do not copy description into product details — they are separate fields.
  const detailsHtml = (data.details_html || '').trim();
  const packSize = packSizeFromEnrichment(data);

  const nextImages = ensureProductImageSlots(
    normalizeProductGallery([
      data.front_image_url || current.images[0],
      data.back_image_url || current.images[1],
      ...(data.images?.gallery ?? []),
      ...current.images.slice(2),
      data.local_image_url,
      data.image_url,
    ]),
  );

  const next: FormState = {
    ...current,
    sku: fill('sku', data.sku || data.code),
    name: fill('name', data.name),
    brand: fill('brand', data.brand),
    description: fill('description', data.description),
    details_html: fill('details_html', detailsHtml),
    pack_size: fill('pack_size', packSize),
    price: fill('price', usableMrp),
    tax_rate: fill('tax_rate', usableGst),
    hsn_sac: fill('hsn_sac', data.hsn_sac),
    images: nextImages,
    barcode: fill('barcode', data.code),
    barcode_type: data.code && !touched.has('barcode_type') ? 'manufacturer' : current.barcode_type,
    category: fill(
      'category',
      data.category || guessShopProductCategory(data.categories) || undefined,
    ),
  };

  // Indian MRP is tax-inclusive; apply that when we fill from catalog MRP.
  if (usableMrp && !touched.has('tax_inclusive')) {
    next.tax_inclusive = 'included';
  }

  return next;
}

function pickGodownId(godowns: ShopGodown[], productId?: string) {
  if (productId) {
    const holding = godowns.find((godown) =>
      (godown.stocks ?? []).some((row) => row.product === productId && Number(row.quantity) > 0),
    );
    if (holding) return holding.id;
  }
  return godowns.find((godown) => godown.is_default)?.id || godowns[0]?.id || '';
}

function formFromProduct(product: ShopProduct): FormState {
  const primaryBarcode = product.barcodes?.find((row) => row.is_primary) || product.barcodes?.[0];
  const meta = product.metadata && typeof product.metadata === 'object' ? product.metadata : {};
  const taxInclusive =
    typeof (product as { tax_inclusive?: boolean }).tax_inclusive === 'boolean'
      ? Boolean((product as { tax_inclusive?: boolean }).tax_inclusive)
      : Boolean(meta.tax_inclusive);
  return {
    sku: product.sku || '',
    name: product.name || '',
    brand: product.brand || '',
    description: product.description || '',
    details_html: product.details_html || '',
    price: String(product.price ?? '0'),
    purchase_price: String(product.purchase_price ?? '0'),
    tax_rate: String(product.tax_rate ?? product.gst_rate ?? '0'),
    hsn_sac: product.hsn_sac || '',
    tax_inclusive: taxInclusive ? 'included' : 'excluded',
    currency: product.currency || 'INR',
    stock_on_hand: String(product.stock_on_hand ?? '0'),
    low_stock_threshold: String(product.low_stock_threshold ?? '0'),
    pack_size: product.pack_size || '',
    images: galleryFromProduct(product),
    barcode: primaryBarcode?.code || '',
    barcode_type: primaryBarcode?.barcode_type || 'manufacturer',
    status: product.status || 'active',
    category: product.category || '',
    category_other: product.category === 'other' ? product.category_label || '' : '',
  };
}

export function ShopProductAddScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, tenantId } = useWorkspace();
  const { token, ensureFreshAccess } = useAuth();
  const { has } = usePlanFeatures();
  const showGodowns = has(PlanFeature.shopieBooksGodowns);
  const canRemoveBackground = has(PlanFeature.shopieProductBgRemove);
  const productId = route.params?.productId;
  const isEditing = Boolean(productId);
  const [form, setForm] = useState(emptyForm);
  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [godownId, setGodownId] = useState('');
  const [nameLookup, setNameLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessageText] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('success');
  const [needsPackPhoto, setNeedsPackPhoto] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<string[]>(emptyProductImageSlots());
  const [categoryOptions, setCategoryOptions] = useState<ShopProductCategoryItem[]>(
    SHOP_PRODUCT_CATEGORIES.map((item) => ({ slug: item.value, label: item.label, is_builtin: true })),
  );
  const [cropPending, setCropPending] = useState<{
    index: number;
    asset: ImagePickerAsset;
  } | null>(null);
  const [lightbox, setLightbox] = useState<{ index: number; uri: string } | null>(null);
  const touchedRef = useRef<Set<FormKey>>(new Set());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? t('shop.products.editTitle') : t('shop.products.addTitle') });
  }, [isEditing, navigation, t]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!productId || !client) return;
    void (async () => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await client.shop.getProduct(productId);
        const next = formFromProduct(response.data);
        setForm(next);
        setPreviews(emptyProductImageSlots());
        touchedRef.current = new Set();
        if (!normalizeProductGallery(next.images).length) {
          setMessage(t('opsApp.shop.productAdd.noPhotosFound'));
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t('opsApp.shop.productAdd.loadFailed'), 'error');
      } finally {
        setBusy(false);
      }
    })();
  }, [client, productId, t]);

  useEffect(() => {
    if (!client || !businessId || !showGodowns) {
      setGodowns([]);
      return;
    }
    void (async () => {
      try {
        const response = await client.shop.listGodowns({ business_id: businessId });
        const rows = response.data ?? [];
        setGodowns(rows);
        setGodownId((current) => current || pickGodownId(rows, productId));
      } catch {
        setGodowns([]);
      }
    })();
  }, [client, businessId, showGodowns, productId]);

  useEffect(() => {
    if (!client || !businessId) return;
    void (async () => {
      try {
        const response = await client.shop.listProductCategories({ business_id: businessId });
        const items = response.data.items ?? [];
        if (items.length) setCategoryOptions(items);
      } catch {
        /* keep builtin fallback */
      }
    })();
  }, [client, businessId]);

  useEffect(() => {
    const code = route.params?.enrichCode;
    if (!code || !client || !businessId) return;
    void (async () => {
      setBusy(true);
      setMessage(null);
      setNeedsPackPhoto(false);
      try {
        const prefetched = takeEnrichPrefetch(code, businessId);
        const data = prefetched
          ? await prefetched
          : (
              await client.shop.enrichBarcode({
                business_id: businessId,
                product_id: productId || undefined,
                code,
                use_smart_lookup: true,
              })
            ).data;
        setForm((current) => {
          const codeChanged = Boolean(current.barcode.trim() && current.barcode.trim() !== code);
          if (codeChanged) {
            clearIdentityTouched(touchedRef.current, { keepPriceStock: isEditing });
            setPreviews(emptyProductImageSlots());
          }
          const base = codeChanged
            ? wipeIdentity(current, code, { keepPriceStock: isEditing })
            : { ...current, barcode: code };
          return applyEnrichment(base, data, touchedRef.current, {
            replaceIdentity: codeChanged,
          });
        });
        touchedRef.current.add('barcode');
        if (data.found) {
          setNeedsPackPhoto(false);
          setMessage(enrichSuccessMessage(data, t, { editing: isEditing }));
        } else {
          setNeedsPackPhoto(Boolean(data.needs_pack_photo));
          setMessage(
            enrichMissMessage(
              data,
              data.needs_pack_photo
                ? t('opsApp.shop.productAdd.noMatchYetPackPhoto')
                : t('opsApp.shop.productAdd.barcodeUpdatedNoMatch'),
            ),
            'error',
          );
        }
      } catch (err) {
        setForm((current) => ({ ...current, barcode: code }));
        touchedRef.current.add('barcode');
        setMessage(err instanceof Error ? err.message : t('opsApp.shop.productAdd.barcodeCaptured'), 'error');
      } finally {
        setBusy(false);
        navigation.setParams({ enrichCode: undefined });
      }
    })();
  }, [client, navigation, route.params?.enrichCode, businessId, isEditing, t]);

  function setMessage(text: string | null, tone: 'error' | 'success' = 'success') {
    setMessageText(text);
    setMessageTone(tone);
  }

  function markTouched(key: FormKey) {
    touchedRef.current.add(key);
  }

  function setField(key: FormKey, value: string) {
    markTouched(key);
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key] ? { ...current, [key]: '' } : current));
  }

  function enrichMissMessage(
    data: {
      message?: string;
      needs_pack_photo?: boolean;
    },
    fallback: string,
  ) {
    const base = (data.message || fallback).trim();
    if (data.needs_pack_photo && !/pack photo|photo/i.test(base)) {
      return `${base} ${t('opsApp.shop.productAdd.capturePackPhotoRetry')}`;
    }
    return base;
  }

  function authErrorMessage(err: unknown, fallback: string) {
    const text = err instanceof Error ? err.message : fallback;
    if (/token not valid|token_not_valid|unauthorized|401|authentication/i.test(text)) {
      return t('opsApp.shop.productAdd.sessionExpired');
    }
    if (/network request failed|failed to fetch|networkerror|timed out|timeout/i.test(text)) {
      return t('opsApp.shop.productAdd.uploadLostConnection');
    }
    return text || fallback;
  }

  async function uploadAsset(index: number, asset: ImagePickerAsset, removeBackground = false) {
    const access = (await ensureFreshAccess()) || token;
    if (!businessId || !tenantId || !access) {
      throw new Error(t('opsApp.shop.productAdd.workspaceNotReady'));
    }
    const uploaded = await uploadProductImage({
      token: access,
      tenantId,
      businessId,
      asset,
      productName: productImageSlotLabel(index, t),
      prepareProductCanvas: true,
      removeBackground,
    });
    const imageUrl = uploaded.public_url || uploaded.private_url || '';
    if (!imageUrl) throw new Error(t('opsApp.shop.invoiceScan.noPhotoUrlReturned'));
    return imageUrl;
  }

  async function captureAt(index: number) {
    // RN Alert.alert buttons never fire on web, and a delayed picker call is
    // blocked by the browser (file inputs must open from a user gesture).
    if (Platform.OS === 'web') {
      await pickAt(index, 'library');
      return;
    }
    Alert.alert(productImageSlotLabel(index, t), t('opsApp.shop.productAdd.chooseSource'), [
      {
        text: t('opsApp.shop.common.camera'),
        onPress: () => void pickAt(index, 'camera'),
      },
      {
        text: t('opsApp.shop.common.gallery'),
        onPress: () => void pickAt(index, 'library'),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function pickAt(index: number, source: 'camera' | 'library') {
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setMessage(t('opsApp.shop.productAdd.cameraPermission'), 'error');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setMessage(t('opsApp.shop.productAdd.libraryPermission'), 'error');
          return;
        }
      }
    }

    const pickerOptions = {
      mediaTypes: ['images'] as const,
      quality: 0.85,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setPreviews((current) => {
      const next = ensureProductImageSlots(current);
      next[index] = asset.uri;
      return next;
    });
    setCropPending({ index, asset });
  }

  async function confirmCrop(
    croppedAsset: ImagePickerAsset,
    options?: { removeBackground: boolean },
  ) {
    if (!cropPending) return;
    const { index } = cropPending;
    setCropPending(null);
    setPreviews((current) => {
      const next = ensureProductImageSlots(current);
      next[index] = croppedAsset.uri;
      return next;
    });
    setBusy(true);
    setMessage(
      options?.removeBackground
        ? t('opsApp.shop.productAdd.removingBackground')
        : t('opsApp.shop.productAdd.uploadingPhoto'),
    );
    try {
      // Pixels already cropped on device; server letterboxes (+ optional rembg).
      const imageUrl = await uploadAsset(index, croppedAsset, Boolean(options?.removeBackground));
      const stored = toStoredProductImageUrl(imageUrl) || imageUrl;
      // Bust caches so the slot shows the final server image (canvas / rembg), not the local crop.
      const previewUrl = stored.includes('?') ? `${stored}&t=${Date.now()}` : `${stored}?t=${Date.now()}`;
      setForm((current) => {
        const next = ensureProductImageSlots(current.images);
        next[index] = stored;
        return { ...current, images: next };
      });
      setPreviews((current) => {
        const next = ensureProductImageSlots(current);
        next[index] = previewUrl;
        return next;
      });
      setMessage(
        index === 0
          ? t('shop.products.primaryUploaded')
          : t('shop.products.slotUploaded', { label: productImageSlotLabel(index, t) }),
      );
    } catch (err) {
      setMessage(authErrorMessage(err, t('shop.products.uploadFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  function cancelCrop() {
    if (!cropPending) return;
    const { index } = cropPending;
    setCropPending(null);
    setPreviews((current) => {
      const next = ensureProductImageSlots(current);
      next[index] = form.images[index] || '';
      return next;
    });
  }

  function removeAt(index: number) {
    setForm((current) => {
      const next = ensureProductImageSlots(current.images);
      next[index] = '';
      return { ...current, images: ensureProductImageSlots(normalizeProductGallery(next)) };
    });
    setPreviews((current) => {
      const next = ensureProductImageSlots(current);
      next[index] = '';
      return ensureProductImageSlots(normalizeProductGallery(next));
    });
  }

  async function getFreshClient(): Promise<IEOrbitClient> {
    const access = (await ensureFreshAccess()) || token;
    if (!access || !businessId) {
      throw new Error(t('opsApp.shop.productAdd.sessionExpired'));
    }
    return createScopedClient(access, tenantId, businessId);
  }

  async function pollAnalysis(
    jobId: string,
    payload: { front?: string; back?: string; hint?: string },
  ) {
    if (!businessId) return;
    const started = Date.now();
    setAnalyzing(true);
    setMessage(t('shop.products.analysingBg'));

    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      void (async () => {
        try {
          const activeClient = await getFreshClient();
          const response = await activeClient.shop.getPackagingAnalysis(jobId);
          const job = response.data;
          if (job.status === 'queued' || job.status === 'running') {
            if (Date.now() - started > 45000) {
              if (pollTimer.current) clearInterval(pollTimer.current);
              try {
                const syncClient = await getFreshClient();
                const sync = await syncClient.shop.analyzePackaging({
                  business_id: businessId,
                  front_image_url: payload.front,
                  back_image_url: payload.back,
                  hint: payload.hint,
                  async_mode: false,
                });
                setAnalyzing(false);
                if (sync.data.result) {
                  setForm((current) => applyEnrichment(current, sync.data.result!, touchedRef.current));
                  setMessage(sync.data.result.message || t('shop.products.fieldsUpdated'));
                } else {
                  setMessage(sync.data.error || t('shop.products.analysisTimeout'), 'error');
                }
              } catch (fallbackError) {
                setAnalyzing(false);
                setMessage(authErrorMessage(fallbackError, t('shop.products.analysisTimeout')), 'error');
              }
            }
            return;
          }
          if (pollTimer.current) clearInterval(pollTimer.current);
          setAnalyzing(false);
          if (job.status === 'failed') {
            setMessage(job.error || t('shop.products.analysisFailed'), 'error');
            return;
          }
          if (job.result) {
            setForm((current) => applyEnrichment(current, job.result!, touchedRef.current));
            setMessage(job.result.message || t('shop.products.fieldsUpdated'));
          }
        } catch (err) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setAnalyzing(false);
          setMessage(authErrorMessage(err, t('opsApp.shop.productAdd.statusCheckFailed')), 'error');
        }
      })();
    }, 1500);
  }

  async function runSmartLookupFromPhoto() {
    if (!businessId) return;
    const front = form.images[0] || '';
    if (!front) {
      setMessage(t('opsApp.shop.productAdd.capturePrimaryFirst'), 'error');
      return;
    }
    setBusy(true);
    setMessage(t('opsApp.shop.productAdd.readingWithSmart'));
    try {
      const freshClient = await getFreshClient();
      const response = await freshClient.shop.enrichBarcode({
        business_id: businessId,
        product_id: productId || undefined,
        code: form.barcode || undefined,
        image_url: front,
        hint: nameLookup || form.name || form.brand,
        use_smart_lookup: true,
      });
      if (!response.data.found) {
        setNeedsPackPhoto(Boolean(response.data.needs_pack_photo));
        setMessage(
          enrichMissMessage(response.data, t('opsApp.shop.productAdd.couldNotRead')),
          'error',
        );
        return;
      }
      setNeedsPackPhoto(false);
      setForm((current) => applyEnrichment(current, response.data, touchedRef.current));
      setMessage(enrichSuccessMessage(response.data, t, { editing: isEditing }));
    } catch (err) {
      setMessage(authErrorMessage(err, t('opsApp.shop.productAdd.smartLookupFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function analyzePackaging() {
    if (!businessId) return;
    const front = form.images[0] || undefined;
    const back = form.images[1] || undefined;
    if (!front && !back) {
      setMessage(t('shop.products.uploadPhotoFirst'), 'error');
      return;
    }
    const payload = {
      front,
      back,
      hint: nameLookup || form.name || form.brand,
    };
    setBusy(true);
    setMessage(null);
    try {
      const freshClient = await getFreshClient();
      const response = await freshClient.shop.analyzePackaging({
        business_id: businessId,
        front_image_url: payload.front,
        back_image_url: payload.back,
        hint: payload.hint,
        async_mode: true,
      });
      const job = response.data;
      if (job.status === 'done' && job.result) {
        setForm((current) => applyEnrichment(current, job.result!, touchedRef.current));
        setMessage(job.result.message || t('shop.products.fieldsUpdated'));
      } else {
        await pollAnalysis(job.job_id, payload);
      }
    } catch (err) {
      setMessage(authErrorMessage(err, t('shop.products.analyseFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function lookupByName() {
    if (!client || !businessId || !nameLookup.trim()) return;
    setBusy(true);
    setMessage(null);
    setNeedsPackPhoto(false);
    const trimmed = nameLookup.trim();
    const looksLikeBarcode = /^\d{8}$|^\d{12,14}$/.test(trimmed);
    try {
      const response = await client.shop.enrichBarcode({
        business_id: businessId,
        product_id: productId || undefined,
        ...(looksLikeBarcode ? { code: trimmed } : { query: trimmed }),
        use_smart_lookup: true,
      });
      if (!response.data.found) {
        setNeedsPackPhoto(Boolean(response.data.needs_pack_photo));
        if (looksLikeBarcode) {
          setForm((current) => ({ ...current, barcode: trimmed }));
          touchedRef.current.add('barcode');
        }
        setMessage(enrichMissMessage(response.data, t('opsApp.shop.productAdd.noMatchSearch')), 'error');
        return;
      }
      setNeedsPackPhoto(false);
      setForm((current) => {
        if (!looksLikeBarcode) {
          return applyEnrichment(current, response.data, touchedRef.current);
        }
        const codeChanged = Boolean(current.barcode.trim() && current.barcode.trim() !== trimmed);
        if (codeChanged) {
          clearIdentityTouched(touchedRef.current, { keepPriceStock: isEditing });
          setPreviews(emptyProductImageSlots());
        }
        const base = codeChanged
          ? wipeIdentity(current, trimmed, { keepPriceStock: isEditing })
          : { ...current, barcode: trimmed };
        return applyEnrichment(base, response.data, touchedRef.current, {
          replaceIdentity: codeChanged || !current.name.trim(),
        });
      });
      if (looksLikeBarcode) touchedRef.current.add('barcode');
      setMessage(enrichSuccessMessage(response.data, t));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('opsApp.shop.productAdd.searchFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!client || !businessId) return;
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = t('opsApp.shop.productAdd.required', { label: t('shop.products.fields.name') });
    const priceValue = Number(form.price.trim());
    if (!form.price.trim()) nextErrors.price = t('opsApp.shop.productAdd.required', { label: t('shop.products.fields.price') });
    else if (!Number.isFinite(priceValue) || priceValue < 0) nextErrors.price = t('opsApp.shop.productAdd.invalidPrice');
    if (!form.status.trim()) nextErrors.status = t('opsApp.shop.productAdd.required', { label: t('shop.products.status') });
    if (!form.currency.trim()) nextErrors.currency = t('opsApp.shop.productAdd.required', { label: t('shop.products.currency') });
    if (form.category === 'other' && !form.category_other.trim()) {
      nextErrors.category_other = t('opsApp.shop.productAdd.required', { label: t('shop.products.newCategoryName') });
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setMessage(null);
    let categorySlug = form.category;
    if (form.category === 'other' || (form.category_other.trim() && form.category === 'other')) {
      try {
        const created = await client.shop.ensureProductCategory({
          business_id: businessId,
          label: form.category_other.trim(),
        });
        categorySlug = created.data.slug;
        setCategoryOptions((current) => {
          if (current.some((item) => item.slug === categorySlug)) return current;
          const withoutOther = current.filter((item) => item.slug !== 'other');
          const otherOption = current.find((item) => item.slug === 'other');
          // Keep Other last after a custom category is promoted into the master list.
          return otherOption
            ? [...withoutOther, created.data, otherOption]
            : [...withoutOther, created.data];
        });
      } catch (err) {
        setBusy(false);
        setMessage(authErrorMessage(err, t('shop.products.categoryCreateFailed')), 'error');
        return;
      }
    }
    const gallery = normalizeProductGallery(form.images.map(toStoredProductImageUrl));
    const payload = {
      business_id: businessId,
      sku: form.sku,
      name: form.name.trim(),
      brand: form.brand,
      description: form.description,
      details_html: form.details_html,
      price: form.price,
      purchase_price: form.purchase_price,
      tax_rate: form.tax_rate,
      gst_rate: form.tax_rate,
      hsn_sac: form.hsn_sac.trim(),
      currency: form.currency,
      stock_on_hand: form.stock_on_hand,
      ...(godownId ? { godown_id: godownId } : {}),
      low_stock_threshold: form.low_stock_threshold,
      pack_size: form.pack_size,
      ...(gallery[0] ? { image_url: gallery[0] } : { image_url: '' }),
      status: form.status,
      ...(categorySlug ? { category: categorySlug } : { category: '' }),
      metadata: {
        images: buildProductImageMetadata(gallery),
        tax_inclusive: form.tax_inclusive === 'included',
      },
      barcodes: form.barcode
        ? [{ code: form.barcode.trim(), barcode_type: form.barcode_type, is_primary: true }]
        : [],
    };
    try {
      if (productId) {
        await client.shop.patchProduct(productId, payload);
        toast.push(t('shop.products.saved'), 'success');
        setTimeout(() => navigation.goBack(), 250);
      } else {
        const response = await client.shop.createProduct(payload);
        toast.push(t('shop.products.added'), 'success');
        // Let the toast mount on the root host before this screen unmounts.
        setTimeout(() => {
          if (route.params?.returnTo === 'pos') {
            queuePosAddProductId(response.data.id);
            navigation.dispatch((state) => {
              const posIndex = state.routes.findIndex((entry) => entry.name === 'ShopPos');
              if (posIndex >= 0) {
                return CommonActions.reset({
                  ...state,
                  routes: state.routes.slice(0, posIndex + 1),
                  index: posIndex,
                });
              }
              return CommonActions.navigate({ name: 'ShopPos' });
            });
          } else {
            navigation.goBack();
          }
        }, 250);
      }
    } catch (err) {
      const saveError = err instanceof Error ? err.message : t('shop.products.saveFailed');
      setMessage(saveError, 'error');
      toast.push(saveError, 'error');
    } finally {
      setBusy(false);
    }
  }

  const imageSlots = ensureProductImageSlots(form.images);

  function openScanner() {
    navigation.navigate('BarcodeScanner', {
      target: 'addProduct',
      ...(productId ? { productId } : {}),
    });
  }

  return (
    <>
    <ProductImageCropModal
      uri={cropPending?.asset.uri ?? null}
      visible={Boolean(cropPending)}
      onCancel={cancelCrop}
      canRemoveBackground={canRemoveBackground}
      onConfirm={(cropped, options) => void confirmCrop(cropped, options)}
    />
    <ImageLightbox
      uri={lightbox?.uri ?? null}
      visible={Boolean(lightbox)}
      title={lightbox ? productImageSlotLabel(lightbox.index, t) : t('opsApp.shop.productAdd.photo')}
      replaceLabel={t('opsApp.shop.productAdd.restartPhoto')}
      onClose={() => setLightbox(null)}
      onReplace={
        lightbox
          ? () => {
              const index = lightbox.index;
              setLightbox(null);
              void captureAt(index);
            }
          : undefined
      }
    />
    <FormScreen
      footer={
        <Button
          label={busy ? t('opsApp.shop.productAdd.working') : isEditing ? t('shop.products.updateProduct') : t('shop.products.saveProduct')}
          loading={busy}
          fullWidth
          size="lg"
          disabled={busy || analyzing}
          onPress={() => void save()}
        />
      }
    >
      <FormHero
        title={isEditing ? t('shop.products.editTitle') : t('opsApp.shop.productAdd.newProduct')}
        subtitle={
          isEditing
            ? t('opsApp.shop.productAdd.editSubtitle')
            : t('opsApp.shop.productAdd.addSubtitle')
        }
      />

      {message ? (
        <FormAlert
          message={message}
          tone={messageTone}
        />
      ) : null}

      <FormSection
        title={t('opsApp.shop.productAdd.photos')}
        subtitle={t('opsApp.shop.productAdd.photosSubtitle', { max: MAX_PRODUCT_IMAGES })}
      >
        <View style={styles.photoGrid}>
          {imageSlots.map((url, index) => {
            const preview = previews[index] || url;
            const isPrimary = index === 0;
            const displayUri = preview ? resolveMediaUrl(preview) || preview : '';
            return (
              <View key={index} style={[styles.photoCard, isPrimary && styles.photoCardPrimary]}>
                <Pressable
                  onPress={() => {
                    if (displayUri) {
                      setLightbox({ index, uri: displayUri });
                      return;
                    }
                    void captureAt(index);
                  }}
                  disabled={busy}
                  style={styles.photoHit}
                >
                  {preview ? (
                    <RemoteImage
                      uri={displayUri}
                      style={[styles.photo, isPrimary && styles.photoPrimary]}
                    />
                  ) : (
                    <View style={[styles.photoPlaceholder, isPrimary && styles.photoPrimary]}>
                      <Feather name={isPrimary ? 'camera' : 'plus'} size={20} color={colors.mutedForeground} />
                      <Text style={styles.photoLabel}>
                        {isPrimary ? t('opsApp.shop.productAdd.addPrimaryPhoto') : t('shop.products.slotN', { n: index + 1 })}
                      </Text>
                    </View>
                  )}
                </Pressable>
                {url || previews[index] ? (
                  <>
                    <Pressable
                      onPress={() => void captureAt(index)}
                      disabled={busy}
                      style={styles.photoRestart}
                      accessibilityLabel={t('opsApp.shop.productAdd.restartSlot', { label: productImageSlotLabel(index, t) })}
                    >
                      <Feather name="refresh-cw" size={13} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => removeAt(index)}
                      style={styles.photoRemove}
                      accessibilityLabel={t('opsApp.shop.productAdd.removeSlot', { label: productImageSlotLabel(index, t) })}
                    >
                      <Feather name="x" size={14} color="#fff" />
                    </Pressable>
                  </>
                ) : null}
                {isPrimary && (url || previews[index]) ? (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>{t('opsApp.shop.productAdd.primaryBadge')}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Button
          label={analyzing ? t('shop.products.analysing') : t('opsApp.shop.productAdd.fillFromPhotos')}
          variant="soft"
          icon="zap"
          disabled={busy || analyzing || (!form.images[0] && !form.images[1])}
          onPress={() => void analyzePackaging()}
        />
        {form.images[0] ? (
          <Button
            label={busy ? t('opsApp.shop.productAdd.readingPack') : t('opsApp.shop.productAdd.smartFillWallet')}
            variant="primary"
            icon="camera"
            disabled={busy || analyzing}
            onPress={() => void runSmartLookupFromPhoto()}
          />
        ) : needsPackPhoto ? (
          <Text style={styles.hint}>{t('opsApp.shop.productAdd.needPackPhotoHint')}</Text>
        ) : null}
      </FormSection>

      <FormSection
        title={t('opsApp.shop.productAdd.lookup')}
        subtitle={t('opsApp.shop.productAdd.lookupSubtitle')}
      >
        <View style={styles.lookupRow}>
          <View style={styles.lookupField}>
            <Input
              label={t('opsApp.shop.productAdd.searchLabel')}
              value={nameLookup}
              onChangeText={setNameLookup}
              placeholder={t('opsApp.shop.productAdd.searchPlaceholder')}
              returnKeyType="search"
              onSubmitEditing={() => void lookupByName()}
            />
          </View>
          <Pressable
            style={styles.iconAction}
            onPress={() => void lookupByName()}
            disabled={busy}
            accessibilityLabel={t('opsApp.shop.productAdd.searchCatalog')}
          >
            <Feather name="search" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <Button label={t('opsApp.shop.productAdd.scanBarcode')} variant="outline" icon="maximize" onPress={openScanner} />
      </FormSection>

      {busy || analyzing ? <ActivityIndicator color={colors.primary} /> : null}

      <FormSection title={t('shop.products.defaultName')} subtitle={t('opsApp.shop.productAdd.productSubtitle')}>
        <Input
          label={t('shop.products.fields.name')}
          required
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          placeholder={t('shop.products.fields.name')}
          error={fieldErrors.name}
        />
        <FieldRow>
          <Input label={t('shop.products.fields.brand')} optional value={form.brand} onChangeText={(value) => setField('brand', value)} />
          <Input label={t('shop.products.fields.sku')} optional value={form.sku} onChangeText={(value) => setField('sku', value)} />
        </FieldRow>
        <Input
          label={t('shop.products.fields.pack_size')}
          optional
          value={form.pack_size}
          onChangeText={(value) => setField('pack_size', value)}
          placeholder={t('shop.invoiceScan.packSizePlaceholder')}
        />
        <SelectField
          label={t('shop.products.status')}
          required
          value={form.status}
          options={[
            { value: 'active', label: t('shop.products.statuses.active') },
            { value: 'draft', label: t('shop.products.statuses.draft') },
            { value: 'inactive', label: t('shop.products.statuses.inactive') },
            { value: 'archived', label: t('shop.products.statuses.archived') },
          ]}
          onChange={(value) => setField('status', value)}
          searchable={false}
          error={fieldErrors.status}
        />
        <View style={styles.chipBlock}>
          <FieldLabel label={t('shop.products.category')} optional />
          <View style={styles.chips}>
            {categoryOptions.map((item) => (
              <Chip
                key={item.slug}
                label={item.label}
                active={form.category === item.slug}
                onPress={() => {
                  const next = form.category === item.slug ? '' : item.slug;
                  setForm((current) => ({
                    ...current,
                    category: next,
                    category_other: next === 'other' ? current.category_other : '',
                  }));
                  touchedRef.current.add('category');
                }}
              />
            ))}
            {!categoryOptions.some((item) => item.slug === 'other') ? (
              <Chip
                label={t('shop.products.other')}
                active={form.category === 'other'}
                onPress={() => {
                  setForm((current) => ({
                    ...current,
                    category: current.category === 'other' ? '' : 'other',
                    category_other: current.category === 'other' ? '' : current.category_other,
                  }));
                  touchedRef.current.add('category');
                }}
              />
            ) : null}
          </View>
          {form.category === 'other' ? (
            <Input
              label={t('shop.products.newCategoryName')}
              required
              value={form.category_other}
              onChangeText={(value) => setField('category_other', value)}
              placeholder={t('shop.products.categoryPlaceholder')}
              error={fieldErrors.category_other}
            />
          ) : null}
        </View>
      </FormSection>

      <FormSection title={t('opsApp.shop.productAdd.priceTax')}>
        <FieldRow>
          <Input
            label={t('shop.products.fields.price')}
            required
            value={form.price}
            onChangeText={(value) => setField('price', value)}
            keyboardType="decimal-pad"
            error={fieldErrors.price}
          />
          <Input
            label={t('shop.products.fields.purchase_price')}
            optional
            value={form.purchase_price}
            onChangeText={(value) => setField('purchase_price', value)}
            keyboardType="decimal-pad"
            hint={t('opsApp.shop.productAdd.purchaseHint')}
          />
        </FieldRow>
        <FieldRow>
          <Input
            label={t('shop.products.gstPercent')}
            optional
            value={form.tax_rate}
            onChangeText={(value) => setField('tax_rate', value)}
            keyboardType="decimal-pad"
          />
          <Input
            label={t('shop.invoiceScan.hsn')}
            optional
            value={form.hsn_sac}
            onChangeText={(value) => setField('hsn_sac', value)}
            hint={t('opsApp.shop.productAdd.hsnHint')}
          />
        </FieldRow>
        <SelectField
          label={t('shop.products.currency')}
          required
          value={form.currency}
          options={
            form.currency && !CURRENCIES.some((option) => option.value === form.currency)
              ? [...CURRENCIES, { value: form.currency, label: form.currency }]
              : CURRENCIES
          }
          onChange={(value) => setField('currency', value)}
          error={fieldErrors.currency}
        />
        <View style={styles.chipBlock}>
          <FieldLabel label={t('opsApp.shop.productAdd.gstOnPrice')} />
          <View style={styles.chips}>
            <Chip
              label={t('shop.invoiceScan.gstExcluded')}
              active={form.tax_inclusive === 'excluded'}
              onPress={() => setField('tax_inclusive', 'excluded')}
            />
            <Chip
              label={t('shop.invoiceScan.gstIncluded')}
              active={form.tax_inclusive === 'included'}
              onPress={() => setField('tax_inclusive', 'included')}
            />
          </View>
          <Text style={styles.hint}>
            {form.tax_inclusive === 'included'
              ? t('opsApp.shop.productAdd.gstIncludedHint')
              : t('opsApp.shop.productAdd.gstExcludedHint')}
          </Text>
        </View>
      </FormSection>

      <FormSection title={t('shop.products.stock')}>
        <FieldRow>
          <Input
            label={t('shop.products.fields.stock_on_hand')}
            optional
            value={form.stock_on_hand}
            onChangeText={(value) => setField('stock_on_hand', value)}
            keyboardType="decimal-pad"
          />
          <Input
            label={t('shop.products.fields.low_stock_threshold')}
            optional
            value={form.low_stock_threshold}
            onChangeText={(value) => setField('low_stock_threshold', value)}
            keyboardType="decimal-pad"
          />
        </FieldRow>
        {showGodowns && godowns.length ? (
          <SelectField
            label={isEditing ? t('shop.products.godownForChanges') : t('shop.products.stockGodown')}
            optional
            value={godownId}
            options={godowns.map((godown) => ({
              value: godown.id,
              label: godown.is_default ? t('shop.products.godownDefault', { name: godown.name }) : godown.name,
            }))}
            onChange={setGodownId}
            placeholder={t('opsApp.shop.productAdd.selectGodown')}
          />
        ) : null}
      </FormSection>

      <FormSection title={t('shop.addMany.columns.barcode')} subtitle={t('opsApp.shop.productAdd.barcodeSubtitle')}>
        <View style={styles.lookupRow}>
          <View style={styles.lookupField}>
            <Input
              label={t('shop.products.barcodeRfid')}
              optional
              value={form.barcode}
              onChangeText={(value) => setField('barcode', value)}
              placeholder={t('shop.products.scanOrType')}
              autoCapitalize="none"
            />
          </View>
          <Pressable style={styles.iconAction} onPress={openScanner} accessibilityLabel={t('shop.products.scanWithCamera')}>
            <Feather name="camera" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <View style={styles.chipBlock}>
          <FieldLabel label={t('shop.products.barcodeType')} />
          <View style={styles.chips}>
            {([
              { value: 'manufacturer', label: t('shop.products.barcodeTypes.manufacturer') },
              { value: 'internal', label: t('shop.products.barcodeTypes.internal') },
              { value: 'rfid_epc', label: t('shop.products.barcodeTypes.rfid_epc') },
            ] as const).map((item) => (
              <Chip
                key={item.value}
                label={item.label}
                active={form.barcode_type === item.value}
                onPress={() => setField('barcode_type', item.value)}
              />
            ))}
          </View>
        </View>
      </FormSection>

      <FormSection title={t('shop.invoiceScan.description')}>
        <Input
          label={t('shop.products.descriptionLabel')}
          optional
          value={form.description}
          onChangeText={(value) => setField('description', value)}
          multiline
        />
        <HtmlEditorField
          label={t('shop.invoiceScan.productDetails')}
          optional
          value={form.details_html}
          onChange={(value) => setField('details_html', value)}
        />
      </FormSection>
    </FormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCard: {
    width: '47%',
    flexGrow: 1,
    position: 'relative',
  },
  photoCardPrimary: {
    width: '100%',
  },
  photoHit: { borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', height: 108, backgroundColor: colors.muted },
  photoPrimary: { height: 188 },
  photoPlaceholder: {
    height: 108,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: 8,
  },
  photoLabel: { color: colors.mutedForeground, fontWeight: '600', textAlign: 'center', fontSize: 12 },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRestart: {
    position: 'absolute',
    top: 8,
    right: 42,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  primaryBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '700' },
  lookupRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  lookupField: { flex: 1, minWidth: 0 },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  chipBlock: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
});
