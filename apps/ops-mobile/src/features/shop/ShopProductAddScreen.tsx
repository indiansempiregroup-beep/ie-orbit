import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopBarcodeEnrichment, ShopGodown, ShopProduct } from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES, guessShopProductCategory } from '@ie-orbit/sdk';
import type { IEOrbitClient } from '@ie-orbit/sdk';
import { createScopedClient } from '../../api/client';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadProductImage } from '../../api/media';
import { FormScreen } from '../../components/FormScreen';
import { HtmlEditorField } from '../../components/HtmlEditorField';
import { RemoteImage } from '../../components/RemoteImage';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/SelectField';
import { CURRENCIES } from '../../constants/options';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, fonts, spacing } from '../../theme/tokens';
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
  tax_rate: '0',
  tax_inclusive: 'excluded' as 'included' | 'excluded',
  currency: 'INR',
  stock_on_hand: '0',
  low_stock_threshold: '0',
  pack_size: '',
  images: emptyProductImageSlots(),
  barcode: '',
  barcode_type: 'manufacturer' as string,
  status: 'active',
  category: '',
};

type FormState = typeof emptyForm;
type FormKey = keyof FormState;

const DEFAULTS = new Set(['0', 'INR', 'active', 'manufacturer', '']);

function applyEnrichment(
  current: FormState,
  data: ShopBarcodeEnrichment,
  touched: Set<FormKey>,
): FormState {
  const fill = (key: FormKey, value?: string | null) => {
    if (!value) return current[key];
    if (touched.has(key)) return current[key];
    const existing = String(current[key] ?? '');
    if (existing && !DEFAULTS.has(existing)) return existing;
    return value;
  };

  const nextImages = ensureProductImageSlots(
    normalizeProductGallery([
      data.front_image_url || current.images[0],
      data.back_image_url || current.images[1],
      ...current.images.slice(2),
      data.local_image_url,
      data.image_url,
    ]),
  );

  return {
    ...current,
    sku: fill('sku', data.sku || data.code),
    name: fill('name', data.name),
    brand: fill('brand', data.brand),
    description: fill('description', data.description),
    pack_size: fill('pack_size', data.pack_size || data.serving_size),
    images: nextImages,
    barcode: fill('barcode', data.code),
    barcode_type: data.code && !touched.has('barcode_type') ? 'manufacturer' : current.barcode_type,
    category: fill('category', guessShopProductCategory(data.categories) || undefined),
  };
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
    tax_rate: String(product.tax_rate ?? product.gst_rate ?? '0'),
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
  };
}

