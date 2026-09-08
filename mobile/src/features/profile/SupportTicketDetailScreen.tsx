import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupportTicketDetail } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime, getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function statusLabel(status: string) {
  if (status === 'pending') return 'Waiting';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SupportTicketDetailScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'SupportTicketDetail'>) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await mobileClient.support.ticket(route.params.ticketId);
      setTicket(response.data);
    } catch (err) {
      Alert.alert('Could not load ticket', getApiErrorMessage(err, 'Please try again.'));
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [route.params.ticketId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const response = await mobileClient.support.addTicketNote(route.params.ticketId, { body: reply.trim() });
      setTicket(response.data);
      setReply('');
    } catch (err) {
      Alert.alert('Could not send', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const closed = ticket?.status === 'resolved';
  const myEmail = user?.email?.toLowerCase();

  return (
    <ProfileMenuScreen
      title={ticket?.subject || 'Ticket'}
      onBack={() => navigation.goBack()}
      primaryColor={primary}
      onRefresh={load}
    >
      {loading && !ticket ? <ActivityIndicator color={primary} /> : null}
      {ticket ? (
        <>
          <View style={[styles.hero, { backgroundColor: `${primary}12` }]}>
            <Text style={[styles.status, { color: primary }]}>{statusLabel(ticket.status)}</Text>
            <Text style={styles.heroTitle}>{ticket.subject}</Text>
            <Text style={styles.meta}>Opened {formatRelativeTime(ticket.created_at)}</Text>
          </View>
          {(ticket.notes ?? []).map((note) => {
            const mine = Boolean(myEmail && note.author_email?.toLowerCase() === myEmail);
            return (
              <View key={note.id} style={[styles.note, mine && { borderColor: primary, backgroundColor: `${primary}0D` }]}>
                <Text style={styles.noteBody}>{note.body}</Text>
                <Text style={styles.meta}>
                  {mine ? 'You' : note.author_email || 'Support'}
                  {` · ${formatRelativeTime(note.created_at)}`}
                </Text>
              </View>
            );
          })}
          {(ticket.notes ?? []).length === 0 ? <Text style={styles.meta}>No messages yet.</Text> : null}
          {closed ? (
            <Text style={styles.meta}>This request is resolved. Start a new one from Help if you still need us.</Text>
          ) : (
            <>
              <Input
                label="Reply"
                value={reply}
                onChangeText={setReply}
                multiline
                placeholder="Add more detail"
              />
              <Button
                label="Send reply"
                fullWidth
                loading={sending}
                primaryColor={primary}
                onPress={() => void sendReply()}
              />
            </>
          )}
        </>
      ) : null}
    </ProfileMenuScreen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  status: { ...typography.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  heroTitle: { ...typography.label, color: colors.foreground, fontWeight: '800', fontSize: 18 },
  meta: { ...typography.caption, color: colors.mutedForeground },
  note: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noteBody: { ...typography.body, color: colors.foreground, lineHeight: 22 },
});
