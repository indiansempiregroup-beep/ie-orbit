import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlatformProductCatalogItem } from '@ie-orbit/sdk';
import { PackageSearch } from 'lucide-react';
import { useApiClient } from '../../hooks/useApiClient';
import { useDebounce } from '../../hooks/useDebounce';
import { usePageMeta } from '../../hooks/usePageMeta';
import { getApiErrorMessage } from '../../lib/apiClient';
import {
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminTable,
} from './AdminChrome';

function formatMoney(price: string, currency: string) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) return '—';
  const code = currency || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(
      amount,
    );
  } catch {
    return `${code} ${amount}`;
  }
}

export function PlatformProductCatalogPage() {
  usePageMeta({ title: 'Product Catalog — Platform Admin' });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [selected, setSelected] = useState<PlatformProductCatalogItem | null>(null);
  const [importSource, setImportSource] = useState<'both' | 'openmrp' | 'off'>('both');
  const [importLimit, setImportLimit] = useState(1000);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const listQuery = useQuery({
    queryKey: ['platform', 'product-catalog', debouncedSearch],
    queryFn: async () =>
      (
        await client.platform.productCatalog({
          q: debouncedSearch || undefined,
          limit: 50,
          offset: 0,
        })
      ).data,
    retry: false,
  });

  const qualityQuery = useQuery({
    queryKey: ['platform', 'product-catalog-quality'],
    queryFn: async () => (await client.platform.productCatalogQuality()).data,
    retry: false,
  });

  const importsQuery = useQuery({
    queryKey: ['platform', 'product-catalog-imports'],
    queryFn: async () => (await client.platform.productCatalogImports()).data.imports,
    retry: false,
  });

  const importMutation = useMutation({
    mutationFn: async () =>
      (
        await client.platform.productCatalogImport({
          source: importSource,
          limit: importLimit,
          require_image: true,
        })
      ).data,
    onSuccess: (data) => {
      setError(null);
      setMessage(
        `Import ${data.import.status}: +${data.import.imported} new, ${data.import.updated} updated, ${data.import.skipped} skipped.`,
      );
      queryClient.invalidateQueries({ queryKey: ['platform', 'product-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'product-catalog-quality'] });
      queryClient.invalidateQueries({ queryKey: ['platform', 'product-catalog-imports'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(getApiErrorMessage(err, 'Import failed.'));
    },
  });

  const barcodeMutation = useMutation({
    mutationFn: async (code: string) => (await client.platform.productCatalogByBarcode(code)).data,
    onSuccess: (data) => {
      setError(null);
      if (data.found && data.product) {
        setSelected(data.product);
        setMessage(data.live ? 'Loaded via live OpenMRP/OFF lookup and cached.' : 'Loaded from platform catalog.');
      } else {
        setSelected(null);
        setMessage(data.message || 'No product found for that barcode.');
      }
    },
    onError: (err) => {
      setError(getApiErrorMessage(err, 'Barcode lookup failed.'));
    },
  });

  const quality = qualityQuery.data?.quality;
  const products = listQuery.data?.products ?? [];
  const lastImport = qualityQuery.data?.last_import;

  const kpis = useMemo(
    () => [
      { label: 'Total products', value: quality?.total_products ?? 0 },
      { label: 'With images', value: `${quality?.image_available_pct ?? 0}%` },
      { label: 'With price/MRP', value: `${quality?.price_available_pct ?? 0}%` },
      { label: 'With description', value: `${quality?.description_available_pct ?? 0}%` },
    ],
    [quality],
  );

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Product Catalog"
        description="Platform master pack identity (GTIN). Hybrid: free local hit first, then OpenMRP / Open Food Facts / Datakick live fetch before Gemini. Optional seed import for common SKUs."
      />

      <div className="admin-kpi-grid" style={{ marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <AdminKpi key={kpi.label} label={kpi.label} value={String(kpi.value)} />
        ))}
      </div>

      {message ? <p style={{ color: '#047857', marginBottom: 12 }}>{message}</p> : null}
      {error ? <p style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p> : null}

      <div className="admin-split">
        <AdminSection title="Browse & search">
          <div className="admin-form-grid" style={{ marginBottom: 12 }}>
            <AdminSearch value={search} onChange={setSearch} placeholder="Search name, brand, barcode, category" />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Enter / scan barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!barcode.trim() || barcodeMutation.isPending}
                onClick={() => barcodeMutation.mutate(barcode.trim())}
              >
                Lookup
              </button>
            </div>
          </div>

          <AdminTable columns={['Image', 'Product', 'Brand', 'Barcode', 'Pack', 'Category', 'Price', 'GST %']}>
            {products.map((row) => (
              <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(row)}>
                <td>
                  {row.image_url ? (
                    <img
                      src={row.image_url}
                      alt=""
                      width={40}
                      height={40}
                      style={{ objectFit: 'cover', borderRadius: 8, background: '#f3f4f6' }}
                    />
                  ) : (
                    <PackageSearch size={20} />
                  )}
                </td>
                <td>{row.product_name || '—'}</td>
                <td>{row.brand || '—'}</td>
                <td>
                  <code>{row.barcode}</code>
                </td>
                <td>{row.pack_size || '—'}</td>
                <td>{row.category || '—'}</td>
                <td>{formatMoney(row.price, row.currency)}</td>
                <td>{row.gst_percent ?? '—'}</td>
              </tr>
            ))}
          </AdminTable>
          {products.length === 0 ? <AdminEmpty>No catalog products yet. Run a seed import or look up a barcode.</AdminEmpty> : null}
          {listQuery.data ? (
            <p style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
              Showing {products.length} of {listQuery.data.total}
            </p>
          ) : null}
        </AdminSection>

        <div style={{ display: 'grid', gap: 16 }}>
          <AdminSection title="Seed import">
            <div className="admin-form-grid">
              <AdminField label="Source">
                <select value={importSource} onChange={(e) => setImportSource(e.target.value as typeof importSource)}>
                  <option value="both">OpenMRP + Open Food Facts</option>
                  <option value="openmrp">OpenMRP only</option>
                  <option value="off">Open Food Facts only</option>
                </select>
              </AdminField>
              <AdminField label="Limit">
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={importLimit}
                  onChange={(e) => setImportLimit(Number(e.target.value) || 1000)}
                />
              </AdminField>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                Requires confirmation-style click. Seed rows need ≥1 real image. Attribution: OpenMRP ODbL / Open Food
                Facts.
              </p>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={importMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Start import from ${importSource} for up to ${importLimit} products? This writes to the platform catalog.`,
                    )
                  ) {
                    return;
                  }
                  importMutation.mutate();
                }}
              >
                {importMutation.isPending ? 'Importing…' : 'Start Import'}
              </button>
            </div>
            {lastImport ? (
              <div style={{ marginTop: 12, fontSize: 13, color: '#374151' }}>
                Last run: {lastImport.status} · source {lastImport.source} · imported {lastImport.imported} · updated{' '}
                {lastImport.updated} · skipped {lastImport.skipped} · missing images {lastImport.missing_images}
              </div>
            ) : null}
          </AdminSection>

          <AdminSection title="Data quality">
            <div className="admin-list" style={{ fontSize: 13 }}>
              <div>Barcode available: {quality?.barcode_available_pct ?? 0}%</div>
              <div>Brand available: {quality?.brand_available_pct ?? 0}%</div>
              <div>Pack size available: {quality?.pack_size_available_pct ?? 0}%</div>
              <div>GST available: {quality?.gst_available_pct ?? 0}% (never invented)</div>
              <div>Image available: {quality?.image_available_pct ?? 0}%</div>
              <div>Description available: {quality?.description_available_pct ?? 0}%</div>
            </div>
          </AdminSection>

          <AdminSection title="Recent imports">
            <div className="admin-list">
              {(importsQuery.data ?? []).slice(0, 5).map((run) => (
                <div key={run.id} style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong>{run.source}</strong> · {run.status} · +{run.imported} / ~{run.updated} · skip {run.skipped}
                </div>
              ))}
              {(importsQuery.data ?? []).length === 0 ? <AdminEmpty>No import runs yet.</AdminEmpty> : null}
            </div>
          </AdminSection>
        </div>
      </div>

      <AdminDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.product_name || 'Product details'}
      >
        {selected ? (
          <div className="admin-form-grid" style={{ gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(selected.images?.length ? selected.images : selected.image_url ? [selected.image_url] : []).map(
                (url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    width={96}
                    height={96}
                    style={{ objectFit: 'cover', borderRadius: 10, background: '#f3f4f6' }}
                  />
                ),
              )}
            </div>
            <div>
              <strong>Barcode</strong>
              <div>
                <code>{selected.barcode}</code>
              </div>
            </div>
            <div>
              <strong>Brand</strong>
              <div>{selected.brand || '—'}</div>
            </div>
            <div>
              <strong>Pack size</strong>
              <div>{selected.pack_size || '—'}</div>
            </div>
            <div>
              <strong>Category</strong>
              <div>{selected.category || '—'}</div>
            </div>
            <div>
              <strong>Price (MRP)</strong>
              <div>{formatMoney(selected.price, selected.currency)}</div>
            </div>
            <div>
              <strong>GST %</strong>
              <div>{selected.gst_percent ?? '—'}</div>
            </div>
            <div>
              <strong>Currency</strong>
              <div>{selected.currency || '—'}</div>
            </div>
            <div>
              <strong>Description / ingredients</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{selected.description_ingredients || '—'}</div>
            </div>
            <div>
              <strong>Product details</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>{selected.product_details || '—'}</div>
            </div>
            <div>
              <strong>Source</strong>
              <div>{selected.source || '—'}</div>
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}

export default PlatformProductCatalogPage;
