import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopDeliveryZone } from '@ie-platform/sdk';
import { shopListRefreshControl } from './shopRefreshControl';

type ZoneForm = {
  name: string;
  cities: string;
  prefixes: string;
  fee: string;
  minOrder: string;
  notes: string;
  sameDay: boolean;
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
  enabled: true,
};

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
    enabled: zone.enabled !== false,
  };
}

export function ShopDeliveryZonesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [zones, setZones] = useState<ShopDeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ZoneForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      name: 'Nashik city',
      cities: 'Nashik',
      prefixes: '422',
    });
    setShowForm(true);
    setMessage(null);
  }, []);

  const openEdit = useCallback((zone: ShopDeliveryZone) => {
    setEditingId(zone.id);
    setForm(zoneToForm(zone));
    setShowForm(true);
    setMessage(null);
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
          <Feather name={showForm ? 'x' : 'plus'} size={20} color="#fff" />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, openCreate]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    try {
      const response = await client.shop.listDeliveryZones({ business_id: businessId });
      setZones(response.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load zones');
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

  function setField<K extends keyof ZoneForm>(key: K, value: ZoneForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!client || !businessId || !form.name.trim()) return;
    setSaving(true);
    setMessage(null);
    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      cities: splitCsv(form.cities),
      postal_prefixes: splitCsv(form.prefixes),
      fee: form.fee.trim() || '0',
      min_order_total: form.minOrder.trim() || '0',
      notes: form.notes.trim(),
      same_day: form.sameDay,
      enabled: form.enabled,
    };
    try {
      if (editingId) {
        await client.shop.patchDeliveryZone(editingId, payload);
        setMessage('Zone updated');
      } else {
        await client.shop.createDeliveryZone(payload);
        setMessage('Zone saved');
      }
      closeForm();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save zone');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(zone: ShopDeliveryZone) {
    if (!client || !businessId) return;
    setMessage(null);
    try {
      await client.shop.patchDeliveryZone(zone.id, {
        business_id: businessId,
        name: zone.name,
        enabled: !zone.enabled,
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update zone');
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
        {message ? <Text style={styles.meta}>{message}</Text> : null}
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          placeholder="Zone name"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.cities}
          onChangeText={(value) => setField('cities', value)}
          placeholder="Cities (comma-separated)"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.prefixes}
          onChangeText={(value) => setField('prefixes', value)}
          placeholder="Postal prefixes (comma-separated)"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.fee}
          onChangeText={(value) => setField('fee', value)}
          placeholder="Delivery fee"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.minOrder}
          onChangeText={(value) => setField('minOrder', value)}
          placeholder="Minimum order total"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={[styles.input, styles.notes]}
          value={form.notes}
          onChangeText={(value) => setField('notes', value)}
          placeholder="Notes"
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Same-day delivery</Text>
          <Switch value={form.sameDay} onValueChange={(value) => setField('sameDay', value)} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Enabled</Text>
          <Switch value={form.enabled} onValueChange={(value) => setField('enabled', value)} />
        </View>
      </FormScreen>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {message ? <Text style={styles.meta}>{message}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={zones}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, marginTop: spacing.md }}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openEdit(item)}>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {(item.cities ?? []).join(', ') || 'Any city'} · prefixes{' '}
                {(item.postal_prefixes ?? []).join(', ') || 'any'} · fee {item.fee ?? 0}
              </Text>
              {item.notes ? <Text style={styles.meta}>{item.notes}</Text> : null}
              <Text style={styles.hint}>Tap to edit</Text>
            </View>
            <Pressable
              onPress={() => void toggleEnabled(item)}
              hitSlop={8}
              style={[styles.badge, item.enabled ? styles.badgeOn : styles.badgeOff]}
            >
              <Text style={styles.badgeText}>{item.enabled ? 'On' : 'Off'}</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.meta}>No zones yet. Tap + to add.</Text> : null}
      />
    </View>
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
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { color: colors.foreground, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1 },
  name: { fontWeight: '600', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2 },
  hint: { color: colors.mutedForeground, marginTop: 4, fontSize: 12 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeOn: { backgroundColor: '#dcfce7' },
  badgeOff: { backgroundColor: '#fee2e2' },
  badgeText: { fontWeight: '600', fontSize: 12, color: colors.foreground },
});
