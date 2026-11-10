import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera, CopyPlus, Plus, Trash2 } from 'lucide-react';
import { SHOP_PRODUCT_CATEGORIES, type ShopProductCategoryItem } from '@ie-orbit/sdk';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { currencySelectOptions, ensureSelectOption } from '../../config/onboarding';
import { useShopGodowns, useShopProductMutations } from './shopHooks';
import {
  BULK_GRID_COLUMNS,
  applyDefaultsToEmpty,
  applyEnrichmentToRow,
  chunkRows,
  copyRowWithoutBarcode,
  assertCsvImport,
  downloadCsvTemplate,
  emptyBulkDefaults,
  emptyBulkRow,
  mergePartialRow,
  normalizeBulkCategory,
  normalizeBulkStatus,
  parseDelimitedTable,
  rowHasContent,
  rowIsReady,
  rowToWriteInput,
  tableToPartialRows,
  type BulkGridColumn,
  type BulkProductDefaults,
  type BulkProductRow,
} from './bulkProducts';

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
};

function nextRowId(seed: number) {
  return `row-${seed}`;
}

export function ShopProductsAddManyPage() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const client = useApiClient();
  const godownsQuery = useShopGodowns();
  const { createBulk, enrich } = useShopProductMutations();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(1);
  const godowns = godownsQuery.data ?? [];
  const defaultGodownId = godowns.find((godown) => godown.is_default)?.id || godowns[0]?.id || '';

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

  const [defaults, setDefaults] = useState<BulkProductDefaults>({
    ...emptyBulkDefaults(),
    godown_id: defaultGodownId,
  });
  const [rows, setRows] = useState<BulkProductRow[]>(() => [emptyBulkRow(nextRowId(0), emptyBulkDefaults())]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraRowId, setCameraRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!defaults.godown_id && defaultGodownId) {
      setDefaults((current) => ({ ...current, godown_id: defaultGodownId }));
    }
  }, [defaultGodownId, defaults.godown_id]);

  const readyRows = useMemo(() => rows.filter(rowIsReady), [rows]);
  const errorCount = useMemo(() => rows.filter((row) => row.error).length, [rows]);
  const incompleteCount = useMemo(
    () => rows.filter((row) => rowHasContent(row) && !rowIsReady(row)).length,
    [rows],
  );

  function patchDefaults(patch: Partial<BulkProductDefaults>) {
    setDefaults((current) => ({ ...current, ...patch }));
  }

  function withSpareRow(current: BulkProductRow[]): BulkProductRow[] {
    if (!current.length || rowHasContent(current[current.length - 1])) {
      return [...current, emptyBulkRow(nextRowId(idRef.current++), defaults)];
    }
    return current;
  }

  function updateRow(id: string, patch: Partial<BulkProductRow>) {
    setRows((current) =>
      withSpareRow(current.map((row) => (row.id === id ? { ...row, ...patch, error: patch.error ?? '' } : row))),
    );
  }

  function addEmptyRow() {
    setRows((current) => withSpareRow(current));
  }

  function duplicateRow(id: string) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      if (index < 0) return current;
      const copyId = nextRowId(idRef.current);
      idRef.current += 1;
      const next = current.slice();
      next.splice(index + 1, 0, copyRowWithoutBarcode(current[index], copyId));
      return withSpareRow(next);
    });
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return withSpareRow(next.length ? next : []);
    });
  }

  function appendPartials(partials: Array<Partial<BulkProductRow>>) {
    if (!partials.length) return 0;
    const usable = partials.filter((partial) => Object.keys(partial).length > 0);
    if (!usable.length) return 0;
    setRows((current) => {
      const next = current.slice();
      let cursor = next.findIndex((row) => !rowHasContent(row));
      if (cursor < 0) cursor = next.length;
      usable.forEach((partial) => {
        if (cursor < next.length && !rowHasContent(next[cursor])) {
          next[cursor] = mergePartialRow(next[cursor], partial, defaults);
        } else {
          const id = nextRowId(idRef.current);
          idRef.current += 1;
          next.splice(cursor, 0, mergePartialRow(emptyBulkRow(id, defaults), partial, defaults));
        }
        cursor += 1;
      });
      return withSpareRow(next);
    });
    return usable.length;
  }

  function handleGridPaste(event: React.ClipboardEvent<HTMLTableSectionElement>, startId: string, startColumn: BulkGridColumn) {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const table = parseDelimitedTable(text);
    if (!table.length) return;
    const startColIndex = BULK_GRID_COLUMNS.indexOf(startColumn);
    setRows((current) => {
      const startRowIndex = current.findIndex((row) => row.id === startId);
      if (startRowIndex < 0) return current;
      const next = current.slice();
      table.forEach((cells, rowOffset) => {
        const targetIndex = startRowIndex + rowOffset;
        while (targetIndex >= next.length) {
          const id = nextRowId(idRef.current);
          idRef.current += 1;
          next.push(emptyBulkRow(id, defaults));
        }
        const row = { ...next[targetIndex], error: '' };
        cells.forEach((cell, colOffset) => {
          const column = BULK_GRID_COLUMNS[startColIndex + colOffset];
          if (!column) return;
          const value = cell.trim();
          if (column === 'category') row.category = normalizeBulkCategory(value);
          else if (column === 'status') row.status = normalizeBulkStatus(value);
          else row[column] = value;
        });
        next[targetIndex] = applyDefaultsToEmpty(row, defaults);
      });
      return next;
    });
    snackbar.push(
      table.length === 1
        ? t('shop.addMany.toastPastedOne')
        : t('shop.addMany.toastPastedMany', { n: table.length }),
      'success',
    );
  }

  async function importCsv(file: File) {
    try {
      const text = await file.text();
      assertCsvImport(file.name, text);
      const added = appendPartials(tableToPartialRows(parseDelimitedTable(text)));
      snackbar.push(
        added
          ? added === 1
            ? t('shop.addMany.toastLoadedOne')
            : t('shop.addMany.toastLoadedMany', { n: added })
          : t('shop.addMany.toastNoRows'),
        added ? 'success' : 'error',
      );
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('shop.addMany.errImport'), 'error');
    }
  }

  async function lookupRow(id: string, code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const previous = row.barcode.trim();
        if (previous && previous !== trimmed) {
          return {
            ...row,
            barcode: trimmed,
            sku: '',
            name: '',
            brand: '',
            pack_size: '',
            category: '',
            image_url: '',
            lookingUp: true,
            error: '',
          };
        }
        return { ...row, barcode: trimmed, lookingUp: true, error: '' };
      }),
    );
    try {
      const data = await enrich.mutateAsync({ code: trimmed });
      setRows((current) =>
        current.map((row) => (row.id === id ? applyEnrichmentToRow({ ...row, barcode: trimmed }, data, defaults) : row)),
      );
      if (data.found && data.name) {
        snackbar.push(t('shop.addMany.toastFilled', { name: data.name }), 'success');
      } else if (!data.found && !data.name) {
        snackbar.push(data.message || t('shop.addMany.toastNoCatalogMatch'), 'info');
      }
    } catch (error) {
      updateRow(id, { lookingUp: false, error: error instanceof Error ? error.message : t('shop.addMany.errLookup') });
    }
  }

  async function applyScannedCode(raw: string, rowId?: string | null) {
    const code = raw.trim();
    if (!code) return;
    if (rowId) {
      await lookupRow(rowId, code);
      setCameraOpen(false);
      setCameraRowId(null);
      return;
    }
    if (rows.some((row) => row.barcode.trim() === code)) {
      snackbar.push(t('shop.addMany.toastBarcodeDuplicate'), 'info');
      setScanCode('');
      return;
    }
    setScanCode(code);
    await handleScanWithCode(code);
    setCameraOpen(false);
    setCameraRowId(null);
  }

  async function handleScan() {
    await handleScanWithCode(scanCode);
  }

  async function handleScanWithCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    if (rows.some((row) => row.barcode.trim() === code)) {
      snackbar.push(t('shop.addMany.toastBarcodeDuplicate'), 'info');
      setScanCode('');
      return;
    }
    setScanning(true);
    try {
      const data = await enrich.mutateAsync({ code });
      const added = appendPartials([
        applyEnrichmentToRow(emptyBulkRow('scan', defaults), { ...data, code: data.code || code }, defaults),
      ]);
      if (added) {
        snackbar.push(
          data.name ? t('shop.addMany.toastAddedNamed', { name: data.name }) : t('shop.addMany.toastAddedBarcode'),
          'success',
        );
      }
      setScanCode('');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('shop.addMany.errLookup'), 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    const incomplete = rows.filter((row) => rowHasContent(row) && !rowIsReady(row));
    if (incomplete.length) {
      setRows((current) =>
        current.map((row) =>
          rowHasContent(row) && !rowIsReady(row) ? { ...row, error: t('shop.addMany.errNameRequired') } : row,
        ),
      );
      snackbar.push(t('shop.addMany.errNameEveryRow'), 'error');
      return;
    }
    const ready = rows.filter(rowIsReady);
    if (!ready.length) {
      snackbar.push(t('shop.addMany.errAddOne'), 'error');
      return;
    }
    setSaving(true);
    let createdCount = 0;
    let errorTotal = 0;
    try {
      for (const chunk of chunkRows(ready)) {
        const result = await createBulk.mutateAsync({
          godown_id: defaults.godown_id || null,
          items: chunk.map((row) => rowToWriteInput(row, defaults)),
        });
        const failed = new Set(result.errors.map((item) => item.index));
        createdCount += result.created.length;
        errorTotal += result.errors.length;
        const errorById = new Map<string, string>();
        result.errors.forEach((item) => {
          const row = chunk[item.index];
          if (row) errorById.set(row.id, item.message);
        });
        const succeeded = new Set(chunk.filter((_, index) => !failed.has(index)).map((row) => row.id));
        setRows((current) => {
          const next = current
            .filter((row) => !succeeded.has(row.id))
            .map((row) => (errorById.has(row.id) ? { ...row, error: errorById.get(row.id) || row.error } : row));
          return next.length ? next : [emptyBulkRow(nextRowId(idRef.current++), defaults)];
        });
      }
      if (createdCount && !errorTotal) {
        snackbar.push(
          createdCount === 1
            ? t('shop.addMany.toastAddedProductsOne')
            : t('shop.addMany.toastAddedProductsMany', { n: createdCount }),
          'success',
        );
      } else if (createdCount) {
        snackbar.push(t('shop.addMany.toastPartial', { created: createdCount, errors: errorTotal }), 'info');
      } else {
        snackbar.push(t('shop.addMany.toastNothingSaved'), 'error');
      }
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('shop.addMany.errSave'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const currencyOptions = ensureSelectOption(currencySelectOptions, defaults.currency);
  const defaultsSummary = [
    defaults.gst_rate ? t('shop.addMany.summaryGst', { rate: defaults.gst_rate }) : null,
    defaults.hsn_sac ? t('shop.addMany.summaryHsn', { code: defaults.hsn_sac }) : null,
    categoryOptions.find((item) => item.slug === defaults.category)?.label,
    defaults.status ? t(`shop.products.statuses.${defaults.status}`, { defaultValue: defaults.status }) : null,
    godowns.find((item) => item.id === defaults.godown_id)?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="page-stack bulk-add">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <Link to="/shop/products" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 13, opacity: 0.75 }}>
              <ArrowLeft size={14} aria-hidden="true" />
              {t('shop.addMany.products')}
            </Link>
            <h1 style={{ margin: '8px 0 4px' }}>{t('shop.addMany.title')}</h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              {t('shop.addMany.intro')}
            </p>
          </div>
          <div className="bulk-add__stats">
            <span className={`bulk-add__stat${readyRows.length ? ' is-ready' : ''}`}>
              <strong>{readyRows.length}</strong> {t('shop.addMany.statReady')}
            </span>
            {incompleteCount ? (
              <span className="bulk-add__stat is-warn">
                <strong>{incompleteCount}</strong> {t('shop.addMany.statNeedName')}
              </span>
            ) : null}
            {errorCount ? (
              <span className="bulk-add__stat is-error">
                <strong>{errorCount}</strong> {t('shop.addMany.statErrors')}
              </span>
            ) : null}
            <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!workspace.businessId || !readyRows.length}>
              {readyRows.length ? t('shop.addMany.saveCount', { n: readyRows.length }) : t('shop.addMany.saveAll')}
            </Button>
          </div>
        </div>

        <button type="button" className="bulk-add__defaults-toggle" onClick={() => setDefaultsOpen((open) => !open)}>
          <span>
            {t('shop.addMany.sharedDefaults')}
            <small>{defaultsSummary || t('shop.addMany.sharedDefaultsHint')}</small>
          </span>
          {defaultsOpen ? t('shop.addMany.hide') : t('shop.addMany.edit')}
        </button>
        <div
          style={{
            display: defaultsOpen ? 'grid' : 'none',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 12,
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.defaultGst')}</span>
            <input value={defaults.gst_rate} onChange={(event) => patchDefaults({ gst_rate: event.target.value })} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.defaultHsn')}</span>
            <input value={defaults.hsn_sac} onChange={(event) => patchDefaults({ hsn_sac: event.target.value })} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.defaultCategory')}</span>
            <select value={defaults.category} onChange={(event) => patchDefaults({ category: event.target.value })} style={inputStyle}>
              <option value="">{t('shop.addMany.none')}</option>
              {categoryOptions.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.currency')}</span>
            <select value={defaults.currency} onChange={(event) => patchDefaults({ currency: event.target.value })} style={inputStyle}>
              {currencyOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {godowns.length ? (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.stockGodown')}</span>
              <select value={defaults.godown_id} onChange={(event) => patchDefaults({ godown_id: event.target.value })} style={inputStyle}>
                <option value="">{t('shop.addMany.godownDefault')}</option>
                {godowns.map((godown) => (
                  <option key={godown.id} value={godown.id}>
                    {godown.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t('shop.addMany.defaultStatus')}</span>
            <select value={defaults.status} onChange={(event) => patchDefaults({ status: event.target.value })} style={inputStyle}>
              <option value="active">{t('shop.products.statuses.active')}</option>
              <option value="draft">{t('shop.products.statuses.draft')}</option>
              <option value="inactive">{t('shop.products.statuses.inactive')}</option>
            </select>
          </label>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
          {t('shop.addMany.defaultsNote')}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
          <input
            value={scanCode}
            onChange={(event) => setScanCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleScan();
              }
            }}
            placeholder={t('shop.addMany.scanPlaceholder')}
            autoComplete="off"
            style={{ ...inputStyle, flex: '1 1 240px', padding: '10px 12px' }}
          />
          <Button type="button" variant="neutral" onClick={() => void handleScan()} loading={scanning} disabled={!scanCode.trim()}>
            {t('shop.addMany.addFromBarcode')}
          </Button>
          <Button
            type="button"
            variant="neutral"
            onClick={() => {
              setCameraRowId(null);
              setCameraOpen((open) => !open);
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Camera size={16} aria-hidden="true" />
              {cameraOpen && !cameraRowId ? t('shop.addMany.hideCamera') : t('shop.addMany.camera')}
            </span>
          </Button>
          <Button type="button" variant="neutral" onClick={() => fileRef.current?.click()}>
            {t('shop.addMany.importCsv')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => downloadCsvTemplate()}>
            {t('shop.addMany.downloadTemplate')}
          </Button>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>
          {t('shop.addMany.templateNote')}
        </p>
        {cameraOpen && !cameraRowId ? (
          <div style={{ marginTop: 12 }}>
            <BarcodeCameraPanel
              active
              onClose={() => setCameraOpen(false)}
              onCode={(code) => {
                void applyScannedCode(code);
              }}
            />
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,text/csv,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importCsv(file);
          }}
        />
      </Card>

      {cameraOpen && cameraRowId ? (
        <Card>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>{t('shop.addMany.scanIntoRow')}</p>
          <BarcodeCameraPanel
            active
            onClose={() => {
              setCameraOpen(false);
              setCameraRowId(null);
            }}
            onCode={(code) => {
              void applyScannedCode(code, cameraRowId);
            }}
          />
        </Card>
      ) : null}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#6b7280', width: 36 }}>#</th>
                {BULK_GRID_COLUMNS.map((column) => (
                  <th key={column} style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                    {t(`shop.addMany.columns.${column}`)}
                    {column === 'name' ? ' *' : ''}
                  </th>
                ))}
                <th style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{t('shop.addMany.rowColumn')}</th>
                <th style={{ padding: '10px 8px', width: 88 }} />
              </tr>
            </thead>
            <tbody
              onPaste={(event) => {
                const target = event.target as HTMLElement;
                const rowId = target.closest('tr')?.getAttribute('data-row-id');
                const column = target.getAttribute('data-column') as BulkGridColumn | null;
                if (rowId && column) handleGridPaste(event, rowId, column);
              }}
            >
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className={
                    row.error
                      ? 'bulk-add__row is-error'
                      : rowIsReady(row)
                        ? 'bulk-add__row is-ready'
                        : rowHasContent(row)
                          ? 'bulk-add__row is-warn'
                          : 'bulk-add__row'
                  }
                >
                  <td style={{ padding: '6px 8px', fontSize: 12, color: '#9ca3af' }}>{index + 1}</td>
                  {BULK_GRID_COLUMNS.map((column) => (
                    <td key={column} style={{ padding: '4px 6px' }}>
                      {column === 'category' ? (
                        <select
                          data-column={column}
                          value={row.category}
                          onChange={(event) => updateRow(row.id, { category: event.target.value })}
                          style={inputStyle}
                          aria-label={t('shop.addMany.categoryAria')}
                        >
                          <option value="">—</option>
                          {categoryOptions.map((item) => (
                            <option key={item.slug} value={item.slug}>
                              {item.label}
                            </option>
                          ))}
                          {row.category && !categoryOptions.some((item) => item.slug === row.category) ? (
                            <option value={row.category}>{row.category}</option>
                          ) : null}
                        </select>
                      ) : column === 'status' ? (
                        <select
                          data-column={column}
                          value={row.status}
                          onChange={(event) => updateRow(row.id, { status: event.target.value })}
                          style={inputStyle}
                          aria-label={t('shop.addMany.columns.status')}
                        >
                          <option value="active">{t('shop.products.statuses.active')}</option>
                          <option value="draft">{t('shop.products.statuses.draft')}</option>
                          <option value="inactive">{t('shop.products.statuses.inactive')}</option>
                          <option value="archived">{t('shop.products.statuses.archived')}</option>
                        </select>
                      ) : column === 'barcode' ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            data-column={column}
                            value={row.barcode}
                            onChange={(event) => updateRow(row.id, { barcode: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void lookupRow(row.id, row.barcode);
                              }
                            }}
                            style={inputStyle}
                            aria-label={t('shop.addMany.barcodeAria')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setCameraRowId(row.id);
                              setCameraOpen(true);
                            }}
                            aria-label={t('shop.addMany.scanBarcodeCameraAria')}
                            style={{ padding: '8px', minWidth: 36 }}
                          >
                            <Camera size={16} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void lookupRow(row.id, row.barcode)}
                            disabled={!row.barcode.trim() || row.lookingUp}
                            style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}
                          >
                            {row.lookingUp ? '…' : t('shop.addMany.lookup')}
                          </Button>
                        </div>
                      ) : (
                        <input
                          data-column={column}
                          value={row[column]}
                          onChange={(event) => updateRow(row.id, { [column]: event.target.value })}
                          style={inputStyle}
                          aria-label={t(`shop.addMany.columns.${column}`)}
                        />
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', fontSize: 12, minWidth: 140 }}>
                    <span
                      className={`bulk-add__pill${
                        row.error ? ' is-error' : rowIsReady(row) ? ' is-ready' : rowHasContent(row) ? ' is-warn' : ''
                      }`}
                    >
                      {row.error ||
                        (rowIsReady(row)
                          ? t('shop.addMany.rowReady')
                          : rowHasContent(row)
                            ? t('shop.addMany.rowNeedsName')
                            : t('shop.addMany.rowEmpty'))}
                    </span>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        aria-label={t('shop.addMany.duplicateRowAria')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
                      >
                        <CopyPlus size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label={t('shop.addMany.deleteRowAria')}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
            padding: 14,
            borderTop: '1px solid #e5e7eb',
            position: 'sticky',
            bottom: 0,
            background: 'var(--card, #fff)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="button" variant="neutral" onClick={addEmptyRow}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                {t('shop.addMany.addRow')}
              </span>
            </Button>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {t('shop.addMany.footerReady', { n: readyRows.length })}
              {incompleteCount ? ` · ${t('shop.addMany.footerNeedName', { n: incompleteCount })}` : ''}
              {errorCount ? ` · ${t('shop.addMany.footerErrors', { n: errorCount })}` : ''}
            </span>
          </div>
          <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!workspace.businessId || !readyRows.length}>
            {readyRows.length
              ? readyRows.length === 1
                ? t('shop.addMany.saveProductsOne')
                : t('shop.addMany.saveProductsMany', { n: readyRows.length })
              : t('shop.addMany.saveAll')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
