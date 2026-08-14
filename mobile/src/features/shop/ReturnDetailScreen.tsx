import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, spacing } from '../../theme/tokens';
import type { ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReturnDetail'>;

export function ReturnDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [item, setItem] = useState<ShopReturn | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  useEffect(() => {
    void (async () => {
      const res = await mobileClient.mobile.getMyReturn(route.params.returnId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setItem(res.data);
    })();
  }, [businessCode, route.params.returnId, tenantSlug]);

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={item.return_number} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
      <Text style={styles.title}>{item.return_number}</Text>
      <Text style={styles.meta}>Status: {item.status}</Text>
      <Text style={styles.meta}>
        Refund {item.currency || ''} {item.refund_total}
      </Text>
      {item.reason ? <Text style={styles.body}>Reason: {item.reason}</Text> : null}
      {(item.line_items || []).map((line, index) => (
        <Text key={String(index)} style={styles.body}>
          Line {String((line as { order_line_id?: string }).order_line_id || index + 1)} · qty{' '}
          {String((line as { quantity?: string | number }).quantity || '')}
        </Text>
      ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 8, color: colors.mutedForeground },
  body: { marginTop: spacing.sm, color: colors.foreground },
});
