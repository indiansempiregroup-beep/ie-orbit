import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ShopQuotation } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopInvoices, useShopOrders, useShopQuotationMutations, useShopQuotations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { useApiClient } from '../../hooks/useApiClient';
import { formatMoney } from '../../lib/currency';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Commerce billing (customer invoices / credit notes / quotations).
 * Platform SaaS subscription billing lives under Settings → Products & billing.
 */
const QUOTE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

function quoteIsConverted(quote: ShopQuotation) {
  return Boolean(quote.converted_order || (quote.status || '').toLowerCase() === 'converted');
}

function quoteCanConvert(quote: ShopQuotation) {
  const status = (quote.status || '').toLowerCase();
  return !quoteIsConverted(quote) && status !== 'rejected' && status !== 'expired';
}

export function ShopBillingPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const invoices = useShopInvoices();
  const quotations = useShopQuotations();
  const orders = useShopOrders('completed');
  const { updateQuotation, convertQuotation } = useShopQuotationMutations();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<ShopQuotation | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [quoteValidUntil, setQuoteValidUntil] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  useEffect(() => {
    if (!selectedQuote) return;
    setQuoteStatus((selectedQuote.status || 'draft').toLowerCase());
    setQuoteValidUntil(selectedQuote.valid_until || '');
    setQuoteNotes(selectedQuote.notes || '');
  }, [selectedQuote?.id]);

  const createInvoice = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await client.shop.createInvoiceFromOrder(orderId);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shop-invoices'] });
    },
  });

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (invoices.data ?? []).filter((invoice) => {
      if (status && invoice.status !== status) return false;
      if (!term) return true;
      return [invoice.invoice_number, invoice.status, String(invoice.total), invoice.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [invoices.data, search, status]);

  async function issueInvoice(orderId: string) {
    setMessage(null);
    try {
      const invoice = await createInvoice.mutateAsync(orderId);
      setMessage(`Invoice ${invoice.invoice_number} created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't create this invoice. Try again.");
    }
  }

  async function saveQuote() {
    if (!selectedQuote) return;
    setMessage(null);
    try {
      const updated = await updateQuotation.mutateAsync({
        quotationId: selectedQuote.id,
        body: {
          status: quoteStatus,
          valid_until: quoteValidUntil || null,
          notes: quoteNotes,
        },
      });
      setSelectedQuote(updated);
      setMessage(`Quotation ${updated.quotation_number} updated.`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Couldn't update this quotation. Try again."));
    }
  }

  async function convertQuote() {
    if (!selectedQuote) return;
    if (!window.confirm(`Convert ${selectedQuote.quotation_number} into a sale invoice?`)) return;
    setMessage(null);
    try {
      const voucher = await convertQuotation.mutateAsync(selectedQuote.id);
      setSelectedQuote(null);
      setMessage(`Converted to sale ${voucher.voucher_number}.`);
      navigate(`/shop/books/sale/${voucher.id}`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Couldn't convert this quotation. Try again."));
    }
  }

  return (
    <div className="page-stack">
      <Card style={{ borderColor: 'var(--primary)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>GST sales now live under Books</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            For GST-compliant invoices (CGST/SGST/IGST, HSN/SAC, place of supply) plus purchases, expenses,
            and party ledgers, use Orbit Mart Books.
          </p>
        </div>
        <Link to="/shop/books/sale">
          <Button type="button" variant="primary">
            Open Books → Sale
          </Button>
        </Link>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Where to bill</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <strong>Customer commerce billing</strong> (this page): invoices from POS/orders, credit
            notes from returns, quotations.
          </li>
          <li>
            <strong>GST sales &amp; purchases</strong>: recorded in{' '}
            <Link to="/shop/books">Orbit Mart Books</Link> with CGST/SGST/IGST split, HSN/SAC, and GSTR-1/3B
            reports.
          </li>
          <li>
            <strong>Your Orbit Mart plan</strong> (SaaS subscription):{' '}
            <Link to="/settings/products">Settings → Products &amp; billing</Link>.
          </li>
          <li>
            Quick path from an order: open the order → process sale → issue invoice here or from the
            order detail.
          </li>
        </ul>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Invoices &amp; credit notes</h2>
          <Button type="button" variant="ghost" onClick={() => invoices.refetch()}>
            Refresh
          </Button>
        </div>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search invoice number…"
          onClear={() => {
            setSearch('');
            setStatus('');
          }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'draft', label: 'Draft' },
                { value: 'issued', label: 'Issued' },
                { value: 'paid', label: 'Paid' },
                { value: 'credit', label: 'Credit note' },
                { value: 'void', label: 'Void' },
              ],
            },
          ]}
          action={
            <Link to="/settings/products">
              <Button type="button" variant="neutral">
                Orbit Mart plan
              </Button>
            </Link>
          }
        />
        {message ? <p role="status">{message}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredInvoices.map((invoice) => (
            <div key={invoice.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {invoice.invoice_number} · {invoice.status} · {formatMoney(Number(invoice.total ?? 0), invoice.currency)}
              </span>
              {invoice.order ? <Link to={`/shop/orders/${invoice.order}`}>Order</Link> : null}
            </div>
          ))}
          {!invoices.data?.length ? <p>No invoices yet. Complete a POS/order then issue one below.</p> : null}
          {invoices.data?.length && !filteredInvoices.length ? (
            <p>No invoices match these filters.</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2>Issue invoice from completed order</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(orders.data ?? []).slice(0, 20).map((order) => (
            <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {order.order_number} · {formatMoney(Number(order.total ?? 0), order.currency)}
              </span>
              <Button
                type="button"
                variant="neutral"
                disabled={createInvoice.isPending}
                onClick={() => void issueInvoice(order.id)}
              >
                Create invoice
              </Button>
            </div>
          ))}
          {!orders.data?.length ? <p>No completed orders available.</p> : null}
        </div>
      </Card>

      <Card>
        <h2>Quotations</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(quotations.data ?? []).map((quote) => (
            <button
              key={quote.id}
              type="button"
              onClick={() => setSelectedQuote(quote)}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                textAlign: 'left',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                background: 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <span>
                {quote.quotation_number} · {quote.customer_name || 'No customer'} · {quote.status} ·{' '}
                {formatMoney(Number(quote.total ?? 0), quote.currency)}
              </span>
              <span style={{ color: 'var(--primary)', fontSize: 13 }}>Open</span>
            </button>
          ))}
          {!quotations.data?.length ? <p>No quotations yet.</p> : null}
        </div>
      </Card>
      <Dialog
        open={Boolean(selectedQuote)}
        onClose={() => setSelectedQuote(null)}
        title={selectedQuote ? selectedQuote.quotation_number : 'Quotation'}
        labelledBy="quotation-detail-dialog"
        busy={updateQuotation.isPending || convertQuotation.isPending}
      >
        {selectedQuote ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {selectedQuote.customer_name || 'No customer'} · {formatMoney(Number(selectedQuote.total ?? 0), selectedQuote.currency)}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {((selectedQuote.line_items as Array<Record<string, unknown>> | undefined) ?? []).map((line, index) => {
                const productId = String(line.product_id || '').trim();
                const name = String(line.name || `Item ${index + 1}`);
                const qty = line.quantity ?? line.qty ?? 0;
                const label = `${name} × ${qty}`;
                return (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    {productId ? (
                      <Link to={`/shop/products?product=${encodeURIComponent(productId)}`}>{label}</Link>
                    ) : (
                      <span>{label}</span>
                    )}
                    <strong>{formatMoney(Number(line.line_total ?? 0), selectedQuote.currency)}</strong>
                  </div>
                );
              })}
              {!selectedQuote.line_items?.length ? <p style={{ margin: 0 }}>No line items.</p> : null}
            </div>
            {quoteIsConverted(selectedQuote) ? (
              <p style={{ margin: 0, fontSize: 13 }}>This quotation has been converted to a sale.</p>
            ) : (
              <>
                <Select
                  label="Status"
                  value={quoteStatus}
                  onChange={(event) => setQuoteStatus(event.target.value)}
                  options={QUOTE_STATUSES}
                />
                <Input
                  label="Valid until"
                  type="date"
                  value={quoteValidUntil}
                  onChange={(event) => setQuoteValidUntil(event.target.value)}
                />
                <label className="ui-field">
                  <span className="ui-field-label">Notes</span>
                  <textarea
                    className="ui-control"
                    rows={3}
                    value={quoteNotes}
                    onChange={(event) => setQuoteNotes(event.target.value)}
                  />
                </label>
              </>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {workspace.businessId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDocActions({
                      kind: 'quotation',
                      id: selectedQuote.id,
                      number: selectedQuote.quotation_number,
                      businessId: workspace.businessId!,
                      phone: selectedQuote.customer_phone || '',
                      email: selectedQuote.customer_email || '',
                    })
                  }
                >
                  Print / Share
                </Button>
              ) : null}
              {!quoteIsConverted(selectedQuote) ? (
                <Button type="button" variant="neutral" onClick={() => void saveQuote()} disabled={updateQuotation.isPending}>
                  {updateQuotation.isPending ? 'Saving…' : 'Save'}
                </Button>
              ) : null}
              {quoteCanConvert(selectedQuote) ? (
                <Button type="button" onClick={() => void convertQuote()} disabled={convertQuotation.isPending}>
                  {convertQuotation.isPending ? 'Converting…' : 'Convert to sale'}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setSelectedQuote(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Quotation ${docActions.number || ''}` : 'Quotation'}
      />
    </div>
  );
}
