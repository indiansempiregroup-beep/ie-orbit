import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { ImageLightbox } from './ImageLightbox';
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
  const [preview, setPreview] = useState<string | null>(resolveMediaUrl(valueUri) || null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setPreview(resolveMediaUrl(valueUri) || null);
  }, [valueUri]);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to choose a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: variant === 'avatar' ? [1, 1] : [4, 3],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Invalid file', 'Choose a PNG, JPG, or WebP image.');
      return;
    }
    setPreview(asset.uri);
    onPicked(asset);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: variant === 'avatar' ? [1, 1] : [4, 3],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Invalid file', 'Choose a PNG, JPG, or WebP image.');
      return;
    }
    setPreview(asset.uri);
    onPicked(asset);
  }

  function openPicker() {
    Alert.alert(label || 'Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => void takePhoto() },
      { text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery', onPress: () => void pickFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function openPreview() {
    if (!preview) return;
    setLightboxOpen(true);
  }

  const lightbox = (
    <ImageLightbox
      uri={preview}
      visible={lightboxOpen}
      title={label || 'Photo'}
      onClose={() => setLightboxOpen(false)}
      replaceLabel="Change photo"
      onReplace={() => {
        setLightboxOpen(false);
        openPicker();
      }}
    />
  );

  if (variant === 'avatar') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.avatarRow}>
          <Pressable
            style={styles.avatarHit}
            onPress={preview ? openPreview : openPicker}
            accessibilityLabel={preview ? 'View photo' : 'Add photo'}
          >
            {preview ? (
              <Image source={{ uri: preview }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Feather name="user" size={28} color={colors.primary} />
              </View>
            )}
            <Pressable
              style={styles.cameraBadge}
              onPress={openPicker}
              hitSlop={8}
              accessibilityLabel="Change photo"
            >
              <Feather name="camera" size={12} color="#fff" />
            </Pressable>
          </Pressable>
          <View style={styles.avatarCopy}>
            <Pressable onPress={openPicker}>
              <Text style={styles.changeLink}>{preview ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            {preview ? (
              <Pressable onPress={openPreview}>
                <Text style={styles.previewLink}>View photo</Text>
              </Pressable>
            ) : null}
            <Text style={styles.helper}>
              {helperText || 'Square photo recommended. Use camera or gallery.'}
            </Text>
          </View>
        </View>
        {lightbox}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {preview ? (
        <View style={styles.card}>
          <Pressable style={StyleSheet.absoluteFill} onPress={openPreview} accessibilityLabel="View photo">
            <Image source={{ uri: preview }} style={styles.cardPreview} />
          </Pressable>
          <View style={styles.cardOverlay} pointerEvents="box-none">
            <Pressable style={styles.cardAction} onPress={openPicker} accessibilityLabel="Change image">
              <Feather name="camera" size={14} color="#fff" />
              <Text style={styles.cardActionText}>Change image</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.card} onPress={openPicker}>
          <View style={styles.cardEmpty}>
            <View style={styles.cardIcon}>
              <Feather name="image" size={22} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Tap to add image</Text>
            <Text style={styles.helper}>
              {helperText || 'Use camera or gallery. JPG or PNG works best.'}
            </Text>
          </View>
        </Pressable>
      )}
      {lightbox}
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
  previewLink: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  card: {
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
  },
  cardPreview: { width: '100%', height: '100%' },
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
