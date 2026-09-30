import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconBadge } from '../../components/ui/IconBadge';
import { RemoteImage } from '../../components/RemoteImage';
import { colors, fonts, radius, spacing, type IconTone } from '../../theme/tokens';

type ExtraAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: keyof typeof Feather.glyphMap;
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
  imageUri?: string | null;
  dimmed?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  extraActions?: ExtraAction[];
  onPress?: () => void;
  leading?: React.ReactNode;
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
  imageUri,
  dimmed,
  actionLabel,
  onAction,
  extraActions,
  onPress,
  leading,
  children,
}: Props) {
  const iconActions = (extraActions ?? []).filter((action) => action.icon);
  const textExtras = (extraActions ?? []).filter((action) => !action.icon);
  const textActions = [
    ...(actionLabel && onAction ? [{ label: actionLabel, onPress: onAction }] : []),
    ...textExtras,
  ];
  const showFooter = Boolean(badge || textActions.length);

  const body = (
    <View style={styles.rowInner}>
      {imageUri ? (
        <RemoteImage uri={imageUri} style={styles.thumb} />
      ) : (
        <IconBadge icon={icon} tone={iconTone} size="md" />
      )}
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
          <Text style={styles.meta} numberOfLines={1}>
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
            {textActions.length ? (
              <View style={styles.textActions}>
                {textActions.map((action) => (
                  <Pressable key={action.label} onPress={action.onPress} hitSlop={8}>
                    <Text style={styles.textAction}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );

  const main = onPress ? (
    <Pressable style={styles.rowMain} onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.rowMain}>{body}</View>
  );

  return (
    <View style={[styles.row, dimmed && styles.dim]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {main}
      {iconActions.length ? (
        <View style={styles.iconRail}>
          {iconActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              hitSlop={6}
              style={({ pressed }) => [
                styles.iconBtn,
                action.destructive && styles.iconBtnDanger,
                pressed && styles.iconBtnPressed,
              ]}
            >
              <Feather
                name={action.icon!}
                size={16}
                color={action.destructive ? colors.destructive : colors.primary}
              />
            </Pressable>
          ))}
        </View>
      ) : onPress ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={styles.chevron} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    gap: 10,
  },
  leading: { height: 44, justifyContent: 'center', alignItems: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  rowInner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    flexShrink: 0,
  },
  dim: { opacity: 0.72 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  title: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  amount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  amountDim: { textDecorationLine: 'line-through', color: colors.mutedForeground },
  amountPaid: { color: colors.success },
  amountDue: { color: colors.destructive },
  meta: { color: colors.mutedForeground, fontSize: 12.5 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
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
  textActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  textAction: { color: colors.primary, fontSize: 12.5, fontFamily: fonts.bodySemi },
  iconRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnDanger: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructiveSoft,
  },
  iconBtnPressed: { opacity: 0.75 },
  chevron: { marginLeft: 2 },
});
