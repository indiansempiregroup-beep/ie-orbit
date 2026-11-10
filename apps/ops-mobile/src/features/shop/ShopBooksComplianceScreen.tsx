import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { TFunction } from 'i18next';
import type { ShopComplianceSettings, ShopGstCompliance, ShopGstComplianceProvider } from '@ie-orbit/sdk';

function providerOptions(t: TFunction) {
  return [
    { value: 'mock', label: t('shop.compliance.providerMock') },
    { value: 'nic_sandbox', label: t('shop.compliance.providerNicSandbox') },
    { value: 'nic_production', label: t('shop.compliance.providerNicProduction') },
    { value: 'custom', label: t('shop.compliance.providerCustom') },
  ];
}

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
  const { t } = useTranslation();
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
      setError(getApiErrorMessage(err, t('shop.compliance.errLoad')));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, applySettings, t]);

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
      toast.push(t('shop.compliance.toastSaved'), 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.compliance.errSave')), 'error');
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
          {t('shop.compliance.intro')}
        </Text>

        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label}>{t('opsApp.shop.compliance.einvoice')}</Text>
              <Text style={styles.meta}>{t('opsApp.shop.compliance.einvoiceMeta')}</Text>
            </View>
            <Switch value={einvoiceEnabled} onValueChange={setEinvoiceEnabled} disabled={loading} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label}>{t('opsApp.shop.compliance.eway')}</Text>
              <Text style={styles.meta}>{t('opsApp.shop.compliance.ewayMeta')}</Text>
            </View>
            <Switch value={ewayEnabled} onValueChange={setEwayEnabled} disabled={loading} />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t('shop.compliance.providerSection')}</Text>
          <SelectField
            label={t('shop.compliance.provider')}
            required
            value={compliance.provider ?? 'mock'}
            options={providerOptions(t)}
            onChange={(value) => setField('provider', value as ShopGstComplianceProvider)}
          />
          {!showCredentials ? (
            <Text style={styles.hint}>
              {t('shop.compliance.mockNote')}
            </Text>
          ) : (
            <>
              <Input label={t('shop.compliance.username')} required value={compliance.username} onChangeText={(value) => setField('username', value)} autoCapitalize="none" />
              <Input
                label={t('shop.compliance.password')}
                required
                value={compliance.password}
                onChangeText={(value) => setField('password', value)}
                secureTextEntry
                autoCapitalize="none"
              />
              <Input label={t('shop.compliance.clientId')} optional value={compliance.client_id} onChangeText={(value) => setField('client_id', value)} autoCapitalize="none" />
              <Input
                label={t('shop.compliance.clientSecret')}
                optional
                value={compliance.client_secret}
                onChangeText={(value) => setField('client_secret', value)}
                secureTextEntry
                autoCapitalize="none"
              />
              <Input
                label={t('shop.compliance.baseUrl')}
                optional
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
          <Text style={styles.sectionTitle}>{t('shop.compliance.sellerSection')}</Text>
          <Input label={t('shop.compliance.legalName')} required value={compliance.seller_legal_name} onChangeText={(value) => setField('seller_legal_name', value)} />
          <Input label={t('shop.compliance.tradeName')} optional value={compliance.seller_trade_name} onChangeText={(value) => setField('seller_trade_name', value)} />
          <Input label={t('shop.compliance.addr1')} required value={compliance.seller_addr1} onChangeText={(value) => setField('seller_addr1', value)} />
          <Input label={t('shop.compliance.addr2')} optional value={compliance.seller_addr2} onChangeText={(value) => setField('seller_addr2', value)} />
          <Input label={t('shop.compliance.cityLocality')} required value={compliance.seller_loc} onChangeText={(value) => setField('seller_loc', value)} />
          <Input label={t('shop.compliance.pinCode')} required value={compliance.seller_pin} onChangeText={(value) => setField('seller_pin', value)} keyboardType="number-pad" />
          <Input
            label={t('shop.compliance.stateCode')}
            required
            value={compliance.seller_state_code}
            onChangeText={(value) => setField('seller_state_code', value)}
            placeholder={t('shop.compliance.statePlaceholder')}
            keyboardType="number-pad"
          />
        </Card>

        <Button label={saving ? t('common.saving') : t('shop.compliance.saveSettings')} loading={saving} fullWidth size="lg" onPress={() => void handleSave()} />
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
