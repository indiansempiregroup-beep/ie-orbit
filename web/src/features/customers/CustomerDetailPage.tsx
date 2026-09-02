import React, { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomerDetail, useCustomerUpdate } from '../management/managementHooks';
import { useDialog } from '../../hooks/useDialog';
import { useEditFormInit } from '../../hooks/useEditFormInit';
import type { Customer, CustomerUpdateInput } from '@ie-orbit/sdk';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { formatTimestamp } from '../../lib/datetime';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { normalizeGstin, validateGstin } from '../../lib/gstin';
import { hasSubscribedProduct } from '../../config/products';
import { Customer360Tabs } from './Customer360Tabs';
import { CustomerBorrowPanel } from './CustomerBorrowPanel';

type AddressFormState = {
  full_address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
};

export function CustomerDetailPage() {
  const snackbar = useSnackbar();
  const { activeBusiness } = useWorkspace();
  const showGstFields = hasSubscribedProduct(activeBusiness?.product_subscriptions, 'shopie');
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
    gstin: '',
  });
  const [addressForm, setAddressForm] = useState<AddressFormState>({
    full_address: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
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
      gstin: normalizeGstin(customer.gstin ?? ''),
    });
    setAddressForm({
      full_address: customer.full_address ?? customer.address?.full_address ?? customer.address?.line1 ?? '',
      city: customer.address?.city ?? '',
      state: customer.address?.state ?? '',
      country: customer.address?.country ?? '',
      postal_code: customer.address?.postal_code ?? '',
      latitude:
        customer.latitude != null || customer.address?.latitude != null
          ? Number(customer.latitude ?? customer.address?.latitude)
          : null,
      longitude:
        customer.longitude != null || customer.address?.longitude != null
          ? Number(customer.longitude ?? customer.address?.longitude)
          : null,
    });
  }, []);

  useEditFormInit(editDialog.open, customerQuery.data, initForm);

  const customerName = customerQuery.data?.full_name ?? 'Customer profile';

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
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

              {showGstFields ? (
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>GSTIN</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.gstin?.trim() || '—'}</p>
                </div>
              ) : null}

              <CustomerBorrowPanel
                customerId={customerQuery.data.id}
                balanceDue={Number(customerQuery.data.borrow_balance_due ?? 0)}
                currency={customerQuery.data.borrow_currency || 'INR'}
                onChanged={() => customerQuery.refetch()}
              />

              <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: '#6b7280' }}>Address</p>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{customerQuery.data.full_address ?? '—'}</p>
                <AddressMapPreview latitude={customerQuery.data.latitude} longitude={customerQuery.data.longitude} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Created</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.created_at ? formatTimestamp(customerQuery.data.created_at) : '—'}</p>
                </div>
                <div>
                  <p style={{ margin: 0, color: '#6b7280' }}>Updated</p>
                  <p style={{ margin: '8px 0 0' }}>{customerQuery.data.updated_at ? formatTimestamp(customerQuery.data.updated_at) : '—'}</p>
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
            let resolvedGstin = '';
            if (showGstFields) {
              const gstinResult = validateGstin(formState.gstin ?? '');
              if (!gstinResult.ok) {
                setEditError(gstinResult.message);
                return;
              }
              resolvedGstin = gstinResult.gstin;
            }
            updateCustomer.mutate(
              {
                customerId,
                customer: {
                  ...formState,
                  ...(showGstFields ? { gstin: resolvedGstin || undefined } : {}),
                  default_address: {
                    full_address: addressForm.full_address,
                    city: addressForm.city,
                    state: addressForm.state,
                    country: addressForm.country,
                    postal_code: addressForm.postal_code,
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
          {showGstFields ? (
            <input
              value={formState.gstin ?? ''}
              onChange={(event) =>
                setFormState({ ...formState, gstin: normalizeGstin(event.target.value) })
              }
              placeholder="GSTIN (optional, for Orbit Mart B2B bills)"
              maxLength={15}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          ) : null}
          <select
            value={formState.status ?? 'active'}
            onChange={(event) => setFormState({ ...formState, status: event.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div style={{ display: 'grid', gap: 8 }}>
            <AddressLocationPicker
              label="Customer address (Google Maps)"
              value={addressForm.full_address}
              latitude={addressForm.latitude}
              longitude={addressForm.longitude}
              onChangeText={(full_address) => setAddressForm((current) => ({ ...current, full_address }))}
              onPlaceSelected={(place) => {
                setAddressForm({
                  full_address: place.formattedAddress,
                  city: place.city || '',
                  state: place.state || '',
                  country: place.country || '',
                  postal_code: place.postalCode || '',
                  latitude: place.latitude ?? null,
                  longitude: place.longitude ?? null,
                });
              }}
            />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              {(['city', 'state', 'country', 'postal_code'] as const).map((field) => (
                <input
                  key={field}
                  value={addressForm[field]}
                  onChange={(event) => setAddressForm((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={field === 'postal_code' ? 'Postal code' : field[0].toUpperCase() + field.slice(1)}
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              ))}
            </div>
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
