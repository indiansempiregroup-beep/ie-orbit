import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  AdminTable,
} from './AdminChrome';
import { usePlatformAuthSettingsQuery, useUpdatePlatformAuthSettingsMutation } from './adminHooks';

export function PlatformAuthSettingsPage() {
  usePageMeta({ title: 'WhatsApp & auth — Platform Admin' });
  const settingsQuery = usePlatformAuthSettingsQuery();
  const updateMutation = useUpdatePlatformAuthSettingsMutation();

  const [tenantSlug, setTenantSlug] = useState('');
  const [businessCode, setBusinessCode] = useState('');
  const [reason, setReason] = useState('Configure ops WhatsApp OTP sender');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setTenantSlug(data.tenant_slug ?? '');
    setBusinessCode(data.business_code ?? '');
  }, [settingsQuery.data]);

  async function handleSave() {
    setMessage(null);
    try {
      await updateMutation.mutateAsync({
        tenant_slug: tenantSlug.trim() || null,
        business_code: businessCode.trim() || null,
        reason: reason.trim(),
      });
      setMessage('Auth settings saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save auth settings.');
    }
  }

  async function handleClear() {
    setTenantSlug('');
    setBusinessCode('');
    setMessage(null);
    try {
      await updateMutation.mutateAsync({
        tenant_slug: null,
        business_code: null,
        reason: reason.trim() || 'Clear ops WhatsApp OTP sender',
      });
      setMessage('Ops WhatsApp OTP sender cleared.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to clear auth settings.');
    }
  }

  const data = settingsQuery.data;
  const counts = data?.template_counts;
  const mapped = data?.catalog?.mapped ?? [];
  const unmapped = data?.catalog?.unmapped ?? [];

  return (
    <AdminPage>
      <AdminPageHeader
        title="WhatsApp & auth"
        description="Platform admin does not hold each shop’s Cloud API keys. Owners connect their own number in ops-mobile. This page picks which business sends ops sign-in codes, and shows the platform-owned event catalog."
      />

      {settingsQuery.error ? (
        <AdminSection>
          <p className="admin-page-desc" style={{ color: '#991b1b', margin: 0 }}>
            {settingsQuery.error.message}
          </p>
        </AdminSection>
      ) : null}

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Ops OTP sender"
          value={data?.business_name || 'Not set'}
          hint={data?.business_code ? `${data.tenant_slug} / ${data.business_code}` : 'Point this at a workspace that already has WhatsApp connected.'}
          icon={<MessageCircle size={16} />}
          tone={data?.business_id ? 'good' : 'warn'}
        />
        <AdminKpi
          label="Sender connection"
          value={data?.whatsapp_status_label || data?.whatsapp_status || 'Not configured'}
          hint={
            data?.last_error ||
            data?.display_number ||
            'Connect Phone number ID, WABA ID, and token on that business in Settings → WhatsApp notifications.'
          }
          tone={
            data?.last_error
              ? 'danger'
              : data?.whatsapp_status === 'live'
                ? 'good'
                : data?.whatsapp_status === 'verification_required' || data?.whatsapp_status === 'paused'
                  ? 'warn'
                  : 'default'
          }
        />
        <AdminKpi
          label="Ops WhatsApp OTP"
          value={data?.ops_mobile_whatsapp_otp_enabled ? 'Enabled' : 'Disabled'}
          hint="On when the sender is live (or templates pending) and sending is not paused."
          tone={data?.ops_mobile_whatsapp_otp_enabled ? 'good' : 'warn'}
        />
        <AdminKpi
          label="Catalog templates"
          value={counts ? `${counts.approved}/${counts.total}` : mapped.length}
          hint={counts ? `${counts.pending} pending · ${counts.rejected} rejected on the sender WABA` : 'Platform-owned Meta templates'}
        />
      </div>

      <AdminSection
        title="Ops WhatsApp OTP sender"
        description="Sign-in codes for ops-mobile use this business’s WhatsApp Cloud API. Customer booking and order alerts use each shop’s own connection — they are not sent from here."
      >
        <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <AdminField label="Tenant slug" hint="Workspace slug, e.g. ie-orbit">
            <input
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="e.g. ie-orbit"
              autoComplete="off"
            />
          </AdminField>
          <AdminField label="Business code" hint="Business code inside that tenant">
            <input
              value={businessCode}
              onChange={(e) => setBusinessCode(e.target.value)}
              placeholder="e.g. platform"
              autoComplete="off"
            />
          </AdminField>
          <AdminField label="Audit reason">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </AdminField>
          {message ? <p role="status">{message}</p> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => void handleSave()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => void handleClear()} disabled={updateMutation.isPending}>
              Clear sender
            </Button>
          </div>
        </div>
      </AdminSection>

      <AdminSection
        title="Platform event catalog"
        description="These mappings are code-owned. Owners sync them to their Meta account and can only enable or disable approved templates. They cannot remap an event to a different Meta name."
      >
        {mapped.length ? (
          <AdminTable columns={['Event', 'Template', 'Meta name', 'Audience']}>
            {mapped.map((row) => (
              <tr key={`${row.event_type}-${row.whatsapp_template_code}`}>
                <td>
                  <div>{row.title}</div>
                  <div className="admin-table__muted">
                    {row.event_type} · {row.group}
                  </div>
                </td>
                <td>{row.whatsapp_template_code}</td>
                <td>
                  <code>{row.meta_name}</code>
                </td>
                <td>
                  <AdminStatus status={row.audience} />
                </td>
              </tr>
            ))}
          </AdminTable>
        ) : (
          <AdminEmpty>Loading catalog…</AdminEmpty>
        )}
      </AdminSection>

      {unmapped.length ? (
        <AdminSection
          title="Email / in-app only"
          description="These events have no WhatsApp template in phase 1."
        >
          <ul className="admin-page-desc" style={{ margin: 0, paddingLeft: 20 }}>
            {unmapped.map((row) => (
              <li key={`${row.event_type}-${row.audience}`}>
                {row.event_type} ({row.audience}) — {row.note}
              </li>
            ))}
          </ul>
        </AdminSection>
      ) : null}
    </AdminPage>
  );
}
