import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopPet } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function MyPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [pets, setPets] = useState<ShopPet[]>([]);
  const [loading, setLoading] = useState(true);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileClient.mobile.listMyPets({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setPets(res.data);
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
      <ScreenHeader title="My Pets" onBack={() => navigation.goBack()} />
      {loading ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={pets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('PetDetail', { petId: item.id })}>
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{[item.species, item.breed].filter(Boolean).join(' · ') || 'Pet'}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="heart"
              title="No pets on file"
              description="When this shop saves a pet profile for you, it will appear here."
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
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { width: 64, height: 64, borderRadius: 32 },
  photoEmpty: { backgroundColor: colors.muted },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground },
});
