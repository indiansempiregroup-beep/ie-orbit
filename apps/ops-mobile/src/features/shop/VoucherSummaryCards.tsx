import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { spacing } from '../../theme/tokens';
import { formatMoney, type VoucherListSummary } from './shopBooksHelpers';

type Props = {
  summary: VoucherListSummary;
  /** Labels for receivable (sale) vs payable (purchase). */
  mode?: 'sale' | 'purchase' | 'expense';
};

/** Summary tiles only — filters live in a dedicated bar on list screens. */
export function VoucherSummaryCards({ summary, mode = 'sale' }: Props) {
  const unpaidLabel = mode === 'purchase' ? 'To pay' : mode === 'expense' ? 'Spent' : 'To collect';
  const unpaidTone = mode === 'expense' ? 'default' : mode === 'purchase' ? 'negative' : 'warning';

  return (
    <View style={styles.wrap}>
      <TileGrid>
        <StatTile
          label={mode === 'expense' ? 'Total expenses' : 'Total'}
          value={formatMoney(summary.totalAmount)}
          hint={`${summary.count} voucher${summary.count === 1 ? '' : 's'}`}
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
      </TileGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
});
