import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PICKER_PAGE_SIZE, type Service } from '@ie-orbit/sdk';
import { SearchBar } from './SearchBar';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useServices } from '../hooks/useOpsData';
import { Avatar } from './ui/Avatar';
import { Card } from './ui/Card';
import { FieldLabel } from './ui/FieldLabel';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import {
  formatServiceMeta,
  formatServicePrice,
  serviceDurationMinutes,
  serviceImageUrl,
  servicesTotalDurationMinutes,
  servicesTotalPriceLabel,
} from '../utils/services';

type Props = {
  selectedServices: Service[];
  onChange: (services: Service[]) => void;
  nameFor?: (service: Service) => string;
  required?: boolean;
  error?: string;
};

function compactSummaryLabel(services: Service[], nameFor: (service: Service) => string): string {
  if (!services.length) return '';
  if (services.length === 1) return nameFor(services[0]);
  if (services.length === 2) return `${nameFor(services[0])}, ${nameFor(services[1])}`;
  return `${nameFor(services[0])}, ${nameFor(services[1])} + ${services.length - 2} more`;
}

export function ServiceMultiPicker({ selectedServices, onChange, nameFor, required, error }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim());
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const labelFor = nameFor ?? ((service: Service) => service.name ?? service.id);
  const { services, loading: servicesLoading, nextCursor } = useServices({
    q: debouncedSearch || undefined,
    pageSize: PICKER_PAGE_SIZE,
  });
  const selectedIds = useMemo(() => selectedServices.map((service) => service.id), [selectedServices]);

  const browseServices = useMemo(
    () => services.filter((service) => !selectedIds.includes(service.id)),
    [services, selectedIds],
  );

  const totalDuration = servicesTotalDurationMinutes(selectedServices);
  const totalPrice = servicesTotalPriceLabel(selectedServices);
  const summaryLine = compactSummaryLabel(selectedServices, labelFor);

  function addService(service: Service) {
    if (selectedIds.includes(service.id)) return;
    onChange([...selectedServices, service]);
  }

  function removeService(serviceId: string) {
    const next = selectedServices.filter((service) => service.id !== serviceId);
    onChange(next);
    if (next.length === 0) setSummaryExpanded(false);
  }

  function clearAll() {
    onChange([]);
    setSummaryExpanded(false);
  }

  return (
    <View style={styles.root}>
      <FieldLabel label="Services" required={required} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {selectedServices.length > 0 ? (
        <Card style={styles.summaryCard} soft>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderCopy}>
              <View style={styles.summaryTitleRow}>
                <Text style={styles.summaryTitle}>Visit summary</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{selectedServices.length}</Text>
                </View>
              </View>
              {!summaryExpanded ? (
                <Text style={styles.summaryLine} numberOfLines={2}>
                  {summaryLine}
                </Text>
              ) : null}
            </View>
            <View style={styles.summaryActions}>
              <Pressable onPress={clearAll} hitSlop={8}>
                <Text style={styles.clearLink}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => setSummaryExpanded((value) => !value)}
                hitSlop={8}
                style={styles.expandBtn}
              >
                <Feather
                  name={summaryExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.primary}
                />
              </Pressable>
            </View>
          </View>

          {summaryExpanded ? (
            <ScrollView style={styles.summaryList} nestedScrollEnabled>
              {selectedServices.map((service, index) => (
                <View key={service.id} style={styles.summaryRow}>
                  <View style={styles.summaryOrder}>
                    <Text style={styles.summaryOrderText}>{index + 1}</Text>
                  </View>
                  <View style={styles.summaryRowBody}>
                    <Text style={styles.summaryRowTitle} numberOfLines={1}>
                      {labelFor(service)}
                    </Text>
                    <Text style={styles.summaryRowMeta}>
                      {serviceDurationMinutes(service)} min
                      {formatServicePrice(service) ? ` · ${formatServicePrice(service)}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Remove ${labelFor(service)}`}
                    onPress={() => removeService(service.id)}
                    hitSlop={8}
                    style={styles.removeBtn}
                  >
                    <Feather name="x" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.totalsRow}>
            <Text style={styles.totalText}>{totalDuration} min total</Text>
            {totalPrice ? <Text style={styles.totalPrice}>{totalPrice}</Text> : null}
          </View>
        </Card>
      ) : (
        <View style={styles.emptyCart}>
          <Feather name="layers" size={18} color={colors.mutedForeground} />
          <Text style={styles.emptyCartText}>Choose services below to build the visit</Text>
        </View>
      )}

      <View style={styles.browseHeader}>
        <Text style={styles.browseTitle}>
          {selectedServices.length > 0 ? 'Add another service' : 'Choose services'}
        </Text>
        {selectedServices.length > 0 ? (
          <Text style={styles.browseMeta}>{browseServices.length} available</Text>
        ) : null}
      </View>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={selectedServices.length > 0 ? 'Search available services…' : 'Search services…'}
        style={styles.search}
      />

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {servicesLoading && browseServices.length === 0 ? (
          <Text style={styles.emptyListMeta}>Loading services…</Text>
        ) : browseServices.length === 0 ? (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListTitle}>
              {search
                ? 'No services match your search'
                : selectedServices.length > 0
                  ? 'All services added'
                  : 'No services available'}
            </Text>
            <Text style={styles.emptyListMeta}>
              {search
                ? 'Try a different name or clear the search.'
                : selectedServices.length > 0
                  ? 'Expand the visit summary above to review or remove services.'
                  : 'Add services to your catalog first.'}
            </Text>
          </View>
        ) : (
          browseServices.map((service) => (
            <Pressable
              key={service.id}
              onPress={() => addService(service)}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Avatar
                name={labelFor(service)}
                size="md"
                src={serviceImageUrl(service) ?? undefined}
              />
              <View style={styles.optionBody}>
                <Text style={styles.optionTitle} numberOfLines={1}>
                  {labelFor(service)}
                </Text>
                <Text style={styles.optionMeta}>{formatServiceMeta(service)}</Text>
              </View>
              <View style={styles.optionRight}>
                {formatServicePrice(service) ? (
                  <Text style={styles.optionPrice}>{formatServicePrice(service)}</Text>
                ) : null}
                <View style={styles.addBtn}>
                  <Feather name="plus" size={16} color={colors.primary} />
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {selectedServices.length > 1 ? (
        <Text style={styles.sequenceHint}>
          Services run in the order you add them ({totalDuration} min combined).
        </Text>
      ) : null}
      {nextCursor ? (
        <Text style={styles.sequenceHint}>More services available — keep typing to narrow.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  error: { ...typography.caption, color: colors.destructive },
  summaryCard: { gap: spacing.sm },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryHeaderCopy: { flex: 1, gap: 4 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryTitle: { ...typography.label, fontFamily: fonts.bodySemi, color: colors.foreground },
  summaryLine: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clearLink: { ...typography.caption, color: colors.primary, fontFamily: fonts.bodySemi },
  expandBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  countBadgeText: { ...typography.tiny, color: '#fff', fontFamily: fonts.bodyBold },
  summaryList: { maxHeight: 168 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryOrder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  summaryOrderText: { ...typography.tiny, color: '#fff', fontFamily: fonts.bodyBold },
  summaryRowBody: { flex: 1, minWidth: 0 },
  summaryRowTitle: { ...typography.caption, color: colors.foreground, fontFamily: fonts.bodySemi },
  summaryRowMeta: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalText: { ...typography.caption, color: colors.mutedForeground, fontFamily: fonts.bodyMedium },
  totalPrice: { ...typography.caption, color: colors.primary, fontFamily: fonts.bodyBold },
  emptyCart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyCartText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  browseTitle: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  browseMeta: { ...typography.caption, color: colors.mutedForeground },
  search: { marginBottom: 0 },
  list: { maxHeight: 320 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionPressed: { opacity: 0.94 },
  optionBody: { flex: 1, minWidth: 0 },
  optionTitle: { ...typography.label, color: colors.foreground, fontFamily: fonts.bodySemi },
  optionMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  optionRight: { alignItems: 'flex-end', gap: spacing.sm },
  optionPrice: { ...typography.caption, color: colors.foreground, fontFamily: fonts.bodySemi },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyListTitle: { ...typography.label, color: colors.foreground, textAlign: 'center' },
  emptyListMeta: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
  sequenceHint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
});
