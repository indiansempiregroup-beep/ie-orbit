import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useShopInvoices, useShopOrders, useShopQuotations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { useApiClient } from '../../hooks/useApiClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Commerce billing (customer invoices / credit notes / quotations).
 * Platform SaaS subscription billing lives under Settings → Products & billing.
 */
export function ShopBillingPage() {
  const invoices = useShopInvoices();
  const quotations = useShopQuotations();
  const orders = useShopOrders('completed');
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(error instanceof Error ? error.message : 'Unable to create invoice.');
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <h2 style={{ marginTop: 0 }}>Where to bill</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <strong>Customer commerce billing</strong> (this page): invoices from POS/orders, credit
            notes from returns, quotations.
          </li>
          <li>
            <strong>Your ShopIE plan</strong> (SaaS subscription):{' '}
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
                ShopIE plan
              </Button>
            </Link>
          }
        />
        {message ? <p role="status">{message}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredInvoices.map((invoice) => (
            <div key={invoice.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {invoice.invoice_number} · {invoice.status} · {invoice.currency} {invoice.total}
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
                {order.order_number} · {order.currency} {order.total}
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
            <div key={quote.id}>
              {quote.quotation_number} · {quote.status} · {quote.currency} {quote.total}
            </div>
          ))}
          {!quotations.data?.length ? <p>No quotations yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}
