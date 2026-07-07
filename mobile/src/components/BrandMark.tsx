import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBootstrap } from '../contexts/BootstrapContext';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const dimension = size === 'sm' ? 32 : 36;
  const logoUri = useMemo(() => resolveMediaUrl(branding.logo), [branding.logo]);

  return (
    <View style={styles.row}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={{ width: dimension, height: dimension, borderRadius: 8 }} />
      ) : (
        <View style={[styles.icon, { width: dimension, height: dimension, backgroundColor: primary }]}>
          <Feather name="calendar" size={size === 'sm' ? 16 : 18} color="#fff" />
        </View>
      )}
      <Text style={[styles.name, size === 'sm' ? styles.nameSm : null]}>{branding?.appName ?? 'AppointIE'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.title, color: colors.foreground },
  nameSm: { fontSize: 16 },
});
