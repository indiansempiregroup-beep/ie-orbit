import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceCreate, useServiceList, useServiceSearch } from '../management/managementHooks';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useTheme } from '../../hooks/useTheme';

export function ServicesPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createService = useServiceCreate();
  const [formState, setFormState] = useState({
    business: '',
    service_code: '',
    name: '',
    display_name: '',
    status: 'active',
    short_description: '',
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const { data: services, isLoading, error, refetch } = useServiceList();
  const search = useServiceSearch(searchTerm);
  const dialog = useDialog();

  const selectedData = searchTerm.trim() ? search.data ?? [] : services ?? [];

  const serviceSummary = useMemo(() => {
    const total = services?.length ?? 0;
    const active = services?.filter((service) => service.status === 'active').length ?? 0;
    const inactive = total - active;
    return { total, active, inactive };
  }, [services]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Service Management</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Services</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Create and maintain appointment services, duration, and pricing.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => dialog.show()}>Add service</Button>
            <Button variant="neutral" onClick={() => refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total services</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.total}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Active</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.active}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Inactive</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{serviceSummary.inactive}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search services by name, description or status"
              style={{ flex: 1, borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              aria-label="Search services"
            />
            <Button variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>Service</span>
              <span>Duration</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading services…</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? 'Unable to load services'}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No services found.</div>
              ) : (
                selectedData.map((service) => (
                  <div
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => service.id && navigate(`/services/${service.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        service.id && navigate(`/services/${service.id}`);
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      padding: '16px 20px',
                      background: theme.resolved === 'dark' ? '#111827' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{service.name ?? 'Untitled service'}</span>
                    <span>{service.duration_minutes ? `${service.duration_minutes} min` : '—'}</span>
                    <span>{service.price != null ? `$${service.price.toFixed(2)}` : '—'}</span>
                    <span style={{ color: service.status === 'active' ? '#10b981' : '#6b7280' }}>{service.status ?? 'Unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Add service" labelledBy="add-service-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            createService.mutate(formState, {
              onSuccess: () => {
                dialog.hide();
                setFormState({
                  business: '',
                  service_code: '',
                  name: '',
                  display_name: '',
                  status: 'active',
                  short_description: '',
                });
              },
              onError: (err) => {
                setCreationError(err.message ?? 'Failed to create service');
              },
            });
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <input
            required
            value={formState.business}
            onChange={(event) => setFormState({ ...formState, business: event.target.value })}
            placeholder="Business ID"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.service_code}
            onChange={(event) => setFormState({ ...formState, service_code: event.target.value })}
            placeholder="Service code"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.name}
            onChange={(event) => setFormState({ ...formState, name: event.target.value })}
            placeholder="Service name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.display_name}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder="Display name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <textarea
            value={formState.short_description}
            onChange={(event) => setFormState({ ...formState, short_description: event.target.value })}
            placeholder="Short description"
            rows={4}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createService.isPending}>
              {createService.isPending ? 'Creating…' : 'Create service'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
