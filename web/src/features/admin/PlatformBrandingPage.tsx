import { useEffect, useState } from 'react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminPageHeader, AdminSection } from './AdminChrome';
import {
  usePlatformWhiteLabelProfileQuery,
  usePlatformWhiteLabelProfilesQuery,
  useUpdateWhiteLabelProfileMutation,
} from './adminHooks';

export function PlatformBrandingPage() {
  usePageMeta({ title: 'Branding — Platform Admin' });
  const profilesQuery = usePlatformWhiteLabelProfilesQuery();
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const profileQuery = usePlatformWhiteLabelProfileQuery(selectedBusinessId || undefined);
  const updateMutation = useUpdateWhiteLabelProfileMutation(selectedBusinessId);
  const [form, setForm] = useState({
    app_name: '',
    flavor_key: '',
    primary_color: '#0F6CBD',
    secondary_color: '#111827',
    logo: '',
  });

  const selectedProfile = profileQuery.data;

  useEffect(() => {
    if (!selectedProfile) return;
    setForm({
      app_name: selectedProfile.app_name,
      flavor_key: selectedProfile.flavor_key,
      primary_color: selectedProfile.branding.primary_color,
      secondary_color: selectedProfile.branding.secondary_color,
      logo: selectedProfile.branding.logo ?? '',
    });
  }, [selectedProfile]);

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Branding"
        description="Configure business-level white-label mobile app branding."
      />

      <AdminSection title="Select business">
        <div className="admin-form-grid">
          <select
            value={selectedBusinessId}
            onChange={(event) => setSelectedBusinessId(event.target.value)}
          >
            <option value="">Select business…</option>
            {(profilesQuery.data ?? []).map((profile) => (
              <option key={profile.id} value={profile.business_id}>
                {profile.business_display_name} ({profile.flavor_key})
              </option>
            ))}
          </select>
        </div>
      </AdminSection>

      {selectedBusinessId ? (
        <AdminSection title="White-label profile">
          <div className="admin-form-grid">
            <input
              value={form.app_name}
              onChange={(event) => setForm((prev) => ({ ...prev, app_name: event.target.value }))}
              placeholder="App name"
            />
            <input
              value={form.flavor_key}
              onChange={(event) => setForm((prev) => ({ ...prev, flavor_key: event.target.value }))}
              placeholder="Flavor key"
            />
            <input
              value={form.logo}
              onChange={(event) => setForm((prev) => ({ ...prev, logo: event.target.value }))}
              placeholder="Logo URL"
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>
                Primary
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, primary_color: event.target.value }))
                  }
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>
                Secondary
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, secondary_color: event.target.value }))
                  }
                />
              </label>
              <div
                style={{
                  marginLeft: 'auto',
                  width: 120,
                  height: 56,
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${form.primary_color}, ${form.secondary_color})`,
                  boxShadow: '0 8px 20px rgba(15,22,35,0.12)',
                }}
              />
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  app_name: form.app_name,
                  flavor_key: form.flavor_key,
                  logo: form.logo,
                  primary_color: form.primary_color,
                  secondary_color: form.secondary_color,
                })
              }
            >
              {updateMutation.isPending ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </AdminSection>
      ) : (
        <AdminSection>
          <AdminEmpty>Select a business to edit its white-label branding.</AdminEmpty>
        </AdminSection>
      )}
    </div>
  );
}

export default PlatformBrandingPage;
