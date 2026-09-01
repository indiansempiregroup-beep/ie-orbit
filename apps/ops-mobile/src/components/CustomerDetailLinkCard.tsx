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
  customerPhone?: string;
  customerEmail?: string;
  addressPreview?: string;
};

export function CustomerDetailLinkCard({
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  addressPreview,
}: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.pressable}
        onPress={() => navigation.navigate('CustomerDetail', { customerId })}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Feather name="user" size={16} color={colors.primary} />
            <Text style={styles.title}>Customer details</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
        <Text style={styles.name}>{customerName}</Text>
        {customerPhone ? <Text style={styles.meta}>{customerPhone}</Text> : null}
        {customerEmail ? <Text style={styles.meta}>{customerEmail}</Text> : null}
        {addressPreview ? (
          <Text style={styles.addressPreview} numberOfLines={3}>
            {addressPreview}
          </Text>
        ) : (
          <Text style={styles.hint}>View address and contact information</Text>
        )}
      </Pressable>
      {customerPhone ? (
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
    gap: 4,
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
  meta: { fontSize: 14, color: colors.mutedForeground },
  addressPreview: {
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 20,
    marginTop: 4,
    flexShrink: 1,
  },
  hint: { fontSize: 13, color: colors.primary, marginTop: 4, fontWeight: '600' },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  callText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
