import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useServices } from '../../hooks/useOpsData';
import { colors, spacing } from '../../theme/tokens';
import { formatServiceMeta, serviceImageUrl } from '../../utils/services';
import type { RootStackParamList } from '../../navigation/types';

export function ServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { services, loading, reload } = useServices();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) =>
      [s.name, s.description, s.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [services, search]);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Services" subtitle={`${services.length} total`} />
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search services" />
        <Button label="Add" onPress={() => navigation.navigate('ServiceForm', {})} />
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !services.length}
          empty={!loading && filtered.length === 0}
          emptyMessage="No services found."
        />
        {filtered.map((service) => (
          <ListRow
            key={service.id}
            title={service.name ?? 'Service'}
            subtitle={formatServiceMeta(service)}
            meta={service.status ?? undefined}
            icon="scissors"
            avatarSrc={serviceImageUrl(service) ?? undefined}
            avatarName={service.name ?? 'Service'}
            onPress={() => navigation.navigate('ServiceDetail', { serviceId: service.id })}
          />
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  search: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
