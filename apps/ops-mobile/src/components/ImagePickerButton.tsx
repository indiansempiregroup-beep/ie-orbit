import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  valueUri?: string | null;
  onPicked: (asset: ImagePickerAsset) => void;
};

export function ImagePickerButton({ label, valueUri, onPicked }: Props) {
  const [preview, setPreview] = useState<string | null>(valueUri ?? null);

  useEffect(() => {
    setPreview(valueUri ?? null);
  }, [valueUri]);

  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    setPreview(result.assets[0].uri);
    onPicked(result.assets[0]);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.button} onPress={() => void pick()}>
        {preview ? <Image source={{ uri: preview }} style={styles.preview} /> : <Text style={styles.placeholder}>Tap to choose image</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  button: {
    minHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  preview: { width: '100%', height: 140 },
  placeholder: { ...typography.caption, color: colors.mutedForeground },
});