export function ShopProductAddScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, tenantId } = useWorkspace();
  const { token, ensureFreshAccess } = useAuth();
  const { has } = usePlanFeatures();
  const showGodowns = has(PlanFeature.shopieBooksGodowns);
  const productId = route.params?.productId;
  const isEditing = Boolean(productId);
  const [form, setForm] = useState(emptyForm);
  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [godownId, setGodownId] = useState('');
  const [nameLookup, setNameLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>(emptyProductImageSlots());
  const touchedRef = useRef<Set<FormKey>>(new Set());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit product' : 'Add product' });
  }, [isEditing, navigation]);

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
          setMessage('No product photos found for this item yet. Add a primary image.');
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to load product');
      } finally {
        setBusy(false);
      }
    })();
  }, [client, productId]);

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
    const code = route.params?.enrichCode;
    if (!code || !client) return;
    void (async () => {
      setBusy(true);
      setMessage(null);
      try {
        const response = await client.shop.enrichBarcode({ code });
        // Always apply the scanned barcode; keep other fields via enrichment rules.
        setForm((current) => ({
          ...applyEnrichment(current, response.data, touchedRef.current),
          barcode: code,
        }));
        touchedRef.current.add('barcode');
        setMessage(
          response.data.found
            ? `Barcode updated from ${response.data.source ?? 'catalog'}.`
            : 'Barcode updated — no online match for extra details.',
        );
      } catch (err) {
        setForm((current) => ({ ...current, barcode: code }));
        touchedRef.current.add('barcode');
        setMessage(err instanceof Error ? err.message : 'Barcode captured.');
      } finally {
        setBusy(false);
        navigation.setParams({ enrichCode: undefined });
      }
    })();
  }, [client, navigation, route.params?.enrichCode]);

  function markTouched(key: FormKey) {
    touchedRef.current.add(key);
  }

  function setField(key: FormKey, value: string) {
    markTouched(key);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function authErrorMessage(err: unknown, fallback: string) {
    const text = err instanceof Error ? err.message : fallback;
    if (/token not valid|token_not_valid|unauthorized|401|authentication/i.test(text)) {
      return 'Your session expired. Please sign out and sign in again, then retry.';
    }
    return text || fallback;
  }

  async function uploadAsset(index: number, asset: ImagePickerAsset) {
    const access = (await ensureFreshAccess()) || token;
    if (!businessId || !tenantId || !access) {
      throw new Error('Workspace is not ready. Please sign in again.');
    }
    const uploaded = await uploadProductImage({
      token: access,
      tenantId,
      businessId,
      asset,
      productName: productImageSlotLabel(index),
    });
    const imageUrl = uploaded.public_url || uploaded.private_url || '';
    if (!imageUrl) throw new Error('Photo uploaded but no URL was returned.');
    return imageUrl;
  }

  async function captureAt(index: number) {
    // RN Alert.alert buttons never fire on web, and a delayed picker call is
    // blocked by the browser (file inputs must open from a user gesture).
    if (Platform.OS === 'web') {
      await pickAt(index, 'library');
      return;
    }
    Alert.alert(productImageSlotLabel(index), 'Choose a source', [
      {
        text: 'Camera',
        onPress: () => void pickAt(index, 'camera'),
      },
      {
        text: 'Gallery',
        onPress: () => void pickAt(index, 'library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickAt(index: number, source: 'camera' | 'library') {
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setMessage('Camera permission is required to photograph the product.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setMessage('Photo library permission is required.');
          return;
        }
      }
    }

    const pickerOptions = {
      mediaTypes: ['images'] as const,
      quality: 0.85,
      ...(Platform.OS === 'web' ? {} : { allowsEditing: true as const, aspect: [3, 4] as [number, number] }),
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

    setBusy(true);
    setMessage(null);
    try {
      const imageUrl = await uploadAsset(index, asset);
      const stored = toStoredProductImageUrl(imageUrl) || imageUrl;
      setForm((current) => {
        const next = ensureProductImageSlots(current.images);
        next[index] = stored;
        return { ...current, images: next };
      });
      setMessage(`${productImageSlotLabel(index)} uploaded.`);
    } catch (err) {
      setMessage(authErrorMessage(err, 'Unable to upload photo'));
    } finally {
      setBusy(false);
    }
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
      throw new Error('Your session expired. Please sign out and sign in again, then retry.');
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
    setMessage('Analysing packaging in the background…');

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
                  setMessage(sync.data.result.message || 'Fields updated from packaging photos.');
                } else {
                  setMessage(sync.data.error || 'Analysis timed out. Try again or scan the barcode.');
                }
              } catch (fallbackError) {
                setAnalyzing(false);
                setMessage(authErrorMessage(fallbackError, 'Analysis timed out. Try again or scan the barcode.'));
              }
            }
            return;
          }
          if (pollTimer.current) clearInterval(pollTimer.current);
          setAnalyzing(false);
          if (job.status === 'failed') {
            setMessage(job.error || 'Packaging analysis failed.');
            return;
          }
          if (job.result) {
            setForm((current) => applyEnrichment(current, job.result!, touchedRef.current));
            setMessage(job.result.message || 'Fields updated from packaging photos.');
          }
        } catch (err) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setAnalyzing(false);
          setMessage(authErrorMessage(err, 'Unable to check analysis status'));
        }
      })();
    }, 1500);
  }

  async function analyzePackaging() {
    if (!businessId) return;
    const front = form.images[0] || undefined;
    const back = form.images[1] || undefined;
    if (!front && !back) {
      setMessage('Capture photo 1 (front) and/or photo 2 (back) first.');
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
        setMessage(job.result.message || 'Fields updated from packaging photos.');
      } else {
        await pollAnalysis(job.job_id, payload);
      }
    } catch (err) {
      setMessage(authErrorMessage(err, 'Unable to start packaging analysis'));
    } finally {
      setBusy(false);
    }
  }

  async function lookupByName() {
    if (!client || !nameLookup.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await client.shop.enrichBarcode({ query: nameLookup.trim() });
      if (!response.data.found) {
        setMessage(response.data.message || 'No online match for that name.');
        return;
      }
      setForm((current) => applyEnrichment(current, response.data, touchedRef.current));
      setMessage(`Prefill from ${response.data.source ?? 'catalog'}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!client || !businessId || !form.name.trim()) return;
    setBusy(true);
    setMessage(null);
    const gallery = normalizeProductGallery(form.images.map(toStoredProductImageUrl));
    const payload = {
      business_id: businessId,
      sku: form.sku,
      name: form.name.trim(),
      brand: form.brand,
      description: form.description,
      details_html: form.details_html,
      price: form.price,
      tax_rate: form.tax_rate,
      gst_rate: form.tax_rate,
      currency: form.currency,
      stock_on_hand: form.stock_on_hand,
      ...(godownId ? { godown_id: godownId } : {}),
      low_stock_threshold: form.low_stock_threshold,
      pack_size: form.pack_size,
      ...(gallery[0] ? { image_url: gallery[0] } : { image_url: '' }),
      status: form.status,
      ...(form.category ? { category: form.category } : { category: '' }),
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
        toast.push('Product updated.', 'success');
        setTimeout(() => navigation.goBack(), 250);
      } else {
        const response = await client.shop.createProduct(payload);
        toast.push('Product saved.', 'success');
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
      setMessage(err instanceof Error ? err.message : 'Unable to save product');
      toast.push(err instanceof Error ? err.message : 'Unable to save product', 'error');
    } finally {
      setBusy(false);
    }
  }

  const imageSlots = ensureProductImageSlots(form.images);

  return (
    <FormScreen
      footer={
        <Button
          label={busy ? 'Working…' : isEditing ? 'Update product' : 'Save product'}
          loading={busy}
          fullWidth
          size="lg"
          disabled={busy || analyzing}
          onPress={() => void save()}
        />
      }
    >
      <Text style={styles.helper}>
        Upload up to {MAX_PRODUCT_IMAGES} photos. The first photo is the primary image on product
        cards. Photo 1/2 can also drive packaging analysis. Scan the barcode for the best match —
        always review suggested fields before saving.
      </Text>

      <View style={styles.photoGrid}>
        {imageSlots.map((url, index) => {
          const preview = previews[index] || url;
          return (
            <View key={index} style={styles.photoCard}>
              <Pressable onPress={() => void captureAt(index)} disabled={busy}>
                {preview ? (
                  <RemoteImage uri={resolveMediaUrl(preview) || preview} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Feather name="camera" size={20} color={colors.mutedForeground} />
                    <Text style={styles.photoLabel}>{productImageSlotLabel(index)}</Text>
                  </View>
                )}
              </Pressable>
              <Text style={styles.photoCaption}>{productImageSlotLabel(index)}</Text>
              {url || previews[index] ? (
                <Pressable onPress={() => removeAt(index)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.actionSecondary]}
          onPress={() =>
            navigation.navigate('BarcodeScanner', {
              target: 'addProduct',
              ...(productId ? { productId } : {}),
            })
          }
        >
          <Feather name="maximize" size={18} color={colors.primary} />
          <Text style={styles.actionSecondaryText}>Scan barcode</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => void analyzePackaging()}
          disabled={busy || analyzing || (!form.images[0] && !form.images[1])}
        >
          <Feather name="zap" size={18} color="#fff" />
          <Text style={styles.actionText}>{analyzing ? 'Analysing…' : 'Analyse packaging'}</Text>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Search by product name</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={nameLookup}
            onChangeText={setNameLookup}
            placeholder="e.g. Pedigree Adult 3kg"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => void lookupByName()}
            returnKeyType="search"
          />
          <Pressable style={styles.lookupBtn} onPress={() => void lookupByName()} disabled={busy}>
            <Feather name="search" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {busy || analyzing ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
      ) : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}

      {(
        [
          ['name', 'Product name'],
          ['brand', 'Brand'],
          ['sku', 'SKU'],
          ['price', 'Price'],
          ['tax_rate', 'GST %'],
          ['stock_on_hand', 'Stock on hand'],
          ['low_stock_threshold', 'Low stock alert'],
          ['pack_size', 'Pack size / quantity'],
        ] as const
      ).map(([key, label]) => (
        <View key={key} style={styles.field}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <TextInput
            style={styles.input}
            value={form[key]}
            onChangeText={(value) => setField(key, value)}
            placeholderTextColor={colors.mutedForeground}
            keyboardType={
              key === 'price' || key === 'tax_rate' || key === 'stock_on_hand' || key === 'low_stock_threshold'
                ? 'decimal-pad'
                : 'default'
            }
          />
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Barcode / RFID EPC</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={form.barcode}
            onChangeText={(value) => setField('barcode', value)}
            placeholder="Scan or type barcode"
            placeholderTextColor={colors.mutedForeground}
          />
          <Pressable
            style={styles.lookupBtn}
            onPress={() =>
              navigation.navigate('BarcodeScanner', {
                target: 'addProduct',
                ...(productId ? { productId } : {}),
              })
            }
            accessibilityLabel="Scan barcode with camera"
          >
            <Feather name="camera" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {showGodowns && godowns.length ? (
        <SelectField
          label={isEditing ? 'Godown for stock changes' : 'Stock godown'}
          value={godownId}
          options={godowns.map((godown) => ({
            value: godown.id,
            label: godown.is_default ? `${godown.name} (default)` : godown.name,
          }))}
          onChange={setGodownId}
          placeholder="Select godown"
        />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>GST on price</Text>
        <View style={styles.chips}>
          <Pressable
            style={[styles.chip, form.tax_inclusive === 'excluded' && styles.chipActive]}
            onPress={() => setField('tax_inclusive', 'excluded')}
          >
            <Text style={styles.chipText}>GST excluded</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, form.tax_inclusive === 'included' && styles.chipActive]}
            onPress={() => setField('tax_inclusive', 'included')}
          >
            <Text style={styles.chipText}>GST included</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>
          {form.tax_inclusive === 'included'
            ? 'Selling price already includes GST. POS will split tax from the price.'
            : 'GST is added on top of the selling price at checkout.'}
        </Text>
      </View>

      <SelectField
        label="Currency"
        value={form.currency}
        options={
          form.currency && !CURRENCIES.some((option) => option.value === form.currency)
            ? [...CURRENCIES, { value: form.currency, label: form.currency }]
            : CURRENCIES
        }
        onChange={(value) => setField('currency', value)}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chips}>
          {SHOP_PRODUCT_CATEGORIES.map((item) => (
            <Pressable
              key={item.value}
              style={[styles.chip, form.category === item.value && styles.chipActive]}
              onPress={() => setField('category', item.value)}
            >
              <Text style={styles.chipText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Description / ingredients</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.description}
          onChangeText={(value) => setField('description', value)}
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
      </View>

      <HtmlEditorField
        label="Product details"
        value={form.details_html}
        onChange={(value) => setField('details_html', value)}
      />

      <Text style={styles.fieldLabel}>Barcode type</Text>
      <View style={styles.chips}>
        {(['manufacturer', 'internal', 'rfid_epc'] as const).map((type) => (
          <Pressable
            key={type}
            style={[styles.chip, form.barcode_type === type && styles.chipActive]}
            onPress={() => setField('barcode_type', type)}
          >
            <Text style={styles.chipText}>{type}</Text>
          </Pressable>
        ))}
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  helper: { color: colors.mutedForeground, lineHeight: 20 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoCard: { width: '47%' },
  photo: { width: '100%', height: 140, borderRadius: 12, backgroundColor: colors.muted },
  photoPlaceholder: {
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
  },
  photoLabel: { color: colors.mutedForeground, fontWeight: '600', textAlign: 'center', fontSize: 12 },
  photoCaption: {
    marginTop: 6,
    textAlign: 'center',
    color: colors.foreground,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  removeBtn: { alignItems: 'center', marginTop: 4 },
  removeText: { color: colors.destructive, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionText: { color: '#fff', fontWeight: '600' },
  actionSecondaryText: { color: colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  lookupBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  field: {},
  fieldLabel: {
    marginBottom: 6,
    color: colors.foreground,
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.muted },
  chipText: { color: colors.foreground, fontSize: 13 },
  meta: { color: colors.mutedForeground },
});
