import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Plus, Share2, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ShopBooksVoucher, ShopEWayGenerateInput } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { loyaltyBillHighlight, readLoyaltyPrefs } from '../../lib/loyalty';
import { ShopFilterBar } from './ShopFilterBar';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentView } from './shopDocumentActions';
import { voucherLineGrossAmount } from './saleInvoiceSource';
import { SaleInsightChips } from './SaleInsightChips';
import { PurchasePayForm } from './PurchasePayForm';
import { useAuthContext } from '../../contexts/AuthContext';
import {
  useShopComplianceMutations,
  useShopEInvoice,
  useShopEWayList,
  useShopVoucher,
  useShopVoucherMutations,
  useShopVouchers,
} from './shopHooks';

type VoucherLineItem = {
  name?: string;
  hsn_sac?: string;
  qty?: string | number;
  rate?: string | number;
  unit_price?: string | number;
  gross?: string | number;
  discount_amount?: string | number;
  total?: string | number;
  product_id?: string | null;
};

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'borrow', 'razorpay', 'cashfree'];

function moneyNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function voucherBillSummaryRows(voucher: ShopBooksVoucher) {
  const meta = asRecord(voucher.metadata);
  const billing = asRecord(meta.billing);
  const payment = asRecord(meta.payment);
  const loyalty = asRecord(meta.loyalty);
  const coupon = asRecord(meta.coupon);
  const lines = (voucher.line_items as VoucherLineItem[] | undefined) ?? [];
  const lineGross = moneyNum(
    lines.reduce((sum, line) => {
      const gross = moneyNum(line.gross);
      if (gross > 0) return sum + gross;
      return sum + moneyNum(line.qty) * moneyNum(line.rate ?? line.unit_price);
    }, 0),
  );
  const merchandiseGross = moneyNum(billing.merchandise_gross) || lineGross || moneyNum(voucher.subtotal);
  const rewardDiscount = moneyNum(billing.reward_discount) || moneyNum(loyalty.discount_amount);
  const rewardPoints = Math.max(
    0,
    Math.floor(moneyNum(billing.reward_points) || moneyNum(loyalty.points_redeemed)),
  );
  const awardLoyalty = billing.award_loyalty_points !== false;
  const pointsReversed = Math.max(
    0,
    Math.floor(
      moneyNum(voucher.points_reversed) ||
        moneyNum(loyalty.points_reversed) ||
        moneyNum(loyalty.points_revoked) ||
        moneyNum(billing.points_reversed) ||
        moneyNum(billing.points_revoked),
    ),
  );
  const reversalReason = String(loyalty.reversal_reason || billing.reversal_reason || '').trim();
  let pointsEarned = Math.max(
    0,
    Math.floor(
      moneyNum(voucher.points_earned) ||
        moneyNum(loyalty.points_earned) + pointsReversed ||
        moneyNum(billing.points_earned) + pointsReversed,
    ),
  );
  const expectedEarn = Math.max(0, Math.floor(moneyNum(billing.points_to_earn)));
  let pointsToEarn = 0;
  let lineDiscount = moneyNum(billing.line_discount_total);
  if (lineDiscount <= 0) {
    lineDiscount = moneyNum(
      lines.reduce((sum, line) => sum + moneyNum(line.discount_amount), 0),
    );
  }
  let billDiscount = moneyNum(billing.bill_discount_amount);
  const voucherDiscount = moneyNum(voucher.discount_total);
  if (lineDiscount <= 0 && billDiscount <= 0 && voucherDiscount > 0) {
    lineDiscount = Math.max(0, voucherDiscount - rewardDiscount);
  }
  const afterLine = Math.max(0, merchandiseGross - lineDiscount);
  const couponCode = String(coupon.code || '').trim();
  const couponDiscount = moneyNum(coupon.discount_amount);
  const taxable = moneyNum(billing.taxable_value) || Math.max(0, moneyNum(voucher.subtotal) - voucherDiscount);
  const taxTotal = moneyNum(billing.tax_total) || moneyNum(voucher.tax_total);
  const igst = moneyNum(voucher.igst_total);
  const cgst = moneyNum(voucher.cgst_total);
  const sgst = moneyNum(voucher.sgst_total);
  const isInterstate = Boolean(voucher.is_interstate || igst > 0);
  const method = String(payment.method || '').trim().toLowerCase();
  const total = moneyNum(voucher.total);
  const paid = moneyNum(voucher.amount_paid) || moneyNum(payment.amount_paid);
  const due = Math.max(0, moneyNum(payment.amount_due) || total - paid);
  const payStatus = String(payment.status || '').trim().toLowerCase();
  const isPaid = payStatus === 'paid' || payStatus === 'settled' || due <= 0.009;
  if (awardLoyalty && expectedEarn > 0) {
    if (pointsEarned <= 0 && isPaid) pointsEarned = expectedEarn;
    if (pointsEarned <= 0 && !isPaid) pointsToEarn = expectedEarn;
  }
  return {
    merchandiseGross,
    lineDiscount,
    afterLine,
    billDiscount,
    couponCode,
    couponDiscount,
    rewardDiscount,
    rewardPoints,
    pointsEarned,
    pointsToEarn,
    pointsReversed,
    reversalReason,
    taxable,
    taxTotal,
    igst,
    cgst,
    sgst,
    isInterstate,
    paymentMethod: method,
    total,
    paid,
    due,
  };
}

