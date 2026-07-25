import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  avatarName?: string;
  avatarSrc?: string | null;
  icon?: keyof typeof Feather.glyphMap;
  right?: React.ReactNode;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, meta, avatarName, avatarSrc, icon, right, onPress }: Props) {
  const content = (
    <View style={styles.row}>
      {avatarName ? (
        <Avatar name={avatarName} size="md" src={avatarSrc} />
      ) : icon ? (
        <View style={styles.icon}>
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [pressed && styles.pressed]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.soft,
  },
  pressed: { opacity: 0.92 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { ...typography.label, color: colors.foreground, fontSize: 15 },
  subtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 3 },
  meta: { ...typography.tiny, color: colors.mutedForeground, marginTop: 4 },
});
