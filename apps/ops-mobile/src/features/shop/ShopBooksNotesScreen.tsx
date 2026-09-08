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
import { SearchBar } from '../../components/SearchBar';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  summarizeVouchers,
  voucherPartyLabel,
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
  const [search, setSearch] = useState('');

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

  const filtered = vouchers.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.voucher_number, voucherPartyLabel(item), String(item.total), item.voucher_date ?? '']
      .join(' ')
      .toLowerCase()
      .includes(term);
  });
  const summary = summarizeVouchers(filtered);

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
        <VoucherSummaryCards summary={summary} mode="expense" />
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search notes" style={styles.search} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const voided = isVoidedVoucher(item.status);
            return (
              <BooksDocumentRow
                title={voucherPartyLabel(item) === '—' ? (noteKind === 'credit_note' ? 'Customer' : 'Supplier') : voucherPartyLabel(item)}
                amount={formatMoney(item.total)}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={item.status}
                badgeKind={voided ? 'void' : 'neutral'}
                icon={noteKind === 'credit_note' ? 'minus-circle' : 'plus-circle'}
                iconTone={voided ? 'rose' : noteKind === 'credit_note' ? 'coral' : 'violet'}
                dimmed={voided}
                actionLabel={!voided ? 'Void' : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="file-minus"
                title={
                  search
                    ? 'No matching notes'
                    : noteKind === 'credit_note'
                      ? 'No credit notes yet'
                      : 'No debit notes yet'
                }
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  search: { marginBottom: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
