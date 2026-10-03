import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type AmazonFilterOption = { id: string; label: string };

export type AmazonFilterSection = {
  id: string;
  label: string;
  options: AmazonFilterOption[];
};

type SearchFilterToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  primaryColor: string;
  activeFilterCount: number;
  onOpenFilters: () => void;
  activeSummary?: string;
  onClearFilters?: () => void;
  countLabel?: string | null;
  autoCorrect?: boolean;
};

export function SearchFilterToolbar({
  search,
  onSearchChange,
  placeholder,
  primaryColor,
  activeFilterCount,
  onOpenFilters,
  activeSummary,
  onClearFilters,
  countLabel,
  autoCorrect = false,
}: SearchFilterToolbarProps) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.search}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={onSearchChange}
            returnKeyType="search"
            autoCorrect={autoCorrect}
          />
          {search ? (
            <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[
            styles.filterIconBtn,
            activeFilterCount > 0 && {
              borderColor: primaryColor,
              backgroundColor: `${primaryColor}12`,
            },
          ]}
          onPress={onOpenFilters}
          accessibilityLabel="Filters"
        >
          <Feather
            name="sliders"
            size={18}
            color={activeFilterCount > 0 ? primaryColor : colors.foreground}
          />
          {activeFilterCount > 0 ? (
            <View style={[styles.filterBadge, { backgroundColor: primaryColor }]}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {activeFilterCount > 0 && activeSummary ? (
        <View style={styles.activeFilterBar}>
          <Pressable style={styles.activeFilterSummary} onPress={onOpenFilters}>
            <Feather name="filter" size={12} color={primaryColor} />
            <Text style={[styles.activeFilterSummaryText, { color: primaryColor }]} numberOfLines={1}>
              {activeSummary}
            </Text>
          </Pressable>
          {onClearFilters ? (
            <Pressable onPress={onClearFilters} hitSlop={8}>
              <Text style={[styles.clearFilters, { color: primaryColor }]}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {countLabel ? <Text style={styles.count}>{countLabel}</Text> : null}
    </View>
  );
}

type AmazonFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  sections: AmazonFilterSection[];
  values: Record<string, string>;
  onSelect: (sectionId: string, optionId: string) => void;
  onApply: () => void;
  onClear: () => void;
  primaryColor: string;
  initialSectionId?: string;
  applyCount?: number;
};

export function AmazonFilterSheet({
  visible,
  onClose,
  sections,
  values,
  onSelect,
  onApply,
  onClear,
  primaryColor,
  initialSectionId,
  applyCount = 0,
}: AmazonFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState(initialSectionId || sections[0]?.id || '');
  const [valueQuery, setValueQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setActiveSection(initialSectionId || sections[0]?.id || '');
    setValueQuery('');
    // Only reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const section = sections.find((item) => item.id === activeSection) ?? sections[0];
  const filteredOptions = useMemo(() => {
    const options = section?.options ?? [];
    const needle = valueQuery.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((item) => item.label.toLowerCase().includes(needle));
  }, [section, valueQuery]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.filterModalRoot}>
        <Pressable style={styles.filterBackdrop} onPress={onClose} />
        <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close filters">
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.filterBody}>
            <View style={styles.filterLeft}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {sections.map((item) => {
                  const selected = item.id === section?.id;
                  const active = Boolean(values[item.id] && values[item.id] !== 'all' && values[item.id] !== '');
                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.filterNavItem,
                        selected && [styles.filterNavItemOn, { borderLeftColor: primaryColor }],
                      ]}
                      onPress={() => {
                        setActiveSection(item.id);
                        setValueQuery('');
                      }}
                    >
                      <Text
                        style={[
                          styles.filterNavText,
                          selected && { color: primaryColor, fontWeight: '700' },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {active ? <View style={[styles.sectionDot, { backgroundColor: primaryColor }]} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.filterRight}>
              <View style={styles.valueSearchWrap}>
                <Feather name="search" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={styles.valueSearch}
                  placeholder={`Search ${section?.label ?? 'filters'}`}
                  placeholderTextColor={colors.mutedForeground}
                  value={valueQuery}
                  onChangeText={setValueQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {valueQuery ? (
                  <Pressable onPress={() => setValueQuery('')} hitSlop={8}>
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                style={styles.valueList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filteredOptions.length ? (
                  filteredOptions.map((option) => {
                    const selected = values[section?.id ?? ''] === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        style={styles.valueRow}
                        onPress={() => section && onSelect(section.id, option.id)}
                      >
                        <View style={[styles.radio, selected && { borderColor: primaryColor }]}>
                          {selected ? (
                            <View style={[styles.radioDot, { backgroundColor: primaryColor }]} />
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.valueText,
                            selected && { color: primaryColor, fontWeight: '700' },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.valueEmpty}>No matching options</Text>
                )}
              </ScrollView>
            </View>
          </View>

          <View style={styles.filterFooter}>
            <Pressable style={styles.clearBtn} onPress={onClear}>
              <Text style={styles.clearBtnText}>Clear filters</Text>
            </Pressable>
            <Pressable style={[styles.applyBtn, { backgroundColor: primaryColor }]} onPress={onApply}>
              <Text style={styles.applyBtnText}>
                Apply{applyCount ? ` (${applyCount})` : ''}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  activeFilterSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  activeFilterSummaryText: { ...typography.tiny, fontWeight: '700', flexShrink: 1 },
  clearFilters: { ...typography.tiny, fontWeight: '800' },
  count: { ...typography.caption, color: colors.mutedForeground },
  filterModalRoot: { flex: 1, justifyContent: 'flex-end' },
  filterBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.4)' },
  filterSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    minHeight: '72%',
    overflow: 'hidden',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTitle: { ...typography.title, color: colors.foreground, fontSize: 20 },
  filterBody: { flex: 1, flexDirection: 'row', minHeight: 320 },
  filterLeft: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '40%',
    width: '40%',
    maxWidth: '40%',
    backgroundColor: colors.muted,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  filterNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  filterNavItemOn: {
    backgroundColor: colors.card,
  },
  filterNavText: { ...typography.caption, color: colors.foreground, fontWeight: '600', flex: 1 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  filterRight: { flexGrow: 1, flexShrink: 1, flexBasis: '60%', width: '60%', backgroundColor: colors.card },
  valueSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    backgroundColor: colors.background,
  },
  valueSearch: { flex: 1, ...typography.caption, color: colors.foreground, paddingVertical: 8 },
  valueList: { flex: 1, paddingHorizontal: spacing.md },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  valueText: { ...typography.body, color: colors.foreground, flex: 1 },
  valueEmpty: {
    ...typography.caption,
    color: colors.mutedForeground,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  filterFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clearBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  clearBtnText: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  applyBtn: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { ...typography.label, color: '#fff', fontWeight: '800' },
});
