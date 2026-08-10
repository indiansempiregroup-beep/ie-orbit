import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopPage } from '../../components/DesktopPage';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { PlatformTenantDetail } from '@ie-platform/sdk';
import { voucherStatusStyle } from '../shop/shopBooksHelpers';

export function PlatformAdminTenantDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlatformAdminTenantDetail'>>();
  const { tenantId } = route.params;
  const client = useOpsClient();
  const toast = useToast();

  const [tenant, setTenant] = useState<PlatformTenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<'suspend' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.platform.tenant(tenantId);
      setTenant(response.data);
      navigation.setOptions({ title: response.data.display_name || 'Tenant' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }, [client, tenantId, navigation]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Tenant' });
  }, [navigation]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function confirmAction() {
    if (!client || !tenant || !pendingAction) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.push('Reason is required', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.platform.tenantAction(tenant.id, pendingAction, { reason: trimmed });
      toast.push(`Tenant ${pendingAction === 'suspend' ? 'suspended' : 'reactivated'}`, 'success');
      setPendingAction(null);
      setReason('');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : `Unable to ${pendingAction} tenant`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !tenant) {
    return (
      <DesktopPage>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </DesktopPage>
    );
  }

  if (error && !tenant) {
    return (
      <DesktopPage>
        <View style={styles.center}>
          <EmptyState icon="alert-circle" title="Unable to load tenant" message={error} actionLabel="Retry" onAction={() => void load()} />
        </View>
      </DesktopPage>
    );
  }

  if (!tenant) {
    return (
      <DesktopPage>
        <View style={styles.center}>
          <EmptyState icon="briefcase" title="Tenant not found" />
        </View>
      </DesktopPage>
    );
  }

  const badge = voucherStatusStyle(tenant.status);
  const status = (tenant.status || '').toLowerCase();
  const canSuspend = status === 'active' || status === 'trialing';
  const canReactivate = status === 'suspended' || status === 'inactive';

  return (
    <DesktopPage>
      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.name}>{tenant.display_name}</Text>
          <Text style={styles.meta}>{tenant.slug}</Text>
          <View style={[styles.badge, { backgroundColor: badge.bg, alignSelf: 'flex-start' }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{tenant.status}</Text>
          </View>
        </View>

        <Text style={styles.section}>Businesses</Text>
        {tenant.businesses?.length ? (
          tenant.businesses.map((business) => (
            <View key={business.id} style={styles.businessRow}>
              <Text style={styles.businessName}>{business.display_name}</Text>
              <Text style={styles.meta}>
                {business.business_code}
                {business.selected_product ? ` · ${business.selected_product}` : ''}
                {` · ${business.status}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.meta}>No businesses on this tenant.</Text>
        )}

        {pendingAction ? (
          <View style={styles.actionCard}>
            <Text style={styles.section}>
              {pendingAction === 'suspend' ? 'Suspend tenant' : 'Reactivate tenant'}
            </Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (required)"
              multiline
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.actions}>
              <Button
                label={busy ? 'Working…' : 'Confirm'}
                variant={pendingAction === 'suspend' ? 'destructive' : 'primary'}
                fullWidth
                loading={busy}
                onPress={() => void confirmAction()}
              />
              <Button
                label="Cancel"
                variant="ghost"
                fullWidth
                onPress={() => {
                  setPendingAction(null);
                  setReason('');
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            {canSuspend ? (
              <Button
                label="Suspend tenant"
                variant="destructive"
                fullWidth
                onPress={() => setPendingAction('suspend')}
              />
            ) : null}
            {canReactivate ? (
              <Button label="Reactivate tenant" fullWidth onPress={() => setPendingAction('reactivate')} />
            ) : null}
          </View>
        )}
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  actionCard: { gap: spacing.sm },
  name: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.foreground },
  meta: { ...typography.body, color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  section: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground, marginTop: spacing.sm },
  businessRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 2,
  },
  businessName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  error: { color: colors.destructive },
});
