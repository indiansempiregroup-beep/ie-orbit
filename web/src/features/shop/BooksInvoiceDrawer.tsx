import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { saleInvoiceSourceLabel, voucherLineGrossAmount } from './saleInvoiceSource';
import { SaleInsightChips } from './SaleInsightChips';
import { useShopVoucher } from './shopHooks';

type LineItem = {
  name?: string;
  hsn_sac?: string;
  qty?: string | number;
  total?: string | number;
};

type ReturnHistoryRow = {
  return_id?: string;
  return_number?: string;
  refund_total?: string | number;
  tax_total?: string | number;
  credit_note_number?: string;
  at?: string;
};

type Props = {
  voucherId: string | null;
  open: boolean;
  onClose: () => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** In-place books invoice preview — no navigation away from the current page. */
export function BooksInvoiceDrawer({ voucherId, open, onClose }: Props) {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const voucherQuery = useShopVoucher(open ? voucherId : null);
  const voucher = voucherQuery.data;
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const isSale = String(voucher?.voucher_type || '').toLowerCase() === 'sale';
  const sourceLabel = voucher ? saleInvoiceSourceLabel(voucher, undefined, t) : '';

  const meta = asRecord(voucher?.metadata);
  const returnHistory = (
    Array.isArray(meta.returns) ? meta.returns : []
  ) as ReturnHistoryRow[];
  const returnedTotal = Number(meta.returned_total ?? 0);
  const returnedTax = Number(meta.returned_tax_total ?? 0);
  const hasReturns = returnHistory.length > 0 || returnedTotal > 0;
  const netTotal =
    meta.net_total != null
      ? Number(meta.net_total)
      : Math.max(0, Number(voucher?.total ?? 0) - returnedTotal);
  const netTax =
    meta.net_tax_total != null
      ? Number(meta.net_tax_total)
      : Math.max(0, Number(voucher?.tax_total ?? 0) - returnedTax);
  const displayPaid =
    meta.net_amount_paid != null ? Number(meta.net_amount_paid) : Number(voucher?.amount_paid ?? 0);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={voucher?.voucher_number || (voucherQuery.isLoading ? t('common.loading') : t('shop.booksInvoiceDrawer.titleFallback'))}
        labelledBy="books-invoice-drawer"
      >
        <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320, maxWidth: 520 }}>
          {voucherQuery.isLoading ? <p style={{ margin: 0 }}>{t('shop.booksInvoiceDrawer.loadingInvoice')}</p> : null}
          {voucherQuery.isError ? (
            <p role="alert" style={{ margin: 0 }}>
              {t('shop.booksInvoiceDrawer.loadFailed')}
            </p>
          ) : null}

          {voucher ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {sourceLabel ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#E0F2FE',
                      color: '#075985',
                    }}
                  >
                    {sourceLabel}
                  </span>
                ) : null}
                {hasReturns ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#FEF3C7',
                      color: '#92400e',
                    }}
                  >
                    {t('shop.booksInvoiceDrawer.returnsBadge', { count: returnHistory.length || 1 })}
                  </span>
                ) : null}
                <span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
                  {formatVoucherWhen(voucher.voucher_date, voucher.created_at) || voucher.voucher_date} ·{' '}
                  {voucher.customer_name || voucher.supplier_name || t('shop.booksInvoiceDrawer.cash')} · {voucher.status}
                </span>
              </div>

              {isSale ? <SaleInsightChips source={voucher} currency={currency} /> : null}

              <div style={{ display: 'grid', gap: 6 }}>
                {((voucher.line_items as LineItem[] | undefined) ?? []).map((line, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 12 }}>
                    <span>
                      {line.name} {line.hsn_sac ? `· ${t('shop.booksInvoiceDrawer.hsn', { code: line.hsn_sac })}` : ''} × {line.qty}
                    </span>
                    <strong>
                      {formatMoney(voucherLineGrossAmount(line as Record<string, unknown>), currency)}
                    </strong>
                  </div>
                ))}
                {!voucher.line_items?.length ? <p style={{ margin: 0 }}>{t('shop.booksInvoiceDrawer.noLines')}</p> : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  fontSize: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('shop.booksInvoiceDrawer.subtotal')}</span>
                  <span>{formatMoney(Number(voucher.subtotal ?? 0), currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{hasReturns ? t('shop.booksInvoiceDrawer.taxOriginal') : t('shop.booksInvoiceDrawer.tax')}</span>
                  <span>{formatMoney(Number(voucher.tax_total ?? 0), currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>{hasReturns ? t('shop.booksInvoiceDrawer.totalOriginal') : t('shop.booksInvoiceDrawer.total')}</span>
                  <span>{formatMoney(Number(voucher.total ?? 0), currency)}</span>
                </div>
                {hasReturns ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                      <span>{t('shop.booksInvoiceDrawer.returned')}</span>
                      <span>−{formatMoney(returnedTotal, currency)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>{t('shop.booksInvoiceDrawer.netTotal')}</span>
                      <span>{formatMoney(netTotal, currency)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('shop.booksInvoiceDrawer.netTax')}</span>
                      <span>{formatMoney(netTax, currency)}</span>
                    </div>
                  </>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('shop.booksInvoiceDrawer.paid')}</span>
                  <span>{formatMoney(displayPaid, currency)}</span>
                </div>
              </div>

              {hasReturns ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t('shop.booksInvoiceDrawer.returnHistory')}</div>
                  {returnHistory.map((row, index) => {
                    const returnNumber = String(row.return_number || t('shop.booksInvoiceDrawer.returnFallback', { n: index + 1 }));
                    const cnNumber = String(row.credit_note_number || '');
                    const at = typeof row.at === 'string' ? formatVoucherWhen(row.at, row.at) : '';
                    return (
                      <div
                        key={`${returnNumber}-${index}`}
                        style={{
                          display: 'grid',
                          gap: 4,
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'color-mix(in srgb, #b45309 6%, var(--card))',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <strong>{returnNumber}</strong>
                          <span>{formatMoney(Number(row.refund_total ?? 0), currency)}</span>
                        </div>
                        <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
                          {[
                            at,
                            cnNumber ? t('shop.booksInvoiceDrawer.creditNote', { number: cnNumber }) : '',
                            row.tax_total != null && row.tax_total !== ''
                              ? t('shop.booksInvoiceDrawer.gst', { amount: formatMoney(Number(row.tax_total), currency) })
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {voucher.notes ? <p style={{ margin: 0, fontSize: 13 }}>{t('shop.booksInvoiceDrawer.notes', { notes: voucher.notes })}</p> : null}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {isSale && workspace.businessId ? (
                  <Button
                    type="button"
                    onClick={() =>
                      setDocActions({
                        kind: 'sale',
                        id: voucher.id,
                        number: voucher.voucher_number,
                        businessId: workspace.businessId!,
                        phone: voucher.customer_phone || '',
                        email: voucher.customer_email || '',
                      })
                    }
                  >
                    {t('shop.booksInvoiceDrawer.viewPrintShare')}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={onClose}>
                  {t('common.close')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>

      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? t('shop.booksInvoiceDrawer.saleTitle', { number: docActions.number || '' }) : t('shop.booksInvoiceDrawer.saleInvoice')}
      />
    </>
  );
}
