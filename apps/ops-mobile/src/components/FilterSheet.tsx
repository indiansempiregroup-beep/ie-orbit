import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSheetKeyboardLayout } from '../hooks/useSheetKeyboardLayout';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { Button } from './ui/Button';
import { inputReset } from './ui/fieldStyles';
import type { SelectOption } from './SelectField';

type Props = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onApply?: () => void;
  onReset?: () => void;
  children: React.ReactNode;
  /** Render inside an existing Modal — a second Modal freezes iOS. */
  embedded?: boolean;
};

export function FilterSheet({
  visible,
  title = 'Filters',
  onClose,
  onApply,
  onReset,
  children,
  embedded,
}: Props) {
  const { lift, maxHeight, bottomPad } = useSheetKeyboardLayout(0.72);

  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  if (!visible) return null;

  const sheet = (
    <View style={embedded ? styles.embeddedRoot : styles.overlay}>
      <Pressable style={styles.flexFill} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          {
            maxHeight: embedded ? '80%' : maxHeight,
            marginBottom: embedded ? 0 : lift,
            paddingBottom: bottomPad,
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Feather name="x" size={18} color={colors.foreground} />
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          {children}
        </ScrollView>
        <View style={styles.footer}>
          {onReset ? (
            <Pressable onPress={onReset} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reset filters">
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.doneBtn}>
            <Button label="Done" size="sm" fullWidth onPress={onApply ?? onClose} />
          </View>
        </View>
      </View>
    </View>
  );

  if (embedded) return sheet;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}

export function FilterChoiceGroup({
  label,
  value,
  options,
  onChange,
  searchable,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const useList = searchable || options.length > 8;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  if (!useList) {
    return (
      <View style={styles.group}>
        <Text style={styles.groupLabel}>{label}</Text>
        <View style={styles.chipWrap}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value || `${label}-all`}
                style={[styles.choice, active && styles.choiceOn]}
                onPress={() => onChange(option.value)}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextOn]} numberOfLines={1}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.searchWrap}>
        <Feather name="search" size={14} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${label.toLowerCase()}`}
          placeholderTextColor={colors.mutedForeground}
          style={[inputReset, styles.searchInput]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear">
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.optionList}>
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No matches</Text>
        ) : (
          filtered.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={`${label}-${option.value || 'all'}`}
                style={[styles.optionRow, active && styles.optionRowOn]}
                onPress={() => onChange(option.value)}
              >
                <Text style={[styles.optionLabel, active && styles.optionLabelOn]} numberOfLines={1}>
                  {option.label}
                </Text>
                {active ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

export function FilterButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const active = count > 0;
  return (
    <Pressable
      style={[styles.filterBtn, active && styles.filterBtnActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filters, ${count} active` : 'Filters'}
    >
      <Feather name="sliders" size={18} color={active ? colors.primaryForeground : colors.foreground} />
      {active ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  embeddedRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  flexFill: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 18, color: colors.foreground, letterSpacing: -0.2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  resetText: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  doneBtn: { minWidth: 120 },
  group: { gap: spacing.sm },
  groupLabel: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.inputBackground,
  },
  choiceOn: { backgroundColor: colors.primary },
  choiceText: { ...typography.caption, fontFamily: fonts.bodyMedium, color: colors.mutedForeground },
  choiceTextOn: { color: colors.primaryForeground, fontFamily: fonts.bodySemi },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: 0,
  },
  optionList: {
    borderRadius: radius.lg,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionRowOn: { backgroundColor: colors.tint },
  optionLabel: { flex: 1, ...typography.body, color: colors.foreground },
  optionLabelOn: { fontFamily: fonts.bodySemi, color: colors.primary },
  empty: { ...typography.caption, color: colors.mutedForeground, padding: spacing.md },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: fonts.bodyBold, lineHeight: 11 },
});
