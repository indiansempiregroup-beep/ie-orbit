import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopMasterKind, ShopMasterRecord } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormHero } from '../../components/FormHero';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormSection } from '../../components/ui/FormSection';
import { GroupedList } from '../../components/ui/GroupedList';
import { IconBadge } from '../../components/ui/IconBadge';
import { colors, fonts, radius, spacing, typography, type IconTone } from '../../theme/tokens';
import { confirmAction } from '../../utils/confirmAction';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type KindMeta = {
  kind: ShopMasterKind;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  tone: IconTone;
  placeholder: string;
};

const KINDS: KindMeta[] = [
  {
    kind: 'category',
    title: 'Product categories',
    subtitle: 'Used on products and store filters',
    icon: 'grid',
    tone: 'navy',
    placeholder: 'e.g. Pet food',
  },
  {
    kind: 'brand',
    title: 'Brands',
    subtitle: 'Reusable brand names on products',
    icon: 'tag',
    tone: 'amber',
    placeholder: 'e.g. Pedigree',
  },
  {
    kind: 'unit',
    title: 'Units',
    subtitle: 'Pcs, kg, litre, and more',
    icon: 'box',
    tone: 'cyan',
    placeholder: 'e.g. Bundle',
  },
  {
    kind: 'expense_category',
    title: 'Expense categories',
    subtitle: 'Books expense entries',
    icon: 'trending-down',
    tone: 'coral',
    placeholder: 'e.g. Packaging',
  },
  {
    kind: 'income_category',
    title: 'Income categories',
    subtitle: 'Other income entries',
    icon: 'trending-up',
    tone: 'green',
    placeholder: 'e.g. Commission',
  },
  {
    kind: 'tax_rate',
    title: 'Tax rates',
    subtitle: 'GST % presets for products',
    icon: 'percent',
    tone: 'violet',
    placeholder: 'e.g. GST 18%',
  },
  {
    kind: 'pet_species',
    title: 'Pet species',
    subtitle: 'Dog, Cat, and custom species',
    icon: 'heart',
    tone: 'rose',
    placeholder: 'e.g. Hamster',
  },
];

const RELATED = [
  { label: 'Godowns', route: 'ShopGodowns' as const, icon: 'home' as const, tone: 'navy' as IconTone },
  { label: 'Cash & bank accounts', route: 'ShopBooksCash' as const, icon: 'credit-card' as const, tone: 'green' as IconTone },
  { label: 'Parties / suppliers', route: 'ShopBooksParties' as const, icon: 'users' as const, tone: 'cyan' as IconTone },
];

type KindProps = NativeStackScreenProps<RootStackParamList, 'ShopMasterKind'>;
type FilterKey = 'all' | 'active' | 'inactive';

function kindMeta(kind: string): KindMeta {
  return KINDS.find((item) => item.kind === kind) || {
    kind: kind as ShopMasterKind,
    title: 'Master',
    subtitle: 'Reusable shop values',
    icon: 'database',
    tone: 'navy',
    placeholder: 'New value',
  };
}

