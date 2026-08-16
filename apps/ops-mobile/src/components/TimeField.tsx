import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  helperText?: string;
  allowClear?: boolean;
  minuteStep?: number;
  placeholder?: string;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseHhmm(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || hours > 23 || !Number.isFinite(minutes) || minutes > 59) return null;
  const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return { hours, minutes, hour12, period };
}

export function formatTimeLabel(value: string) {
  const parsed = parseHhmm(value);
  if (!parsed) return '';
  return `${parsed.hour12}:${pad(parsed.minutes)} ${parsed.period}`;
}

function toHhmm(hour12: number, minutes: number, period: 'AM' | 'PM') {
  let hours = hour12 % 12;
  if (period === 'PM') hours += 12;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function TimeField({
  label,
  value,
  onChange,
  helperText,
  allowClear = false,
  minuteStep = 15,
  placeholder = 'Select time',
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const parsed = parseHhmm(value);
  const display = parsed ? formatTimeLabel(value) : '';

  const hourChoices = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minuteChoices = useMemo(() => {
    const mins = new Set<number>();
    for (let minute = 0; minute < 60; minute += minuteStep) mins.add(minute);
    if (parsed) mins.add(parsed.minutes);
    return [...mins].sort((a, b) => a - b);
  }, [minuteStep, parsed]);

  const draftHour12 = parsed?.hour12 ?? 9;
  const draftMinute = parsed?.minutes ?? 0;
  const draftPeriod = parsed?.period ?? 'AM';

  function apply(hour12: number, minutes: number, period: 'AM' | 'PM') {
    onChange(toHhmm(hour12, minutes, period));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
          <Feather name="clock" size={16} color={colors.primary} />
          <Text style={[styles.triggerText, !display && styles.placeholder]}>
            {display || placeholder}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
        </Pressable>
        {allowClear && value ? (
          <Pressable
            style={styles.clearBtn}
            onPress={() => onChange('')}
            accessibilityLabel="Clear time"
          >
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Text style={styles.sheetSubtitle}>{display || 'Choose hour, minutes, and AM/PM'}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map((period) => (
                <Pressable
                  key={period}
                  style={[styles.periodChip, draftPeriod === period && styles.choiceActive]}
                  onPress={() => apply(draftHour12, draftMinute, period)}
                >
                  <Text style={[styles.choiceText, draftPeriod === period && styles.choiceTextActive]}>{period}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Hour</Text>
            <View style={styles.grid}>
              {hourChoices.map((hour) => (
                <Pressable
                  key={hour}
                  style={[styles.choice, draftHour12 === hour && styles.choiceActive]}
                  onPress={() => apply(hour, draftMinute, draftPeriod)}
                >
                  <Text style={[styles.choiceText, draftHour12 === hour && styles.choiceTextActive]}>{hour}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Minutes</Text>
            <View style={styles.grid}>
              {minuteChoices.map((minute) => (
                <Pressable
                  key={minute}
                  style={[styles.choice, draftMinute === minute && styles.choiceActive]}
                  onPress={() => apply(draftHour12, minute, draftPeriod)}
                >
                  <Text style={[styles.choiceText, draftMinute === minute && styles.choiceTextActive]}>
                    {pad(minute)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

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
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: '#142033',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetHeaderCopy: { flex: 1, gap: 2 },
  sheetTitle: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground, letterSpacing: -0.2 },
  sheetSubtitle: { ...typography.caption, color: colors.mutedForeground },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  periodChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  groupLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  choice: {
    width: 52,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  choiceActive: { backgroundColor: colors.secondary, borderColor: colors.primary },
  choiceText: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  choiceTextActive: { color: colors.primary },
  helper: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
