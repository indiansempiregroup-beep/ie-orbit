import { Platform, StyleSheet, type TextStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export const FIELD_MIN_HEIGHT = 44;

/** Prevents the nested browser outline inside the field chrome. */
export const inputReset: TextStyle =
  Platform.OS === 'web'
    ? { outlineStyle: 'none' as const, outlineWidth: 0 }
    : {};

export const fieldStyles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 4,
  },
  label: { ...typography.label, color: colors.foreground },
  optional: { ...typography.caption, color: colors.mutedForeground },
  requiredMark: { color: colors.destructive, fontWeight: '700' },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FIELD_MIN_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
  },
  controlFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  controlError: { borderColor: colors.destructive },
  controlPressed: { borderColor: colors.primary },
  controlDisabled: { opacity: 0.7 },
  controlMultiline: {
    minHeight: 88,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  value: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
  },
  placeholder: { color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
  hint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
});
