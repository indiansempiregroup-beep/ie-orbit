import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAvailability, useBookingCreation, useBookingList, type AvailabilitySlot, type BookingCreateInput } from '../bookings/bookingsHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { buildNameMap } from '../../lib/managementEntities';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { formatTime } from '../../lib/datetime';

export function CalendarPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [staffId, setStaffId] = useState(() => searchParams.get('staff') ?? '');
  const [serviceId, setServiceId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);

  const availabilityQuery = useAvailability(
    date,
    staffId || undefined,
    durationMinutes,
    serviceId || undefined,
  );
  const bookingsQuery = useBookingList(date);
  const staffQuery = useStaffList();
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const createBooking = useBookingCreation();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [formState, setFormState] = useState<BookingCreateInput>({
    customer_id: '',
    service_id: '',
    staff_id: null,
    start_at: new Date().toISOString(),
    duration_minutes: durationMinutes,
  });
  const [creationError, setCreationError] = useState<string | null>(null);

  const availability = availabilityQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const confirmedCount = bookings.filter((booking) => booking.status === 'confirmed').length;
  const totalCapacity = availability.reduce((sum, slot) => sum + slot.capacity, 0);

  const staffMap = useMemo(() => buildNameMap(staffQuery.data), [staffQuery.data]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#3b82f6', fontWeight: 700, letterSpacing: 1 }}>Calendar Workspace</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Daily Availability</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Browse open appointment slots and scheduled bookings by day.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate('/bookings')}>Open bookings</Button>
            <Button variant="neutral" onClick={() => availabilityQuery.refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Available slots</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{availability.length}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total capacity</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{totalCapacity}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Confirmed bookings</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{confirmedCount}</p>
          </Card>
        </div>

        <Card style={{ padding: 24 }}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 8 }}>
              Select date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: theme.resolved === 'dark' ? '#0f172a' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Staff member
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: theme.resolved === 'dark' ? '#0f172a' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              >
                <option value="">Any available</option>
                {staffQuery.data?.map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.full_name ?? staff.id}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Service
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: theme.resolved === 'dark' ? '#0f172a' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              >
                <option value="">All services</option>
                {servicesQuery.data?.map((service) => (
                  <option key={service.id} value={service.id}>{service.name ?? service.id}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Duration
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: theme.resolved === 'dark' ? '#0f172a' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '2fr 1.2fr' }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12 }}> 
                <span>Available slot</span>
                <span>Staff</span>
                <span>Capacity</span>
                <span>Action</span>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {availabilityQuery.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading availability…</div>
              ) : availabilityQuery.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{availabilityQuery.error.message}</div>
              ) : availability.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>
                  No timeslot available for this day{staffId ? ' with the selected staff' : ''}.
                </div>
              ) : (
                availability.map((slot) => (
                  <div
                    key={`${slot.start_at}-${slot.staff_id ?? 'any'}`}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#fff', gap: 12, alignItems: 'center' }}
                  >
                    <span>{formatTime(slot.start_at)} – {formatTime(slot.end_at)}</span>
                    <span>{slot.staff_id ? staffMap.get(slot.staff_id) ?? slot.staff_id : 'Any'} </span>
                    <span>{slot.capacity}</span>
                    <Button
                      type="button"
                      variant="neutral"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setFormState({
                          customer_id: '',
                          service_id: serviceId || '',
                          staff_id: slot.staff_id ?? (staffId || null),
                          start_at: slot.start_at,
                          duration_minutes: durationMinutes,
                        });
                        setCreationError(null);
                        dialog.show();
                      }}
                    >
                      Book
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Dialog open={dialog.open} onClose={dialog.hide} title="Book available slot" labelledBy="book-slot-dialog">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setCreationError(null);
                createBooking.mutate(formState, {
                  onSuccess: () => {
                    dialog.hide();
                    setSelectedSlot(null);
                    snackbar.push('Booking created successfully', 'success');
                    availabilityQuery.refetch();
                    bookingsQuery.refetch();
                  },
                  onError: (error) => {
                    const message = error.message ?? 'Failed to create booking';
                    setCreationError(message);
                    snackbar.push(message, 'error');
                  },
                });
              }}
              style={{ display: 'grid', gap: 16, marginTop: 12 }}
            >
              <label style={{ display: 'grid', gap: 8 }}>
                Customer
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
              </label>

              <label style={{ display: 'grid', gap: 8 }}>
                Service
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
              </label>

              <label style={{ display: 'grid', gap: 8 }}>
                Appointment start
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
                  {createBooking.isPending ? 'Booking…' : 'Confirm booking'}
                </Button>
                <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
              </div>
              {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
            </form>
          </Dialog>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <span>Booking</span>
                <span>Time</span>
                <span>Status</span>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {bookingsQuery.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading bookings…</div>
              ) : bookingsQuery.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{bookingsQuery.error.message}</div>
              ) : bookings.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No bookings scheduled for this day.</div>
              ) : (
                bookings.map((booking) => (
                  <div
                    key={booking.id}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#fff' }}
                  >
                    <span>{booking.booking_number ?? booking.id}</span>
                    <span>{booking.start_at ? formatTime(booking.start_at) : '—'}</span>
                    <span style={{ color: booking.status === 'confirmed' ? '#10b981' : booking.status === 'cancelled' ? '#dc2626' : '#6b7280' }}>{booking.status ?? 'unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
