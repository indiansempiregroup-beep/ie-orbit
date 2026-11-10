import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';

type Customer360TabsProps = {
  customerId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
};

const tabs = [
  { id: 'overview', labelKey: 'common.overview' },
  { id: 'appointments', labelKey: 'customers.tabAppointments', product: 'appointie' },
  { id: 'notes', labelKey: 'customers.tabNotes' },
  { id: 'activity', labelKey: 'customers.tabActivity' },
] as const;

export function Customer360Tabs({ customerId, activeTab, onTabChange }: Customer360TabsProps) {
  const { t } = useTranslation();
  return (
    <Card style={{ padding: 12 }}>
      <nav aria-label={t('customers.tabsAria')} className="customer-360-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : undefined}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>
      {activeTab === 'appointments' ? (
        <p style={{ margin: '12px 0 0', color: 'var(--muted-foreground)' }}>
          <Link to={`/bookings?customer=${customerId}`}>{t('customers.viewBookings')}</Link>
        </p>
      ) : null}
      {activeTab === 'activity' ? (
        <p style={{ margin: '12px 0 0', color: 'var(--muted-foreground)' }}>
          {t('customers.activityNote')}
        </p>
      ) : null}
    </Card>
  );
}
