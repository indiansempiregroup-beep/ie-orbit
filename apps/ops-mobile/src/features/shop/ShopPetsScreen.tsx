import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopPet, ShopSettings } from '@ie-platform/sdk';
import { shopListRefreshControl } from './shopRefreshControl';

export function ShopPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [pets, setPets] = useState<ShopPet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    try {
      const settingsRes = await client.shop.getSettings({ business_id: businessId });
      setSettings(settingsRes.data);
      const customersRes = await client.customers.list({ business: businessId });
      setCustomers(customersRes.data);
      if (!customerId && customersRes.data[0]) setCustomerId(customersRes.data[0].id);
      if (settingsRes.data.pets_enabled) {
        const petsRes = await client.shop.listPets({ business_id: businessId });
        setPets(petsRes.data);
      } else {
        setPets([]);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load pets');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, customerId]);

  const togglePack = useCallback(async () => {
    if (!client || !businessId) return;
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        enable_pets: !settings?.pets_enabled,
      });
      setSettings(response.data);
      setMessage(response.data.pets_enabled ? 'Pets pack enabled' : 'Pets pack disabled');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to update settings');
    }
  }, [businessId, client, load, settings?.pets_enabled]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (!settings?.pets_enabled) {
              void togglePack();
              return;
            }
            setShowAdd((open) => !open);
          }}
          accessibilityRole="button"
          accessibilityLabel={settings?.pets_enabled ? (showAdd ? 'Close' : 'Add pet') : 'Enable pets'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showAdd ? 'x' : 'plus'} size={20} color="#fff" />
        </Pressable>
      ),
    });
  }, [navigation, showAdd, settings?.pets_enabled, togglePack]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function create() {
    if (!client || !businessId || !customerId || !name.trim()) return;
    setMessage(null);
    try {
      await client.shop.createPet({
        business_id: businessId,
        customer_id: customerId,
        name: name.trim(),
        species,
      });
      setName('');
      setMessage('Pet saved');
      setShowAdd(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save pet');
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      {message ? <Text style={styles.meta}>{message}</Text> : null}

      {!settings?.pets_enabled ? (
        <RefreshableScrollView
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + spacing.xl }}
        >
          <Text style={styles.meta}>Enable the Pets pack to manage pet profiles.</Text>
          <Pressable style={styles.button} onPress={() => void togglePack()}>
            <Text style={styles.buttonText}>Enable Pets pack</Text>
          </Pressable>
        </RefreshableScrollView>
      ) : (
        <>
          {showAdd ? (
            <View style={styles.formCard}>
              <Text style={styles.label}>Customer</Text>
              <TextInput
                style={styles.input}
                value={customerId}
                onChangeText={setCustomerId}
                placeholder="Customer UUID"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={styles.meta}>
                Tip: {(customers[0]?.full_name ?? customers[0]?.id) || 'no customers yet'}
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Pet name"
                placeholderTextColor={colors.mutedForeground}
              />
              <TextInput
                style={styles.input}
                value={species}
                onChangeText={setSpecies}
                placeholder="Species"
                placeholderTextColor={colors.mutedForeground}
              />
              <Pressable style={styles.button} onPress={() => void create()}>
                <Text style={styles.buttonText}>Save pet</Text>
              </Pressable>
            </View>
          ) : null}
          <FlatList
            data={pets}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.species || '—'} {item.birthday ? `· ${item.birthday}` : ''}
                </Text>
              </View>
            )}
            ListEmptyComponent={!loading ? <Text style={styles.meta}>No pets yet. Tap + to add.</Text> : null}
          />
        </>
      )}
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
  label: { fontWeight: '600', color: colors.foreground, marginBottom: 6 },
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
    marginTop: spacing.sm,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  row: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { fontWeight: '600', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2 },
});
