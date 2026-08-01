import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopPet } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PetDetail'>;

export function PetDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [pet, setPet] = useState<ShopPet | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  useEffect(() => {
    void (async () => {
      const res = await mobileClient.mobile.getMyPet(route.params.petId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setPet(res.data);
    })();
  }, [businessCode, route.params.petId, tenantSlug]);

  if (!pet) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40 }}
    >
      {pet.photo_url ? <Image source={{ uri: pet.photo_url }} style={styles.hero} /> : null}
      <Text style={styles.title}>{pet.name}</Text>
      <Text style={styles.meta}>
        {[pet.species, pet.breed, pet.sex].filter(Boolean).join(' · ')}
      </Text>
      {pet.birthday ? <Text style={styles.meta}>Birthday {pet.birthday}</Text> : null}
      {pet.medical_notes ? (
        <>
          <Text style={styles.section}>Medical notes</Text>
          <Text style={styles.body}>{pet.medical_notes}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  hero: { width: '100%', height: 260, borderRadius: radius.lg, marginBottom: spacing.md },
  title: { fontSize: 26, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 8, color: colors.mutedForeground },
  section: { marginTop: spacing.lg, fontWeight: '700', color: colors.foreground },
  body: { marginTop: spacing.sm, color: colors.foreground, lineHeight: 22 },
});
