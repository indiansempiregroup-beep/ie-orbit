import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopMasterKind, ShopMasterRecord } from '@ie-orbit/sdk';
import type { TFunction } from 'i18next';
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

type KindDef = {
  kind: ShopMasterKind;
  icon: keyof typeof Feather.glyphMap;
  tone: IconTone;
};

type KindMeta = KindDef & {
  title: string;
  subtitle: string;
  placeholder: string;
};

const KINDS: KindDef[] = [
  {
    kind: 'category',
    icon: 'grid',
    tone: 'navy',
  },
  {
    kind: 'brand',
    icon: 'tag',
    tone: 'amber',
  },
  {
    kind: 'unit',
    icon: 'box',
    tone: 'cyan',
  },
  {
    kind: 'expense_category',
    icon: 'trending-down',
    tone: 'coral',
  },
  {
    kind: 'income_category',
    icon: 'trending-up',
    tone: 'green',
  },
  {
    kind: 'tax_rate',
    icon: 'percent',
    tone: 'violet',
  },
  {
    kind: 'pet_species',
    icon: 'heart',
    tone: 'rose',
  },
];

const RELATED = [
  { labelKey: 'opsApp.shop.masterFiles.relatedGodowns', route: 'ShopGodowns' as const, icon: 'home' as const, tone: 'navy' as IconTone },
  { labelKey: 'opsApp.shop.masterFiles.relatedCash', route: 'ShopBooksCash' as const, icon: 'credit-card' as const, tone: 'green' as IconTone },
  { labelKey: 'opsApp.shop.masterFiles.relatedParties', route: 'ShopBooksParties' as const, icon: 'users' as const, tone: 'cyan' as IconTone },
];

type KindProps = NativeStackScreenProps<RootStackParamList, 'ShopMasterKind'>;
type FilterKey = 'all' | 'active' | 'inactive';

function kindMeta(kind: string, t: TFunction): KindMeta {
  const known = KINDS.find((item) => item.kind === kind);
  const def: KindDef = known || {
    kind: kind as ShopMasterKind,
    icon: 'database',
    tone: 'navy',
  };
  return {
    ...def,
    title: known ? t(`shop.masterFiles.kinds.${kind}.title`) : t('opsApp.shop.masterFiles.fallbackTitle'),
    subtitle: known ? t(`shop.masterFiles.kinds.${kind}.blurb`) : t('shop.masterFiles.fallbackBlurb'),
    placeholder: known
      ? t(`shop.masterFiles.kinds.${kind}.placeholder`)
      : t('shop.masterFiles.fallbackPlaceholder'),
  };
}

