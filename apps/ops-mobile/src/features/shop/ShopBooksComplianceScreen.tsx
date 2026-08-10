import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { DesktopPage } from '../../components/DesktopPage';
import { getApiErrorMessage } from '../../utils/format';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ShopComplianceSettings, ShopGstCompliance, ShopGstComplianceProvider } from '@ie-platform/sdk';

const PROVIDER_OPTIONS = [
  { value: 'mock', label: 'Mock (demo, no credentials)' },
  { value: 'nic_sandbox', label: 'NIC / GSP sandbox' },
  { value: 'nic_production', label: 'NIC / GSP production' },
  { value: 'custom', label: 'Custom GSP endpoint' },
];

const EMPTY_COMPLIANCE: Required<ShopGstCompliance> = {
  provider: 'mock',
  username: '',
  password: '',
  client_id: '',
  client_secret: '',
  base_url: '',
  seller_legal_name: '',
  seller_trade_name: '',
  seller_addr1: '',
  seller_addr2: '',
  seller_loc: '',
  seller_pin: '',
  seller_state_code: '',
};

export function ShopBooksComplianceScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [einvoiceEnabled, setEinvoiceEnabled] = useState(false);
  const [ewayEnabled, setEwayEnabled] = useState(false);
  const [compliance, setCompliance] = useState<Required<ShopGstCompliance>>(EMPTY_COMPLIANCE);

  const applySettings = useCallback((settings: ShopComplianceSettings) => {
    setEinvoiceEnabled(Boolean(settings.einvoice_enabled));
    setEwayEnabled(Boolean(settings.eway_enabled));
    setCompliance({ ...EMPTY_COMPLIANCE, ...(settings.gst_compliance ?? {}) });
  }, []);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.getComplianceSettings({ business_id: businessId });
      applySettings(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load compliance settings'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, applySettings]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function setField<K extends keyof ShopGstCompliance>(key: K, value: ShopGstCompliance[K]) {
    setCompliance((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    try {
      const response = await client.shop.updateComplianceSettings({
        business_id: businessId ?? '',
        einvoice_enabled: einvoiceEnabled,
        eway_enabled: ewayEnabled,
        gst_compliance: compliance,
      });
      applySettings(response.data);
      toast.push('Compliance settings saved', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to save compliance settings'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const showCredentials = compliance.provider !== 'mock';

  return (
    <DesktopPage>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.intro}>
          Turn on IRN (e-invoice) and e-way bill generation for your GST sale vouchers. Defaults to a mock
          provider so you can try it without NIC/GSP credentials.
        </Text>

        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label}>E-invoice (IRN)</Text>
              <Text style={styles.meta}>Generate IRN for GST sale vouchers</Text>
            </View>
            <Switch value={einvoiceEnabled} onValueChange={setEinvoiceEnabled} disabled={loading} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label}>E-way bill</Text>
              <Text style={styles.meta}>Generate e-way bills for movement of goods</Text>
            </View>
            <Switch value={ewayEnabled} onValueChange={setEwayEnabled} disabled={loading} />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>GSP / portal provider</Text>
          <SelectField
            label="Provider"
            value={compliance.provider ?? 'mock'}
            options={PROVIDER_OPTIONS}
            onChange={(value) => setField('provider', value as ShopGstComplianceProvider)}
          />
          {!showCredentials ? (
            <Text style={styles.hint}>
              Mock mode simulates IRN/e-way bill numbers so you can demo the flow. Switch providers when you have
              live NIC/GSP credentials.
            </Text>
          ) : (
            <>
              <Input label="Username" value={compliance.username} onChangeText={(value) => setField('username', value)} autoCapitalize="none" />
              <Input
                label="Password"
                value={compliance.password}
                onChangeText={(value) => setField('password', value)}
                secureTextEntry
                autoCapitalize="none"
              />
              <Input label="Client ID" value={compliance.client_id} onChangeText={(value) => setField('client_id', value)} autoCapitalize="none" />
              <Input
                label="Client secret"
                value={compliance.client_secret}
                onChangeText={(value) => setField('client_secret', value)}
                secureTextEntry
                autoCapitalize="none"
              />
              <Input
                label="Base URL"
                value={compliance.base_url}
                onChangeText={(value) => setField('base_url', value)}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://api.example-gsp.in"
              />
            </>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Seller address (as per GST registration)</Text>
          <Input label="Legal name" value={compliance.seller_legal_name} onChangeText={(value) => setField('seller_legal_name', value)} />
          <Input label="Trade name" value={compliance.seller_trade_name} onChangeText={(value) => setField('seller_trade_name', value)} />
          <Input label="Address line 1" value={compliance.seller_addr1} onChangeText={(value) => setField('seller_addr1', value)} />
          <Input label="Address line 2" value={compliance.seller_addr2} onChangeText={(value) => setField('seller_addr2', value)} />
          <Input label="City / locality" value={compliance.seller_loc} onChangeText={(value) => setField('seller_loc', value)} />
          <Input label="PIN code" value={compliance.seller_pin} onChangeText={(value) => setField('seller_pin', value)} keyboardType="number-pad" />
          <Input
            label="State code (GST)"
            value={compliance.seller_state_code}
            onChangeText={(value) => setField('seller_state_code', value)}
            placeholder="e.g. 27"
            keyboardType="number-pad"
          />
        </Card>

        <Button label={saving ? 'Saving…' : 'Save compliance settings'} loading={saving} fullWidth size="lg" onPress={() => void handleSave()} />
      </ScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  intro: { ...typography.body, color: colors.mutedForeground },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  card: { gap: spacing.md },
  sectionTitle: { ...typography.title, fontSize: 15, color: colors.foreground },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchCopy: { flex: 1, gap: 2 },
  label: { ...typography.label, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
