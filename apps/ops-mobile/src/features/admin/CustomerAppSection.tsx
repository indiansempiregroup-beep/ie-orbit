import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CustomerAppState, PlatformTenantBusiness } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/Button';
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
  const toast = useToast();
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '');
  const [state, setState] = useState<CustomerAppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [playSha1, setPlaySha1] = useState('');

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    try {
      const response = await client.platform.customerApp(businessId);
      setState(response.data);
      const recipe = response.data.recipe;
      setAppName(recipe.app_name || '');
      setPackageName(recipe.bundle_id_android || '');
      setGoogleClientId(recipe.google_oauth_android_client_id || '');
      setPlaySha1(recipe.play_signing_sha1 || '');
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
        <Text style={styles.section}>Customer app</Text>
        <Text style={styles.meta}>No businesses on this tenant.</Text>
      </View>
    );
  }

  const recipe = state?.recipe;
  const checklist = state?.checklist;
  const selected = businesses.find((row) => row.id === businessId) || businesses[0];

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Customer app</Text>
      <Text style={styles.meta}>
        Setup once, then build a preview APK or store AAB. Full recipe copy lives on web Platform Admin.
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
            <Chip label="White-label" done={checklist.white_label} />
            <Chip label="Google" done={checklist.google_sign_in} />
            <Chip label="Firebase" done={checklist.firebase} />
            <Chip label="Preview" done={checklist.preview_apk} />
            <Chip label="Store" done={checklist.store_aab} />
            <Chip label="Live" done={checklist.live} />
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>App name</Text>
        <TextInput style={styles.input} value={appName} onChangeText={setAppName} placeholderTextColor={colors.mutedForeground} />
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
        <Button
          label={busy === 'Save setup' ? 'Saving…' : 'Save setup'}
          fullWidth
          loading={busy === 'Save setup'}
          disabled={Boolean(busy)}
          onPress={() =>
            void run('Save setup', () =>
              client!.platform.updateCustomerApp(businessId, {
                app_name: appName,
                bundle_id_android: packageName,
                bundle_id_ios: packageName,
                google_oauth_android_client_id: googleClientId,
                play_signing_sha1: playSha1,
              }),
            )
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
