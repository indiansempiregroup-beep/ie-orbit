import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopProductMutations, useShopProducts } from './shopHooks';
import { BarcodeCameraPanel } from './BarcodeCameraPanel';
import { computePosTotals, type DiscountType } from './posPricing';
import type { Customer, ShopProduct } from '@ie-platform/sdk';

type BasketLine = {
  product: ShopProduct;
  quantity: number;
  barcode_scanned?: string;
  discountType: DiscountType;
  discountValue: number;
};

type PaymentMethod = 'cash' | 'upi' | 'card' | 'borrow';

export function ShopPosPage() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const products = useShopProducts('', 'active');
  const { lookup, lookupBulk, createOrder } = useShopProductMutations();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [scan, setScan] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('');
  const [billDiscountValue, setBillDiscountValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace.businessId) return;
    void (async () => {
      try {
        const response = await client.customers.list({ business: workspace.businessId });
        setCustomers(response.data ?? []);
      } catch {
        setCustomers([]);
      }
    })();
  }, [client, workspace.businessId]);

  const filteredProducts = useMemo(() => {
    const rows = products.data ?? [];
    const term = productQuery.trim().toLowerCase();
    if (!term) return rows.slice(0, 80);
    return rows
      .filter((product) =>
        [product.name, product.brand ?? '', product.sku ?? '', ...(product.barcodes ?? []).map((b) => b.code)]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 80);
  }, [productQuery, products.data]);

  const totals = useMemo(
    () =>
      computePosTotals(
        basket.map((line) => ({
          id: line.product.id,
          name: line.product.name,
          unitPrice: Number(line.product.price),
          taxRate: Number(line.product.tax_rate ?? 0),
          quantity: line.quantity,
          discountType: line.discountType,
          discountValue: line.discountValue,
        })),
        billDiscountType,
        Number(billDiscountValue) || 0,
      ),
    [basket, billDiscountType, billDiscountValue],
  );

  function addProduct(product: ShopProduct, barcode?: string) {
    setBasket((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                barcode_scanned: barcode || line.barcode_scanned,
              }
            : line,
        );
      }
      return [
        ...current,
        { product, quantity: 1, barcode_scanned: barcode, discountType: '', discountValue: 0 },
      ];
    });
  }

  function updateLine(productId: string, patch: Partial<BasketLine>) {
    setBasket((current) =>
      current
        .map((line) => (line.product.id === productId ? { ...line, ...patch } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  const resolveCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setMessage(null);
      try {
        const product = await lookup.mutateAsync(trimmed);
        addProduct(product, trimmed);
        setScan('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Barcode not found.');
      }
    },
    [lookup],
  );

  async function handleScan(event: React.FormEvent) {
    event.preventDefault();
    await resolveCode(scan);
  }

  async function handleBulk() {
    const codes = bulkCodes
      .split(/[\n,;\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!codes.length) return;
    setMessage(null);
    try {
      const result = await lookupBulk.mutateAsync(codes);
      let added = 0;
      for (const item of result.items) {
        if (item.found && item.product) {
          addProduct(item.product, item.code);
          added += 1;
        }
      }
      setBulkCodes('');
      setMessage(`Resolved ${result.found_count}/${codes.length} codes · added ${added}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk lookup failed.');
    }
  }

  async function checkout() {
    if (!basket.length) return;
    if (paymentMethod === 'borrow' && !customerId) {
      const text = 'Select a customer for borrow / credit bills.';
      setMessage(text);
      snackbar.push(text, 'error');
      return;
    }
    setMessage(null);
    try {
      const order = await createOrder.mutateAsync({
        fulfillment_mode: 'pos',
        confirm: true,
        customer_id: customerId || null,
        payment_method: paymentMethod,
        bill_discount_type: billDiscountType,
        bill_discount_value: Number(billDiscountValue) || 0,
        notes:
          paymentMethod === 'borrow'
            ? 'POS · BORROW (due)'
            : `POS · ${paymentMethod.toUpperCase()}`,
        lines: basket.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
          unit_price: line.product.price,
          tax_rate: line.product.tax_rate,
          barcode_scanned: line.barcode_scanned,
          discount_type: line.discountType,
          discount_value: line.discountValue,
        })),
      });
      setBasket([]);
      setBillDiscountType('');
      setBillDiscountValue('0');
      const dueLabel = paymentMethod === 'borrow' ? ' · Due' : '';
      snackbar.push(
        `Bill ${order.order_number} created${dueLabel} · ${totals.payable.toFixed(2)}`,
        'success',
      );
      setMessage(`Bill ${order.order_number} created.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to create bill.';
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  return (
    <div className="page-stack">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.1fr) minmax(320px,0.9fr)' }}>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <h2 style={{ marginTop: 0 }}>Add to bill</h2>
            <form onSubmit={handleScan} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                placeholder="Scan barcode / RFID (HID wedge, camera, or type)"
                style={{ flex: 1, minWidth: 220, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <Button type="submit" disabled={lookup.isPending}>
                Add
              </Button>
              <Button type="button" onClick={() => setCameraOpen((open) => !open)}>
                {cameraOpen ? 'Hide camera' : 'Camera'}
              </Button>
            </form>
            <BarcodeCameraPanel
              active={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onCode={(code) => {
                void resolveCode(code);
              }}
            />
            <div style={{ marginTop: 12 }}>
              <textarea
                value={bulkCodes}
                onChange={(event) => setBulkCodes(event.target.value)}
                rows={3}
                placeholder="Bulk barcodes / EPC (one per line)"
                style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="button" onClick={handleBulk} disabled={lookupBulk.isPending}>
                  Resolve bulk
                </Button>
              </div>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </Card>

          <Card>
            <h2 style={{ marginTop: 0 }}>Catalog</h2>
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search products…"
              style={{ width: '100%', marginBottom: 12, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflow: 'auto' }}>
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                  }}
                >
                  <strong>{product.name}</strong>
                  <div style={{ opacity: 0.75 }}>
                    {product.price} · stock {product.stock_on_hand}
                    {product.category ? ` · ${product.category}` : ''}
                  </div>
                </button>
              ))}
              {!filteredProducts.length ? <p>No matching products.</p> : null}
            </div>
          </Card>
        </div>

        <Card style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
          <h2 style={{ marginTop: 0 }}>Bill</h2>
          <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Customer</span>
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Walk-in customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name ||
                    customer.display_name ||
                    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
                    customer.email ||
                    customer.phone_number ||
                    customer.id}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflow: 'auto', marginBottom: 12 }}>
            {basket.map((line) => {
              const priced = totals.lines.find((row) => row.id === line.product.id);
              return (
                <div
                  key={line.product.id}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>{line.product.name}</strong>
                      <div style={{ opacity: 0.75, fontSize: 13 }}>
                        {Number(line.product.price).toFixed(2)} × {line.quantity}
                        {priced && priced.discountAmount > 0
                          ? ` · disc. -${priced.discountAmount.toFixed(2)}`
                          : ''}
                      </div>
                    </div>
                    <strong>{priced?.total.toFixed(2) ?? '0.00'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      variant="neutral"
                      onClick={() => updateLine(line.product.id, { quantity: line.quantity - 1 })}
                    >
                      −
                    </Button>
                    <span>{line.quantity}</span>
                    <Button
                      type="button"
                      variant="neutral"
                      onClick={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}
                    >
                      +
                    </Button>
                    <select
                      value={line.discountType}
                      onChange={(event) =>
                        updateLine(line.product.id, {
                          discountType: event.target.value as DiscountType,
                          discountValue:
                            event.target.value === ''
                              ? 0
                              : line.discountValue || (event.target.value === 'percent' ? 5 : 10),
                        })
                      }
                      style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    >
                      <option value="">No discount</option>
                      <option value="percent">% off</option>
                      <option value="amount">₹ off</option>
                    </select>
                    {line.discountType ? (
                      <input
                        value={line.discountValue}
                        onChange={(event) =>
                          updateLine(line.product.id, {
                            discountValue: Number(event.target.value) || 0,
                          })
                        }
                        style={{ width: 88, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                    ) : null}
                    <Button type="button" variant="ghost" onClick={() => updateLine(line.product.id, { quantity: 0 })}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
            {!basket.length ? <p>Scan or pick products to start the bill.</p> : null}
          </div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Bill discount</span>
              <select
                value={billDiscountType}
                onChange={(event) => {
                  const next = event.target.value as DiscountType;
                  setBillDiscountType(next);
                  if (!next) setBillDiscountValue('0');
                }}
                style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                <option value="">None</option>
                <option value="percent">% off</option>
                <option value="amount">₹ off</option>
              </select>
              {billDiscountType ? (
                <input
                  value={billDiscountValue}
                  onChange={(event) => setBillDiscountValue(event.target.value)}
                  style={{ width: 88, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(
                [
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'card', label: 'Card' },
                  { value: 'borrow', label: 'Borrow' },
                ] as const
              ).map((method) => (
                <Button
                  key={method.value}
                  type="button"
                  variant={paymentMethod === method.value ? 'primary' : 'neutral'}
                  onClick={() => setPaymentMethod(method.value)}
                >
                  {method.label}
                </Button>
              ))}
            </div>
            {paymentMethod === 'borrow' ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Borrow / credit: customer takes goods now and pays later. A customer is required (not
                Walk-in).
              </p>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            <strong>Bill summary</strong>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Items</span>
              <span>{totals.merchandiseGross.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Product discounts</span>
              <span>-{totals.lineDiscountTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bill discount</span>
              <span>-{totals.billDiscountAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax</span>
              <span>{totals.taxTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
              <span>{paymentMethod === 'borrow' ? 'Amount due' : 'Payable'}</span>
              <span>{totals.payable.toFixed(2)}</span>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={() => void checkout()}
            disabled={!basket.length || createOrder.isPending}
          >
            {createOrder.isPending
              ? 'Creating bill…'
              : paymentMethod === 'borrow'
                ? `Create Bill · Due ${totals.payable.toFixed(2)}`
                : `Create Bill · ${totals.payable.toFixed(2)}`}
          </Button>
        </Card>
      </div>
    </div>
  );
}
