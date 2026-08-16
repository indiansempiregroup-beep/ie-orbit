import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { RemoteImage } from './RemoteImage';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Variant = 'avatar' | 'card';

type Props = {
  label: string;
  valueUri?: string | null;
  onPicked: (asset: ImagePickerAsset) => void;
  /** avatar = circular profile photo; card = logo / service image */
  variant?: Variant;
  helperText?: string;
};

export function ImagePickerButton({
  label,
  valueUri,
  onPicked,
  variant = 'card',
  helperText,
}: Props) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    // Parent URL changed (initial load / saved remote URL) — prefer that over a stale local pick.
    setLocalPreview(null);
  }, [valueUri]);

  const preview = localPreview || resolveMediaUrl(valueUri) || null;

  function applyPicked(asset: ImagePickerAsset) {
    setLocalPreview(asset.uri);
    onPicked(asset);
  }

  async function pickFromLibrary() {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to choose a photo.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      ...(Platform.OS === 'web'
        ? {}
        : { allowsEditing: true, aspect: variant === 'avatar' ? [1, 1] : [4, 3] }),
    });

    if (result.canceled || !result.assets[0]) return;
    applyPicked(result.assets[0]);
  }

  async function takePhoto() {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to take a photo.');
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      ...(Platform.OS === 'web'
        ? {}
        : { allowsEditing: true, aspect: variant === 'avatar' ? [1, 1] : [4, 3] }),
    });

    if (result.canceled || !result.assets[0]) return;
    applyPicked(result.assets[0]);
  }

  function openPicker() {
    // RN Alert.alert buttons never fire on web; open the file picker from this click.
    if (Platform.OS === 'web') {
      void pickFromLibrary();
      return;
    }
    Alert.alert(label || 'Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => void takePhoto() },
      { text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (variant === 'avatar') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.avatarRow}>
          <Pressable style={styles.avatarHit} onPress={openPicker}>
            {preview ? (
              <RemoteImage uri={preview} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Feather name="user" size={28} color={colors.primary} />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Feather name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <View style={styles.avatarCopy}>
            <Pressable onPress={openPicker}>
              <Text style={styles.changeLink}>{preview ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            <Text style={styles.helper}>
              {helperText || 'Square photo recommended. Use camera or gallery.'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.card} onPress={openPicker}>
        {preview ? (
          <>
            <RemoteImage uri={preview} style={styles.cardPreview} />
            <View style={styles.cardOverlay}>
              <View style={styles.cardAction}>
                <Feather name="camera" size={14} color="#fff" />
                <Text style={styles.cardActionText}>Change image</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.cardEmpty}>
            <View style={styles.cardIcon}>
              <Feather name="image" size={22} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Tap to add image</Text>
            <Text style={styles.helper}>
              {helperText || 'Use camera or gallery. JPG or PNG works best.'}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  helper: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarHit: { width: 88, height: 88 },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  avatarCopy: { flex: 1, gap: 4 },
  changeLink: { ...typography.label, color: colors.primary, fontWeight: '700' },
  card: {
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
  },
  cardPreview: { ...StyleSheet.absoluteFillObject },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,22,35,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  cardActionText: { ...typography.caption, color: '#fff', fontWeight: '600' },
  cardEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
});
