import { useEffect, useState } from 'react';
import type { CustomerAppState, PlatformTenantBusiness } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { AdminEmpty, AdminField, AdminSection, AdminStatus } from './AdminChrome';
import { usePlatformCustomerAppQuery } from './adminHooks';

function Chip({ label, done }: { label: string; done: boolean }) {
  return (
    <span className={`admin-chip${done ? ' is-active' : ''}`} style={{ cursor: 'default' }}>
      {done ? '✓ ' : ''}
      {label}
    </span>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="admin-list-row admin-list-row--static" style={{ alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="admin-list-row__title">{label}</div>
        <div className="admin-list-row__meta" style={{ wordBreak: 'break-all' }}>
          {value}
        </div>
      </div>
      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function BuildCard({
  title,
  track,
  data,
}: {
  title: string;
  track: 'preview' | 'production';
  data: Record<string, unknown> | undefined;
}) {
  const status = String(data?.status || '—');
  const url = String(data?.url || '');
  const apkUrl = String(data?.apk_url || '');
  const versionName = String(data?.version_name || '');
  const versionCode = data?.version_code;
  const error = String(data?.error || '');
  return (
    <div className="admin-product-billing">
      <div className="admin-business-card__head">
        <strong>{title}</strong>
        <AdminStatus status={status} />
      </div>
      <div className="admin-list-row__meta" style={{ marginBottom: 8 }}>
        {versionName
          ? `Version ${versionName}${versionCode != null ? ` (${versionCode})` : ''}`
          : 'No version recorded yet'}
      </div>
      {error ? <p className="admin-message">{error}</p> : null}
      <div className="admin-action-bar" style={{ marginTop: 0 }}>
        {url ? (
          <a className="admin-btn admin-btn--primary" href={url} target="_blank" rel="noreferrer">
            Open Expo build
          </a>
        ) : null}
        {apkUrl ? (
          <a className="admin-btn admin-btn--secondary" href={apkUrl} target="_blank" rel="noreferrer">
            {track === 'preview' ? 'Download APK' : 'Download AAB'}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerAppPanel({ businesses }: { businesses: PlatformTenantBusiness[] }) {
  const client = useApiClient();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '');
  const query = usePlatformCustomerAppQuery(businessId || undefined);
  const state = query.data as CustomerAppState | undefined;
  const recipe = state?.recipe;
  const checklist = state?.checklist;

  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [playSha1, setPlaySha1] = useState('');
  const [bump, setBump] = useState<'patch' | 'minor' | 'major'>('patch');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!businesses.some((row) => row.id === businessId)) {
      setBusinessId(businesses[0]?.id ?? '');
    }
  }, [businesses, businessId]);

  useEffect(() => {
    if (!recipe) return;
    setAppName(recipe.app_name || '');
    setPackageName(recipe.bundle_id_android || '');
    setGoogleClientId(recipe.google_oauth_android_client_id || '');
    setPlaySha1(recipe.play_signing_sha1 || '');
  }, [recipe]);

  async function run(label: string, fn: () => Promise<{ data?: CustomerAppState & { ok?: boolean; error?: string } }>) {
    if (!businessId) return;
    setBusy(label);
    setMessage(null);
    try {
      const result = await fn();
      const payload = result.data;
      if (payload && payload.ok === false && payload.error) {
        setMessage(payload.error);
      } else {
        setMessage(`${label} succeeded`);
      }
      await query.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (!businesses.length) {
    return (
      <AdminSection title="Customer app">
        <AdminEmpty>No businesses on this tenant.</AdminEmpty>
      </AdminSection>
    );
  }

  return (
    <>
      <AdminSection
        title="Customer app"
        description="Setup once, then build a preview APK or a Play Store AAB. Expo build links appear here when finished."
      >
        {businesses.length > 1 ? (
          <AdminField label="Business">
            <select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.display_name} ({business.business_code})
                </option>
              ))}
            </select>
          </AdminField>
        ) : null}

        {query.isLoading ? <AdminEmpty>Loading customer app…</AdminEmpty> : null}
        {query.isError ? (
          <AdminEmpty>Could not load customer app. Confirm you are signed in as a platform admin.</AdminEmpty>
        ) : null}

        {checklist ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{checklist.headline}</p>
            <div className="admin-chip-row">
              <Chip label="White-label" done={checklist.white_label} />
              <Chip label="Google Sign-In" done={checklist.google_sign_in} />
              <Chip label="Firebase" done={checklist.firebase} />
              <Chip label="Preview APK" done={checklist.preview_apk} />
              <Chip label="Store AAB" done={checklist.store_aab} />
              <Chip label="Submitted" done={checklist.submitted} />
              <Chip label="Live" done={checklist.live} />
            </div>
          </div>
        ) : null}

        {message ? (
          <p className={`admin-message ${message.includes('succeeded') ? 'admin-message--ok' : ''}`}>{message}</p>
        ) : null}
        {busy ? <p className="admin-message">Running: {busy}…</p> : null}
      </AdminSection>

      {recipe ? (
        <>
          <AdminSection title="Setup" description="Defaults come from the tenant. Override app name or package only if needed.">
            <div className="admin-form-grid">
              <AdminField label="App name (home screen)">
                <input value={appName} onChange={(e) => setAppName(e.target.value)} />
              </AdminField>
              <AdminField label="Android package">
                <input value={packageName} onChange={(e) => setPackageName(e.target.value)} />
              </AdminField>
              <AdminField
                label="Google Android OAuth client ID"
                hint="Create in Google Cloud (package + EAS SHA-1), then paste here."
              >
                <input
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="….apps.googleusercontent.com"
                />
              </AdminField>
              <AdminField
                label="Play App Signing SHA-1 (go-live)"
                hint="From Play Console after the app exists. Needed so Google Sign-In works on Play builds."
              >
                <input
                  value={playSha1}
                  onChange={(e) => setPlaySha1(e.target.value)}
                  placeholder="AA:BB:…"
                />
              </AdminField>
              <div className="admin-action-bar">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run('Save setup', () =>
                      client.platform.updateCustomerApp(businessId, {
                        app_name: appName,
                        bundle_id_android: packageName,
                        bundle_id_ios: packageName,
                        google_oauth_android_client_id: googleClientId,
                        play_signing_sha1: playSha1,
                      }),
                    )
                  }
                >
                  Save setup
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={Boolean(busy) || !packageName}
                  title={!packageName ? 'Set package first' : undefined}
                  onClick={() => run('Create Firebase app', () => client.platform.provisionCustomerAppFirebase(businessId))}
                >
                  {recipe.has_google_services_json ? 'Refresh Firebase app' : 'Create Firebase app'}
                </button>
              </div>
            </div>
          </AdminSection>

          <AdminSection title="Preview" description="Internal APK for sideload against the live API (test ads on).">
            <div className="admin-action-bar">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={Boolean(busy) || !checklist?.ready_for_preview}
                title={
                  checklist?.ready_for_preview
                    ? undefined
                    : 'Complete white-label, Google client, and Firebase first'
                }
                onClick={() =>
                  run('Build preview APK', () =>
                    client.platform.startCustomerAppBuild(businessId, { track: 'preview', bump }),
                  )
                }
              >
                Build preview APK
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={Boolean(busy)}
                onClick={() => run('Refresh preview status', () => client.platform.customerAppBuildStatus(businessId, 'preview'))}
              >
                Refresh status
              </button>
            </div>
            <BuildCard
              title="Latest preview"
              track="preview"
              data={recipe.preview as Record<string, unknown> | undefined}
            />
          </AdminSection>

          <AdminSection
            title="Go live"
            description="Store AAB for Play. Add Play signing SHA-1 before customers use Google Sign-In from Play."
          >
            <div className="admin-billing-grid" style={{ marginBottom: 12 }}>
              <div>
                <span style={{ color: 'var(--muted-foreground)' }}>Live</span>
                <strong>
                  {(recipe.live as { version_name?: string } | undefined)?.version_name
                    ? `${(recipe.live as { version_name?: string }).version_name}`
                    : 'Not live'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted-foreground)' }}>Last store build</span>
                <strong>
                  {(recipe.production as { version_name?: string } | undefined)?.version_name || '—'}
                </strong>
              </div>
            </div>
            <AdminField label="Version bump for next store build">
              <select value={bump} onChange={(e) => setBump(e.target.value as 'patch' | 'minor' | 'major')}>
                <option value="patch">Patch (1.0.0 → 1.0.1)</option>
                <option value="minor">Minor (1.0.0 → 1.1.0)</option>
                <option value="major">Major (1.0.0 → 2.0.0)</option>
              </select>
            </AdminField>
            <div className="admin-action-bar">
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={Boolean(busy) || !checklist?.ready_for_preview}
                onClick={() =>
                  run('Build store AAB', () =>
                    client.platform.startCustomerAppBuild(businessId, { track: 'production', bump }),
                  )
                }
              >
                Build store AAB
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--secondary"
                disabled={Boolean(busy) || !checklist?.store_aab}
                onClick={() =>
                  run('Mark live', () => client.platform.updateCustomerApp(businessId, { mark_live: true }))
                }
              >
                Mark live on Play
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={Boolean(busy)}
                onClick={() =>
                  run('Refresh store status', () => client.platform.customerAppBuildStatus(businessId, 'production'))
                }
              >
                Refresh status
              </button>
            </div>
            <BuildCard
              title="Latest store build"
              track="production"
              data={recipe.production as Record<string, unknown> | undefined}
            />
            <p className="admin-list-row__meta" style={{ marginTop: 8 }}>
              Play submit from admin lands after EAS submit credentials are configured on the build worker. Until then,
              download the AAB from Expo and upload in Play Console.
            </p>
          </AdminSection>

          <AdminSection title="Recipe" description="Copy values for Google Cloud / debugging.">
            <div className="admin-list">
              <CopyRow label="Flavor key" value={recipe.flavor_key} />
              <CopyRow label="Package" value={recipe.bundle_id_android || ''} />
              <CopyRow label="Bootstrap URL" value={recipe.bootstrap_url} />
              <CopyRow label="EAS project" value={recipe.eas_project_id} />
              <CopyRow label="EAS SHA-1" value={recipe.eas_android_sha1} />
              <CopyRow label="Firebase project" value={recipe.firebase_project_id} />
              <CopyRow label="Google Cloud OAuth project" value={recipe.google_cloud_oauth_project} />
              <CopyRow label="Web OAuth client" value={recipe.web_oauth_client_id} />
              <CopyRow label="Business ID" value={recipe.business_id} />
            </div>
          </AdminSection>
        </>
      ) : null}
    </>
  );
}

export default CustomerAppPanel;
