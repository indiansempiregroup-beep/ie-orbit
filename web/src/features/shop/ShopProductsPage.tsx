import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Pencil, Plus, Rows3 } from 'lucide-react';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import type { ShopBarcodeEnrichment, ShopGodown, ShopProduct, ShopProductCategoryItem } from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { HtmlEditorField } from '../../components/HtmlEditorField';
import { useDialog } from '../../hooks/useDialog';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopGodowns, useShopProductMutations, useShopProducts } from './shopHooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { ShopFilterBar } from './ShopFilterBar';
import { uploadProductImage } from './uploadProductImage';
import { currencySelectOptions, ensureSelectOption } from '../../config/onboarding';
import {
  MAX_PRODUCT_IMAGES,
  buildProductImageMetadata,
  emptyProductImageSlots,
  ensureProductImageSlots,
  galleryFromProduct,
  normalizeProductGallery,
  primaryProductImageUrl,
  productImageSlotLabel,
  toStoredProductImageUrl,
} from './productImages';
import { enrichSuccessMessage } from './enrichMessages';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';

const emptyForm = {
  sku: '',
  name: '',
  brand: '',
  description: '',
  details_html: '',
  price: '0',
  tax_rate: '0',
  gst_rate: '0',
  hsn_sac: '',
  currency: 'INR',
  stock_on_hand: '0',
  godown_id: '',
  low_stock_threshold: '0',
  pack_size: '',
  images: emptyProductImageSlots(),
  barcode: '',
  barcode_type: 'manufacturer',
  status: 'active',
  category: '',
  category_other: '',
};

type FormState = typeof emptyForm;

const IDENTITY_DEFAULTS: Pick<
  FormState,
  | 'sku'
  | 'name'
  | 'brand'
  | 'description'
  | 'details_html'
  | 'pack_size'
  | 'images'
  | 'barcode'
  | 'barcode_type'
  | 'category'
  | 'category_other'
  | 'hsn_sac'
  | 'gst_rate'
  | 'tax_rate'
  | 'price'
> = {
  sku: '',
  name: '',
  brand: '',
  description: '',
  details_html: '',
  pack_size: '',
  images: emptyProductImageSlots(),
  barcode: '',
  barcode_type: 'manufacturer',
  category: '',
  category_other: '',
  hsn_sac: '',
  gst_rate: '0',
  tax_rate: '0',
  price: '0',
};

function wipeIdentity(current: FormState, code: string): FormState {
  return {
    ...current,
    ...IDENTITY_DEFAULTS,
    images: emptyProductImageSlots(),
    barcode: code,
    sku: code,
    barcode_type: 'manufacturer',
  };
}

function applyEnrichment(current: FormState, data: ShopBarcodeEnrichment): FormState {
  const gallery = ensureProductImageSlots(
    normalizeProductGallery([
      data.front_image_url,
      data.back_image_url,
      ...(data.images?.gallery ?? []),
      data.local_image_url,
      data.image_url,
      ...current.images,
    ]),
  );
  const mrp = String(data.mrp || '').trim();
  const gst = String(data.gst_rate || '').trim();
  const usableMrp = mrp && mrp !== '0' && mrp !== '0.00' ? mrp : '';
  const usableGst = gst && gst !== '0' && gst !== '0.00' ? gst : '';
  const categorySlug = (data.category || '').trim();
  const isOther = categorySlug === 'other';
  const detailsHtml =
    (data.details_html || '').trim() ||
    (data.description
      ? `<p>${String(data.description)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p>`
      : current.details_html);
  return {
    ...current,
    sku: data.sku || data.code || current.sku,
    name: data.name || '',
    brand: data.brand || '',
    description: data.description || '',
    details_html: detailsHtml,
    pack_size: data.pack_size || data.serving_size || '',
    images: gallery,
    barcode: data.code || current.barcode,
    barcode_type: data.code ? 'manufacturer' : current.barcode_type,
    category: categorySlug || '',
    category_other: isOther
      ? data.category_label || data.categories || ''
      : data.category_label && !categorySlug
        ? data.category_label
        : '',
    hsn_sac: data.hsn_sac || '',
    gst_rate: usableGst || current.gst_rate,
    tax_rate: usableGst || current.tax_rate,
    price: usableMrp || current.price,
  };
}

