import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { brand, colors, fonts, spacing } from '../theme/tokens';

export function BrandMark({ size = 'md', light }: { size?: 'sm' | 'md'; light?: boolean }) {
  const dimension = size === 'sm' ? 34 : 40;

  return (
    <View style={styles.row}>
      <Image
        source={require('../../assets/ie-orbit-logo.png')}
        style={{ width: dimension * 1.28, height: dimension }}
        resizeMode="contain"
        accessibilityLabel="IE Orbit logo"
      />
      <Text style={[styles.name, size === 'sm' ? styles.nameSm : null, light && styles.nameLight]}>
        {brand.appName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.display, fontSize: 24, color: colors.foreground, letterSpacing: -0.3 },
  nameSm: { fontSize: 18 },
  nameLight: { color: '#fff' },
});
