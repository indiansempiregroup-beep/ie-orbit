import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MobileDiscoverServiceDetail } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { RootStackParamList } from '../../navigation/types';

export function ServiceDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceDetail'>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const primary = branding?.primaryColor ?? colors.primary;
  const [service, setService] = useState<MobileDiscoverServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
    void mobileClient.mobile
      .getService(route.params.serviceId, { tenant_slug: tenantSlug, business_code: businessCode })
      .then((res) => setService(res.data))
      .catch(() => setService(null))
      .finally(() => setLoading(false));
  }, [tenantSlug, businessCode, route.params.serviceId]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Service</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={primary} />
        </View>
      ) : !service ? (
        <View style={styles.center}>
          <Text style={styles.meta}>Service not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {service.image_url ? (
            <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.hero} />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: `${primary}14` }]}>
              <Feather name="calendar" size={36} color={primary} />
            </View>
          )}
          <Text style={styles.title}>{service.name}</Text>
          <Text style={[styles.price, { color: primary }]}>
            {service.duration_minutes} min · {service.currency} {service.price}
          </Text>
          {service.category_name ? <Text style={styles.meta}>{service.category_name}</Text> : null}
          <Text style={styles.body}>{service.description || service.short_description || 'No description yet.'}</Text>

          {service.staff?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Available staff</Text>
              {service.staff.map((member) => (
                <View key={member.id} style={styles.staffRow}>
                  <View style={[styles.staffIcon, { backgroundColor: `${primary}14` }]}>
                    <Feather name="user" size={16} color={primary} />
                  </View>
                  <View>
                    <Text style={styles.staffName}>{member.display_name}</Text>
                    {member.title ? <Text style={styles.meta}>{member.title}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Button
            label="Book this service"
            size="lg"
            fullWidth
            primaryColor={primary}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Book', params: { serviceId: service.id } } as never)}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.foreground },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: { width: '100%', height: 180, borderRadius: radius.lg, backgroundColor: colors.muted },
  heroFallback: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.heading, color: colors.foreground },
  price: { ...typography.label, fontWeight: '700' },
  meta: { ...typography.caption, color: colors.mutedForeground },
  body: { ...typography.body, color: colors.foreground, lineHeight: 22 },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { ...typography.title, color: colors.foreground },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  staffIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffName: { ...typography.label, color: colors.foreground },
});
