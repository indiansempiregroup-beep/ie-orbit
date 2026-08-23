import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Share,
  StyleSheet,
  Text,
  View,
  type ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { MobileReferralSnapshot } from '@ie-platform/sdk';
import * as Clipboard from 'expo-clipboard';
import { mobileClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ProfileMenuScreen } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { buildReferralLinks } from '../../utils/referralLinks';
import type { RootStackParamList } from '../../navigation/types';

const EMPTY: MobileReferralSnapshot = {
  enabled: false,
  points_per_referral: 0,
  success_event: 'first_paid_order',
  code: null,
  stats: { invited: 0, pending: 0, rewarded: 0, points_earned: 0 },
  referrals: [],
  applied_code: null,
  applied_status: null,
};

export function ReferralScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;
  const appName = bootstrap?.business.display_name ?? branding?.appName ?? 'us';
  const [data, setData] = useState<MobileReferralSnapshot>(EMPTY);
  const [friendCode, setFriendCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeFocused, setCodeFocused] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const applyCardOffset = useRef(0);

  const load = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setError(null);
    try {
      const res = await mobileClient.mobile.getReferral({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, t('referral.loadError')));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Runs once the keyboard height has been reserved as padding, so the card can be
  // scrolled all the way to the top of the shortened viewport.
  useEffect(() => {
    if (!codeFocused || !keyboardHeight) return;
    scrollRef.current?.scrollTo({
      y: Math.max(applyCardOffset.current - spacing.lg, 0),
      animated: true,
    });
  }, [codeFocused, keyboardHeight]);

  const howItWorks = useMemo(() => {
    if (data.success_event === 'signup') return t('referral.earnOnSignup');
    if (data.success_event === 'first_booking') return t('referral.earnOnBooking');
    return t('referral.earnOnOrder');
  }, [data.success_event, t]);

  async function onShare() {
    if (!data.code) return;
    const links = buildReferralLinks({ code: data.code, tenantSlug, businessCode });
    const downloadLine =
      links.downloadUrl && links.downloadUrl !== links.shareUrl
        ? `\n${t('referral.downloadApp')}: ${links.downloadUrl}`
        : '';
    await Share.share({
      message: `${t('referral.shareMessage', {
        appName,
        code: data.code,
        points: data.points_per_referral,
      })}\n${links.shareUrl}${downloadLine}`,
    });
  }

  async function onCopy() {
    if (!data.code) return;
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function onApply() {
    if (!tenantSlug || !businessCode || !friendCode.trim()) return;
    Keyboard.dismiss();
    setApplying(true);
    setError(null);
    try {
      const res = await mobileClient.mobile.applyReferral({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        referral_code: friendCode.trim(),
      });
      setData(res.data);
      setFriendCode('');
      Alert.alert(t('referral.appliedTitle'), t('referral.appliedBody'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('referral.applyError')));
    } finally {
      setApplying(false);
    }
  }

  return (
    <ProfileMenuScreen
      title={t('referral.title')}
      onBack={() => navigation.goBack()}
      refreshing={refreshing}
      onRefresh={onRefresh}
      primaryColor={primary}
      scrollRef={scrollRef}
    >
      {loading ? (
        <ActivityIndicator color={primary} style={styles.loader} />
      ) : !data.enabled ? (
        <Text style={styles.muted}>{t('referral.unavailable')}</Text>
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: `${primary}12` }]}>
            <Feather name="gift" size={22} color={primary} />
            <Text style={styles.heroTitle}>{t('referral.heroTitle', { points: data.points_per_referral })}</Text>
            <Text style={styles.heroBody}>{howItWorks}</Text>
          </View>

          <View style={styles.statsRow}>
            <Stat label={t('referral.invited')} value={String(data.stats.invited)} />
            <Stat label={t('referral.pending')} value={String(data.stats.pending)} />
            <Stat label={t('referral.earned')} value={String(data.stats.points_earned)} />
          </View>

          {data.code ? (
            <View style={styles.codeCard}>
              <Text style={styles.sectionLabel}>{t('referral.yourCode')}</Text>
              <Text style={styles.code}>{data.code}</Text>
              <Text style={styles.muted}>{t('referral.codeHint')}</Text>
              <View style={styles.codeActions}>
                <Button
                  label={copied ? t('referral.copied') : t('referral.copy')}
                  variant="outline"
                  style={styles.actionButton}
                  onPress={() => void onCopy()}
                />
                <Button
                  label={t('referral.share')}
                  style={styles.actionButton}
                  primaryColor={primary}
                  onPress={() => void onShare()}
                />
              </View>
            </View>
          ) : null}

          {!data.applied_status ? (
            <View
              style={styles.applyCard}
              onLayout={(event) => {
                applyCardOffset.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionLabel}>{t('referral.haveCode')}</Text>
              <Input
                label={t('referral.friendCode')}
                leftIcon="hash"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                value={friendCode}
                onChangeText={(value) => setFriendCode(value.toUpperCase())}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                onSubmitEditing={() => void onApply()}
                hint={t('referral.friendCodeHint')}
              />
              <Button
                label={t('referral.apply')}
                fullWidth
                loading={applying}
                primaryColor={primary}
                onPress={() => void onApply()}
              />
            </View>
          ) : (
            <View style={styles.applyCard}>
              <Text style={styles.sectionLabel}>{t('referral.youJoinedWith')}</Text>
              <Text style={styles.code}>{data.applied_code || '—'}</Text>
              <Text style={styles.muted}>
                {t(`referral.status.${data.applied_status}`, { defaultValue: data.applied_status })}
              </Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>{t('referral.history')}</Text>
          {data.referrals.length ? (
            data.referrals.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <Text style={styles.historyName}>{item.referred_name || t('referral.aFriend')}</Text>
                <Text style={styles.muted}>
                  {t(`referral.status.${item.status}`, { defaultValue: item.status })}
                  {item.rewarded_at ? ` · ${new Date(item.rewarded_at).toLocaleDateString()}` : ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>{t('referral.emptyHistory')}</Text>
          )}
        </>
      )}
    </ProfileMenuScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroTitle: { ...typography.title, color: colors.foreground },
  heroBody: { ...typography.body, color: colors.mutedForeground },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { ...typography.heading, fontSize: 18, color: colors.foreground },
  statLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
  codeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  applyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', letterSpacing: 0.4 },
  code: { ...typography.heading, fontSize: 28, letterSpacing: 2, color: colors.foreground },
  codeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1 },
  muted: { ...typography.caption, color: colors.mutedForeground },
  loader: { marginTop: spacing.xxxl },
  error: { ...typography.caption, color: colors.destructive },
  historyRow: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  historyName: { ...typography.label, color: colors.foreground },
});
