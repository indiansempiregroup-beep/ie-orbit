import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { CustomerLoyaltyBalance } from '@ie-orbit/sdk';
import {
  useCustomerArchive,
  useCustomerCreate,
  useCustomerList,
  useCustomerRestore,
  useCustomerSearch,
  useCustomerUpdate,
} from '../management/managementHooks';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { BusinessWorkspaceSelect } from '../../components/BusinessWorkspaceSelect';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ManagementListToolbar } from '../../components/ManagementListToolbar';
import { SubmitOverlay } from '../../components/SubmitOverlay';
import { useActiveBusinessFormField, useBusinessFormChange } from '../../hooks/useActiveBusinessFormField';
import { useApiClient } from '../../hooks/useApiClient';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { normalizeGstin, validateGstin } from '../../lib/gstin';
import { hasSubscribedProduct } from '../../config/products';

export function CustomersPage() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const client = useApiClient();
  const { activeBusiness } = useWorkspace();
  const showGstFields = hasSubscribedProduct(activeBusiness?.product_subscriptions, 'shopie');
  const [searchTerm, setSearchTerm] = useState('');
  const [loyaltyCustomerId, setLoyaltyCustomerId] = useState<string | null>(null);
  const [loyaltyCustomerName, setLoyaltyCustomerName] = useState('');
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [loyaltyData, setLoyaltyData] = useState<CustomerLoyaltyBalance | null>(null);
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
    line2: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    latitude: null as number | null,
    longitude: null as number | null,
    gstin: '',
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
      line2: '',
      city: '',
      state: '',
      country: '',
      postal_code: '',
      latitude: null,
      longitude: null,
      gstin: '',
    });
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
      <SubmitOverlay
        show={createCustomer.isPending || updateCustomer.isPending || archiveCustomer.isPending || restoreCustomer.isPending}
        message={
          createCustomer.isPending
            ? t('customers.overlayAdding')
            : archiveCustomer.isPending
              ? t('customers.overlayArchiving')
              : restoreCustomer.isPending
                ? t('customers.overlayRestoring')
                : t('customers.overlayUpdating')
        }
      />
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>{t('customers.eyebrow')}</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>{t('customers.title')}</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>{t('customers.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/shop/loyalty">
              <Button variant="neutral">{t('customers.rewardActivity')}</Button>
            </Link>
            <Button variant="primary" onClick={() => dialog.show()}>{t('customers.add')}</Button>
            <Button variant="neutral" onClick={() => refetch()}>{t('common.refresh')}</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>{t('customers.total')}</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.total}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>{t('common.active')}</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.active}</p>
          </Card>
          <Card style={{ minHeight: 120 }}>
            <p style={{ margin: 0, color: '#6b7280' }}>{t('customers.inactive')}</p>
            <p style={{ margin: '12px 0 0', fontSize: 28, fontWeight: 700 }}>{customerSummary.inactive}</p>
          </Card>
        </div>

        <section style={{ display: 'grid', gap: 16 }}>
          <ManagementListToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder={t('customers.searchPlaceholder')}
            searchAriaLabel={t('customers.searchAria')}
            onClear={() => setSearchTerm('')}
          />

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 0.7fr 1.3fr', padding: '16px 20px', background: '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
              <span>{t('customers.name')}</span>
              <span>{t('common.email')}</span>
              <span>{t('common.phone')}</span>
              <span>{t('customers.colPoints')}</span>
              <span>{t('common.status')}</span>
              <span>{t('customers.colActions')}</span>
            </div>
            <div style={{ display: 'grid', gap: 1, background: '#fff' }}>
              {isLoading || search.isLoading ? (
                <div style={{ padding: 28, textAlign: 'center' }}>{t('customers.loading')}</div>
              ) : error || search.error ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#dc2626' }}>{error?.message ?? search.error?.message ?? t('customers.loadFailed')}</div>
              ) : selectedData.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#6b7280' }}>{t('customers.noneFound')}</div>
              ) : (
                selectedData.map((customer) => {
                  const isActive = customer.status === 'active';
                  const isArchived = customer.status === 'archived';
                  return (
                    <div
                      key={customer.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 1fr 1fr 0.7fr 0.7fr 1.3fr',
                        padding: '16px 20px',
                        background: '#fff',
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
                        {customer.full_name ?? t('customers.unknownCustomer')}
                      </span>
                      <span>{customer.email ?? '—'}</span>
                      <span>{customer.phone_number ?? '—'}</span>
                      <span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!customer.id) return;
                            setLoyaltyCustomerId(customer.id);
                            setLoyaltyCustomerName(customer.full_name ?? t('dashboard.customerFallback'));
                            setLoyaltyData(null);
                            setLoyaltyError(null);
                            setLoyaltyBusy(true);
                            void client.customers
                              .getLoyaltyBalance(customer.id)
                              .then((response) => setLoyaltyData(response.data))
                              .catch((error) =>
                                setLoyaltyError(
                                  error instanceof Error ? error.message : t('customers.unableLoadPoints'),
                                ),
                              )
                              .finally(() => setLoyaltyBusy(false));
                          }}
                          style={{
                            border: 0,
                            background: 'transparent',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontWeight: 700,
                            padding: 0,
                          }}
                        >
                          {customer.loyalty_points ?? 0}
                        </button>
                      </span>
                      <span style={{ color: isActive ? '#10b981' : '#6b7280' }}>{t(`customers.statuses.${customer.status ?? 'unknown'}`, { defaultValue: customer.status ?? '' })}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {isArchived ? (
                          <Button
                            type="button"
                            variant="primary"
                            loading={restoreCustomer.isPending}
                            loadingLabel={t('customers.activating')}
                            onClick={() =>
                              customer.id &&
                              restoreCustomer.mutate(customer.id, {
                                onSuccess: () => snackbar.push(t('customers.activated'), 'success'),
                                onError: (error) => snackbar.push(error.message, 'error'),
                              })
                            }
                          >
                            {t('customers.activate')}
                          </Button>
                        ) : isActive ? (
                          <Button
                            type="button"
                            variant="neutral"
                            loading={updateCustomer.isPending}
                            loadingLabel={t('customers.deactivating')}
                            onClick={() =>
                              customer.id &&
                              updateCustomer.mutate(
                                { customerId: customer.id, customer: { status: 'inactive' } },
                                {
                                  onSuccess: () => snackbar.push(t('customers.deactivated'), 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                },
                              )
                            }
                          >
                            {t('customers.deactivate')}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="primary"
                            loading={updateCustomer.isPending}
                            loadingLabel={t('customers.activating')}
                            onClick={() =>
                              customer.id &&
                              updateCustomer.mutate(
                                { customerId: customer.id, customer: { status: 'active' } },
                                {
                                  onSuccess: () => snackbar.push(t('customers.activated'), 'success'),
                                  onError: (error) => snackbar.push(error.message, 'error'),
                                },
                              )
                            }
                          >
                            {t('customers.activate')}
                          </Button>
                        )}
                        {!isArchived && isActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            loading={archiveCustomer.isPending}
                            loadingLabel={t('customers.archiving')}
                            onClick={() =>
                              customer.id &&
                              archiveCustomer.mutate(customer.id, {
                                onSuccess: () => snackbar.push(t('customers.archived'), 'success'),
                                onError: (error) => snackbar.push(error.message, 'error'),
                              })
                            }
                          >
                            {t('customers.archive')}
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
        title={t('customers.add')}
        labelledBy="add-customer-dialog"
        busy={createCustomer.isPending}
        busyMessage={t('customers.overlayAdding')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreationError(null);
            let resolvedGstin = '';
            if (showGstFields) {
              const gstinResult = validateGstin(formState.gstin);
              if (!gstinResult.ok) {
                setCreationError(gstinResult.message);
                return;
              }
              resolvedGstin = gstinResult.gstin;
            }
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
                ...(showGstFields && resolvedGstin ? { gstin: resolvedGstin } : {}),
                default_address: formState.full_address.trim()
                  ? {
                      full_address: formState.full_address,
                      line2: formState.line2,
                      city: formState.city,
                      state: formState.state,
                      country: formState.country,
                      postal_code: formState.postal_code,
                      latitude: formState.latitude,
                      longitude: formState.longitude,
                      is_default: true,
                    }
                  : undefined,
              },
              {
              onSuccess: () => {
                snackbar.push(t('customers.customerAdded'), 'success');
                dialog.hide();
                resetForm();
              },
              onError: (err) => {
                setCreationError(err.message ?? t('customers.saveFailed'));
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
            placeholder={t('customers.customerCode')}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            required
            value={formState.display_name}
            onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
            placeholder={t('customers.displayName')}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.email}
            onChange={(event) => setFormState({ ...formState, email: event.target.value })}
            placeholder={t('common.email')}
            type="email"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <input
            value={formState.phone_number}
            onChange={(event) => setFormState({ ...formState, phone_number: event.target.value })}
            placeholder={t('customers.phoneNumber')}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          {showGstFields ? (
            <input
              value={formState.gstin}
              onChange={(event) =>
                setFormState({ ...formState, gstin: normalizeGstin(event.target.value) })
              }
              placeholder={t('customers.gstinPlaceholder')}
              maxLength={15}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          ) : null}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={formState.send_registration_invite}
              onChange={(event) => setFormState({ ...formState, send_registration_invite: event.target.checked })}
            />
            <span>{t('customers.sendInvite')}</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            <AddressLocationPicker
              label={t('customers.addressLabel')}
              value={formState.full_address}
              latitude={formState.latitude}
              longitude={formState.longitude}
              onChangeText={(full_address) => setFormState((current) => ({ ...current, full_address }))}
              onPlaceSelected={(place) => {
                const cleared =
                  !place.line1 &&
                  !place.formattedAddress &&
                  place.latitude == null &&
                  place.longitude == null;
                setFormState((current) => ({
                  ...current,
                  full_address: place.formattedAddress,
                  line2: cleared ? '' : current.line2,
                  city: place.city || '',
                  state: place.state || '',
                  country: place.country || '',
                  postal_code: place.postalCode || '',
                  latitude: place.latitude ?? null,
                  longitude: place.longitude ?? null,
                }));
              }}
            />
            <input
              value={formState.line2}
              onChange={(event) => setFormState((current) => ({ ...current, line2: event.target.value }))}
              placeholder={t('customers.line2Placeholder')}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}
            />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              {(['city', 'state', 'country', 'postal_code'] as const).map((field) => (
                <input
                  key={field}
                  value={formState[field]}
                  readOnly={formState.latitude != null && formState.longitude != null}
                  onChange={(event) => setFormState((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={t(field === 'postal_code' ? 'customers.postalCode' : `customers.${field}`)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: formState.latitude != null && formState.longitude != null ? '#f9fafb' : '#fff',
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" loading={createCustomer.isPending} loadingLabel={t('customers.creating')}>
              {t('customers.create')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createCustomer.isPending}>
              {t('common.cancel')}
            </Button>
          </div>
          {creationError ? <div style={{ color: '#dc2626' }}>{creationError}</div> : null}
        </form>
      </Dialog>

      <Dialog
        open={Boolean(loyaltyCustomerId)}
        onClose={() => {
          setLoyaltyCustomerId(null);
          setLoyaltyData(null);
          setLoyaltyError(null);
        }}
        title={t('customers.rewardPointsTitle', { name: loyaltyCustomerName })}
        labelledBy="customer-loyalty-dialog"
        busy={loyaltyBusy}
      >
        {loyaltyBusy ? <p>{t('common.loading')}</p> : null}
        {loyaltyError ? <p role="alert" style={{ color: '#dc2626' }}>{loyaltyError}</p> : null}
        {loyaltyData ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {t('customers.balance', { n: loyaltyData.points_balance })}
              {!loyaltyData.enabled ? (
                <span style={{ marginLeft: 8, fontSize: 13, color: '#b45309', fontWeight: 600 }}>
                  {t('customers.programOff')}
                </span>
              ) : null}
            </p>
            <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
              {(loyaltyData.ledger ?? []).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '8px 0',
                    borderBottom: '1px solid #f3f4f6',
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{entry.reason || t('customers.pointsUpdate')}</div>
                    <div style={{ color: '#6b7280' }}>
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                    </div>
                  </div>
                  <strong style={{ color: entry.points_delta >= 0 ? '#047857' : '#b91c1c' }}>
                    {entry.points_delta >= 0 ? `+${entry.points_delta}` : entry.points_delta}
                  </strong>
                </div>
              ))}
              {!loyaltyData.ledger?.length ? (
                <p style={{ margin: 0, color: '#6b7280' }}>{t('customers.noRecentPoints')}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
