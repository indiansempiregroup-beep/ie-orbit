import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useSnackbar } from '../../hooks/useSnackbar';
import { formatDateTime } from '../../lib/datetime';
import { useBookingActions, useBookingDetail, useBookingReassignableStaff } from './bookingDetailHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { buildNameMap } from '../../lib/managementEntities';

export function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const bookingQuery = useBookingDetail(bookingId);
  const reassignableStaffQuery = useBookingReassignableStaff(bookingId);
  const servicesQuery = useServiceList();
  const customersQuery = useCustomerList();
  const staffQuery = useStaffList();
  const serviceMap = useMemo(() => buildNameMap(servicesQuery.data), [servicesQuery.data]);
  const customerMap = useMemo(() => buildNameMap(customersQuery.data), [customersQuery.data]);
  const staffMap = useMemo(() => buildNameMap(staffQuery.data), [staffQuery.data]);
  const actions = useBookingActions(bookingId);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [staffId, setStaffId] = useState('');
  const [lineStaffDraft, setLineStaffDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);

  useEffect(() => {
    setStaffId(bookingQuery.data?.staff_id ? String(bookingQuery.data.staff_id) : '');
    setLineStaffDraft(
      Object.fromEntries(
        (bookingQuery.data?.line_items ?? []).map((item) => [item.id, item.staff_id ? String(item.staff_id) : '']),
      ),
    );
  }, [bookingQuery.data?.staff_id, bookingQuery.data?.line_items]);

  const booking = bookingQuery.data;
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
    'Unassigned';
  const serviceTitle =
    booking?.service_label?.trim() ||
    (booking?.service_id ? serviceMap.get(String(booking.service_id)) : undefined) ||
    booking?.booking_number ||
    'Booking';

  async function runAction(
    label: string,
    mutation: { mutateAsync: (value?: string) => Promise<unknown> },
    value?: string,
  ) {
    setActiveAction(label);
    try {
      await mutation.mutateAsync(value);
      snackbar.push(`${label} successful.`, 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : `Unable to ${label.toLowerCase()}.`, 'error');
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
      <SubmitOverlay show={isSubmitting} message={activeAction ? `${activeAction}…` : 'Processing…'} />
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Link to="/bookings" style={{ color: '#6b7280', textDecoration: 'none' }}>← Back to bookings</Link>
            <h1 style={{ margin: '12px 0 0', fontSize: 32 }}>{serviceTitle}</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              #{booking?.booking_number ?? bookingId} · Status: {status}
            </p>
          </div>
          <Button variant="neutral" onClick={() => navigate('/bookings')}>Close</Button>
        </div>

        {bookingQuery.isLoading ? <Card><p>Loading booking…</p></Card> : null}
        {bookingQuery.error ? <Card><p style={{ color: '#dc2626' }}>{bookingQuery.error.message}</p></Card> : null}

        {booking ? (
          <>
            <Card style={{ padding: 20, display: 'grid', gap: 12 }}>
              <div>
                <strong>Customer:</strong>{' '}
                {booking.customer_id ? (
                  <Link to={`/customers/${booking.customer_id}`} style={{ color: '#2563eb', fontWeight: 600 }}>
                    {customerName}
                  </Link>
                ) : (
                  customerName
                )}
              </div>
              {booking.customer_phone ? <div><strong>Mobile:</strong> {booking.customer_phone}</div> : null}
              {booking.line_items?.length ? (
                <div>
                  <strong>Services:</strong>
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {booking.line_items.map((item, index) => (
                      <div key={item.id} style={{ padding: 10, borderRadius: 10, background: '#f9fafb' }}>
                        <div>
                          <strong>{index + 1}.</strong>{' '}
                          {item.service_name || serviceMap.get(String(item.service_id)) || item.service_id}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 13 }}>
                          {item.start_at ? formatDateTime(item.start_at) : '—'}
                          {item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
                          {item.staff_name || item.staff_id
                            ? ` · ${item.staff_name || staffMap.get(String(item.staff_id)) || 'Staff'}`
                            : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div><strong>Service:</strong> {serviceMap.get(String(booking.service_id)) ?? booking.service_id ?? '—'}</div>
              )}
              <div><strong>Staff:</strong> {staffName}</div>
              <div><strong>Starts:</strong> {booking.start_at ? formatDateTime(booking.start_at) : '—'}</div>
              <div><strong>Ends:</strong> {booking.end_at ? formatDateTime(booking.end_at) : '—'}</div>
              <div><strong>Duration:</strong> {booking.duration_minutes ?? '—'} min</div>
            </Card>

            <Card style={{ padding: 20, display: 'grid', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Actions</h2>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Reason (optional)</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Add a note for this action"
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['pending', 'draft'].includes(status) ? (
                  <Button
                    variant="primary"
                    loading={actions.confirm.isPending}
                    loadingLabel="Confirming…"
                    disabled={isSubmitting && !actions.confirm.isPending}
                    onClick={() => runAction('Confirm', actions.confirm, reason || undefined)}
                  >
                    Confirm
                  </Button>
                ) : null}
                {['confirmed', 'pending'].includes(status) ? (
                  <Button
                    variant="neutral"
                    loading={actions.checkIn.isPending}
                    loadingLabel="Checking in…"
                    disabled={isSubmitting && !actions.checkIn.isPending}
                    onClick={() => runAction('Check in', actions.checkIn, reason || undefined)}
                  >
                    Check in
                  </Button>
                ) : null}
                {['confirmed', 'checked_in', 'in_progress'].includes(status) ? (
                  <Button
                    variant="neutral"
                    loading={actions.complete.isPending}
                    loadingLabel="Completing…"
                    disabled={isSubmitting && !actions.complete.isPending}
                    onClick={() => runAction('Complete', actions.complete, reason || undefined)}
                  >
                    Complete
                  </Button>
                ) : null}
                {!['cancelled', 'completed', 'rejected'].includes(status) ? (
                  <Button
                    variant="ghost"
                    loading={actions.cancel.isPending}
                    loadingLabel="Cancelling…"
                    disabled={isSubmitting && !actions.cancel.isPending}
                    onClick={() => runAction('Cancel', actions.cancel, reason || undefined)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              {!['cancelled', 'completed', 'rejected'].includes(status) ? (
                <>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Reschedule to</span>
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
                      loadingLabel="Rescheduling…"
                      disabled={!rescheduleAt || (isSubmitting && !actions.reschedule.isPending)}
                      onClick={async () => {
                        setActiveAction('Reschedule');
                        try {
                          await actions.reschedule.mutateAsync({
                            start_at: new Date(rescheduleAt).toISOString(),
                            reason: reason || undefined,
                          });
                          snackbar.push('Booking rescheduled.', 'success');
                        } catch (error) {
                          snackbar.push(error instanceof Error ? error.message : 'Unable to reschedule.', 'error');
                        } finally {
                          setActiveAction(null);
                        }
                      }}
                    >
                      Reschedule
                    </Button>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>
                      {usePerLineReassign
                        ? 'Reassign staff per service (staff assigned to each service are listed)'
                        : 'Reassign staff (staff who can perform this booking are listed)'}
                    </span>
                    {reassignableStaffQuery.isLoading ? (
                      <p style={{ margin: 0, color: '#6b7280' }}>Loading available staff…</p>
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
                            <option value="">Auto-assign</option>
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
                          <option value="">Auto-assign</option>
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
                        No staff are assigned to these services. Assign services on each staff profile first.
                      </p>
                    ) : null}
                    <Button
                      variant="neutral"
                      loading={actions.updateStaff.isPending || actions.updateLineItemStaff.isPending}
                      loadingLabel="Saving…"
                      disabled={
                        reassignableStaffQuery.isLoading ||
                        (isSubmitting &&
                          !actions.updateStaff.isPending &&
                          !actions.updateLineItemStaff.isPending)
                      }
                      onClick={async () => {
                        setActiveAction('Reassign staff');
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
                          snackbar.push('Staff assignment updated.', 'success');
                        } catch (error) {
                          snackbar.push(
                            error instanceof Error ? error.message : 'Unable to reassign staff.',
                            'error',
                          );
                        } finally {
                          setActiveAction(null);
                        }
                      }}
                    >
                      Save staff assignment
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
