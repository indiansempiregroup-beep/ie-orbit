import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SupportTicketSummary } from '@ie-orbit/sdk';
import { Chip } from '../../components/ui/Chip';
import { GroupedList } from '../../components/ui/GroupedList';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type StatusFilter = 'all' | 'open' | 'pending' | 'resolved';

function statusLabel(status: string) {
  if (status === 'pending') return 'Waiting';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SupportTicketsPanel({
  tickets,
  primaryColor,
}: {
  tickets: SupportTicketSummary[];
  primaryColor: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const counts = useMemo(
    () => ({
      all: tickets.length,
      open: tickets.filter((row) => row.status === 'open').length,
      pending: tickets.filter((row) => row.status === 'pending').length,
      resolved: tickets.filter((row) => row.status === 'resolved').length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return [row.subject, row.preview].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [tickets, search, statusFilter]);

  return (
    <>
      <Text style={styles.sectionLabel}>Your tickets</Text>
      {tickets.length > 0 ? (
        <>
          <View style={styles.searchWrap}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your tickets"
              placeholderTextColor={colors.mutedForeground}
              style={styles.search}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(
              [
                ['all', `All (${counts.all})`],
                ['open', `Open (${counts.open})`],
                ['pending', `Waiting (${counts.pending})`],
                ['resolved', `Resolved (${counts.resolved})`],
              ] as Array<[StatusFilter, string]>
            ).map(([id, label]) => (
              <Chip
                key={id}
                label={label}
                active={statusFilter === id}
                primaryColor={primaryColor}
                onPress={() => setStatusFilter(id)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
      {filtered.length === 0 ? (
        <Text style={styles.body}>
          {tickets.length
            ? 'No tickets match that search or filter.'
            : 'Submitted requests show up here. We’ll email you when support replies.'}
        </Text>
      ) : (
        <GroupedList>
          {filtered.map((ticket) => (
            <Pressable
              key={ticket.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: ticket.id })}
            >
              <View style={styles.icon}>
                <Feather name="message-circle" size={16} color={colors.mutedForeground} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{ticket.subject}</Text>
                <Text style={styles.meta}>
                  {statusLabel(ticket.status)}
                  {ticket.created_at ? ` · ${formatRelativeTime(ticket.created_at)}` : ''}
                </Text>
                {ticket.preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {ticket.preview}
                  </Text>
                ) : null}
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </GroupedList>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  body: { ...typography.body, color: colors.mutedForeground, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.92 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  copy: { flex: 1, gap: 2 },
  title: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  meta: { ...typography.caption, color: colors.mutedForeground },
  preview: { ...typography.caption, color: colors.foreground, marginTop: 2 },
});
