import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CalendarPicker } from './CalendarPicker';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  helperText?: string;
  allowClear?: boolean;
  allowPast?: boolean;
  primaryColor?: string;
};

function formatDisplay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DateField({
  label,
  value,
  onChange,
  helperText,
  allowClear = true,
  allowPast = true,
  primaryColor = colors.primary,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable style={styles.trigger} onPress={() => setOpen((current) => !current)}>
          <Feather name="calendar" size={16} color={primaryColor} />
          <Text style={[styles.triggerText, !value && styles.placeholder]}>
            {value ? formatDisplay(value) : 'Select date'}
          </Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
            accessibilityLabel="Clear date"
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <CalendarPicker
          value={value}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
          primaryColor={primaryColor}
          allowPast={allowPast}
        />
      ) : null}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trigger: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  triggerText: { ...typography.body, color: colors.foreground, flex: 1 },
  placeholder: { color: colors.mutedForeground },
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
  helper: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
