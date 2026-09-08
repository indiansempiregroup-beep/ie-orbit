import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { avatarColors, typography } from '../../theme/tokens';

type Size = 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  name: string;
  size?: Size;
  src?: string | null;
};

const sizeMap: Record<Size, number> = { sm: 28, md: 36, lg: 44, xl: 64 };
const fontMap: Record<Size, number> = { sm: 11, md: 13, lg: 15, xl: 20 };

export function Avatar({ name, size = 'md', src }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = sizeMap[size];
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const color = avatarColors[(name.charCodeAt(0) || 0) % avatarColors.length];

  const imageUri = resolveMediaUrl(src);
  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  if (imageUri && !imageFailed) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[styles.image, { width: dimension, height: dimension }]}
        onError={() => setImageFailed(true)}
        accessibilityLabel={`${name} profile photo`}
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: dimension, height: dimension, backgroundColor: color }]}>
      <Text style={[styles.initials, { fontSize: fontMap[size] }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 999 },
  fallback: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.label, color: '#fff', fontWeight: '700' },
});
