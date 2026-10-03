import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Plus, Share2, SlidersHorizontal } from 'lucide-react';
import type { ShopBooksVoucher, ShopEWayGenerateInput } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { loyaltyBillHighlight, readLoyaltyPrefs } from '../../lib/loyalty';
import { ShopFilterBar } from './ShopFilterBar';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentView } from './shopDocumentActions';
import { useAuthContext } from '../../contexts/AuthContext';
import {
  useShopComplianceMutations,
  useShopEInvoice,
  useShopEWayList,
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
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  borrow: 'Credit',
  razorpay: 'Online (Razorpay)',
  cashfree: 'Online (Cashfree)',
};

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
  let pointsEarned = Math.max(
    0,
    Math.floor(moneyNum(loyalty.points_earned) || moneyNum(billing.points_earned)),
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
  const paymentLabel = PAYMENT_LABELS[method] || (method ? method.toUpperCase() : '');
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
    taxable,
    taxTotal,
    igst,
    cgst,
    sgst,
    isInterstate,
    paymentLabel,
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
  const bill = voucherBillSummaryRows(voucher);
  const highlight = loyaltyBillHighlight({
    enabled: loyaltyEnabled,
    pointsEarned: bill.pointsEarned,
    pointsToEarn: bill.pointsToEarn,
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
      {row('Items', formatMoney(bill.merchandiseGross, currency))}
      {row(
        'Product discount',
        bill.lineDiscount > 0
          ? `-${formatMoney(bill.lineDiscount, currency)}`
          : formatMoney(0, currency),
      )}
      {row('Subtotal', formatMoney(bill.afterLine, currency))}
      {bill.billDiscount > 0
        ? row('Bill discount', `-${formatMoney(bill.billDiscount, currency)}`)
        : null}
      {bill.couponDiscount > 0
        ? row(
            bill.couponCode ? `Coupon ${bill.couponCode}` : 'Coupon',
            `-${formatMoney(bill.couponDiscount, currency)}`,
          )
        : null}
      {bill.rewardDiscount > 0 || (loyaltyEnabled && bill.rewardPoints > 0)
        ? row(
            loyaltyEnabled
              ? bill.rewardPoints > 0
                ? `Points used (${bill.rewardPoints})`
                : 'Points used'
              : 'Discount',
            `-${formatMoney(bill.rewardDiscount, currency)}`,
          )
        : null}
      {row('Taxable', formatMoney(bill.taxable, currency))}
      {bill.taxTotal > 0
        ? bill.isInterstate || bill.igst > 0
          ? row('IGST', formatMoney(bill.igst || bill.taxTotal, currency))
          : (
            <>
              {row('CGST', formatMoney(bill.cgst, currency))}
              {row('SGST', formatMoney(bill.sgst, currency))}
            </>
          )
        : row('Tax', formatMoney(bill.taxTotal, currency))}
      {row('Total', formatMoney(bill.total, currency), true)}
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
      {bill.paymentLabel ? row('Payment', bill.paymentLabel) : null}
      {row('Received', formatMoney(bill.paid, currency))}
      {row('Balance due', formatMoney(bill.due, currency), bill.due > 0)}
    </div>
  );
}

const EWAY_TRANSPORT_MODES = [
  { value: '1', label: 'Road' },
  { value: '2', label: 'Rail' },
  { value: '3', label: 'Air' },
  { value: '4', label: 'Ship' },
];

const STATUS_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  generated: { bg: '#dcfce7', text: '#166534' },
  pending: { bg: '#fef3c7', text: '#92400e' },
  cancelled: { bg: '#fee2e2', text: '#b42318' },
  failed: { bg: '#fee2e2', text: '#b42318' },
  draft: { bg: '#f3f4f6', text: '#374151' },
};

function StatusBadge({ status }: { status?: string }) {
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
      {status || 'draft'}
    </span>
  );
}

