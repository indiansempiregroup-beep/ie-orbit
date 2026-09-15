import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { CustomerAppState, PlatformTenantBusiness } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadCustomerAppAsset } from '../../api/media';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Button } from '../../components/ui/Button';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

function Chip({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={[styles.chip, done ? styles.chipDone : null]}>
      <Text style={[styles.chipText, done ? styles.chipTextDone : null]}>
        {done ? '✓ ' : ''}
        {label}
      </Text>
    </View>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'APP';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function BuildLinks({
  title,
  data,
  track,
}: {
  title: string;
  track: 'preview' | 'production';
  data?: Record<string, unknown>;
}) {
  const status = String(data?.status || '—');
  const url = String(data?.url || '');
  const apkUrl = String(data?.apk_url || '');
  const versionName = String(data?.version_name || '');
  const error = String(data?.error || '');
  return (
    <View style={styles.buildCard}>
      <Text style={styles.businessName}>{title}</Text>
      <Text style={styles.meta}>
        {status}
        {versionName ? ` · ${versionName}` : ''}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {url ? (
        <Button
          label="Open Expo build"
          variant="secondary"
          fullWidth
          onPress={() => void Linking.openURL(url)}
        />
      ) : null}
      {apkUrl ? (
        <Button
          label={track === 'preview' ? 'Download APK' : 'Download AAB'}
          variant="ghost"
          fullWidth
          onPress={() => void Linking.openURL(apkUrl)}
        />
      ) : null}
    </View>
  );
}

export function CustomerAppSection({ businesses }: { businesses: PlatformTenantBusiness[] }) {
  const client = useOpsClient();
  const { token } = useAuth();
  const toast = useToast();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '');
  const [state, setState] = useState<CustomerAppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [logo, setLogo] = useState('');
  const [appIconUrl, setAppIconUrl] = useState('');
  const [logoAsset, setLogoAsset] = useState<ImagePickerAsset | null>(null);
  const [appIconAsset, setAppIconAsset] = useState<ImagePickerAsset | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#0F6CBD');
  const [secondaryColor, setSecondaryColor] = useState('#111827');
  const [iconMode, setIconMode] = useState<'plate' | 'as-is'>('plate');
  const [iconBackground, setIconBackground] = useState('#0F6CBD');
  const [iconPadding, setIconPadding] = useState(0.22);
  const [splashBackground, setSplashBackground] = useState('#0F6CBD');
  const [googleClientId, setGoogleClientId] = useState('');
  const [playSha1, setPlaySha1] = useState('');
  const [logoFailed, setLogoFailed] = useState(false);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    try {
      const response = await client.platform.customerApp(businessId);
      setState(response.data);
      const recipe = response.data.recipe;
      const branding = response.data.profile?.branding;
      setAppName(recipe.app_name || '');
      setPackageName(recipe.bundle_id_android || '');
      setLogo(recipe.logo || branding?.logo || '');
      setAppIconUrl(recipe.app_icon_url || '');
      setLogoAsset(null);
      setAppIconAsset(null);
      const primary = recipe.primary_color || branding?.primary_color || '#0F6CBD';
      const settings = recipe.icon_settings;
      setPrimaryColor(primary);
      setSecondaryColor(recipe.secondary_color || branding?.secondary_color || '#111827');
      setIconMode(settings?.mode === 'as-is' ? 'as-is' : 'plate');
      setIconBackground(settings?.background || primary);
      setIconPadding(typeof settings?.padding === 'number' ? settings.padding : 0.22);
      setSplashBackground(settings?.splash_background || primary);
      setGoogleClientId(recipe.google_oauth_android_client_id || '');
      setPlaySha1(recipe.play_signing_sha1 || '');
      setLogoFailed(false);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Failed to load customer app', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable enough; avoid reload loops
  }, [client, businessId]);

  useEffect(() => {
    if (!businesses.some((row) => row.id === businessId)) {
      setBusinessId(businesses[0]?.id ?? '');
    }
  }, [businesses, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<{ data: CustomerAppState & { ok?: boolean; error?: string } }>) {
    if (!client || !businessId) return;
    setBusy(label);
    try {
      const response = await fn();
      if (response.data.ok === false && response.data.error) {
        toast.push(response.data.error, 'error');
      } else {
        toast.push(`${label} succeeded`, 'success');
      }
      setState(response.data);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : `${label} failed`, 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!businesses.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.section}>Brand & customer app</Text>
        <Text style={styles.meta}>No businesses on this tenant.</Text>
      </View>
    );
  }

  const recipe = state?.recipe;
  const checklist = state?.checklist;
  const selected = businesses.find((row) => row.id === businessId) || businesses[0];
  const previewLogo = logoAsset?.uri || resolveMediaUrl(logo) || '';
  const showLogo = Boolean(previewLogo) && !logoFailed;
  const hasIconOverride = Boolean(appIconAsset || appIconUrl);
  const asIsIcon = hasIconOverride || iconMode === 'as-is';
  const iconPreview = appIconAsset?.uri || resolveMediaUrl(appIconUrl) || previewLogo;
  const markPct = Math.round((1 - iconPadding * 2) * 100);

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Brand & customer app</Text>
      <Text style={styles.meta}>
        Upload one logo, then tune icon background and size. Save before building.
      </Text>

      {businesses.length > 1 ? (
        <View style={styles.businessPicker}>
          {businesses.map((business) => (
            <Button
              key={business.id}
              label={business.display_name}
              variant={business.id === businessId ? 'primary' : 'ghost'}
              onPress={() => setBusinessId(business.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.meta}>
          {selected?.display_name} · {selected?.business_code}
        </Text>
      )}

      {loading && !state ? <ActivityIndicator color={colors.primary} /> : null}

      {checklist ? (
        <View style={styles.chipRow}>
          <Text style={styles.businessName}>{checklist.headline}</Text>
          <View style={styles.chips}>
            <Chip label="Brand" done={checklist.white_label} />
            <Chip label="Google" done={checklist.google_sign_in} />
            <Chip label="Firebase" done={checklist.firebase} />
            <Chip label="Preview" done={checklist.preview_apk} />
            <Chip label="Store" done={checklist.store_aab} />
            <Chip label="Live" done={checklist.live} />
          </View>
        </View>
      ) : null}

      <View style={styles.iconRow}>
        <View
          style={[
            styles.iconPlate,
            asIsIcon ? styles.iconPlateOverride : { backgroundColor: iconBackground || primaryColor },
          ]}
        >
          {iconPreview && !logoFailed ? (
            <Image
              source={{ uri: iconPreview }}
              style={
                asIsIcon
                  ? styles.iconMarkFull
                  : [styles.iconMark, { width: `${markPct}%`, height: `${markPct}%` }]
              }
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <Text style={styles.iconInitials}>{initials(appName)}</Text>
          )}
        </View>
        <Text style={styles.meta}>
          {hasIconOverride
            ? 'Your app icon (as-is)'
            : asIsIcon
              ? 'Full icon mode'
              : 'Logo on icon background'}
        </Text>
      </View>

      <View style={[styles.preview, { backgroundColor: splashBackground || primaryColor }]}>
        <View style={[styles.previewAccent, { backgroundColor: secondaryColor }]} />
        {showLogo ? (
          <Image source={{ uri: previewLogo }} style={styles.previewLogo} onError={() => setLogoFailed(true)} />
        ) : (
          <View style={styles.previewMark}>
            <Text style={styles.previewMarkText}>{initials(appName)}</Text>
          </View>
        )}
        <Text style={styles.previewName}>{appName || 'Customer app'}</Text>
        <Text style={styles.previewTag}>Book · Shop · Rewards</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>App name</Text>
        <TextInput style={styles.input} value={appName} onChangeText={setAppName} placeholderTextColor={colors.mutedForeground} />
        <ImagePickerButton
          label="Business logo"
          valueUri={logo}
          helperText="Square PNG/WebP works best. Store icon is auto-composed."
          onPicked={(asset) => {
            setLogoAsset(asset);
            setLogoFailed(false);
          }}
        />
        <Text style={styles.label}>Primary color</Text>
        <TextInput
          style={styles.input}
          value={primaryColor}
          onChangeText={(next) => {
            if (iconBackground === primaryColor) setIconBackground(next);
            if (splashBackground === primaryColor) setSplashBackground(next);
            setPrimaryColor(next);
          }}
          autoCapitalize="none"
          placeholder="#0F6CBD"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.label}>Secondary color</Text>
        <TextInput
          style={styles.input}
          value={secondaryColor}
          onChangeText={setSecondaryColor}
          autoCapitalize="none"
          placeholder="#111827"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.label}>Icon style</Text>
        <View style={styles.modeRow}>
          <Button
            label="Logo on background"
            variant={!asIsIcon ? 'primary' : 'ghost'}
            onPress={() => setIconMode('plate')}
            disabled={hasIconOverride}
          />
          <Button
            label="Full icon"
            variant={asIsIcon ? 'primary' : 'ghost'}
            onPress={() => setIconMode('as-is')}
          />
        </View>
        <Text style={styles.label}>Icon background</Text>
        <TextInput
          style={styles.input}
          value={iconBackground}
          onChangeText={setIconBackground}
          autoCapitalize="none"
          editable={!asIsIcon}
          placeholder="#0F6CBD"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.label}>Splash background</Text>
        <TextInput
          style={styles.input}
          value={splashBackground}
          onChangeText={setSplashBackground}
          autoCapitalize="none"
          placeholder="#0F6CBD"
          placeholderTextColor={colors.mutedForeground}
        />
        {!asIsIcon ? (
          <>
            <Text style={styles.label}>Logo size on icon ({markPct}% of tile)</Text>
            <View style={styles.modeRow}>
              <Button
                label="Larger"
                variant="ghost"
                onPress={() => setIconPadding((p) => Math.max(0.08, Number((p - 0.02).toFixed(2))))}
              />
              <Button
                label="More padding"
                variant="ghost"
                onPress={() => setIconPadding((p) => Math.min(0.36, Number((p + 0.02).toFixed(2))))}
              />
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Android package</Text>
        <TextInput
          style={styles.input}
          value={packageName}
          onChangeText={setPackageName}
          autoCapitalize="none"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.label}>Google Android OAuth client ID</Text>
        <TextInput
          style={styles.input}
          value={googleClientId}
          onChangeText={setGoogleClientId}
          autoCapitalize="none"
          placeholder="….apps.googleusercontent.com"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={styles.label}>Play App Signing SHA-1</Text>
        <TextInput
          style={styles.input}
          value={playSha1}
          onChangeText={setPlaySha1}
          autoCapitalize="none"
          placeholder="AA:BB:…"
          placeholderTextColor={colors.mutedForeground}
        />
        <ImagePickerButton
          label="App icon override (optional)"
          valueUri={appIconUrl}
          helperText="Only if auto plate still looks wrong."
          optional
          onPicked={(asset) => setAppIconAsset(asset)}
        />
        <Button
          label={busy === 'Save brand & setup' ? 'Saving…' : 'Save brand & setup'}
          fullWidth
          loading={busy === 'Save brand & setup'}
          disabled={Boolean(busy)}
          onPress={() =>
            void run('Save brand & setup', async () => {
              if (!token) throw new Error('Not signed in');
              if (logoAsset) {
                await uploadCustomerAppAsset({
                  token,
                  businessId,
                  asset: logoAsset,
                  kind: 'logo',
                });
              }
              if (appIconAsset) {
                await uploadCustomerAppAsset({
                  token,
                  businessId,
                  asset: appIconAsset,
                  kind: 'app_icon',
                });
              }
              return client!.platform.updateCustomerApp(businessId, {
                app_name: appName,
                bundle_id_android: packageName,
                bundle_id_ios: packageName,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                white_label_enabled: true,
                icon_mode: iconMode,
                icon_background: iconBackground,
                icon_padding: iconPadding,
                splash_background: splashBackground,
                google_oauth_android_client_id: googleClientId,
                play_signing_sha1: playSha1,
              });
            })
          }
        />
        <Button
          label={recipe?.has_google_services_json ? 'Refresh Firebase' : 'Create Firebase app'}
          variant="secondary"
          fullWidth
          loading={busy === 'Create Firebase app'}
          disabled={Boolean(busy) || !packageName}
          onPress={() =>
            void run('Create Firebase app', () => client!.platform.provisionCustomerAppFirebase(businessId))
          }
        />
      </View>

      <View style={styles.card}>
        <Button
          label="Build preview APK"
          fullWidth
          loading={busy === 'Build preview APK'}
          disabled={Boolean(busy) || !checklist?.ready_for_preview}
          onPress={() =>
            void run('Build preview APK', () =>
              client!.platform.startCustomerAppBuild(businessId, { track: 'preview', bump: 'patch' }),
            )
          }
        />
        <Button
          label="Build store AAB"
          variant="secondary"
          fullWidth
          loading={busy === 'Build store AAB'}
          disabled={Boolean(busy) || !checklist?.ready_for_preview}
          onPress={() =>
            void run('Build store AAB', () =>
              client!.platform.startCustomerAppBuild(businessId, { track: 'production', bump: 'patch' }),
            )
          }
        />
        <Button
          label="Mark live on Play"
          variant="ghost"
          fullWidth
          disabled={Boolean(busy) || !checklist?.store_aab}
          onPress={() =>
            void run('Mark live', () => client!.platform.updateCustomerApp(businessId, { mark_live: true }))
          }
        />
        <Button
          label="Refresh status"
          variant="ghost"
          fullWidth
          disabled={Boolean(busy)}
          onPress={() => void load()}
        />
      </View>

      {recipe ? (
        <>
          <BuildLinks title="Latest preview" track="preview" data={recipe.preview as Record<string, unknown>} />
          <BuildLinks title="Latest store" track="production" data={recipe.production as Record<string, unknown>} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  section: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground, marginTop: spacing.sm },
  meta: { ...typography.body, color: colors.mutedForeground, fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  iconRow: { alignItems: 'center', gap: spacing.xs },
  iconPlate: {
    width: 88,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconPlateOverride: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconMark: { width: '58%', height: '58%', resizeMode: 'contain' },
  iconMarkFull: { width: '100%', height: '100%', resizeMode: 'cover' },
  iconInitials: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 22 },
  preview: {
    position: 'relative',
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
    minHeight: 168,
  },
  previewAccent: {
    position: 'absolute',
    right: -24,
    top: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.35,
  },
  previewLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  previewMark: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewMarkText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#111827' },
  previewName: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#fff' },
  previewTag: { color: 'rgba(255,255,255,0.86)', fontSize: 13 },
  buildCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  businessPicker: { gap: spacing.xs },
  businessName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  chipRow: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.muted,
  },
  chipDone: { backgroundColor: colors.primary },
  chipText: { fontSize: 11, color: colors.mutedForeground, fontWeight: '600' },
  chipTextDone: { color: colors.primaryForeground || '#fff' },
  error: { color: colors.destructive, fontSize: 12 },
});
