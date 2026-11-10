import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Truck } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentView } from './shopDocumentActions';
import { useAuthContext } from '../../contexts/AuthContext';
import { ShopBooksDocumentDialog } from './ShopBooksDocumentDialog';
import { useShopBooksDocumentMutations, useShopBooksDocuments } from './shopHooks';
import type { ShopBooksDocument } from '@ie-orbit/sdk';

export function ShopDeliveryChallansPage() {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const auth = useAuthContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currency = workspace.activeBusiness?.currency;
  const challans = useShopBooksDocuments('delivery_challan');
  const { convert } = useShopBooksDocumentMutations();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [selected, setSelected] = useState<ShopBooksDocument | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rows = challans.data ?? [];
  const statusLabel = (value: string) => {
    const key = value.toLowerCase();
    return ['draft', 'confirmed', 'dispatched', 'converted', 'cancelled', 'void'].includes(key)
      ? t(`shop.deliveryChallans.statuses.${key}`)
      : value;
  };

  useEffect(() => {
    const documentId = searchParams.get('document');
    if (!documentId || !rows.length) return;
    const match = rows.find((row) => row.id === documentId);
    if (match) setSelected(match);
    const next = new URLSearchParams(searchParams);
    next.delete('document');
    setSearchParams(next, { replace: true });
  }, [rows, searchParams, setSearchParams]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const rowStatus = row.status.toLowerCase();
      if (status === 'open' && !['draft', 'confirmed'].includes(rowStatus)) return false;
      if (status === 'converted' && rowStatus !== 'converted' && !row.converted_voucher) return false;
      if (status && status !== 'open' && status !== 'converted' && rowStatus !== status) return false;
      if (!term) return true;
      return [row.document_number, row.customer_name, row.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, status]);

  const openCount = rows.filter((row) => ['draft', 'confirmed'].includes(row.status.toLowerCase())).length;
  const dispatchedCount = rows.filter((row) => row.status.toLowerCase() === 'dispatched').length;
  const invoicedCount = rows.filter(
    (row) => row.converted_voucher || row.status.toLowerCase() === 'converted',
  ).length;

  async function dispatch(documentId: string, documentNumber: string) {
    if (!window.confirm(t('shop.deliveryChallans.confirmDispatch', { number: documentNumber }))) return;
    try {
      await convert.mutateAsync({ documentId, action: 'dispatch' });
      snackbar.push(t('shop.deliveryChallans.toastDispatched', { number: documentNumber }), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('shop.deliveryChallans.errDispatch')), 'error');
    }
  }

  async function invoice(documentId: string, documentNumber: string) {
    if (!window.confirm(t('shop.deliveryChallans.confirmInvoice', { number: documentNumber }))) return;
    try {
      const result = await convert.mutateAsync({ documentId, action: 'to_invoice' });
      const voucher =
        result && typeof result === 'object' && 'voucher_number' in result
          ? (result as { id: string; voucher_number?: string })
          : null;
      snackbar.push(
        voucher?.voucher_number
          ? t('shop.deliveryChallans.toastInvoicedAs', { number: documentNumber, invoice: voucher.voucher_number })
          : t('shop.deliveryChallans.toastConverted', { number: documentNumber }),
        'success',
      );
      setSelected(null);
      if (voucher?.id) navigate(`/shop/books/sale/${voucher.id}`);
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('shop.deliveryChallans.errInvoice')), 'error');
    }
  }

  return (
    <div className="page-stack">
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={
          docActions
            ? t('shop.deliveryChallans.challanNumber', { number: docActions.number || '' })
            : t('shop.deliveryChallans.dispatchTitle')
        }
      />
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{t('shop.deliveryChallans.title')}</h1>
        <Link to="/shop/pos?mode=delivery_challan" style={{ textDecoration: 'none' }}>
          <Button type="button" variant="primary">
            <Plus size={16} aria-hidden="true" /> {t('shop.deliveryChallans.newChallan')}
          </Button>
        </Link>
      </div>

      <div className="invoice-strip">
        <div className="invoice-strip__cell">
          <span>{t('shop.deliveryChallans.statAll')}</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>{t('shop.deliveryChallans.statOpen')}</span>
          <strong>{openCount}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>{t('shop.deliveryChallans.statDispatched')}</span>
          <strong>{dispatchedCount}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>{t('shop.deliveryChallans.statInvoiced')}</span>
          <strong>{invoicedCount}</strong>
        </div>
      </div>

      <Card>
        {message ? <p role="status">{message}</p> : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted-foreground)' }} />
            <input
              aria-label={t('shop.deliveryChallans.searchAria')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('shop.deliveryChallans.searchPlaceholder')}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 }}
            />
          </label>
          <Select
            aria-label={t('shop.deliveryChallans.filterStatusAria')}
            compact
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: t('shop.deliveryChallans.allStatuses') },
              { value: 'open', label: t('shop.deliveryChallans.statOpen') },
              { value: 'dispatched', label: t('shop.deliveryChallans.statDispatched') },
              { value: 'converted', label: t('shop.deliveryChallans.statInvoiced') },
            ]}
            style={{ minWidth: 180 }}
          />
        </div>

        {challans.isLoading ? <p role="status">{t('shop.deliveryChallans.loading')}</p> : null}
        {challans.error ? <p role="alert">{getApiErrorMessage(challans.error, t('shop.deliveryChallans.errLoad'))}</p> : null}
        {!challans.isLoading && !filteredRows.length ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--muted-foreground)' }}>
            <Truck size={30} aria-hidden="true" />
            <p style={{ marginBottom: 4, fontWeight: 700, color: 'var(--foreground)' }}>
              {rows.length ? t('shop.deliveryChallans.emptyFiltered') : t('shop.deliveryChallans.emptyNone')}
            </p>
            <span style={{ fontSize: 13 }}>
              {rows.length ? t('shop.deliveryChallans.hintFiltered') : t('shop.deliveryChallans.hintNone')}
            </span>
            {!rows.length ? (
              <div style={{ marginTop: 12 }}>
                <Link to="/shop/pos?mode=delivery_challan" style={{ textDecoration: 'none' }}>
                  <Button type="button" variant="primary">
                    {t('shop.deliveryChallans.openSaleCounter')}
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="invoice-list">
          {filteredRows.map((row) => {
            const status = row.status.toLowerCase();
            const canDispatch =
              !row.converted_voucher && !['dispatched', 'converted', 'cancelled', 'void'].includes(status);
            const canInvoice =
              !row.converted_voucher && !['converted', 'cancelled', 'void'].includes(status);
            const isVoid = ['cancelled', 'void'].includes(status);
            const invoiced = Boolean(row.converted_voucher || status === 'converted');
            const dispatched = status === 'dispatched';
            return (
              <div
                key={row.id}
                className={`invoice-row${isVoid ? ' invoice-row--void' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelected(row);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="invoice-row__main">
                  <strong>{row.customer_name || t('shop.deliveryChallans.walkIn')}</strong>
                  <span>
                    {row.document_number}
                    {row.document_date || row.created_at
                      ? ` · ${formatVoucherWhen(row.document_date, row.created_at)}`
                      : ''}
                  </span>
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(Number(row.total ?? 0), currency)}</strong>
                  <span
                    className={`invoice-pill ${isVoid ? 'is-void' : invoiced ? 'is-paid' : dispatched ? 'is-paid' : 'is-due'}`}
                  >
                    {invoiced ? t('shop.deliveryChallans.invoicedBadge') : statusLabel(row.status)}
                  </span>
                </div>
                {workspace.businessId ? (
                  <div className="invoice-row__actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title={t('shop.deliveryChallans.viewTitle')}
                      aria-label={t('shop.deliveryChallans.viewAria', { number: row.document_number })}
                      onClick={() => {
                        const target = {
                          kind: 'delivery_challan' as const,
                          id: row.id,
                          number: row.document_number,
                          businessId: workspace.businessId!,
                          phone: row.customer_phone || '',
                          email: row.customer_email || '',
                        };
                        void openShopDocumentView(target, auth.token, 'a4', workspace.tenantId).catch((error) =>
                          snackbar.push(error instanceof Error ? error.message : t('shop.deliveryChallans.viewFailed'), 'error'),
                        );
                      }}
                    >
                      {t('shop.deliveryChallans.view')}
                    </button>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title={t('shop.deliveryChallans.shareTitle')}
                      aria-label={t('shop.deliveryChallans.shareAria', { number: row.document_number })}
                      onClick={() =>
                        setDocActions({
                          kind: 'delivery_challan',
                          id: row.id,
                          number: row.document_number,
                          businessId: workspace.businessId!,
                          phone: row.customer_phone || '',
                          email: row.customer_email || '',
                        })
                      }
                    >
                      {t('shop.deliveryChallans.share')}
                    </button>
                  </div>
                ) : null}
                {canDispatch ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={convert.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void dispatch(row.id, row.document_number);
                    }}
                  >
                    {t('shop.deliveryChallans.dispatch')}
                  </Button>
                ) : null}
                {canInvoice ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={convert.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void invoice(row.id, row.document_number);
                    }}
                  >
                    {t('shop.deliveryChallans.createInvoice')}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      <ShopBooksDocumentDialog
        document={selected}
        docType="delivery_challan"
        currency={currency}
        onClose={() => setSelected(null)}
        onMessage={setMessage}
      />
    </div>
  );
}

export default ShopDeliveryChallansPage;
