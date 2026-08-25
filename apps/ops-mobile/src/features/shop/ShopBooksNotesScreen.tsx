import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import {
  formatMoney,
  isVoidedVoucher,
  voucherPartyLabel,
  voucherStatusStyle,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type NoteKind = 'credit_note' | 'debit_note';

export function ShopBooksNotesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [noteKind, setNoteKind] = useState<NoteKind>('credit_note');
  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: noteKind })}
          accessibilityRole="button"
          accessibilityLabel={noteKind === 'credit_note' ? 'New credit note' : 'New debit note'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, noteKind]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const vouchersRes = await client.shop.listVouchers({ business_id: businessId, type: noteKind });
      setVouchers(vouchersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, noteKind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void note', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Note voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void note', 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.pageHint}>
          Create notes with the Sale counter UI. Credit notes are for customers; debit notes are for
          suppliers.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={vouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={styles.chipRow}>
              <Chip
                label="Credit note"
                active={noteKind === 'credit_note'}
                onPress={() => setNoteKind('credit_note')}
              />
              <Chip
                label="Debit note"
                active={noteKind === 'debit_note'}
                onPress={() => setNoteKind('debit_note')}
              />
            </View>
          }
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const canVoid = !isVoidedVoucher(item.status);
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.voucher_number}</Text>
                  <Text style={styles.total}>{formatMoney(item.total)}</Text>
                </View>
                <Text style={styles.meta}>
                  {voucherPartyLabel(item)}
                  {item.voucher_date ? ` · ${item.voucher_date}` : ''}
                </Text>
                <View style={styles.rowBottom}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                  {canVoid ? (
                    <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                      <Text style={styles.voidText}>Void</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="file-minus"
                title={noteKind === 'credit_note' ? 'No credit notes yet' : 'No debit notes yet'}
                message={
                  noteKind === 'credit_note'
                    ? 'Issue credit notes against customer sales for returns or adjustments.'
                    : 'Issue debit notes against supplier purchases for returns or adjustments.'
                }
                actionLabel={noteKind === 'credit_note' ? 'New credit note' : 'New debit note'}
                onAction={() => navigation.navigate('ShopPos', { mode: noteKind })}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  pageHint: { color: colors.mutedForeground, fontSize: 12, marginBottom: spacing.sm, lineHeight: 16 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
