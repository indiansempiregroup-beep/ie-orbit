import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useCustomers } from '../../hooks/useOpsData';
import { colors, spacing } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPet } from '@ie-platform/sdk';
import { DesktopPage } from '../../components/DesktopPage';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopPetDetail'>;

export function ShopPetDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const { customers } = useCustomers();
  const petId = route.params.petId;

  const [pet, setPet] = useState<ShopPet | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showNotify, setShowNotify] = useState(Boolean(route.params.openNotify));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const response = await client.shop.getPet(petId);
      setPet(response.data);
      setSubject((current) => current || `Happy birthday reminder for ${response.data.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load pet');
    } finally {
      setLoading(false);
    }
  }, [client, petId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (route.params.openNotify) {
        setShowNotify(true);
      }
    }, [load, route.params.openNotify]),
  );

  async function sendNotify() {
    if (!client || !pet) return;
    if (!subject.trim() || !body.trim()) {
      setMessage('Subject and message are required.');
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const response = await client.shop.notifyPetOwner(pet.id, {
        subject: subject.trim(),
        body: body.trim(),
        channels: ['in_app', 'email'],
      });
      const channels = (response.data.sent_channels || []).join(', ') || 'none';
      setMessage(`Notification sent (${channels}).`);
      setShowNotify(false);
      setBody('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to notify owner');
    } finally {
      setSending(false);
    }
  }

  if (loading && !pet) {
    return (
      <DesktopPage>
        <View style={[styles.screen, styles.centered]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </DesktopPage>
    );
  }

  if (!pet) {
    return (
      <DesktopPage>
        <View style={[styles.screen, styles.centered]}>
          <Text style={styles.meta}>{message || 'Pet not found.'}</Text>
        </View>
      </DesktopPage>
    );
  }

  const ownerFromList = (customers ?? []).find((customer) => customer.id === pet.customer);
  const ownerLabel =
    pet.customer_name || ownerFromList?.display_name || ownerFromList?.full_name || pet.customer;
  const photoUri = resolveMediaUrl(pet.photo_url);

  return (
    <DesktopPage>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl, paddingTop: spacing.md }}
      >
        <View style={styles.hero}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Feather name="heart" size={28} color={colors.mutedForeground} />
            </View>
          )}
          <Text style={styles.title}>{pet.name}</Text>
          <Text style={styles.meta}>
            {[pet.species, pet.breed, pet.sex].filter(Boolean).join(' · ') || 'Pet profile'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Owner</Text>
          <Text style={styles.value}>{ownerLabel}</Text>
          <Text style={styles.label}>Birthday</Text>
          <Text style={styles.value}>{pet.birthday || 'Not set'}</Text>
          {pet.birthday ? (
            <Text style={styles.hint}>
              Automatic reminder: customer + business owner/manager get alerts 5 days before birthday.
            </Text>
          ) : (
            <Text style={styles.hint}>Add a birthday to enable automatic owner reminders.</Text>
          )}
          <Text style={styles.label}>Medical notes</Text>
          <Text style={styles.value}>{pet.medical_notes?.trim() || '—'}</Text>
        </View>

        {message ? <Text style={styles.meta}>{message}</Text> : null}

        <Pressable
          style={styles.button}
          onPress={() => navigation.navigate('ShopPetForm', { petId: pet.id })}
        >
          <Text style={styles.buttonText}>Edit pet</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => setShowNotify((open) => !open)}
        >
          <Feather name="bell" size={16} color={colors.primary} />
          <Text style={styles.secondaryText}>
            {showNotify ? 'Hide notification' : 'Notify owner'}
          </Text>
        </Pressable>

        {showNotify ? (
          <View style={styles.notifyCard}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={body}
              onChangeText={setBody}
              placeholder="Write a custom message for the pet owner…"
              multiline
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.hint}>Sends in-app (if they have an account) and email.</Text>
            <Pressable
              style={[styles.button, sending && styles.buttonDisabled]}
              onPress={() => void sendNotify()}
              disabled={sending}
            >
              <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Send notification'}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  photo: { width: 112, height: 112, borderRadius: 56 },
  photoPlaceholder: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '700', fontSize: 24, color: colors.foreground, marginTop: spacing.md },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    marginBottom: spacing.md,
  },
  label: { fontWeight: '600', color: colors.mutedForeground, marginTop: spacing.sm, fontSize: 12 },
  value: { color: colors.foreground, marginTop: 2 },
  hint: { color: colors.mutedForeground, fontSize: 12, marginTop: 6 },
  meta: { color: colors.mutedForeground, marginTop: 2, marginBottom: spacing.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  secondaryText: { color: colors.primary, fontWeight: '600' },
  notifyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  notes: { minHeight: 100, textAlignVertical: 'top' },
});
