import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
  step?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

function iconForTitle(title: string): keyof typeof Feather.glyphMap {
  const value = title.toLowerCase();
  if (value.includes('contact')) return 'phone';
  if (value.includes('address') || value.includes('location') || value.includes('office')) return 'map-pin';
  if (value.includes('payment') || value.includes('price') || value.includes('tax') || value.includes('gst')) {
    return 'credit-card';
  }
  if (value.includes('schedule') || value.includes('availability') || value.includes('date') || value.includes('when')) {
    return 'calendar';
  }
  if (value.includes('stock') || value.includes('godown') || value.includes('inventory')) return 'archive';
  if (value.includes('barcode') || value.includes('scan') || value.includes('lookup')) return 'maximize';
  if (value.includes('photo') || value.includes('image') || value.includes('media') || value.includes('gallery')) {
    return 'image';
  }
  if (value.includes('security') || value.includes('access')) return 'shield';
  if (value.includes('stock') || value.includes('product') || value.includes('service') || value.includes('basics')) {
    return 'package';
  }
  if (value.includes('identity') || value.includes('profile') || value.includes('customer') || value.includes('supplier')) {
    return 'user';
  }
  if (value.includes('bill') || value.includes('basket') || value.includes('sale')) return 'shopping-cart';
  if (value.includes('manage')) return 'settings';
  if (value.includes('who')) return 'users';
  return 'edit-3';
}

export function FormSection({ step, title, subtitle, children }: Props) {
  const icon = iconForTitle(title);
  return (
    <Card elevated={false} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          {step != null ? (
            <Text style={styles.stepText}>{step}</Text>
          ) : (
            <Feather name={icon} size={15} color={colors.primary} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { ...typography.label, color: colors.primary, fontWeight: '700' },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  subtitle: { ...typography.caption, color: colors.mutedForeground, lineHeight: 17 },
  body: { gap: spacing.lg },
});
