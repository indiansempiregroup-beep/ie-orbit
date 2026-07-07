import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCustomerArchive,
  useCustomerCreate,
  useCustomerList,
  useCustomerRestore,
  useCustomerSearch,
  useCustomerUpdate,
} from '../management/managementHooks';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { BusinessWorkspaceSelect } from '../../components/BusinessWorkspaceSelect';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ManagementListToolbar } from '../../components/ManagementListToolbar';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useActiveBusinessFormField, useBusinessFormChange } from '../../hooks/useActiveBusinessFormField';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';

export function CustomersPage() {
  const theme = useTheme();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const createCustomer = useCustomerCreate();
  const updateCustomer = useCustomerUpdate();
  const archiveCustomer = useCustomerArchive();
  const restoreCustomer = useCustomerRestore();
  const [formState, setFormState] = useState({
    business: '',
    customer_code: '',
    display_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    status: 'active',
    send_registration_invite: true,
    full_address: '',
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [creationError, setCreationError] = useState<string | null>(null);
  const { data: customers, isLoading, error, refetch } = useCustomerList();
  const search = useCustomerSearch(searchTerm);
  const dialog = useDialog();
  const handleBusinessFormChange = useBusinessFormChange((business) => {
    setFormState((current) => ({ ...current, business }));
  });
  useActiveBusinessFormField(dialog.open, formState.business, (business) => {
    setFormState((current) => ({ ...current, business }));
  });

  const selectedData = searchTerm.trim() ? search.data ?? [] : customers ?? [];

  const customerSummary = useMemo(() => {
    const total = customers?.length ?? 0;
    const active = customers?.filter((customer) => customer.status === 'active').length ?? 0;
    const inactive = total - active;
    return { total, active, inactive };
  }, [customers]);

  function resetForm() {
    setFormState({
      business: '',
      customer_code: '',
      display_name: '',
      first_name: '',
      last_name: '',
      email: '',
      phone_number: '',
      status: 'active',
      send_registration_invite: true,
      full_address: '',
      latitude: null,
      longitude: null,
    });
  }

  function useBrowserLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => {
      setFormState((current) => ({
        ...current,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }));
    });
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <SubmitOverlay
        show={createCustomer.isPending || updateCustomer.isPending || archiveCustomer.isPending || restoreCustomer.isPending}
        message={
          createCustomer.isPending
            ? 'Adding customer…'
            : archiveCustomer.isPending
              ? 'Archiving customer…'
              : restoreCustomer.isPending
                ? 'Restoring customer…'
                : 'Updating customer…'
        }
      />
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
          <ManagementListToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search customers by name, email or phone"
            searchAriaLabel="Search customers"
            onClear={() => setSearchTerm('')}
          />

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr 1.2fr', padding: '16px 20px', background: theme.resolved === 'dark' ? '#111827' : '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>Name</span>
              <span>Email</span>
              <span>Phone</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: theme.resolved === 'dark' ? '#0f172a' : '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>Loading customers…</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? 'Unable to load customers'}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>No customers found.</div>
              ) : (
                selectedData.map((customer) => {
                  const isActive = customer.status === 'active';
                  const isArchived = customer.status === 'archived';
                  return (
                    <div
                      key={customer.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr 1.2fr',
                        padding: '16px 20px',
                        background: theme.resolved === 'dark' ? '#111827' : '#fff',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => customer.id && navigate(`/customers/${customer.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            customer.id && navigate(`/customers/${customer.id}`);
                          }
                        }}
                        style={{ cursor: 'pointer', fontWeight: 600 }}
                      >
                        {customer.full_name ?? 'Unknown customer'}
                      </span>
                      <span>{customer.email ?? '—'}</span>
                      <span>{customer.phone_number ?? '—'}</span>
                      <span style={{ color: isActive ? '#10b981' : '#6b7280' }}>{customer.status ?? 'Unknown'}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {isArchived ? (
                          <Button
                            type="button"
                            variant="primary"
                            loading={restoreCustomer.isPending}
                            loadingLabel="Activating…"
                            onClick={() =>
                              customer.id &&
                              restoreCustomer.mutate(customer.id, {
                                onSuccess: () => snackbar.push('Customer activated.', 'success'),
                                onError: (error) => snackbar.push(error.message, 'error'),
                              })
                            }
                          >
                            Activate
                          </Button>
                        ) : isActive ? (
                          <Button
                            type="button"
                            variant="neutral"
                            loading={updateCustomer.isPending}
                            loadingLabel="Deactivating…"
                            onClick={() =>
                              customer.id &&
                              updateCustomer.mutate(
                                { customerId: customer.id, customer: { status: 'inactive' } },
                                {
                                  onSuccess: () => snackbar.push('Customer deactivated.', 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                },
                              )
                            }
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="primary"
                            loading={updateCustomer.isPending}
                            loadingLabel="Activating…"
                            onClick={() =>
                              customer.id &&
                              updateCustomer.mutate(
                                { customerId: customer.id, customer: { status: 'active' } },
                                {
                                  onSuccess: () => snackbar.push('Customer activated.', 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                },
                              )
                            }
                          >
                            Activate
                          </Button>
                        )}
                        {!isArchived && isActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            loading={archiveCustomer.isPending}
                            loadingLabel="Archiving…"
                            onClick={() =>
                              customer.id &&
                              archiveCustomer.mutate(customer.id, {
                                onSuccess: () => snackbar.push('Customer archived.', 'success'),
                                onError: (error) => snackbar.push(error.message, 'error'),
                              })
                            }
                          >
                            Archive
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </section>
      </div>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="Add customer"
        labelledBy="add-customer-dialog"
        busy={createCustomer.isPending}
        busyMessage="Adding customer…"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            createCustomer.mutate(
              {
                business: formState.business,
                customer_code: formState.customer_code,
                display_name: formState.display_name,
                first_name: formState.first_name,
                last_name: formState.last_name,
                email: formState.email,
                phone_number: formState.phone_number,
                status: formState.status,
                send_registration_invite: formState.send_registration_invite,
                default_address: formState.full_address.trim()
                  ? {
                      full_address: formState.full_address,
                      latitude: formState.latitude,
                      longitude: formState.longitude,
                      is_default: true,
                    }
                  : undefined,
              },
              {
              onSuccess: () => {
                snackbar.push('Customer added.', 'success');
                dialog.hide();
                resetForm();
              },
              onError: (err) => {
                setCreationError(err.message ?? 'Failed to create customer');
              },
            });
          }}
          style={{ display: 'grid', gap: 16, marginTop: 12 }}
        >
          <BusinessWorkspaceSelect
            value={formState.business}
            onChange={handleBusinessFormChange}
            showManageLink={false}
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
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={formState.send_registration_invite}
              onChange={(event) => setFormState({ ...formState, send_registration_invite: event.target.checked })}
            />
            <span>Send registration invite email</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <label style={{ color: '#6b7280' }}>Full address</label>
              <Button type="button" variant="ghost" onClick={useBrowserLocation}>Use my location</Button>
            </div>
            <textarea
              value={formState.full_address}
              onChange={(event) => setFormState({ ...formState, full_address: event.target.value })}
              placeholder="House / street / area / city / pin code"
              rows={4}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <AddressMapPreview latitude={formState.latitude} longitude={formState.longitude} height={180} />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" loading={createCustomer.isPending} loadingLabel="Creating…">
              Create customer
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createCustomer.isPending}>
              Cancel
            </Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>
    </div>
  );
}
