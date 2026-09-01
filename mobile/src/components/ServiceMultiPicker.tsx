import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from './ui/Card';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatMoney } from '../utils/format';
import { resolveMediaUrl } from '../utils/mediaUrl';

export type DiscoverServiceOption = {
  id: string;
  name: string;
  duration_minutes: number;
  currency?: string;
  price?: number | string;
  image_url?: string | null;
  category_name?: string | null;
};

type Props = {
  services: DiscoverServiceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  primaryColor?: string;
  emptyLabel?: string;
};

function compactSummaryLabel(services: DiscoverServiceOption[]): string {
  if (!services.length) return '';
  if (services.length === 1) return services[0].name;
  if (services.length === 2) return `${services[0].name}, ${services[1].name}`;
  return `${services[0].name}, ${services[1].name} + ${services.length - 2} more`;
}

export function ServiceMultiPicker({
  services,
  selectedIds,
  onChange,
  primaryColor = colors.primary,
  emptyLabel = 'Choose services below to build your visit',
}: Props) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const selectedServices = useMemo(
    () =>
      selectedIds
        .map((id) => services.find((service) => service.id === id))
        .filter((service): service is DiscoverServiceOption => Boolean(service)),
    [selectedIds, services],
  );

  const availableServices = useMemo(() => {
    if (!selectedIds.length) return services;
    return services.filter((service) => !selectedIds.includes(service.id));
  }, [services, selectedIds]);

  const groupedAvailable = useMemo(() => {
    const groups = new Map<string, DiscoverServiceOption[]>();
    for (const service of availableServices) {
      const key = service.category_name || 'General';
      const list = groups.get(key) ?? [];
      list.push(service);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [availableServices]);

  const totalDuration = selectedServices.reduce((sum, service) => sum + (service.duration_minutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
  const bookingCurrency = selectedServices[0]?.currency;
  const summaryLine = compactSummaryLabel(selectedServices);

  function addService(serviceId: string) {
    if (selectedIds.includes(serviceId)) return;
    onChange([...selectedIds, serviceId]);
  }

  function removeService(serviceId: string) {
    const next = selectedIds.filter((id) => id !== serviceId);
    onChange(next);
    if (next.length === 0) setSummaryExpanded(false);
  }

  function clearAll() {
    onChange([]);
    setSummaryExpanded(false);
  }

  return (
    <View style={styles.root}>
      {selectedServices.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryCopy}>
              <View style={styles.summaryTitleRow}>
                <Text style={styles.summaryTitle}>Your visit</Text>
                <View style={[styles.countBadge, { backgroundColor: primaryColor }]}>
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
                <Text style={[styles.clearLink, { color: primaryColor }]}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={() => setSummaryExpanded((value) => !value)}
                hitSlop={8}
                style={styles.expandBtn}
              >
                <Feather
                  name={summaryExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={primaryColor}
                />
              </Pressable>
            </View>
          </View>

          {summaryExpanded ? (
            <ScrollView style={styles.summaryList} nestedScrollEnabled>
              {selectedServices.map((service, index) => (
                <View key={service.id} style={styles.summaryRow}>
                  <View style={[styles.orderBadge, { backgroundColor: primaryColor }]}>
                    <Text style={styles.orderText}>{index + 1}</Text>
                  </View>
                  <View style={styles.summaryBody}>
                    <Text style={styles.summaryRowTitle} numberOfLines={1}>
                      {service.name}
                    </Text>
                    <Text style={styles.summaryRowMeta}>
                      {service.duration_minutes} min · {service.currency} {service.price}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeService(service.id)} hitSlop={8}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.totalsRow}>
            <Text style={styles.totalsMeta}>{totalDuration} min total</Text>
            <Text style={[styles.totalsPrice, { color: primaryColor }]}>
              {formatMoney(totalPrice, bookingCurrency)}
            </Text>
          </View>
        </Card>
      ) : (
        <Card style={styles.emptyCard}>
          <Feather name="layers" size={18} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </Card>
      )}

      <View style={styles.browseHeader}>
        <Text style={styles.browseTitle}>
          {selectedServices.length > 0 ? 'Add another service' : 'Choose services'}
        </Text>
        {selectedServices.length > 0 ? (
          <Text style={styles.browseMeta}>{availableServices.length} available</Text>
        ) : null}
      </View>

      {groupedAvailable.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {selectedServices.length > 0
              ? 'All services added. Expand your visit summary above to review or remove items.'
              : 'No services available right now.'}
          </Text>
        </Card>
      ) : (
        <ScrollView
          style={styles.browseList}
          contentContainerStyle={styles.browseListContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {groupedAvailable.map(([category, categoryServices]) => (
            <View key={category} style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>{category}</Text>
              {categoryServices.map((service) => (
                <Pressable key={service.id} style={styles.option} onPress={() => addService(service.id)}>
                  {service.image_url ? (
                    <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: `${primaryColor}12` }]}>
                      <Feather name="plus" size={18} color={primaryColor} />
                    </View>
                  )}
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{service.name}</Text>
                    <Text style={styles.optionMeta}>{service.duration_minutes} min</Text>
                  </View>
                  <View style={styles.optionRight}>
                    <Text style={styles.optionPrice}>
                      {service.currency} {service.price}
                    </Text>
                    <View style={[styles.addBtn, { borderColor: primaryColor, backgroundColor: `${primaryColor}12` }]}>
                      <Feather name="plus" size={14} color={primaryColor} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {selectedServices.length > 1 ? (
        <Text style={styles.sequenceHint}>Services are scheduled in the order you add them.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  summaryCard: { gap: spacing.sm },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryCopy: { flex: 1, gap: 4 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  summaryLine: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  summaryActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clearLink: { ...typography.caption, fontWeight: '600' },
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
  },
  countBadgeText: { ...typography.tiny, color: '#fff', fontWeight: '700' },
  summaryList: { maxHeight: 168 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { ...typography.tiny, color: '#fff', fontWeight: '700' },
  summaryBody: { flex: 1, minWidth: 0 },
  summaryRowTitle: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  summaryRowMeta: { ...typography.tiny, color: colors.mutedForeground, marginTop: 2 },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalsMeta: { ...typography.caption, color: colors.mutedForeground },
  totalsPrice: { ...typography.label, fontWeight: '800' },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderStyle: 'dashed',
  },
  emptyText: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  browseTitle: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  browseMeta: { ...typography.caption, color: colors.mutedForeground },
  browseList: { maxHeight: 360 },
  browseListContent: { gap: spacing.sm, paddingBottom: spacing.xs },
  categoryBlock: { gap: spacing.sm },
  categoryLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
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
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionBody: { flex: 1, minWidth: 0 },
  optionTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  optionMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  optionRight: { alignItems: 'flex-end', gap: spacing.sm },
  optionPrice: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  addBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sequenceHint: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
});
