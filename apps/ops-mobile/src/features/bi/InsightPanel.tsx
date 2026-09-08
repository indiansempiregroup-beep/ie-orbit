import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { BIInsight } from '@ie-orbit/sdk';
import { IconBadge } from '../../components/ui/IconBadge';
import { colors, fonts, radius, shadows, spacing, typography, type IconTone } from '../../theme/tokens';

type Meta = {
  icon: keyof typeof Feather.glyphMap;
  tone: IconTone;
  label: string;
};

const BY_TYPE: Record<string, Meta> = {
  trend: { icon: 'trending-up', tone: 'blue', label: 'Trend' },
  revenue: { icon: 'dollar-sign', tone: 'green', label: 'Revenue' },
  demand: { icon: 'clock', tone: 'amber', label: 'Demand' },
  growth: { icon: 'users', tone: 'cyan', label: 'Customers' },
  service: { icon: 'star', tone: 'violet', label: 'Service' },
  risk: { icon: 'alert-triangle', tone: 'coral', label: 'Watch' },
  commerce: { icon: 'shopping-bag', tone: 'green', label: 'Sales' },
  returns: { icon: 'rotate-ccw', tone: 'coral', label: 'Returns' },
  delivery: { icon: 'truck', tone: 'blue', label: 'Delivery' },
};

function metaFor(insight: BIInsight): Meta {
  const base = BY_TYPE[insight.type] ?? { icon: 'zap', tone: 'navy' as IconTone, label: 'Insight' };
  const down = /down|drop|fall|risk|watch/i.test(`${insight.title} ${insight.type}`);
  if ((insight.type === 'trend' || insight.type === 'revenue') && down) {
    return { ...base, icon: 'trending-down', tone: 'rose' };
  }
  if (insight.type === 'risk') return { ...base, tone: 'coral' };
  return base;
}

type Props = {
  title: string;
  subtitle?: string;
  insights: BIInsight[];
};

export function InsightPanel({ title, subtitle, insights }: Props) {
  if (!insights.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.card}>
        {insights.map((insight, index) => {
          const meta = metaFor(insight);
          return (
            <View
              key={`${insight.type}-${insight.title}-${index}`}
              style={[styles.row, index < insights.length - 1 && styles.rowBorder]}
            >
              <IconBadge icon={meta.icon} tone={meta.tone} size="md" />
              <View style={styles.copy}>
                <Text style={styles.badge}>{meta.label}</Text>
                <Text style={styles.rowTitle}>{insight.title}</Text>
                <Text style={styles.detail}>{insight.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { gap: 4, paddingHorizontal: 2 },
  title: { ...typography.title, fontSize: 18, color: colors.foreground },
  subtitle: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  badge: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowTitle: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground },
  detail: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18, marginTop: 2 },
});
