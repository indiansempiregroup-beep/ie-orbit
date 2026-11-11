import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SearchBar } from './SearchBar';
import { FieldLabel } from './ui/FieldLabel';
import { SheetHandle } from './SheetHandle';
import { ExpandableSheetView, useExpandableSheet } from '../hooks/useExpandableSheet';
import { fieldStyles } from './ui/fieldStyles';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';

function resolveDisplay<T>(
  value: string,
  selectedLabel: string | undefined,
  items: T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string,
  emptyOption?: { value: string; label: string },
): string {
  if (selectedLabel) return selectedLabel;
  const hit = items.find((item) => getId(item) === value);
  if (hit) return getLabel(hit);
  if (emptyOption && value === emptyOption.value) return emptyOption.label;
  return '';
}

export type TypeaheadSelectFieldProps<T> = {
  label: string;
  value: string;
  selectedLabel?: string;
  items: T[];
  loading?: boolean;
  hasMore?: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onChange: (id: string, item: T | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | undefined;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  disabled?: boolean;
  emptyOption?: { value: string; label: string };
  noResultsLabel?: string;
  hasMoreLabel?: string;
  filterItem?: (item: T) => boolean;
};

export function TypeaheadSelectField<T>({
  label,
  value,
  selectedLabel,
  items,
  loading = false,
  hasMore = false,
  query,
  onQueryChange,
  onChange,
  getId,
  getLabel,
  getDescription,
  placeholder = 'Search…',
  required,
  optional,
  error,
  hint,
  disabled,
  emptyOption,
  noResultsLabel = 'No matches',
  hasMoreLabel = 'Keep typing to narrow results',
  filterItem,
}: TypeaheadSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const { lift, bottomPad, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(0.7, open, {
    fixedResting: true,
  });

  useEffect(() => {
    if (!open) onQueryChange('');
  }, [open, onQueryChange]);

  const displayLabel = resolveDisplay(value, selectedLabel, items, getId, getLabel, emptyOption);

  const visibleItems = filterItem ? items.filter(filterItem) : items;

  function close() {
    setOpen(false);
  }

  function choose(id: string, item: T | null) {
    onChange(id, item);
    close();
  }

  return (
    <View style={fieldStyles.wrap}>
      <FieldLabel label={label} required={required} optional={optional} />
      <Pressable
        style={({ pressed }) => [
          fieldStyles.control,
          pressed && fieldStyles.controlPressed,
          error ? fieldStyles.controlError : null,
          disabled && styles.disabled,
        ]}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text style={[fieldStyles.value, !value && fieldStyles.placeholder]} numberOfLines={1}>
          {value ? displayLabel || value : placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      {error ? <Text style={fieldStyles.error}>{error}</Text> : null}
      {hint && !error ? <Text style={fieldStyles.hint}>{hint}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
          <ExpandableSheetView
            onLayout={onSheetLayout}
            style={[styles.sheet, { marginBottom: lift, paddingBottom: bottomPad }, sheetMotionStyle]}
          >
            <SheetHandle {...handleProps} tone="muted" />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
                <Text style={styles.sheetSubtitle}>Type to search · first 25 matches</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <SearchBar value={query} onChangeText={onQueryChange} placeholder={placeholder} style={styles.search} />

            {emptyOption ? (
              <Pressable
                style={({ pressed }) => [styles.option, !value && styles.optionActive, pressed && styles.optionPressed]}
                onPress={() => choose(emptyOption.value, null)}
              >
                <Text style={[styles.optionLabel, !value && styles.optionLabelActive]}>{emptyOption.label}</Text>
                {!value ? <Feather name="check" size={18} color={colors.primary} /> : null}
              </Pressable>
            ) : null}

            {loading && visibleItems.length === 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={visibleItems}
                keyExtractor={(item) => getId(item)}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={visibleItems.length === 0 ? styles.listEmptyContent : styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Feather name="search" size={22} color={colors.mutedForeground} />
                    <Text style={styles.emptyTitle}>{noResultsLabel}</Text>
                    <Text style={styles.emptyCopy}>Try a different name or phone.</Text>
                  </View>
                }
                ListFooterComponent={
                  hasMore ? (
                    <Text style={styles.hasMore}>{hasMoreLabel}</Text>
                  ) : loading ? (
                    <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
                  ) : null
                }
                renderItem={({ item }) => {
                  const id = getId(item);
                  const active = id === value;
                  const description = getDescription?.(item);
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.option,
                        active && styles.optionActive,
                        pressed && styles.optionPressed,
                      ]}
                      onPress={() => choose(id, item)}
                    >
                      <View style={styles.optionCopy}>
                        <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={2}>
                          {getLabel(item)}
                        </Text>
                        {description ? (
                          <Text style={styles.optionDescription} numberOfLines={1}>
                            {description}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Feather name="check" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </ExpandableSheetView>
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
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: '#142033',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
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
  search: { marginBottom: spacing.md },
  list: { flex: 1, maxHeight: 360 },
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
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionActive: { backgroundColor: colors.secondary },
  optionPressed: { backgroundColor: colors.muted },
  optionLabel: { ...typography.body, color: colors.foreground, flex: 1 },
  optionLabelActive: { color: colors.primary, fontWeight: '600' },
  optionDescription: { ...typography.caption, color: colors.mutedForeground },
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  emptyCopy: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
  hasMore: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  footerSpinner: { paddingVertical: spacing.md },
  disabled: { opacity: 0.55 },
});
