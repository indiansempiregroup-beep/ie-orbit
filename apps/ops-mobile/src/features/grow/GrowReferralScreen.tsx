import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { CustomerReferral } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

type SuccessEvent = 'signup' | 'first_booking' | 'first_paid_order';

export function GrowReferralScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(true);
  const [points, setPoints] = useState('50');
  const [successEvent, setSuccessEvent] = useState<SuccessEvent>('first_paid_order');
  const [referrals, setReferrals] = useState<CustomerReferral[]>([]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, referralsRes] = await Promise.all([
        client.shop.getSettings({ business_id: businessId }),
        client.shop.listCustomerReferrals({ business_id: businessId }),
      ]);
      const metadata = (settingsRes.data.metadata ?? {}) as Record<string, unknown>;
      const referral = readGrowMetadata(metadata).referral ?? {};
      setRawMetadata(metadata);
      setEnabled(referral.enabled !== false);
      setPoints(String(referral.points_per_referral ?? 50));
      setSuccessEvent(referral.success_event ?? 'first_paid_order');
      setReferrals(referralsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function save() {
    if (!client || !businessId) return;
    const pointsNum = Number(points);
    if (!Number.isFinite(pointsNum) || pointsNum < 0) {
      toast.push('Enter a valid points value', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          referral: {
            enabled,
            points_per_referral: pointsNum,
            success_event: successEvent,
          },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('Referral settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={<Button label={busy ? 'Saving…' : 'Save settings'} loading={busy} fullWidth size="lg" onPress={() => void save()} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Customer referrals</Text>
      <Text style={styles.help}>
        When a customer shares their invite code and the referred person completes the success event, award loyalty
        points.
      </Text>

      <Text style={styles.label}>Program</Text>
      <View style={styles.chips}>
        <Chip label="Enabled" active={enabled} onPress={() => setEnabled(true)} />
        <Chip label="Disabled" active={!enabled} onPress={() => setEnabled(false)} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Points per successful referral</Text>
        <TextInput
          style={styles.input}
          value={points}
          onChangeText={(value) => setPoints(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <Text style={styles.label}>Success when</Text>
      <View style={styles.chips}>
        <Chip label="Signup" active={successEvent === 'signup'} onPress={() => setSuccessEvent('signup')} />
        <Chip
          label="First booking"
          active={successEvent === 'first_booking'}
          onPress={() => setSuccessEvent('first_booking')}
        />
        <Chip
          label="First paid order"
          active={successEvent === 'first_paid_order'}
          onPress={() => setSuccessEvent('first_paid_order')}
        />
      </View>

      <Text style={styles.sectionTitle}>Recent referrals</Text>
      {referrals.slice(0, 30).map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={styles.name}>
            {(item.referrer_name || 'Referrer') + ' → ' + (item.referred_name || 'Referred')}
          </Text>
          <Text style={styles.meta}>
            {item.status}
            {item.rewarded_at ? ` · rewarded ${new Date(item.rewarded_at).toLocaleDateString()}` : ''}
          </Text>
        </View>
      ))}
      {!referrals.length ? <Text style={styles.meta}>No referrals recorded yet.</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  label: { ...typography.label, color: colors.foreground },
  sectionTitle: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 2,
  },
  name: { fontFamily: fonts.bodySemi, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive },
});
