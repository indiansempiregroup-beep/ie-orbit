import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconBadge } from '../../components/ui/IconBadge';
import { colors, fonts, radius, spacing, type IconTone } from '../../theme/tokens';

type ExtraAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  title: string;
  amount?: string;
  amountTone?: 'paid' | 'due';
  meta?: string;
  badge?: string;
  badgeKind?: 'paid' | 'due' | 'void' | 'neutral';
  icon: keyof typeof Feather.glyphMap;
  iconTone?: IconTone;
  dimmed?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  extraActions?: ExtraAction[];
  onPress?: () => void;
  children?: React.ReactNode;
};

export function BooksDocumentRow({
  title,
  amount,
  amountTone,
  meta,
  badge,
  badgeKind = 'neutral',
  icon,
  iconTone = 'navy',
  dimmed,
  actionLabel,
  onAction,
  extraActions,
  onPress,
  children,
}: Props) {
  const showFooter = Boolean(badge || actionLabel || extraActions?.length || onPress);
  const actions = [
    ...(actionLabel && onAction ? [{ label: actionLabel, onPress: onAction }] : []),
    ...(extraActions ?? []),
  ];

  const body = (
    <View style={styles.rowInner}>
      <IconBadge icon={icon} tone={iconTone} size="md" />
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {amount ? (
            <Text
              style={[
                styles.amount,
                dimmed && styles.amountDim,
                amountTone === 'paid' && styles.amountPaid,
                amountTone === 'due' && styles.amountDue,
              ]}
            >
              {amount}
            </Text>
          ) : null}
        </View>
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        {showFooter ? (
          <View style={styles.bottom}>
            {badge ? (
              <View
                style={[
                  styles.badge,
                  badgeKind === 'paid' && styles.badgePaid,
                  badgeKind === 'due' && styles.badgeDue,
                  badgeKind === 'void' && styles.badgeVoid,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    badgeKind === 'paid' && styles.badgeTextPaid,
                    badgeKind === 'due' && styles.badgeTextDue,
                    badgeKind === 'void' && styles.badgeTextVoid,
                  ]}
                >
                  {badge}
                </Text>
              </View>
            ) : (
              <View />
            )}
            {actions.length ? (
              <View style={styles.actions}>
                {actions.map((action) => (
                  <Pressable key={action.label} onPress={action.onPress} hitSlop={8}>
                    <Text style={[styles.action, action.destructive && styles.actionDanger]}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : onPress ? (
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={[styles.row, dimmed && styles.dim]} onPress={onPress}>
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.row, dimmed && styles.dim]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  rowInner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dim: { opacity: 0.72 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  amount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  amountDim: { textDecorationLine: 'line-through', color: colors.mutedForeground },
  amountPaid: { color: colors.success },
  amountDue: { color: colors.destructive },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.muted,
  },
  badgePaid: { backgroundColor: colors.successSoft },
  badgeDue: { backgroundColor: colors.destructiveSoft },
  badgeVoid: { backgroundColor: colors.destructiveSoft },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.mutedForeground, textTransform: 'capitalize' },
  badgeTextPaid: { color: '#047857' },
  badgeTextDue: { color: '#B91C1C' },
  badgeTextVoid: { color: colors.destructive },
  action: { color: colors.primary, fontSize: 13, fontFamily: fonts.bodySemi },
  actionDanger: { color: colors.destructive },
});
