import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopMasterKind, ShopMasterRecord } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const KINDS: Array<{ kind: ShopMasterKind; title: string; subtitle: string }> = [
  { kind: 'category', title: 'Product categories', subtitle: 'Used on products and filters' },
  { kind: 'brand', title: 'Brands', subtitle: 'Reusable brand names' },
  { kind: 'unit', title: 'Units', subtitle: 'Pcs, kg, litre, and more' },
  { kind: 'expense_category', title: 'Expense categories', subtitle: 'Books expense entries' },
  { kind: 'income_category', title: 'Income categories', subtitle: 'Other income entries' },
  { kind: 'tax_rate', title: 'Tax rates', subtitle: 'GST % presets for products' },
];

type HubProps = NativeStackScreenProps<RootStackParamList, 'ShopMasterFiles'>;
type KindProps = NativeStackScreenProps<RootStackParamList, 'ShopMasterKind'>;

export function ShopMasterFilesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FormScreen>
      <Text style={styles.lead}>
        Store reusable shop data once, then pick it when adding products or books entries.
      </Text>
      <View style={styles.list}>
        {KINDS.map((item) => (
          <Pressable
            key={item.kind}
            style={styles.row}
            onPress={() => navigation.navigate('ShopMasterKind', { kind: item.kind, title: item.title })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSub}>{item.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
      <Text style={styles.linksTitle}>Also in your shop</Text>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('ShopGodowns')}>
        <Text style={styles.linkText}>Godowns</Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('ShopBooksCash')}>
        <Text style={styles.linkText}>Cash & bank accounts</Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('ShopBooksParties')}>
        <Text style={styles.linkText}>Parties / suppliers</Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </Pressable>
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
  const [items, setItems] = useState<ShopMasterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: route.params.title || 'Master' });
  }, [navigation, route.params.title]);

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
      toast.push(err instanceof Error ? err.message : 'Unable to load master list', 'error');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, kind, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => items.filter((row) => row.is_active), [items]);

  async function addRow() {
    if (!client || !businessId || !label.trim()) return;
    setBusy(true);
    try {
      await client.shop.createMasterRecord(kind, {
        business_id: businessId,
        label: label.trim(),
        value: kind === 'tax_rate' ? value.trim() || label.trim().replace(/[^\d.]/g, '') : value.trim(),
      });
      setLabel('');
      setValue('');
      toast.push('Saved to master files.', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: ShopMasterRecord) {
    if (!client) return;
    try {
      await client.shop.patchMasterRecord(kind, row.id, { is_active: !row.is_active });
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to update', 'error');
    }
  }

  return (
    <FormScreen>
      <View style={styles.addBox}>
        <Input
          label={kind === 'tax_rate' ? 'Label' : 'Name'}
          required
          value={label}
          onChangeText={setLabel}
          placeholder={kind === 'tax_rate' ? 'GST 18%' : 'New value'}
        />
        {kind === 'tax_rate' ? (
          <Input label="Rate %" optional value={value} onChangeText={setValue} placeholder="18" keyboardType="decimal-pad" />
        ) : null}
        <Button label={busy ? 'Saving…' : 'Add'} onPress={() => void addRow()} disabled={busy || !label.trim()} />
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && !active.length ? <EmptyState title="No items yet" subtitle="Add your first value above." /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.itemRow, !item.is_active && styles.itemInactive]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.label}</Text>
              <Text style={styles.rowSub}>
                {item.slug}
                {item.value ? ` · ${item.value}` : ''}
                {item.is_builtin ? ' · builtin' : ''}
                {!item.is_active ? ' · inactive' : ''}
              </Text>
            </View>
            <Pressable onPress={() => void toggleActive(item)} hitSlop={8}>
              <Text style={styles.toggle}>{item.is_active ? 'Deactivate' : 'Activate'}</Text>
            </Pressable>
          </View>
        )}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.mutedForeground, marginBottom: spacing.md, lineHeight: 20 },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowTitle: { fontWeight: '600', color: colors.foreground },
  rowSub: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  linksTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: '600', color: colors.foreground },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  linkText: { color: colors.primary, fontWeight: '500' },
  addBox: { gap: spacing.sm, marginBottom: spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemInactive: { opacity: 0.55 },
  toggle: { color: colors.primary, fontSize: 13, fontWeight: '600' },
});
