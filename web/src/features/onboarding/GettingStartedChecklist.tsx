import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { GETTING_STARTED_ITEMS } from '../../config/onboarding';
import { weeklyHoursConfigured } from '../../lib/businessHours';
import { useBusinessProfileQuery } from '../settings/businessSettingsHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { useBookingList } from '../bookings/bookingsHooks';

type GettingStartedChecklistProps = {
  onDismiss?: () => void;
};

export function GettingStartedChecklist({ onDismiss }: GettingStartedChecklistProps) {
  const businessQuery = useBusinessProfileQuery();
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const staffQuery = useStaffList();
  const bookingsQuery = useBookingList();

  const completed = useMemo(() => {
    const business = businessQuery.data;
    const settings = (business?.settings ?? {}) as Record<string, unknown>;
    const hasProfile = Boolean(
      business?.display_name &&
        (settings.address_line1 || settings.city || settings.primary_contact || business.email),
    );
    const hasLogo = Boolean(business?.logo);
    const hasHours = weeklyHoursConfigured(settings.business_hours);
    const services = servicesQuery.data ?? [];
    const staff = staffQuery.data ?? [];
    const customers = customersQuery.data ?? [];
    const bookings = bookingsQuery.data ?? [];

    return {
      profile: hasProfile,
      hours: hasHours,
      logo: hasLogo,
      service: services.length > 0,
      staff: staff.length > 0,
      team: staff.length > 1,
      customer: customers.length > 0,
      booking: bookings.length > 0,
      dashboard: true,
    } as Record<string, boolean>;
  }, [
    businessQuery.data,
    servicesQuery.data,
    staffQuery.data,
    customersQuery.data,
    bookingsQuery.data,
  ]);

  const progress = useMemo(() => {
    const done = GETTING_STARTED_ITEMS.filter((item) => completed[item.id]).length;
    return Math.round((done / GETTING_STARTED_ITEMS.length) * 100);
  }, [completed]);

  const loading =
    businessQuery.isLoading ||
    servicesQuery.isLoading ||
    staffQuery.isLoading ||
    customersQuery.isLoading ||
    bookingsQuery.isLoading;

  function handleDismiss() {
    try {
      localStorage.setItem('ie:onboarding:welcome-dismissed', 'true');
      localStorage.removeItem('ie:onboarding:show-welcome');
    } catch {
      // ignore
    }
    onDismiss?.();
  }

  return (
    <Card aria-labelledby="getting-started-title">
      <div className="getting-started-header">
        <div>
          <p className="public-kicker">Welcome wizard</p>
          <h2 id="getting-started-title" style={{ margin: '4px 0' }}>
            Getting started
          </h2>
          <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            {loading ? 'Checking your setup…' : `${progress}% complete`}
          </p>
        </div>
        <Button variant="ghost" type="button" onClick={handleDismiss} aria-label="Dismiss getting started checklist">
          Dismiss
        </Button>
      </div>
      <div
        className="getting-started-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Getting started progress"
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <ul className="getting-started-list">
        {GETTING_STARTED_ITEMS.map((item) => {
          const done = Boolean(completed[item.id]);
          return (
            <li key={item.id}>
              <label>
                <input type="checkbox" checked={done} readOnly disabled />
                <span style={{ opacity: done ? 1 : 0.85 }}>{item.label}</span>
              </label>
              <Link to={item.path}>{done ? 'View' : 'Open'}</Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
