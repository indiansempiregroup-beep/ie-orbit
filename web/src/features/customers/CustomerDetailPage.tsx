import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomerDetail, useCustomerUpdate } from '../management/managementHooks';
import { useDialog } from '../../hooks/useDialog';
import type { CustomerUpdateInput } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useTheme } from '../../hooks/useTheme';
import { Customer360Tabs } from './Customer360Tabs';

export function CustomerDetailPage() {
  const theme = useTheme();
  const { customerId } = useParams();
  const navigate = useNavigate();
  const customerQuery = useCustomerDetail(customerId);
  const updateCustomer = useCustomerUpdate();
  const editDialog = useDialog();
  const [activeTab, setActiveTab] = useState('overview');
  const [formState, setFormState] = useState<CustomerUpdateInput>({
    display_name: '',
    email: '',
    phone_number: '',
    status: 'active',
  });
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (editDialog.open && customerQuery.data) {
      setFormState({
        display_name: customerQuery.data.full_name ?? '',
        email: customerQuery.data.email ?? '',
        phone_number: customerQuery.data.phone_number ?? '',
        status: customerQuery.data.status ?? 'active',
      });
    }
  }, [editDialog.open, customerQuery.data]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Customer Detail</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Customer profile</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => navigate('/customers')}>Back to customers</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (customerQuery.data) editDialog.show();
              }}
              disabled={!customerQuery.data}
            >
              Edit customer
            </Button>
          </div>
        </div>

        {customerId ? (
          <Customer360Tabs customerId={customerId} activeTab={activeTab} onTabChange={setActiveTab} />
        ) : null}

        {activeTab === 'overview' ? (
        <Card style={{ display: 'grid', gap: 24 }}>
          {customerQuery.isLoading ? (
            <div style={{ padding: 28, textAlign: 'center' }}>Loading customer...</div>
          ) : customerQuery.error ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{customerQuery.error.message}</div>
          ) : customerQuery.data ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Name</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{customerQuery.data.full_name ?? 'Unknown'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Status</p>
                  <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>{customerQuery.data.status ?? 'Unknown'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Email</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.email ?? '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Phone</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.phone_number ?? '—'}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Created</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.created_at ? new Date(customerQuery.data.created_at).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Updated</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.updated_at ? new Date(customerQuery.data.updated_at).toLocaleString() : '—'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>Customer not found.</div>
          )}
        </Card>
        ) : null}
      </div>

      <Dialog open={editDialog.open} onClose={editDialog.hide} title="Edit customer" labelledBy="edit-customer-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEditError(null);
            if (!customerId) return;
            updateCustomer.mutate(
              { customerId, customer: formState },
              {
                onSuccess: () => editDialog.hide(),
                onError: (err) => setEditError(err.message ?? 'Failed to update customer'),
              },
            );
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
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
          <input
            value={formState.status ?? ''}
            onChange={(event) => setFormState({ ...formState, status: event.target.value })}
            placeholder="Status"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={updateCustomer.isPending}>
              {updateCustomer.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="neutral" onClick={editDialog.hide}>Cancel</Button>
          </div>
          {editError ? <div style={{ color: '#dc2626' }}>{editError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
