import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { SearchBar } from '../../components/SearchBar';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopDeliveryZone } from '@ie-orbit/sdk';
import { shopListRefreshControl } from './shopRefreshControl';

type ZoneForm = {
  name: string;
  cities: string;
  prefixes: string;
  fee: string;
  minOrder: string;
  notes: string;
  sameDay: boolean;
  instantDelivery: boolean;
  enabled: boolean;
};

const EMPTY_FORM: ZoneForm = {
  name: '',
  cities: '',
  prefixes: '',
  fee: '0',
  minOrder: '0',
  notes: '',
  sameDay: true,
  instantDelivery: false,
  enabled: true,
};

const STATUS_OPTIONS = [
  { value: '', label: 'All zones' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function zoneToForm(zone: ShopDeliveryZone): ZoneForm {
  return {
    name: zone.name,
    cities: (zone.cities ?? []).join(', '),
    prefixes: (zone.postal_prefixes ?? []).join(', '),
    fee: String(zone.fee ?? '0'),
    minOrder: String(zone.min_order_total ?? '0'),
    notes: zone.notes ?? '',
    sameDay: zone.same_day !== false,
    instantDelivery: zone.instant_delivery_enabled === true,
    enabled: zone.enabled !== false,
  };
}

export function ShopDeliveryZonesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [zones, setZones] = useState<ShopDeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ZoneForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }, []);

  const openEdit = useCallback((zone: ShopDeliveryZone) => {
    setEditingId(zone.id);
    setForm(zoneToForm(zone));
    setShowForm(true);
    setError(null);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (showForm) closeForm();
            else openCreate();
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'Add zone'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, openCreate]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listDeliveryZones({ business_id: businessId });
      setZones(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load zones');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return zones.filter((zone) => {
      if (enabledFilter === 'enabled' && !zone.enabled) return false;
      if (enabledFilter === 'disabled' && zone.enabled) return false;
      if (!term) return true;
      return [
        zone.name,
        ...(zone.cities ?? []),
        ...(zone.postal_prefixes ?? []),
        zone.notes ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [zones, search, enabledFilter]);

  function setField<K extends keyof ZoneForm>(key: K, value: ZoneForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!client || !businessId || !form.name.trim()) {
      toast.push('Zone name is required', 'error');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      cities: splitCsv(form.cities),
      postal_prefixes: splitCsv(form.prefixes),
      fee: form.fee.trim() || '0',
      min_order_total: form.minOrder.trim() || '0',
      notes: form.notes.trim(),
      same_day: form.sameDay,
      instant_delivery_enabled: form.instantDelivery,
      enabled: form.enabled,
    };
    try {
      if (editingId) {
        await client.shop.patchDeliveryZone(editingId, payload);
        toast.push('Zone updated.', 'success');
      } else {
        await client.shop.createDeliveryZone(payload);
        toast.push('Zone saved.', 'success');
      }
      closeForm();
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Unable to save zone';
      setError(text);
      toast.push(text, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={saving ? 'Saving…' : editingId ? 'Update zone' : 'Save zone'}
            loading={saving}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
        }
      >
        <Text style={styles.formTitle}>{editingId ? 'Edit delivery zone' : 'Add delivery zone'}</Text>
        <Text style={styles.help}>
          Match checkout addresses by city name and/or postal prefix. Fee is added when the zone
          matches. Deliver now appears only in zones where it is explicitly allowed.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Input
          label="Zone name"
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          placeholder="e.g. Nashik city"
        />
        <Input
          label="Cities"
          value={form.cities}
          onChangeText={(value) => setField('cities', value)}
          placeholder="Nashik, Nasik"
          hint="Comma-separated"
        />
        <Input
          label="Postal prefixes"
          value={form.prefixes}
          onChangeText={(value) => setField('prefixes', value)}
          placeholder="422"
          hint="Comma-separated"
        />
        <Input
          label="Delivery fee"
          value={form.fee}
          onChangeText={(value) => setField('fee', value)}
          keyboardType="decimal-pad"
        />
        <Input
          label="Minimum order"
          value={form.minOrder}
          onChangeText={(value) => setField('minOrder', value)}
          keyboardType="decimal-pad"
        />
        <Input
          label="Notes"
          value={form.notes}
          onChangeText={(value) => setField('notes', value)}
          placeholder="Optional"
          multiline
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Same-day delivery</Text>
          <Switch value={form.sameDay} onValueChange={(value) => setField('sameDay', value)} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Allow Deliver now</Text>
          <Switch
            value={form.instantDelivery}
            onValueChange={(value) => setField('instantDelivery', value)}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Enabled</Text>
          <Switch value={form.enabled} onValueChange={(value) => setField('enabled', value)} />
        </View>
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search zone, city, postal…"
          style={styles.search}
        />
        <SelectField
          label="Availability"
          value={enabledFilter}
          options={STATUS_OPTIONS}
          onChange={setEnabledFilter}
        />
        {enabledFilter ? (
          <Pressable onPress={() => setEnabledFilter('')} style={styles.clearFilters}>
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        ) : null}

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, marginTop: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openEdit(item)}>
              <View style={styles.rowInner}>
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="map-pin" size={18} color={colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.enabled ? 'Enabled' : 'Disabled'}
                    {item.same_day ? ' · Same day' : ''}
                    {item.instant_delivery_enabled ? ' · Deliver now' : ''}
                    {` · ${(item.cities ?? []).join(', ') || 'Any city'}`}
                    {` · fee ${item.fee ?? 0}`}
                  </Text>
                  <Text style={styles.meta}>
                    Prefixes {(item.postal_prefixes ?? []).join(', ') || 'any'}
                    {item.min_order_total && Number(item.min_order_total)
                      ? ` · min ${item.min_order_total}`
                      : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="map-pin"
                title={zones.length ? 'No matching zones' : 'No zones yet'}
                message={
                  zones.length
                    ? 'Try another search or clear filters.'
                    : 'Add a delivery zone so checkout can match city and postal codes.'
                }
                actionLabel={zones.length ? undefined : 'Add zone'}
                onAction={zones.length ? undefined : openCreate}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  search: { marginBottom: spacing.sm },
  clearFilters: { alignSelf: 'flex-start', marginTop: spacing.sm, marginBottom: spacing.sm },
  clearFiltersText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { color: colors.mutedForeground, marginBottom: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { color: colors.foreground, fontWeight: '500' },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbEmpty: {
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
