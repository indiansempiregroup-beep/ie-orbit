import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useShopCashAccounts,
  useShopCustomers,
  useShopProducts,
  useShopSuppliers,
  useShopVoucherMutations,
} from './shopHooks';

type LineState = {
  key: string;
  product_id: string;
  name: string;
  hsn_sac: string;
  qty: string;
  rate: string;
  gst_rate: string;
  discount: string;
};

let lineKeySeq = 0;
function newLine(): LineState {
  lineKeySeq += 1;
  return { key: `line-${lineKeySeq}`, product_id: '', name: '', hsn_sac: '', qty: '1', rate: '0', gst_rate: '0', discount: '0' };
}

function computeLineTotals(line: LineState) {
  const qty = Number(line.qty) || 0;
  const rate = Number(line.rate) || 0;
  const discount = Number(line.discount) || 0;
  const gstRate = Number(line.gst_rate) || 0;
  const taxable = Math.max(0, qty * rate - discount);
  const gst = (taxable * gstRate) / 100;
  return { taxable, gst, total: taxable + gst };
}

export function ShopVoucherForm({
  voucherType,
  backTo,
  title,
  description,
}: {
  voucherType: 'sale' | 'purchase';
  backTo: string;
  title: string;
  description: string;
}) {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const isSale = voucherType === 'sale';
  const partyLabel = isSale ? 'Customer' : 'Supplier';

  const customers = useShopCustomers();
  const suppliers = useShopSuppliers();
  const products = useShopProducts();
  const accounts = useShopCashAccounts();
  const { createVoucher } = useShopVoucherMutations();

  const [partyId, setPartyId] = useState('');
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isInterstate, setIsInterstate] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [lines, setLines] = useState<LineState[]>([newLine()]);
  const [message, setMessage] = useState<string | null>(null);

  const partyOptions = useMemo(() => {
    if (isSale) {
      return (customers.data ?? []).map((customer) => ({
        id: customer.id,
        label: customer.full_name ?? customer.display_name ?? customer.email ?? customer.id,
      }));
    }
    return (suppliers.data ?? []).map((supplier) => ({ id: supplier.id, label: supplier.name }));
  }, [isSale, customers.data, suppliers.data]);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const { taxable, gst, total } = computeLineTotals(line);
        acc.taxable += taxable;
        acc.gst += gst;
        acc.total += total;
        return acc;
      },
      { taxable: 0, gst: 0, total: 0 },
    );
  }, [lines]);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = (products.data ?? []).find((item) => item.id === productId);
    if (!product) {
      updateLine(key, { product_id: '' });
      return;
    }
    updateLine(key, {
      product_id: product.id,
      name: product.name,
      hsn_sac: product.hsn_sac ?? '',
      rate: String(product.price ?? '0'),
      gst_rate: String(product.gst_rate ?? product.tax_rate ?? '0'),
    });
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const validLines = lines.filter((line) => (line.product_id || line.name.trim()) && Number(line.qty) > 0);
    if (!validLines.length) {
      setMessage('Add at least one line with a product/item and quantity.');
      return;
    }
    try {
      const voucher = await createVoucher.mutateAsync({
        voucher_type: voucherType,
        ...(isSale ? { customer_id: partyId || undefined } : { supplier_id: partyId || undefined }),
        voucher_date: voucherDate || undefined,
        lines: validLines.map((line) => ({
          product_id: line.product_id || undefined,
          name: line.product_id ? undefined : line.name.trim(),
          hsn_sac: line.hsn_sac || undefined,
          qty: line.qty,
          rate: line.rate || undefined,
          discount: line.discount || undefined,
          gst_rate: line.gst_rate || undefined,
        })),
        is_interstate: isInterstate,
        place_of_supply: placeOfSupply || undefined,
        notes: notes || undefined,
        amount_paid: amountPaid || undefined,
        cash_account_id: cashAccountId || undefined,
      });
      navigate(`${backTo}?created=${encodeURIComponent(voucher.voucher_number)}`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, `Unable to save ${voucherType}.`));
    }
  }

  const fieldStyle: React.CSSProperties = { padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', width: '100%' };

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>{description}</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => navigate(backTo)}>
            Back to list
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={submit} style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{partyLabel}</span>
              <select value={partyId} onChange={(event) => setPartyId(event.target.value)} style={fieldStyle}>
                <option value="">Cash {isSale ? 'sale' : 'purchase'} (no {partyLabel.toLowerCase()})</option>
                {partyOptions.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Date</span>
              <input
                type="date"
                value={voucherDate}
                onChange={(event) => setVoucherDate(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Payment account</span>
              <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} style={fieldStyle}>
                <option value="">No payment recorded now</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.account_type})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Amount paid now</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amountPaid}
                onChange={(event) => setAmountPaid(event.target.value)}
                placeholder="0.00"
                style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={isInterstate}
                onChange={(event) => setIsInterstate(event.target.checked)}
              />
              Interstate (IGST instead of CGST + SGST)
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 220px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Place of supply</span>
              <input
                value={placeOfSupply}
                onChange={(event) => setPlaceOfSupply(event.target.value)}
                placeholder="e.g. Maharashtra"
                style={fieldStyle}
              />
            </label>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Line items</h3>
              <Button type="button" variant="neutral" onClick={addLine}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} aria-hidden="true" />
                  Add line
                </span>
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {lines.map((line) => {
                const lineTotals = computeLineTotals(line);
                return (
                  <div
                    key={line.key}
                    style={{
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: '2fr 0.8fr 0.8fr 0.7fr 0.8fr 0.9fr auto',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #eef0f3',
                    }}
                  >
                    <select
                      value={line.product_id}
                      onChange={(event) => selectProductForLine(line.key, event.target.value)}
                      style={fieldStyle}
                    >
                      <option value="">
                        {line.name ? `Custom: ${line.name}` : 'Select product…'}
                      </option>
                      {(products.data ?? []).map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.sku ? `(${product.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    {!line.product_id ? (
                      <input
                        value={line.name}
                        onChange={(event) => updateLine(line.key, { name: event.target.value })}
                        placeholder="Item name"
                        style={{ ...fieldStyle, gridColumn: '1 / 2', marginTop: -4 }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{line.hsn_sac || 'No HSN'}</span>
                    )}
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.qty}
                      onChange={(event) => updateLine(line.key, { qty: event.target.value })}
                      placeholder="Qty"
                      style={fieldStyle}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.rate}
                      onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                      placeholder="Rate"
                      style={fieldStyle}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.discount}
                      onChange={(event) => updateLine(line.key, { discount: event.target.value })}
                      placeholder="Discount"
                      style={fieldStyle}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.gst_rate}
                      onChange={(event) => updateLine(line.key, { gst_rate: event.target.value })}
                      placeholder="GST %"
                      style={fieldStyle}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatMoney(lineTotals.total, currency)}</strong>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label="Remove line"
                        style={{ border: 'none', background: 'transparent', color: '#b42318', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>
              Columns: item · qty · rate · discount · GST % · line total
            </div>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              style={fieldStyle}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 24,
              padding: '12px 16px',
              borderRadius: 10,
              background: 'var(--muted, #f8fafc)',
              flexWrap: 'wrap',
            }}
          >
            <span>
              Taxable: <strong>{formatMoney(totals.taxable, currency)}</strong>
            </span>
            <span>
              GST: <strong>{formatMoney(totals.gst, currency)}</strong>
            </span>
            <span>
              Total: <strong>{formatMoney(totals.total, currency)}</strong>
            </span>
          </div>

          {message ? <p role="alert">{message}</p> : null}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? 'Saving…' : `Save ${voucherType}`}
            </Button>
            <Button type="button" variant="neutral" onClick={() => navigate(backTo)} disabled={createVoucher.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
