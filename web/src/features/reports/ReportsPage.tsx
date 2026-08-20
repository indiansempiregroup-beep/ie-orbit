import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';
import { BIReportsPage } from '../bi/BIReportsPage';

export function ReportsPage() {
  usePageMeta({
    title: 'Reports — AppointIE',
    description: 'Operational summary for bookings, revenue, and customers.',
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
          <Link to="/bi/overview">Open Business Intelligence</Link> for growth, revenue, and forecast views.
        </p>
      </Card>
      <BIReportsPage />
    </div>
  );
}
