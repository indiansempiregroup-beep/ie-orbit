import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopDeliveryZone } from '@ie-platform/sdk';
import { shopListRefreshControl } from './shopRefreshControl';

export function ShopDeliveryZonesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [zones, setZones] = useState<ShopDeliveryZone[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('Nashik city');
  const [cities, setCities] = useState('Nashik');
  const [prefixes, setPrefixes] = useState('422');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setShowAdd((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={showAdd ? 'Close' : 'Add zone'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showAdd ? 'x' : 'plus'} size={20} color="#fff" />
        </Pressable>
      ),
    });
  }, [navigation, showAdd]);

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

  async function create() {
    if (!client || !businessId) return;
    setMessage(null);
    try {
      await client.shop.createDeliveryZone({
        business_id: businessId,
        name,
        cities: cities.split(',').map((value) => value.trim()).filter(Boolean),
        postal_prefixes: prefixes.split(',').map((value) => value.trim()).filter(Boolean),
        same_day: true,
        enabled: true,
      });
      setMessage('Zone saved');
      setShowAdd(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save zone');
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {showAdd ? (
        <View style={styles.formCard}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Zone name" placeholderTextColor={colors.mutedForeground} />
          <TextInput style={styles.input} value={cities} onChangeText={setCities} placeholder="Cities (comma)" placeholderTextColor={colors.mutedForeground} />
          <TextInput style={styles.input} value={prefixes} onChangeText={setPrefixes} placeholder="Postal prefixes" placeholderTextColor={colors.mutedForeground} />
          <Pressable style={styles.button} onPress={() => void create()}>
            <Text style={styles.buttonText}>Save zone</Text>
          </Pressable>
        </View>
      ) : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={zones}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, marginTop: spacing.md }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {(item.cities ?? []).join(', ') || 'Any city'} · {item.enabled ? 'enabled' : 'disabled'}
            </Text>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.meta}>No zones yet.</Text> : null}
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
  formCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
    color: colors.foreground,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  row: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontWeight: '600', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2 },
});
