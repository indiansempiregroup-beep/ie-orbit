import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FieldLabel } from './ui/FieldLabel';
import { fieldStyles, inputReset } from './ui/fieldStyles';
import { useSheetKeyboardLayout } from '../hooks/useSheetKeyboardLayout';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

export type SelectOption = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show search box. Defaults to true when there are more than 5 options. */
  searchable?: boolean;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable,
  required,
  optional,
  error,
  hint,
}: Props) {
  const { lift, maxHeight, bottomPad } = useSheetKeyboardLayout(0.7);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const showSearch = searchable ?? options.length > 5;

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  return (
    <View style={fieldStyles.wrap}>
      <FieldLabel label={label} required={required} optional={optional} />
      <Pressable
        style={({ pressed }) => [
          fieldStyles.control,
          pressed && fieldStyles.controlPressed,
          error ? fieldStyles.controlError : null,
        ]}
        onPress={() => setOpen(true)}
      >
        <Text style={[fieldStyles.value, !selected && fieldStyles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      {error ? <Text style={fieldStyles.error}>{error}</Text> : null}
      {hint && !error ? <Text style={fieldStyles.hint}>{hint}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              {
                marginBottom: lift,
                paddingBottom: bottomPad,
                maxHeight,
                height: maxHeight,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
                <Text style={styles.sheetSubtitle}>
                  {filtered.length} option{filtered.length === 1 ? '' : 's'}
                  {query.trim() ? ' found' : ''}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            {showSearch ? (
              <View style={styles.searchWrap}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${label.toLowerCase() || 'options'}…`}
                  placeholderTextColor={colors.mutedForeground}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                  style={[inputReset, styles.searchInput]}
                />
                {query.length > 0 && Platform.OS !== 'ios' ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              style={styles.list}
              contentContainerStyle={filtered.length === 0 ? styles.listEmptyContent : styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="search" size={22} color={colors.mutedForeground} />
                  <Text style={styles.emptyTitle}>No matches</Text>
                  <Text style={styles.emptyCopy}>Try a different search term.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      active && styles.optionActive,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={2}>
                      {item.label}
                    </Text>
                    {active ? <Feather name="check" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    minHeight: 280,
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 0,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.sm },
  listEmptyContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxxl },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  optionActive: { backgroundColor: colors.secondary },
  optionPressed: { backgroundColor: colors.muted },
  optionLabel: { ...typography.body, color: colors.foreground, flex: 1 },
  optionLabelActive: { color: colors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  emptyCopy: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
});