function formFromProduct(product: ShopProduct): FormState {
  const primaryBarcode = product.barcodes?.find((row) => row.is_primary) || product.barcodes?.[0];
  const categorySlug = product.category || '';
  return {
    sku: product.sku || '',
    name: product.name || '',
    brand: product.brand || '',
    description: product.description || '',
    details_html: product.details_html || '',
    price: String(product.price ?? '0'),
    tax_rate: String(product.tax_rate ?? '0'),
    gst_rate: String(product.gst_rate ?? product.tax_rate ?? '0'),
    hsn_sac: product.hsn_sac || '',
    currency: product.currency || 'INR',
    stock_on_hand: String(product.stock_on_hand ?? '0'),
    godown_id: '',
    low_stock_threshold: String(product.low_stock_threshold ?? '0'),
    pack_size: product.pack_size || '',
    images: galleryFromProduct(product),
    barcode: primaryBarcode?.code || '',
    barcode_type: primaryBarcode?.barcode_type || 'manufacturer',
    status: product.status || 'active',
    category: categorySlug,
    category_other: categorySlug === 'other' ? product.category_label || '' : '',
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

/** Per-office quantities for a product, read from the godowns already loaded. */
function officeStockFor(godowns: ShopGodown[], productId: string) {
  return godowns
    .filter((godown) => Boolean(godown.branch))
    .map((godown) => ({
      office: godown.branch_name || godown.name,
      quantity: Number(
        (godown.stocks ?? []).find((row) => row.product === productId)?.quantity ?? 0,
      ),
    }));
}

export function ShopProductsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [barcodeLookup, setBarcodeLookup] = useState('');
  const [nameLookup, setNameLookup] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const dialog = useDialog();
  const auth = useAuth();
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const packPhotoRef = useRef<HTMLInputElement | null>(null);
  const products = useShopProducts(search, status, category);
  const godownsQuery = useShopGodowns();
  const godowns = godownsQuery.data ?? [];
  const categoriesQuery = useQuery({
    queryKey: ['shop-product-categories'],
    queryFn: async () => {
      const response = await client.shop.listProductCategories();
      return response.data.items;
    },
  });
  const categoryOptions: ShopProductCategoryItem[] = categoriesQuery.data?.length
    ? categoriesQuery.data
    : SHOP_PRODUCT_CATEGORIES.map((item) => ({ slug: item.value, label: item.label, is_builtin: true }));
  const { create, update, patchBulk, enrich, analyzePackaging, getPackagingAnalysis, businessId } =
    useShopProductMutations();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [needsPackPhoto, setNeedsPackPhoto] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkGst, setBulkGst] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showBulkHint, setShowBulkHint] = useState(() => {
    try {
      return window.localStorage.getItem('shop.bulkHint.dismissed') !== '1';
    } catch {
      return true;
    }
  });

  const filtered = useMemo(() => {
    const rows = products.data ?? [];
    if (!stockFilter) return rows;
    return rows.filter((product) => {
      const stock = Number(product.stock_on_hand);
      const threshold = Number(product.low_stock_threshold ?? 0);
      if (stockFilter === 'in_stock') return stock > 0;
      if (stockFilter === 'out') return stock <= 0;
      if (stockFilter === 'low') return stock > 0 && threshold > 0 && stock <= threshold;
      return true;
    });
  }, [products.data, stockFilter]);

  const filteredIds = useMemo(() => filtered.map((product) => product.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  }

  async function applyBulkEdit() {
    const ids = selectedIds.slice(0, 200);
    if (!ids.length) return;
    const updates: {
      status?: string;
      category?: string;
      gst_rate?: string;
      price?: { set?: string; percent?: string };
    } = {};
    if (bulkStatus) updates.status = bulkStatus;
    if (bulkCategory) updates.category = bulkCategory;
    if (bulkGst.trim()) updates.gst_rate = bulkGst.trim();
    if (bulkPrice.trim()) updates.price = { set: bulkPrice.trim() };
    else if (bulkPercent.trim()) updates.price = { percent: bulkPercent.trim() };
    if (!Object.keys(updates).length) {
      snackbar.push('Choose a status, category, GST, or price change.', 'error');
      return;
    }
    try {
      const result = await patchBulk.mutateAsync({ ids, updates });
      const failed = result.errors.length;
      if (result.updated.length && !failed) {
        snackbar.push(`Updated ${result.updated.length} product${result.updated.length === 1 ? '' : 's'}.`, 'success');
        setSelectedIds([]);
        setBulkOpen(false);
        setBulkStatus('');
        setBulkCategory('');
        setBulkGst('');
        setBulkPrice('');
        setBulkPercent('');
      } else if (result.updated.length) {
        snackbar.push(`Updated ${result.updated.length}, ${failed} failed.`, 'info');
      } else {
        snackbar.push(result.errors[0]?.message || 'Unable to update the selected products.', 'error');
      }
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to update the selected products.', 'error');
    }
  }

  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!dialog.open) return;
    const timer = window.setTimeout(() => scanInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [dialog.open]);

  function openAddDialog() {
    setEditingId(null);
    setForm({ ...emptyForm, godown_id: pickGodownId(godowns) });
    setBarcodeLookup('');
    setNameLookup('');
    setMessage(null);
    dialog.show();
  }

  function openEditDialog(product: ShopProduct) {
    setEditingId(product.id);
    setForm({ ...formFromProduct(product), godown_id: pickGodownId(godowns, product.id) });
    setBarcodeLookup('');
    setNameLookup('');
    setMessage(null);
    dialog.show();
  }

  async function runEnrich(payload: { code?: string; query?: string; image_url?: string; use_smart_lookup?: boolean }) {
    const code = (payload.code || '').trim();
    setMessage(null);
    setNeedsPackPhoto(false);

    if (code) {
      // Instant barcode on the form; wipe previous catalog identity when code changes (add mode).
      setBarcodeLookup(code);
      setForm((current) => {
        if (editingId) {
          const currentCode = current.barcode.trim();
          if (currentCode && currentCode !== code) {
            return {
              ...wipeIdentity(current, code),
              price: current.price,
              stock_on_hand: current.stock_on_hand,
              low_stock_threshold: current.low_stock_threshold,
              godown_id: current.godown_id,
              status: current.status,
              currency: current.currency,
            };
          }
          return { ...current, barcode: code, sku: current.sku || code };
        }
        if (current.barcode.trim() && current.barcode.trim() !== code) {
          return wipeIdentity(current, code);
        }
        return { ...current, barcode: code, sku: current.sku || code };
      });
    }

    setLookingUp(true);
    try {
      const data = await enrich.mutateAsync(
        payload.code
          ? {
              code,
              image_url: payload.image_url,
              use_smart_lookup: payload.use_smart_lookup ?? true,
            }
          : { query: payload.query || '', image_url: payload.image_url, use_smart_lookup: payload.use_smart_lookup ?? true },
      );

      if (data.existing_product_id && data.existing_product_id !== editingId) {
        setMessage(data.message || `Already in catalog as ${data.existing_product_name}.`);
        snackbar.push(data.message || `Already in catalog as ${data.existing_product_name}.`, 'info');
        if (!editingId) {
          const existing = (products.data ?? []).find((row) => row.id === data.existing_product_id);
          if (existing) openEditDialog(existing);
        }
        return;
      }

      if (!data.found) {
        if (code) {
          setNeedsPackPhoto(Boolean(data.needs_pack_photo));
          setMessage(
            data.message ||
              (data.needs_pack_photo
                ? 'No online match — take a pack photo to auto-fill, or enter the name.'
                : 'No online match for this barcode — fill details manually and save.'),
          );
        } else {
          setMessage(data.message || 'No online match — try another name or scan the barcode.');
        }
        return;
      }

      setForm((current) => {
        const next = applyEnrichment(
          editingId
            ? {
                ...wipeIdentity(current, data.code || code || current.barcode),
                price: current.price,
                stock_on_hand: current.stock_on_hand,
                low_stock_threshold: current.low_stock_threshold,
                godown_id: current.godown_id,
                status: current.status,
                currency: current.currency,
              }
            : current.barcode && data.code && current.barcode !== data.code
              ? wipeIdentity(current, data.code)
              : { ...current, barcode: data.code || current.barcode },
          data,
        );
        return next;
      });
      setBarcodeLookup(data.code || code || '');
      void queryClient.invalidateQueries({ queryKey: ['shop-product-categories'] });
      const filled = data.name || 'Product';
      const successText = enrichSuccessMessage(data, {
        editing: Boolean(editingId),
        filledName: filled,
      });
      snackbar.push(successText, 'success');
      setMessage(successText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lookup failed.');
    } finally {
      setLookingUp(false);
    }
  }

  async function runSmartPackPhoto(file: File | null) {
    if (!file || !auth.token || !workspace.tenantId || !businessId) return;
    setLookingUp(true);
    setMessage('Reading pack photo…');
    try {
      const url = await uploadProductImage({
        accessToken: auth.token,
        tenantId: workspace.tenantId,
        businessId,
        imageFile: file,
        label: 'Pack photo',
      });
      const stored = toStoredProductImageUrl(url) || url;
      await runEnrich({
        code: form.barcode || barcodeLookup,
        image_url: stored,
        use_smart_lookup: true,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to read pack photo.');
      setLookingUp(false);
    }
  }

  async function uploadAt(index: number, file: File | null) {
    if (!file || !auth.token || !workspace.tenantId || !businessId) return;
    if (index < 0 || index >= MAX_PRODUCT_IMAGES) return;
    setUploadingIndex(index);
    setMessage(null);
    try {
      const url = await uploadProductImage({
        accessToken: auth.token,
        tenantId: workspace.tenantId,
        businessId,
        imageFile: file,
        label: productImageSlotLabel(index),
      });
      const stored = toStoredProductImageUrl(url) || url;
      setForm((current) => {
        const next = ensureProductImageSlots(current.images);
        next[index] = stored;
        return { ...current, images: next };
      });
      setMessage(
        index === 0
          ? 'Primary photo uploaded. Use Smart fill when you want to read the pack.'
          : `${productImageSlotLabel(index)} uploaded.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploadingIndex(null);
    }
  }

  function removeImageAt(index: number) {
    setForm((current) => {
      const next = ensureProductImageSlots(current.images);
      next[index] = '';
      return { ...current, images: ensureProductImageSlots(normalizeProductGallery(next)) };
    });
  }

  async function runPackagingAnalysis() {
    const front = form.images[0] || '';
    const back = form.images[1] || '';
    if (!front && !back) {
      setMessage('Upload photo 1 (front) and/or photo 2 (back) first.');
      return;
    }
    setAnalyzing(true);
    setMessage('Analysing packaging in the background…');
    try {
      const job = await analyzePackaging.mutateAsync({
        front_image_url: front || undefined,
        back_image_url: back || undefined,
        hint: nameLookup || form.name || form.brand,
        async_mode: true,
      });
      if (job.status === 'done' && job.result) {
        setForm((current) => applyEnrichment(current, job.result!));
        setMessage(job.result.message || 'Fields updated from packaging photos.');
        return;
      }

      const started = Date.now();
      while (Date.now() - started < 60000) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const latest = await getPackagingAnalysis.mutateAsync(job.job_id);
        if (latest.status === 'done' && latest.result) {
          setForm((current) => applyEnrichment(current, latest.result!));
          setMessage(latest.result.message || 'Fields updated from packaging photos.');
          return;
        }
        if (latest.status === 'failed') {
          setMessage(latest.error || 'Packaging analysis failed.');
          return;
        }
      }
      const syncJob = await analyzePackaging.mutateAsync({
        front_image_url: front || undefined,
        back_image_url: back || undefined,
        hint: nameLookup || form.name || form.brand,
        async_mode: false,
      });
      if (syncJob.result) {
        setForm((current) => applyEnrichment(current, syncJob.result!));
        setMessage(syncJob.result.message || 'Fields updated from packaging photos.');
      } else {
        setMessage(syncJob.error || 'Analysis timed out. Try again or use barcode lookup.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to analyse packaging.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!businessId || !form.name.trim()) return;
    if (form.category === 'other' && !form.category_other.trim()) {
      setMessage('Enter a category name for Other.');
      return;
    }
    setMessage(null);
    let categorySlug = form.category;
    if (form.category === 'other' || (form.category_other.trim() && !categorySlug)) {
      try {
        const created = await client.shop.ensureProductCategory({ label: form.category_other.trim() });
        categorySlug = created.data.slug;
        void queryClient.invalidateQueries({ queryKey: ['shop-product-categories'] });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to create category.');
        return;
      }
    }
    const gallery = normalizeProductGallery(form.images.map(toStoredProductImageUrl));
    const payload = {
      sku: form.sku,
      name: form.name.trim(),
      brand: form.brand,
      description: form.description,
      details_html: form.details_html,
      price: form.price,
      tax_rate: form.tax_rate,
      gst_rate: form.gst_rate,
      hsn_sac: form.hsn_sac,
      currency: form.currency,
      stock_on_hand: form.stock_on_hand,
      ...(form.godown_id ? { godown_id: form.godown_id } : {}),
      low_stock_threshold: form.low_stock_threshold,
      pack_size: form.pack_size,
      ...(gallery[0] ? { image_url: gallery[0] } : { image_url: '' }),
      status: form.status,
      ...(categorySlug ? { category: categorySlug } : { category: '' }),
      metadata: {
        images: buildProductImageMetadata(gallery),
      },
      barcodes: form.barcode
        ? [{ code: form.barcode, barcode_type: form.barcode_type, is_primary: true }]
        : [],
    };
    try {
      if (editingId) {
        await update.mutateAsync({ productId: editingId, body: payload });
        dialog.hide();
        window.setTimeout(() => snackbar.push('Product updated.', 'success'), 0);
      } else {
        await create.mutateAsync(payload);
        dialog.hide();
        window.setTimeout(() => snackbar.push('Product saved.', 'success'), 0);
      }
      setForm({ ...emptyForm, images: emptyProductImageSlots() });
      setEditingId(null);
      setBarcodeLookup('');
      setNameLookup('');
      setNeedsPackPhoto(false);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save product.';
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  const imageSlots = ensureProductImageSlots(form.images);

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, brand, barcode…"
          onClear={() => {
            setSearch('');
            setStatus('');
            setCategory('');
            setStockFilter('');
          }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'draft', label: 'Draft' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'archived', label: 'Archived' },
              ],
            },
            {
              id: 'category',
              label: 'Category',
              value: category,
              onChange: setCategory,
              options: [
                { value: '', label: 'All categories' },
                ...categoryOptions.map((item) => ({
                  value: item.slug,
                  label: item.label,
                })),
              ],
            },
            {
              id: 'stock',
              label: 'Stock',
              value: stockFilter,
              onChange: setStockFilter,
              options: [
                { value: '', label: 'All stock' },
                { value: 'in_stock', label: 'In stock' },
                { value: 'low', label: 'Low stock' },
                { value: 'out', label: 'Out of stock' },
              ],
            },
          ]}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to="/shop/products/add-many">
                <Button type="button" variant="neutral">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Rows3 size={16} aria-hidden="true" />
                    Add many
                  </span>
                </Button>
              </Link>
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Add product
                </span>
              </Button>
            </div>
          }
        />

        {showBulkHint ? (
          <p
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 12,
              background: '#eef4ff',
              color: '#1e3a5f',
              fontSize: 13,
            }}
          >
            <span>Need a catalog? Add many lets you paste Excel or scan barcodes.</span>
            <button
              type="button"
              onClick={() => {
                setShowBulkHint(false);
                try {
                  window.localStorage.setItem('shop.bulkHint.dismissed', '1');
                } catch {
                  /* ignore */
                }
              }}
              aria-label="Dismiss hint"
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 16,
                color: '#6b7280',
              }}
            >
              ×
            </button>
          </p>
        ) : null}

        {products.isLoading ? <p>Loading…</p> : null}
        {products.error ? <p role="alert">{(products.error as Error).message}</p> : null}
        {filtered.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectFiltered} />
              Select all ({filtered.length})
            </label>
            {selectedIds.length ? (
              <Button type="button" variant="neutral" onClick={() => setBulkOpen(true)}>
                {selectedIds.length} selected · Edit
              </Button>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((product) => (
            <div
              key={product.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border, #ddd)',
                paddingBottom: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(product.id)}
                  onChange={() => toggleSelected(product.id)}
                  aria-label={`Select ${product.name}`}
                  style={{ marginTop: 20 }}
                />
                {(() => {
                  const src = resolveMediaAssetUrl(primaryProductImageUrl(product));
                  return src ? (
                    <img
                      src={src}
                      alt=""
                      width={56}
                      height={56}
                      style={{
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        flexShrink: 0,
                        background: '#f3f4f6',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        background: '#f3f4f6',
                        flexShrink: 0,
                      }}
                    />
                  );
                })()}
                <div style={{ minWidth: 0 }}>
                  <strong>{product.name}</strong>
                  <div style={{ opacity: 0.8 }}>
                    {product.status}
                    {product.category
                      ? ` · ${product.category_label || categoryOptions.find((item) => item.slug === product.category)?.label || product.category}`
                      : ''}{' '}
                    · {product.brand || 'No brand'} · Stock {product.stock_on_hand} ·{' '}
                    {product.currency || ''} {product.price}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    SKU {product.sku || '—'} · HSN {product.hsn_sac || '—'} · GST{' '}
                    {product.gst_rate ?? product.tax_rate ?? 0}% ·{' '}
                    {(product.barcodes ?? [])
                      .map((row) => `${row.code} (${row.barcode_type})`)
                      .join(' · ') || 'No barcodes'}
                    {(() => {
                      const count = normalizeProductGallery(galleryFromProduct(product)).length;
                      return count ? ` · ${count}/${MAX_PRODUCT_IMAGES} photos` : '';
                    })()}
                  </div>
                  {(() => {
                    const offices = officeStockFor(godowns, product.id);
                    if (offices.length < 2) return null;
                    return (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {offices.map((office) => (
                          <span
                            key={office.office}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              background: office.quantity > 0 ? '#ecfdf5' : '#fef2f2',
                              color: office.quantity > 0 ? '#047857' : '#b91c1c',
                            }}
                          >
                            {office.office}: {office.quantity}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => openEditDialog(product)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </span>
              </Button>
            </div>
          ))}
          {!products.isLoading && !filtered.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>No products match these filters.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    Add your first product
                  </span>
                </Button>
                <Link to="/shop/products/add-many">
                  <Button type="button" variant="neutral">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Rows3 size={16} aria-hidden="true" />
                      Add many
                    </span>
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={bulkOpen && selectedIds.length > 0}
        onClose={() => setBulkOpen(false)}
        title={`Edit ${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'}${selectedIds.length > 200 ? ' (first 200)' : ''}`}
        labelledBy="bulk-edit-dialog"
        busy={patchBulk.isPending}
        busyMessage="Updating products…"
      >
        <div style={{ display: 'grid', gap: 12, minWidth: 280, maxWidth: 420 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Status</span>
            <select
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Keep</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Category</span>
            <select
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Keep</option>
              {categoryOptions.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>GST %</span>
              <input
                value={bulkGst}
                onChange={(event) => setBulkGst(event.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Set price</span>
              <input
                value={bulkPrice}
                onChange={(event) => {
                  setBulkPrice(event.target.value);
                  if (event.target.value) setBulkPercent('');
                }}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Price %</span>
              <input
                value={bulkPercent}
                onChange={(event) => {
                  setBulkPercent(event.target.value);
                  if (event.target.value) setBulkPrice('');
                }}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSelectedIds([]);
                setBulkOpen(false);
              }}
            >
              Clear selection
            </Button>
            <Button type="button" variant="primary" onClick={() => void applyBulkEdit()} loading={patchBulk.isPending}>
              Apply
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit product' : 'Add product'}
        labelledBy="product-dialog"
        busy={saving || lookingUp || enrich.isPending || analyzing || uploadingIndex !== null}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Upload up to {MAX_PRODUCT_IMAGES} product photos. The first photo is the primary image shown
            on product cards. Photo 2 can be used with photo 1 for packaging analysis.
          </p>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            {imageSlots.map((url, index) => (
              <label key={index} style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  {productImageSlotLabel(index)}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void uploadAt(index, event.target.files?.[0] ?? null)}
                />
                {url ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <img
                      src={resolveMediaAssetUrl(url) || url}
                      alt=""
                      width={96}
                      height={96}
                      style={{ objectFit: 'cover', borderRadius: 12, border: '1px solid #e5e7eb' }}
                    />
                    <Button type="button" variant="neutral" onClick={() => removeImageAt(index)}>
                      Remove
                    </Button>
                  </div>
                ) : null}
                {uploadingIndex === index ? <span style={{ fontSize: 12 }}>Uploading…</span> : null}
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="neutral"
            onClick={() => void runPackagingAnalysis()}
            disabled={analyzing || (!form.images[0] && !form.images[1])}
          >
            {analyzing
              ? 'Analysing packaging…'
              : uploadingIndex !== null
                ? `Uploading photo ${uploadingIndex + 1}…`
                : 'Analyse packaging photos'}
          </Button>

          <label style={{ display: 'grid', gap: 8 }}>
            Barcode scanner
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={scanInputRef}
                value={barcodeLookup}
                onChange={(event) => setBarcodeLookup(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void runEnrich({ code: barcodeLookup.trim() });
                  }
                }}
                placeholder="Scan barcode / RFID with scanner gun…"
                autoComplete="off"
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: 12,
                  borderRadius: 12,
                  border: lookingUp ? '1px solid #6ee7b7' : '1px solid #e5e7eb',
                  boxShadow: lookingUp ? '0 0 0 3px rgba(16, 185, 129, 0.15)' : undefined,
                  transition: 'border-color 120ms ease, box-shadow 120ms ease',
                }}
              />
              <Button
                type="button"
                variant="neutral"
                onClick={() => void runEnrich({ code: barcodeLookup.trim() })}
                disabled={lookingUp || enrich.isPending || !barcodeLookup.trim()}
              >
                {lookingUp || enrich.isPending ? 'Looking up…' : 'Lookup barcode'}
              </Button>
              <Button type="button" variant="neutral" onClick={() => setCameraOpen((open) => !open)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={16} aria-hidden="true" />
                  {cameraOpen ? 'Hide camera' : 'Camera'}
                </span>
              </Button>
            </div>
            {lookingUp ? (
              <div
                role="status"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: '#047857',
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    animation: 'pulse 1s ease-in-out infinite',
                  }}
                />
                Looking up barcode… form stays editable.
              </div>
            ) : null}
            {needsPackPhoto ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #fed7aa',
                  background: 'linear-gradient(180deg, #fffbeb, #fff7ed)',
                }}
              >
                <div style={{ fontSize: 13, color: '#9a3412', lineHeight: 1.4 }}>
                  No catalog match. Take a clear pack photo for Smart lookup, or type the name below.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    ref={packPhotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      void runSmartPackPhoto(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <Button type="button" variant="primary" onClick={() => packPhotoRef.current?.click()} disabled={lookingUp}>
                    Take pack photo
                  </Button>
                  <span style={{ fontSize: 12, color: '#b45309' }}>Uses prepaid Smart lookup wallet when enabled</span>
                </div>
              </div>
            ) : null}
            <BarcodeCameraPanel
              active={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onCode={(code) => {
                setBarcodeLookup(code);
                void runEnrich({ code });
                setCameraOpen(false);
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            Or search by product name
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={nameLookup}
                onChange={(event) => setNameLookup(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void runEnrich({ query: nameLookup.trim() });
                  }
                }}
                placeholder="e.g. Amul Taaza 1L"
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button
                type="button"
                variant="neutral"
                onClick={() => void runEnrich({ query: nameLookup.trim() })}
                disabled={enrich.isPending || !nameLookup.trim()}
              >
                Search online
              </Button>
            </div>
          </label>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            {(
              [
                ['name', 'Product name', true],
                ['brand', 'Brand', false],
                ['sku', 'SKU', false],
                ['price', 'Price', false],
                ['tax_rate', 'Tax %', false],
                ['gst_rate', 'GST % (Books)', false],
                ['hsn_sac', 'HSN/SAC code', false],
                ['stock_on_hand', 'Stock on hand', false],
                ['low_stock_threshold', 'Low stock alert', false],
                ['pack_size', 'Pack size / quantity', false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key} style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={required}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              </label>
            ))}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Barcode / RFID EPC</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Scan or type barcode"
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Button type="button" variant="neutral" onClick={() => setCameraOpen(true)} aria-label="Scan barcode with camera">
                  <Camera size={16} aria-hidden="true" />
                </Button>
              </div>
            </label>
            {godowns.length ? (
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  {editingId ? 'Godown for stock changes' : 'Stock godown'}
                </span>
                <select
                  value={form.godown_id}
                  onChange={(e) => setForm({ ...form, godown_id: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                >
                  {godowns.map((godown) => (
                    <option key={godown.id} value={godown.id}>
                      {godown.is_default ? `${godown.name} (default)` : godown.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Currency</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                {ensureSelectOption(currencySelectOptions, form.currency).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Barcode type</span>
              <select
                value={form.barcode_type}
                onChange={(e) => setForm({ ...form, barcode_type: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="manufacturer">Manufacturer barcode</option>
                <option value="internal">Internal barcode</option>
                <option value="rfid_epc">RFID EPC</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, category_other: e.target.value === 'other' ? form.category_other : '' })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="">Select category</option>
                {categoryOptions.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
                {!categoryOptions.some((item) => item.slug === 'other') ? (
                  <option value="other">Other</option>
                ) : null}
              </select>
            </label>
            {form.category === 'other' ? (
              <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>New category name</span>
                <input
                  value={form.category_other}
                  onChange={(e) => setForm({ ...form, category_other: e.target.value })}
                  required
                  placeholder="e.g. Dry dog food"
                  autoFocus
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #93c5fd',
                    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.12)',
                  }}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Saved as a real shop category and available in filters everywhere.
                </span>
              </label>
            ) : null}
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Description / ingredients</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <HtmlEditorField
              value={form.details_html}
              onChange={(details_html) => setForm({ ...form, details_html })}
            />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update product' : 'Save product'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
