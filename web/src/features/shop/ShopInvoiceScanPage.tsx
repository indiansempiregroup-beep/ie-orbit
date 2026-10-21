import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { SHOP_PRODUCT_CATEGORIES, type ShopInvoiceScanDraft, type ShopInvoiceScanLine } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useApiClient } from '../../hooks/useApiClient';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { SmartLookupUpiPaySheet } from '../settings/SmartLookupUpiPaySheet';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { applyEnrichmentToScanLine, applyShopProductToScanLine, looksLikeBarcode } from './invoiceScanLines';
import { uploadProductImage } from './uploadProductImage';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { formatMoney } from '../../lib/currency';

function formatWallet(paise?: number | null, currency = 'INR') {
  return formatMoney(Number(paise || 0) / 100, currency);
}

const PRODUCT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

function stockAfter(line: ShopInvoiceScanLine) {
  const now = Number(line.stock_on_hand || 0);
  const qty = Number(line.qty || 0);
  if (Number.isNaN(now) || Number.isNaN(qty)) return line.qty || '0';
  return String(now + qty);
}

function LineCatalogFields({
  line,
  patch,
}: {
  line: ShopInvoiceScanLine;
  patch: (next: Partial<ShopInvoiceScanLine>) => void;
}) {
  const categories = SHOP_PRODUCT_CATEGORIES.some((item) => item.value === line.category)
    ? SHOP_PRODUCT_CATEGORIES
    : line.category
      ? [{ value: line.category, label: line.category }, ...SHOP_PRODUCT_CATEGORIES]
      : SHOP_PRODUCT_CATEGORIES;
  return (
    <div className="invoice-scan-extra">
      <label>
        Qty
        <input value={line.qty} onChange={(event) => patch({ qty: event.target.value })} />
      </label>
      <label>
        Purchase price
        <input value={line.rate} onChange={(event) => patch({ rate: event.target.value })} />
      </label>
      <label>
        Selling price
        <input
          value={line.price || ''}
          placeholder="MRP from bill"
          onChange={(event) => patch({ price: event.target.value })}
        />
      </label>
      <label>
        SKU
        <input value={line.sku || ''} onChange={(event) => patch({ sku: event.target.value })} />
      </label>
      <label>
        GST
        <input value={line.gst_rate || ''} onChange={(event) => patch({ gst_rate: event.target.value })} />
      </label>
      <label>
        HSN
        <input value={line.hsn_sac || ''} onChange={(event) => patch({ hsn_sac: event.target.value })} />
      </label>
      <label>
        Brand
        <input value={line.brand || ''} onChange={(event) => patch({ brand: event.target.value })} />
      </label>
      <label>
        Pack size / quantity
        <input
          value={line.pack_size || ''}
          placeholder="e.g. 1 kg, 12 pcs"
          onChange={(event) => patch({ pack_size: event.target.value })}
        />
      </label>
      <label>
        Status
        <select value={line.status || 'active'} onChange={(event) => patch({ status: event.target.value })}>
          {PRODUCT_STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={line.category || ''} onChange={(event) => patch({ category: event.target.value })}>
          <option value="">—</option>
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Currency
        <select value={line.currency || 'INR'} onChange={(event) => patch({ currency: event.target.value })}>
          {(line.currency && !CURRENCIES.includes(line.currency) ? [line.currency, ...CURRENCIES] : CURRENCIES).map(
            (code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ),
          )}
        </select>
      </label>
      <div>
        <span>GST on sell price</span>
        <div className="invoice-scan-chips">
          <button
            type="button"
            className={line.tax_inclusive ? undefined : 'is-on'}
            onClick={() => patch({ tax_inclusive: false })}
          >
            GST excluded
          </button>
          <button
            type="button"
            className={line.tax_inclusive ? 'is-on' : undefined}
            onClick={() => patch({ tax_inclusive: true })}
          >
            GST included
          </button>
        </div>
      </div>
      <label>
        On hand
        <input value={line.stock_on_hand || '0'} readOnly />
      </label>
      <label>
        After this bill
        <input value={stockAfter(line)} readOnly />
      </label>
      <label className="is-wide">
        Description
        <textarea
          rows={2}
          value={line.description || ''}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>
      <label className="is-wide">
        Product details
        <textarea
          rows={2}
          value={line.details_html || ''}
          onChange={(event) => patch({ details_html: event.target.value })}
        />
      </label>
    </div>
  );
}

export function ShopInvoiceScanPage() {
  const client = useApiClient();
  const auth = useAuth();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const businessId = workspace.businessId || '';
  const tenantId = workspace.tenantId || '';

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
  const [cameraLine, setCameraLine] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const readyLines = useMemo(
    () => (draft?.lines || []).filter((line) => !line.skip && (line.product_id || line.create || line.name)),
    [draft],
  );

  async function handleFiles(files: FileList | null) {
    if (!files?.length || !auth.token || !tenantId || !businessId) return;
    const remaining = Math.max(0, 6 - imageUrls.length);
    if (!remaining) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        uploaded.push(
          await uploadProductImage({
            accessToken: auth.token,
            tenantId,
            businessId,
            imageFile: file,
            label: 'Vendor invoice',
            prepareProductCanvas: false,
          }),
        );
      }
      setImageUrls((current) => [...current, ...uploaded].slice(0, 6));
      setDraft(null);
      setChargedPaise(0);
      setBalanceAfter(null);
      setChargeMessage('');
      snackbar.push(`Uploaded ${uploaded.length} photo${uploaded.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't upload that photo."), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function analyze() {
    if (!businessId || !imageUrls.length) return;
    setAnalyzing(true);
    try {
      const response = await client.shop.analyzePurchaseInvoice({
        business_id: businessId,
        image_urls: imageUrls,
      });
      const data = response.data;
      if (!data.ok || !data.draft) {
        if (data.source === 'smart_lookup_no_balance') setTopUpOpen(true);
        snackbar.push(data.message || "Couldn't read that invoice.", 'error');
        return;
      }
      setDraft({ ...data.draft, usage_id: data.usage_id, image_urls: imageUrls });
      setChargedPaise(Number(data.charged_paise || 0));
      setBalanceAfter(data.balance_after_paise ?? null);
      setChargeCurrency(data.charge_currency || 'INR');
      setChargeMessage(data.message || '');
      snackbar.push(data.message || 'Invoice read. Review the lines.', 'success');
    } catch (error) {
      const message = getApiErrorMessage(error, "Couldn't read that invoice.");
      if (/wallet|balance|top up/i.test(message)) setTopUpOpen(true);
      snackbar.push(message, 'error');
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
    const line = draft?.lines[index];
    if (!businessId || !line) return;
    const code = (overrideCode ?? line.barcode ?? '').trim();
    const query = line.name.trim();
    if (!code && !query) {
      snackbar.push('Type or scan a barcode, or keep the product name, then Fetch.', 'error');
      return;
    }
    setFetchingIndex(index);
    try {
      if (code) {
        try {
          const existing = await client.shop.lookupBarcode({ business_id: businessId, code });
          patchLine(index, applyShopProductToScanLine({ ...line, barcode: code }, existing.data, code));
          snackbar.push(`Matched ${existing.data.name} in your catalog.`, 'success');
          return;
        } catch {
          // New barcode — fill from the free catalog next.
        }
      }
      const response = await client.shop.enrichBarcode({
        business_id: businessId,
        ...(code && looksLikeBarcode(code) ? { code } : { query: code || query }),
      });
      const next = applyEnrichmentToScanLine({ ...line, barcode: code || line.barcode }, response.data);
      patchLine(index, next);
      if (response.data.found) {
        snackbar.push(response.data.name ? `Fetched ${response.data.name}.` : 'Catalog details added.', 'success');
      } else {
        snackbar.push(response.data.message || 'No catalog match. Add the barcode or fill the product.', 'info');
      }
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't fetch that product."), 'error');
    } finally {
      setFetchingIndex(null);
    }
  }

  async function replaceLinePhoto(index: number, file: File | null) {
    if (!file || !auth.token || !tenantId || !businessId) return;
    setPhotoBusy(index);
    try {
      const url = await uploadProductImage({
        accessToken: auth.token,
        tenantId,
        businessId,
        imageFile: file,
        label: draft?.lines[index]?.name || 'Product',
        prepareProductCanvas: true,
      });
      patchLine(index, { image_url: url, use_image: true, image_source: 'upload' });
      snackbar.push('Product photo updated.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't upload that product photo."), 'error');
    } finally {
      setPhotoBusy(null);
    }
  }

  async function confirm() {
    if (!businessId || !draft) return;
    setConfirming(true);
    try {
      const response = await client.shop.confirmPurchaseInvoice({
        business_id: businessId,
        draft,
        create_missing: true,
        create_supplier: Boolean(draft.supplier.create),
      });
      snackbar.push(`Posted ${response.data.voucher_number}.`, 'success');
      navigate(`/shop/books/purchase/${response.data.voucher_id}`);
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't post that purchase."), 'error');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <div>
          <h1 className="invoice-page-title">Scan vendor invoice</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Photograph the supplier bill. Invoice photos use more tokens than a pack photo — the exact
            AI wallet charge appears after the scan.
          </p>
        </div>
        <Link to="/shop/books/purchase">
          <Button type="button" variant="ghost">
            Back to purchases
          </Button>
        </Link>
      </div>

      {chargeMessage || chargedPaise > 0 ? (
        <p className="invoice-banner is-charge" role="status">
          <strong>
            {chargedPaise > 0
              ? `AI wallet charge ${formatWallet(chargedPaise, chargeCurrency)}`
              : 'No AI wallet charge'}
          </strong>
          {balanceAfter != null ? `Wallet balance ${formatWallet(balanceAfter, chargeCurrency)}` : chargeMessage}
        </p>
      ) : null}

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <Button type="button" variant="primary" disabled={!imageUrls.length || uploading || analyzing} onClick={() => void analyze()}>
            {analyzing ? 'Reading invoice…' : 'Extract with AI'}
          </Button>
        </div>
        {imageUrls.length ? (
          <>
            <p className="muted" style={{ marginTop: 12 }}>
              {imageUrls.length} photo{imageUrls.length === 1 ? '' : 's'} ready. Tap a photo to preview.
              {uploading ? ' Uploading…' : ''}
            </p>
            <div className="invoice-scan-bill-thumbs">
              {imageUrls.map((url, index) => {
                const preview = resolveMediaAssetUrl(url) || url;
                return (
                  <div key={`${url}-${index}`} className="invoice-scan-bill-item">
                    <button
                      type="button"
                      className="invoice-scan-bill-thumb"
                      onClick={() => setLightboxUrl(preview)}
                      aria-label={`Preview invoice photo ${index + 1}`}
                    >
                      <img src={preview} alt="" />
                    </button>
                    <button type="button" className="invoice-clear" onClick={() => setLightboxUrl(preview)}>
                      Preview
                    </button>
                    <button
                      type="button"
                      className="invoice-clear"
                      onClick={() =>
                        setImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </Card>

      {draft ? (
        <>
        <Card>
          {draft.duplicate?.found ? <p className="invoice-banner is-warn">{draft.duplicate.message}</p> : null}
          {draft.totals_mismatch ? (
            <p className="invoice-banner is-warn">Line totals do not match the printed grand total. Check qty and rates.</p>
          ) : null}
          {!draft.lines.length ? (
            <p className="invoice-banner is-warn">No products were read. Try a flatter, well-lit photo of the full bill.</p>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Input
              label="Supplier"
              value={draft.supplier.name || ''}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, supplier: { ...current.supplier, name: event.target.value } } : current,
                )
              }
            />
            <Input
              label="GSTIN"
              value={draft.supplier.gstin || draft.header.gstin || ''}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, supplier: { ...current.supplier, gstin: event.target.value } } : current,
                )
              }
            />
            <Input label="Invoice no." value={draft.header.invoice_number || ''} readOnly />
            <Input label="Date" value={draft.header.invoice_date || ''} readOnly />
            <Input label="Printed total" value={draft.header.grand_total || ''} readOnly />
          </div>
          {draft.supplier.match ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Supplier matched by {draft.supplier.match}.
            </p>
          ) : (
            <div style={{ marginTop: 12 }}>
              <span className="muted">Supplier is optional.</span>
              <div className="invoice-scan-chips" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={draft.supplier.create ? undefined : 'is-on'}
                  onClick={() =>
                    setDraft((current) => (current ? { ...current, supplier: { ...current.supplier, create: false } } : current))
                  }
                >
                  Don't create
                </button>
                <button
                  type="button"
                  className={draft.supplier.create ? 'is-on' : undefined}
                  onClick={() =>
                    setDraft((current) => (current ? { ...current, supplier: { ...current.supplier, create: true } } : current))
                  }
                >
                  Create supplier
                </button>
              </div>
            </div>
          )}
          {draft.lines.length ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {draft.lines.length} product{draft.lines.length === 1 ? '' : 's'} on this bill — add a barcode and Fetch on each.
            </p>
          ) : null}
        </Card>
          <div className="invoice-scan-cards">
            {draft.lines.map((line, index) => {
              const photoUrl =
                line.image_url && line.use_image !== false
                  ? resolveMediaAssetUrl(line.image_url) || line.image_url
                  : '';
              return (
              <article key={`${line.name}-${index}`} className={`invoice-scan-card${line.skip ? ' is-skip' : ''}`}>
                <div className="invoice-scan-card-kicker">
                  <strong>Product {index + 1} of {draft.lines.length}</strong>
                  <span className="muted">
                    {line.match || (line.create ? 'Will create' : 'Unmatched')}
                    {line.skip ? ' · Skipped' : ''}
                  </span>
                  <Button type="button" variant="ghost" onClick={() => patchLine(index, { skip: !line.skip })}>
                    {line.skip ? 'Include' : 'Skip'}
                  </Button>
                </div>
                <div className="invoice-scan-card-head">
                  <div className="invoice-scan-photo">
                    {photoUrl ? (
                      <button
                        type="button"
                        className="invoice-scan-photo-preview"
                        onClick={() => setLightboxUrl(photoUrl)}
                        aria-label={`Preview photo for ${line.name || `product ${index + 1}`}`}
                      >
                        <img src={photoUrl} alt="" />
                      </button>
                    ) : (
                      <label className="invoice-scan-thumb invoice-scan-thumb-empty">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={photoBusy === index}
                          onChange={(event) => {
                            void replaceLinePhoto(index, event.target.files?.[0] ?? null);
                            event.target.value = '';
                          }}
                        />
                        <span>Add photo</span>
                      </label>
                    )}
                    <div className="invoice-scan-photo-actions">
                      <label className="invoice-scan-photo-replace">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={photoBusy === index}
                          onChange={(event) => {
                            void replaceLinePhoto(index, event.target.files?.[0] ?? null);
                            event.target.value = '';
                          }}
                        />
                        {photoBusy === index ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo'}
                      </label>
                      {photoUrl ? (
                        <button type="button" className="invoice-clear" onClick={() => setLightboxUrl(photoUrl)}>
                          Preview
                        </button>
                      ) : null}
                      {photoUrl ? (
                        <button
                          type="button"
                          className="invoice-clear"
                          onClick={() => patchLine(index, { image_url: '', use_image: false })}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="invoice-scan-card-title">
                    <label>
                      Name
                      <input
                        value={line.name}
                        onChange={(event) => patchLine(index, { name: event.target.value })}
                        aria-label={`Product ${index + 1} name`}
                      />
                    </label>
                    <div className="invoice-scan-barcode">
                      <input
                        value={line.barcode || ''}
                        placeholder="Add barcode"
                        aria-label={`Barcode for ${line.name || `product ${index + 1}`}`}
                        onChange={(event) => patchLine(index, { barcode: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void fetchLine(index);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Scan barcode with camera"
                        onClick={() => setCameraLine(index)}
                        style={{ padding: 8, minWidth: 36 }}
                      >
                        <Camera size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="neutral"
                        disabled={fetchingIndex === index}
                        onClick={() => void fetchLine(index)}
                      >
                        {fetchingIndex === index ? 'Fetching…' : 'Fetch'}
                      </Button>
                    </div>
                  </div>
                </div>

                <LineCatalogFields line={line} patch={(next) => patchLine(index, next)} />
              </article>
              );
            })}
          </div>

          <div>
            <Button type="button" variant="primary" disabled={!readyLines.length || confirming} onClick={() => void confirm()}>
              {confirming ? 'Posting…' : `Post purchase · ${readyLines.length} line${readyLines.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      ) : null}

      {cameraLine != null ? (
        <Card>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>Scan a barcode onto product {(cameraLine || 0) + 1}.</p>
          <BarcodeCameraPanel
            active
            onClose={() => setCameraLine(null)}
            onCode={(code) => {
              const index = cameraLine;
              setCameraLine(null);
              patchLine(index, { barcode: code });
              void fetchLine(index, code);
            }}
          />
        </Card>
      ) : null}

      {lightboxUrl ? (
        <button type="button" className="invoice-scan-lightbox" onClick={() => setLightboxUrl(null)} aria-label="Close photo preview">
          <img src={lightboxUrl} alt="" />
        </button>
      ) : null}

      {topUpOpen ? (
        <SmartLookupUpiPaySheet
          amountPaise={10000}
          onClose={() => setTopUpOpen(false)}
          onClaimed={() => setTopUpOpen(false)}
          onError={(message) => snackbar.push(message, 'error')}
        />
      ) : null}
    </div>
  );
}
