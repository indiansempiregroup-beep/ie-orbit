import React, { useEffect, useMemo, useState } from 'react';
import { useBookingCreation, useBookingList, useCancelBooking, useConfirmBooking, type BookingCreateInput } from './bookingsHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { useBranchesQuery } from '../settings/branchesHooks';
import { buildNameMap } from '../../lib/managementEntities';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { formatDateTime } from '../../lib/datetime';

export function BookingsPage() {
  const theme = useTheme();
  const snackbar = useSnackbar();
  const [searchTerm, setSearchTerm] = useState('');
  const createBooking = useBookingCreation();
  const confirmBooking = useConfirmBooking();
  const cancelBooking = useCancelBooking();
  const bookingsQuery = useBookingList();
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const staffQuery = useStaffList();
  const branchesQuery = useBranchesQuery();
  const dialog = useDialog();
  const [formState, setFormState] = useState<BookingCreateInput>({
    customer_id: '',
    service_id: '',
    branch_id: null,
    start_at: new Date().toISOString(),
    duration_minutes: 30,
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const offices = branchesQuery.data ?? [];
  const needsOfficePicker = offices.length > 1;

  useEffect(() => {
    if (!offices.length) return;
    setFormState((current) => {
      if (current.branch_id && offices.some((office) => office.id === current.branch_id)) {
        return current;
      }
      const preferred =
        offices.length === 1
          ? offices[0]
          : offices.find((office) => office.is_primary) ?? offices[0];
      return { ...current, branch_id: preferred.id };
    });
  }, [offices]);

  const customerMap = useMemo(() => buildNameMap(customersQuery.data), [customersQuery.data]);
  const serviceMap = useMemo(() => buildNameMap(servicesQuery.data), [servicesQuery.data]);
  const staffMap = useMemo(() => buildNameMap(staffQuery.data), [staffQuery.data]);

  const filteredBookings = useMemo(() => {
    const bookings = bookingsQuery.data ?? [];
    const lower = searchTerm.trim().toLowerCase();
    if (!lower) return bookings;
    return bookings.filter((booking) => {
      const customerName = customerMap.get(String(booking.customer_id)) ?? '';
      const serviceName = serviceMap.get(String(booking.service_id)) ?? '';
      const staffName = booking.staff_id ? staffMap.get(String(booking.staff_id)) ?? '' : '';
      return [booking.booking_number, customerName, serviceName, staffName, booking.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lower));
    });
  }, [bookingsQuery.data, searchTerm, customerMap, serviceMap, staffMap]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (bookingsQuery.data ?? []).filter((booking) => booking.start_at?.slice(0, 10) === today).length;
  }, [bookingsQuery.data]);

  const isSubmitting = createBooking.isPending || confirmBooking.isPending || cancelBooking.isPending;
  const tableColumns = 'minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 0.9fr) minmax(160px, 1.4fr)';
  const tableCellStyle: React.CSSProperties = {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <SubmitOverlay
        show={isSubmitting}
        message={
          createBooking.isPending ? 'Creating booking…' : confirmBooking.isPending ? 'Confirming booking…' : 'Cancelling booking…'
        }
      />
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Booking Workspace</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Bookings</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Create and manage appointments using the platform booking engine.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => dialog.show()}>New booking</Button>
            <Button variant="neutral" onClick={() => bookingsQuery.refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Today's bookings</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{todayCount}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Available services</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{servicesQuery.data?.length ?? 0}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Team members</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{staffQuery.data?.length ?? 0}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search bookings by number, customer, staff or status"
              style={{ flex: 1, borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              aria-label="Search bookings"
            />
            <Button variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
          </div>

          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ minWidth: 960 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: tableColumns,
                  gap: 12,
                  padding: '16px 20px',
                  background: theme.resolved === 'dark' ? '#111827' : '#f9fafb',
                  fontWeight: 700,
                  color: '#6b7280',
                  alignItems: 'center',
                }}
              >
                <span style={tableCellStyle}>Booking</span>
                <span style={tableCellStyle}>Customer</span>
                <span style={tableCellStyle}>Service</span>
                <span style={tableCellStyle}>Staff</span>
                <span style={tableCellStyle}>Start</span>
                <span style={tableCellStyle}>Status</span>
                <span style={tableCellStyle}>Actions</span>
              </div>
              <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
                {bookingsQuery.isLoading ? (
                  <div style={{ padding: 28, textAlign: 'center' }}>Loading bookings…</div>
                ) : bookingsQuery.error ? (
                  <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{bookingsQuery.error.message}</div>
                ) : filteredBookings.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No bookings found.</div>
                ) : (
                  filteredBookings.map((booking) => {
                    const status = booking.status ?? 'unknown';
                    const canConfirm = status === 'pending' || status === 'draft';
                    const canCancel = status !== 'cancelled' && status !== 'completed';
                    return (
                      <div
                        key={booking.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: tableColumns,
                          gap: 12,
                          padding: '16px 20px',
                          background: theme.resolved === 'dark' ? '#111827' : '#fff',
                          alignItems: 'center',
                        }}
                      >
                        <span style={tableCellStyle} title={booking.booking_number ?? booking.id}>
                          {booking.booking_number ?? booking.id}
                        </span>
                        <span style={tableCellStyle} title={customerMap.get(String(booking.customer_id)) ?? '—'}>
                          {customerMap.get(String(booking.customer_id)) ?? '—'}
                        </span>
                        <span style={tableCellStyle} title={serviceMap.get(String(booking.service_id)) ?? '—'}>
                          {serviceMap.get(String(booking.service_id)) ?? '—'}
                        </span>
                        <span
                          style={tableCellStyle}
                          title={booking.staff_id ? staffMap.get(String(booking.staff_id)) ?? '—' : 'Unassigned'}
                        >
                          {booking.staff_id ? staffMap.get(String(booking.staff_id)) ?? '—' : 'Unassigned'}
                        </span>
                        <span style={tableCellStyle}>
                          {booking.start_at ? formatDateTime(booking.start_at) : '—'}
                        </span>
                        <span
                          style={{
                            ...tableCellStyle,
                            textTransform: 'capitalize',
                            color:
                              status === 'confirmed'
                                ? '#10b981'
                                : status === 'cancelled'
                                  ? '#dc2626'
                                  : status === 'completed'
                                    ? '#2563eb'
                                    : '#6b7280',
                          }}
                        >
                          {status}
                        </span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', justifyContent: 'flex-start' }}>
                          {canConfirm ? (
                            <Button
                              type="button"
                              variant="primary"
                              loading={confirmBooking.isPending}
                              loadingLabel="Confirming…"
                              disabled={isSubmitting && !confirmBooking.isPending}
                              onClick={() =>
                                booking.id &&
                                confirmBooking.mutate(booking.id, {
                                  onSuccess: () => snackbar.push('Booking confirmed.', 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                })
                              }
                            >
                              Confirm
                            </Button>
                          ) : null}
                          {canCancel ? (
                            <Button
                              type="button"
                              variant="neutral"
                              loading={cancelBooking.isPending}
                              loadingLabel="Cancelling…"
                              disabled={isSubmitting && !cancelBooking.isPending}
                              onClick={() =>
                                booking.id &&
                                cancelBooking.mutate(booking.id, {
                                  onSuccess: () => snackbar.push('Booking cancelled.', 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                })
                              }
                            >
                              Cancel
                            </Button>
                          ) : null}
                          {!canConfirm && !canCancel ? <span style={{ color: '#9ca3af' }}>—</span> : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        </section>
      </div>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="Create booking"
        labelledBy="create-booking-dialog"
        busy={createBooking.isPending}
        busyMessage="Creating booking…"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            if (needsOfficePicker && !formState.branch_id) {
              setCreationError('Select an office for this booking.');
              return;
            }
            createBooking.mutate(formState, {
              onSuccess: () => {
                snackbar.push('Booking created.', 'success');
                dialog.hide();
                setFormState({
                  customer_id: '',
                  service_id: '',
                  branch_id: offices.length === 1 ? offices[0].id : offices.find((o) => o.is_primary)?.id ?? null,
                  start_at: new Date().toISOString(),
                  duration_minutes: 30,
                });
              },
              onError: (err) => {
                setCreationError(err.message ?? 'Failed to create booking');
              },
            });
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <select
            required
            value={formState.customer_id}
            onChange={(event) => setFormState({ ...formState, customer_id: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="">Select customer</option>
            {customersQuery.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.full_name ?? customer.id}</option>
            ))}
          </select>

          <select
            required
            value={formState.service_id}
            onChange={(event) => setFormState({ ...formState, service_id: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="">Select service</option>
            {servicesQuery.data?.map((service) => (
              <option key={service.id} value={service.id}>{service.name ?? service.id}</option>
            ))}
          </select>

          {needsOfficePicker ? (
            <select
              required
              value={formState.branch_id ?? ''}
              onChange={(event) => setFormState({ ...formState, branch_id: event.target.value || null })}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Select office</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.display_name ??
                    office.branch_name ??
                    [office.address_line1, office.city].filter(Boolean).join(', ') ??
                    office.id}
                </option>
              ))}
            </select>
          ) : null}

          <select
            value={formState.staff_id ?? ''}
            onChange={(event) => setFormState({ ...formState, staff_id: event.target.value || null })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="">Select staff (optional)</option>
            {staffQuery.data?.map((member) => (
              <option key={member.id} value={member.id}>{member.full_name ?? member.id}</option>
            ))}
          </select>

          <label style={{ display: 'grid', gap: 8 }}>
            Start date & time
            <input
              required
              type="datetime-local"
              value={formState.start_at.slice(0, 16)}
              onChange={(event) => setFormState({ ...formState, start_at: new Date(event.target.value).toISOString() })}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            Duration (minutes)
            <input
              required
              type="number"
              min={15}
              step={15}
              value={formState.duration_minutes}
              onChange={(event) => setFormState({ ...formState, duration_minutes: Number(event.target.value) })}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" loading={createBooking.isPending} loadingLabel="Creating…">
              Create booking
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createBooking.isPending}>
              Cancel
            </Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
