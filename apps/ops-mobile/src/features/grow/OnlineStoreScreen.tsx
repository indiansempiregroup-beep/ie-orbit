import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

export function OnlineStoreScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState('');
  const [slug, setSlug] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.getSettings({ business_id: businessId });
      const metadata = (response.data.metadata ?? {}) as Record<string, unknown>;
      const store = readGrowMetadata(metadata).online_store ?? {};
      setRawMetadata(metadata);
      setEnabled(Boolean(store.enabled));
      setUrl(store.url ?? '');
      setSlug(store.slug ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load online store settings');
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

  const storeLink = useMemo(() => {
    if (url.trim()) return url.trim();
    if (slug.trim()) return `https://shop.ie.platform/${slug.trim()}`;
    return '';
  }, [url, slug]);

  async function save() {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          online_store: {
            enabled,
            url: url.trim(),
            slug: slug.trim(),
          },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('Online store settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function shareLink() {
    if (!storeLink) {
      toast.push('Add a store URL or slug first', 'error');
      return;
    }
    try {
      await Share.share({ message: storeLink, title: 'Online store' });
    } catch {
      toast.push('Unable to share link', 'error');
    }
  }

  async function openLink() {
    if (!storeLink) {
      toast.push('Add a store URL or slug first', 'error');
      return;
    }
    const canOpen = await Linking.canOpenURL(storeLink);
    if (!canOpen) {
      toast.push('Unable to open link', 'error');
      return;
    }
    await Linking.openURL(storeLink);
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
          <Button label="Open link" fullWidth onPress={() => void openLink()} />
          <Button label="Copy / share link" fullWidth onPress={() => void shareLink()} />
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
      <Text style={styles.formTitle}>Online store</Text>
      <Text style={styles.help}>Toggle storefront availability and keep your public link handy.</Text>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Store enabled</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.tintStrong }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Store URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          placeholder="https://…"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Slug</Text>
        <TextInput
          style={styles.input}
          value={slug}
          onChangeText={setSlug}
          autoCapitalize="none"
          placeholder="my-shop"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      {storeLink ? <Text style={styles.linkPreview}>{storeLink}</Text> : null}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
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
  linkPreview: { ...typography.caption, color: colors.primary },
  footer: { gap: spacing.sm },
  error: { color: colors.destructive },
});
