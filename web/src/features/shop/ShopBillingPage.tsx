import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
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
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

function quoteIsConverted(quote: ShopQuotation) {
  return Boolean(quote.converted_order || (quote.status || '').toLowerCase() === 'converted');
}

function quoteCanConvert(quote: ShopQuotation) {
  const status = (quote.status || '').toLowerCase();
  return !quoteIsConverted(quote) && status !== 'rejected' && status !== 'expired';
}

export function ShopBillingPage() {
  const { t } = useTranslation();
  const tb = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.billingPage.${key}`, options));
  const invoiceStatusText = (value?: string) =>
    ['draft', 'issued', 'paid', 'credit', 'void'].includes(String(value))
      ? tb(`invoiceStatuses.${value}`)
      : (value ?? '');
  const quoteStatusText = (value?: string) => {
    const key = String(value || '').toLowerCase();
    return [...QUOTE_STATUSES, 'converted'].includes(key) ? tb(`quoteStatuses.${key}`) : (value ?? '');
  };
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [invoiceCursor, setInvoiceCursor] = useState<string | null>(null);
  const [quoteCursor, setQuoteCursor] = useState<string | null>(null);
  const [orderCursor, setOrderCursor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<ShopQuotation | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('draft');
  const [quoteValidUntil, setQuoteValidUntil] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setInvoiceCursor(null);
    setQuoteCursor(null);
    setOrderCursor(null);
  }, [debouncedSearch, status]);

  const invoices = useShopInvoices({ q: debouncedSearch || undefined, cursor: invoiceCursor });
  const quotations = useShopQuotations({ q: debouncedSearch || undefined, cursor: quoteCursor });
  const orders = useShopOrders('completed', { q: debouncedSearch || undefined, cursor: orderCursor });
  const { updateQuotation, convertQuotation } = useShopQuotationMutations();
  const client = useApiClient();
  const queryClient = useQueryClient();

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
    return (invoices.data?.items ?? []).filter((invoice) => {
      if (status && invoice.status !== status) return false;
      return true;
    });
  }, [invoices.data, status]);

  async function issueInvoice(orderId: string) {
    setMessage(null);
    try {
      const invoice = await createInvoice.mutateAsync(orderId);
      setMessage(tb('invoiceCreated', { number: invoice.invoice_number }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tb('invoiceFailed'));
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
      setMessage(tb('quoteUpdated', { number: updated.quotation_number }));
    } catch (error) {
      setMessage(getApiErrorMessage(error, tb('quoteUpdateFailed')));
    }
  }

  async function convertQuote() {
    if (!selectedQuote) return;
    if (!window.confirm(tb('confirmConvert', { number: selectedQuote.quotation_number }))) return;
    setMessage(null);
    try {
      const voucher = await convertQuotation.mutateAsync(selectedQuote.id);
      setSelectedQuote(null);
      setMessage(tb('convertedTo', { number: voucher.voucher_number }));
      navigate(`/shop/books/sale/${voucher.id}`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, tb('convertFailed')));
    }
  }

  return (
    <div className="page-stack">
      <Card style={{ borderColor: 'var(--primary)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>{tb('bannerTitle')}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
            {tb('bannerBody')}
          </p>
        </div>
        <Link to="/shop/books/sale">
          <Button type="button" variant="primary">
            {tb('openBooksSale')}
          </Button>
        </Link>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{tb('whereToBill')}</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <Trans i18nKey="shop.billingPage.whereCommerce" components={{ b: <strong /> }} />
          </li>
          <li>
            <Trans
              i18nKey="shop.billingPage.whereGst"
              components={{ b: <strong />, books: <Link to="/shop/books" /> }}
            />
          </li>
          <li>
            <Trans
              i18nKey="shop.billingPage.wherePlan"
              components={{ b: <strong />, settings: <Link to="/settings/products" /> }}
            />
          </li>
          <li>{tb('whereQuick')}</li>
        </ul>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{tb('invoicesCredit')}</h2>
          <Button type="button" variant="ghost" onClick={() => invoices.refetch()}>
            {t('common.refresh')}
          </Button>
        </div>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={tb('searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setStatus('');
          }}
          filters={[
            {
              id: 'status',
              label: t('common.status'),
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: tb('allStatuses') },
                { value: 'draft', label: tb('invoiceStatuses.draft') },
                { value: 'issued', label: tb('invoiceStatuses.issued') },
                { value: 'paid', label: tb('invoiceStatuses.paid') },
                { value: 'credit', label: tb('invoiceStatuses.credit') },
                { value: 'void', label: tb('invoiceStatuses.void') },
              ],
            },
          ]}
          action={
            <Link to="/settings/products">
              <Button type="button" variant="neutral">
                {tb('orbitMartPlan')}
              </Button>
            </Link>
          }
        />
        {message ? <p role="status">{message}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredInvoices.map((invoice) => (
            <div key={invoice.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {invoice.invoice_number} · {invoiceStatusText(invoice.status)} · {formatMoney(Number(invoice.total ?? 0), invoice.currency)}
              </span>
              {invoice.order ? <Link to={`/shop/orders/${invoice.order}`}>{tb('orderLink')}</Link> : null}
            </div>
          ))}
          {!invoices.data?.items.length ? <p>{tb('noInvoices')}</p> : null}
          {invoices.data?.items.length && !filteredInvoices.length ? (
            <p>{tb('noMatch')}</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2>{tb('issueFromOrder')}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(orders.data?.items ?? []).slice(0, 20).map((order) => (
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
                {tb('createInvoice')}
              </Button>
            </div>
          ))}
          {!orders.data?.items.length ? <p>{tb('noCompletedOrders')}</p> : null}
        </div>
      </Card>

      <Card>
        <h2>{tb('quotations')}</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {(quotations.data?.items ?? []).map((quote) => (
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
                {quote.quotation_number} · {quote.customer_name || tb('noCustomer')} · {quoteStatusText(quote.status)} ·{' '}
                {formatMoney(Number(quote.total ?? 0), quote.currency)}
              </span>
              <span style={{ color: 'var(--primary)', fontSize: 13 }}>{tb('open')}</span>
            </button>
          ))}
          {!quotations.data?.items.length ? <p>{tb('noQuotations')}</p> : null}
        </div>
      </Card>
      <Dialog
        open={Boolean(selectedQuote)}
        onClose={() => setSelectedQuote(null)}
        title={selectedQuote ? selectedQuote.quotation_number : tb('quotation')}
        labelledBy="quotation-detail-dialog"
        busy={updateQuotation.isPending || convertQuotation.isPending}
      >
        {selectedQuote ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {selectedQuote.customer_name || tb('noCustomer')} · {formatMoney(Number(selectedQuote.total ?? 0), selectedQuote.currency)}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {((selectedQuote.line_items as Array<Record<string, unknown>> | undefined) ?? []).map((line, index) => {
                const productId = String(line.product_id || '').trim();
                const name = String(line.name || tb('itemN', { n: index + 1 }));
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
              {!selectedQuote.line_items?.length ? <p style={{ margin: 0 }}>{tb('noLineItems')}</p> : null}
            </div>
            {quoteIsConverted(selectedQuote) ? (
              <p style={{ margin: 0, fontSize: 13 }}>{tb('converted')}</p>
            ) : (
              <>
                <Select
                  label={t('common.status')}
                  value={quoteStatus}
                  onChange={(event) => setQuoteStatus(event.target.value)}
                  options={QUOTE_STATUSES.map((value) => ({ value, label: tb(`quoteStatuses.${value}`) }))}
                />
                <Input
                  label={tb('validUntil')}
                  type="date"
                  value={quoteValidUntil}
                  onChange={(event) => setQuoteValidUntil(event.target.value)}
                />
                <label className="ui-field">
                  <span className="ui-field-label">{tb('notes')}</span>
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
                  {tb('printShare')}
                </Button>
              ) : null}
              {!quoteIsConverted(selectedQuote) ? (
                <Button type="button" variant="neutral" onClick={() => void saveQuote()} disabled={updateQuotation.isPending}>
                  {updateQuotation.isPending ? tb('saving') : t('common.save')}
                </Button>
              ) : null}
              {quoteCanConvert(selectedQuote) ? (
                <Button type="button" onClick={() => void convertQuote()} disabled={convertQuotation.isPending}>
                  {convertQuotation.isPending ? tb('converting') : tb('convertToSale')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setSelectedQuote(null)}>
                {t('shop.vouchers.close')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? tb('quotationDoc', { number: docActions.number || '' }) : tb('quotation')}
      />
    </div>
  );
}
