import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { findInCursorPages } from '../../utils/findInPages';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopDeliveryZoneForm'>;

type ZoneForm = {
  name: string;
  cities: string;
  prefixes: string;
  fee: string;
  minOrder: string;
  notes: string;
  sameDay: boolean;
  instantDelivery: boolean;
  enabled: boolean;
};

const EMPTY_FORM: ZoneForm = {
  name: '',
  cities: '',
  prefixes: '',
  fee: '0',
  minOrder: '0',
  notes: '',
  sameDay: true,
  instantDelivery: false,
  enabled: true,
};

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ShopDeliveryZoneFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const zoneId = route.params?.zoneId;
  const isEditing = Boolean(zoneId);
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [form, setForm] = useState<ZoneForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!zoneId || !client || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const zone = await findInCursorPages(
        (cursor) => client.shop.listDeliveryZones({ business_id: businessId, page_size: 100, cursor }),
        (row) => row.id === zoneId,
      );
      if (!zone) {
        setError(t('opsApp.shop.zones.notFound'));
        return;
      }
      setForm({
        name: zone.name,
        cities: (zone.cities ?? []).join(', '),
        prefixes: (zone.postal_prefixes ?? []).join(', '),
        fee: String(zone.fee ?? '0'),
        minOrder: String(zone.min_order_total ?? '0'),
        notes: zone.notes ?? '',
        sameDay: zone.same_day !== false,
        instantDelivery: zone.instant_delivery_enabled === true,
        enabled: zone.enabled !== false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.zones.zoneLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, zoneId, t]);

  useEffect(() => {
    if (isEditing) void load();
  }, [isEditing, load]);

  function setField<K extends keyof ZoneForm>(key: K, value: ZoneForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!client || !businessId || !form.name.trim()) {
      setError(t('opsApp.shop.zones.nameRequired'));
      toast.push(t('opsApp.shop.zones.nameRequired'), 'error');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      cities: splitCsv(form.cities),
      postal_prefixes: splitCsv(form.prefixes),
      fee: form.fee.trim() || '0',
      min_order_total: form.minOrder.trim() || '0',
      notes: form.notes.trim(),
      same_day: form.sameDay,
      instant_delivery_enabled: form.instantDelivery,
      enabled: form.enabled,
    };
    try {
      if (zoneId) {
        await client.shop.patchDeliveryZone(zoneId, payload);
        toast.push(t('shop.deliveryZones.toastSaved'), 'success');
      } else {
        await client.shop.createDeliveryZone(payload);
        toast.push(t('shop.deliveryZones.toastAdded'), 'success');
      }
      navigation.goBack();
    } catch (err) {
      const text = err instanceof Error ? err.message : t('shop.deliveryZones.errSave');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenState loading />;

  return (
    <FormScreen
      footer={
        <Button
          label={
            saving
              ? t('common.saving')
              : isEditing
                ? t('shop.deliveryZones.updateZone')
                : t('shop.deliveryZones.saveZone')
          }
          icon="save"
          loading={saving}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      <Text style={styles.formTitle}>{isEditing ? t('shop.deliveryZones.editZone') : t('shop.deliveryZones.addDeliveryZone')}</Text>
      <Text style={styles.help}>
        {t('opsApp.shop.zones.formHelp')}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Input
        label={t('shop.deliveryZones.zoneName')}
        required
        value={form.name}
        onChangeText={(value) => setField('name', value)}
        placeholder={t('shop.deliveryZones.zoneNamePlaceholder')}
        error={!form.name.trim() && error === t('opsApp.shop.zones.nameRequired') ? error : undefined}
      />
      <Input
        label={t('opsApp.shop.zones.cities')}
        optional
        value={form.cities}
        onChangeText={(value) => setField('cities', value)}
        placeholder="Nashik, Nasik"
        hint={t('opsApp.shop.zones.commaSeparated')}
      />
      <Input
        label={t('opsApp.shop.zones.postalPrefixes')}
        optional
        value={form.prefixes}
        onChangeText={(value) => setField('prefixes', value)}
        placeholder="422"
        hint={t('opsApp.shop.zones.commaSeparated')}
      />
      <Input
        label={t('shop.deliveryZones.deliveryFee')}
        required
        value={form.fee}
        onChangeText={(value) => setField('fee', value)}
        keyboardType="decimal-pad"
      />
      <Input
        label={t('shop.deliveryZones.minimumOrder')}
        optional
        value={form.minOrder}
        onChangeText={(value) => setField('minOrder', value)}
        keyboardType="decimal-pad"
      />
      <Input
        label={t('shop.deliveryZones.notes')}
        optional
        value={form.notes}
        onChangeText={(value) => setField('notes', value)}
        placeholder={t('shop.godowns.optional')}
        multiline
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('shop.deliveryZones.sameDayDelivery')}</Text>
        <Switch value={form.sameDay} onValueChange={(value) => setField('sameDay', value)} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('shop.deliveryZones.allowDeliverNow')}</Text>
        <Switch value={form.instantDelivery} onValueChange={(value) => setField('instantDelivery', value)} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('shop.deliveryZones.enabled')}</Text>
        <Switch value={form.enabled} onValueChange={(value) => setField('enabled', value)} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { color: colors.mutedForeground, marginBottom: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { color: colors.foreground, fontWeight: '500' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