function GstComplianceSection({ voucher }: { voucher: ShopBooksVoucher }) {
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
      snackbar.push(`E-invoice generated${result.irn ? ` · IRN ${result.irn}` : ''}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to generate e-invoice.'), 'error');
    }
  }

  async function handleCancelEInvoice() {
    const reason = window.prompt('Reason for cancelling this e-invoice:');
    if (!reason) return;
    try {
      await cancelEInvoice.mutateAsync({ voucherId: voucher.id, reason });
      snackbar.push('E-invoice cancelled.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to cancel e-invoice.'), 'error');
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
      snackbar.push(`E-way bill generated${result.ewb_no ? ` · EWB ${result.ewb_no}` : ''}.`, 'success');
      setShowEwayForm(false);
      setVehicleNo('');
      setDistanceKm('');
      setTransporterName('');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to generate e-way bill.'), 'error');
    }
  }

  async function handleCancelEway() {
    if (!activeEway) return;
    const reason = window.prompt('Reason for cancelling this e-way bill:');
    if (!reason) return;
    try {
      await cancelEWay.mutateAsync({ ewayId: activeEway.id, reason });
      snackbar.push('E-way bill cancelled.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to cancel e-way bill.'), 'error');
    }
  }

  const einvoiceGenerated = einvoice.data && einvoice.data.status !== 'cancelled';
  const ewayGenerated = activeEway && activeEway.status !== 'cancelled';

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, display: 'grid', gap: 14 }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>GST compliance</h4>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>E-invoice (IRN)</span>
          {einvoice.data ? <StatusBadge status={einvoice.data.status} /> : null}
        </div>
        {einvoiceGenerated && einvoice.data ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', display: 'grid', gap: 2 }}>
            {einvoice.data.irn ? <span>IRN: {einvoice.data.irn}</span> : null}
            {einvoice.data.ack_no ? <span>Ack no: {einvoice.data.ack_no}</span> : null}
            {einvoice.data.ack_date ? <span>Ack date: {einvoice.data.ack_date}</span> : null}
            {einvoice.data.signed_qr ? <span>QR payload available</span> : null}
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
              {generateEInvoice.isPending ? 'Generating…' : 'Generate e-invoice'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleCancelEInvoice()}
              disabled={cancelEInvoice.isPending}
            >
              {cancelEInvoice.isPending ? 'Cancelling…' : 'Cancel e-invoice'}
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>E-way bill</span>
          {activeEway ? <StatusBadge status={activeEway.status} /> : null}
        </div>
        {ewayGenerated && activeEway ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', display: 'grid', gap: 2 }}>
            {activeEway.ewb_no ? <span>EWB no: {activeEway.ewb_no}</span> : null}
            {activeEway.valid_upto ? <span>Valid upto: {activeEway.valid_upto}</span> : null}
            {activeEway.vehicle_no ? <span>Vehicle: {activeEway.vehicle_no}</span> : null}
          </div>
        ) : null}

        {!ewayGenerated && showEwayForm ? (
          <form onSubmit={handleGenerateEway} style={{ display: 'grid', gap: 8 }}>
            <Input
              label="Vehicle number"
              value={vehicleNo}
              onChange={(event) => setVehicleNo(event.target.value)}
              placeholder="MH12AB1234"
            />
            <Select
              label="Transport mode"
              value={transportMode}
              onChange={(event) => setTransportMode(event.target.value as ShopEWayGenerateInput['transport_mode'])}
              options={EWAY_TRANSPORT_MODES}
            />
            <Input
              label="Distance (km)"
              type="number"
              min={0}
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
            <Input
              label="Transporter name"
              value={transporterName}
              onChange={(event) => setTransporterName(event.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="neutral" disabled={generateEWay.isPending}>
                {generateEWay.isPending ? 'Generating…' : 'Generate e-way bill'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowEwayForm(false)}>
                Cancel
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
              Generate e-way bill
            </Button>
          ) : null}
          {ewayGenerated ? (
            <Button type="button" variant="ghost" onClick={() => void handleCancelEway()} disabled={cancelEWay.isPending}>
              {cancelEWay.isPending ? 'Cancelling…' : 'Cancel e-way bill'}
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
}: {
  voucherType: 'sale' | 'purchase';
  newPath: string;
  title: string;
  emptyLabel: string;
  heading?: string;
}) {
  const workspace = useWorkspace();
  const auth = useAuthContext();
  const currency = workspace.activeBusiness?.currency;
  const loyaltyEnabled = readLoyaltyPrefs(
    (workspace.activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined,
  ).enabled;
  const snackbar = useSnackbar();
  const [searchParams] = useSearchParams();
  const createdNumber = searchParams.get('created');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<ShopBooksVoucher | null>(null);
  const detailDialog = useDialog();
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const isSale = voucherType === 'sale';
  const pageTitle = heading ?? (isSale ? 'Sale invoices' : 'Purchases');

  const vouchers = useShopVouchers({
    type: voucherType,
    status: status || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const { voidVoucher } = useShopVoucherMutations();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vouchers.data ?? []).filter((voucher) => {
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
    detailDialog.show();
  }

  async function handleVoid(voucher: ShopBooksVoucher) {
    if (!window.confirm(`Void ${voucher.voucher_number}? This cannot be undone.`)) return;
    try {
      await voidVoucher.mutateAsync(voucher.id);
      snackbar.push(`${voucher.voucher_number} voided.`, 'success');
      detailDialog.hide();
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to void voucher.'), 'error');
    }
  }

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{pageTitle}</h1>
        <Link to={newPath}>
          <Button type="button" variant="primary">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} aria-hidden="true" />
              {title}
            </span>
          </Button>
        </Link>
      </div>

      {createdNumber ? (
        <p className="invoice-banner" role="status">
          {decodeURIComponent(createdNumber)} saved successfully.
        </p>
      ) : null}

      <div className="invoice-strip">
        <button type="button" className="invoice-strip__cell" onClick={() => setPayment('')}>
          <span>Total</span>
          <strong>{formatMoney(summary.total, currency)}</strong>
        </button>
        <button type="button" className="invoice-strip__cell is-paid" onClick={() => setPayment(payment === 'paid' ? '' : 'paid')}>
          <span>Paid</span>
          <strong>{formatMoney(summary.paidAmount, currency)}</strong>
        </button>
        <button
          type="button"
          className="invoice-strip__cell is-due"
          onClick={() => setPayment(payment === 'unpaid' ? '' : 'unpaid')}
        >
          <span>{isSale ? 'Due' : 'To pay'}</span>
          <strong>{formatMoney(summary.unpaidAmount, currency)}</strong>
        </button>
      </div>

      <Card>
        <div className="invoice-toolbar">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isSale ? 'Search invoices' : 'Search bills'}
            aria-label="Search"
            className="invoice-search"
          />
          <button
            type="button"
            className={`invoice-filter-btn${extraFilterCount ? ' is-on' : ''}`}
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            aria-label="Filters"
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
            searchPlaceholder={isSale ? 'Search invoices' : 'Search bills'}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClear={clearFilters}
            filters={[
              {
                id: 'status',
                label: 'Status',
                value: status,
                onChange: setStatus,
                options: [
                  { value: '', label: 'All statuses' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'void', label: 'Void' },
                ],
              },
              {
                id: 'payment',
                label: 'Payment',
                value: payment,
                onChange: setPayment,
                options: [
                  { value: '', label: 'All' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'unpaid', label: isSale ? 'Due' : 'Unpaid' },
                ],
              },
            ]}
          />
        ) : extraFilterCount || search ? (
          <button type="button" className="invoice-clear" onClick={clearFilters}>
            Clear search & filters
          </button>
        ) : null}

        {vouchers.isLoading ? <p className="invoice-muted">Loading…</p> : null}
        {vouchers.error ? <p role="alert">{(vouchers.error as Error).message}</p> : null}

        <div className="invoice-list">
          {filtered.map((voucher) => {
            const party = voucher.customer_name || voucher.supplier_name || (isSale ? 'Walk-in' : 'Supplier');
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
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(total, currency)}</strong>
                  <span className={`invoice-pill ${isVoid ? 'is-void' : paid ? 'is-paid' : 'is-due'}`}>
                    {isVoid ? 'Void' : paid ? 'Paid' : `Due ${formatMoney(due, currency)}`}
                  </span>
                </div>
                {isSale && workspace.businessId ? (
                  <div className="invoice-row__actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title="View invoice"
                      aria-label={`View ${voucher.voucher_number}`}
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
                          snackbar.push(error instanceof Error ? error.message : 'View failed', 'error'),
                        );
                      }}
                    >
                      <Eye size={15} aria-hidden="true" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title="Share invoice"
                      aria-label={`Share ${voucher.voucher_number}`}
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
                      <span>Share</span>
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
        open={detailDialog.open}
        onClose={detailDialog.hide}
        title={selected ? selected.voucher_number : 'Voucher'}
        labelledBy="voucher-detail-dialog"
        busy={voidVoucher.isPending}
      >
        {selected ? (
          <div style={{ display: 'grid', gap: 14, marginTop: 12, minWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
              {formatVoucherWhen(selected.voucher_date, selected.created_at) || selected.voucher_date} · {selected.customer_name || selected.supplier_name || 'Cash'} · {selected.status}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(selected.line_items as VoucherLineItem[] | undefined ?? []).map((line, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>
                    {line.name} {line.hsn_sac ? `· HSN ${line.hsn_sac}` : ''} × {line.qty}
                  </span>
                  <strong>{formatMoney(Number(line.total ?? 0), currency)}</strong>
                </div>
              ))}
              {!selected.line_items?.length ? <p style={{ margin: 0 }}>No line items.</p> : null}
            </div>
            <VoucherBillSummary
              voucher={selected}
              currency={currency}
              loyaltyEnabled={loyaltyEnabled}
              pointsBalance={null}
            />
            {selected.notes ? <p style={{ margin: 0, fontSize: 13 }}>Notes: {selected.notes}</p> : null}

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
                  View / Print / Share
                </Button>
              ) : null}
              {selected.status !== 'void' ? (
                <Button type="button" variant="neutral" onClick={() => void handleVoid(selected)} disabled={voidVoucher.isPending}>
                  {voidVoucher.isPending ? 'Voiding…' : 'Void voucher'}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={detailDialog.hide}>
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
        title={docActions ? `Sale ${docActions.number || ''}` : 'Sale invoice'}
      />
    </div>
  );
}
