import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useBusinessProfileQuery, useBusinessProfileUpdate } from './businessSettingsHooks';
import type { BusinessUpdateInput } from '@ie-platform/sdk';
import { useProfileDetails } from '../profile/profileHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { BusinessSetupPanel } from './BusinessSetupPanel';
import { useBusinessListQuery } from './businessSettingsHooks';
import { BillingPlanFoundation } from './BillingPlanFoundation';

const initialFormState: BusinessUpdateInput = {
  business_name: '',
  display_name: '',
  business_type: '',
  email: '',
  currency: '',
  timezone: '',
};

export function SettingsPage() {
  const theme = useTheme();
  const profile = useProfileDetails();
  const businessQuery = useBusinessProfileQuery();
  const businessListQuery = useBusinessListQuery();
  const updateBusiness = useBusinessProfileUpdate();
  const snackbar = useSnackbar();
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const staffQuery = useStaffList();
  const [formState, setFormState] = useState<BusinessUpdateInput>(initialFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (businessQuery.data) {
      setFormState({
        business_name: businessQuery.data.business_name ?? '',
        display_name: businessQuery.data.display_name ?? '',
        business_type: businessQuery.data.business_type ?? '',
        email: businessQuery.data.email ?? '',
        currency: businessQuery.data.currency ?? '',
        timezone: businessQuery.data.timezone ?? '',
      });
    }
  }, [businessQuery.data]);

  const businessData = businessQuery.data;
  const user = profile.user;

  const isDirty = Boolean(
    businessData &&
      (formState.business_name !== businessData.business_name ||
        formState.display_name !== businessData.display_name ||
        formState.business_type !== businessData.business_type ||
        formState.email !== businessData.email ||
        formState.currency !== businessData.currency ||
        formState.timezone !== businessData.timezone),
  );

  const settingsSummary = useMemo(
    () => [
      { label: 'Business Status', value: businessData?.status ?? 'Unavailable' },
      { label: 'Currency', value: businessData?.currency ?? 'USD' },
      { label: 'Timezone', value: businessData?.timezone ?? 'UTC' },
      { label: 'Notification preferences', value: user?.notification_preferences ? 'Configured' : 'Not configured' },
    ],
    [businessData, user?.notification_preferences],
  );

  const roleSummary = useMemo(() => {
    const roles = user?.roles ?? [];
    return {
      primaryRole: roles[0] ?? 'Owner',
      roleCount: roles.length || 1,
      staffCount: staffQuery.data?.filter((member) => member.status === 'active').length ?? 0,
    };
  }, [staffQuery.data, user?.roles]);

  const mediaSummary = useMemo(() => ({
    serviceCount: servicesQuery.data?.length ?? 0,
    customerCount: customersQuery.data?.length ?? 0,
  }), [customersQuery.data, servicesQuery.data]);

  const activitySummary = useMemo(() => ({
    recentActivityCount: Math.max(1, (customersQuery.data?.length ?? 0) + (staffQuery.data?.length ?? 0) + (servicesQuery.data?.length ?? 0)),
    latestEvent: staffQuery.data?.[0]?.status ?? 'No recent events',
  }), [customersQuery.data, servicesQuery.data, staffQuery.data]);

  const roleMembers = useMemo(() => (staffQuery.data ?? []).filter((member) => member.status === 'active').slice(0, 4), [staffQuery.data]);
  const servicePreview = useMemo(() => (servicesQuery.data ?? []).slice(0, 4), [servicesQuery.data]);
  const customerPreview = useMemo(() => (customersQuery.data ?? []).slice(0, 4), [customersQuery.data]);
  const activityItems = useMemo(() => {
    const items = [
      ...(staffQuery.data ?? []).slice(0, 2).map((member) => ({
        id: `staff-${member.id}`,
        title: member.full_name ?? 'Staff member',
        detail: member.status ?? 'Status unavailable',
      })),
      ...(servicesQuery.data ?? []).slice(0, 2).map((service) => ({
        id: `service-${service.id}`,
        title: service.name ?? 'Service',
        detail: service.duration_minutes ? `${service.duration_minutes} min` : 'Service record',
      })),
      ...(customersQuery.data ?? []).slice(0, 2).map((customer) => ({
        id: `customer-${customer.id}`,
        title: customer.full_name ?? 'Customer',
        detail: customer.email ?? 'Customer record',
      })),
    ];
    return items.slice(0, 6);
  }, [customersQuery.data, servicesQuery.data, staffQuery.data]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, 0.75fr)' }}>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Business settings</p>
                <h2 style={{ margin: '8px 0 0', fontSize: 24, lineHeight: 1.2 }}>Update your business profile</h2>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Keep your workspace identity, billing details, and regional settings current for staff and customers.</p>
              </div>

              {!businessQuery.data && businessQuery.isLoading ? (
                <div style={{ padding: 24, textAlign: 'center' }}>Loading business profile…</div>
              ) : businessQuery.error && !businessQuery.data ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#dc2626' }}>{businessQuery.error.message}</div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setErrorMessage(null);
                    setSaveState('saving');
                    updateBusiness.mutate(formState, {
                      onSuccess: () => {
                        setSaveState('success');
                        snackbar.push('Business profile updated successfully.', 'success');
                      },
                      onError: (error) => {
                        setSaveState('error');
                        setErrorMessage(error.message ?? 'Unable to save business profile.');
                        snackbar.push(error.message ?? 'Unable to save business profile.', 'error');
                      },
                    });
                  }}
                  style={{ display: 'grid', gap: 16 }}
                >
                  <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Business name</span>
                      <input
                        value={formState.business_name ?? ''}
                        onChange={(event) => setFormState({ ...formState, business_name: event.target.value })}
                        placeholder="Business name"
                        required
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Display name</span>
                      <input
                        value={formState.display_name ?? ''}
                        onChange={(event) => setFormState({ ...formState, display_name: event.target.value })}
                        placeholder="Display name"
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Business type</span>
                      <input
                        value={formState.business_type ?? ''}
                        onChange={(event) => setFormState({ ...formState, business_type: event.target.value })}
                        placeholder="Salon, Clinic, Studio..."
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Business email</span>
                      <input
                        value={formState.email ?? ''}
                        onChange={(event) => setFormState({ ...formState, email: event.target.value })}
                        placeholder="contact@example.com"
                        type="email"
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Currency</span>
                      <input
                        value={formState.currency ?? ''}
                        onChange={(event) => setFormState({ ...formState, currency: event.target.value })}
                        placeholder="USD"
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ color: '#6b7280', fontSize: 13 }}>Timezone</span>
                      <input
                        value={formState.timezone ?? ''}
                        onChange={(event) => setFormState({ ...formState, timezone: event.target.value })}
                        placeholder="UTC"
                        disabled={updateBusiness.isPending}
                        style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f8fafc' }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    <Button type="submit" variant="primary" disabled={!isDirty || updateBusiness.isPending}>
                      {updateBusiness.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                  </div>

                  {saveState === 'saving' ? (
                    <div style={{ color: '#0f172a', background: '#dbeafe', padding: 12, borderRadius: 12, border: '1px solid #93c5fd' }}>
                      Saving business profile…
                    </div>
                  ) : saveState === 'success' ? (
                    <div style={{ color: '#047857', background: '#ecfdf5', padding: 12, borderRadius: 12, border: '1px solid #86efac' }}>
                      Business profile saved successfully.
                    </div>
                  ) : saveState === 'error' && errorMessage ? (
                    <div style={{ color: '#dc2626', background: '#fef2f2', padding: 12, borderRadius: 12, border: '1px solid #fecaca' }}>
                      {errorMessage}
                    </div>
                  ) : null}
                </form>
              )}
            </div>
          </Card>

          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Account access</p>
                <h2 style={{ margin: '8px 0 0', fontSize: 20, lineHeight: 1.2 }}>{user?.full_name ?? 'Your account'}</h2>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{user?.email ?? 'No email available'}</p>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <strong>Role</strong>
                  <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{user?.roles?.join(', ') ?? 'No roles assigned'}</p>
                </div>
                <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <strong>Permissions</strong>
                  <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{user?.permissions?.join(', ') ?? 'No permissions available'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <BusinessSetupPanel show={!businessListQuery.isLoading && (businessListQuery.data?.length ?? 0) === 0} />

        <BillingPlanFoundation />

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Role management</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Your workspace currently has {roleSummary.roleCount} role assignment{roleSummary.roleCount === 1 ? '' : 's'} across {roleSummary.staffCount} active staff members.</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>Primary role: {roleSummary.primaryRole}</li>
                <li>Active staff coverage: {roleSummary.staffCount}</li>
                <li>Permission scope is synced with the current account profile</li>
              </ul>
              <div style={{ display: 'grid', gap: 8 }}>
                {roleMembers.length ? roleMembers.map((member) => (
                  <div key={member.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{member.full_name ?? 'Staff member'}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{member.status ?? 'Unknown status'}</p>
                  </div>
                )) : <p style={{ margin: 0, color: '#6b7280' }}>No active staff members are available yet.</p>}
              </div>
            </div>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Media manager</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>Your workspace is currently tracking {mediaSummary.serviceCount} services and {mediaSummary.customerCount} customer profiles for shared business operations.</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>{mediaSummary.serviceCount} service records available</li>
                <li>{mediaSummary.customerCount} customer records available</li>
                <li>Media and document references can be extended from the same hub</li>
              </ul>
              <div style={{ display: 'grid', gap: 8 }}>
                {servicePreview.length ? servicePreview.map((service) => (
                  <div key={service.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{service.name ?? 'Service'}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{service.duration_minutes ? `${service.duration_minutes} min` : 'Service record'}</p>
                  </div>
                )) : <p style={{ margin: 0, color: '#6b7280' }}>No services are available yet.</p>}
                {customerPreview.length ? customerPreview.map((customer) => (
                  <div key={customer.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{customer.full_name ?? 'Customer'}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{customer.email ?? 'Customer record'}</p>
                  </div>
                )) : null}
              </div>
            </div>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>Activity timeline</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>There are {activitySummary.recentActivityCount} recent activity touchpoints across staff, customers, and services.</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>Latest event: {activitySummary.latestEvent}</li>
                <li>Recent updates are surfaced from the shared workspace data</li>
                <li>History can be expanded as more events are recorded</li>
              </ul>
              <div style={{ display: 'grid', gap: 8 }}>
                {activityItems.map((item) => (
                  <div key={item.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{item.title}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
