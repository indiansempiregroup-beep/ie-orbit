import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { birthdayLabel, formatPetBirthday } from './petHelpers';
import type { ShopPet } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PetDetail'>;

export function PetDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [pet, setPet] = useState<ShopPet | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    const res = await mobileClient.mobile.getMyPet(route.params.petId, {
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    setPet(res.data);
  }, [businessCode, route.params.petId, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!pet) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Pet" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const photo = resolveMediaUrl(pet.photo_url);
  const details = [pet.species, pet.breed, pet.sex].filter(Boolean).join(' · ');
  const upcoming = birthdayLabel(pet.birthday);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={pet.name}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => navigation.navigate('PetForm', { petId: pet.id })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit pet"
          >
            <Feather name="edit-3" size={18} color={primary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroEmpty]}>
            <Feather name="heart" size={36} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.title}>{pet.name}</Text>
          <Text style={styles.meta}>{details || 'Add species, breed, and sex'}</Text>
          <Pressable
            style={[styles.editBtn, { borderColor: primary }]}
            onPress={() => navigation.navigate('PetForm', { petId: pet.id })}
          >
            <Feather name="edit-3" size={14} color={primary} />
            <Text style={[styles.editText, { color: primary }]}>Edit profile</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Feather name="gift" size={16} color={primary} />
            <Text style={styles.section}>Birthday</Text>
          </View>
          {pet.birthday ? (
            <>
              <Text style={styles.body}>{formatPetBirthday(pet.birthday)}</Text>
              {upcoming ? <Text style={[styles.highlight, { color: primary }]}>{upcoming}</Text> : null}
              <Text style={styles.hint}>
                You’ll get an in-app notification and email 5 days before. Those alerts also appear in the
                Notifications tab.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.body}>No birthday saved yet.</Text>
              <Text style={styles.hint}>Add a birthday so we can remind you — and the shop — in time.</Text>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.body}>{pet.medical_notes?.trim() || 'No medical notes yet.'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { width: '100%', height: 240, borderRadius: radius.lg, backgroundColor: colors.muted },
  heroEmpty: { alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.foreground },
  meta: { marginTop: 8, color: colors.mutedForeground },
  editBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editText: { fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  section: { fontWeight: '700', color: colors.foreground, fontSize: 16 },
  body: { color: colors.foreground, lineHeight: 22 },
  highlight: { marginTop: 6, fontWeight: '700' },
  hint: { marginTop: spacing.sm, color: colors.mutedForeground, lineHeight: 20, fontSize: 13 },
});
