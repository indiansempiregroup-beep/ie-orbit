import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { ShopBarcodeEnrichment, ShopGodown, ShopProduct } from '@ie-platform/sdk';
import { SHOP_PRODUCT_CATEGORIES, guessShopProductCategory } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { HtmlEditorField } from '../../components/HtmlEditorField';
import { useDialog } from '../../hooks/useDialog';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopGodowns, useShopProductMutations, useShopProducts } from './shopHooks';
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
};

type FormState = typeof emptyForm;

function applyEnrichment(current: FormState, data: ShopBarcodeEnrichment): FormState {
  const guessed = guessShopProductCategory(data.categories);
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
    sku: data.sku || data.code || current.sku,
    name: data.name || current.name,
    brand: data.brand || current.brand,
    description: data.description || current.description,
    pack_size: data.pack_size || data.serving_size || current.pack_size,
    images: nextImages,
    barcode: data.code || current.barcode,
    barcode_type: data.code ? 'manufacturer' : current.barcode_type,
    category: guessed || current.category,
  };
}

function formFromProduct(product: ShopProduct): FormState {
  const primaryBarcode = product.barcodes?.find((row) => row.is_primary) || product.barcodes?.[0];
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
    category: product.category || '',
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

export function ShopProductsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [barcodeLookup, setBarcodeLookup] = useState('');
  const [nameLookup, setNameLookup] = useState('');
  const dialog = useDialog();
  const auth = useAuth();
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const products = useShopProducts(search, status, category);
  const godownsQuery = useShopGodowns();
  const godowns = godownsQuery.data ?? [];
  const { create, update, enrich, analyzePackaging, getPackagingAnalysis, businessId } =
    useShopProductMutations();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

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

  async function runEnrich(payload: { code?: string; query?: string }) {
    setMessage(null);
    try {
      const data = await enrich.mutateAsync(payload.code ? { code: payload.code } : { query: payload.query || '' });
      if (!data.found) {
        if (payload.code) {
          setForm((current) => ({
            ...current,
            barcode: payload.code || current.barcode,
            sku: payload.code || current.sku,
          }));
          setMessage('No online match for this barcode — fill details manually and save.');
        } else {
          setMessage(data.message || 'No online match — try another name or scan the barcode.');
        }
        return;
      }
      setForm((current) => applyEnrichment(current, data));
      setBarcodeLookup(data.code || payload.code || '');
      setMessage(`Prefill from ${data.source ?? 'catalog'}. Review price/stock, then save.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lookup failed.');
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
      setMessage(`${productImageSlotLabel(index)} uploaded.`);
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
    setMessage(null);
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
      ...(form.category ? { category: form.category } : { category: '' }),
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
                ...SHOP_PRODUCT_CATEGORIES.map((item) => ({
                  value: item.value,
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
            <Button type="button" variant="primary" onClick={openAddDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                Add product
              </span>
            </Button>
          }
        />

        {products.isLoading ? <p>Loading…</p> : null}
        {products.error ? <p role="alert">{(products.error as Error).message}</p> : null}
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
                      ? ` · ${
                          SHOP_PRODUCT_CATEGORIES.find((item) => item.value === product.category)?.label ||
                          product.category
                        }`
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
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Add your first product
                </span>
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit product' : 'Add product'}
        labelledBy="product-dialog"
        busy={saving || enrich.isPending || analyzing || uploadingIndex !== null}
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
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button
                type="button"
                variant="neutral"
                onClick={() => void runEnrich({ code: barcodeLookup.trim() })}
                disabled={enrich.isPending || !barcodeLookup.trim()}
              >
                {enrich.isPending ? 'Looking up…' : 'Lookup barcode'}
              </Button>
            </div>
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
                ['barcode', 'Barcode / RFID EPC', false],
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
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="">Select category</option>
                {SHOP_PRODUCT_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
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
