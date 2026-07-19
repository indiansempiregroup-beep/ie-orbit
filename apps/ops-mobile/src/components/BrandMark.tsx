import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { brand, colors, radius, spacing, typography } from '../theme/tokens';

export function BrandMark({ size = 'md', light }: { size?: 'sm' | 'md'; light?: boolean }) {
  const dimension = size === 'sm' ? 32 : 36;

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { width: dimension, height: dimension }]}>
        <Feather name="briefcase" size={size === 'sm' ? 16 : 18} color="#fff" />
      </View>
      <Text style={[styles.name, size === 'sm' ? styles.nameSm : null, light && styles.nameLight]}>
        {brand.appName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: {
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  name: { ...typography.title, color: colors.foreground },
  nameSm: { fontSize: 16 },
  nameLight: { color: '#fff' },
});
