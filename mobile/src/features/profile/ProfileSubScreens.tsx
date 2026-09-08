import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { HelpArticleSummary, MobileReview, SupportTicketSummary } from '@ie-orbit/sdk';
import { mobileClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { GroupedList } from '../../components/ui/GroupedList';
import { Input } from '../../components/ui/Input';
import { passwordFieldError, requiredMessage } from '../../utils/formValidation';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDate, getApiErrorMessage } from '../../utils/format';
import { customerAppFeatures } from '../../utils/customerFeatures';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, ProfileMenuScreen, ScreenHeader } from '../../components/ProfileMenuScreen';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { HtmlContent } from '../../components/HtmlContent';
import { StarRating } from '../shop/StarRating';
import { SupportTicketsPanel } from './SupportTicketsPanel';

export function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { biometricEnabled, disableBiometrics } = useAuth();
  const primary = branding?.primaryColor ?? colors.primary;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit() {
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = requiredMessage('Current password');
    const newError = passwordFieldError(newPassword, { confirm: confirmPassword });
    if (newError) nextErrors.newPassword = newError;
    if (!confirmPassword) nextErrors.confirmPassword = requiredMessage('Confirm password');
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      await mobileClient.auth.changePassword({ current_password: currentPassword, new_password: newPassword });
      if (biometricEnabled) {
        await disableBiometrics();
        Alert.alert(
          'Password updated',
          'Biometric login was disabled — re-enable it in Privacy & Security.',
        );
      } else {
        Alert.alert('Password updated', 'Your password has been changed successfully.');
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Unable to update', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProfileMenuScreen title="Change Password" onBack={() => navigation.goBack()}>
      <Input
        label="Current password"
        required
        secureTextEntry
        value={currentPassword}
        onChangeText={(value) => {
          setCurrentPassword(value);
          setFieldErrors((current) => ({ ...current, currentPassword: '' }));
        }}
        error={fieldErrors.currentPassword}
      />
      <Input
        label="New password"
        required
        secureTextEntry
        value={newPassword}
        onChangeText={(value) => {
          setNewPassword(value);
          setFieldErrors((current) => ({ ...current, newPassword: '' }));
        }}
        error={fieldErrors.newPassword}
      />
      <Input
        label="Confirm new password"
        required
        secureTextEntry
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          setFieldErrors((current) => ({ ...current, confirmPassword: '', newPassword: '' }));
        }}
        error={fieldErrors.confirmPassword}
      />
      <Button label="Update password" size="lg" fullWidth loading={loading} primaryColor={primary} onPress={onSubmit} />
    </ProfileMenuScreen>
  );
}

export function NotificationPreferencesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshProfile } = useAuth();
  const { branding } = useBootstrap();
  const primary = branding?.primaryColor ?? colors.primary;
  const prefs = (user?.notification_preferences ?? {}) as Record<string, boolean>;
  const [email, setEmail] = useState(
    prefs.email !== false && prefs.email_updates !== false,
  );
  const [push, setPush] = useState(prefs.push !== false);
  const [sms, setSms] = useState(Boolean(prefs.sms ?? prefs.sms_reminders));
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setLoading(true);
    try {
      await mobileClient.auth.patchMe({
        notification_preferences: { email, push, sms },
      });
      await refreshProfile();
      Alert.alert('Saved', 'Notification preferences updated.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Unable to save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProfileMenuScreen title="Notification Preferences" onBack={() => navigation.goBack()}>
      <PrefRow label="Email notifications" value={email} onChange={setEmail} />
      <PrefRow label="Push notifications" value={push} onChange={setPush} />
      <PrefRow label="SMS reminders" value={sms} onChange={setSms} />
      <Button label="Save preferences" size="lg" fullWidth loading={loading} primaryColor={primary} onPress={onSave} />
    </ProfileMenuScreen>
  );
}

function PrefRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function PrivacySecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const {
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    enableBiometrics,
    disableBiometrics,
    refreshBiometricState,
  } = useAuth();
  const primary = branding?.primaryColor ?? colors.primary;
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshBiometricState().catch(() => undefined);
    }, [refreshBiometricState]),
  );

  function onToggleBiometric(next: boolean) {
    if (!biometricAvailable) {
      Alert.alert(
        `${biometricLabel} unavailable`,
        `Set up ${biometricLabel} in your phone Settings first, then try again.`,
      );
      return;
    }

    if (!next) {
      Alert.alert(`Disable ${biometricLabel}`, `Stop using ${biometricLabel} to sign in on this device?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setBusy(true);
                await disableBiometrics();
                Alert.alert('Disabled', `${biometricLabel} login is off.`);
              } catch (err) {
                Alert.alert('Unable to disable', getApiErrorMessage(err, 'Could not update biometric login.'));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]);
      return;
    }

    void (async () => {
      try {
        setBusy(true);
        await new Promise((resolve) => setTimeout(resolve, 400));
        await enableBiometrics();
        Alert.alert(
          `${biometricLabel} enabled`,
          `Sign out, then tap “Sign in with ${biometricLabel}” on the login screen.`,
        );
      } catch (err) {
        Alert.alert(`Unable to enable ${biometricLabel}`, getApiErrorMessage(err, 'Please try again.'));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <ProfileMenuScreen title="Privacy & Security" onBack={() => navigation.goBack()}>
      <Text style={styles.body}>
        Your data is stored securely and used only to manage your appointments with {branding?.appName ?? 'this business'}.
      </Text>

      <View style={styles.biometricRow}>
        <View style={styles.biometricCopy}>
          <Text style={styles.biometricTitle}>{biometricLabel} login</Text>
          <Text style={styles.biometricHint}>
            {busy
              ? 'Updating…'
              : biometricAvailable
                ? biometricEnabled
                  ? `On · use after signing out`
                  : `Off · tap to enable with ${biometricLabel} only`
                : `Not available on this device`}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={onToggleBiometric}
          disabled={busy || (!biometricAvailable && !biometricEnabled)}
          trackColor={{ true: primary }}
        />
      </View>

      <Button label="Change password" fullWidth primaryColor={primary} onPress={() => navigation.navigate('ChangePassword')} />
      <Text style={styles.body}>
        We never sell your personal information. You can update your profile details or sign out at any time from the Profile tab.
      </Text>
    </ProfileMenuScreen>
  );
}

export function PaymentMethodsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding, bootstrap } = useBootstrap();
  const { showBooking, showShop } = customerAppFeatures(bootstrap?.features);
  const appName = branding?.appName ?? 'this business';
  const settlement = showBooking && showShop
    ? 'When you book or order in the app, you can pay at the venue unless a digital payment is offered at checkout.'
    : showShop
      ? 'Pay at pickup or on delivery unless a digital payment is offered at checkout.'
      : 'When you book in the app, your appointment is confirmed and you settle payment when you visit.';
  return (
    <ProfileMenuScreen title="Payment Methods" onBack={() => navigation.goBack()}>
      <View style={styles.paymentCard}>
        <Text style={styles.comingTitle}>Pay at venue</Text>
        <Text style={styles.body}>
          Your default payment method for {appName} is pay at the venue. Online cards and UPI checkout will arrive in a later release.
        </Text>
        <Text style={styles.body}>{settlement}</Text>
      </View>
    </ProfileMenuScreen>
  );
}

const RATING_FILTERS = [5, 4, 3, 2, 1] as const;

type FaqCategory = 'bookings' | 'shop' | 'pets' | 'account';

function customerFaqs(options: {
  showBooking: boolean;
  showShop: boolean;
  showPets: boolean;
  loyaltyEnabled: boolean;
  referralEnabled: boolean;
}): Array<{ category: FaqCategory; q: string; a: string }> {
  const items: Array<{ category: FaqCategory; q: string; a: string }> = [];
  if (options.showBooking) {
    items.push(
      {
        category: 'bookings',
        q: 'How do I book an appointment?',
        a: 'Open Services, pick a service, choose a date and time, then confirm. You can also start from Home if a popular service is shown.',
      },
      {
        category: 'bookings',
        q: 'How do I reschedule?',
        a: 'Open the appointment from Home or My Appointments, then tap Reschedule and pick a new slot.',
      },
      {
        category: 'bookings',
        q: 'Can I cancel a booking?',
        a: 'Yes. Open the appointment and tap Cancel. Cancellation is usually allowed up to 24 hours before your visit, depending on shop policy.',
      },
      {
        category: 'bookings',
        q: 'How do I leave a review?',
        a: 'After a completed visit, open the appointment from My Appointments and add a star rating and optional comment. You can find past reviews under Profile → My Reviews.',
      },
      {
        category: 'bookings',
        q: 'Why don’t I see any available times?',
        a: 'Try another date, staff member, or service. If every slot is full, contact the shop from Help & Support.',
      },
      {
        category: 'bookings',
        q: 'Can I book more than one service?',
        a: 'Yes. When you book, add extra services before you choose a time so the slot covers the full duration.',
      },
    );
  }
  if (options.showShop) {
    items.push(
      {
        category: 'shop',
        q: 'How do I place an order?',
        a: 'Open Shop, add items to your cart, choose pickup or delivery, then place the order. You’ll get updates in Notifications and My Orders.',
      },
      {
        category: 'shop',
        q: 'Where is my order?',
        a: 'Go to Profile → My Orders. Open an order to see status, payment, and live delivery tracking when it’s on the way.',
      },
      {
        category: 'shop',
        q: 'How do I return an item?',
        a: 'Open a delivered or picked-up order, tap Return items, choose quantities, then submit. Track it under Profile → Returns.',
      },
      {
        category: 'shop',
        q: 'What payment methods can I use?',
        a: 'Pay at pickup or on delivery unless the shop offers UPI or another digital option at checkout. Unpaid orders stay visible in My Orders.',
      },
      {
        category: 'shop',
        q: 'How do I change my delivery address?',
        a: 'Open Profile → Addresses to add or edit a pin. At checkout, tap the address to pick a saved one or add a new one.',
      },
      {
        category: 'shop',
        q: 'How do coupons work?',
        a: 'In the cart, tap Apply coupon, enter a code or choose an offer. The discount applies before you place the order if the cart meets the offer rules.',
      },
    );
  }
  if (options.showPets) {
    items.push(
      {
        category: 'pets',
        q: 'How do I add a pet?',
        a: 'Go to Profile → My Pets and tap Add. Save name, species, and birthday so the shop knows them.',
      },
      {
        category: 'pets',
        q: 'Will I get a birthday reminder?',
        a: 'Yes. We’ll remind you in Notifications about 5 days before a saved birthday.',
      },
    );
  }
  items.push(
    {
      category: 'account',
      q: 'How do I update my phone number or name?',
      a: 'Go to Profile → Personal Information, edit the details, and save.',
    },
    {
      category: 'account',
      q: 'How do I change my password?',
      a: 'Open Profile → Privacy & Security → Change password. If you use biometric login, you’ll need to turn it back on after the password change.',
    },
    {
      category: 'account',
      q: 'How do I manage notifications?',
      a: 'Open Profile → Notification Preferences to turn email, push, or SMS reminders on or off.',
    },
    {
      category: 'account',
      q: 'I forgot my password. What should I do?',
      a: 'On the login screen, tap Forgot password and we’ll email a reset link. Check spam if it doesn’t arrive quickly.',
    },
  );
  if (options.loyaltyEnabled) {
    items.push({
      category: 'account',
      q: 'How do reward points work?',
      a: 'Points appear on Home and Profile when the shop’s loyalty program is on. Use them at checkout when the shop allows redemption.',
    });
  }
  if (options.referralEnabled) {
    items.push({
      category: 'account',
      q: 'How do referrals work?',
      a: 'Open Profile → Invite friends, share your code, and earn points when a friend joins and completes the required first visit or order.',
    });
  }
  return items;
}

export function ReviewsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const primary = branding?.primaryColor ?? colors.primary;
  const [reviews, setReviews] = useState<MobileReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [commentsOnly, setCommentsOnly] = useState(false);

  const loadReviews = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!tenantSlug || !businessCode) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      try {
        const res = await mobileClient.mobile.listMyReviews({
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setReviews(res.data);
      } catch {
        setReviews([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantSlug, businessCode],
  );

  useFocusEffect(
    useCallback(() => {
      void loadReviews();
    }, [loadReviews]),
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return reviews.filter((review) => {
      if (ratingFilter != null && Math.round(review.rating) !== ratingFilter) return false;
      if (commentsOnly && !review.comment?.trim()) return false;
      if (!needle) return true;
      return [review.service_name, review.booking_number, review.comment]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [reviews, search, ratingFilter, commentsOnly]);

  const filtersActive = Boolean(search.trim()) || ratingFilter != null || commentsOnly;

  return (
    <View style={styles.reviewScreen}>
      <ScreenHeader title="My Reviews" onBack={() => navigation.goBack()} />
      <View style={styles.reviewToolbar}>
        <View style={styles.reviewSearchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.reviewSearch}
            placeholder="Search service, booking #, or comment"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewChips}>
          <Chip label="All" active={ratingFilter == null} primaryColor={primary} onPress={() => setRatingFilter(null)} />
          {RATING_FILTERS.map((rating) => (
            <Chip
              key={rating}
              label={`${rating}★`}
              active={ratingFilter === rating}
              primaryColor={primary}
              onPress={() => setRatingFilter(rating)}
            />
          ))}
          <Chip
            label="With comment"
            active={commentsOnly}
            primaryColor={primary}
            onPress={() => setCommentsOnly((value) => !value)}
          />
        </ScrollView>
        {!loading ? (
          <View style={styles.reviewCountRow}>
            <Text style={styles.meta}>
              {visible.length} {visible.length === 1 ? 'review' : 'reviews'}
              {filtersActive ? ` of ${reviews.length}` : ''}
            </Text>
            {filtersActive ? (
              <Pressable
                onPress={() => {
                  setSearch('');
                  setRatingFilter(null);
                  setCommentsOnly(false);
                }}
                hitSlop={8}
              >
                <Text style={[styles.clearFilters, { color: primary }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {loading && !reviews.length ? <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} /> : null}

      <RefreshableScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshing={refreshing}
        onRefresh={() => loadReviews('refresh')}
        primaryColor={primary}
      >
        {!loading && !visible.length ? (
          <EmptyState
            icon="star"
            title={reviews.length ? 'No matching reviews' : 'No reviews yet'}
            description={
              reviews.length
                ? 'Try another search or star rating.'
                : 'After a completed appointment, open it from My Appointments and leave a rating.'
            }
          />
        ) : null}
        {visible.length ? (
          <GroupedList>
            {visible.map((review) => (
              <Pressable
                key={review.id}
                style={({ pressed }) => [styles.reviewCard, pressed && styles.pressed]}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: review.booking_id })}
              >
                <View style={styles.reviewTop}>
                  <View style={[styles.reviewIcon, { backgroundColor: `${primary}14` }]}>
                    <Feather name="star" size={16} color={primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.reviewTitle} numberOfLines={1}>
                      {review.service_name || 'Appointment'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      #{review.booking_number}
                      {review.created_at ? ` · ${formatDate(review.created_at)}` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
                <StarRating rating={review.rating} size={16} />
                {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
              </Pressable>
            ))}
          </GroupedList>
        ) : null}
      </RefreshableScrollView>
    </View>
  );
}

function HelpContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.contactIcon}>
        <Feather name={icon} size={16} color={colors.mutedForeground} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.contactValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function HelpSupportScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bootstrap, branding } = useBootstrap();
  const { tenantId } = useBusinessContext();
  const business = bootstrap?.business;
  const { showBooking, showShop, showPets } = customerAppFeatures(bootstrap?.features);
  const primary = branding?.primaryColor ?? colors.primary;
  const [articles, setArticles] = useState<HelpArticleSummary[]>([]);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [ticketErrors, setTicketErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [faqCategory, setFaqCategory] = useState<'all' | FaqCategory>('all');
  const [faqQuery, setFaqQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    void mobileClient.help
      .articles()
      .then((res) => setArticles(res.data.articles ?? []))
      .catch(() => setArticles([]));
  }, []);

  const loadTickets = useCallback(() => {
    return mobileClient.support
      .tickets()
      .then((res) => setTickets(res.data.tickets ?? []))
      .catch(() => setTickets([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTickets();
    }, [loadTickets]),
  );

  async function submitTicket() {
    const nextErrors: Record<string, string> = {};
    if (!subject.trim()) nextErrors.subject = 'Please enter a short subject.';
    if (!body.trim()) nextErrors.body = 'Please describe the issue.';
    if (Object.keys(nextErrors).length) {
      setTicketErrors(nextErrors);
      return;
    }
    setTicketErrors({});
    setSubmitting(true);
    try {
      await mobileClient.support.createTicket({
        subject,
        body,
        tenant_id: tenantId || undefined,
      });
      setSubject('');
      setBody('');
      setStatus(t('help.ticketSubmitted'));
      await loadTickets();
    } catch (err) {
      Alert.alert('Could not submit', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  const intro = showBooking && showShop
    ? `Need help with a booking or order? Reach ${branding?.appName ?? 'us'} below.`
    : showShop
      ? `Need help with an order? Reach ${branding?.appName ?? 'us'} below.`
      : `Need help with your booking? Reach ${branding?.appName ?? 'us'} below.`;

  const faqs = useMemo(
    () =>
      customerFaqs({
        showBooking,
        showShop,
        showPets,
        loyaltyEnabled: Boolean(bootstrap?.loyalty?.enabled),
        referralEnabled: Boolean(bootstrap?.referral?.enabled),
      }),
    [showBooking, showShop, showPets, bootstrap?.loyalty?.enabled, bootstrap?.referral?.enabled],
  );

  const faqFilters = useMemo(() => {
    const filters: Array<{ id: 'all' | FaqCategory; label: string }> = [{ id: 'all', label: 'All' }];
    if (showBooking) filters.push({ id: 'bookings', label: 'Bookings' });
    if (showShop) filters.push({ id: 'shop', label: 'Orders' });
    if (showPets) filters.push({ id: 'pets', label: 'Pets' });
    filters.push({ id: 'account', label: 'Account' });
    return filters;
  }, [showBooking, showShop, showPets]);

  const visibleFaqs = useMemo(() => {
    const needle = faqQuery.trim().toLowerCase();
    return faqs.filter((item) => {
      if (faqCategory !== 'all' && item.category !== faqCategory) return false;
      if (!needle) return true;
      return `${item.q} ${item.a}`.toLowerCase().includes(needle);
    });
  }, [faqs, faqCategory, faqQuery]);

  return (
    <ProfileMenuScreen title={t('help.title')} onBack={() => navigation.goBack()} primaryColor={primary}>
      <View style={[styles.helpHero, { backgroundColor: `${primary}12` }]}>
        <View style={[styles.reviewIcon, { backgroundColor: `${primary}22` }]}>
          <Feather name="life-buoy" size={18} color={primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.helpHeroTitle}>{branding?.appName ?? 'Support'}</Text>
          <Text style={styles.helpHeroBody}>{intro}</Text>
        </View>
      </View>

      {business?.phone || business?.email || business?.formatted_address ? (
        <GroupedList>
          {business.phone ? (
            <HelpContactRow
              icon="phone"
              label="Call"
              value={business.phone}
              onPress={() => void Linking.openURL(`tel:${business.phone}`)}
            />
          ) : null}
          {business.email ? (
            <HelpContactRow
              icon="mail"
              label="Email"
              value={business.email}
              onPress={() => void Linking.openURL(`mailto:${business.email}`)}
            />
          ) : null}
          {business.formatted_address ? (
            <HelpContactRow
              icon="map-pin"
              label="Visit"
              value={business.formatted_address}
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.formatted_address || '')}`,
                )
              }
            />
          ) : null}
        </GroupedList>
      ) : null}

      <Text style={styles.sectionLabel}>{t('help.articles')}</Text>
      {articles.length === 0 ? (
        <Text style={styles.body}>{t('help.noArticles')}</Text>
      ) : (
        <GroupedList>
          {articles.map((article) => (
            <Pressable
              key={article.id}
              style={({ pressed }) => [styles.articleRow, pressed && styles.pressed]}
              onPress={() => navigation.navigate('HelpArticle', { slug: article.slug })}
            >
              <View style={styles.contactIcon}>
                <Feather name="file-text" size={16} color={colors.mutedForeground} />
              </View>
              <View style={styles.articleCopy}>
                <Text style={styles.articleTitle}>{article.title}</Text>
                {article.category ? <Text style={styles.meta}>{article.category}</Text> : null}
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </GroupedList>
      )}

      <Text style={styles.sectionLabel}>{t('help.contactSupport')}</Text>
      <View style={styles.ticketCard}>
        <Input
          label={t('help.subject')}
          required
          value={subject}
          onChangeText={(value) => {
            setSubject(value);
            setTicketErrors((current) => ({ ...current, subject: '' }));
            setStatus(null);
          }}
          error={ticketErrors.subject}
        />
        <Input
          label={t('help.details')}
          required
          value={body}
          onChangeText={(value) => {
            setBody(value);
            setTicketErrors((current) => ({ ...current, body: '' }));
            setStatus(null);
          }}
          error={ticketErrors.body}
          multiline
        />
        <Button
          label={t('help.submitTicket')}
          fullWidth
          loading={submitting}
          primaryColor={primary}
          onPress={() => void submitTicket()}
        />
        {status ? (
          <View style={styles.ticketOk}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.ticketOkText}>{status}</Text>
          </View>
        ) : null}
      </View>

      <SupportTicketsPanel tickets={tickets} primaryColor={primary} />

      <Text style={styles.sectionLabel}>{t('help.faqs')}</Text>
      <View style={styles.faqSearchWrap}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={styles.reviewSearch}
          placeholder="Search FAQs"
          placeholderTextColor={colors.mutedForeground}
          value={faqQuery}
          onChangeText={setFaqQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {faqQuery ? (
          <Pressable onPress={() => setFaqQuery('')} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewChips}>
        {faqFilters.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            active={faqCategory === item.id}
            primaryColor={primary}
            onPress={() => setFaqCategory(item.id)}
          />
        ))}
      </ScrollView>
      {visibleFaqs.length ? (
        <GroupedList>
          {visibleFaqs.map((item) => {
            const open = openFaq === item.q;
            return (
              <Pressable
                key={item.q}
                style={({ pressed }) => [styles.faqRow, pressed && styles.pressed]}
                onPress={() => setOpenFaq(open ? null : item.q)}
              >
                <View style={styles.faqTop}>
                  <Text style={styles.faqQuestion}>{item.q}</Text>
                  <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                </View>
                {open ? <Text style={styles.faqAnswer}>{item.a}</Text> : null}
              </Pressable>
            );
          })}
        </GroupedList>
      ) : (
        <Text style={styles.body}>No FAQs match that search or filter.</Text>
      )}
    </ProfileMenuScreen>
  );
}

