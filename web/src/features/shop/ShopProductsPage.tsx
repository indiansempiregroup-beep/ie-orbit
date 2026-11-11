import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Pencil, Plus, Rows3 } from 'lucide-react';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import type {
  BulkEnrichMode,
  ShopBarcodeEnrichment,
  ShopGodown,
  ShopProduct,
  ShopProductCategoryItem,
} from '@ie-orbit/sdk';
import {
  BULK_ENRICH_LIMIT,
  enrichmentLookupForProduct,
  runBulkProductEnrich,
  SHOP_PRODUCT_CATEGORIES,
} from '@ie-orbit/sdk';
import {
  DEFAULT_PRODUCT_COLUMNS,
  loadProductColumns,
  missingFieldQuery,
  PRODUCT_COLUMN_IDS,
  saveProductColumns,
  type MissingFieldFilter,
  type ProductColumnId,
} from './productColumns';
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
import { CursorPager } from '../bi/components/CursorPager';
import { uploadProductImage } from './uploadProductImage';
import { ProductImageCropModal, type ProductImageCropResult } from './ProductImageCropModal';
import { hasBiFeature } from '../../config/planFeatures';
import { useBusinessBillingSnapshotQuery } from '../settings/billingHooks';
import { currencySelectOptions, ensureSelectOption } from '../../config/onboarding';
import {
  MAX_PRODUCT_IMAGES,
  buildProductImageMetadata,
  emptyProductImageSlots,
  ensureProductImageSlots,
  galleryFromProduct,
  normalizeProductGallery,
  primaryProductImageUrl,
  toStoredProductImageUrl,
} from './productImages';
import { enrichSuccessMessage } from './enrichMessages';
import { formatMoney } from '../../lib/currency';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';

