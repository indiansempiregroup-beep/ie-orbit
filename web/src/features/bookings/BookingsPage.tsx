import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookingCreation, useBookingList, type BookingCreateInput } from './bookingsHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useTheme } from '../../hooks/useTheme';

export function BookingsPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createBooking = useBookingCreation();
  const bookingsQuery = useBookingList(new Date().toISOString().slice(0, 10));
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const staffQuery = useStaffList();
  const dialog = useDialog();
  const [formState, setFormState] = useState<BookingCreateInput>({
    customer_id: '',
    service_id: '',
    start_at: new Date().toISOString(),
    duration_minutes: 30,
  });
  const [creationError, setCreationError] = useState<string | null>(null);

  const filteredBookings = useMemo(() => {
    const bookings = bookingsQuery.data ?? [];
    const lower = searchTerm.trim().toLowerCase();
    if (!lower) return bookings;
    return bookings.filter((booking) => {
      return [booking.booking_number, booking.customer_id, booking.staff_id, booking.service_id, booking.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lower));
    });
  }, [bookingsQuery.data, searchTerm]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
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
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{bookingsQuery.data?.length ?? 0}</p>
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

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>Booking</span>
              <span>Customer</span>
              <span>Service</span>
              <span>Staff</span>
              <span>Start</span>
              <span>Status</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {bookingsQuery.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading bookings…</div>
              ) : bookingsQuery.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{bookingsQuery.error.message}</div>
              ) : filteredBookings.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No bookings found.</div>
              ) : (
                filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/bookings/${booking.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/bookings/${booking.id}`);
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr',
                      padding: '16px 20px',
                      background: theme.resolved === 'dark' ? '#111827' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{booking.booking_number ?? booking.id}</span>
                    <span>{booking.customer_id ?? '—'}</span>
                    <span>{booking.service_id ?? '—'}</span>
                    <span>{booking.staff_id ?? 'Unassigned'}</span>
                    <span>{booking.start_at ? new Date(booking.start_at).toLocaleString() : '—'}</span>
                    <span style={{ color: booking.status === 'confirmed' ? '#10b981' : booking.status === 'cancelled' ? '#dc2626' : '#6b7280' }}>{booking.status ?? 'unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Create booking" labelledBy="create-booking-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            createBooking.mutate(formState, {
              onSuccess: () => {
                dialog.hide();
                setFormState({ customer_id: '', service_id: '', start_at: new Date().toISOString(), duration_minutes: 30 });
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
            <Button type="submit" variant="primary" disabled={createBooking.isPending}>
              {createBooking.isPending ? 'Creating…' : 'Create booking'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
