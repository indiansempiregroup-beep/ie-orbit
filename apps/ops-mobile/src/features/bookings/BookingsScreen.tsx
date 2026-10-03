import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { Booking, BookingStatus } from '@ie-orbit/sdk';
import { BookingRow } from '../../components/BookingRow';
import { GroupedList } from '../../components/ui/GroupedList';
import { DesktopPage } from '../../components/DesktopPage';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ScreenState } from '../../components/ScreenState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useTabBarLayout } from '../../hooks/useTabBarLayout';
import { useBookings, useStaffMembers } from '../../hooks/useOpsData';
import { useEntityMaps } from '../../hooks/useOpsExtended';
import { DocumentActionsSheet, type ShopDocTarget } from '../shop/DocumentActionsSheet';
import { formatMoney } from '../shop/posPayment';
import { openShopDocumentHtmlView } from '../../utils/shopDocumentShare';
import { entityLabel } from '../../utils/entities';
import {
  bookingCustomerLabel,
  bookingCustomerPhone,
  bookingPriceTotal,
  bookingServiceLabel,
  bookingStaffLabel,
} from '../../utils/bookingDisplay';
import { formatServicePrice } from '../../utils/services';
import { canAccessStaffDirectory } from '../../utils/roles';
import { subscribeBookingsListRevision } from '../../utils/bookingsListRefresh';
import { colors, spacing } from '../../theme/tokens';
import { formatDateKey, getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_OPTIONS: Array<{ value: '' | BookingStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest created' },
  { value: 'created_asc', label: 'Oldest created' },
  { value: 'start_asc', label: 'Earliest start' },
  { value: 'start_desc', label: 'Latest start' },
  { value: 'status', label: 'Status' },
  { value: 'customer', label: 'Customer' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

function canShowBookingInvoice(booking: Booking): boolean {
  const status = String(booking.status || '').toLowerCase();
  if (status === 'completed') return true;
  return Boolean(String(booking.books_voucher_id || '').trim());
}

export function BookingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, token } = useAuth();
  const toast = useToast();
  const client = useOpsClient();
  const { businessId, tenantId, activeBusiness } = useWorkspace();
  const currency = activeBusiness?.currency;
  const showStaffFilter = canAccessStaffDirectory(user);
  const [range, setRange] = useState<'today' | 'all'>('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | BookingStatus>('');
  const [staffFilter, setStaffFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('created_desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const date = range === 'today' ? formatDateKey(new Date()) : undefined;
  const { bookings, loading, error, reload } = useBookings(date);
  const { customers, customerMap, serviceMap, staffMap, services } = useEntityMaps();
  const { staff } = useStaffMembers();
  const { refreshing, onRefresh } = usePullToRefresh(reload);
  const { contentInset } = useTabBarLayout();

  useFocusEffect(
    useCallback(() => {
      void reload({ silent: true });
    }, [reload]),
  );

  useEffect(() => {
    return subscribeBookingsListRevision(() => {
      void reload({ silent: true });
    });
  }, [reload]);

  const customersById = useMemo(() => {
    const map = new Map<string, (typeof customers)[number]>();
    for (const row of customers) map.set(row.id, row);
    return map;
  }, [customers]);

  const staffOptions = useMemo(
    () => [
      { value: '', label: 'All staff' },
      ...staff.map((member) => ({
        value: member.id,
        label: member.display_name || member.full_name || member.email || 'Staff',
      })),
    ],
    [staff],
  );

  const activeFilterCount =
    Number(Boolean(statusFilter)) +
    Number(Boolean(showStaffFilter && staffFilter)) +
    Number(sortBy !== 'created_desc');

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...bookings];

    if (statusFilter) {
      list = list.filter((booking) => booking.status === statusFilter);
    }
    if (showStaffFilter && staffFilter) {
      list = list.filter((booking) => booking.staff_id === staffFilter);
    }
    if (q) {
      list = list.filter((booking) => {
        const haystack = [
          booking.booking_number,
          entityLabel(customerMap, booking.customer_id),
          entityLabel(serviceMap, booking.service_id),
          entityLabel(staffMap, booking.staff_id, ''),
          booking.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortBy === 'created_asc') {
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      }
      if (sortBy === 'start_asc') {
        return new Date(a.start_at ?? 0).getTime() - new Date(b.start_at ?? 0).getTime();
      }
      if (sortBy === 'start_desc') {
        return new Date(b.start_at ?? 0).getTime() - new Date(a.start_at ?? 0).getTime();
      }
      if (sortBy === 'status') {
        return String(a.status ?? '').localeCompare(String(b.status ?? ''));
      }
      if (sortBy === 'customer') {
        return entityLabel(customerMap, a.customer_id).localeCompare(entityLabel(customerMap, b.customer_id));
      }
      // created_desc (default)
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    return list;
  }, [bookings, search, statusFilter, staffFilter, showStaffFilter, sortBy, customerMap, serviceMap, staffMap]);

  function priceLabelFor(booking: Booking): string | undefined {
    const total = bookingPriceTotal(booking);
    if (total > 0) return formatMoney(total, currency);
    const service = services.find((item) => String(item.id) === String(booking.service_id));
    const fallback = formatServicePrice(service);
    return fallback || undefined;
  }

  function contactFor(booking: Booking): { phone?: string; email?: string } {
    const customer = booking.customer_id ? customersById.get(booking.customer_id) : undefined;
    return {
      phone: bookingCustomerPhone(booking, customersById) || undefined,
      email: customer?.email?.trim() || undefined,
    };
  }

  function targetFromVoucher(
    booking: Booking,
    voucherId: string,
    voucherNumber?: string | null,
  ): ShopDocTarget | null {
    if (!businessId || !voucherId) return null;
    const contact = contactFor(booking);
    return {
      kind: 'sale',
      id: voucherId,
      number: String(voucherNumber || booking.books_voucher_number || booking.booking_number || ''),
      businessId,
      phone: contact.phone,
      email: contact.email,
    };
  }

  async function resolveInvoiceTarget(booking: Booking): Promise<ShopDocTarget | null> {
    if (!businessId) {
      toast.push('Select a business to open invoices.', 'error');
      return null;
    }
    const existingId = String(booking.books_voucher_id || '').trim();
    if (existingId) {
      return targetFromVoucher(booking, existingId, booking.books_voucher_number);
    }
    if (!client) {
      toast.push('Sign in again to open this invoice', 'error');
      return null;
    }
    setInvoiceBusyId(booking.id);
    try {
      const response = await client.bookings.invoice(booking.id);
      if (!response.data.available || !response.data.voucher_id) {
        toast.push(response.data.reason || 'Tax invoice is not available yet.', 'error');
        return null;
      }
      void reload();
      return targetFromVoucher(
        booking,
        response.data.voucher_id,
        response.data.voucher_number || response.data.invoice_number,
      );
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Could not open tax invoice.'), 'error');
      return null;
    } finally {
      setInvoiceBusyId(null);
    }
  }

  async function viewInvoice(booking: Booking) {
    if (invoiceBusyId) return;
    if (!token) {
      toast.push('Sign in again to view this invoice', 'error');
      return;
    }
    const target = await resolveInvoiceTarget(booking);
    if (!target) return;
    try {
      await openShopDocumentHtmlView({ target, token, tenantId });
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'View failed'), 'error');
    }
  }

  async function shareInvoice(booking: Booking) {
    if (invoiceBusyId) return;
    const target = await resolveInvoiceTarget(booking);
    if (!target) return;
    setDocActions(target);
  }

  return (
    <DesktopPage>
      <OpsHeader compact title={t('nav.bookings')} />
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder={t('bookings.search')} />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        <Button label={t('common.new')} onPress={() => navigation.navigate('CreateBooking', {})} />
      </View>
      <View style={styles.filters}>
        <Chip label={t('common.today')} active={range === 'today'} onPress={() => setRange('today')} />
        <Chip label={t('common.all')} active={range === 'all'} onPress={() => setRange('all')} />
      </View>

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setStatusFilter('');
          setStaffFilter('');
          setSortBy('created_desc');
        }}
      >
        <FilterChoiceGroup
          label={t('bookings.status')}
          value={statusFilter}
          options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => setStatusFilter(value as '' | BookingStatus)}
        />
        {showStaffFilter ? (
          <FilterChoiceGroup label={t('bookings.staff')} value={staffFilter} options={staffOptions} onChange={setStaffFilter} />
        ) : null}
        <FilterChoiceGroup
          label="Sort"
          value={sortBy}
          options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(value) => setSortBy(value as SortKey)}
        />
      </FilterSheet>

      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.content, { paddingBottom: contentInset }]}
      >
        <ScreenState
          loading={loading && !bookings.length}
          error={error}
          empty={!loading && sorted.length === 0}
          emptyTitle={t('bookings.emptyTitle')}
          emptyMessage={range === 'today' ? t('bookings.emptyToday') : t('bookings.emptyFiltered')}
          actionLabel="New booking"
          onAction={() => navigation.navigate('CreateBooking', {})}
        />
        <GroupedList>
          {sorted.map((booking) => {
            const showInvoice = Boolean(businessId && canShowBookingInvoice(booking));
            return (
              <BookingRow
                key={booking.id}
                attached
                serviceName={bookingServiceLabel(booking, serviceMap)}
                customerName={bookingCustomerLabel(booking, customerMap)}
                customerPhone={bookingCustomerPhone(booking, customersById)}
                staffName={bookingStaffLabel(booking, staffMap)}
                startAt={booking.start_at}
                endAt={booking.end_at}
                durationMinutes={booking.duration_minutes}
                serviceCount={booking.line_items?.length || undefined}
                bookingNumber={booking.booking_number}
                status={booking.status}
                priceLabel={priceLabelFor(booking)}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                onViewInvoice={showInvoice ? () => void viewInvoice(booking) : undefined}
                onShareInvoice={showInvoice ? () => void shareInvoice(booking) : undefined}
              />
            );
          })}
        </GroupedList>
      </RefreshableScrollView>

      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Invoice ${docActions.number || ''}`.trim() : 'Sale invoice'}
      />
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  search: { flex: 1 },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: colors.background },
});
