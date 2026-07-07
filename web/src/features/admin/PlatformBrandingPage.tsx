import { useEffect, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
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
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Branding Configurator</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>
          Configure business-level white-label mobile app branding.
        </p>
      </Card>

      <Card>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Business profile</span>
          <select
            value={selectedBusinessId}
            onChange={(event) => setSelectedBusinessId(event.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
          >
            <option value="">Select business...</option>
            {(profilesQuery.data ?? []).map((profile) => (
              <option key={profile.id} value={profile.business_id}>
                {profile.business_display_name} ({profile.flavor_key})
              </option>
            ))}
          </select>
        </label>
      </Card>

      {selectedBusinessId ? (
        <Card>
          <div style={{ display: 'grid', gap: 10 }}>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="color"
                value={form.primary_color}
                onChange={(event) => setForm((prev) => ({ ...prev, primary_color: event.target.value }))}
              />
              <input
                type="color"
                value={form.secondary_color}
                onChange={(event) => setForm((prev) => ({ ...prev, secondary_color: event.target.value }))}
              />
            </div>
            <Button
              onClick={() =>
                updateMutation.mutate({
                  app_name: form.app_name,
                  flavor_key: form.flavor_key,
                  logo: form.logo,
                  primary_color: form.primary_color,
                  secondary_color: form.secondary_color,
                })
              }
              disabled={updateMutation.isPending}
            >
              Save branding
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default PlatformBrandingPage;