export function HelpArticleScreen({ route }: NativeStackScreenProps<RootStackParamList, 'HelpArticle'>) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [article, setArticle] = useState<HelpArticleSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void mobileClient.help
      .articles({ slug: route.params.slug })
      .then((res) => {
        const data = res.data;
        if (!data.title) {
          setArticle(null);
          return;
        }
        setArticle({
          id: data.id ?? route.params.slug,
          slug: data.slug ?? route.params.slug,
          title: data.title,
          category: data.category,
          body: data.body,
        });
      })
      .catch(() => setArticle(null))
      .finally(() => setLoading(false));
  }, [route.params.slug]);

  return (
    <ProfileMenuScreen title={article?.title || 'Article'} onBack={() => navigation.goBack()}>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && !article?.title ? (
        <EmptyState icon="file-text" title="Article unavailable" description="This article is no longer available." />
      ) : null}
      {article?.category ? (
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{article.category}</Text>
        </View>
      ) : null}
      {article?.body ? (
        <View style={styles.articleCard}>
          <HtmlContent html={article.body} />
        </View>
      ) : null}
    </ProfileMenuScreen>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.mutedForeground, lineHeight: 22 },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { ...typography.label, color: colors.foreground },
  biometricHint: { ...typography.caption, color: colors.mutedForeground },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  prefLabel: { ...typography.body, color: colors.foreground, fontWeight: '500' },
  comingTitle: { ...typography.title, color: colors.foreground },
  paymentCard: {
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  reviewScreen: { flex: 1, backgroundColor: colors.background },
  reviewToolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  reviewSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  reviewSearch: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  reviewChips: { gap: spacing.sm, paddingVertical: 2 },
  reviewCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearFilters: { ...typography.caption, fontWeight: '700' },
  reviewCard: {
    gap: spacing.sm,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reviewIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitle: { ...typography.label, color: colors.foreground, fontWeight: '800' },
  reviewComment: { ...typography.body, color: colors.foreground, lineHeight: 20 },
  pressed: { opacity: 0.92 },
  helpHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  helpHeroTitle: { ...typography.title, color: colors.foreground, fontSize: 16 },
  helpHeroBody: { ...typography.caption, color: colors.foreground, marginTop: 4, lineHeight: 18 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactValue: { ...typography.body, color: colors.foreground, marginTop: 2 },
  factLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700' },
  sectionLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '800', letterSpacing: 0.4 },
  ticketCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  ticketOk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ticketOkText: { ...typography.caption, color: colors.success, flex: 1, fontWeight: '600' },
  faqSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  faqRow: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 8,
  },
  faqTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  faqQuestion: { ...typography.label, color: colors.foreground, fontWeight: '800', flex: 1 },
  faqAnswer: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  meta: { ...typography.caption, color: colors.mutedForeground },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  articleCopy: { flex: 1, gap: 2 },
  articleTitle: { ...typography.label, color: colors.foreground, fontWeight: '600' },
  articleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  categoryPillText: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '800' },
});