const emptyForm = {
  sku: '',
  name: '',
  brand: '',
  description: '',
  details_html: '',
  price: '0',
  purchase_price: '0',
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
  | 'purchase_price'
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
  purchase_price: '0',
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
  const usableMrp = usableEnrichmentAmount(data.mrp);
  const usableGst = usableEnrichmentAmount(data.gst_rate);
  const categorySlug = (data.category || '').trim();
  const isOther = categorySlug === 'other';
  // Do not copy description into product details — they are separate fields.
  const detailsHtml = (data.details_html || '').trim() || current.details_html;
  const packSize = packSizeFromEnrichment(data);
  return {
    ...current,
    sku: data.sku || data.code || current.sku,
    name: data.name || '',
    brand: data.brand || '',
    description: data.description || '',
    details_html: detailsHtml,
    pack_size: packSize || current.pack_size,
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
    purchase_price: String(product.purchase_price ?? '0'),
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
  const { t } = useTranslation();
  const tp = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.products.${key}`, options));
  const slotLabel = (index: number) =>
    index === 0 ? tp('slotPrimary') : index === 1 ? tp('slotBack') : tp('slotN', { n: index + 1 });
  const [searchParams, setSearchParams] = useSearchParams();
  const deepProductId = searchParams.get('product');
  const openedDeepProduct = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [debouncedBrand, setDebouncedBrand] = useState('');
  const [missingFilter, setMissingFilter] = useState<MissingFieldFilter>('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [barcodeLookup, setBarcodeLookup] = useState('');
  const [nameLookup, setNameLookup] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const dialog = useDialog();
  const auth = useAuth();
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [visibleColumns, setVisibleColumns] = useState<ProductColumnId[]>(() =>
    loadProductColumns(workspace.businessId),
  );
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const entitledFeatures = useMemo(() => {
    const snapshot = billingQuery.data;
    return [
      ...((snapshot?.entitled_features as string[] | undefined) ?? []),
      ...((snapshot?.features as string[] | undefined) ?? []),
    ];
  }, [billingQuery.data]);
  const canRemoveBackground = entitledFeatures.includes('shopie_product_bg_remove');
  const canScanInvoice = entitledFeatures.includes('shopie_invoice_scan');
  const canSeeProfit = hasBiFeature(billingQuery.data, 'profit', 'shopie');
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const packPhotoRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBrand(brandFilter.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [brandFilter]);
  useEffect(() => {
    setVisibleColumns(loadProductColumns(workspace.businessId));
  }, [workspace.businessId]);
  const products = useShopProducts(debouncedSearch, status, category, {
    stock: stockFilter || undefined,
    brand: debouncedBrand || undefined,
    ...missingFieldQuery(missingFilter),
    pageSize,
    cursor,
  });
  const godownsQuery = useShopGodowns();
  const godowns = godownsQuery.data ?? [];
  const categoriesQuery = useQuery({
    queryKey: ['shop-product-categories', workspace.activeBusiness?.id],
    enabled: Boolean(workspace.activeBusiness?.id),
    queryFn: async () => {
      const bid = workspace.activeBusiness?.id;
      const response = await client.shop.listProductCategories(bid ? { business_id: bid } : undefined);
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
  const [cropPending, setCropPending] = useState<{ index: number; file: File; previewUrl: string } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkGst, setBulkGst] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEnrichBusy, setBulkEnrichBusy] = useState<BulkEnrichMode | null>(null);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState({ done: 0, total: 0 });
  const [showBulkHint, setShowBulkHint] = useState(() => {
    try {
      return window.localStorage.getItem('shop.bulkHint.dismissed') !== '1';
    } catch {
      return true;
    }
  });

  const pageRows = products.data?.items ?? [];
  const nextCursor = products.data?.nextCursor ?? null;
  const previousCursor = products.data?.previousCursor ?? null;

  useEffect(() => {
    setCursor(null);
    setCursorStack([null]);
    setSelectedIds([]);
  }, [debouncedSearch, status, category, stockFilter, debouncedBrand, missingFilter, pageSize]);

  function toggleColumn(id: ProductColumnId) {
    setVisibleColumns((current) => {
      const next = current.includes(id) ? current.filter((col) => col !== id) : [...current, id];
      const ordered = PRODUCT_COLUMN_IDS.filter((col) => next.includes(col));
      const safe = ordered.length ? ordered : [...DEFAULT_PRODUCT_COLUMNS];
      saveProductColumns(workspace.businessId, safe);
      return safe;
    });
  }

  const showCol = (id: ProductColumnId) => visibleColumns.includes(id);

  // Filters only apply to columns the user chose to show.
  useEffect(() => {
    if (!showCol('status') && status) setStatus('');
    if (!showCol('category') && category) setCategory('');
    if (!showCol('stock') && stockFilter) setStockFilter('');
    if (!showCol('brand') && brandFilter) setBrandFilter('');
    if (missingFilter === 'barcode' && !showCol('barcode')) setMissingFilter('');
    if (missingFilter === 'image' && !showCol('image')) setMissingFilter('');
    if (missingFilter === 'hsn' && !showCol('hsn')) setMissingFilter('');
    if (missingFilter === 'sku' && !showCol('sku')) setMissingFilter('');
  }, [visibleColumns, status, category, stockFilter, brandFilter, missingFilter]);

  const columnFilters = useMemo(() => {
    const filters: Array<{
      id: string;
      label: string;
      value: string;
      onChange: (value: string) => void;
      options: Array<{ value: string; label: string }>;
    }> = [];
    if (showCol('status')) {
      filters.push({
        id: 'status',
        label: tp('status'),
        value: status,
        onChange: setStatus,
        options: [
          { value: '', label: tp('allStatuses') },
          { value: 'active', label: tp('statuses.active') },
          { value: 'draft', label: tp('statuses.draft') },
          { value: 'inactive', label: tp('statuses.inactive') },
          { value: 'archived', label: tp('statuses.archived') },
        ],
      });
    }
    if (showCol('category')) {
      filters.push({
        id: 'category',
        label: tp('category'),
        value: category,
        onChange: setCategory,
        options: [
          { value: '', label: tp('allCategories') },
          ...categoryOptions.map((item) => ({
            value: item.slug,
            label: item.label,
          })),
        ],
      });
    }
    if (showCol('stock')) {
      filters.push({
        id: 'stock',
        label: tp('stock'),
        value: stockFilter,
        onChange: setStockFilter,
        options: [
          { value: '', label: tp('allStock') },
          { value: 'in_stock', label: tp('inStock') },
          { value: 'low', label: tp('lowStock') },
          { value: 'out', label: tp('outOfStock') },
        ],
      });
    }
    const missingOptions = [
      { value: '', label: tp('missingNone') },
      ...(showCol('barcode') ? [{ value: 'barcode', label: tp('missingBarcode') }] : []),
      ...(showCol('image') ? [{ value: 'image', label: tp('missingImage') }] : []),
      ...(showCol('hsn') ? [{ value: 'hsn', label: tp('missingHsn') }] : []),
      ...(showCol('sku') ? [{ value: 'sku', label: tp('missingSku') }] : []),
    ];
    if (missingOptions.length > 1) {
      filters.push({
        id: 'missing',
        label: tp('missingAny'),
        value: missingFilter,
        onChange: (value) => setMissingFilter(value as MissingFieldFilter),
        options: missingOptions,
      });
    }
    return filters;
  }, [
    visibleColumns,
    status,
    category,
    stockFilter,
    missingFilter,
    categoryOptions,
    tp,
  ]);

  const pageIds = useMemo(() => pageRows.map((product) => product.id), [pageRows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  function goNextPage() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, cursor]);
    setCursor(nextCursor);
  }

  function goPreviousPage() {
    setCursorStack((stack) => {
      if (stack.length <= 1) {
        setCursor(null);
        return [null];
      }
      const nextStack = stack.slice(0, -1);
      setCursor(nextStack[nextStack.length - 1] ?? null);
      return nextStack;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectPage() {
    setSelectedIds((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
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
      snackbar.push(tp('chooseChange'), 'error');
      return;
    }
    try {
      const result = await patchBulk.mutateAsync({ ids, updates });
      const failed = result.errors.length;
      if (result.updated.length && !failed) {
        snackbar.push(tp('updatedCount', { count: result.updated.length }), 'success');
        setSelectedIds([]);
        setBulkOpen(false);
        setBulkStatus('');
        setBulkCategory('');
        setBulkGst('');
        setBulkPrice('');
        setBulkPercent('');
      } else if (result.updated.length) {
        snackbar.push(tp('partialUpdate', { updated: result.updated.length, failed }), 'info');
      } else {
        snackbar.push(result.errors[0]?.message || tp('bulkFailed'), 'error');
      }
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : tp('bulkFailed'), 'error');
    }
  }

  async function applyBulkEnrich(mode: BulkEnrichMode) {
    if (!businessId || !selectedIds.length || bulkEnrichBusy) return;
    const productsById = new Map(pageRows.map((product) => [product.id, product]));
    const ids = selectedIds.slice(0, BULK_ENRICH_LIMIT);
    const eligible = ids.filter((id) => {
      const product = productsById.get(id);
      if (!product) return false;
      return Boolean(enrichmentLookupForProduct(product, mode));
    });
    if (!eligible.length) {
      snackbar.push(tp(mode === 'barcode' ? 'bulkEnrichNeedBarcode' : 'bulkEnrichNeedName'), 'error');
      return;
    }
    setBulkEnrichBusy(mode);
    setBulkEnrichProgress({ done: 0, total: eligible.length });
    try {
      const result = await runBulkProductEnrich({
        productsById,
        ids: eligible,
        mode,
        businessId,
        enrich: async (payload) => {
          const response = await client.shop.enrichBarcode({
            business_id: businessId,
            ...payload,
          });
          return response.data;
        },
        patch: async (productId, body) => {
          await client.shop.patchProduct(productId, body);
        },
        onProgress: setBulkEnrichProgress,
      });
      await queryClient.invalidateQueries({ queryKey: ['shop-products'] });
      await queryClient.invalidateQueries({ queryKey: ['shop-godowns'] });
      if (result.updated && !result.failed && !result.skipped) {
        snackbar.push(tp('bulkEnrichDone', { updated: result.updated }), 'success');
        setSelectedIds([]);
      } else if (result.updated) {
        snackbar.push(
          tp('bulkEnrichPartial', {
            updated: result.updated,
            skipped: result.skipped,
            failed: result.failed,
          }),
          'info',
        );
      } else if (result.failed) {
        snackbar.push(result.errors[0]?.message || tp('bulkFailed'), 'error');
      } else {
        snackbar.push(tp('bulkEnrichNone'), 'info');
      }
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : tp('bulkFailed'), 'error');
    } finally {
      setBulkEnrichBusy(null);
      setBulkEnrichProgress({ done: 0, total: 0 });
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

  function closeProductDialog() {
    dialog.hide();
    if (searchParams.has('product')) {
      const next = new URLSearchParams(searchParams);
      next.delete('product');
      setSearchParams(next, { replace: true });
      openedDeepProduct.current = null;
    }
  }

  useEffect(() => {
    if (!deepProductId || openedDeepProduct.current === deepProductId || !client) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getProduct(deepProductId);
        if (cancelled || !response.data) return;
        openedDeepProduct.current = deepProductId;
        openEditDialog(response.data);
      } catch {
        snackbar.push(tp('openFailed'), 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepProductId, client]);

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
              product_id: editingId || undefined,
              image_url: payload.image_url,
              use_smart_lookup: payload.use_smart_lookup ?? true,
            }
          : {
              query: payload.query || '',
              product_id: editingId || undefined,
              image_url: payload.image_url,
              use_smart_lookup: payload.use_smart_lookup ?? true,
            },
      );

      if (data.existing_product_id && data.existing_product_id !== editingId) {
        const alreadyText =
          data.message || tp('alreadyInCatalog', { name: data.existing_product_name });
        setMessage(alreadyText);
        snackbar.push(alreadyText, 'info');
        if (!editingId) {
          const existing = pageRows.find((row) => row.id === data.existing_product_id);
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
                ? tp('noMatchPhoto')
                : tp('noMatchBarcode')),
          );
        } else {
          setMessage(data.message || tp('noMatchName'));
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
      const filled = data.name || tp('defaultName');
      const successText = enrichSuccessMessage(data, {
        editing: Boolean(editingId),
        filledName: filled,
      });
      snackbar.push(successText, 'success');
      setMessage(successText);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tp('lookupFailed'));
    } finally {
      setLookingUp(false);
    }
  }

  async function runSmartPackPhoto(file: File | null) {
    if (!file || !auth.token || !workspace.tenantId || !businessId) return;
    setLookingUp(true);
    setMessage(tp('readingPhoto'));
    try {
      const url = await uploadProductImage({
        accessToken: auth.token,
        tenantId: workspace.tenantId,
        businessId,
        imageFile: file,
        label: tp('packPhotoLabel'),
      });
      const stored = toStoredProductImageUrl(url) || url;
      await runEnrich({
        code: form.barcode || barcodeLookup,
        image_url: stored,
        use_smart_lookup: true,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tp('readPhotoFailed'));
      setLookingUp(false);
    }
  }

  function beginCropAt(index: number, file: File | null) {
    if (!file || index < 0 || index >= MAX_PRODUCT_IMAGES) return;
    if (cropPending?.previewUrl) URL.revokeObjectURL(cropPending.previewUrl);
    setCropPending({ index, file, previewUrl: URL.createObjectURL(file) });
    setMessage(null);
  }

  async function confirmCrop(
    crop: ProductImageCropResult,
    options?: { removeBackground: boolean },
  ) {
    if (!cropPending || !auth.token || !workspace.tenantId || !businessId) return;
    const { index, file, previewUrl } = cropPending;
    setCropPending(null);
    URL.revokeObjectURL(previewUrl);
    setUploadingIndex(index);
    setMessage(null);
    try {
      const url = await uploadProductImage({
        accessToken: auth.token,
        tenantId: workspace.tenantId,
        businessId,
        imageFile: file,
        label: slotLabel(index),
        prepareProductCanvas: true,
        removeBackground: Boolean(options?.removeBackground),
        crop,
      });
      const stored = toStoredProductImageUrl(url) || url;
      setForm((current) => {
        const next = ensureProductImageSlots(current.images);
        next[index] = stored;
        return { ...current, images: next };
      });
      setMessage(
        index === 0
          ? tp('primaryUploaded')
          : tp('slotUploaded', { label: slotLabel(index) }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tp('uploadFailed'));
    } finally {
      setUploadingIndex(null);
    }
  }

  function cancelCrop() {
    if (cropPending?.previewUrl) URL.revokeObjectURL(cropPending.previewUrl);
    setCropPending(null);
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
      setMessage(tp('uploadPhotoFirst'));
      return;
    }
    setAnalyzing(true);
    setMessage(tp('analysingBg'));
    try {
      const job = await analyzePackaging.mutateAsync({
        front_image_url: front || undefined,
        back_image_url: back || undefined,
        hint: nameLookup || form.name || form.brand,
        async_mode: true,
      });
      if (job.status === 'done' && job.result) {
        setForm((current) => applyEnrichment(current, job.result!));
        setMessage(job.result.message || tp('fieldsUpdated'));
        return;
      }

      const started = Date.now();
      while (Date.now() - started < 60000) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const latest = await getPackagingAnalysis.mutateAsync(job.job_id);
        if (latest.status === 'done' && latest.result) {
          setForm((current) => applyEnrichment(current, latest.result!));
          setMessage(latest.result.message || tp('fieldsUpdated'));
          return;
        }
        if (latest.status === 'failed') {
          setMessage(latest.error || tp('analysisFailed'));
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
        setMessage(syncJob.result.message || tp('fieldsUpdated'));
      } else {
        setMessage(syncJob.error || tp('analysisTimeout'));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tp('analyseFailed'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!businessId || !form.name.trim()) return;
    if (form.category === 'other' && !form.category_other.trim()) {
      setMessage(tp('enterOtherCategory'));
      return;
    }
    setMessage(null);
    let categorySlug = form.category;
    if (form.category === 'other' || (form.category_other.trim() && !categorySlug)) {
      try {
        const created = await client.shop.ensureProductCategory({
          business_id: businessId,
          label: form.category_other.trim(),
        });
        categorySlug = created.data.slug;
        void queryClient.invalidateQueries({ queryKey: ['shop-product-categories', businessId] });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : tp('categoryCreateFailed'));
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
      purchase_price: form.purchase_price,
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
        closeProductDialog();
        window.setTimeout(() => snackbar.push(tp('saved'), 'success'), 0);
      } else {
        await create.mutateAsync(payload);
        closeProductDialog();
        window.setTimeout(() => snackbar.push(tp('added'), 'success'), 0);
      }
      setForm({ ...emptyForm, images: emptyProductImageSlots() });
      setEditingId(null);
      setBarcodeLookup('');
      setNameLookup('');
      setNeedsPackPhoto(false);
    } catch (error) {
      const text = error instanceof Error ? error.message : tp('saveFailed');
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
          searchPlaceholder={tp('searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setStatus('');
            setCategory('');
            setStockFilter('');
            setBrandFilter('');
            setMissingFilter('');
          }}
          filters={columnFilters}
          action={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {showCol('brand') ? (
                <input
                  type="search"
                  value={brandFilter}
                  onChange={(event) => setBrandFilter(event.target.value)}
                  placeholder={tp('brandFilterPlaceholder')}
                  aria-label={tp('brandFilter')}
                  style={{
                    borderRadius: 12,
                    border: '1px solid var(--border, #e5e7eb)',
                    padding: '10px 12px',
                    minWidth: 140,
                    background: 'var(--card, #fff)',
                  }}
                />
              ) : null}
              <Button type="button" variant="neutral" onClick={() => setColumnsOpen(true)}>
                {tp('columns')}
              </Button>
              {canSeeProfit ? (
                <Link to="/bi/profit">
                  <Button type="button" variant="neutral">
                    {tp('biProfit')}
                  </Button>
                </Link>
              ) : null}
              {canScanInvoice ? (
                <Link to="/shop/books/purchase/scan">
                  <Button type="button" variant="neutral">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Camera size={16} aria-hidden="true" />
                      {tp('scanInvoice')}
                    </span>
                  </Button>
                </Link>
              ) : null}
              <Link to="/shop/products/add-many">
                <Button type="button" variant="neutral">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Rows3 size={16} aria-hidden="true" />
                    {tp('addMany')}
                  </span>
                </Button>
              </Link>
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  {tp('addProduct')}
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
            <span>{tp('bulkHint')}</span>
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
              aria-label={tp('dismissHint')}
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

        {products.isLoading ? <p>{t('common.loading')}</p> : null}
        {products.error ? <p role="alert">{(products.error as Error).message}</p> : null}
        {pageRows.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={allPageSelected} onChange={toggleSelectPage} />
              {tp('selectPage', { count: pageRows.length })}
            </label>
            {selectedIds.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => setBulkOpen(true)}
                  disabled={Boolean(bulkEnrichBusy)}
                >
                  {tp('selectedEdit', { count: selectedIds.length })}
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => void applyBulkEnrich('barcode')}
                  loading={bulkEnrichBusy === 'barcode'}
                  disabled={Boolean(bulkEnrichBusy)}
                  aria-label={tp('a11yFetchBarcode', { n: selectedIds.length })}
                >
                  {bulkEnrichBusy === 'barcode'
                    ? tp('bulkEnrichBusy', bulkEnrichProgress)
                    : tp('fetchFromBarcode')}
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => void applyBulkEnrich('name')}
                  loading={bulkEnrichBusy === 'name'}
                  disabled={Boolean(bulkEnrichBusy)}
                  aria-label={tp('a11yFetchName', { n: selectedIds.length })}
                >
                  {bulkEnrichBusy === 'name'
                    ? tp('bulkEnrichBusy', bulkEnrichProgress)
                    : tp('fetchFromName')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <CursorPager
          count={pageRows.length}
          pageSize={pageSize}
          hasPrevious={cursorStack.length > 1 || Boolean(previousCursor)}
          hasNext={Boolean(nextCursor)}
          onPrevious={goPreviousPage}
          onNext={goNextPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          label={tp('paginationLabel')}
          disabled={products.isFetching}
        />
        <div style={{ display: 'grid', gap: 8 }}>
          {pageRows.map((product) => (
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
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(product.id)}
                  onChange={() => toggleSelected(product.id)}
                  aria-label={tp('selectProductAria', { name: product.name })}
                  style={{ marginTop: 20 }}
                />
                {showCol('image')
                  ? (() => {
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
                    })()
                  : null}
                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                  <strong>{product.name}</strong>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px 12px',
                      fontSize: 13,
                      opacity: 0.85,
                    }}
                  >
                    {showCol('status') ? <span>{product.status}</span> : null}
                    {showCol('category') && product.category ? (
                      <span>
                        {product.category_label ||
                          categoryOptions.find((item) => item.slug === product.category)?.label ||
                          product.category}
                      </span>
                    ) : null}
                    {showCol('brand') ? <span>{product.brand || tp('noBrand')}</span> : null}
                    {showCol('sku') ? <span>SKU {product.sku || '—'}</span> : null}
                    {showCol('barcode') ? (
                      <span>
                        {(product.barcodes ?? []).map((row) => row.code).filter(Boolean).join(', ') ||
                          tp('noBarcodes')}
                      </span>
                    ) : null}
                    {showCol('hsn') ? <span>HSN {product.hsn_sac || '—'}</span> : null}
                    {showCol('gst') ? (
                      <span>GST {product.gst_rate ?? product.tax_rate ?? 0}%</span>
                    ) : null}
                    {showCol('pack_size') && product.pack_size ? (
                      <span>{product.pack_size}</span>
                    ) : null}
                    {showCol('stock') ? <span>{tp('stockCount', { count: product.stock_on_hand })}</span> : null}
                    {showCol('price') ? (
                      <span>{formatMoney(Number(product.price ?? 0), product.currency)}</span>
                    ) : null}
                    {showCol('margin') && Number(product.avg_cost ?? product.purchase_price ?? 0) > 0 ? (
                      <span>
                        {tp('margin', {
                          amount: formatMoney(
                            Number(product.price ?? 0) -
                              Number(product.avg_cost ?? product.purchase_price ?? 0),
                            product.currency,
                          ),
                        })}
                      </span>
                    ) : null}
                    {showCol('photos')
                      ? (() => {
                          const count = normalizeProductGallery(galleryFromProduct(product)).length;
                          return count ? (
                            <span>{tp('photosCount', { count, max: MAX_PRODUCT_IMAGES })}</span>
                          ) : null;
                        })()
                      : null}
                  </div>
                  {showCol('description') && (product.description || product.details_html) ? (
                    <div style={{ fontSize: 12, opacity: 0.7, maxWidth: 520 }}>
                      {String(product.description || '')
                        .replace(/<[^>]+>/g, ' ')
                        .trim()
                        .slice(0, 140) || '—'}
                    </div>
                  ) : null}
                  {showCol('stock')
                    ? (() => {
                        const offices = officeStockFor(godowns, product.id);
                        if (offices.length < 2) return null;
                        return (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
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
                      })()
                    : null}
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => openEditDialog(product)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={14} aria-hidden="true" />
                  {tp('edit')}
                </span>
              </Button>
            </div>
          ))}
          {!products.isLoading && !pageRows.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>{tp('empty')}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    {tp('addFirst')}
                  </span>
                </Button>
                <Link to="/shop/products/add-many">
                  <Button type="button" variant="neutral">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Rows3 size={16} aria-hidden="true" />
                      {tp('addMany')}
                    </span>
                  </Button>
                </Link>
                {canScanInvoice ? (
                  <Link to="/shop/books/purchase/scan">
                    <Button type="button" variant="neutral">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Camera size={16} aria-hidden="true" />
                        {tp('scanInvoice')}
                      </span>
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <CursorPager
          count={pageRows.length}
          pageSize={pageSize}
          hasPrevious={cursorStack.length > 1 || Boolean(previousCursor)}
          hasNext={Boolean(nextCursor)}
          onPrevious={goPreviousPage}
          onNext={goNextPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          label={tp('paginationLabel')}
          disabled={products.isFetching}
        />
      </Card>

      <Dialog
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        title={tp('columnsTitle')}
        labelledBy="product-columns-dialog"
      >
        <div style={{ display: 'grid', gap: 10, minWidth: 260, maxWidth: 360, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>{t('common.name')} (always shown)</p>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>{tp('columnsFilterHint')}</p>
          {PRODUCT_COLUMN_IDS.map((id) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={visibleColumns.includes(id)}
                onChange={() => toggleColumn(id)}
              />
              {tp(
                (
                  {
                    image: 'colImage',
                    status: 'colStatus',
                    category: 'colCategory',
                    brand: 'colBrand',
                    sku: 'colSku',
                    barcode: 'colBarcode',
                    hsn: 'colHsn',
                    gst: 'colGst',
                    pack_size: 'colPackSize',
                    stock: 'colStock',
                    price: 'colPrice',
                    margin: 'colMargin',
                    photos: 'colPhotos',
                    description: 'colDescription',
                  } as const
                )[id],
              )}
            </label>
          ))}
          <Button type="button" variant="primary" onClick={() => setColumnsOpen(false)}>
            {t('common.done')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={bulkOpen && selectedIds.length > 0}
        onClose={() => setBulkOpen(false)}
        title={`${tp('bulkTitle', { count: selectedIds.length })}${selectedIds.length > 200 ? tp('bulkFirst200') : ''}`}
        labelledBy="bulk-edit-dialog"
        busy={patchBulk.isPending}
        busyMessage={tp('bulkBusy')}
      >
        <div style={{ display: 'grid', gap: 12, minWidth: 280, maxWidth: 420 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{tp('status')}</span>
            <select
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">{tp('keep')}</option>
              <option value="active">{tp('statuses.active')}</option>
              <option value="draft">{tp('statuses.draft')}</option>
              <option value="inactive">{tp('statuses.inactive')}</option>
              <option value="archived">{tp('statuses.archived')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{tp('category')}</span>
            <select
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">{tp('keep')}</option>
              {categoryOptions.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{tp('gstPercent')}</span>
              <input
                value={bulkGst}
                onChange={(event) => setBulkGst(event.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{tp('setPrice')}</span>
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
              <span style={{ fontSize: 12, opacity: 0.7 }}>{tp('pricePercent')}</span>
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
              {tp('clearSelection')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void applyBulkEdit()} loading={patchBulk.isPending}>
              {tp('apply')}
            </Button>
          </div>
        </div>
      </Dialog>

      <ProductImageCropModal
        open={Boolean(cropPending)}
        imageUrl={cropPending?.previewUrl || ''}
        onCancel={cancelCrop}
        canRemoveBackground={canRemoveBackground}
        onConfirm={(crop, options) => void confirmCrop(crop, options)}
      />

      {lightboxUrl ? (
        <div
          role="presentation"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setLightboxUrl(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label={tp('close')}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: 22,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
          <img
            src={lightboxUrl}
            alt={tp('productPhotoAlt')}
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: 'min(96vw, 960px)',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 8,
              background: 'transparent',
            }}
          />
        </div>
      ) : null}

      <Dialog
        open={dialog.open}
        onClose={closeProductDialog}
        title={editingId ? tp('editTitle') : tp('addTitle')}
        labelledBy="product-dialog"
        busy={saving || lookingUp || enrich.isPending || analyzing || uploadingIndex !== null}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            {tp('photosIntro', { max: MAX_PRODUCT_IMAGES })}
          </p>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            {imageSlots.map((url, index) => (
              <label key={index} style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  {slotLabel(index)}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => beginCropAt(index, event.target.files?.[0] ?? null)}
                />
                {url ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(resolveMediaAssetUrl(url) || url)}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'zoom-in',
                        borderRadius: 12,
                      }}
                      aria-label={tp('viewFullSize', { label: slotLabel(index) })}
                    >
                      <img
                        src={resolveMediaAssetUrl(url) || url}
                        alt=""
                        width={96}
                        height={96}
                        style={{
                          objectFit: 'cover',
                          borderRadius: 12,
                          border: '1px solid #e5e7eb',
                          display: 'block',
                        }}
                      />
                    </button>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button
                        type="button"
                        variant="neutral"
                        onClick={() => {
                          const input = document.getElementById(
                            `product-image-restart-${index}`,
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                      >
                        {tp('restart')}
                      </Button>
                      <Button type="button" variant="neutral" onClick={() => removeImageAt(index)}>
                        {tp('remove')}
                      </Button>
                    </div>
                    <input
                      id={`product-image-restart-${index}`}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        beginCropAt(index, event.target.files?.[0] ?? null);
                        event.target.value = '';
                      }}
                    />
                  </div>
                ) : null}
                {uploadingIndex === index ? <span style={{ fontSize: 12 }}>{tp('uploading')}</span> : null}
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
              ? tp('analysing')
              : uploadingIndex !== null
                ? tp('uploadingPhoto', { n: uploadingIndex + 1 })
                : tp('analysePhotos')}
          </Button>

          <label style={{ display: 'grid', gap: 8 }}>
            {tp('barcodeScanner')}
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
                placeholder={tp('scanPlaceholder')}
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
                {lookingUp || enrich.isPending ? tp('lookingUp') : tp('lookupBarcode')}
              </Button>
              <Button type="button" variant="neutral" onClick={() => setCameraOpen((open) => !open)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={16} aria-hidden="true" />
                  {cameraOpen ? tp('hideCamera') : tp('camera')}
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
                {tp('lookingUpStatus')}
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
                  {tp('noCatalogMatch')}
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
                    {tp('takePackPhoto')}
                  </Button>
                  <span style={{ fontSize: 12, color: '#b45309' }}>{tp('smartWalletNote')}</span>
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
            {tp('orSearchByName')}
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
                placeholder={tp('namePlaceholder')}
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button
                type="button"
                variant="neutral"
                onClick={() => void runEnrich({ query: nameLookup.trim() })}
                disabled={enrich.isPending || !nameLookup.trim()}
              >
                {tp('searchOnline')}
              </Button>
            </div>
          </label>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            {(
              [
                ['name', true],
                ['brand', false],
                ['sku', false],
                ['price', false],
                ['purchase_price', false],
                ['tax_rate', false],
                ['gst_rate', false],
                ['hsn_sac', false],
                ['stock_on_hand', false],
                ['low_stock_threshold', false],
                ['pack_size', false],
              ] as const
            ).map(([key, required]) => (
              <label key={key} style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp(`fields.${key}`)}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={required}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                {key === 'purchase_price' &&
                Number(form.price) > 0 &&
                Number(form.purchase_price) >= 0 ? (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {tp('estMargin')}{' '}
                    {formatMoney(Number(form.price) - Number(form.purchase_price), form.currency)}
                    {Number(form.price) > 0
                      ? ` (${(
                          ((Number(form.price) - Number(form.purchase_price)) / Number(form.price)) *
                          100
                        ).toFixed(1)}%)`
                      : ''}
                  </span>
                ) : null}
              </label>
            ))}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('barcodeRfid')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder={tp('scanOrType')}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Button type="button" variant="neutral" onClick={() => setCameraOpen(true)} aria-label={tp('scanWithCamera')}>
                  <Camera size={16} aria-hidden="true" />
                </Button>
              </div>
            </label>
            {godowns.length ? (
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  {editingId ? tp('godownForChanges') : tp('stockGodown')}
                </span>
                <select
                  value={form.godown_id}
                  onChange={(e) => setForm({ ...form, godown_id: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                >
                  {godowns.map((godown) => (
                    <option key={godown.id} value={godown.id}>
                      {godown.is_default ? tp('godownDefault', { name: godown.name }) : godown.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('currency')}</span>
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
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('barcodeType')}</span>
              <select
                value={form.barcode_type}
                onChange={(e) => setForm({ ...form, barcode_type: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="manufacturer">{tp('barcodeTypes.manufacturer')}</option>
                <option value="internal">{tp('barcodeTypes.internal')}</option>
                <option value="rfid_epc">{tp('barcodeTypes.rfid_epc')}</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('status')}</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="active">{tp('statuses.active')}</option>
                <option value="draft">{tp('statuses.draft')}</option>
                <option value="inactive">{tp('statuses.inactive')}</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('category')}</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, category_other: e.target.value === 'other' ? form.category_other : '' })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="">{tp('selectCategory')}</option>
                {categoryOptions.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.label}
                  </option>
                ))}
                {!categoryOptions.some((item) => item.slug === 'other') ? (
                  <option value="other">{tp('other')}</option>
                ) : null}
              </select>
            </label>
            {form.category === 'other' ? (
              <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('newCategoryName')}</span>
                <input
                  value={form.category_other}
                  onChange={(e) => setForm({ ...form, category_other: e.target.value })}
                  required
                  placeholder={tp('categoryPlaceholder')}
                  autoFocus
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #93c5fd',
                    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.12)',
                  }}
                />
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {tp('categoryHint')}
                </span>
              </label>
            ) : null}
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('descriptionLabel')}</span>
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
              {saving ? tp('saving') : editingId ? tp('updateProduct') : tp('saveProduct')}
            </Button>
            <Button type="button" variant="neutral" onClick={closeProductDialog} disabled={saving}>
              {tp('cancel')}
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
