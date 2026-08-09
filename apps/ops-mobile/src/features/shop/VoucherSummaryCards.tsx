import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { StatTile } from '../../components/ui/StatTile';
import { Chip } from '../../components/ui/Chip';
import { spacing } from '../../theme/tokens';
import { formatMoney, type VoucherListSummary, type VoucherPayFilter } from './shopBooksHelpers';

type Props = {
  summary: VoucherListSummary;
  filter: VoucherPayFilter;
  onFilterChange: (filter: VoucherPayFilter) => void;
  /** Labels for receivable (sale) vs payable (purchase). */
  mode?: 'sale' | 'purchase' | 'expense';
};

export function VoucherSummaryCards({ summary, filter, onFilterChange, mode = 'sale' }: Props) {
  const unpaidLabel = mode === 'purchase' ? 'To pay' : mode === 'expense' ? 'Spent' : 'To collect';
  const unpaidTone = mode === 'expense' ? 'default' : mode === 'purchase' ? 'negative' : 'positive';

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        <StatTile
          label={mode === 'expense' ? 'Total expenses' : 'Total'}
          value={formatMoney(summary.totalAmount)}
          hint={`${summary.count} vouchers`}
        />
        {mode === 'expense' ? (
          <StatTile label="This list" value={String(summary.count)} hint="Entries" />
        ) : (
          <>
            <StatTile
              label="Paid"
              value={formatMoney(summary.paidAmount)}
              hint={`${summary.paidCount} paid`}
              tone="positive"
            />
            <StatTile
              label={unpaidLabel}
              value={formatMoney(summary.unpaidAmount)}
              hint={`${summary.unpaidCount} open`}
              tone={unpaidTone}
            />
          </>
        )}
      </View>
      {mode !== 'expense' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={filter === 'all'} onPress={() => onFilterChange('all')} />
          <Chip label="Paid" active={filter === 'paid'} onPress={() => onFilterChange('paid')} />
          <Chip
            label={mode === 'purchase' ? 'Unpaid' : 'Unpaid'}
            active={filter === 'unpaid'}
            onPress={() => onFilterChange('unpaid')}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md },
});
