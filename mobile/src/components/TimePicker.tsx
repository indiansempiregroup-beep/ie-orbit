import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
  label?: string;
  value: string;
  onChange: (hhmm: string) => void;
  minTime?: string;
  minuteStep?: number;
  primaryColor?: string;
  helperText?: string;
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
  return { hours, minutes, hour12, period, total: hours * 60 + minutes };
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

function toTotal(hour12: number, minutes: number, period: 'AM' | 'PM') {
  let hours = hour12 % 12;
  if (period === 'PM') hours += 12;
  return hours * 60 + minutes;
}

export function TimePicker({
  label = 'Preferred time',
  value,
  onChange,
  minTime,
  minuteStep = 15,
  primaryColor = colors.primary,
  helperText,
  placeholder = 'Select time',
}: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const parsed = parseHhmm(value);
  const minParsed = parseHhmm(minTime || '');
  const minTotal = minParsed?.total ?? 0;
  const display = parsed ? formatTimeLabel(value) : '';

  const hourChoices = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const minuteChoices = useMemo(() => {
    const mins = new Set<number>();
    for (let minute = 0; minute < 60; minute += minuteStep) mins.add(minute);
    if (parsed) mins.add(parsed.minutes);
    return [...mins].sort((a, b) => a - b);
  }, [minuteStep, parsed]);

  const draftHour12 = parsed?.hour12 ?? 11;
  const draftMinute = parsed?.minutes ?? 0;
  const draftPeriod = parsed?.period ?? 'AM';

  function isAllowed(hour12: number, minutes: number, period: 'AM' | 'PM') {
    if (!minParsed) return true;
    return toTotal(hour12, minutes, period) >= minTotal;
  }

  function firstAllowed(period: 'AM' | 'PM', hour12?: number, minutes?: number) {
    const hours = hour12 != null ? [hour12, ...hourChoices.filter((hour) => hour !== hour12)] : hourChoices;
    const mins = minutes != null ? [minutes, ...minuteChoices.filter((minute) => minute !== minutes)] : minuteChoices;
    for (const hour of hours) {
      for (const minute of mins) {
        if (isAllowed(hour, minute, period)) return { hour, minute };
      }
    }
    return null;
  }

  function apply(hour12: number, minutes: number, period: 'AM' | 'PM') {
    if (isAllowed(hour12, minutes, period)) {
      onChange(toHhmm(hour12, minutes, period));
      return;
    }
    const fallback = firstAllowed(period, hour12, minutes);
    if (fallback) onChange(toHhmm(fallback.hour, fallback.minute, period));
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Feather name="clock" size={16} color={primaryColor} />
        <Text style={[styles.triggerText, !display && styles.placeholder]}>{display || placeholder}</Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <Text style={styles.sheetSubtitle}>{display || 'Choose hour, minutes, and AM/PM'}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.periodRow}>
              {(['AM', 'PM'] as const).map((period) => {
                const allowed = hourChoices.some((hour) =>
                  minuteChoices.some((minute) => isAllowed(hour, minute, period)),
                );
                return (
                  <Pressable
                    key={period}
                    disabled={!allowed}
                    style={[
                      styles.periodChip,
                      draftPeriod === period && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                      !allowed && styles.disabled,
                    ]}
                    onPress={() => apply(draftHour12, draftMinute, period)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        draftPeriod === period && { color: primaryColor },
                        !allowed && styles.disabledText,
                      ]}
                    >
                      {period}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.groupLabel}>Hour</Text>
            <View style={styles.grid}>
              {hourChoices.map((hour) => {
                const allowed = minuteChoices.some((minute) => isAllowed(hour, minute, draftPeriod));
                const active = draftHour12 === hour;
                return (
                  <Pressable
                    key={hour}
                    disabled={!allowed}
                    style={[
                      styles.choice,
                      active && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                      !allowed && styles.disabled,
                    ]}
                    onPress={() => apply(hour, draftMinute, draftPeriod)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        active && { color: primaryColor },
                        !allowed && styles.disabledText,
                      ]}
                    >
                      {hour}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.groupLabel}>Minutes</Text>
            <View style={styles.grid}>
              {minuteChoices.map((minute) => {
                const allowed = isAllowed(draftHour12, minute, draftPeriod);
                const active = draftMinute === minute;
                return (
                  <Pressable
                    key={minute}
                    disabled={!allowed}
                    style={[
                      styles.choice,
                      active && { backgroundColor: `${primaryColor}18`, borderColor: primaryColor },
                      !allowed && styles.disabled,
                    ]}
                    onPress={() => apply(draftHour12, minute, draftPeriod)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        active && { color: primaryColor },
                        !allowed && styles.disabledText,
                      ]}
                    >
                      {pad(minute)}
                    </Text>
                  </Pressable>
                );
              })}
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
  label: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  triggerText: { ...typography.body, color: colors.foreground, flex: 1 },
  placeholder: { color: colors.mutedForeground },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.35)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  sheetTitle: { ...typography.title, color: colors.foreground },
  sheetSubtitle: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
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
  choiceText: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  disabledText: { color: colors.mutedForeground },
  helper: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
