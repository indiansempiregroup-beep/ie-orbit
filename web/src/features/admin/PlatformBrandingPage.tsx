import { useEffect, useMemo, useState } from 'react';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminField,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
} from './AdminChrome';
import {
  usePlatformWhiteLabelProfileQuery,
  usePlatformWhiteLabelProfilesQuery,
  useUpdateWhiteLabelProfileMutation,
} from './adminHooks';

export function PlatformBrandingPage() {
  usePageMeta({ title: 'Branding — Platform Admin' });
  const profilesQuery = usePlatformWhiteLabelProfilesQuery();
  const [query, setQuery] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const profileQuery = usePlatformWhiteLabelProfileQuery(selectedBusinessId || undefined);
  const updateMutation = useUpdateWhiteLabelProfileMutation(selectedBusinessId);
  const [form, setForm] = useState({
    app_name: '',
    flavor_key: '',
    primary_color: '#0F6CBD',
    secondary_color: '#111827',
    logo: '',
    white_label_enabled: false,
  });

  const profiles = useMemo(() => {
    const rows = Array.isArray(profilesQuery.data) ? profilesQuery.data : [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((profile) =>
      [profile.business_display_name, profile.tenant_slug, profile.flavor_key, profile.app_name]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [profilesQuery.data, query]);

  const selectedProfile = profileQuery.data;

  useEffect(() => {
    if (!selectedProfile) return;
    setForm({
      app_name: selectedProfile.app_name,
      flavor_key: selectedProfile.flavor_key,
      primary_color: selectedProfile.branding.primary_color,
      secondary_color: selectedProfile.branding.secondary_color,
      logo: selectedProfile.branding.logo ?? '',
      white_label_enabled: Boolean(selectedProfile.white_label_enabled),
    });
  }, [selectedProfile]);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Branding"
        description="White-label profiles are created for every business. Search, then set colors and a logo URL."
      />

      <div className="admin-split">
        <AdminSection title="Businesses">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search business, tenant, or flavor" />
          {profilesQuery.isLoading ? (
            <AdminEmpty>Loading businesses…</AdminEmpty>
          ) : profiles.length === 0 ? (
            <AdminEmpty>No businesses match. Create a tenant first — a profile is created automatically.</AdminEmpty>
          ) : (
            <div className="admin-list" style={{ marginTop: 12 }}>
              {profiles.map((profile) => (
                <AdminListRow
                  key={profile.id}
                  title={profile.business_display_name}
                  meta={`${profile.tenant_slug} · ${profile.flavor_key}`}
                  onClick={() => setSelectedBusinessId(profile.business_id)}
                  style={selectedBusinessId === profile.business_id ? { borderColor: 'var(--primary)' } : undefined}
                />
              ))}
            </div>
          )}
        </AdminSection>

        {selectedBusinessId ? (
          <AdminSection title="White-label profile">
            <div className="admin-form-grid">
              <AdminField label="App name">
                <input
                  value={form.app_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, app_name: event.target.value }))}
                />
              </AdminField>
              <AdminField label="Flavor key">
                <input
                  value={form.flavor_key}
                  onChange={(event) => setForm((prev) => ({ ...prev, flavor_key: event.target.value }))}
                />
              </AdminField>
              <AdminField label="Logo URL" hint="HTTPS URL to a PNG or SVG. Host the file, then paste the link.">
                <input
                  value={form.logo}
                  onChange={(event) => setForm((prev) => ({ ...prev, logo: event.target.value }))}
                  placeholder="https://…"
                />
              </AdminField>
              {form.logo ? (
                <img className="admin-logo-preview" src={form.logo} alt="Logo preview" />
              ) : null}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Primary
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(event) => setForm((prev) => ({ ...prev, primary_color: event.target.value }))}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Secondary
                  <input
                    type="color"
                    value={form.secondary_color}
                    onChange={(event) => setForm((prev) => ({ ...prev, secondary_color: event.target.value }))}
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
              <label className="admin-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.white_label_enabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, white_label_enabled: event.target.checked }))}
                />
                White-label enabled
              </label>
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
                    white_label_enabled: form.white_label_enabled,
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
    </AdminPage>
  );
}

export default PlatformBrandingPage;
