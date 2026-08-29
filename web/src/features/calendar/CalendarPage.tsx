import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAvailability,
  useBookingCreation,
  useBookingList,
  type AvailabilitySlot,
  type BookingCreateInput,
} from '../bookings/bookingsHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { useBranchesQuery } from '../settings/branchesHooks';
import { buildNameMap } from '../../lib/managementEntities';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { formatTime } from '../../lib/datetime';
import { DayTimeline } from './DayTimeline';
import { bookingStatusColor } from './timelineUtils';

export function CalendarPage() {
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
  const branchesQuery = useBranchesQuery();
  const createBooking = useBookingCreation();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [formState, setFormState] = useState<BookingCreateInput>({
    customer_id: '',
    service_id: '',
    staff_id: null,
    branch_id: null,
    start_at: new Date().toISOString(),
    duration_minutes: durationMinutes,
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

  const availability = availabilityQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const totalCapacity = availability.reduce((sum, slot) => sum + slot.capacity, 0);

  const staffMap = useMemo(() => buildNameMap(staffQuery.data), [staffQuery.data]);
  const customerMap = useMemo(() => buildNameMap(customersQuery.data), [customersQuery.data]);
  const serviceMap = useMemo(() => buildNameMap(servicesQuery.data), [servicesQuery.data]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (staffId && String(booking.staff_id ?? '') !== staffId) return false;
      if (serviceId && String(booking.service_id ?? '') !== serviceId) return false;
      return true;
    });
  }, [bookings, staffId, serviceId]);

  const confirmedCount = filteredBookings.filter((booking) => booking.status === 'confirmed').length;

  const agenda = useMemo(
    () =>
      [...filteredBookings].sort(
        (a, b) => new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime(),
      ),
    [filteredBookings],
  );

  const controlStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
  };

  function openBookDialog(slot: AvailabilitySlot) {
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
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 32,
        background: '#f5f7fb',
        color: '#111827',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: 0, color: '#3b82f6', fontWeight: 700, letterSpacing: 1 }}>
              Calendar Workspace
            </p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Day schedule</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>
              See bookings on a timeline and book open gaps in one view.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate('/bookings')}>
              Open bookings
            </Button>
            <Button
              variant="neutral"
              onClick={() => {
                void availabilityQuery.refetch();
                void bookingsQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          <Card style={{ minHeight: 110 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Available slots</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{availability.length}</p>
          </Card>
          <Card style={{ minHeight: 110 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total capacity</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{totalCapacity}</p>
          </Card>
          <Card style={{ minHeight: 110 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Confirmed bookings</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{confirmedCount}</p>
          </Card>
        </div>

        <Card style={{ padding: 24 }}>
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            }}
          >
            <label style={{ display: 'grid', gap: 8 }}>
              Select date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                style={controlStyle}
              />
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Staff member
              <select
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
                style={controlStyle}
              >
                <option value="">Any available</option>
                {staffQuery.data?.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.full_name ?? staff.id}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Service
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                style={controlStyle}
              >
                <option value="">All services</option>
                {servicesQuery.data?.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name ?? service.id}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              Duration
              <select
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
                style={controlStyle}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
        </Card>

        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'minmax(0, 2.2fr) minmax(260px, 1fr)',
            alignItems: 'start',
          }}
          className="calendar-day-layout"
        >
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>Timeline</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                  Click a booking to open details, or + to book an open slot.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#10b981' }} /> Confirmed
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#f59e0b' }} /> Pending
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: '#3b82f6' }} /> In progress
                </span>
              </div>
            </div>
            <div style={{ padding: '12px 12px 20px' }}>
              <DayTimeline
                date={date}
                bookings={filteredBookings}
                slots={availability}
                customerMap={customerMap}
                serviceMap={serviceMap}
                staffMap={staffMap}
                loading={availabilityQuery.isLoading || bookingsQuery.isLoading}
                errorMessage={
                  availabilityQuery.error?.message || bookingsQuery.error?.message || null
                }
                onBookSlot={openBookDialog}
                onOpenBooking={(bookingId) => navigate(`/bookings/${bookingId}`)}
              />
            </div>
          </Card>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: 700,
              }}
            >
              Day agenda
            </div>
            <div style={{ display: 'grid', gap: 1, background: '#fff' }}>
              {bookingsQuery.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>Loading agenda…</div>
              ) : agenda.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>
                  {staffId || serviceId
                    ? 'No bookings match the selected staff or service.'
                    : 'No bookings scheduled for this day.'}
                </div>
              ) : (
                agenda.map((booking) => {
                  const colors = bookingStatusColor(booking.status);
                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => navigate(`/bookings/${booking.id}`)}
                      style={{
                        display: 'grid',
                        gap: 6,
                        padding: '14px 18px',
                        background: '#fff',
                        border: 'none',
                        borderLeft: `3px solid ${colors.border}`,
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 14 }}>
                          {customerMap.get(String(booking.customer_id)) ?? 'Customer'}
                        </strong>
                        <span style={{ color: colors.text, fontSize: 12, fontWeight: 600 }}>
                          {booking.status ?? 'unknown'}
                        </span>
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        {booking.start_at ? formatTime(booking.start_at) : '—'}
                        {booking.end_at ? ` – ${formatTime(booking.end_at)}` : ''}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {serviceMap.get(String(booking.service_id)) ?? 'Service'}
                        {' · '}
                        {booking.staff_id
                          ? staffMap.get(String(booking.staff_id)) ?? 'Staff'
                          : 'Any staff'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <style>{`
          @media (max-width: 900px) {
            .calendar-day-layout {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="Book available slot"
        labelledBy="book-slot-dialog"
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
                dialog.hide();
                setSelectedSlot(null);
                snackbar.push('Booking created successfully', 'success');
                void availabilityQuery.refetch();
                void bookingsQuery.refetch();
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
          {selectedSlot ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              Selected slot:{' '}
              <strong>
                {formatTime(selectedSlot.start_at)} – {formatTime(selectedSlot.end_at)}
              </strong>
            </p>
          ) : null}

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
                <option key={customer.id} value={customer.id}>
                  {customer.full_name ?? customer.id}
                </option>
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
                <option key={service.id} value={service.id}>
                  {service.name ?? service.id}
                </option>
              ))}
            </select>
          </label>

          {needsOfficePicker ? (
            <label style={{ display: 'grid', gap: 8 }}>
              Office
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
            </label>
          ) : null}

          <label style={{ display: 'grid', gap: 8 }}>
            Appointment start
            <input
              required
              type="datetime-local"
              value={formState.start_at.slice(0, 16)}
              onChange={(event) =>
                setFormState({ ...formState, start_at: new Date(event.target.value).toISOString() })
              }
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
              onChange={(event) =>
                setFormState({ ...formState, duration_minutes: Number(event.target.value) })
              }
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createBooking.isPending}>
              {createBooking.isPending ? 'Booking…' : 'Confirm booking'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>
              Cancel
            </Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
