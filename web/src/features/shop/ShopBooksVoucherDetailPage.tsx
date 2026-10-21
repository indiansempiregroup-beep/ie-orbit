import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { PurchasePayForm } from './PurchasePayForm';
import { voucherLineGrossAmount } from './saleInvoiceSource';
import { useShopVoucher, useShopVoucherMutations } from './shopHooks';

type LineItem = {
  name?: string;
  hsn_sac?: string;
  qty?: string | number;
  rate?: string | number;
  unit_price?: string | number;
  gross?: string | number;
  total?: string | number;
  product_id?: string | null;
};

function listPathFor(voucher: ShopBooksVoucher): string {
  return String(voucher.voucher_type || '').toLowerCase() === 'purchase'
    ? '/shop/books/purchase'
    : '/shop/books/sale';
}

export function ShopBooksVoucherDetailPage() {
  const { voucherId = '' } = useParams<{ voucherId: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const currency = workspace.activeBusiness?.currency;
  const voucherQuery = useShopVoucher(voucherId || null);
  const { voidVoucher } = useShopVoucherMutations();
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const voucher = voucherQuery.data;
  const isSale = String(voucher?.voucher_type || '').toLowerCase() === 'sale';
  const isPurchase = String(voucher?.voucher_type || '').toLowerCase() === 'purchase';
  const backPath = voucher ? listPathFor(voucher) : '/shop/books';
  const paidAmount = Number(voucher?.amount_paid ?? 0);
  const totalAmount = Number(voucher?.total ?? 0);
  const dueAmount = Math.max(0, totalAmount - paidAmount);
  const voided = String(voucher?.status || '').toLowerCase() === 'void';
  const paid = !voided && dueAmount <= 0.009;

  async function handleVoid() {
    if (!voucher) return;
    if (!window.confirm(`Void ${voucher.voucher_number}? This cannot be undone.`)) return;
    try {
      await voidVoucher.mutateAsync(voucher.id);
      snackbar.push(`${voucher.voucher_number} voided.`, 'success');
      navigate(backPath, { replace: true });
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't void this voucher. Try again."), 'error');
    }
  }

  return (
    <div className="page-stack" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <Link to={backPath} style={{ fontSize: 13 }}>
            ← Back to {isSale ? 'sale invoices' : isPurchase ? 'purchases' : 'books'}
          </Link>
          <h1 style={{ margin: '8px 0 0', fontSize: 22 }}>
            {voucher?.voucher_number || (voucherQuery.isLoading ? 'Loading…' : 'Books invoice')}
          </h1>
        </div>
        {voucher && isSale && workspace.businessId ? (
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
            View / Print / Share
          </Button>
        ) : null}
      </div>

      {voucherQuery.isLoading ? <p>Loading invoice…</p> : null}
      {voucherQuery.isError ? (
        <Card>
          <p role="alert" style={{ margin: 0 }}>
            Couldn&apos;t open this books invoice. It may have been deleted, or you may not have access.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link to="/shop/books">
              <Button type="button" variant="neutral">
                Books home
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {voucher ? (
        <Card>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {formatVoucherWhen(voucher.voucher_date, voucher.created_at) || voucher.voucher_date} ·{' '}
              {voucher.customer_name || voucher.supplier_name || 'Cash'} ·{' '}
              {voided ? 'Void' : paid ? 'Paid' : `To pay ${formatMoney(dueAmount, currency)}`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 14 }}>
              <span>
                Paid <strong>{formatMoney(paidAmount, currency)}</strong>
              </span>
              <span>
                {isPurchase ? 'To pay' : 'Due'} <strong>{formatMoney(dueAmount, currency)}</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              {((voucher.line_items as LineItem[] | undefined) ?? []).map((line, index) => {
                const productId = String(line.product_id || '').trim();
                const label = (
                  <>
                    {line.name} {line.hsn_sac ? `· HSN ${line.hsn_sac}` : ''} × {line.qty}
                  </>
                );
                return (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    {productId ? (
                      <Link to={`/shop/products?product=${encodeURIComponent(productId)}`}>{label}</Link>
                    ) : (
                      <span>{label}</span>
                    )}
                    <strong>
                      {formatMoney(voucherLineGrossAmount(line as Record<string, unknown>), currency)}
                    </strong>
                  </div>
                );
              })}
              {!voucher.line_items?.length ? <p style={{ margin: 0 }}>No line items.</p> : null}
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
                <span>Subtotal</span>
                <span>{formatMoney(Number(voucher.subtotal ?? 0), currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax</span>
                <span>{formatMoney(Number(voucher.tax_total ?? 0), currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span>Total</span>
                <span>{formatMoney(Number(voucher.total ?? 0), currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Paid</span>
                <span>{formatMoney(Number(voucher.amount_paid ?? 0), currency)}</span>
              </div>
            </div>

            {voucher.notes ? <p style={{ margin: 0, fontSize: 13 }}>Notes: {voucher.notes}</p> : null}

            {isPurchase ? <PurchasePayForm voucher={voucher} /> : null}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {voucher.status !== 'void' ? (
                <Button
                  type="button"
                  variant="neutral"
                  onClick={() => void handleVoid()}
                  disabled={voidVoucher.isPending}
                >
                  {voidVoucher.isPending ? 'Voiding…' : 'Void bill'}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => navigate(backPath)}>
                Back to list
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Sale ${docActions.number || ''}` : 'Sale invoice'}
      />
    </div>
  );
}
