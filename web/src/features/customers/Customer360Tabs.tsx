import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';

type Customer360TabsProps = {
  customerId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
};

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'appointments', label: 'Appointments', product: 'appointie' },
  { id: 'invoices', label: 'Invoices', product: 'invoiceie', comingSoon: true },
  { id: 'campaigns', label: 'Campaigns', product: 'crmie', comingSoon: true },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity' },
] as const;

export function Customer360Tabs({ customerId, activeTab, onTabChange }: Customer360TabsProps) {
  return (
    <Card style={{ padding: 12 }}>
      <nav aria-label="Customer profile sections" className="customer-360-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : undefined}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {'comingSoon' in tab && tab.comingSoon ? ' (soon)' : ''}
          </button>
        ))}
      </nav>
      {activeTab === 'appointments' ? (
        <p style={{ margin: '12px 0 0', color: 'var(--muted-foreground)' }}>
          <Link to={`/bookings?customer=${customerId}`}>View bookings for this customer</Link>
        </p>
      ) : null}
      {activeTab === 'invoices' || activeTab === 'campaigns' ? (
        <p style={{ margin: '12px 0 0', color: 'var(--muted-foreground)' }}>
          This module will be contributed by the product application when {activeTab === 'invoices' ? 'InvoiceIE' : 'CRMIE'} is enabled.
        </p>
      ) : null}
      {activeTab === 'activity' ? (
        <p style={{ margin: '12px 0 0', color: 'var(--muted-foreground)' }}>
          Unified activity timeline requires the platform event bus (future milestone).
        </p>
      ) : null}
    </Card>
  );
}