export function ShopMasterFilesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FormScreen>
      <FormHero subtitle={t('shop.masterFiles.subtitle')} />

      <Text style={styles.sectionLabel}>{t('opsApp.shop.masterFiles.lookups')}</Text>
      <GroupedList>
        {KINDS.map((item) => (
          <Pressable
            key={item.kind}
            onPress={() => navigation.navigate('ShopMasterKind', { kind: item.kind, title: t(`shop.masterFiles.kinds.${item.kind}.title`) })}
            style={({ pressed }) => [styles.hubRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <IconBadge icon={item.icon} tone={item.tone} />
            <View style={styles.copy}>
              <Text style={styles.subject}>{t(`shop.masterFiles.kinds.${item.kind}.title`)}</Text>
              <Text style={styles.detail}>{t(`shop.masterFiles.kinds.${item.kind}.blurb`)}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </GroupedList>

      <Text style={styles.sectionLabel}>{t('shop.masterFiles.alsoInShop')}</Text>
      <GroupedList>
        {RELATED.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={({ pressed }) => [styles.hubRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <IconBadge icon={item.icon} tone={item.tone} size="sm" />
            <Text style={[styles.subject, styles.copy]}>{t(item.labelKey)}</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </GroupedList>
    </FormScreen>
  );
}

export function ShopMasterKindScreen() {
  const { t } = useTranslation();
  const route = useRoute<KindProps['route']>();
  const navigation = useNavigation();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const kind = route.params.kind;
  const meta = kindMeta(kind, t);
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
      toast.push(getApiErrorMessage(err, t('opsApp.shop.masterFiles.loadFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, kind, toast, t]);

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
      toast.push(t('shop.masterFiles.toastAdded'), 'success');
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
      toast.push(getApiErrorMessage(err, t('shop.masterFiles.errSave')), 'error');
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
      toast.push(row.is_active ? t('opsApp.shop.masterFiles.toastHidden') : t('opsApp.shop.masterFiles.toastShown'), 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.masterFiles.errSave')), 'error');
    } finally {
      setRowBusyId(null);
    }
  }

  async function removeRow(row: ShopMasterRecord) {
    if (!client || rowBusyId) return;
    const ok = await confirmAction({
      title: t('opsApp.shop.masterFiles.deleteTitle', { label: row.label }),
      message: t('opsApp.shop.masterFiles.deleteMessage'),
      confirmLabel: t('shop.masterFiles.delete'),
      destructive: true,
    });
    if (!ok) return;
    setRowBusyId(row.id);
    try {
      await client.shop.deleteMasterRecord(kind, row.id);
      setItems((current) => current.filter((item) => item.id !== row.id));
      toast.push(t('shop.masterFiles.toastRemoved'), 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.masterFiles.errSave')), 'error');
    } finally {
      setRowBusyId(null);
    }
  }

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: t('shop.masterFiles.filterAll'), count: counts.total },
    { key: 'active', label: t('shop.products.statuses.active'), count: counts.active },
    { key: 'inactive', label: t('shop.masterFiles.filterHidden'), count: counts.inactive },
  ];

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          icon="plus"
          label={busy ? t('shop.masterFiles.adding') : kind === 'tax_rate' ? t('opsApp.shop.masterFiles.addRate') : t('opsApp.shop.masterFiles.addValue')}
          loading={busy}
          fullWidth
          disabled={!label.trim()}
          onPress={() => void addRow()}
        />
      }
    >
      <FormHero subtitle={meta.subtitle} />

      <FormSection title={t('shop.masterFiles.addNew')} subtitle={t('shop.masterFiles.addNewHint')}>
        <Input
          label={kind === 'tax_rate' ? t('shop.masterFiles.label') : t('shop.masterFiles.name')}
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
            label={t('shop.masterFiles.ratePercent')}
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
          {t('shop.masterFiles.values')}{counts.total ? ` · ${counts.total}` : ''}
        </Text>
      </View>

      {items.length > 0 ? (
        <>
          <Input
            label={t('opsApp.shop.masterFiles.search')}
            optional
            value={search}
            onChangeText={setSearch}
            placeholder={t('shop.masterFiles.filterByName')}
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
          title={t('opsApp.shop.masterFiles.nothingTitle')}
          message={kind === 'tax_rate' ? t('opsApp.shop.masterFiles.addFirstRate') : t('opsApp.shop.masterFiles.addFirstValue')}
          icon={meta.icon}
        />
      ) : null}

      {!loading && items.length > 0 && !visible.length ? (
        <EmptyState title={t('opsApp.shop.masterFiles.noMatches')} message={t('opsApp.shop.masterFiles.tryAnother')} icon="search" />
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
                    {kind === 'tax_rate' && item.value
                      ? `${item.value}%`
                      : item.is_active
                        ? t('shop.products.statuses.active')
                        : t('shop.masterFiles.hiddenFromPickers')}
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
                      accessibilityLabel={item.is_active ? t('shop.masterFiles.hideFromPickers') : t('shop.masterFiles.showInPickers')}
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
                      accessibilityLabel={t('opsApp.shop.masterFiles.deleteNamed', { label: item.label })}
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
