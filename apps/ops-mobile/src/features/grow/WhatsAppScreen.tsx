import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { uploadMedia } from '../../api/media';
import type { Customer, ShopSupplier } from '@ie-orbit/sdk';
import { readGrowMetadata, withGrowMetadata } from './growSettings';
import {
  DIAL_CODES,
  dialCodeForBusinessCountry,
  dialCodeOptions,
  digitsOnly,
  splitPhone,
  type DialCode,
} from './dialCodes';

type PartyMode = 'manual' | 'customer' | 'supplier';

function customerLabel(customer: Customer) {
  return (
    customer.full_name ||
    customer.display_name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.phone_number ||
    customer.email ||
    customer.id
  );
}

function supplierLabel(supplier: ShopSupplier) {
  return supplier.name || supplier.phone || supplier.id;
}

export function WhatsAppScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { token } = useAuth();
  const { businessId, tenantId, activeBusiness } = useWorkspace();

  const businessDefault = useMemo(
    () => dialCodeForBusinessCountry(activeBusiness?.country),
    [activeBusiness?.country],
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [partyMode, setPartyMode] = useState<PartyMode>('manual');
  const [partyId, setPartyId] = useState('');
  const [dialIso, setDialIso] = useState(businessDefault.iso);
  const [nationalNumber, setNationalNumber] = useState('');
  const [message, setMessage] = useState('Hi! Thanks for shopping with us.');
  const [attachmentId, setAttachmentId] = useState<string | undefined>();
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>();
  const [pendingAsset, setPendingAsset] = useState<ImagePickerAsset | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);

  const selectedDial: DialCode = useMemo(
    () => DIAL_CODES.find((item) => item.iso === dialIso) ?? businessDefault,
    [dialIso, businessDefault],
  );

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, customersRes, suppliersRes] = await Promise.all([
        client.shop.getSettings({ business_id: businessId }),
        client.customers.list({ business: businessId }),
        client.shop.listSuppliers({ business_id: businessId }),
      ]);
      const metadata = (settingsRes.data.metadata ?? {}) as Record<string, unknown>;
      const whatsapp = readGrowMetadata(metadata).whatsapp ?? {};
      setRawMetadata(metadata);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);

      const fallback = dialCodeForBusinessCountry(activeBusiness?.country);
      if (whatsapp.country_iso || whatsapp.dial_code || whatsapp.national_number) {
        const iso =
          whatsapp.country_iso ||
          DIAL_CODES.find((c) => c.dial === digitsOnly(whatsapp.dial_code ?? ''))?.iso ||
          fallback.iso;
        setDialIso(iso);
        setNationalNumber(whatsapp.national_number ?? '');
      } else if (whatsapp.phone) {
        const split = splitPhone(whatsapp.phone, fallback);
        setDialIso(split.dial.iso);
        setNationalNumber(split.national);
      } else {
        setDialIso(fallback.iso);
        setNationalNumber('');
      }
      setMessage(whatsapp.default_message ?? 'Hi! Thanks for shopping with us.');
      setAttachmentId(whatsapp.attachment_media_id);
      setAttachmentUrl(whatsapp.attachment_url);
      setPendingAsset(null);
      setPartyMode('manual');
      setPartyId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load WhatsApp settings');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, activeBusiness?.country]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const partyOptions = useMemo(() => {
    if (partyMode === 'customer') {
      return [
        { value: '', label: 'Select customer…' },
        ...customers.map((customer) => ({
          value: customer.id,
          label: customerLabel(customer),
        })),
      ];
    }
    if (partyMode === 'supplier') {
      return [
        { value: '', label: 'Select supplier…' },
        ...suppliers.map((supplier) => ({
          value: supplier.id,
          label: supplierLabel(supplier),
        })),
      ];
    }
    return [];
  }, [partyMode, customers, suppliers]);

  function applyPartyPhone(rawPhone: string | null | undefined, label: string) {
    if (!rawPhone?.trim()) {
      toast.push(`${label} has no phone number`, 'error');
      return;
    }
    const split = splitPhone(rawPhone, selectedDial);
    setDialIso(split.dial.iso);
    setNationalNumber(split.national);
  }

  function onSelectParty(id: string) {
    setPartyId(id);
    if (!id) return;
    if (partyMode === 'customer') {
      const customer = customers.find((item) => item.id === id);
      if (customer) applyPartyPhone(customer.phone_number || (customer as { alternate_phone?: string }).alternate_phone, 'Customer');
      return;
    }
    if (partyMode === 'supplier') {
      const supplier = suppliers.find((item) => item.id === id);
      if (supplier) applyPartyPhone(supplier.phone, 'Supplier');
    }
  }

  async function pickAttachment() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.push('Photo library permission is required', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingAsset(result.assets[0]);
    setAttachmentUrl(result.assets[0].uri);
  }

  function clearAttachment() {
    setPendingAsset(null);
    setAttachmentId(undefined);
    setAttachmentUrl(undefined);
  }

  async function ensureAttachmentUploaded(): Promise<{ id?: string; url?: string }> {
    if (!pendingAsset) {
      return { id: attachmentId, url: attachmentUrl };
    }
    if (!token || !tenantId || !businessId) {
      throw new Error('Sign in again to upload attachments');
    }
    const uploaded = await uploadMedia({
      token,
      tenantId,
      businessId,
      asset: pendingAsset,
      folderType: 'documents',
      tags: ['grow', 'whatsapp'],
      displayName: 'WhatsApp attachment',
    });
    setPendingAsset(null);
    setAttachmentId(uploaded.id);
    setAttachmentUrl(uploaded.public_url || uploaded.private_url || attachmentUrl);
    return {
      id: uploaded.id,
      url: uploaded.public_url || uploaded.private_url || attachmentUrl,
    };
  }

  async function save() {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const media = await ensureAttachmentUploaded();
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          whatsapp: {
            country_iso: selectedDial.iso,
            dial_code: selectedDial.dial,
            national_number: digitsOnly(nationalNumber),
            phone: `${selectedDial.dial}${digitsOnly(nationalNumber)}`,
            default_message: message.trim(),
            attachment_media_id: media.id,
            attachment_url: media.url,
          },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('WhatsApp settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openWhatsApp() {
    const national = digitsOnly(nationalNumber);
    if (!national) {
      toast.push('Enter or select a phone number', 'error');
      return;
    }
    const full = `${selectedDial.dial}${national}`;
    const text = message.trim();

    setBusy(true);
    try {
      const media = await ensureAttachmentUploaded();
      if (media.url) {
        await Share.share({
          message: `${text}\n${media.url}`.trim(),
          url: media.url,
          title: 'Share via WhatsApp',
        });
      }
      const url = `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        toast.push('Unable to open WhatsApp', 'error');
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to open WhatsApp', 'error');
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
      footer={
        <View style={styles.footer}>
          <Button label={busy ? 'Working…' : 'Open WhatsApp'} fullWidth onPress={() => void openWhatsApp()} />
          <Button
            label={busy ? 'Saving…' : 'Save defaults'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>WhatsApp</Text>
      <Text style={styles.help}>
        Pick a customer or supplier to fill their number, or enter it manually. Attach an image to share with your
        message.
      </Text>

      <Text style={styles.label}>Send to</Text>
      <View style={styles.chipRow}>
        <Chip
          label="Manual"
          active={partyMode === 'manual'}
          onPress={() => {
            setPartyMode('manual');
            setPartyId('');
          }}
        />
        <Chip
          label="Customer"
          active={partyMode === 'customer'}
          onPress={() => {
            setPartyMode('customer');
            setPartyId('');
          }}
        />
        <Chip
          label="Supplier"
          active={partyMode === 'supplier'}
          onPress={() => {
            setPartyMode('supplier');
            setPartyId('');
          }}
        />
      </View>

      {partyMode !== 'manual' ? (
        <SelectField
          label={partyMode === 'customer' ? 'Customer' : 'Supplier'}
          value={partyId}
          options={partyOptions}
          onChange={onSelectParty}
          searchable
        />
      ) : null}

      <SelectField
        label="Country"
        value={dialIso}
        options={dialCodeOptions()}
        onChange={setDialIso}
        searchable
      />

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Phone</Text>
        <View style={styles.phoneRow}>
          <View style={styles.dialPrefix}>
            <Text style={styles.dialPrefixText}>+{selectedDial.dial}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.phoneInput]}
            value={nationalNumber}
            onChangeText={(value) => setNationalNumber(digitsOnly(value))}
            placeholder="98XXXXXXXX"
            keyboardType="phone-pad"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Default message</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Attachment</Text>
        {attachmentUrl ? (
          <View style={styles.attachPreview}>
            <Image source={{ uri: attachmentUrl }} style={styles.attachImage} />
            <Pressable onPress={clearAttachment} style={styles.removeAttach} hitSlop={8}>
              <Feather name="x" size={16} color={colors.destructive} />
              <Text style={styles.removeAttachText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.attachEmpty} onPress={() => void pickAttachment()}>
            <Feather name="image" size={20} color={colors.primary} />
            <Text style={styles.attachEmptyText}>Upload image</Text>
          </Pressable>
        )}
        {attachmentUrl ? (
          <Button label="Replace image" variant="outline" fullWidth onPress={() => void pickAttachment()} />
        ) : null}
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  fieldBlock: { gap: 6 },
  label: { ...typography.label, color: colors.foreground },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dialPrefix: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.tint,
  },
  dialPrefixText: { color: colors.foreground, fontWeight: '600' },
  phoneInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 88, textAlignVertical: 'top' },
  attachEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
  },
  attachEmptyText: { color: colors.primary, fontWeight: '600' },
  attachPreview: { gap: 8 },
  attachImage: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.muted },
  removeAttach: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeAttachText: { color: colors.destructive, fontWeight: '600' },
  footer: { gap: spacing.sm },
  error: { color: colors.destructive },
});
