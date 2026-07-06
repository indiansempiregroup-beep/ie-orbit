import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerCreate, useCustomerList, useCustomerSearch } from '../management/managementHooks';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useTheme } from '../../hooks/useTheme';

export function CustomersPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createCustomer = useCustomerCreate();
  const [formState, setFormState] = useState({
    business: '',
    customer_code: '',
    display_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    status: 'active',
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const { data: customers, isLoading, error, refetch } = useCustomerList();
  const search = useCustomerSearch(searchTerm);
  const dialog = useDialog();

  const selectedData = searchTerm.trim() ? search.data ?? [] : customers ?? [];

  const customerSummary = useMemo(() => {
    const total = customers?.length ?? 0;
    const active = customers?.filter((customer) => customer.status === 'active').length ?? 0;
    const inactive = total - active;
    return { total, active, inactive };
  }, [customers]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Customer Management</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Customers</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Review customer records, tags, and recent activity in one place.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => dialog.show()}>Add customer</Button>
            <Button variant="neutral" onClick={() => refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Total customers</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.total}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Active</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.active}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>Inactive</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.inactive}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search customers by name, email or phone"
              style={{ flex: 1, borderRadius: 14, border: '1px solid #e5e7eb', padding: '12px 16px', background: theme.resolved === 'dark' ? '#111827' : '#fff', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}
              aria-label="Search customers"
            />
            <Button variant="ghost" onClick={() => setSearchTerm('')}>Clear</Button>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>Name</span>
              <span>Email</span>
              <span>Phone</span>
              <span>Status</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading customers…</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? 'Unable to load customers'}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No customers found.</div>
              ) : (
                selectedData.map((customer) => (
                  <div
                    key={customer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => customer.id && navigate(`/customers/${customer.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        customer.id && navigate(`/customers/${customer.id}`);
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                      padding: '16px 20px',
                      background: theme.resolved === 'dark' ? '#111827' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <span>{customer.full_name ?? 'Unknown customer'}</span>
                    <span>{customer.email ?? '—'}</span>
                    <span>{customer.phone_number ?? '—'}</span>
                    <span style={{ color: customer.status === 'active' ? '#10b981' : '#6b7280' }}>{customer.status ?? 'Unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Add customer" labelledBy="add-customer-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            createCustomer.mutate(formState, {
              onSuccess: () => {
                dialog.hide();
                setFormState({
                  business: '',
                  customer_code: '',
                  display_name: '',
                  first_name: '',
                  last_name: '',
                  email: '',
                  phone_number: '',
                  status: 'active',
                });
              },
              onError: (err) => {
                setCreationError(err.message ?? 'Failed to create customer');
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
            value={formState.customer_code}
            onChange={(event) => setFormState({ ...formState, customer_code: event.target.value })}
            placeholder="Customer code"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.display_name}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder="Display name"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.email}
            onChange={(event) => setFormState({ ...formState, email: event.target.value })}
            placeholder="Email"
            type="email"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.phone_number}
            onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
            placeholder="Phone number"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createCustomer.isPending}>
              {createCustomer.isPending ? 'Creating…' : 'Create customer'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide}>Cancel</Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
