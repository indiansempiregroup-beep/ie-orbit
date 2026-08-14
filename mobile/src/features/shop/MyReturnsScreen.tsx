import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function MyReturnsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [items, setItems] = useState<ShopReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileClient.mobile.listMyReturns({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Returns" onBack={() => navigation.goBack()} />
      {loading ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('ReturnDetail', { returnId: item.id })}>
            <Text style={styles.name}>{item.return_number}</Text>
            <Text style={styles.meta}>
              {item.status} · {item.currency || ''} {item.refund_total}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="rotate-ccw"
              title="No returns yet"
              description="If you send something back, the status will appear here."
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground },
});
