import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { formatDateTime } from '../../lib/datetime';
import { getApiErrorMessage } from '../../lib/apiClient';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBookingActions, useBookingDetail, useBookingReassignableStaff } from './bookingDetailHooks';
import { useServiceDetails } from '../management/managementHooks';
import { buildBookingNameMaps } from './bookingHelpers';
import { RewardPointsBanner } from '../../components/RewardPointsBanner';
import { readLoyaltyDocument } from '../../lib/loyalty';

function buildUpiPayUrl(input: {
  vpa: string;
  payeeName?: string;
  amount: number;
  note?: string;
  currency?: string;
}): string {
  const pa = String(input.vpa || '').trim();
  if (!pa) return '';
  if (!Number.isFinite(input.amount) || input.amount <= 0) return '';
  const am = (Math.round((input.amount + Number.EPSILON) * 100) / 100).toFixed(2);
  const params = new URLSearchParams({
    pa,
    pn: String(input.payeeName || '').trim() || 'Merchant',
    am,
    cu: input.currency || 'INR',
  });
  const note = String(input.note || '').trim().slice(0, 80);
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}

function qrImageSrc(upiPayUrl: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=188x188&margin=8&data=${encodeURIComponent(upiPayUrl)}`;
}

export function BookingDetailPage() {
  const { t } = useTranslation();
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const auth = useAuth();
  const { activeBusiness, businessId, tenantId } = useWorkspace();
  const bookingQuery = useBookingDetail(bookingId);
  const reassignableStaffQuery = useBookingReassignableStaff(bookingId);
  const actions = useBookingActions(bookingId);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [staffId, setStaffId] = useState('');
  const [lineStaffDraft, setLineStaffDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'borrow'>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofMediaId, setProofMediaId] = useState('');
  const [proofPreview, setProofPreview] = useState('');
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  useEffect(() => {
    setStaffId(bookingQuery.data?.staff_id ? String(bookingQuery.data.staff_id) : '');
    setLineStaffDraft(
      Object.fromEntries(
        (bookingQuery.data?.line_items ?? []).map((item) => [item.id, item.staff_id ? String(item.staff_id) : '']),
      ),
    );
  }, [bookingQuery.data?.staff_id, bookingQuery.data?.line_items]);

  const booking = bookingQuery.data;
  const { customerMap, staffMap, serviceMap } = useMemo(
    () => buildBookingNameMaps(booking ? [booking] : []),
    [booking],
  );
  const bookingServiceIds = booking?.line_items?.length
    ? booking.line_items.map((item) => item.service_id)
    : booking?.service_id
      ? [booking.service_id]
      : [];
  const earnServices = useServiceDetails(bookingServiceIds);
  const billTotal = useMemo(() => {
    if (!booking?.line_items?.length) return 0;
    const gross = booking.line_items.reduce((sum, item) => sum + (Number(item.price_snapshot) || 0), 0);
    const loyalty =
      booking.metadata && typeof booking.metadata === 'object'
        ? (booking.metadata as { loyalty?: { discount_amount?: string | number } }).loyalty
        : undefined;
    const reward = Number(loyalty?.discount_amount) || 0;
    return Math.max(0, Math.round((gross - reward + Number.EPSILON) * 100) / 100);
  }, [booking]);
  const receivedAmount = useMemo(() => {
    if (paymentMethod === 'borrow' && amountPaid === '') return 0;
    if (amountPaid === '' && paymentMethod !== 'borrow') return billTotal;
    const parsed = Number(amountPaid);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }, [amountPaid, paymentMethod, billTotal]);
  const upiPayUrl = useMemo(() => {
    if (paymentMethod !== 'upi' || receivedAmount <= 0) return '';
    const vpa = String(activeBusiness?.upi_vpa || '').trim();
    if (!vpa) return '';
    return buildUpiPayUrl({
      vpa,
      payeeName: activeBusiness?.display_name || activeBusiness?.business_name || 'Merchant',
      amount: receivedAmount,
      note: booking?.booking_number ? `Booking ${booking.booking_number}` : 'Booking payment',
      currency: activeBusiness?.currency || 'INR',
    });
  }, [paymentMethod, receivedAmount, activeBusiness, booking?.booking_number]);
  const paymentQrImageUrl = String(activeBusiness?.payment_qr_url || '').trim();
  const recordedPayment = useMemo(() => {
    const meta = booking?.metadata;
    if (!meta || typeof meta !== 'object') return null;
    const payment = (meta as { payment?: Record<string, unknown> }).payment;
    return payment && typeof payment === 'object' ? payment : null;
  }, [booking?.metadata]);
  const recordedProofUrl = resolveBillingProofUrl({
    payment_proof_url:
      recordedPayment?.payment_proof_url != null ? String(recordedPayment.payment_proof_url) : null,
    payment_proof_media_id:
      recordedPayment?.payment_proof_media_id != null
        ? String(recordedPayment.payment_proof_media_id)
        : null,
  });
  const recordedPaymentMethod = String(recordedPayment?.method || '').trim();
  const reassignableStaff = reassignableStaffQuery.data;
  const usePerLineReassign = (booking?.line_items?.length ?? 0) > 1;
  const status = booking?.status ?? 'unknown';
  const isSubmitting =
    actions.confirm.isPending ||
    actions.checkIn.isPending ||
    actions.complete.isPending ||
    actions.cancel.isPending ||
    actions.reschedule.isPending ||
    actions.updateStaff.isPending ||
    actions.updateLineItemStaff.isPending;

  const customerName =
    booking?.customer_name?.trim() ||
    (booking?.customer_id ? customerMap.get(String(booking.customer_id)) : undefined) ||
    '—';
  const staffName =
    booking?.staff_name?.trim() ||
    (booking?.staff_id ? staffMap.get(String(booking.staff_id)) : undefined) ||
    t('bookings.unassigned');
  const serviceTitle =
    booking?.service_label?.trim() ||
    (booking?.service_id ? serviceMap.get(String(booking.service_id)) : undefined) ||
    booking?.booking_number ||
    t('dashboard.bookingFallback');
  const loyalty = booking
    ? readLoyaltyDocument({
        ...(booking as unknown as Record<string, unknown>),
        loyalty: booking.loyalty,
        metadata: booking.metadata,
      })
    : null;
  const expectedEarn = bookingServiceIds.reduce((sum, serviceId) => {
    const service = earnServices.services.find((row) => String(row.id) === String(serviceId));
    return sum + Math.max(0, Number(service?.loyalty_points_earn) || 0);
  }, 0);
  const isOpenBooking = !['cancelled', 'completed', 'rejected', 'no_show'].includes(status);

  async function uploadUpiProof(file: File) {
    if (!auth.token || !tenantId || !businessId) {
      setProofError(t('bookings.signInToUpload'));
      return;
    }
    setProofUploading(true);
    setProofError(null);
    setProofPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('business', businessId);
      form.set('folder_type', 'documents');
      form.set('visibility', 'public');
      form.append('tags', 'booking');
      form.append('tags', 'upi_proof');
      form.set('display_name', `Booking UPI proof ${booking?.booking_number || bookingId || ''}`.trim());
      const response = await fetch('/api/v1/media/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': tenantId,
          'X-Business-ID': businessId,
        },
        body: form,
      });
      if (!response.ok) throw new Error(t('bookings.uploadFailed'));
      const payload = (await response.json()) as {
        data?: { id?: string; public_url?: string; private_url?: string };
      };
      const id = String(payload.data?.id || '');
      const url = payload.data?.public_url || payload.data?.private_url || '';
      if (!id) throw new Error(t('bookings.noMediaId'));
      setProofMediaId(id);
      setProofUrl(url);
    } catch (err) {
      setProofMediaId('');
      setProofUrl('');
      setProofError(getApiErrorMessage(err, t('bookings.uploadPaymentFailed')));
    } finally {
      setProofUploading(false);
    }
  }

  async function runAction(
    kind: 'confirm' | 'checkIn' | 'cancel',
    mutation: { mutateAsync: (value?: string) => Promise<unknown> },
    value?: string,
  ) {
    const progressByKind = {
      confirm: t('bookings.confirming'),
      checkIn: t('bookings.checkingIn'),
      cancel: t('bookings.cancelling'),
    } as const;
    const successByKind = {
      confirm: t('bookings.bookingConfirmed'),
      checkIn: t('bookings.checkedIn'),
      cancel: t('bookings.bookingCancelled'),
    } as const;
    const failedByKind = {
      confirm: t('bookings.confirmFailed'),
      checkIn: t('bookings.checkInFailed'),
      cancel: t('bookings.cancelFailed'),
    } as const;
    setActiveAction(progressByKind[kind]);
    try {
      await mutation.mutateAsync(value);
      snackbar.push(successByKind[kind], 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : failedByKind[kind], 'error');
    } finally {
      setActiveAction(null);
    }
  }

  async function runComplete() {
    setActiveAction(t('bookings.completing'));
    try {
      const body: {
        reason?: string;
        payment_method?: 'cash' | 'upi' | 'card' | 'borrow';
        amount_paid?: number;
        payment_proof_url?: string;
        payment_proof_media_id?: string;
      } = { reason: reason || undefined };
      if (billTotal > 0) {
        body.payment_method = paymentMethod;
        if (paymentMethod === 'borrow' || amountPaid !== '') {
          body.amount_paid = amountPaid === '' ? 0 : Number(amountPaid);
        }
        if (paymentMethod === 'upi' && receivedAmount > 0) {
          if (proofUploading) {
            throw new Error(t('bookings.waitUpload'));
          }
          if (!proofMediaId && !proofUrl) {
            throw new Error(t('bookings.captureFirst'));
          }
          if (proofUrl) body.payment_proof_url = proofUrl;
          if (proofMediaId) body.payment_proof_media_id = proofMediaId;
        }
      }
      await actions.complete.mutateAsync(body);
      setShowCollect(false);
      snackbar.push(t('bookings.completed'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : t('bookings.completeFailed'), 'error');
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
      <SubmitOverlay show={isSubmitting} message={activeAction ?? t('bookings.processing')} />
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Link to="/bookings" style={{ color: '#6b7280', textDecoration: 'none' }}>{t('bookings.backToBookings')}</Link>
            <h1 style={{ margin: '12px 0 0', fontSize: 32 }}>{serviceTitle}</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              {t('bookings.statusLine', {
                number: booking?.booking_number ?? bookingId,
                status: t(`bookings.statuses.${status}`, { defaultValue: status }),
              })}
            </p>
          </div>
          <Button variant="neutral" onClick={() => navigate('/bookings')}>{t('common.close')}</Button>
        </div>

        {bookingQuery.isLoading ? <Card><p>{t('bookings.loadingBooking')}</p></Card> : null}
        {bookingQuery.error ? <Card><p style={{ color: '#dc2626' }}>{bookingQuery.error.message}</p></Card> : null}

        {booking ? (
          <>
            <Card style={{ padding: 20, display: 'grid', gap: 12 }}>
              <div>
                <strong>{t('bookings.detailCustomer')}</strong>{' '}
                {booking.customer_id ? (
                  <Link to={`/customers/${booking.customer_id}`} style={{ color: '#2563eb', fontWeight: 600 }}>
                    {customerName}
                  </Link>
                ) : (
                  customerName
                )}
              </div>
              {booking.customer_phone ? <div><strong>{t('bookings.detailMobile')}</strong> {booking.customer_phone}</div> : null}
              {booking.line_items?.length ? (
                <div>
                  <strong>{t('bookings.detailServices')}</strong>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {booking.line_items.map((item, index) => (
                      <div key={item.id} style={{ padding: 10, borderRadius: 10, background: '#f9fafb' }}>
                        <div>
                          <strong>{index + 1}.</strong>{' '}
                          {item.service_name || serviceMap.get(String(item.service_id)) || item.service_id}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 13 }}>
                          {item.start_at ? formatDateTime(item.start_at) : '—'}
                          {item.duration_minutes ? ` · ${t('bookings.minutesShort', { n: item.duration_minutes })}` : ''}
                          {item.staff_name || item.staff_id
                            ? ` · ${item.staff_name || staffMap.get(String(item.staff_id)) || t('bookings.staff')}`
                            : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div><strong>{t('bookings.detailService')}</strong> {serviceMap.get(String(booking.service_id)) ?? booking.service_id ?? '—'}</div>
              )}
              <div><strong>{t('bookings.detailStaff')}</strong> {staffName}</div>
              <div><strong>{t('bookings.detailStarts')}</strong> {booking.start_at ? formatDateTime(booking.start_at) : '—'}</div>
              <div><strong>{t('bookings.detailEnds')}</strong> {booking.end_at ? formatDateTime(booking.end_at) : '—'}</div>
              <div><strong>{t('bookings.detailDuration')}</strong> {t('bookings.minutesShort', { n: booking.duration_minutes ?? '—' })}</div>
              <RewardPointsBanner
                earned={loyalty?.pointsEarned ?? 0}
                pending={isOpenBooking && (loyalty?.pointsEarned ?? 0) <= 0 ? expectedEarn : 0}
                redeemed={loyalty?.pointsRedeemed ?? 0}
                reversed={loyalty?.pointsReversed ?? 0}
                remaining={loyalty?.remainingEarned}
                discountAmount={loyalty?.discountAmount ?? 0}
                reversalReason={loyalty?.reversalReason}
                currency={activeBusiness?.currency}
              />
              {recordedPaymentMethod || recordedProofUrl ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
                  <strong>{t('bookings.payment')}</strong>
                  {recordedPaymentMethod ? (
                    <div>
                      {t('bookings.paymentMethodLine', {
                        method:
                          recordedPaymentMethod === 'borrow'
                            ? t('bookings.methodCredit')
                            : recordedPaymentMethod === 'cash'
                              ? t('bookings.methodCash')
                              : recordedPaymentMethod === 'upi'
                                ? t('bookings.methodUpi')
                                : recordedPaymentMethod === 'card'
                                  ? t('bookings.methodCard')
                                  : recordedPaymentMethod.charAt(0).toUpperCase() + recordedPaymentMethod.slice(1),
                      })}
                    </div>
                  ) : null}
                  {recordedPayment?.amount_paid != null && String(recordedPayment.amount_paid) !== '' ? (
                    <div>
                      {t('bookings.amountPaidLine', { amount: `₹${Number(recordedPayment.amount_paid).toFixed(2)}` })}
                    </div>
                  ) : null}
                  {recordedProofUrl ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>{t('bookings.paymentProof')}</span>
                      <a href={recordedProofUrl} target="_blank" rel="noreferrer">
                        <img
                          src={recordedProofUrl}
                          alt={t('bookings.paymentProof')}
                          style={{
                            width: 180,
                            height: 180,
                            objectFit: 'cover',
                            borderRadius: 12,
                            border: '1px solid #e5e7eb',
                          }}
                        />
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>

            <Card style={{ padding: 20, display: 'grid', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('bookings.actions')}</h2>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>{t('bookings.reasonOptional')}</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t('bookings.reasonPlaceholder')}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['pending', 'draft'].includes(status) ? (
                  <Button
                    variant="primary"
                    loading={actions.confirm.isPending}
                    loadingLabel={t('bookings.confirming')}
                    disabled={isSubmitting && !actions.confirm.isPending}
                    onClick={() => runAction('confirm', actions.confirm, reason || undefined)}
                  >
                    {t('bookings.confirm')}
                  </Button>
                ) : null}
                {['confirmed', 'pending'].includes(status) ? (
                  <Button
                    variant="neutral"
                    loading={actions.checkIn.isPending}
                    loadingLabel={t('bookings.checkingIn')}
                    disabled={isSubmitting && !actions.checkIn.isPending}
                    onClick={() => runAction('checkIn', actions.checkIn, reason || undefined)}
                  >
                    {t('bookings.checkIn')}
                  </Button>
                ) : null}
                {['confirmed', 'checked_in', 'in_progress'].includes(status) ? (
                  <Button
                    variant="neutral"
                    loading={actions.complete.isPending}
                    loadingLabel={t('bookings.completing')}
                    disabled={isSubmitting && !actions.complete.isPending}
                    onClick={() => {
                      if (billTotal > 0) {
                        setPaymentMethod('cash');
                        setAmountPaid('');
                        setProofUrl('');
                        setProofMediaId('');
                        setProofPreview('');
                        setProofError(null);
                        setShowCollect(true);
                      } else {
                        void runComplete();
                      }
                    }}
                  >
                    {t('bookings.complete')}
                  </Button>
                ) : null}
                {!['cancelled', 'completed', 'rejected'].includes(status) ? (
                  <Button
                    variant="ghost"
                    loading={actions.cancel.isPending}
                    loadingLabel={t('bookings.cancelling')}
                    disabled={isSubmitting && !actions.cancel.isPending}
                    onClick={() => runAction('cancel', actions.cancel, reason || undefined)}
                  >
                    {t('common.cancel')}
                  </Button>
                ) : null}
              </div>
              {showCollect ? (
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    padding: 16,
                    borderRadius: 14,
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb',
                  }}
                >
                  <strong>{t('bookings.collectPayment')}</strong>
                  <div>{t('bookings.billTotal', { amount: `₹${billTotal.toFixed(2)}` })}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(
                      [
                        ['cash', t('bookings.methodCash')],
                        ['upi', t('bookings.methodUpi')],
                        ['card', t('bookings.methodCard')],
                        ['borrow', t('bookings.methodCredit')],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(value);
                          setAmountPaid('');
                          setProofUrl('');
                          setProofMediaId('');
                          setProofPreview('');
                          setProofError(null);
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 999,
                          border: paymentMethod === value ? '1px solid #2563eb' : '1px solid #e5e7eb',
                          background: paymentMethod === value ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>
                      {paymentMethod === 'borrow' ? t('bookings.amountPaidNowOptional') : t('bookings.amountReceived')}
                    </span>
                    <input
                      value={amountPaid}
                      onChange={(event) => setAmountPaid(event.target.value)}
                      placeholder={paymentMethod === 'borrow' ? '0' : String(billTotal)}
                      style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                    />
                  </label>
                  {paymentMethod === 'upi' && receivedAmount > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gap: 8,
                        justifyItems: 'center',
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                      }}
                    >
                      <span style={{ color: '#6b7280', fontSize: 13 }}>{t('bookings.scanToPay')}</span>
                      {upiPayUrl ? (
                        <>
                          <img
                            src={qrImageSrc(upiPayUrl)}
                            alt={t('bookings.upiQrAlt')}
                            width={188}
                            height={188}
                            style={{ borderRadius: 8 }}
                          />
                          <div style={{ fontSize: 13, color: '#6b7280' }}>{activeBusiness?.upi_vpa}</div>
                          <strong>₹{receivedAmount.toFixed(2)}</strong>
                        </>
                      ) : paymentQrImageUrl ? (
                        <>
                          <img
                            src={paymentQrImageUrl}
                            alt={t('bookings.paymentQrAlt')}
                            width={188}
                            height={188}
                            style={{ borderRadius: 8, objectFit: 'contain' }}
                          />
                          <div style={{ fontSize: 13, color: '#6b7280' }}>{t('bookings.staticQr')}</div>
                        </>
                      ) : (
                        <div style={{ color: '#b91c1c', fontSize: 13 }}>
                          {t('bookings.addUpiId')}
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: 8, width: '100%', justifyItems: 'stretch' }}>
                        <span style={{ color: '#6b7280', fontSize: 13 }}>
                          {t('bookings.paymentScreenshot')} <span style={{ color: '#b91c1c' }}>*</span>
                        </span>
                        <span style={{ color: '#6b7280', fontSize: 13 }}>
                          {t('bookings.screenshotHint')}
                        </span>
                        {proofPreview || proofUrl ? (
                          <img
                            src={proofPreview || proofUrl}
                            alt={t('bookings.upiProofAlt')}
                            style={{
                              width: 160,
                              height: 160,
                              objectFit: 'cover',
                              borderRadius: 8,
                              border: '1px solid #e5e7eb',
                            }}
                          />
                        ) : null}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              borderRadius: 12,
                              border: '1px solid #2563eb',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              cursor: proofUploading ? 'not-allowed' : 'pointer',
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            {proofPreview || proofUrl ? t('bookings.retakePhoto') : t('bookings.takePhoto')}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={proofUploading}
                              style={{ display: 'none' }}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file) void uploadUpiProof(file);
                              }}
                            />
                          </label>
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '10px 14px',
                              borderRadius: 12,
                              border: '1px solid #e5e7eb',
                              background: '#fff',
                              color: '#374151',
                              cursor: proofUploading ? 'not-allowed' : 'pointer',
                              fontWeight: 600,
                              fontSize: 14,
                            }}
                          >
                            {t('bookings.gallery')}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={proofUploading}
                              style={{ display: 'none' }}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file) void uploadUpiProof(file);
                              }}
                            />
                          </label>
                        </div>
                        {proofUploading ? (
                          <span style={{ color: '#6b7280', fontSize: 13 }}>{t('bookings.uploadingProof')}</span>
                        ) : null}
                        {proofError ? (
                          <span style={{ color: '#b91c1c', fontSize: 13 }}>{proofError}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button variant="ghost" onClick={() => setShowCollect(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      loading={actions.complete.isPending || proofUploading}
                      loadingLabel={proofUploading ? t('bookings.uploading') : t('bookings.completing')}
                      disabled={
                        proofUploading ||
                        (paymentMethod === 'upi' &&
                          receivedAmount > 0 &&
                          !proofMediaId &&
                          !proofUrl)
                      }
                      onClick={() => void runComplete()}
                    >
                      {t('bookings.completeCollect')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {!['cancelled', 'completed', 'rejected'].includes(status) ? (
                <>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>{t('bookings.rescheduleTo')}</span>
                      <input
                        type="datetime-local"
                        value={rescheduleAt}
                        onChange={(event) => setRescheduleAt(event.target.value)}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                      />
                    </label>
                    <Button
                      variant="primary"
                      loading={actions.reschedule.isPending}
                      loadingLabel={t('bookings.rescheduling')}
                      disabled={!rescheduleAt || (isSubmitting && !actions.reschedule.isPending)}
                      onClick={async () => {
                        setActiveAction(t('bookings.rescheduling'));
                        try {
                          await actions.reschedule.mutateAsync({
                            start_at: new Date(rescheduleAt).toISOString(),
                            reason: reason || undefined,
                          });
                          snackbar.push(t('bookings.rescheduled'), 'success');
                        } catch (error) {
                          snackbar.push(error instanceof Error ? error.message : t('bookings.rescheduleFailed'), 'error');
                        } finally {
                          setActiveAction(null);
                        }
                      }}
                    >
                      {t('bookings.reschedule')}
                    </Button>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>
                      {usePerLineReassign
                        ? t('bookings.reassignPerService')
                        : t('bookings.reassignSingle')}
                    </span>
                    {reassignableStaffQuery.isLoading ? (
                      <p style={{ margin: 0, color: '#6b7280' }}>{t('bookings.loadingStaff')}</p>
                    ) : null}
                    {reassignableStaffQuery.error ? (
                      <p style={{ margin: 0, color: '#dc2626' }}>{reassignableStaffQuery.error.message}</p>
                    ) : null}
                    {usePerLineReassign ? (
                      (booking.line_items ?? []).map((item) => (
                        <label key={item.id} style={{ display: 'grid', gap: 8 }}>
                          <span style={{ color: '#374151', fontSize: 13 }}>
                            {item.service_name || serviceMap.get(String(item.service_id)) || item.service_id}
                          </span>
                          <select
                            value={lineStaffDraft[item.id] ?? ''}
                            onChange={(event) =>
                              setLineStaffDraft((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                            disabled={reassignableStaffQuery.isLoading}
                          >
                            <option value="">{t('bookings.autoAssign')}</option>
                            {(reassignableStaff?.mode === 'per_line'
                              ? reassignableStaff.line_item_options?.[item.id] ?? []
                              : []
                            ).map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.display_name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))
                    ) : (
                      <label style={{ display: 'grid', gap: 8 }}>
                        <select
                          value={staffId}
                          onChange={(event) => setStaffId(event.target.value)}
                          style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                          disabled={reassignableStaffQuery.isLoading}
                        >
                          <option value="">{t('bookings.autoAssign')}</option>
                          {(reassignableStaff?.mode === 'single' ? reassignableStaff.staff_options ?? [] : []).map(
                            (member) => (
                              <option key={member.id} value={member.id}>
                                {member.display_name}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    )}
                    {!reassignableStaffQuery.isLoading &&
                    reassignableStaff?.mode === 'single' &&
                    (reassignableStaff.staff_options?.length ?? 0) === 0 ? (
                      <p style={{ margin: 0, color: '#6b7280' }}>
                        {t('bookings.noStaffAssigned')}
                      </p>
                    ) : null}
                    <Button
                      variant="neutral"
                      loading={actions.updateStaff.isPending || actions.updateLineItemStaff.isPending}
                      loadingLabel={t('common.saving')}
                      disabled={
                        reassignableStaffQuery.isLoading ||
                        (isSubmitting &&
                          !actions.updateStaff.isPending &&
                          !actions.updateLineItemStaff.isPending)
                      }
                      onClick={async () => {
                        setActiveAction(t('common.saving'));
                        try {
                          if (usePerLineReassign) {
                            await actions.updateLineItemStaff.mutateAsync(
                              (booking.line_items ?? []).map((item) => ({
                                line_item_id: item.id,
                                staff_id: lineStaffDraft[item.id] || null,
                              })),
                            );
                          } else {
                            await actions.updateStaff.mutateAsync(staffId || null);
                          }
                          snackbar.push(t('bookings.staffUpdated'), 'success');
                        } catch (error) {
                          snackbar.push(
                            error instanceof Error ? error.message : t('bookings.staffChangeFailed'),
                            'error',
                          );
                        } finally {
                          setActiveAction(null);
                        }
                      }}
                    >
                      {t('bookings.saveStaffAssignment')}
                    </Button>
                  </div>
                </>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
