import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { useGlobalSearch } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [term, setTerm] = useState('');
  const { results, loading } = useGlobalSearch(term);

  const hasResults =
    (results?.customers?.length ?? 0) + (results?.staff?.length ?? 0) + (results?.services?.length ?? 0) > 0;

  return (
    <View style={styles.wrap}>
      <SearchBar value={term} onChangeText={setTerm} placeholder="Search customers, staff, services, bookings" />
      <ScreenState loading={loading && Boolean(term)} empty={Boolean(term) && !loading && !hasResults} emptyMessage="No results." />
      {results?.customers?.map((item) => (
        <Pressable key={`c-${item.id}`} onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}>
          <Card><Text style={styles.title}>Customer · {item.full_name ?? item.email}</Text></Card>
        </Pressable>
      ))}
      {results?.staff?.map((item) => (
        <Pressable key={`s-${item.id}`} onPress={() => navigation.navigate('StaffDetail', { staffId: item.id })}>
          <Card><Text style={styles.title}>Staff · {item.full_name ?? item.email}</Text></Card>
        </Pressable>
      ))}
      {results?.services?.map((item) => (
        <Pressable key={`v-${item.id}`} onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}>
          <Card><Text style={styles.title}>Service · {item.name}</Text></Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.body, color: colors.foreground, fontWeight: '600' },
});
