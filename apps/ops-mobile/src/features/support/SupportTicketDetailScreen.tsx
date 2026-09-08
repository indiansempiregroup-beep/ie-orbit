import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupportTicketDetail } from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { StickyFooterBar } from '../../components/ui/StickyFooterBar';
import { useAuth } from '../../contexts/AuthContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const STATUSES = ['open', 'pending', 'resolved'] as const;

function statusLabel(status: string) {
  if (status === 'pending') return 'Waiting';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SupportTicketDetailScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const { user } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, 'SupportTicketDetail'>>();
  const mode = route.params.mode ?? 'workspace';
  const ticketId = route.params.ticketId;
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const response =
        mode === 'platform' ? await client.platform.ticket(ticketId) : await client.support.ticket(ticketId);
      setTicket(response.data);
    } catch (err) {
      Alert.alert('Could not load ticket', err instanceof Error ? err.message : 'Please try again.');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [client, mode, ticketId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function sendReply() {
    if (!client || !reply.trim()) return;
    setBusy(true);
    try {
      if (mode === 'platform') {
        await client.platform.addTicketNote(ticketId, { body: reply.trim(), is_internal: internal });
        await load();
      } else {
        const response = await client.support.addTicketNote(ticketId, { body: reply.trim() });
        setTicket(response.data);
      }
      setReply('');
    } catch (err) {
      Alert.alert('Could not send', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status: string) {
    if (!client || mode !== 'platform' || ticket?.status === status) return;
    setBusy(true);
    try {
      await client.platform.updateTicket(ticketId, { status });
      await load();
    } catch (err) {
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const myEmail = user?.email?.toLowerCase();

  return (
    <DesktopPage>
      <View style={styles.screen}>
        {loading && !ticket ? <ActivityIndicator color={colors.primary} /> : null}
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140, gap: spacing.md }}>
          {ticket ? (
            <>
              <View style={styles.hero}>
                <Text style={styles.subject}>{ticket.subject}</Text>
                <Text style={styles.meta}>
                  {ticket.requester_email || 'Customer'}
                  {ticket.tenant_name ? ` · ${ticket.tenant_name}` : ''}
                  {` · ${formatRelativeTime(ticket.created_at)}`}
                </Text>
                <View style={styles.statusRow}>
                  {mode === 'platform' ? (
                    STATUSES.map((status) => (
                      <Chip
                        key={status}
                        label={statusLabel(status)}
                        active={ticket.status === status}
                        onPress={() => void updateStatus(status)}
                      />
                    ))
                  ) : (
                    <Text style={styles.statusText}>{statusLabel(ticket.status)}</Text>
                  )}
                </View>
              </View>
              {(ticket.notes ?? []).map((note) => {
                const mine = Boolean(myEmail && note.author_email?.toLowerCase() === myEmail);
                return (
                  <View key={note.id} style={[styles.note, mine && styles.noteMine, note.is_internal && styles.internal]}>
                    <Text style={styles.noteBody}>{note.body}</Text>
                    <Text style={styles.meta}>
                      {mine ? 'You' : note.author_email || 'Support'}
                      {note.is_internal ? ' · internal' : ''}
                      {` · ${formatRelativeTime(note.created_at)}`}
                    </Text>
                  </View>
                );
              })}
            </>
          ) : null}
        </ScrollView>
        {ticket && ticket.status !== 'resolved' ? (
          <StickyFooterBar>
            <Input
              label={internal ? 'Internal note' : 'Reply'}
              value={reply}
              onChangeText={setReply}
              multiline
              placeholder={internal ? 'Only your team will see this' : 'Customer gets this in the app and by email'}
            />
            {mode === 'platform' ? (
              <Button
                label={internal ? 'Switch to public reply' : 'Switch to internal note'}
                variant="ghost"
                size="sm"
                onPress={() => setInternal((value) => !value)}
              />
            ) : null}
            <Button
              label={internal ? 'Save note' : 'Send reply'}
              loading={busy}
              disabled={!reply.trim()}
              onPress={() => void sendReply()}
            />
          </StickyFooterBar>
        ) : ticket?.status === 'resolved' ? (
          <StickyFooterBar>
            <Text style={styles.meta}>This ticket is resolved. Reopen it from status if you need to continue.</Text>
            {mode === 'platform' ? (
              <Button label="Reopen" variant="outline" onPress={() => void updateStatus('open')} />
            ) : null}
          </StickyFooterBar>
        ) : null}
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  subject: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusText: { ...typography.caption, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' },
  note: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noteMine: { borderColor: colors.primary, backgroundColor: `${colors.primary}08` },
  internal: { backgroundColor: colors.muted },
  noteBody: { ...typography.body, color: colors.foreground },
});
