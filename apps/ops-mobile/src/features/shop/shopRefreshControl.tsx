import React from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../../theme/tokens';

export function shopListRefreshControl(refreshing: boolean, onRefresh: () => void) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor={colors.card}
    />
  );
}
