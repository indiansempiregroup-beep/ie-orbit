import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SHOP_PRODUCT_CATEGORIES, type ShopInvoiceScanDraft, type ShopInvoiceScanLine } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FieldRow } from '../../components/ui/FieldRow';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { ImageLightbox } from '../../components/ImageLightbox';
import { RemoteImage } from '../../components/RemoteImage';
import { CURRENCIES } from '../../constants/options';
import { uploadMedia, uploadProductImage } from '../../api/media';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { SmartLookupUpiPaySheet } from '../settings/SmartLookupUpiPaySheet';
import { applyEnrichmentToScanLine, applyShopProductToScanLine, looksLikeBarcode } from './invoiceScanLines';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { formatMoney } from './posPayment';

function formatWallet(paise?: number | null, currency = 'INR') {
  return formatMoney(Number(paise || 0) / 100, currency);
}

function photoUri(url?: string | null) {
  return resolveMediaUrl(url) || '';
}

const PRODUCT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

function stockAfter(line: ShopInvoiceScanLine) {
  const now = Number(line.stock_on_hand || 0);
  const qty = Number(line.qty || 0);
  if (Number.isNaN(now) || Number.isNaN(qty)) return line.qty || '0';
  return String(now + qty);
}

export function ShopInvoiceScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopInvoiceScan'>>();
  const client = useOpsClient();
  const toast = useToast();
  const { token, ensureFreshAccess } = useAuth();
  const { businessId, tenantId } = useWorkspace();

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [draft, setDraft] = useState<ShopInvoiceScanDraft | null>(null);
  const [chargedPaise, setChargedPaise] = useState(0);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const [chargeCurrency, setChargeCurrency] = useState('INR');
  const [chargeMessage, setChargeMessage] = useState('');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [fetchingIndex, setFetchingIndex] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const readyLines = useMemo(
    () => (draft?.lines || []).filter((line) => !line.skip && (line.product_id || line.create || line.name)),
    [draft],
  );

  async function pickAndUpload(source: 'camera' | 'library') {
    if (!token || !tenantId || !businessId) return;
    if (Platform.OS !== 'web') {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          source === 'camera' ? 'Allow camera access to photograph the bill.' : 'Allow photo library access.',
        );
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            allowsMultipleSelection: true,
            selectionLimit: 6,
          });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    try {
      const access = (await ensureFreshAccess()) || token;
      const uploaded: string[] = [];
      for (const asset of result.assets.slice(0, 6) as ImagePickerAsset[]) {
        const media = await uploadMedia({
          token: access,
          tenantId,
          businessId,
          asset,
          folderType: 'documents',
          tags: ['shop', 'invoice', 'scan'],
          displayName: 'Vendor invoice',
        });
        const url = media.public_url || media.private_url;
        if (url) uploaded.push(url);
      }
      if (!uploaded.length) throw new Error('Image uploaded but no URL was returned.');
      setImageUrls((current) => [...current, ...uploaded].slice(0, 6));
      setDraft(null);
      setChargedPaise(0);
      setBalanceAfter(null);
      setChargeMessage('');
      toast.push(`Uploaded ${uploaded.length} photo${uploaded.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      toast.push(getApiErrorMessage(error, "Couldn't upload that photo."), 'error');
    } finally {
      setUploading(false);
    }
  }

  function choosePhoto() {
    if (Platform.OS === 'web') {
      void pickAndUpload('library');
      return;
    }
    Alert.alert('Invoice photo', 'Photograph the full supplier bill.', [
      { text: 'Camera', onPress: () => void pickAndUpload('camera') },
      { text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery', onPress: () => void pickAndUpload('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function analyze() {
    if (!client || !businessId || !imageUrls.length) return;
    setAnalyzing(true);
    try {
      const response = await client.shop.analyzePurchaseInvoice({
        business_id: businessId,
        image_urls: imageUrls,
      });
      const data = response.data;
      if (!data.ok || !data.draft) {
        if (data.source === 'smart_lookup_no_balance') setTopUpOpen(true);
        toast.push(data.message || "Couldn't read that invoice.", 'error');
        return;
      }
      setDraft({ ...data.draft, usage_id: data.usage_id, image_urls: imageUrls });
      setChargedPaise(Number(data.charged_paise || 0));
      setBalanceAfter(data.balance_after_paise ?? null);
      setChargeCurrency(data.charge_currency || 'INR');
      setChargeMessage(data.message || '');
      toast.push(data.message || 'Invoice read. Review the lines.', 'success');
    } catch (error) {
      const message = getApiErrorMessage(error, "Couldn't read that invoice.");
      if (/wallet|balance|top up/i.test(message)) setTopUpOpen(true);
      toast.push(message, 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  function patchLine(index: number, patch: Partial<ShopInvoiceScanLine>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
      };
    });
  }

  async function fetchLine(index: number, overrideCode?: string) {
    const line = draftRef.current?.lines[index];
    if (!client || !businessId || !line) return;
    const code = (overrideCode ?? line.barcode ?? '').trim();
    const query = line.name.trim();
    if (!code && !query) {
      toast.push('Type or scan a barcode, or keep the product name, then Fetch.', 'error');
      return;
    }
    setFetchingIndex(index);
    try {
      if (code) {
        try {
          const existing = await client.shop.lookupBarcode({ business_id: businessId, code });
          patchLine(index, applyShopProductToScanLine({ ...line, barcode: code }, existing.data, code));
          toast.push(`Matched ${existing.data.name} in your catalog.`, 'success');
          return;
        } catch {
          // New barcode — fill from the free catalog next.
        }
      }
      const response = await client.shop.enrichBarcode({
        business_id: businessId,
        ...(code && looksLikeBarcode(code) ? { code } : { query: code || query }),
      });
      patchLine(index, applyEnrichmentToScanLine({ ...line, barcode: code || line.barcode }, response.data));
      if (response.data.found) {
        toast.push(response.data.name ? `Fetched ${response.data.name}.` : 'Catalog details added.', 'success');
      } else {
        toast.push(response.data.message || 'No catalog match. Add the barcode or fill the product.', 'info');
      }
    } catch (error) {
      toast.push(getApiErrorMessage(error, "Couldn't fetch that product."), 'error');
    } finally {
      setFetchingIndex(null);
    }
  }

  async function replaceLinePhoto(index: number, source: 'camera' | 'library') {
    if (!token || !tenantId || !businessId) return;
    if (Platform.OS !== 'web') {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.push(source === 'camera' ? 'Allow camera access to photograph the product.' : 'Allow photo library access.', 'error');
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoBusy(index);
    try {
      const access = (await ensureFreshAccess()) || token;
      const uploaded = await uploadProductImage({
        token: access,
        tenantId,
        businessId,
        asset: result.assets[0],
        productName: draftRef.current?.lines[index]?.name || 'Product',
        prepareProductCanvas: true,
      });
      const url = uploaded.public_url || uploaded.private_url;
      if (!url) throw new Error('Photo uploaded but no URL was returned.');
      patchLine(index, { image_url: url, use_image: true, image_source: 'upload' });
      toast.push('Product photo updated.', 'success');
    } catch (error) {
      toast.push(getApiErrorMessage(error, "Couldn't upload that product photo."), 'error');
    } finally {
      setPhotoBusy(null);
    }
  }

  function chooseLinePhoto(index: number) {
    if (Platform.OS === 'web') {
      void replaceLinePhoto(index, 'library');
      return;
    }
    Alert.alert('Product photo', 'Replace the pack photo.', [
      { text: 'Camera', onPress: () => void replaceLinePhoto(index, 'camera') },
      { text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery', onPress: () => void replaceLinePhoto(index, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  useEffect(() => {
    const code = route.params?.enrichCode;
    const index = route.params?.enrichLineIndex;
    if (!code || index == null || Number.isNaN(index)) return;
    patchLine(index, { barcode: code });
    void fetchLine(index, code);
    navigation.setParams({ enrichCode: undefined, enrichLineIndex: undefined });
  }, [route.params?.enrichCode, route.params?.enrichLineIndex]);

  async function confirm() {
    if (!client || !businessId || !draft) return;
    setConfirming(true);
    try {
      const response = await client.shop.confirmPurchaseInvoice({
        business_id: businessId,
        draft,
        create_missing: true,
        create_supplier: Boolean(draft.supplier.create),
      });
      toast.push(`Posted ${response.data.voucher_number}.`, 'success');
      navigation.navigate('ShopBooksPurchase', { voucherId: response.data.voucher_id });
    } catch (error) {
      toast.push(getApiErrorMessage(error, "Couldn't post that purchase."), 'error');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <FormScreen
      footer={
        draft ? (
          <Button
            label={confirming ? 'Posting…' : `Post purchase · ${readyLines.length} line${readyLines.length === 1 ? '' : 's'}`}
            onPress={() => void confirm()}
            disabled={!readyLines.length || confirming}
            loading={confirming}
          />
        ) : (
          <Button
            label={analyzing ? 'Reading invoice…' : 'Extract with AI'}
            icon="cpu"
            onPress={() => void analyze()}
            disabled={!imageUrls.length || uploading || analyzing}
            loading={analyzing}
          />
        )
      }
    >
      <FormHero subtitle="Photograph the supplier bill. Invoice photos use more tokens than a pack photo — the exact AI wallet charge appears after the scan." />

      {chargeMessage || chargedPaise > 0 ? (
        <View style={styles.chargeBanner}>
          <Text style={styles.chargeBannerTitle}>
            {chargedPaise > 0
              ? `AI wallet charge ${formatWallet(chargedPaise, chargeCurrency)}`
              : 'No AI wallet charge'}
          </Text>
          {balanceAfter != null ? (
            <Text style={styles.chargeBannerMeta}>Wallet balance {formatWallet(balanceAfter, chargeCurrency)}</Text>
          ) : chargeMessage ? (
            <Text style={styles.chargeBannerMeta}>{chargeMessage}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Button
          label={uploading ? 'Uploading…' : imageUrls.length ? 'Add another photo' : 'Add invoice photo'}
          variant="outline"
          icon="camera"
          onPress={choosePhoto}
          disabled={uploading || imageUrls.length >= 6}
        />
        <Text style={styles.meta}>
          {imageUrls.length
            ? `${imageUrls.length} photo${imageUrls.length === 1 ? '' : 's'} ready. Tap a photo to preview.`
            : 'Use the camera or gallery. Capture the full bill.'}
        </Text>
        {imageUrls.length ? (
          <View style={styles.billThumbs}>
            {imageUrls.map((url, index) => {
              const uri = photoUri(url);
              return (
                <View key={`${url}-${index}`} style={styles.billItem}>
                  <Pressable
                    onPress={() => uri && setPreviewUrl(uri)}
                    accessibilityLabel={`Preview invoice photo ${index + 1}`}
                  >
                    <RemoteImage uri={uri} style={styles.billThumb} />
                  </Pressable>
                  <Pressable onPress={() => uri && setPreviewUrl(uri)} hitSlop={8}>
                    <Text style={styles.skip}>Preview</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    hitSlop={8}
                  >
                    <Text style={styles.skip}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {draft ? (
        <View style={styles.reviewStack}>
        <View style={styles.card}>
          {draft.duplicate?.found ? <Text style={styles.warn}>{draft.duplicate.message}</Text> : null}
          {draft.totals_mismatch ? (
            <Text style={styles.warn}>Line totals do not match the printed grand total. Check qty and rates.</Text>
          ) : null}
          {!draft.lines.length ? (
            <Text style={styles.warn}>No products were read. Try a flatter, well-lit photo of the full bill.</Text>
          ) : null}

          <Input
            label="Supplier"
            value={draft.supplier.name || ''}
            onChangeText={(value) =>
              setDraft((current) =>
                current ? { ...current, supplier: { ...current.supplier, name: value } } : current,
              )
            }
          />
          <Input
            label="GSTIN"
            value={draft.supplier.gstin || draft.header.gstin || ''}
            onChangeText={(value) =>
              setDraft((current) => (current ? { ...current, supplier: { ...current.supplier, gstin: value } } : current))
            }
          />
          <Input label="Invoice no." value={draft.header.invoice_number || ''} editable={false} />
          <Input label="Date" value={draft.header.invoice_date || ''} editable={false} />
          <Input label="Printed total" value={draft.header.grand_total || ''} editable={false} />
          {draft.supplier.match ? (
            <Text style={styles.meta}>Supplier matched by {draft.supplier.match}.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={styles.meta}>Supplier is optional.</Text>
              <View style={styles.chips}>
                <Chip
                  label="Don't create"
                  active={!draft.supplier.create}
                  onPress={() =>
                    setDraft((current) =>
                      current ? { ...current, supplier: { ...current.supplier, create: false } } : current,
                    )
                  }
                />
                <Chip
                  label="Create supplier"
                  active={Boolean(draft.supplier.create)}
                  onPress={() =>
                    setDraft((current) =>
                      current ? { ...current, supplier: { ...current.supplier, create: true } } : current,
                    )
                  }
                />
              </View>
            </View>
          )}
          {draft.lines.length ? (
            <Text style={styles.meta}>
              {draft.lines.length} product{draft.lines.length === 1 ? '' : 's'} — add a barcode and Fetch on each.
            </Text>
          ) : null}
        </View>
          {draft.lines.map((line, index) => {
            const photoUrl = line.image_url && line.use_image !== false ? photoUri(line.image_url) : '';
            return (
            <View key={`${line.name}-${index}`} style={[styles.productCard, line.skip ? styles.lineSkip : null]}>
              <View style={styles.productKicker}>
                <Text style={styles.productTitle}>
                  Product {index + 1} of {draft.lines.length}
                </Text>
                <Text style={styles.meta}>
                  {line.match || (line.create ? 'Will create' : 'Unmatched')}
                  {line.skip ? ' · Skipped' : ''}
                </Text>
                <Pressable onPress={() => patchLine(index, { skip: !line.skip })} hitSlop={8}>
                  <Text style={styles.skip}>{line.skip ? 'Include' : 'Skip'}</Text>
                </Pressable>
              </View>
              <View style={styles.photoRow}>
                <Pressable
                  onPress={() => (photoUrl ? setPreviewUrl(photoUrl) : chooseLinePhoto(index))}
                  accessibilityLabel={photoUrl ? 'Preview product photo' : 'Add product photo'}
                >
                  {photoUrl ? (
                    <RemoteImage uri={photoUrl} style={styles.photo} />
                  ) : (
                    <View style={[styles.photo, styles.photoEmpty]}>
                      <Feather name="camera" size={18} color={colors.mutedForeground} />
                    </View>
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 4 }}>
                  <Pressable onPress={() => chooseLinePhoto(index)} disabled={photoBusy === index} hitSlop={8}>
                    <Text style={styles.skip}>
                      {photoBusy === index ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo'}
                    </Text>
                  </Pressable>
                  {photoUrl ? (
                    <Pressable onPress={() => setPreviewUrl(photoUrl)} hitSlop={8}>
                      <Text style={styles.skip}>Preview</Text>
                    </Pressable>
                  ) : null}
                  {photoUrl ? (
                    <Pressable onPress={() => patchLine(index, { image_url: '', use_image: false })} hitSlop={8}>
                      <Text style={styles.skip}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Input label="Name" value={line.name} onChangeText={(value) => patchLine(index, { name: value })} />
              <View style={styles.barcodeRow}>
                <View style={styles.lineField}>
                  <Input
                    label="Barcode"
                    value={line.barcode || ''}
                    placeholder="Type or scan"
                    onChangeText={(value) => patchLine(index, { barcode: value })}
                    onSubmitEditing={() => void fetchLine(index)}
                    returnKeyType="search"
                  />
                </View>
                <Pressable
                  style={styles.iconBtn}
                  onPress={() => navigation.navigate('BarcodeScanner', { target: 'invoiceScanLine', rowId: String(index) })}
                  accessibilityLabel="Scan barcode with camera"
                >
                  <Feather name="camera" size={16} color={colors.primary} />
                </Pressable>
              </View>
              <Button
                label={fetchingIndex === index ? 'Fetching…' : line.barcode ? 'Fetch from barcode' : 'Fetch from name'}
                variant="secondary"
                size="sm"
                disabled={fetchingIndex === index}
                onPress={() => void fetchLine(index)}
              />
              <FieldRow>
                <Input label="Qty" value={line.qty} keyboardType="decimal-pad" onChangeText={(value) => patchLine(index, { qty: value })} />
                <Input
                  label="Purchase price"
                  value={line.rate}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => patchLine(index, { rate: value })}
                />
              </FieldRow>
              <FieldRow>
                <Input
                  label="Selling price"
                  value={line.price || ''}
                  placeholder="MRP from bill"
                  keyboardType="decimal-pad"
                  onChangeText={(value) => patchLine(index, { price: value })}
                />
                <Input label="SKU" value={line.sku || ''} onChangeText={(value) => patchLine(index, { sku: value })} />
              </FieldRow>
              <FieldRow>
                <Input
                  label="GST"
                  value={line.gst_rate || ''}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => patchLine(index, { gst_rate: value })}
                />
                <Input label="HSN" value={line.hsn_sac || ''} onChangeText={(value) => patchLine(index, { hsn_sac: value })} />
              </FieldRow>
              <FieldRow>
                <Input label="Brand" value={line.brand || ''} onChangeText={(value) => patchLine(index, { brand: value })} />
                <Input
                  label="Pack size / quantity"
                  value={line.pack_size || ''}
                  placeholder="e.g. 1 kg, 12 pcs"
                  onChangeText={(value) => patchLine(index, { pack_size: value })}
                />
              </FieldRow>
              <FieldRow>
                <SelectField
                  label="Status"
                  value={line.status || 'active'}
                  options={PRODUCT_STATUSES}
                  onChange={(value) => patchLine(index, { status: value })}
                  searchable={false}
                />
                <SelectField
                  label="Category"
                  optional
                  value={line.category || ''}
                  options={[
                    { value: '', label: '—' },
                    ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
                    ...(line.category && !SHOP_PRODUCT_CATEGORIES.some((item) => item.value === line.category)
                      ? [{ value: line.category, label: line.category }]
                      : []),
                  ]}
                  onChange={(value) => patchLine(index, { category: value })}
                />
              </FieldRow>
              <FieldRow>
                <SelectField
                  label="Currency"
                  value={line.currency || 'INR'}
                  options={
                    line.currency && !CURRENCIES.some((item) => item.value === line.currency)
                      ? [...CURRENCIES, { value: line.currency, label: line.currency }]
                      : CURRENCIES
                  }
                  onChange={(value) => patchLine(index, { currency: value })}
                  searchable={false}
                />
                <View>
                  <Text style={styles.meta}>GST on sell price</Text>
                  <View style={styles.chips}>
                    <Chip
                      label="GST excluded"
                      active={!line.tax_inclusive}
                      onPress={() => patchLine(index, { tax_inclusive: false })}
                    />
                    <Chip
                      label="GST included"
                      active={Boolean(line.tax_inclusive)}
                      onPress={() => patchLine(index, { tax_inclusive: true })}
                    />
                  </View>
                </View>
              </FieldRow>
              <FieldRow>
                <Input label="On hand" value={line.stock_on_hand || '0'} editable={false} />
                <Input label="After this bill" value={stockAfter(line)} editable={false} />
              </FieldRow>
              <Input
                label="Description"
                value={line.description || ''}
                multiline
                onChangeText={(value) => patchLine(index, { description: value })}
              />
              <Input
                label="Product details"
                value={line.details_html || ''}
                multiline
                onChangeText={(value) => patchLine(index, { details_html: value })}
              />
            </View>
            );
          })}
        </View>
      ) : null}

      <ImageLightbox
        uri={previewUrl}
        visible={Boolean(previewUrl)}
        title="Photo preview"
        onClose={() => setPreviewUrl(null)}
      />

      {topUpOpen && client && token && tenantId && businessId ? (
        <SmartLookupUpiPaySheet
          client={client}
          token={token}
          tenantId={tenantId}
          businessId={businessId}
          amountPaise={10000}
          onClose={() => setTopUpOpen(false)}
          onClaimed={() => setTopUpOpen(false)}
          onError={(message) => toast.push(message, 'error')}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  reviewStack: { gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  meta: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
  chargeBanner: {
    backgroundColor: '#ecfdf3',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#86efac',
    padding: spacing.md,
    gap: 4,
  },
  chargeBannerTitle: { color: '#14532d', fontFamily: fonts.bodySemi, fontSize: 16 },
  chargeBannerMeta: { color: '#166534', fontSize: 13, lineHeight: 18 },
  warn: {
    backgroundColor: '#fff7ed',
    color: '#9a3412',
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
  },
  productCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  productKicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productTitle: { color: colors.foreground, fontFamily: fonts.bodySemi, fontSize: 15 },
  lineSkip: { opacity: 0.5 },
  lineField: { flex: 1 },
  billThumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  billItem: { gap: 4 },
  billThumb: {
    width: 112,
    height: 148,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden' },
  photoEmpty: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skip: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13, paddingVertical: 4 },
});
