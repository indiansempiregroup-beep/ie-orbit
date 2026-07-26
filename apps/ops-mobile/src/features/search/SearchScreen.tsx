import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SearchBar } from '../../components/SearchBar';
import { ListRow } from '../../components/ui/ListRow';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { ScreenState } from '../../components/ScreenState';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useAuth } from '../../contexts/AuthContext';
import { useGlobalSearch } from '../../hooks/useOpsExtended';
import { canAccessStaffDirectory } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showStaff = canAccessStaffDirectory(user);
  const [term, setTerm] = useState('');
  const { results, loading } = useGlobalSearch(term);

  const staffResults = showStaff ? results?.staff ?? [] : [];
  const hasResults =
    (results?.customers?.length ?? 0) + staffResults.length + (results?.services?.length ?? 0) > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <SearchBar
          value={term}
          onChangeText={setTerm}
          placeholder={showStaff ? 'Customers, staff, services…' : 'Customers, services…'}
        />
      </View>
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <ScreenState
          loading={loading && Boolean(term)}
          empty={Boolean(term) && !loading && !hasResults}
          emptyMessage="No results."
        />

        {results?.customers?.length ? (
          <View style={styles.section}>
            <SectionHeader title="Customers" />
            <View style={styles.list}>
              {results.customers.map((item) => {
                const name = item.display_name ?? item.full_name ?? item.email ?? 'Customer';
                return (
                  <ListRow
                    key={`c-${item.id}`}
                    title={name}
                    subtitle={item.email ?? undefined}
                    avatarName={name}
                    onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {staffResults.length ? (
          <View style={styles.section}>
            <SectionHeader title="Staff" />
            <View style={styles.list}>
              {staffResults.map((item) => {
                const name = item.display_name ?? item.full_name ?? item.email ?? 'Staff';
                return (
                  <ListRow
                    key={`s-${item.id}`}
                    title={name}
                    subtitle={item.email ?? undefined}
                    avatarName={name}
                    onPress={() => navigation.navigate('StaffDetail', { staffId: item.id })}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {results?.services?.length ? (
          <View style={styles.section}>
            <SectionHeader title="Services" />
            <View style={styles.list}>
              {results.services.map((item) => (
                <ListRow
                  key={`v-${item.id}`}
                  title={item.name ?? 'Service'}
                  icon="scissors"
                  avatarName={item.name ?? 'Service'}
                  onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {!term ? (
          <Text style={styles.hint}>
            {showStaff ? 'Search customers, staff, and services.' : 'Search customers and services.'}
          </Text>
        ) : null}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  section: { gap: spacing.sm },
  list: { gap: spacing.md, marginTop: -spacing.sm },
  hint: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.lg },
});
