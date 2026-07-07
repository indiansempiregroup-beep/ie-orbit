import React, { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomerDetail, useCustomerUpdate } from '../management/managementHooks';
import { useDialog } from '../../hooks/useDialog';
import { useEditFormInit } from '../../hooks/useEditFormInit';
import type { Customer, CustomerUpdateInput } from '@ie-platform/sdk';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useTheme } from '../../hooks/useTheme';
import { useSnackbar } from '../../hooks/useSnackbar';
import { Customer360Tabs } from './Customer360Tabs';

type AddressFormState = {
  full_address: string;
  latitude: number | null;
  longitude: number | null;
};

export function CustomerDetailPage() {
  const theme = useTheme();
  const snackbar = useSnackbar();
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
  const [addressForm, setAddressForm] = useState<AddressFormState>({
    full_address: '',
    latitude: null,
    longitude: null,
  });
  const [editError, setEditError] = useState<string | null>(null);

  const initForm = useCallback((customer: Customer) => {
    setFormState({
      display_name: customer.full_name ?? '',
      email: customer.email ?? '',
      phone_number: customer.phone_number ?? '',
      status: customer.status ?? 'active',
    });
    setAddressForm({
      full_address: customer.full_address ?? customer.address?.full_address ?? customer.address?.line1 ?? '',
      latitude: customer.latitude ?? customer.address?.latitude ?? null,
      longitude: customer.longitude ?? customer.address?.longitude ?? null,
    });
  }, []);

  useEditFormInit(editDialog.open, customerQuery.data, initForm);

  const customerName = customerQuery.data?.full_name ?? 'Customer profile';

  function useBrowserLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setAddressForm((current) => ({
        ...current,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }));
    });
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <SubmitOverlay show={updateCustomer.isPending} message="Saving customer…" />
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Customer Detail</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>{customerName}</h1>
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

              <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>Address</p>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{customerQuery.data.full_address ?? '—'}</p>
                <AddressMapPreview latitude={customerQuery.data.latitude} longitude={customerQuery.data.longitude} />
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

      <Dialog
        open={editDialog.open}
        onClose={editDialog.hide}
        title="Edit customer"
        labelledBy="edit-customer-dialog"
        busy={updateCustomer.isPending}
        busyMessage="Saving customer…"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setEditError(null);
            if (!customerId) return;
            updateCustomer.mutate(
              {
                customerId,
                customer: {
                  ...formState,
                  default_address: {
                    full_address: addressForm.full_address,
                    latitude: addressForm.latitude,
                    longitude: addressForm.longitude,
                    is_default: true,
                  },
                },
              },
              {
                onSuccess: () => {
                  snackbar.push('Customer profile updated.', 'success');
                  editDialog.hide();
                  customerQuery.refetch();
                },
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
            value={formState.email ?? ''}
            onChange={(event) => setFormState({ ...formState, email: event.target.value })}
            placeholder="Email"
            type="email"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.phone_number ?? ''}
            onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
            placeholder="Phone number"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <select
            value={formState.status ?? 'active'}
            onChange={(event) => setFormState({ ...formState, status: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <label style={{ color: '#6b7280' }}>Full address</label>
              <Button type="button" variant="ghost" onClick={useBrowserLocation}>Use my location</Button>
            </div>
            <textarea
              value={addressForm.full_address}
              onChange={(event) => setAddressForm({ ...addressForm, full_address: event.target.value })}
              placeholder="House / street / area / city / pin code"
              rows={4}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <AddressMapPreview latitude={addressForm.latitude} longitude={addressForm.longitude} height={180} />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" loading={updateCustomer.isPending} loadingLabel="Saving…">
              Save changes
            </Button>
            <Button type="button" variant="neutral" onClick={editDialog.hide} disabled={updateCustomer.isPending}>
              Cancel
            </Button>
          </div>
          {editError ? <div style={{ color: '#dc2626' }}>{editError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
