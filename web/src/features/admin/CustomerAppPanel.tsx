import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerAppChecklist, CustomerAppState, PlatformTenantBusiness } from '@ie-orbit/sdk';
import { LogoUploadField } from '../../components/LogoUploadField';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { resolveMediaAssetUrl } from '../../lib/mediaUrl';
import { AdminEmpty, AdminField, AdminSection, AdminStatus } from './AdminChrome';
import { usePlatformCustomerAppQuery } from './adminHooks';

const ACTION_OK: Record<string, string> = {
  'Save brand & setup': 'Brand identity saved.',
  'Create Firebase app': 'Firebase Android app is ready. google-services.json is saved on this tenant.',
  'Clear app icon override': 'App icon override cleared.',
  'Build preview APK': 'Preview APK build started.',
  'Refresh preview status': 'Preview status updated.',
  'Build store AAB': 'Store AAB build started.',
  'Mark live': 'Marked live on Play.',
  'Refresh store status': 'Store status updated.',
};

type ActionNotice = {
  tone: 'ok' | 'error' | 'busy';
  title: string;
  detail?: string;
};

function payloadActionError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { ok?: boolean; error?: unknown };
  if (row.ok !== false) return null;
  return typeof row.error === 'string' && row.error.trim() ? row.error.trim() : 'The request did not complete.';
}

