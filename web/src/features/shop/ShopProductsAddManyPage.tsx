import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CopyPlus, Plus, Trash2 } from 'lucide-react';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { currencySelectOptions, ensureSelectOption } from '../../config/onboarding';
import { useShopGodowns, useShopProductMutations } from './shopHooks';
import {
  BULK_GRID_COLUMNS,
  applyDefaultsToEmpty,
  applyEnrichmentToRow,
  chunkRows,
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

const COLUMN_LABELS: Record<BulkGridColumn, string> = {
  name: 'Name',
  barcode: 'Barcode',
  sku: 'SKU',
  brand: 'Brand',
  pack_size: 'Pack size',
  category: 'Category',
  price: 'Price',
  gst_rate: 'GST %',
  hsn_sac: 'HSN',
  stock_on_hand: 'Stock',
  status: 'Status',
};

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
  const snackbar = useSnackbar();
  const workspace = useWorkspace();
  const godownsQuery = useShopGodowns();
  const { createBulk, enrich } = useShopProductMutations();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(8);
  const godowns = godownsQuery.data ?? [];
  const defaultGodownId = godowns.find((godown) => godown.is_default)?.id || godowns[0]?.id || '';

  const [defaults, setDefaults] = useState<BulkProductDefaults>({
    ...emptyBulkDefaults(),
    godown_id: defaultGodownId,
  });
  const [rows, setRows] = useState<BulkProductRow[]>(() =>
    Array.from({ length: 8 }, (_, index) => emptyBulkRow(nextRowId(index), emptyBulkDefaults())),
  );
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

  function updateRow(id: string, patch: Partial<BulkProductRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch, error: patch.error ?? '' } : row)));
  }

  function addEmptyRow() {
    const id = nextRowId(idRef.current);
    idRef.current += 1;
    setRows((current) => [...current, emptyBulkRow(id, defaults)]);
  }

  function duplicateRow(id: string) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      if (index < 0) return current;
      const copyId = nextRowId(idRef.current);
      idRef.current += 1;
      const copy: BulkProductRow = { ...current[index], id: copyId, error: '', lookingUp: false };
      const next = current.slice();
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length ? next : [emptyBulkRow(nextRowId(idRef.current++), defaults)];
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
      return next;
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
    snackbar.push(`Pasted ${table.length} row${table.length === 1 ? '' : 's'}.`, 'success');
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const added = appendPartials(tableToPartialRows(parseDelimitedTable(text)));
    snackbar.push(added ? `Loaded ${added} row${added === 1 ? '' : 's'} from CSV.` : 'No product rows found in that file.', added ? 'success' : 'error');
  }

  async function lookupRow(id: string, code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    updateRow(id, { lookingUp: true, error: '' });
    try {
      const data = await enrich.mutateAsync({ code: trimmed });
      setRows((current) =>
        current.map((row) => (row.id === id ? applyEnrichmentToRow({ ...row, barcode: trimmed }, data, defaults) : row)),
      );
      if (!data.found && !data.name) {
        snackbar.push(data.message || 'No catalog match. Fill the name and save.', 'info');
      }
    } catch (error) {
      updateRow(id, { lookingUp: false, error: error instanceof Error ? error.message : 'Lookup failed.' });
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
      snackbar.push('That barcode is already in the list.', 'info');
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
      snackbar.push('That barcode is already in the list.', 'info');
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
        snackbar.push(data.name ? `Added ${data.name}.` : 'Added barcode. Fill the name if needed.', 'success');
      }
      setScanCode('');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Lookup failed.', 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    const incomplete = rows.filter((row) => rowHasContent(row) && !rowIsReady(row));
    if (incomplete.length) {
      setRows((current) =>
        current.map((row) =>
          rowHasContent(row) && !rowIsReady(row) ? { ...row, error: 'Name is required.' } : row,
        ),
      );
      snackbar.push('Add a name to every filled row, or clear unused cells.', 'error');
      return;
    }
    const ready = rows.filter(rowIsReady);
    if (!ready.length) {
      snackbar.push('Add at least one product name.', 'error');
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
        snackbar.push(`Saved ${createdCount} product${createdCount === 1 ? '' : 's'}.`, 'success');
      } else if (createdCount) {
        snackbar.push(`Saved ${createdCount}, ${errorTotal} need a fix.`, 'info');
      } else {
        snackbar.push('Nothing was saved. Fix the row errors and try again.', 'error');
      }
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to save products.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const currencyOptions = ensureSelectOption(currencySelectOptions, defaults.currency);

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <Link to="/shop/products" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 13, opacity: 0.75 }}>
              <ArrowLeft size={14} aria-hidden="true" />
              Products
            </Link>
            <h1 style={{ margin: '8px 0 4px' }}>Add many products</h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              Type, paste from Excel, import a CSV, or scan barcodes. Photos and packaging details stay on the single-product editor.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!workspace.businessId}>
            Save all
          </Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 18,
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Default GST %</span>
            <input value={defaults.gst_rate} onChange={(event) => patchDefaults({ gst_rate: event.target.value })} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Default HSN</span>
            <input value={defaults.hsn_sac} onChange={(event) => patchDefaults({ hsn_sac: event.target.value })} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Default category</span>
            <select value={defaults.category} onChange={(event) => patchDefaults({ category: event.target.value })} style={inputStyle}>
              <option value="">None</option>
              {SHOP_PRODUCT_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Currency</span>
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
              <span style={{ fontSize: 12, opacity: 0.7 }}>Stock godown</span>
              <select value={defaults.godown_id} onChange={(event) => patchDefaults({ godown_id: event.target.value })} style={inputStyle}>
                <option value="">Default</option>
                {godowns.map((godown) => (
                  <option key={godown.id} value={godown.id}>
                    {godown.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Default status</span>
            <select value={defaults.status} onChange={(event) => patchDefaults({ status: event.target.value })} style={inputStyle}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
          Defaults fill empty cells on new, pasted, and imported rows. Typed values are kept.
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
            placeholder="Scan or paste a barcode, then Enter"
            autoComplete="off"
            style={{ ...inputStyle, flex: '1 1 240px', padding: '10px 12px' }}
          />
          <Button type="button" variant="neutral" onClick={() => void handleScan()} loading={scanning} disabled={!scanCode.trim()}>
            Add from barcode
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
              {cameraOpen && !cameraRowId ? 'Hide camera' : 'Camera'}
            </span>
          </Button>
          <Button type="button" variant="neutral" onClick={() => fileRef.current?.click()}>
            Import CSV
          </Button>
          <Button type="button" variant="ghost" onClick={() => downloadCsvTemplate()}>
            Download template
          </Button>
        </div>
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
          accept=".csv,text/csv,text/plain"
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
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>Scan a barcode into this row.</p>
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
                    {COLUMN_LABELS[column]}
                    {column === 'name' ? ' *' : ''}
                  </th>
                ))}
                <th style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Row</th>
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
                <tr key={row.id} data-row-id={row.id} style={{ borderTop: '1px solid #f3f4f6', background: row.error ? '#fef2f2' : undefined }}>
                  <td style={{ padding: '6px 8px', fontSize: 12, color: '#9ca3af' }}>{index + 1}</td>
                  {BULK_GRID_COLUMNS.map((column) => (
                    <td key={column} style={{ padding: '4px 6px' }}>
                      {column === 'category' ? (
                        <select
                          data-column={column}
                          value={row.category}
                          onChange={(event) => updateRow(row.id, { category: event.target.value })}
                          style={inputStyle}
                          aria-label="Category"
                        >
                          <option value="">—</option>
                          {SHOP_PRODUCT_CATEGORIES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      ) : column === 'status' ? (
                        <select
                          data-column={column}
                          value={row.status}
                          onChange={(event) => updateRow(row.id, { status: event.target.value })}
                          style={inputStyle}
                          aria-label="Status"
                        >
                          <option value="active">Active</option>
                          <option value="draft">Draft</option>
                          <option value="inactive">Inactive</option>
                          <option value="archived">Archived</option>
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
                            aria-label="Barcode"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setCameraRowId(row.id);
                              setCameraOpen(true);
                            }}
                            aria-label="Scan barcode with camera"
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
                            {row.lookingUp ? '…' : 'Lookup'}
                          </Button>
                        </div>
                      ) : (
                        <input
                          data-column={column}
                          value={row[column]}
                          onChange={(event) => updateRow(row.id, { [column]: event.target.value })}
                          style={inputStyle}
                          aria-label={COLUMN_LABELS[column]}
                        />
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '6px 8px', fontSize: 12, minWidth: 140, color: row.error ? '#b91c1c' : '#6b7280' }}>
                    {row.error || (rowIsReady(row) ? 'Ready' : rowHasContent(row) ? 'Needs name' : '')}
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => duplicateRow(row.id)}
                        aria-label="Duplicate row"
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
                      >
                        <CopyPlus size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label="Delete row"
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
                Add row
              </span>
            </Button>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {readyRows.length} ready
              {incompleteCount ? ` · ${incompleteCount} need a name` : ''}
              {errorCount ? ` · ${errorCount} errors` : ''}
            </span>
          </div>
          <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!workspace.businessId}>
            Save all
          </Button>
        </div>
      </Card>
    </div>
  );
}
