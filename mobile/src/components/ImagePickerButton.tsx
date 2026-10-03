import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FlipType, SaveFormat, manipulateAsync } from 'expo-image-manipulator';
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
  /** 0–100 while uploading; omit or null when idle. */
  uploadProgress?: number | null;
  uploading?: boolean;
};

/**
 * Front-camera files are mirrored (and the system crop UI shows that mirrored frame).
 * Skip the system cropper for avatars: un-mirror, then center-crop to a square ourselves.
 */
async function prepareAvatarCameraAsset(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const width = asset.width || 0;
  const height = asset.height || 0;
  const actions: Parameters<typeof manipulateAsync>[1] = [{ flip: FlipType.Horizontal }];
  if (width > 0 && height > 0 && width !== height) {
    const size = Math.min(width, height);
    actions.push({
      crop: {
        originX: Math.round((width - size) / 2),
        originY: Math.round((height - size) / 2),
        width: size,
        height: size,
      },
    });
  }
  const result = await manipulateAsync(asset.uri, actions, {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  return {
    ...asset,
    uri: result.uri,
    width: result.width,
    height: result.height,
    mimeType: 'image/jpeg',
    fileName: asset.fileName?.replace(/\.\w+$/, '.jpg') ?? `photo-${Date.now()}.jpg`,
  };
}

export function ImagePickerButton({
  label,
  valueUri,
  onPicked,
  variant = 'card',
  helperText,
  uploadProgress = null,
  uploading = false,
}: Props) {
  const [preview, setPreview] = useState<string | null>(resolveMediaUrl(valueUri) || null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const busy = uploading || (uploadProgress != null && uploadProgress < 100);
  const progressLabel =
    uploadProgress != null && uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Uploading…';

  useEffect(() => {
    setPreview(resolveMediaUrl(valueUri) || null);
  }, [valueUri]);

  async function pickFromLibrary() {
    if (busy) return;
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
      // Avoid page-sheet / transparent styles that leave the app chrome (back icon) peeking through.
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
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
    if (busy) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }

    const isAvatar = variant === 'avatar';
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Avatar: skip system crop — it shows the mirrored selfie. We un-mirror + square-crop after.
      allowsEditing: !isAvatar,
      aspect: isAvatar ? [1, 1] : [4, 3],
      quality: 0.85,
      cameraType: isAvatar ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    });

    if (result.canceled || !result.assets[0]) return;
    let asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Invalid file', 'Choose a PNG, JPG, or WebP image.');
      return;
    }
    if (isAvatar) {
      try {
        asset = await prepareAvatarCameraAsset(asset);
      } catch {
        // Keep the original capture if manipulation fails.
      }
    }
    setPreview(asset.uri);
    onPicked(asset);
  }

  function openPicker() {
    if (busy) return;
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
          <View style={styles.avatarHit}>
            <Pressable
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
            </Pressable>
            {busy ? (
              <View style={styles.uploadOverlay} pointerEvents="none">
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.uploadOverlayText}>{progressLabel}</Text>
              </View>
            ) : (
              <Pressable
                style={styles.cameraBadge}
                onPress={openPicker}
                hitSlop={8}
                accessibilityLabel="Change photo"
              >
                <Feather name="camera" size={12} color="#fff" />
              </Pressable>
            )}
          </View>
          <View style={styles.avatarCopy}>
            {busy ? (
              <Text style={styles.uploadingText}>{progressLabel}</Text>
            ) : (
              <Pressable onPress={openPicker}>
                <Text style={styles.changeLink}>{preview ? 'Change photo' : 'Add photo'}</Text>
              </Pressable>
            )}
            {preview ? (
              <Pressable onPress={openPreview}>
                <Text style={styles.previewLink}>View photo</Text>
              </Pressable>
            ) : null}
            <Text style={styles.helper}>
              {busy
                ? 'Upload in progress. You can still view the selected photo.'
                : helperText || 'Square photo recommended. Use camera or gallery.'}
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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={openPreview}
            accessibilityLabel="View photo"
          >
            <Image source={{ uri: preview }} style={styles.cardPreview} />
          </Pressable>
          <View style={styles.cardOverlay} pointerEvents="box-none">
            {busy ? (
              <View style={styles.cardBusy}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.cardActionText}>{progressLabel}</Text>
              </View>
            ) : (
              <Pressable style={styles.cardAction} onPress={openPicker} accessibilityLabel="Change image">
                <Feather name="camera" size={14} color="#fff" />
                <Text style={styles.cardActionText}>Change image</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <Pressable style={styles.card} onPress={openPicker} disabled={busy}>
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
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(15,22,35,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  uploadOverlayText: { color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  avatarCopy: { flex: 1, gap: 4 },
  changeLink: { ...typography.label, color: colors.primary, fontWeight: '700' },
  uploadingText: { ...typography.label, color: colors.foreground, fontWeight: '700' },
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
  cardBusy: { alignItems: 'center', gap: 8 },
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