function VoucherBillSummary({
  voucher,
  currency,
  loyaltyEnabled,
  pointsBalance,
}: {
  voucher: ShopBooksVoucher;
  currency?: string | null;
  loyaltyEnabled: boolean;
  pointsBalance?: number | null;
}) {
  const { t } = useTranslation();
  const ts = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.vouchers.summary.${key}`, options));
  const bill = voucherBillSummaryRows(voucher);
  const paymentLabel = PAYMENT_METHODS.includes(bill.paymentMethod)
    ? t(`shop.vouchers.payment.${bill.paymentMethod}`)
    : bill.paymentMethod.toUpperCase();
  const highlight = loyaltyBillHighlight({
    enabled: loyaltyEnabled,
    pointsEarned: bill.pointsEarned,
    pointsToEarn: bill.pointsToEarn,
    pointsReversed: bill.pointsReversed,
    reversalReason: bill.reversalReason,
    pointsBalance,
  });
  const row = (label: string, value: string, strong?: boolean) => (
    <div
      key={label}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 4, borderTop: '1px solid #eee', paddingTop: 10, fontSize: 13 }}>
      {row(ts('items'), formatMoney(bill.merchandiseGross, currency))}
      {row(
        ts('productDiscount'),
        bill.lineDiscount > 0
          ? `-${formatMoney(bill.lineDiscount, currency)}`
          : formatMoney(0, currency),
      )}
      {row(ts('subtotal'), formatMoney(bill.afterLine, currency))}
      {bill.billDiscount > 0
        ? row(ts('billDiscount'), `-${formatMoney(bill.billDiscount, currency)}`)
        : null}
      {bill.couponDiscount > 0
        ? row(
            bill.couponCode ? ts('couponNamed', { code: bill.couponCode }) : ts('coupon'),
            `-${formatMoney(bill.couponDiscount, currency)}`,
          )
        : null}
      {bill.rewardDiscount > 0 || (loyaltyEnabled && bill.rewardPoints > 0)
        ? row(
            loyaltyEnabled
              ? bill.rewardPoints > 0
                ? ts('pointsUsedCount', { count: bill.rewardPoints })
                : ts('pointsUsed')
              : ts('discount'),
            `-${formatMoney(bill.rewardDiscount, currency)}`,
          )
        : null}
      {row(ts('taxable'), formatMoney(bill.taxable, currency))}
      {bill.taxTotal > 0
        ? bill.isInterstate || bill.igst > 0
          ? row(ts('igst'), formatMoney(bill.igst || bill.taxTotal, currency))
          : (
            <>
              {row(ts('cgst'), formatMoney(bill.cgst, currency))}
              {row(ts('sgst'), formatMoney(bill.sgst, currency))}
            </>
          )
        : row(ts('tax'), formatMoney(bill.taxTotal, currency))}
      {row(ts('total'), formatMoney(bill.total, currency), true)}
      {highlight ? (
        <div
          key="loyalty-highlight"
          style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 10,
            background:
              bill.pointsEarned > 0
                ? 'linear-gradient(135deg, #ecfdf5 0%, #e8f6f4 100%)'
                : 'linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)',
            border: bill.pointsEarned > 0 ? '1px solid #a7f3d0' : '1px solid #fde68a',
            color: bill.pointsEarned > 0 ? '#065f46' : '#92400e',
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {highlight}
        </div>
      ) : null}
      {paymentLabel ? row(ts('payment'), paymentLabel) : null}
      {row(ts('received'), formatMoney(bill.paid, currency))}
      {row(ts('balanceDue'), formatMoney(bill.due, currency), bill.due > 0)}
    </div>
  );
}

const EWAY_TRANSPORT_MODES = [
  { value: '1', key: 'road' },
  { value: '2', key: 'rail' },
  { value: '3', key: 'air' },
  { value: '4', key: 'ship' },
];

const STATUS_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  generated: { bg: '#dcfce7', text: '#166534' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  cancelled: { bg: '#fee2e2', text: '#b42318' },
  failed: { bg: '#fee2e2', text: '#b42318' },
  draft: { bg: '#f3f4f6', text: '#374151' },
};

function StatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  const tone = STATUS_BADGE_COLORS[(status || '').toLowerCase()] ?? STATUS_BADGE_COLORS.draft;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.text,
        textTransform: 'capitalize',
      }}
    >
      {t(`shop.vouchers.badge.${(status || 'draft').toLowerCase()}`, { defaultValue: status || 'draft' })}
    </span>
  );
}

function GstComplianceSection({ voucher }: { voucher: ShopBooksVoucher }) {
  const { t } = useTranslation();
  const tg = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.vouchers.gst.${key}`, options));
  const snackbar = useSnackbar();
  const einvoice = useShopEInvoice(voucher.id);
  const ewayList = useShopEWayList(voucher.id);
  const { generateEInvoice, cancelEInvoice, generateEWay, cancelEWay } = useShopComplianceMutations();

  const [showEwayForm, setShowEwayForm] = useState(false);
  const [vehicleNo, setVehicleNo] = useState('');
  const [transportMode, setTransportMode] = useState<ShopEWayGenerateInput['transport_mode']>('1');
  const [distanceKm, setDistanceKm] = useState('');
  const [transporterName, setTransporterName] = useState('');

  const activeEway = (ewayList.data ?? []).find((eway) => eway.status !== 'cancelled') ?? ewayList.data?.[0];

  async function handleGenerateEInvoice() {
    try {
      const result = await generateEInvoice.mutateAsync({ voucherId: voucher.id });
      snackbar.push(result.irn ? tg('einvoiceGeneratedIrn', { irn: result.irn }) : tg('einvoiceGenerated'), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tg('einvoiceFailed')), 'error');
    }
  }

  async function handleCancelEInvoice() {
    const reason = window.prompt(tg('einvoiceCancelPrompt'));
    if (!reason) return;
    try {
      await cancelEInvoice.mutateAsync({ voucherId: voucher.id, reason });
      snackbar.push(tg('einvoiceCancelled'), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tg('einvoiceCancelFailed')), 'error');
    }
  }

  async function handleGenerateEway(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await generateEWay.mutateAsync({
        voucherId: voucher.id,
        body: {
          vehicle_no: vehicleNo || undefined,
          transport_mode: transportMode,
          distance_km: distanceKm ? Number(distanceKm) : undefined,
          transporter_name: transporterName || undefined,
        },
      });
      snackbar.push(result.ewb_no ? tg('ewayGeneratedNo', { ewb: result.ewb_no }) : tg('ewayGenerated'), 'success');
      setShowEwayForm(false);
      setVehicleNo('');
      setDistanceKm('');
      setTransporterName('');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tg('ewayFailed')), 'error');
    }
  }

  async function handleCancelEway() {
    if (!activeEway) return;
    const reason = window.prompt(tg('ewayCancelPrompt'));
    if (!reason) return;
    try {
      await cancelEWay.mutateAsync({ ewayId: activeEway.id, reason });
      snackbar.push(tg('ewayCancelled'), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tg('ewayCancelFailed')), 'error');
    }
  }

  const einvoiceGenerated = einvoice.data && einvoice.data.status !== 'cancelled';
  const ewayGenerated = activeEway && activeEway.status !== 'cancelled';

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, display: 'grid', gap: 14 }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>{tg('title')}</h4>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{tg('einvoiceIrn')}</span>
          {einvoice.data ? <StatusBadge status={einvoice.data.status} /> : null}
        </div>
        {einvoiceGenerated && einvoice.data ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', display: 'grid', gap: 2 }}>
            {einvoice.data.irn ? <span>{tg('irn', { value: einvoice.data.irn })}</span> : null}
            {einvoice.data.ack_no ? <span>{tg('ackNo', { value: einvoice.data.ack_no })}</span> : null}
            {einvoice.data.ack_date ? <span>{tg('ackDate', { value: einvoice.data.ack_date })}</span> : null}
            {einvoice.data.signed_qr ? <span>{tg('qrAvailable')}</span> : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!einvoiceGenerated ? (
            <Button
              type="button"
              variant="neutral"
              onClick={() => void handleGenerateEInvoice()}
              disabled={generateEInvoice.isPending || voucher.status === 'void'}
            >
              {generateEInvoice.isPending ? tg('generating') : tg('generateEinvoice')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleCancelEInvoice()}
              disabled={cancelEInvoice.isPending}
            >
              {cancelEInvoice.isPending ? tg('cancelling') : tg('cancelEinvoice')}
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{tg('ewayBill')}</span>
          {activeEway ? <StatusBadge status={activeEway.status} /> : null}
        </div>
        {ewayGenerated && activeEway ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', display: 'grid', gap: 2 }}>
            {activeEway.ewb_no ? <span>{tg('ewbNo', { value: activeEway.ewb_no })}</span> : null}
            {activeEway.valid_upto ? <span>{tg('validUpto', { value: activeEway.valid_upto })}</span> : null}
            {activeEway.vehicle_no ? <span>{tg('vehicle', { value: activeEway.vehicle_no })}</span> : null}
          </div>
        ) : null}

        {!ewayGenerated && showEwayForm ? (
          <form onSubmit={handleGenerateEway} style={{ display: 'grid', gap: 8 }}>
            <Input
              label={tg('vehicleNumber')}
              value={vehicleNo}
              onChange={(event) => setVehicleNo(event.target.value)}
              placeholder="MH12AB1234"
            />
            <Select
              label={tg('transportMode')}
              value={transportMode}
              onChange={(event) => setTransportMode(event.target.value as ShopEWayGenerateInput['transport_mode'])}
              options={EWAY_TRANSPORT_MODES.map((mode) => ({
                value: mode.value,
                label: t(`shop.vouchers.transport.${mode.key}`),
              }))}
            />
            <Input
              label={tg('distanceKm')}
              type="number"
              min={0}
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
            <Input
              label={tg('transporterName')}
              value={transporterName}
              onChange={(event) => setTransporterName(event.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="neutral" disabled={generateEWay.isPending}>
                {generateEWay.isPending ? tg('generating') : tg('generateEway')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowEwayForm(false)}>
                {tg('cancel')}
              </Button>
            </div>
          </form>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!ewayGenerated && !showEwayForm ? (
            <Button
              type="button"
              variant="neutral"
              onClick={() => setShowEwayForm(true)}
              disabled={voucher.status === 'void'}
            >
              {tg('generateEway')}
            </Button>
          ) : null}
          {ewayGenerated ? (
            <Button type="button" variant="ghost" onClick={() => void handleCancelEway()} disabled={cancelEWay.isPending}>
              {cancelEWay.isPending ? tg('cancelling') : tg('cancelEway')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ShopVoucherList({
  voucherType,
  newPath,
  title,
  emptyLabel,
  heading,
  source,
  scanPath,
  scanLabel,
}: {
  voucherType: 'sale' | 'purchase';
  newPath: string;
  title: string;
  emptyLabel: string;
  heading?: string;
  /** Sale list: pass `pos` to show only counter/POS invoices. */
  source?: string;
  scanPath?: string;
  scanLabel?: string;
}) {
  const { t } = useTranslation();
  const tv = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.vouchers.${key}`, options));
  const statusText = (value?: string) =>
    ['draft', 'confirmed', 'void'].includes(String(value))
      ? tv(`status.${value}`)
      : (value ?? '');
  const workspace = useWorkspace();
  const auth = useAuthContext();
  const currency = workspace.activeBusiness?.currency;
  const loyaltyEnabled = readLoyaltyPrefs(
    (workspace.activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined,
  ).enabled;
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { voucherId: voucherIdParam } = useParams<{ voucherId?: string }>();
  const createdNumber = searchParams.get('created');
  const openVoucherId = (voucherIdParam && voucherIdParam !== 'new' ? voucherIdParam : null) || searchParams.get('voucher');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<ShopBooksVoucher | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const deepLinkHandled = useRef<string | null>(null);
  const isSale = voucherType === 'sale';
  const pageTitle = heading ?? (isSale ? tv('saleInvoices') : tv('purchases'));

  const vouchers = useShopVouchers({
    type: voucherType,
    status: status || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    source: source || undefined,
  });
  const deepLinkedVoucher = useShopVoucher(openVoucherId);
  const { voidVoucher } = useShopVoucherMutations();

  const filtered = useMemo(() => {
    const list = Array.isArray(vouchers.data) ? vouchers.data : [];
    const term = search.trim().toLowerCase();
    return list.filter((voucher) => {
      const total = Number(voucher.total ?? 0);
      const paidAmt = Number(voucher.amount_paid ?? 0);
      const due = Math.max(0, total - paidAmt);
      const isVoid = voucher.status === 'void';
      if (payment === 'paid' && (isVoid || due > 0.009)) return false;
      if (payment === 'unpaid' && (isVoid || due <= 0.009)) return false;
      if (!term) return true;
      const partyName = voucher.customer_name || voucher.supplier_name || '';
      return [voucher.voucher_number, partyName, String(voucher.total), voucher.notes ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [vouchers.data, search, payment]);

  useEffect(() => {
    if (!openVoucherId) {
      deepLinkHandled.current = null;
      return;
    }
    if (deepLinkedVoucher.isLoading) return;
    if (deepLinkHandled.current === openVoucherId) return;
    if (deepLinkedVoucher.isError) {
      deepLinkHandled.current = openVoucherId;
      snackbar.push(tv('openFailed'), 'error');
      return;
    }
    const voucher = deepLinkedVoucher.data;
    if (!voucher) return;
    const type = String(voucher.voucher_type || '').toLowerCase();
    if (type && type !== voucherType) {
      deepLinkHandled.current = openVoucherId;
      navigate(type === 'purchase' ? `/shop/books/purchase/${voucher.id}` : `/shop/books/sale/${voucher.id}`, {
        replace: true,
      });
      return;
    }
    deepLinkHandled.current = openVoucherId;
    setSelected(voucher);
    setDetailOpen(true);
  }, [
    openVoucherId,
    deepLinkedVoucher.data,
    deepLinkedVoucher.isLoading,
    deepLinkedVoucher.isError,
    voucherType,
    navigate,
    snackbar,
  ]);

  function closeDetail() {
    setDetailOpen(false);
    if (voucherIdParam) {
      navigate(voucherType === 'purchase' ? '/shop/books/purchase' : '/shop/books/sale', { replace: true });
    }
  }

  const summary = useMemo(() => {
    let total = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    for (const voucher of filtered) {
      if (voucher.status === 'void') continue;
      const amount = Number(voucher.total ?? 0);
      const due = Math.max(0, amount - Number(voucher.amount_paid ?? 0));
      total += amount;
      if (due <= 0.009) {
        paidAmount += amount;
        paidCount += 1;
      } else {
        unpaidAmount += due;
        unpaidCount += 1;
      }
    }
    return { count: filtered.length, total, paidAmount, unpaidAmount, paidCount, unpaidCount };
  }, [filtered]);

  const extraFilterCount =
    Number(Boolean(status)) + Number(Boolean(payment)) + Number(Boolean(dateFrom)) + Number(Boolean(dateTo));

  function clearFilters() {
    setSearch('');
    setStatus('');
    setPayment('');
    setDateFrom('');
    setDateTo('');
  }

  function openDetail(voucher: ShopBooksVoucher) {
    setSelected(voucher);
    setDetailOpen(true);
  }

  async function handleVoid(voucher: ShopBooksVoucher) {
    if (!window.confirm(tv('confirmVoid', { number: voucher.voucher_number }))) return;
    try {
      await voidVoucher.mutateAsync(voucher.id);
      snackbar.push(tv('voided', { number: voucher.voucher_number }), 'success');
      closeDetail();
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tv('voidFailed')), 'error');
    }
  }

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{pageTitle}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {scanPath ? (
            <Link to={scanPath}>
              <Button type="button" variant="neutral">
                {scanLabel || tv('scanInvoice')}
              </Button>
            </Link>
          ) : null}
          <Link to={newPath}>
            <Button type="button" variant="primary">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                {title}
              </span>
            </Button>
          </Link>
        </div>
      </div>

      {createdNumber ? (
        <p className="invoice-banner" role="status">
          {tv('saved', { number: decodeURIComponent(createdNumber) })}
        </p>
      ) : null}

      <div className="invoice-strip">
        <button type="button" className="invoice-strip__cell" onClick={() => setPayment('')}>
          <span>{tv('stripTotal')}</span>
          <strong>{formatMoney(summary.total, currency)}</strong>
        </button>
        <button type="button" className="invoice-strip__cell is-paid" onClick={() => setPayment(payment === 'paid' ? '' : 'paid')}>
          <span>{tv('stripPaid')}</span>
          <strong>{formatMoney(summary.paidAmount, currency)}</strong>
        </button>
        <button
          type="button"
          className="invoice-strip__cell is-due"
          onClick={() => setPayment(payment === 'unpaid' ? '' : 'unpaid')}
        >
          <span>{isSale ? tv('stripDue') : tv('stripToPay')}</span>
          <strong>{formatMoney(summary.unpaidAmount, currency)}</strong>
        </button>
      </div>

      <Card>
        <div className="invoice-toolbar">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isSale ? tv('searchInvoices') : tv('searchBills')}
            aria-label={t('common.search')}
            className="invoice-search"
          />
          <button
            type="button"
            className={`invoice-filter-btn${extraFilterCount ? ' is-on' : ''}`}
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            aria-label={tv('filters')}
          >
            <SlidersHorizontal size={16} />
            {extraFilterCount ? <span className="invoice-filter-count">{extraFilterCount}</span> : null}
          </button>
        </div>
        {showFilters ? (
          <ShopFilterBar
            hideSearch
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={isSale ? tv('searchInvoices') : tv('searchBills')}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClear={clearFilters}
            filters={[
              {
                id: 'status',
                label: t('common.status'),
                value: status,
                onChange: setStatus,
                options: [
                  { value: '', label: tv('allStatuses') },
                  { value: 'draft', label: tv('status.draft') },
                  { value: 'confirmed', label: tv('status.confirmed') },
                  { value: 'void', label: tv('status.void') },
                ],
              },
              {
                id: 'payment',
                label: tv('paymentFilter'),
                value: payment,
                onChange: setPayment,
                options: [
                  { value: '', label: t('common.all') },
                  { value: 'paid', label: tv('stripPaid') },
                  { value: 'unpaid', label: isSale ? tv('stripDue') : tv('unpaid') },
                ],
              },
            ]}
          />
        ) : extraFilterCount || search ? (
          <button type="button" className="invoice-clear" onClick={clearFilters}>
            {tv('clearFilters')}
          </button>
        ) : null}

        {vouchers.isLoading ? <p className="invoice-muted">{t('common.loading')}</p> : null}
        {vouchers.error ? <p role="alert">{(vouchers.error as Error).message}</p> : null}

        <div className="invoice-list">
          {filtered.map((voucher) => {
            const party = voucher.customer_name || voucher.supplier_name || (isSale ? tv('walkIn') : tv('supplier'));
            const total = Number(voucher.total ?? 0);
            const due = Math.max(0, total - Number(voucher.amount_paid ?? 0));
            const isVoid = voucher.status === 'void';
            const paid = !isVoid && due <= 0.009;
            return (
              <div
                key={voucher.id}
                className={`invoice-row${isVoid ? ' invoice-row--void' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(voucher)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDetail(voucher);
                  }
                }}
              >
                <div className="invoice-row__main">
                  <strong>{party}</strong>
                  <span>
                    {voucher.voucher_number}
                    {voucher.voucher_date || voucher.created_at
                      ? ` · ${formatVoucherWhen(voucher.voucher_date, voucher.created_at)}`
                      : ''}
                  </span>
                  {isSale ? (
                    <div style={{ marginTop: 6 }}>
                      <SaleInsightChips source={voucher} currency={currency} hideWhenEmpty />
                    </div>
                  ) : null}
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(total, currency)}</strong>
                  <span className={`invoice-pill ${isVoid ? 'is-void' : paid ? 'is-paid' : 'is-due'}`}>
                    {isVoid ? tv('status.void') : paid ? tv('stripPaid') : tv('dueAmount', { amount: formatMoney(due, currency) })}
                  </span>
                </div>
                {isSale && workspace.businessId ? (
                  <div className="invoice-row__actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title={tv('viewInvoice')}
                      aria-label={tv('viewAria', { number: voucher.voucher_number })}
                      onClick={() => {
                        const target = {
                          kind: 'sale' as const,
                          id: voucher.id,
                          number: voucher.voucher_number,
                          businessId: workspace.businessId!,
                          phone: voucher.customer_phone || '',
                          email: voucher.customer_email || '',
                        };
                        void openShopDocumentView(target, auth.token, 'a4', workspace.tenantId).catch((error) =>
                          snackbar.push(error instanceof Error ? error.message : tv('viewFailed'), 'error'),
                        );
                      }}
                    >
                      <Eye size={15} aria-hidden="true" />
                      <span>{tv('view')}</span>
                    </button>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title={tv('shareInvoice')}
                      aria-label={tv('shareAria', { number: voucher.voucher_number })}
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
                      <Share2 size={15} aria-hidden="true" />
                      <span>{tv('share')}</span>
                    </button>
                  </div>
                ) : (
                  <Eye size={16} aria-hidden="true" className="invoice-row__icon" />
                )}
              </div>
            );
          })}
          {!vouchers.isLoading && !filtered.length ? (
            <div className="invoice-empty">
              <p>{emptyLabel}</p>
              <Link to={newPath}>
                <Button type="button" variant="primary">
                  {title}
                </Button>
              </Link>
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={detailOpen}
        onClose={closeDetail}
        title={selected ? selected.voucher_number : tv('voucher')}
        labelledBy="voucher-detail-dialog"
        busy={voidVoucher.isPending}
      >
        {selected ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {formatVoucherWhen(selected.voucher_date, selected.created_at) || selected.voucher_date} · {selected.customer_name || selected.supplier_name || tv('cashParty')} · {statusText(selected.status)}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(selected.line_items as VoucherLineItem[] | undefined ?? []).map((line, index) => {
                const productId = String(line.product_id || '').trim();
                const label = (
                  <>
                    {line.name} {line.hsn_sac ? tv('hsnLine', { hsn: line.hsn_sac }) : ''} × {line.qty}
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
              {!selected.line_items?.length ? <p style={{ margin: 0 }}>{tv('noLineItems')}</p> : null}
            </div>
            <VoucherBillSummary
              voucher={selected}
              currency={currency}
              loyaltyEnabled={loyaltyEnabled}
              pointsBalance={null}
            />
            {voucherType === 'sale' ? (
              <SaleInsightChips source={selected} currency={currency} />
            ) : null}
            {selected.notes ? <p style={{ margin: 0, fontSize: 13 }}>{tv('notes', { notes: selected.notes })}</p> : null}

            {voucherType === 'purchase' ? (
              <PurchasePayForm voucher={selected} onPaid={(updated) => setSelected(updated)} />
            ) : null}

            {voucherType === 'sale' ? <GstComplianceSection voucher={selected} /> : null}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {voucherType === 'sale' && workspace.businessId ? (
                <Button
                  type="button"
                  onClick={() =>
                    setDocActions({
                      kind: 'sale',
                      id: selected.id,
                      number: selected.voucher_number,
                      businessId: workspace.businessId!,
                      phone: selected.customer_phone || '',
                      email: selected.customer_email || '',
                    })
                  }
                >
                  {tv('viewPrintShare')}
                </Button>
              ) : null}
              {selected.status !== 'void' ? (
                <Button type="button" variant="neutral" onClick={() => void handleVoid(selected)} disabled={voidVoucher.isPending}>
                  {voidVoucher.isPending ? tv('voiding') : tv('voidVoucher')}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={closeDetail}>
                {tv('close')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? tv('saleDoc', { number: docActions.number || '' }) : tv('saleInvoice')}
      />
    </div>
  );
}
