import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useBusinessProfileQuery } from './businessSettingsHooks';
import { useProfileDetails } from '../profile/profileHooks';
import { useCustomerList, useServiceList, useStaffList } from '../management/managementHooks';
import { BusinessSetupPanel } from './BusinessSetupPanel';
import { useBusinessListQuery } from './businessSettingsHooks';
import { BillingPlanFoundation } from './BillingPlanFoundation';
import { formatUserRole } from '../../utils/roles';

export function SettingsPage() {
  const { t } = useTranslation();
  const profile = useProfileDetails();
  const businessQuery = useBusinessProfileQuery();
  const businessListQuery = useBusinessListQuery();
  const customersQuery = useCustomerList();
  const servicesQuery = useServiceList();
  const staffQuery = useStaffList();

  const businessData = businessQuery.data;
  const user = profile.user;

  const settingsSummary = useMemo(
    () => [
      { label: t('common.business'), value: businessData?.display_name ?? businessData?.business_name ?? t('settings.overviewPage.unavailable') },
      { label: t('settings.overviewPage.businessStatus'), value: businessData?.status ?? t('settings.overviewPage.unavailable') },
      { label: t('common.currency'), value: businessData?.currency ?? 'USD' },
      { label: t('common.timezone'), value: businessData?.timezone ?? 'UTC' },
      {
        label: t('settings.overviewPage.notificationPrefs'),
        value: user?.notification_preferences ? t('settings.overviewPage.configured') : t('settings.overviewPage.notConfigured'),
      },
    ],
    [businessData, user?.notification_preferences, t],
  );

  const roleSummary = useMemo(() => {
    const roles = user?.roles ?? [];
    return {
      primaryRole: formatUserRole(roles),
      roleCount: roles.length || 0,
      staffCount: staffQuery.data?.filter((member) => member.status === 'active').length ?? 0,
    };
  }, [staffQuery.data, user?.roles]);

  const mediaSummary = useMemo(() => ({
    serviceCount: servicesQuery.data?.length ?? 0,
    customerCount: customersQuery.data?.length ?? 0,
  }), [customersQuery.data, servicesQuery.data]);

  const activitySummary = useMemo(() => ({
    recentActivityCount: Math.max(1, (customersQuery.data?.length ?? 0) + (staffQuery.data?.length ?? 0) + (servicesQuery.data?.length ?? 0)),
    latestEvent: staffQuery.data?.[0]?.status ?? t('settings.overviewPage.noRecentEvents'),
  }), [customersQuery.data, servicesQuery.data, staffQuery.data, t]);

  const roleMembers = useMemo(() => (staffQuery.data ?? []).filter((member) => member.status === 'active').slice(0, 4), [staffQuery.data]);
  const servicePreview = useMemo(() => (servicesQuery.data ?? []).slice(0, 4), [servicesQuery.data]);
  const customerPreview = useMemo(() => (customersQuery.data ?? []).slice(0, 4), [customersQuery.data]);
  const activityItems = useMemo(() => {
    const items = [
      ...(staffQuery.data ?? []).slice(0, 2).map((member) => ({
        id: `staff-${member.id}`,
        title: member.full_name ?? t('settings.overviewPage.staffMember'),
        detail: member.status ?? t('settings.overviewPage.statusUnavailable'),
      })),
      ...(servicesQuery.data ?? []).slice(0, 2).map((service) => ({
        id: `service-${service.id}`,
        title: service.name ?? t('settings.overviewPage.service'),
        detail: service.duration_minutes
          ? t('settings.overviewPage.minutesShort', { count: service.duration_minutes })
          : t('settings.overviewPage.serviceRecord'),
      })),
      ...(customersQuery.data ?? []).slice(0, 2).map((customer) => ({
        id: `customer-${customer.id}`,
        title: customer.full_name ?? t('settings.overviewPage.customer'),
        detail: customer.email ?? t('settings.overviewPage.customerRecord'),
      })),
    ];
    return items.slice(0, 6);
  }, [customersQuery.data, servicesQuery.data, staffQuery.data, t]);

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, 0.75fr)' }}>
          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>{t('settings.overviewPage.kicker')}</p>
                <h2 style={{ margin: '8px 0 0', fontSize: 24, lineHeight: 1.2 }}>{t('settings.overviewPage.title')}</h2>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{t('settings.overviewPage.lead')}</p>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {settingsSummary.map((item) => (
                  <div key={item.label} style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                    <strong>{item.label}</strong>
                    <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/settings/business">
                  <Button variant="primary">{t('settings.overviewPage.openBusinessProfile')}</Button>
                </Link>
                <Link to="/settings/business/edit">
                  <Button variant="ghost">{t('settings.overviewPage.editBusinessProfile')}</Button>
                </Link>
                <Link to="/profile/edit">
                  <Button variant="ghost">{t('settings.overviewPage.editPersonalProfile')}</Button>
                </Link>
              </div>
            </div>
          </Card>

          <Card style={{ padding: 22 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>{t('settings.overviewPage.personalKicker')}</p>
                <h2 style={{ margin: '8px 0 0', fontSize: 20, lineHeight: 1.2 }}>{user?.full_name ?? t('settings.overviewPage.yourAccount')}</h2>
                <p style={{ margin: '8px 0 0', color: '#6b7280' }}>{user?.email ?? t('settings.overviewPage.noEmail')}</p>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/profile">
                  <Button variant="ghost">{t('settings.overviewPage.viewProfile')}</Button>
                </Link>
                <Link to="/profile/edit">
                  <Button variant="primary">{t('settings.overviewPage.editProfile')}</Button>
                </Link>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <strong>{t('settings.overviewPage.role')}</strong>
                  <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{user?.roles?.join(', ') ?? t('settings.overviewPage.noRoles')}</p>
                </div>
                <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                  <strong>{t('settings.overviewPage.permissions')}</strong>
                  <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{user?.permissions?.join(', ') ?? t('settings.overviewPage.noPermissions')}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <BusinessSetupPanel show={!businessListQuery.isLoading && (businessListQuery.data?.length ?? 0) === 0} />

        <BillingPlanFoundation />

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('settings.overviewPage.roleMgmtTitle')}</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>{t('settings.overviewPage.roleMgmtBody', { roles: roleSummary.roleCount, staff: roleSummary.staffCount })}</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>{t('settings.overviewPage.primaryRole', { role: roleSummary.primaryRole })}</li>
                <li>{t('settings.overviewPage.activeStaffCoverage', { count: roleSummary.staffCount })}</li>
                <li>{t('settings.overviewPage.permissionScope')}</li>
              </ul>
              <div style={{ display: 'grid', gap: 8 }}>
                {roleMembers.length ? roleMembers.map((member) => (
                  <div key={member.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{member.full_name ?? t('settings.overviewPage.staffMember')}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{member.status ?? t('settings.overviewPage.unknownStatus')}</p>
                  </div>
                )) : <p style={{ margin: 0, color: '#6b7280' }}>{t('settings.overviewPage.noActiveStaff')}</p>}
              </div>
            </div>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('settings.overviewPage.mediaTitle')}</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>{t('settings.overviewPage.mediaBody', { services: mediaSummary.serviceCount, customers: mediaSummary.customerCount })}</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>{t('settings.overviewPage.serviceRecordsAvailable', { count: mediaSummary.serviceCount })}</li>
                <li>{t('settings.overviewPage.customerRecordsAvailable', { count: mediaSummary.customerCount })}</li>
                <li>{t('settings.overviewPage.mediaExtend')}</li>
              </ul>
              <div style={{ display: 'grid', gap: 8 }}>
                {servicePreview.length ? servicePreview.map((service) => (
                  <div key={service.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{service.name ?? t('settings.overviewPage.service')}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{service.duration_minutes ? t('settings.overviewPage.minutesShort', { count: service.duration_minutes }) : t('settings.overviewPage.serviceRecord')}</p>
                  </div>
                )) : <p style={{ margin: 0, color: '#6b7280' }}>{t('settings.overviewPage.noServices')}</p>}
                {customerPreview.length ? customerPreview.map((customer) => (
                  <div key={customer.id} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <strong>{customer.full_name ?? t('settings.overviewPage.customer')}</strong>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{customer.email ?? t('settings.overviewPage.customerRecord')}</p>
                  </div>
                )) : null}
              </div>
            </div>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('settings.overviewPage.activityTitle')}</h2>
            <p style={{ marginTop: 12, color: '#6b7280' }}>{t('settings.overviewPage.activityBody', { count: activitySummary.recentActivityCount })}</p>
            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', display: 'grid', gap: 8 }}>
                <li>{t('settings.overviewPage.latestEvent', { event: activitySummary.latestEvent })}</li>
                <li>{t('settings.overviewPage.activityRecent')}</li>
                <li>{t('settings.overviewPage.activityHistory')}</li>
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
