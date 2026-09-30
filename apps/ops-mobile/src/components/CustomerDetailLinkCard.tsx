import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = {
  customerId: string;
  customerName: string;
  /** Account / profile phone. */
  customerPhone?: string;
  customerEmail?: string;
  /** Generic address preview (e.g. bookings) when not a delivery order. */
  addressPreview?: string;
  /** Delivery address for this order (shown separately from account contact). */
  deliveryAddress?: string;
  /** Phone saved on the delivery address for this order. */
  deliveryPhone?: string;
  /** Close a parent modal before pushing customer details. */
  onBeforeNavigate?: () => void;
};

export function CustomerDetailLinkCard({
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  addressPreview,
  deliveryAddress,
  deliveryPhone,
  onBeforeNavigate,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const showDeliveryBlock = Boolean(deliveryAddress || deliveryPhone);

  function openCustomer() {
    onBeforeNavigate?.();
    navigation.navigate('CustomerDetail', { customerId });
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.pressable} onPress={openCustomer}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Feather name="user" size={16} color={colors.primary} />
            <Text style={styles.title}>Customer details</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
        <Text style={styles.name}>{customerName}</Text>
        {customerPhone ? (
          <View style={styles.contactRow}>
            <Text style={styles.contactLabel}>Account phone</Text>
            <Text style={styles.meta}>{customerPhone}</Text>
          </View>
        ) : null}
        {customerEmail ? <Text style={styles.meta}>{customerEmail}</Text> : null}
        {!showDeliveryBlock && addressPreview ? (
          <Text style={styles.addressPreview} numberOfLines={3}>
            {addressPreview}
          </Text>
        ) : null}
        {!customerPhone && !customerEmail && !addressPreview && !showDeliveryBlock ? (
          <Text style={styles.hint}>View address and contact information</Text>
        ) : null}
      </Pressable>

      {showDeliveryBlock ? (
        <View style={styles.deliveryBox}>
          <View style={styles.titleRow}>
            <Feather name="map-pin" size={14} color={colors.primary} />
            <Text style={styles.title}>Delivery address</Text>
          </View>
          {deliveryAddress ? <Text style={styles.addressPreview}>{deliveryAddress}</Text> : null}
          {deliveryPhone ? (
            <View style={styles.deliveryPhoneRow}>
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Delivery phone</Text>
                <Text style={styles.deliveryPhone}>{deliveryPhone}</Text>
              </View>
              <Pressable
                style={styles.callBtn}
                onPress={() => void Linking.openURL(`tel:${deliveryPhone}`)}
              >
                <Feather name="phone" size={14} color={colors.primary} />
                <Text style={styles.callText}>Call</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {customerPhone && !deliveryPhone ? (
        <Pressable style={styles.callBtn} onPress={() => void Linking.openURL(`tel:${customerPhone}`)}>
          <Feather name="phone" size={14} color={colors.primary} />
          <Text style={styles.callText}>Call customer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  pressable: { gap: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.foreground, marginTop: 4 },
  contactRow: { gap: 2, flex: 1 },
  contactLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  meta: { fontSize: 14, color: colors.mutedForeground },
  deliveryBox: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  addressPreview: {
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 20,
    flexShrink: 1,
  },
  deliveryPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliveryPhone: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  hint: { fontSize: 13, color: colors.primary, marginTop: 4, fontWeight: '600' },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  callText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