export function ShopMasterFilesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FormScreen>
      <FormHero subtitle="Reusable lists for products and books — add once, pick everywhere." />

      <Text style={styles.sectionLabel}>Lookups</Text>
      <GroupedList>
        {KINDS.map((item) => (
          <Pressable
            key={item.kind}
            onPress={() => navigation.navigate('ShopMasterKind', { kind: item.kind, title: item.title })}
            style={({ pressed }) => [styles.hubRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <IconBadge icon={item.icon} tone={item.tone} />
            <View style={styles.copy}>
              <Text style={styles.subject}>{item.title}</Text>
              <Text style={styles.detail}>{item.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </GroupedList>

      <Text style={styles.sectionLabel}>Also in your shop</Text>
      <GroupedList>
        {RELATED.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={({ pressed }) => [styles.hubRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <IconBadge icon={item.icon} tone={item.tone} size="sm" />
            <Text style={[styles.subject, styles.copy]}>{item.label}</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </GroupedList>
    </FormScreen>
  );
}

export function ShopMasterKindScreen() {
  const route = useRoute<KindProps['route']>();
  const navigation = useNavigation();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const kind = route.params.kind;
  const meta = kindMeta(kind);
  const [items, setItems] = useState<ShopMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: route.params.title || meta.title });
  }, [meta.title, navigation, route.params.title]);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    try {
      const response = await client.shop.listMasterRecords(kind, {
        business_id: businessId,
        include_inactive: true,
      });
      setItems(response.data.items ?? []);
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to load master list'), 'error');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, kind, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const counts = useMemo(() => {
    const active = items.filter((row) => row.is_active).length;
    return { total: items.length, active, inactive: items.length - active };
  }, [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((row) => {
      if (filter === 'active' && !row.is_active) return false;
      if (filter === 'inactive' && row.is_active) return false;
      if (!q) return true;
      return (
        row.label.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        String(row.value || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [filter, items, search]);

  async function addRow() {
    if (!client || !businessId || !label.trim()) return;
    setBusy(true);
    try {
      const created = await client.shop.createMasterRecord(kind, {
        business_id: businessId,
        label: label.trim(),
        value: kind === 'tax_rate' ? value.trim() || label.trim().replace(/[^\d.]/g, '') : value.trim(),
      });
      setLabel('');
      setValue('');
      setFilter('all');
      setSearch('');
      toast.push('Added.', 'success');
      setItems((current) => {
        if (current.some((row) => row.id === created.data.id)) {
          return current.map((row) => (row.id === created.data.id ? created.data : row));
        }
        return [...current, created.data].sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.label.localeCompare(b.label);
        });
      });
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to save'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: ShopMasterRecord) {
    if (!client || rowBusyId) return;
    setRowBusyId(row.id);
    try {
      const updated = await client.shop.patchMasterRecord(kind, row.id, { is_active: !row.is_active });
      setItems((current) => current.map((item) => (item.id === row.id ? updated.data : item)));
      toast.push(row.is_active ? 'Hidden from pickers.' : 'Shown in pickers.', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to update'), 'error');
    } finally {
      setRowBusyId(null);
    }
  }

  async function removeRow(row: ShopMasterRecord) {
    if (!client || rowBusyId) return;
    const ok = await confirmAction({
      title: `Delete “${row.label}”?`,
      message: 'This removes it from master files. You can add it again later if needed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setRowBusyId(row.id);
    try {
      await client.shop.deleteMasterRecord(kind, row.id);
      setItems((current) => current.filter((item) => item.id !== row.id));
      toast.push('Deleted.', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to delete'), 'error');
    } finally {
      setRowBusyId(null);
    }
  }

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'inactive', label: 'Hidden', count: counts.inactive },
  ];

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          icon="plus"
          label={busy ? 'Adding…' : `Add ${kind === 'tax_rate' ? 'rate' : 'value'}`}
          loading={busy}
          fullWidth
          disabled={!label.trim()}
          onPress={() => void addRow()}
        />
      }
    >
      <FormHero subtitle={meta.subtitle} />

      <FormSection title="Add new" subtitle="Saved values appear in product and books pickers.">
        <Input
          label={kind === 'tax_rate' ? 'Label' : 'Name'}
          required
          value={label}
          onChangeText={setLabel}
          placeholder={meta.placeholder}
          onSubmitEditing={() => {
            if (label.trim() && !busy) void addRow();
          }}
          returnKeyType="done"
        />
        {kind === 'tax_rate' ? (
          <Input
            label="Rate %"
            optional
            value={value}
            onChangeText={setValue}
            placeholder="18"
            keyboardType="decimal-pad"
          />
        ) : null}
      </FormSection>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>
          Values{counts.total ? ` · ${counts.total}` : ''}
        </Text>
      </View>

      {items.length > 0 ? (
        <>
          <Input
            label="Search"
            optional
            value={search}
            onChangeText={setSearch}
            placeholder="Filter by name"
            leftIcon="search"
          />
          <View style={styles.chips}>
            {filters.map((item) => {
              const on = filter === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setFilter(item.key)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {item.label}
                    {item.count ? ` ${item.count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.centeredPad}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {!loading && !items.length ? (
        <EmptyState
          title="Nothing here yet"
          message={`Add your first ${kind === 'tax_rate' ? 'tax rate' : 'value'} above.`}
          icon={meta.icon}
        />
      ) : null}

      {!loading && items.length > 0 && !visible.length ? (
        <EmptyState title="No matches" message="Try another search or filter." icon="search" />
      ) : null}

      {visible.length ? (
        <GroupedList>
          {visible.map((item) => {
            const busyRow = rowBusyId === item.id;
            return (
              <View key={item.id} style={[styles.itemRow, !item.is_active && styles.itemInactive]}>
                <IconBadge
                  icon={item.is_active ? meta.icon : 'eye-off'}
                  tone={item.is_active ? meta.tone : 'navy'}
                  size="sm"
                />
                <View style={styles.copy}>
                  <Text style={styles.subject}>{item.label}</Text>
                  <Text style={styles.detail}>
                    {kind === 'tax_rate' && item.value ? `${item.value}%` : item.is_active ? 'Active' : 'Hidden from pickers'}
                  </Text>
                </View>
                {busyRow ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={styles.itemActions}>
                    <Pressable
                      onPress={() => void toggleActive(item)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={item.is_active ? 'Hide from pickers' : 'Show in pickers'}
                    >
                      <Feather
                        name={item.is_active ? 'eye-off' : 'eye'}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void removeRow(item)}
                      hitSlop={8}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.label}`}
                    >
                      <Feather name="trash-2" size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </GroupedList>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  subject: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 15 },
  detail: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  pressed: { opacity: 0.92 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.foreground },
  chipTextOn: { color: colors.primaryForeground },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  itemInactive: { opacity: 0.72 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  centeredPad: { paddingVertical: spacing.xl, alignItems: 'center' },
});
