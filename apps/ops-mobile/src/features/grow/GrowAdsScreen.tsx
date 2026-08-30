import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { ShopDashboardAd } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { RemoteImage } from '../../components/RemoteImage';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { uploadMedia } from '../../api/media';
import { resolveMediaUrl, toStoredMediaUrl } from '../../utils/mediaUrl';

const MAX_ADS = 5;

export function GrowAdsScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { token } = useAuth();
  const { businessId, tenantId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<ShopDashboardAd[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [mediaId, setMediaId] = useState<string | undefined>();
  const [pendingAsset, setPendingAsset] = useState<ImagePickerAsset | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listAds({ business_id: businessId });
      setAds(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ads');
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

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setBody('');
    setLinkUrl('');
    setIsActive(true);
    setImageUrl(undefined);
    setMediaId(undefined);
    setPendingAsset(null);
    setShowForm(false);
  }

  function startCreate() {
    if (ads.filter((ad) => ad.is_active !== false).length >= MAX_ADS) {
      toast.push(`You can have at most ${MAX_ADS} active ads`, 'error');
      return;
    }
    resetForm();
    setShowForm(true);
  }

  function startEdit(ad: ShopDashboardAd) {
    setEditingId(ad.id);
    setTitle(ad.title);
    setBody(ad.body ?? '');
    setLinkUrl(ad.link_url ?? '');
    setIsActive(ad.is_active !== false);
    setImageUrl(ad.image_url);
    setMediaId(ad.media ?? undefined);
    setPendingAsset(null);
    setShowForm(true);
  }

  function onPickedImage(asset: ImagePickerAsset) {
    setPendingAsset(asset);
    setImageUrl(asset.uri);
  }

  async function ensureImage(): Promise<{ media_id?: string; image_url?: string }> {
    if (!pendingAsset) {
      return { media_id: mediaId, image_url: toStoredMediaUrl(imageUrl) };
    }
    if (!token || !tenantId || !businessId) throw new Error('Sign in again to upload');
    const uploaded = await uploadMedia({
      token,
      tenantId,
      businessId,
      asset: pendingAsset,
      folderType: 'branding',
      tags: ['grow', 'ad'],
      displayName: title.trim() || 'Dashboard ad',
    });
    const url = toStoredMediaUrl(uploaded.public_url || uploaded.private_url);
    if (!url) throw new Error('Image uploaded but no URL was returned.');
    setMediaId(uploaded.id);
    setImageUrl(url);
    setPendingAsset(null);
    return { media_id: uploaded.id, image_url: url };
  }

  async function save() {
    if (!client || !businessId) return;
    if (!title.trim()) {
      toast.push('Title is required', 'error');
      return;
    }
    setBusy(true);
    try {
      const media = await ensureImage();
      const payload = {
        business_id: businessId,
        title: title.trim(),
        body: body.trim() || undefined,
        link_url: linkUrl.trim() || undefined,
        is_active: isActive,
        media_id: media.media_id ?? null,
        image_url: media.image_url,
        sort_order: editingId ? undefined : ads.length,
      };
      if (editingId) {
        await client.shop.updateAd(editingId, payload);
        toast.push('Ad updated', 'success');
      } else {
        await client.shop.createAd(payload);
        toast.push('Ad created', 'success');
      }
      resetForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save ad', 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(ad: ShopDashboardAd) {
    Alert.alert('Delete ad', `Remove “${ad.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (!client) return;
            try {
              await client.shop.deleteAd(ad.id);
              toast.push('Ad deleted', 'success');
              await load();
            } catch (err) {
              toast.push(err instanceof Error ? err.message : 'Unable to delete', 'error');
            }
          })();
        },
      },
    ]);
  }

  const activeCount = ads.filter((ad) => ad.is_active !== false).length;

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
        showForm ? (
          <View style={styles.footer}>
            <Button label={busy ? 'Saving…' : editingId ? 'Update ad' : 'Create ad'} fullWidth loading={busy} onPress={() => void save()} />
            <Button label="Cancel" variant="outline" fullWidth onPress={resetForm} />
          </View>
        ) : (
          <Button label="Add ad" fullWidth onPress={startCreate} disabled={activeCount >= MAX_ADS} />
        )
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Customer ads</Text>
      <Text style={styles.help}>
        Create up to {MAX_ADS} banners for the customer app home. {activeCount} of {MAX_ADS} active.
      </Text>

      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit ad' : 'New ad'}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={[styles.input, styles.notes]}
            value={body}
            onChangeText={setBody}
            placeholder="Short message (optional)"
            multiline
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={styles.input}
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="https://… (optional link)"
            autoCapitalize="none"
            placeholderTextColor={colors.mutedForeground}
          />
          <View style={styles.chipRow}>
            <Chip label="Active" active={isActive} onPress={() => setIsActive(true)} />
            <Chip label="Inactive" active={!isActive} onPress={() => setIsActive(false)} />
          </View>
          <ImagePickerButton
            label="Ad image"
            valueUri={imageUrl}
            onPicked={onPickedImage}
            helperText="JPG or PNG. Shown as a full-width banner in the customer app."
          />
        </View>
      ) : null}

      {ads.map((ad) => {
        const thumbUri = resolveMediaUrl(ad.image_url);
        return (
          <View key={ad.id} style={styles.row}>
            {thumbUri ? (
              <RemoteImage uri={thumbUri} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Feather name="image" size={18} color={colors.mutedForeground} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{ad.title}</Text>
              <Text style={styles.meta}>{ad.is_active === false ? 'Inactive' : 'Active'}</Text>
              {ad.link_url ? (
                <Pressable onPress={() => void Linking.openURL(ad.link_url!)}>
                  <Text style={styles.link} numberOfLines={1}>
                    {ad.link_url}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.rowActions}>
              <Pressable onPress={() => startEdit(ad)} hitSlop={8}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(ad)} hitSlop={8}>
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {!ads.length && !showForm ? (
        <EmptyState
          icon="image"
          title="No ads yet"
          message="Add a banner with an image for the customer app."
          actionLabel="Add ad"
          onAction={startCreate}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  error: { color: colors.destructive },
  footer: { gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.bodySemi, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.muted },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.bodySemi, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 12 },
  link: { color: colors.primary, fontSize: 12 },
  rowActions: { gap: 12 },
});
