import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

export function GoogleProfileScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [url, setUrl] = useState('');
  const [placeId, setPlaceId] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.getSettings({ business_id: businessId });
      const metadata = (response.data.metadata ?? {}) as Record<string, unknown>;
      const profile = readGrowMetadata(metadata).google_profile ?? {};
      setRawMetadata(metadata);
      setUrl(profile.url ?? '');
      setPlaceId(profile.place_id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Google profile settings');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function save() {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          google_profile: { url: url.trim(), place_id: placeId.trim() },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('Google profile saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openProfile() {
    const target =
      url.trim() ||
      (placeId.trim() ? `https://www.google.com/maps/place/?q=place_id:${placeId.trim()}` : '');
    if (!target) {
      toast.push('Add a profile URL or place ID', 'error');
      return;
    }
    const canOpen = await Linking.canOpenURL(target);
    if (!canOpen) {
      toast.push('Unable to open link', 'error');
      return;
    }
    await Linking.openURL(target);
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <View style={styles.footer}>
          <Button label="Open Google profile" fullWidth onPress={() => void openProfile()} />
          <Button
            label={busy ? 'Saving…' : 'Save'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Google Business Profile</Text>
      <Text style={styles.help}>Store your public listing URL or place ID and open it quickly.</Text>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Profile URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="https://g.page/…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Place ID</Text>
        <TextInput
          style={styles.input}
          value={placeId}
          onChangeText={setPlaceId}
          autoCapitalize="none"
          placeholder="Optional Google place_id"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  fieldBlock: { gap: 6 },
  label: { ...typography.label, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  footer: { gap: spacing.sm },
  error: { color: colors.destructive },
});