function ActionAlert({ notice }: { notice: ActionNotice | null }) {
  if (!notice) return null;
  return (
    <div
      className={`admin-action-alert admin-action-alert--${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <strong>{notice.title}</strong>
      {notice.detail ? <p>{notice.detail}</p> : null}
    </div>
  );
}

const PROGRESS_STEPS: Array<{
  key: keyof Pick<
    CustomerAppChecklist,
    'white_label' | 'google_sign_in' | 'firebase' | 'preview_apk' | 'store_aab' | 'live'
  >;
  label: string;
  hint: string;
}> = [
  { key: 'white_label', label: 'Brand', hint: 'Name, colors, logo' },
  { key: 'google_sign_in', label: 'Google', hint: 'OAuth client' },
  { key: 'firebase', label: 'Firebase', hint: 'google-services.json' },
  { key: 'preview_apk', label: 'Preview', hint: 'Sideload APK' },
  { key: 'store_aab', label: 'Store', hint: 'Play AAB' },
  { key: 'live', label: 'Live', hint: 'Published' },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'APP';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="tenant-copy-tile">
      <div>
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
  const status = String(data?.status || 'idle');
  const url = String(data?.url || '');
  const apkUrl = String(data?.apk_url || '');
  const versionName = String(data?.version_name || '');
  const versionCode = data?.version_code;
  const error = String(data?.error || '');
  const running = status === 'queued' || status === 'in_progress';
  return (
    <div className={`admin-build-card tenant-build-card tenant-build-card--${track}${running ? ' is-running' : ''}`}>
      <div className="admin-business-card__head">
        <div>
          <p className="tenant-build-card__track">{track === 'preview' ? 'Sideload' : 'Play Store'}</p>
          <strong>{title}</strong>
          <div className="admin-list-row__meta">
            {versionName
              ? `Version ${versionName}${versionCode != null ? ` (${versionCode})` : ''}`
              : 'No version recorded yet'}
          </div>
        </div>
        <AdminStatus status={status} />
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

function IconPlatePreview({
  logo,
  primary,
  appName,
  overrideUrl,
  mode,
  background,
  padding,
}: {
  logo: string;
  primary: string;
  appName: string;
  overrideUrl: string;
  mode: 'plate' | 'as-is';
  background: string;
  padding: number;
}) {
  const [failed, setFailed] = useState(false);
  const hasOverride = Boolean(overrideUrl?.trim());
  const asIs = hasOverride || mode === 'as-is';
  const src = resolveMediaAssetUrl(hasOverride ? overrideUrl : logo);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showLogo = Boolean(src) && !failed;
  const markPct = Math.round((1 - padding * 2) * 100);
  return (
    <div className="admin-icon-plate">
      <div
        className={`admin-icon-plate__tile${asIs ? ' is-override' : ''}`}
        style={asIs ? undefined : { background: background || primary }}
      >
        {showLogo ? (
          <img
            src={src!}
            alt=""
            onError={() => setFailed(true)}
            style={asIs ? undefined : { width: `${markPct}%`, height: `${markPct}%` }}
          />
        ) : (
          <span>{initials(appName)}</span>
        )}
      </div>
      <p>
        {hasOverride
          ? 'Your uploaded app icon (as-is).'
          : asIs
            ? 'Full icon mode — logo fills the tile.'
            : 'Auto plate — logo on your icon background.'}
      </p>
    </div>
  );
}

function PhonePreview({
  appName,
  logo,
  primary,
  secondary,
  headline,
}: {
  appName: string;
  logo: string;
  primary: string;
  secondary: string;
  headline: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = resolveMediaAssetUrl(logo);
  useEffect(() => {
    setLogoFailed(false);
  }, [logoSrc]);
  const showLogo = Boolean(logoSrc) && !logoFailed;
  return (
    <aside className="admin-phone-preview">
      <div className="admin-phone">
        <div className="admin-phone__bezel">
          <div className="admin-phone__notch" />
          <div
            className="admin-phone__screen"
            style={{ background: `linear-gradient(165deg, ${primary} 0%, ${secondary} 78%)` }}
          >
            <div className="admin-phone__status">
              <span>9:41</span>
              <span>●●●</span>
            </div>
            {showLogo ? (
              <img
                className="admin-phone__logo"
                src={logoSrc!}
                alt=""
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="admin-phone__mark" aria-hidden>
                {initials(appName)}
              </div>
            )}
            <strong className="admin-phone__name">{appName || 'Customer app'}</strong>
            <p className="admin-phone__tagline">Book · Shop · Rewards</p>
            <div className="admin-phone__cta" style={{ color: primary }}>
              Get started
            </div>
            <p className="admin-phone__stage">{headline}</p>
          </div>
        </div>
      </div>
      <p className="admin-phone-preview__caption">Live preview of splash colors, logo, and home-screen name.</p>
    </aside>
  );
}

export function CustomerAppPanel({ businesses }: { businesses: PlatformTenantBusiness[] }) {
  const client = useApiClient();
  const snackbar = useSnackbar();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '');
  const query = usePlatformCustomerAppQuery(businessId || undefined);
  const state = query.data as CustomerAppState | undefined;
  const recipe = state?.recipe;
  const checklist = state?.checklist;
  const branding = state?.profile?.branding;

  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [flavorKey, setFlavorKey] = useState('');
  const [appSlug, setAppSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [appIconUrl, setAppIconUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [appIconFile, setAppIconFile] = useState<File | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [iconMode, setIconMode] = useState<'plate' | 'as-is'>('plate');
  const [iconBackground, setIconBackground] = useState('#0F6CBD');
  const [iconPadding, setIconPadding] = useState(0.22);
  const [splashBackground, setSplashBackground] = useState('#0F6CBD');
  const [primaryColor, setPrimaryColor] = useState('#0F6CBD');
  const [secondaryColor, setSecondaryColor] = useState('#111827');
  const [googleClientId, setGoogleClientId] = useState('');
  const [playSha1, setPlaySha1] = useState('');
  const [bump, setBump] = useState<'patch' | 'minor' | 'major'>('patch');
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionNotice | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const logoPreviewUrl = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    return logo;
  }, [logoFile, logo]);

  const appIconPreviewUrl = useMemo(() => {
    if (appIconFile) return URL.createObjectURL(appIconFile);
    return appIconUrl;
  }, [appIconFile, appIconUrl]);

  useEffect(() => {
    if (!logoFile) return undefined;
    const url = logoPreviewUrl;
    return () => URL.revokeObjectURL(url);
  }, [logoFile, logoPreviewUrl]);

  useEffect(() => {
    if (!appIconFile) return undefined;
    const url = appIconPreviewUrl;
    return () => URL.revokeObjectURL(url);
  }, [appIconFile, appIconPreviewUrl]);

  useEffect(() => {
    if (!businesses.some((row) => row.id === businessId)) {
      setBusinessId(businesses[0]?.id ?? '');
    }
  }, [businesses, businessId]);

  useEffect(() => {
    if (!recipe) return;
    setAppName(recipe.app_name || '');
    setPackageName(recipe.bundle_id_android || '');
    setFlavorKey(recipe.flavor_key || '');
    setAppSlug(recipe.app_slug || '');
    setLogo(recipe.logo || branding?.logo || '');
    setAppIconUrl(recipe.app_icon_url || '');
    setLogoFile(null);
    setAppIconFile(null);
    setAdvancedOpen(Boolean(recipe.app_icon_url));
    const settings = recipe.icon_settings;
    const primary = recipe.primary_color || branding?.primary_color || '#0F6CBD';
    setIconMode(settings?.mode === 'as-is' ? 'as-is' : 'plate');
    setIconBackground(settings?.background || primary);
    setIconPadding(typeof settings?.padding === 'number' ? settings.padding : 0.22);
    setSplashBackground(settings?.splash_background || primary);
    setPrimaryColor(primary);
    setSecondaryColor(recipe.secondary_color || branding?.secondary_color || '#111827');
    setGoogleClientId(recipe.google_oauth_android_client_id || '');
    setPlaySha1(recipe.play_signing_sha1 || '');
  }, [recipe, branding]);

  useEffect(() => {
    if (!feedback && !busy) return;
    feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [feedback, busy]);

  async function run(label: string, fn: () => Promise<{ data?: CustomerAppState & { ok?: boolean; error?: string } }>) {
    if (!businessId) {
      const detail = 'Select a business first.';
      setFeedback({ tone: 'error', title: `${label} failed`, detail });
      snackbar.push(detail, 'error', 10000);
      return false;
    }
    setBusy(label);
    setFeedback(null);
    try {
      const result = await fn();
      const failed = payloadActionError(result.data);
      if (failed) {
        setFeedback({ tone: 'error', title: `${label} failed`, detail: failed });
        snackbar.push(failed, 'error', 10000);
        return false;
      }
      const okText = ACTION_OK[label] ?? `${label} succeeded`;
      setFeedback({ tone: 'ok', title: okText });
      snackbar.push(okText, 'success');
      await query.refetch();
      return true;
    } catch (err) {
      const detail = getApiErrorMessage(err, `${label} failed`);
      setFeedback({ tone: 'error', title: `${label} failed`, detail });
      snackbar.push(detail, 'error', 10000);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveBrandAndSetup() {
    const saved = await run('Save brand & setup', async () => {
      if (logoFile) {
        await client.platform.uploadCustomerAppAsset(businessId, logoFile, 'logo');
      }
      if (appIconFile) {
        await client.platform.uploadCustomerAppAsset(businessId, appIconFile, 'app_icon');
      }
      return client.platform.updateCustomerApp(businessId, {
        app_name: appName,
        bundle_id_android: packageName,
        bundle_id_ios: packageName,
        flavor_key: flavorKey,
        app_slug: appSlug,
        ...(logoFile ? {} : { logo }),
        ...(appIconFile
          ? {}
          : {
              app_icon_url: appIconUrl,
            }),
        icon_mode: iconMode,
        icon_background: iconBackground,
        icon_padding: iconPadding,
        splash_background: splashBackground,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        white_label_enabled: true,
        google_oauth_android_client_id: googleClientId,
        play_signing_sha1: playSha1,
      });
    });
    if (saved) {
      setLogoFile(null);
      setAppIconFile(null);
    }
  }

  if (!businesses.length) {
    return (
      <AdminSection title="Brand & customer app">
        <AdminEmpty>No businesses on this tenant. Create one first, then brand and generate the APK here.</AdminEmpty>
      </AdminSection>
    );
  }

  return (
    <>
      <AdminSection
        className="tenant-studio-launch"
        title="Brand & customer app"
        description="Set the look, Google Sign-In, and Firebase on this tenant, then build a preview APK or Play Store AAB."
      >
        {businesses.length > 1 ? (
          <div className="tenant-chip-select" role="tablist" aria-label="Business">
            {businesses.map((business) => (
              <button
                key={business.id}
                type="button"
                role="tab"
                aria-selected={businessId === business.id}
                className={`tenant-chip-select__btn${businessId === business.id ? ' is-active' : ''}`}
                onClick={() => setBusinessId(business.id)}
              >
                {business.display_name}
                <span>{business.business_code}</span>
              </button>
            ))}
          </div>
        ) : null}

        {query.isLoading ? <AdminEmpty>Loading brand & customer app…</AdminEmpty> : null}
        {query.isError ? (
          <AdminEmpty>Could not load customer app. Confirm you are signed in as a platform admin.</AdminEmpty>
        ) : null}

        {checklist ? (
          <ol className="admin-progress tenant-progress">
            {PROGRESS_STEPS.map((step, index) => {
              const done = Boolean(checklist[step.key]);
              return (
                <li key={step.key} className={`admin-progress__step${done ? ' is-done' : ''}`}>
                  <span className="admin-progress__dot">{done ? '✓' : index + 1}</span>
                  <strong>{step.label}</strong>
                  <span>{step.hint}</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {checklist ? (
          <div className={`tenant-readiness${checklist.ready_for_preview ? ' is-ready' : ''}`}>
            <strong>{checklist.headline}</strong>
            <p>
              {checklist.ready_for_preview
                ? 'Ready to build a preview APK.'
                : 'Finish brand, Google, and Firebase first.'}
            </p>
          </div>
        ) : null}

        <ActionAlert
          notice={
            busy
              ? {
                  tone: 'busy',
                  title: `${busy}…`,
                  detail: busy.includes('Firebase')
                    ? 'Talking to Firebase. This can take up to a minute.'
                    : undefined,
                }
              : feedback
          }
        />
      </AdminSection>

      {recipe ? (
        <>
          <AdminSection
            title="Brand identity"
            description="Upload one logo. We build the store icon with padding on your primary color. Save before building."
          >
            <div className="admin-app-studio">
              <div className="admin-form-grid admin-form-grid--wide">
                <AdminField label="App name (home screen)">
                  <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Sunita Spa" />
                </AdminField>
                <LogoUploadField
                  value={logoFile}
                  onChange={setLogoFile}
                  currentLogoUrl={resolveMediaAssetUrl(logo)}
                  label="Business logo"
                  accentColor={primaryColor}
                  hint="Square PNG/WebP works best (at least 256×256). We generate the store icon and splash from this."
                  dropzoneTitle="Upload business logo"
                />
                <div className="admin-color-row">
                  <label className="admin-color-field">
                    <span>Primary</span>
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => {
                        const next = e.target.value;
                        setPrimaryColor(next);
                        if (iconBackground === primaryColor) setIconBackground(next);
                        if (splashBackground === primaryColor) setSplashBackground(next);
                      }}
                    />
                    <input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label className="admin-color-field">
                    <span>Secondary</span>
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                    />
                    <input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                </div>

                <div className="admin-icon-settings">
                  <div className="admin-icon-settings__head">
                    <strong>Icon &amp; logo background</strong>
                    <span>Controls how the store / home-screen icon is built from your logo.</span>
                  </div>
                  <div className="admin-icon-mode" role="group" aria-label="Icon style">
                    <button
                      type="button"
                      className={`admin-icon-mode__btn${iconMode === 'plate' && !appIconPreviewUrl ? ' is-active' : ''}`}
                      disabled={Boolean(appIconPreviewUrl)}
                      onClick={() => setIconMode('plate')}
                    >
                      Logo on background
                    </button>
                    <button
                      type="button"
                      className={`admin-icon-mode__btn${iconMode === 'as-is' || appIconPreviewUrl ? ' is-active' : ''}`}
                      onClick={() => setIconMode('as-is')}
                    >
                      Full icon
                    </button>
                  </div>
                  {appIconPreviewUrl ? (
                    <p className="admin-list-row__meta" style={{ margin: 0 }}>
                      App icon override is set — style is locked to full icon.
                    </p>
                  ) : null}
                  <div className="admin-color-row">
                    <label className="admin-color-field">
                      <span>Icon background</span>
                      <input
                        type="color"
                        value={iconBackground}
                        onChange={(e) => setIconBackground(e.target.value)}
                        disabled={Boolean(appIconPreviewUrl) || iconMode === 'as-is'}
                      />
                      <input
                        value={iconBackground}
                        onChange={(e) => setIconBackground(e.target.value)}
                        spellCheck={false}
                        disabled={Boolean(appIconPreviewUrl) || iconMode === 'as-is'}
                      />
                    </label>
                    <label className="admin-color-field">
                      <span>Splash background</span>
                      <input
                        type="color"
                        value={splashBackground}
                        onChange={(e) => setSplashBackground(e.target.value)}
                      />
                      <input
                        value={splashBackground}
                        onChange={(e) => setSplashBackground(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  {iconMode === 'plate' && !appIconPreviewUrl ? (
                    <label className="admin-icon-padding">
                      <span>
                        Logo size on icon
                        <em>{Math.round((1 - iconPadding * 2) * 100)}% of tile</em>
                      </span>
                      <input
                        type="range"
                        min={8}
                        max={36}
                        step={1}
                        value={Math.round(iconPadding * 100)}
                        onChange={(e) => setIconPadding(Number(e.target.value) / 100)}
                      />
                      <div className="admin-icon-padding__labels">
                        <span>Larger logo</span>
                        <span>More padding</span>
                      </div>
                    </label>
                  ) : null}
                  <div className="admin-chip-row" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={() => {
                        setIconMode('plate');
                        setIconBackground(primaryColor);
                        setSplashBackground(primaryColor);
                        setIconPadding(0.22);
                      }}
                    >
                      Reset icon defaults
                    </button>
                  </div>
                </div>

                <AdminField label="Android package">
                  <input value={packageName} onChange={(e) => setPackageName(e.target.value)} />
                </AdminField>
                <div className="admin-form-pair">
                  <AdminField label="Flavor key">
                    <input value={flavorKey} onChange={(e) => setFlavorKey(e.target.value)} />
                  </AdminField>
                  <AdminField label="App slug">
                    <input value={appSlug} onChange={(e) => setAppSlug(e.target.value)} />
                  </AdminField>
                </div>
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
                <details
                  className="admin-advanced"
                  open={advancedOpen}
                  onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary>Advanced · App icon override</summary>
                  <p className="admin-list-row__meta">
                    Only if the auto plate still looks wrong. Most tenants can skip this.
                  </p>
                  <LogoUploadField
                    value={appIconFile}
                    onChange={setAppIconFile}
                    currentLogoUrl={resolveMediaAssetUrl(appIconUrl)}
                    label="App icon override"
                    accentColor={primaryColor}
                    hint="Optional finished square icon (1024×1024 ideal). Used as-is — no brand-color plate."
                    dropzoneTitle="Upload app icon"
                  />
                  {appIconUrl && !appIconFile ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setAppIconUrl('');
                        void run('Clear app icon override', () =>
                          client.platform.updateCustomerApp(businessId, { app_icon_url: '' }),
                        );
                      }}
                    >
                      Clear override
                    </button>
                  ) : null}
                </details>
                <div ref={feedbackRef}>
                  <ActionAlert
                    notice={
                      busy
                        ? {
                            tone: 'busy',
                            title: `${busy}…`,
                            detail: busy.includes('Firebase')
                              ? 'Talking to Firebase. This can take up to a minute.'
                              : undefined,
                          }
                        : feedback
                    }
                  />
                </div>
                <div className="admin-action-bar">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={Boolean(busy)}
                    onClick={() => void saveBrandAndSetup()}
                  >
                    {busy === 'Save brand & setup' ? 'Saving…' : 'Save brand & setup'}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={Boolean(busy) || !packageName}
                    title={!packageName ? 'Set package first' : undefined}
                    onClick={() =>
                      void run('Create Firebase app', () => client.platform.provisionCustomerAppFirebase(businessId))
                    }
                  >
                    {busy === 'Create Firebase app'
                      ? recipe.has_google_services_json
                        ? 'Refreshing Firebase…'
                        : 'Creating Firebase app…'
                      : recipe.has_google_services_json
                        ? 'Refresh Firebase app'
                        : 'Create Firebase app'}
                  </button>
                </div>
                <p className={`admin-firebase-status${recipe.has_google_services_json ? ' is-ready' : ''}`}>
                  {recipe.has_google_services_json
                    ? `Firebase is linked${recipe.firebase_app_id ? ` (${recipe.firebase_app_id})` : ''}. Refresh if you changed the package or Play SHA-1.`
                    : 'Firebase app is not created yet. Save brand, then click Create Firebase app. You will see a success or error alert here.'}
                </p>
              </div>
              <div className="admin-preview-stack">
                <IconPlatePreview
                  logo={logoPreviewUrl}
                  primary={primaryColor}
                  appName={appName}
                  overrideUrl={appIconPreviewUrl}
                  mode={iconMode}
                  background={iconBackground}
                  padding={iconPadding}
                />
                <PhonePreview
                  appName={appName}
                  logo={logoPreviewUrl}
                  primary={splashBackground || primaryColor}
                  secondary={secondaryColor}
                  headline={checklist?.headline || 'Not ready'}
                />
              </div>
            </div>
          </AdminSection>

          <div className="tenant-build-grid">
            <AdminSection title="Preview" description="Internal APK for sideload against the live API (test ads on).">
              <div className="admin-action-bar">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={Boolean(busy) || !checklist?.ready_for_preview}
                  title={
                    checklist?.ready_for_preview
                      ? undefined
                      : 'Complete brand, Google client, and Firebase first'
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
              <div className="tenant-stat-grid" style={{ marginBottom: 12 }}>
                <div className="tenant-stat tenant-stat--accent">
                  <span>Live</span>
                  <strong>
                    {(recipe.live as { version_name?: string } | undefined)?.version_name
                      ? `${(recipe.live as { version_name?: string }).version_name}`
                      : 'Not live'}
                  </strong>
                </div>
                <div className="tenant-stat">
                  <span>Last store build</span>
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
          </div>

          <AdminSection title="Recipe" description="Copy values for Google Cloud / debugging.">
            <div className="tenant-copy-grid">
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
