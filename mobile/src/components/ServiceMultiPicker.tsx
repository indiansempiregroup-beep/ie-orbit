import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Chip } from './ui/Chip';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { withAlpha } from '../theme/colorUtils';
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

export function ServiceMultiPicker({
  services,
  selectedIds,
  onChange,
  primaryColor = colors.primary,
  emptyLabel = 'Choose services to build your visit',
}: Props) {
  const [category, setCategory] = useState('All');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedServices = useMemo(
    () =>
      selectedIds
        .map((id) => services.find((service) => service.id === id))
        .filter((service): service is DiscoverServiceOption => Boolean(service)),
    [selectedIds, services],
  );

  const categories = useMemo(() => {
    const names = [...new Set(services.map((service) => service.category_name || 'General'))];
    return names.length > 1 ? ['All', ...names] : [];
  }, [services]);

  const visible = useMemo(() => {
    if (category === 'All') return services;
    return services.filter((service) => (service.category_name || 'General') === category);
  }, [services, category]);

  const totalDuration = selectedServices.reduce((sum, service) => sum + (service.duration_minutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, service) => sum + (Number(service.price) || 0), 0);
  const bookingCurrency = selectedServices[0]?.currency;

  function toggleService(serviceId: string) {
    if (selectedSet.has(serviceId)) {
      onChange(selectedIds.filter((id) => id !== serviceId));
      return;
    }
    onChange([...selectedIds, serviceId]);
  }

  if (!services.length) {
    return (
      <View style={styles.emptyCard}>
        <Feather name="layers" size={18} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {selectedServices.length > 0 ? (
        <View style={styles.visitCard}>
          <View style={styles.visitHeader}>
            <View style={[styles.countBadge, { backgroundColor: primaryColor }]}>
              <Text style={styles.countBadgeText}>{selectedServices.length}</Text>
            </View>
            <View style={styles.visitCopy}>
              <Text style={styles.visitTitle}>Your visit</Text>
              <Text style={styles.visitMeta}>
                {totalDuration} min · {formatMoney(totalPrice, bookingCurrency)}
              </Text>
            </View>
            <Pressable onPress={() => onChange([])} hitSlop={8}>
              <Text style={[styles.clearLink, { color: primaryColor }]}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.selectedChips}>
            {selectedServices.map((service, index) => (
              <Pressable
                key={service.id}
                onPress={() => toggleService(service.id)}
                style={styles.selectedChip}
              >
                <Text style={styles.selectedChipIndex}>{index + 1}</Text>
                <Text style={styles.selectedChipLabel} numberOfLines={1}>
                  {service.name}
                </Text>
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
          {selectedServices.length > 1 ? (
            <Text style={styles.sequenceHint}>Scheduled in the order you tap them.</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Feather name="plus-circle" size={18} color={primaryColor} />
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      )}

      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((name) => (
            <Chip
              key={name}
              label={name}
              active={category === name}
              primaryColor={primaryColor}
              onPress={() => setCategory(name)}
            />
          ))}
        </ScrollView>
      ) : null}

      {visible.map((service) => {
        const selected = selectedSet.has(service.id);
        return (
          <Pressable
            key={service.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => toggleService(service.id)}
            style={[
              styles.option,
              selected && { borderColor: primaryColor, backgroundColor: withAlpha(primaryColor, 0.06) },
            ]}
          >
            {service.image_url ? (
              <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: withAlpha(primaryColor, 0.12) }]}>
                <Feather name="scissors" size={18} color={primaryColor} />
              </View>
            )}
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>{service.name}</Text>
              <Text style={styles.optionMeta}>{service.duration_minutes} min</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={styles.optionPrice}>
                {formatMoney(Number(service.price) || 0, service.currency)}
              </Text>
              <View
                style={[
                  styles.check,
                  selected
                    ? { backgroundColor: primaryColor, borderColor: primaryColor }
                    : { borderColor: colors.border },
                ]}
              >
                {selected ? <Feather name="check" size={12} color="#fff" /> : <Feather name="plus" size={12} color={primaryColor} />}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  visitCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  visitHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  visitCopy: { flex: 1 },
  visitTitle: { ...typography.label, fontWeight: '700', color: colors.foreground },
  visitMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  clearLink: { ...typography.caption, fontWeight: '600' },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  selectedChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    backgroundColor: colors.inputBackground,
  },
  selectedChipIndex: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
  selectedChipLabel: { ...typography.caption, color: colors.foreground, fontWeight: '600', maxWidth: 160 },
  sequenceHint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyText: { ...typography.caption, color: colors.mutedForeground, flex: 1, lineHeight: 18 },
  chips: { gap: spacing.sm, paddingVertical: 2 },
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
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionBody: { flex: 1, minWidth: 0 },
  optionTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  optionMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  optionRight: { alignItems: 'flex-end', gap: spacing.sm },
  optionPrice: { ...typography.caption, color: colors.foreground, fontWeight: '700' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBackground,
  },
});
