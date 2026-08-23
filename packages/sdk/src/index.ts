export type ApiEnvelope<T> = {
  data: T;
  meta: {
    request_id?: string | null;
    timestamp?: string;
    pagination?: {
      next_cursor?: string | null;
      previous_cursor?: string | null;
      page_size?: number;
    };
    [key: string]: unknown;
  };
};

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  constructor(
    public readonly payload: ApiErrorPayload,
    public readonly status: number,
  ) {
    super(payload.error.message);
    this.name = 'ApiClientError';
  }
}

export type ApiClientConfig = {
  baseUrl: string | (() => string);
  token?: string | null;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: HeadersInit;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
};

export type LoginRequest = {
  email: string;
  password: string;
  remember_me?: boolean;
};

export type RefreshRequest = {
  refresh: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  token: string;
  new_password: string;
};

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export type VerifyEmailRequest = {
  token: string;
};

export type PatchAuthMeRequest = {
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  profile_photo?: string | null;
  language?: string | null;
  timezone?: string | null;
  notification_preferences?: Record<string, unknown> | null;
};

export type UserProfile = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
  profile_photo?: string | null;
  language?: string | null;
  timezone?: string | null;
  notification_preferences?: Record<string, unknown> | null;
  status?: string;
  email_verified_at?: string | null;
  roles?: string[];
  permissions?: string[];
};

export type LoginResponse = {
  access: string;
  refresh: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
};

export type BookingStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'no_show'
  | 'expired'
  | 'rescheduled';

export type BookingReview = {
  id: string;
  business?: string;
  booking_id: string;
  booking_number?: string;
  customer_id: string;
  customer_name?: string;
  service_id?: string | null;
  service_name?: string;
  rating: number;
  comment?: string;
  created_at?: string;
  updated_at?: string;
};

export type BookingReviewSummary = {
  id: string;
  rating: number;
  comment?: string;
  created_at?: string;
};

export type Booking = {
  id: string;
  tenant?: string;
  business?: string;
  branch?: string | null;
  booking_number?: string;
  customer_id?: string;
  staff_id?: string | null;
  service_id?: string;
  appointment_date?: string;
  start_at?: string;
  end_at?: string;
  duration_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  status?: BookingStatus;
  source?: string;
  channel?: string;
  notes?: string;
  cancellation_reason?: string;
  reschedule_reason?: string;
  recurrence_frequency?: string;
  recurrence_rule?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timeline?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  booking_notes?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  review?: BookingReviewSummary | null;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
};

export type BookingCreateInput = {
  business?: string;
  branch_id?: string | null;
  customer_id: string;
  staff_id?: string | null;
  service_id: string;
  start_at: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  source?: string;
  channel?: string;
  notes?: string;
  recurrence_frequency?: string;
  recurrence_rule?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AvailabilitySlot = {
  start_at: string;
  end_at: string;
  staff_id: string | null;
  capacity: number;
};

export type BusinessProductSubscription = {
  id: string;
  product_code: string;
  status: 'trialing' | 'active' | 'soft_locked' | 'canceled';
  plan_code?: string | null;
  plan_name?: string | null;
  billing_interval?: 'monthly' | 'yearly' | null;
  subscribed_at?: string;
  trial_ends_at?: string | null;
  canceled_at?: string | null;
  current_period_starts_at?: string | null;
  current_period_ends_at?: string | null;
  external_billing_reference?: string | null;
  extra_staff?: number;
  extra_offices?: number;
  pets_pack_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProductPlan = {
  product_code?: string;
  code: string;
  name: string;
  description?: string;
  billing_interval: 'monthly' | 'yearly';
  trial_days: number;
  is_default?: boolean;
  max_staff?: number;
  max_branches?: number;
  bi_features?: string[];
  features?: string[];
};

export type BusinessProductSubscribeInput = {
  product_code: string;
  plan_code?: string;
  set_active?: boolean;
};

export type BusinessProductPlanChangeInput = {
  plan_code: string;
  billing_interval?: 'monthly' | 'yearly';
  force_immediate?: boolean;
};

export type BillingStatus = {
  provider: string;
  configured: boolean;
  key_id?: string | null;
  webhook_configured: boolean;
  currency: string;
  mock_mode: boolean;
};

export type BillingCheckoutInput = {
  product_code: string;
  plan_code: string;
  business_id?: string;
};

export type BillingCheckoutSession = {
  session_id: string;
  order_id: string;
  amount: number;
  currency: string;
  product_code: string;
  plan_code: string;
  configured: boolean;
  key_id?: string | null;
  mock_mode: boolean;
  expires_at: string;
};

export type BillingPlanCatalogItem = {
  product_code: string;
  plan_code: string;
  name: string;
  description: string;
  billing_interval: string;
  trial_days: number;
  is_default: boolean;
  max_staff?: number;
  max_branches?: number;
  bi_features?: string[];
  features?: string[];
  amount_paise?: number | null;
  yearly_amount_paise?: number | null;
  addon_staff_price_paise?: number;
  addon_office_price_paise?: number;
  addon_pets_price_paise?: number;
  is_public?: boolean;
  currency: string;
};

export type BusinessBillingSnapshot = {
  product_code?: string;
  billing_state?: string;
  plan_code: string;
  status: string;
  billing_interval: string;
  soft_locked: boolean;
  trial_ends_at?: string | null;
  current_period_starts_at?: string | null;
  current_period_ends_at?: string | null;
  subscribed_at?: string | null;
  canceled_at?: string | null;
  /** Convenience alias for next renewal when a paid period is active. */
  renews_at?: string | null;
  pending_plan_code?: string | null;
  pending_billing_interval?: string | null;
  pending_cancel?: boolean;
  pending_plan_scheduled_at?: string | null;
  plan_change_effective_at?: string | null;
  plan_locked_until?: string | null;
  included_staff: number;
  included_offices: number;
  extra_staff: number;
  extra_offices: number;
  pets_pack_enabled?: boolean;
  effective_max_staff: number;
  effective_max_branches: number;
  used_staff: number;
  used_offices: number;
  bi_features: string[];
  features?: string[];
  entitled_features?: string[];
  pricing: {
    currency: string;
    base_amount_paise: number;
    addon_staff_unit_paise: number;
    addon_office_unit_paise: number;
    addon_pets_unit_paise?: number;
    addon_amount_paise: number;
    total_amount_paise: number;
  };
};

export type BillingWebhookEvent = {
  id: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  provider: string;
  external_event_id: string;
  event_type: string;
  status: 'received' | 'processed' | 'failed' | 'ignored' | 'dead_letter';
  retry_count?: number;
  next_retry_at?: string | null;
  processed_at?: string | null;
  error_message?: string;
  created_at?: string;
};

export type BillingWebhookReprocessResult = {
  reprocessed: boolean;
  event_id: string;
  status: 'processed' | 'failed';
  error?: string;
};

export type BillingWebhookBulkReprocessInput = {
  scope: 'failed' | 'dead_letter';
  limit?: number;
  confirm?: boolean;
  window_hours?: number;
  tenant_id?: string;
  provider?: string;
  event_type?: string;
  q?: string;
  reason?: string;
};

export type BillingWebhookBulkReprocessResult = {
  selected: number;
  processed: number;
  failed: number;
  dead_letter: number;
  event_ids: string[];
};

export type BillingWebhookSummary = {
  window_hours: number;
  total: number;
  processed: number;
  failed: number;
  dead_letter: number;
  received: number;
  ignored: number;
  stuck_retries: number;
  failure_rate: number;
  success_rate: number;
};

export type BillingReconciliationResult = {
  tenant_id: string;
  scanned_sessions: number;
  mismatched_sessions: number;
  missing_subscription: number;
  missing_external_reference: number;
  checked_since: string;
  sample_order_ids: string[];
};

export type BillingGoLiveCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: 'blocker' | 'warning';
  value?: number;
};

export type BillingGoLiveReport = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: BillingGoLiveCheck[];
};

export type BillingReleaseGateCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: 'blocker' | 'warning';
  remediation: string;
  value?: number;
};

export type BillingReleaseGateReport = {
  passed: boolean;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: BillingReleaseGateCheck[];
  failing_checks: BillingReleaseGateCheck[];
  summary: {
    window_hours: number;
    total_events: number;
    failure_rate: number;
    dead_letter: number;
    stuck_retries: number;
  };
};

export type BillingObservabilitySignals = {
  window_hours: number;
  since: string;
  events: {
    billing_webhook_failed: number;
    billing_webhook_dead_letter: number;
    onboarding_workspace_provisioned: number;
  };
  audits: {
    bulk_reprocess_actions: number;
    reconciliation_runs: number;
    workspace_provisioned_audits: number;
  };
};

export type BillingOpsSnapshot = {
  tenant_id: string;
  window_hours: number;
  since: string;
  generated_at: string;
  ready: boolean;
  health_score: number;
  blockers: string[];
  recommendations: Array<{
    severity: 'blocker' | 'warning';
    action: string;
  }>;
  trend: {
    comparison_window_hours: number;
    previous_since: string;
    previous_until: string;
    failure_rate_delta: number;
    dead_letter_delta: number;
    stuck_retries_delta: number;
    direction: 'improving' | 'degrading';
  };
  webhooks: {
    total: number;
    processed: number;
    failed: number;
    dead_letter: number;
    stuck_retries: number;
    failure_rate: number;
  };
  events: {
    billing_webhook_failed: number;
    billing_webhook_dead_letter: number;
    onboarding_workspace_provisioned: number;
  };
  audits: {
    bulk_reprocess_actions: number;
    reconciliation_runs: number;
    workspace_provisioned_audits: number;
  };
};

export type BillingOpsDigest = {
  tenant_id?: string;
  tenant_slug?: string;
  tenant_name?: string;
  window_hours: number;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  metrics?: {
    total: number;
    failed: number;
    dead_letter: number;
    stuck_retries: number;
    failure_rate: number;
  };
  digest_text: string;
};

export type BillingPlatformOpsSummary = {
  window_hours: number;
  tenant_count: number;
  ready_count: number;
  not_ready_count: number;
  rows: BillingOpsDigest[];
};

export type BillingPlatformSubscriptions = {
  total_subscriptions: number;
  by_status: Array<{ status: string; count: number }>;
  by_product: Array<{ product_code: string; count: number }>;
};

export type BillingPlatformRevenue = {
  currency: string;
  collected_all_time_paise: number;
  refunded_all_time_paise: number;
  net_collected_paise: number;
  collected_month_paise: number;
  collected_last_30d_paise: number;
  pending_claims_paise: number;
  pending_claims_count: number;
  open_checkouts_paise: number;
  open_checkouts_count: number;
  paid_payment_count: number;
  mrr_paise: number;
  arr_paise: number;
  paying_subscriptions: number;
  complimentary_subscriptions: number;
  trial_subscriptions: number;
  soft_locked_subscriptions: number;
  canceled_subscriptions: number;
  by_product: Array<{
    product_code: string;
    collected_paise: number;
    mrr_paise: number;
    paying_count: number;
  }>;
  by_plan: Array<{ plan_code: string; mrr_paise: number; count: number }>;
  daily: Array<{ day: string; collected_paise: number; count: number }>;
  top_tenants: Array<{
    tenant_id?: string | null;
    tenant_name: string;
    tenant_slug?: string;
    collected_paise: number;
    payment_count: number;
  }>;
  recent_payments: Array<{
    id: string;
    tenant_id?: string | null;
    tenant_name: string;
    business_name?: string;
    product_code: string;
    plan_code: string;
    amount_paise: number;
    currency: string;
    paid_at: string;
    payment_channel?: string;
  }>;
};

export type BillingPlatformMonitoring = {
  window_hours: number;
  total_events: number;
  processed_events: number;
  failed_events: number;
  dead_letter_events: number;
  received_events: number;
  ignored_events: number;
  scheduled_retries: number;
  overdue_retries: number;
  success_rate: number;
  reprocess_actions: number;
  reconciliation_runs: number;
  tenants_impacted: number;
};

export type BillingPlatformAuditFeed = {
  count: number;
  rows: Array<{
    id: string;
    tenant_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    actor_id?: string | null;
    metadata?: Record<string, unknown>;
    created_at: string;
  }>;
};

export type MobileDiscoverCategory = {
  id: string;
  name: string;
  slug: string;
};

export type MobileDiscoverService = {
  id: string;
  service_code: string;
  name: string;
  description?: string;
  duration_minutes: number;
  currency: string;
  price: number;
  loyalty_points_earn?: number;
  category_id?: string | null;
  category_name?: string;
  image_url?: string;
};

export type MobileDiscoverResponse = {
  tenant_slug: string;
  business_code: string;
  categories: MobileDiscoverCategory[];
  services: MobileDiscoverService[];
};

export type MobileStaffMember = {
  id: string;
  display_name: string;
  designation: string;
  department?: string;
};

export type MobileNotificationItem = {
  id: string;
  subject?: string;
  body?: string;
  channel?: string;
  status?: string;
  is_read?: boolean;
  created_at?: string;
  updated_at?: string;
  booking_id?: string | null;
  pet_id?: string | null;
  order_id?: string | null;
  return_id?: string | null;
  notification_type?: string;
};

export type MobileCustomerProfile = {
  id: string;
  display_name: string;
  email?: string;
  phone_number?: string;
  profile_photo?: string;
  address?: CustomerAddress | null;
};

export type MobileDiscoverServiceDetail = MobileDiscoverService & {
  short_description?: string;
  online_booking_enabled?: boolean;
  staff?: Array<{ id: string; display_name: string; title?: string }>;
};

export type MobileReview = {
  id: string;
  booking_id: string;
  booking_number: string;
  service_name: string;
  rating: number;
  comment?: string;
  created_at: string;
};

export type MobileLoyaltyProgram = {
  enabled: boolean;
  plan_entitled: boolean;
  points_per_currency_unit: number;
  max_redeem_percent: number;
  min_redeem_points: number;
  earn_points_per_100?: number;
  currency: string;
};

export type MobileLoyaltyBalance = {
  enabled: boolean;
  points_balance: number;
  program?: MobileLoyaltyProgram;
  ledger: Array<{
    id: string;
    points_delta: number;
    reason: string;
    booking_id?: string | null;
    order_id?: string | null;
    voucher_id?: string | null;
    created_at: string;
  }>;
};

export type MobileLoyaltyQuote = {
  points_redeemed: number;
  discount_amount: string;
  currency: string;
  rate: number;
  service_price: string;
  max_discount_amount: string;
};

export type MobileDeviceRegistration = {
  id: string;
  expo_push_token: string;
  platform?: string;
};

export type MobileAvailabilityResponse = {
  slots: Array<{
    start_at: string;
    end_at: string;
    staff_id?: string | null;
    capacity: number;
  }>;
  message?: string | null;
};

export type MobileBookingRequestInput = {
  tenant_slug: string;
  business_code: string;
  service_id: string;
  branch_id?: string | null;
  staff_id?: string | null;
  start_at: string;
  duration_minutes: number;
  customer_name?: string;
  phone_number?: string;
  email?: string;
  notes?: string;
  payment_mode?: 'pay_at_venue';
  points_to_redeem?: number;
};

export type MobileBookingRequestResponse = {
  booking_id: string;
  booking_number: string;
  status: string;
};

export type MobileBookingBranch = {
  id: string;
  display_name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type MobileBranch = {
  id: string;
  display_name: string;
  is_primary?: boolean;
  address_line1?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  formatted_address?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type MobileBooking = {
  id: string;
  booking_number: string;
  status: string;
  service_id: string;
  service_name: string;
  staff_id?: string | null;
  staff_name?: string;
  branch?: MobileBookingBranch | null;
  appointment_date: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  notes?: string;
  payment_mode?: string;
  created_at: string;
  review?: BookingReviewSummary | null;
};

export type MobileBootstrapBranding = {
  app_name: string;
  logo?: string;
  dark_logo?: string;
  splash_image?: string;
  favicon?: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  theme_mode: string;
  typography_settings?: Record<string, unknown>;
};

export type MobileBootstrapResponse = {
  flavor_key: string;
  app_slug: string;
  app_name: string;
  bundle_id_ios?: string;
  bundle_id_android?: string;
  white_label_enabled: boolean;
  tenant_id?: string;
  tenant_slug: string;
  business_code: string;
  business: {
    id: string;
    display_name: string;
    logo?: string;
    currency: string;
    timezone: string;
    phone?: string;
    email?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    formatted_address?: string;
    cancellation_policy?: string;
    rescheduling_policy?: string;
    upi_vpa?: string;
    payment_qr_url?: string;
  };
  branding: MobileBootstrapBranding;
  enabled_products: string[];
  features: Record<string, boolean>;
  loyalty?: MobileLoyaltyProgram;
  build_metadata?: Record<string, unknown>;
};

export type WhiteLabelProfile = {
  id: string;
  business_id: string;
  business_display_name: string;
  tenant_slug: string;
  flavor_key: string;
  app_slug: string;
  app_name: string;
  bundle_id_ios?: string;
  bundle_id_android?: string;
  logo?: string;
  dark_logo?: string;
  splash_image?: string;
  favicon?: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  theme_mode: string;
  white_label_enabled: boolean;
  typography_settings?: Record<string, unknown>;
  build_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type PlatformTenantProductSummary = {
  product_code: string;
  plan_code?: string | null;
  billing_state?: string;
};

export type PlatformTenantSummary = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  owner_email?: string | null;
  business_count: number;
  primary_color: string;
  created_at: string;
  billing_state?: string;
  plan_code?: string | null;
  product_code?: string | null;
  products?: PlatformTenantProductSummary[];
  last_paid_at?: string | null;
  last_paid_paise?: number | null;
  pending_claims?: number;
};

export type PlatformTenantBusiness = {
  id: string;
  business_code: string;
  display_name: string;
  status: string;
  selected_product?: string;
  has_white_label_profile: boolean;
  flavor_key?: string | null;
  billing?: BusinessBillingSnapshot;
  billings?: BusinessBillingSnapshot[];
};

export type PlatformTenantDetail = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  businesses: PlatformTenantBusiness[];
};

export type PlatformAuditEvent = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  actor_email?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string;
  created_at: string;
};

export type PlatformAuditQuery = {
  q?: string;
  tenant_id?: string;
  action?: string;
  actor?: string;
  resource_type?: string;
  window_days?: number;
  limit?: number;
  offset?: number;
};

export type PlatformAuditResult = {
  events: PlatformAuditEvent[];
  total: number;
  limit: number;
  offset: number;
  counts: {
    total: number;
    with_reason: number;
    tenant_scoped: number;
    global_events: number;
  };
  actions: string[];
  resource_types: string[];
};

export type PlatformPaymentRow = {
  id: string;
  tenant_id?: string | null;
  tenant_name?: string;
  tenant_slug?: string;
  order_id?: string;
  payment_id?: string;
  amount_paise: number;
  currency: string;
  status: string;
  plan_code?: string;
  product_code?: string;
  business_id?: string;
  business_name?: string;
  paid_at?: string | null;
  created_at: string;
  refunded_paise?: number;
  invoice_id?: string | null;
  invoice_number?: string | null;
  payment_channel?: string;
  payment_status?: string;
  upi_utr?: string;
  payment_proof_url?: string;
  claimed_at?: string | null;
};

export type PlatformPlanPackage = {
  id: string;
  product_code: string;
  code: string;
  name: string;
  description?: string;
  billing_interval: 'monthly' | 'yearly';
  trial_days: number;
  is_default: boolean;
  max_staff: number;
  max_branches: number;
  bi_features: string[];
  features: string[];
  amount_paise: number;
  yearly_amount_paise?: number | null;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  metadata?: Record<string, unknown>;
};

export type PlatformAffiliateCode = {
  id: string;
  affiliate_id: string;
  code: string;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type PlatformAffiliateMoney = {
  earned_paise: number;
  paid_paise: number;
  credited_paise: number;
  settled_paise: number;
  outstanding_paise: number;
};

export type PlatformAffiliateInsights = PlatformAffiliateMoney & {
  affiliate_count: number;
  referral_count: number;
};

export type PlatformAffiliate = {
  id: string;
  affiliate_type: 'tenant' | 'partner' | string;
  tenant_id?: string | null;
  name: string;
  email: string;
  status: string;
  payout_method?: 'upi' | 'bank' | 'other' | string;
  upi_vpa?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  payout_notes?: string;
  default_commission_paise?: number;
  commission_trigger?: 'first_payment' | 'every_payment' | 'none' | string;
  commission_type?: 'flat' | 'percent' | string;
  commission_percent?: number;
  commission_summary?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  codes?: PlatformAffiliateCode[];
  referral_count?: number;
} & Partial<PlatformAffiliateMoney>;

export type PlatformAffiliateReferral = {
  id: string;
  affiliate_id: string;
  affiliate_name?: string;
  referred_tenant_id: string;
  referred_tenant_name?: string;
  referred_tenant_slug?: string;
  affiliate_code_id?: string | null;
  affiliate_code?: string;
  starts_at?: string;
  months: number;
  status: string;
  payment_account_open?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
} & Partial<PlatformAffiliateMoney>;

export type PlatformAffiliateLedgerEntry = {
  id: string;
  affiliate_id: string;
  affiliate_name?: string;
  referral_id?: string | null;
  referred_tenant_name?: string;
  referred_tenant_slug?: string;
  kind: 'earning' | 'payment' | 'credit' | string;
  amount_paise: number;
  period_yyyy_mm?: string;
  payment_ref?: string;
  notes?: string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type PlatformAffiliateDetail = PlatformAffiliate & {
  insights: PlatformAffiliateMoney;
  referrals: PlatformAffiliateReferral[];
  ledger: PlatformAffiliateLedgerEntry[];
  history: PlatformAffiliateLedgerEntry[];
};

export type PlatformAffiliateAccrual = {
  id: string;
  referral_id: string;
  period_yyyy_mm: string;
  amount_paise: number;
  benefit_type: 'credit' | 'payout' | string;
  status: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type PlatformAffiliatePayout = {
  id: string;
  affiliate_id: string;
  amount_paise: number;
  status: string;
  payment_ref?: string;
  notes?: string;
  accrual_id?: string | null;
  created_at?: string;
};

export type PlatformPlanPackageUpsertInput = {
  /** Include to update an existing package; omit to create a new one. */
  id?: string;
  code: string;
  product_code: string;
  name: string;
  description?: string;
  billing_interval?: 'monthly' | 'yearly';
  trial_days?: number;
  is_default?: boolean;
  max_staff?: number;
  max_branches?: number;
  bi_features?: string[];
  features?: string[];
  amount_paise?: number;
  yearly_amount_paise?: number | null;
  is_active?: boolean;
  is_public?: boolean;
  sort_order?: number;
  metadata?: Record<string, unknown>;
  reason: string;
};

export type PlatformAddonPricing = {
  staff_price_paise: number;
  office_price_paise: number;
  pets_price_paise: number;
  staff_price_inr: number;
  office_price_inr: number;
  pets_price_inr: number;
};

export type PlatformFeatureFlag = {
  key: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

export type PlatformUserRow = {
  id: string;
  email: string;
  full_name?: string;
  phone_number?: string;
  roles?: string[];
  is_active: boolean;
  status?: string;
  is_locked?: boolean;
  email_verified?: boolean;
  created_at?: string | null;
  last_login?: string | null;
  relation?: string;
  owned_tenants?: Array<{
    id: string;
    slug: string;
    display_name: string;
    status: string;
  }>;
};

export type PlatformUserFilter =
  | 'all'
  | 'active'
  | 'disabled'
  | 'locked'
  | 'unverified'
  | 'suspended'
  | 'never_logged_in';

export type PlatformUserSearchParams = {
  q?: string;
  status?: PlatformUserFilter;
  role?: string;
  tenants?: 'all' | 'owners' | 'none';
  joined_within_days?: number;
  sort?: 'recent' | 'oldest' | 'email' | 'name' | 'last_login' | 'stale';
  limit?: number;
  offset?: number;
};

export type PlatformUserSearchResult = {
  users: PlatformUserRow[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<string, number>;
  roles: string[];
};

export type SupportTicketNote = {
  id: string;
  body: string;
  is_internal: boolean;
  author_email?: string | null;
  created_at: string;
};

export type SupportTicketSummary = {
  id: string;
  subject: string;
  status: string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  requester_email?: string | null;
  assignee_id?: string | null;
  assignee_email?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type SupportTicketDetail = SupportTicketSummary & {
  notes: SupportTicketNote[];
};

export type HelpArticleSummary = {
  id: string;
  slug: string;
  title: string;
  category?: string;
  is_published?: boolean;
  body?: string;
  keywords?: string;
};

export type PlatformAnnouncement = {
  id: string;
  title: string;
  message: string;
  severity: string;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type AnalyticsPeriodComparison = {
  bookings_change_pct?: number | null;
  completed_change_pct?: number | null;
  revenue_change_pct?: number | null;
  previous_period?: {
    start_date: string;
    end_date: string;
    bookings: number;
    completed: number;
    estimated_revenue: number;
  };
};

export type AnalyticsSummary = {
  bookings: number;
  completed: number;
  cancelled: number;
  pending?: number;
  confirmed?: number;
  no_shows?: number;
  completion_rate?: number;
  cancellation_rate?: number;
  no_show_rate?: number;
  avg_bookings_per_day?: number;
  period?: { start_date?: string | null; end_date?: string | null };
  comparison?: AnalyticsPeriodComparison | null;
};

export type BIRevenueReport = {
  estimated_revenue: number;
  completed_revenue?: number;
  avg_booking_value?: number;
  currency: string;
  by_service: Array<{
    service_id: string;
    service_name: string;
    revenue: number;
    completed_revenue?: number;
    bookings?: number;
    completed?: number;
  }>;
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BITrendsReport = {
  rows: Array<{
    day: string;
    total: number;
    completed: number;
    cancelled: number;
    no_shows?: number;
  }>;
  period: { start_date: string; end_date: string };
};

export type BIForecastReport = {
  horizon_days: number;
  projected_bookings: number;
  projected_revenue: number;
  avg_daily_bookings?: number;
  avg_daily_revenue?: number;
  currency: string;
  based_on_days: number;
  based_on_bookings?: number;
};

export type BIGrowthReport = {
  new_customers: number;
  returning_customers: number;
  customers_with_bookings: number;
  repeat_rate: number;
  avg_visits_per_customer: number;
  top_customers: Array<{
    customer_id: string;
    customer_name: string;
    bookings: number;
    revenue: number;
    is_returning?: boolean;
  }>;
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BIOperationsReport = {
  by_staff: Array<{
    staff_id: string;
    staff_name: string;
    bookings: number;
    completed: number;
    cancelled: number;
    no_shows: number;
    revenue: number;
  }>;
  by_weekday: Array<{ weekday: number; weekday_name: string; total: number }>;
  by_hour: Array<{ hour: number; label: string; total: number }>;
  busiest_day?: string | null;
  busiest_hour?: string | null;
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BIInsight = {
  type: string;
  title: string;
  detail: string;
};

export type BIReportsBundle = {
  summary: AnalyticsSummary;
  revenue: BIRevenueReport;
  trends: BITrendsReport;
  growth?: BIGrowthReport;
  operations?: BIOperationsReport;
  insights?: BIInsight[];
};

export type DashboardAppointieSummary = {
  today_bookings: number;
  upcoming_7d: number;
  today_completed: number;
  today_cancelled: number;
  estimated_revenue_today: number;
  estimated_revenue_month: number;
  active_customers: number;
  new_customers_today: number;
  staff_on_duty: number;
  unread_notifications: number;
};

export type DashboardShopieSummary = {
  orders_today: number;
  orders_month: number;
  gmv_today: number;
  gmv_month: number;
  pending_returns: number;
  open_orders: number;
  delivery_fee_month: number;
};

export type DashboardPetsSummary = {
  total: number;
  birthdays_next_7d: number;
  birthdays_next_30d: number;
  with_photo: number;
};

export type DashboardSummary = {
  products: string[];
  pets_pack_enabled: boolean;
  currency?: string | null;
  today_count: number;
  appointie?: DashboardAppointieSummary;
  shopie?: DashboardShopieSummary;
  pets?: DashboardPetsSummary;
};

export type BIShopieOverview = {
  orders: number;
  cancelled_orders: number;
  gmv: number;
  avg_order_value: number;
  returns: number;
  pending_returns: number;
  return_rate: number;
  refund_total: number;
  delivery_fee_total: number;
  currency?: string | null;
  trend: Array<{ day: string; orders: number; gmv: number }>;
  insights?: BIInsight[];
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BIOverviewResponse = {
  products: string[];
  pets_pack_enabled: boolean;
  currency?: string | null;
  period?: { start_date?: string | null; end_date?: string | null };
  appointie?: BIReportsBundle;
  shopie?: BIShopieOverview;
  pets?: DashboardPetsSummary;
  /** Present when AppointIE is subscribed (backward-compatible aliases). */
  summary?: AnalyticsSummary;
  revenue?: BIRevenueReport;
  trends?: BITrendsReport;
  growth?: BIGrowthReport;
  operations?: BIOperationsReport;
  insights?: BIInsight[];
};

export type IamRole = {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
};

export type IamPermission = {
  id: string;
  code: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  is_system?: boolean;
};

export type TenantMember = {
  id: string;
  email: string;
  full_name: string;
  roles: Array<{ code: string; name: string }>;
};

export type StaffInvitation = {
  id: string;
  email: string;
  platform_role_code: string;
  status: string;
  expires_at: string;
  accepted_at?: string | null;
  invited_by_email?: string | null;
  created_at?: string;
};

export type StaffInvitationCreateInput = {
  email: string;
  platform_role_code: 'manager' | 'staff';
};

export type AcceptInvitationInput = {
  token: string;
  password?: string;
  first_name?: string;
  last_name?: string;
};

export type Business = {
  id: string;
  business_name?: string;
  display_name?: string;
  business_code?: string;
  business_type?: string;
  email?: string | null;
  logo?: string | null;
  upi_vpa?: string | null;
  payment_qr_url?: string | null;
  gst_tax_number?: string | null;
  status?: string;
  currency?: string | null;
  timezone?: string | null;
  primary_contact?: string | null;
  website?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  selected_product?: string | null;
  product_subscriptions?: BusinessProductSubscription[];
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
};

export type BusinessCreateInput = {
  business_code: string;
  business_name: string;
  display_name: string;
  business_type?: string;
  industry_category?: string;
  email?: string;
  currency?: string;
  timezone?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  address_line1?: string;
  latitude?: number | null;
  longitude?: number | null;
  primary_contact?: string;
  website?: string;
  selected_product?: string;
};

export type ShopProductBarcode = {
  id: string;
  code: string;
  barcode_type: 'manufacturer' | 'internal' | 'rfid_epc' | string;
  is_primary: boolean;
};

export type ShopProductCategory =
  | 'food_grocery'
  | 'beverages'
  | 'snacks'
  | 'dairy'
  | 'personal_care'
  | 'household'
  | 'pet_food'
  | 'pet_supplies'
  | 'baby_care'
  | 'health'
  | 'electronics'
  | 'apparel'
  | 'other';

export const SHOP_PRODUCT_CATEGORIES: Array<{ value: ShopProductCategory; label: string }> = [
  { value: 'food_grocery', label: 'Food & grocery' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'snacks', label: 'Snacks & confectionery' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'personal_care', label: 'Personal care' },
  { value: 'household', label: 'Household' },
  { value: 'pet_food', label: 'Pet food' },
  { value: 'pet_supplies', label: 'Pet supplies' },
  { value: 'baby_care', label: 'Baby care' },
  { value: 'health', label: 'Health & wellness' },
  { value: 'electronics', label: 'Electronics & accessories' },
  { value: 'apparel', label: 'Apparel' },
  { value: 'other', label: 'Other' },
];

/** Map free-text enrichment categories onto a catalog option. */
export function guessShopProductCategory(raw?: string | null): ShopProductCategory | '' {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return '';
  const exact = SHOP_PRODUCT_CATEGORIES.find((item) => item.value === text || item.label.toLowerCase() === text);
  if (exact) return exact.value;
  const rules: Array<{ needle: RegExp; value: ShopProductCategory }> = [
    { needle: /pet\s*food|dog food|cat food|en:pet-food/, value: 'pet_food' },
    { needle: /pet\s*suppl|en:pet/, value: 'pet_supplies' },
    { needle: /beverage|drink|soft.?drink|juice|water/, value: 'beverages' },
    { needle: /snack|confection|chocolate|biscuit|cookie/, value: 'snacks' },
    { needle: /dairy|milk|cheese|yogurt|yoghurt/, value: 'dairy' },
    { needle: /personal.?care|shampoo|soap|toothpaste|cosmetic/, value: 'personal_care' },
    { needle: /household|cleaning|detergent|laundry/, value: 'household' },
    { needle: /baby|infant|diaper/, value: 'baby_care' },
    { needle: /health|wellness|vitamin|supplement/, value: 'health' },
    { needle: /electronic|charger|cable|accessory/, value: 'electronics' },
    { needle: /apparel|clothing|fashion|wear/, value: 'apparel' },
    { needle: /grocery|food|en:foods/, value: 'food_grocery' },
  ];
  for (const rule of rules) {
    if (rule.needle.test(text)) return rule.value;
  }
  return 'other';
}

export type ShopProductReview = {
  id: string;
  rating: number;
  title?: string;
  comment?: string;
  reviewer_name: string;
  verified_purchase?: boolean;
  created_at: string;
};

export type ShopProductOfficeStock = {
  branch_id: string;
  branch_name: string;
  is_primary: boolean;
  godown_id: string;
  quantity: string;
};

export type ShopProduct = {
  id: string;
  business: string;
  sku?: string;
  name: string;
  brand?: string;
  description?: string;
  details_html?: string;
  status: string;
  price: string | number;
  tax_rate?: string | number;
  gst_rate?: string | number;
  tax_inclusive?: boolean;
  hsn_sac?: string;
  currency?: string;
  stock_on_hand: string | number;
  low_stock_threshold?: string | number;
  pack_size?: string;
  image_url?: string;
  category?: ShopProductCategory | string;
  metadata?: Record<string, unknown>;
  barcodes?: ShopProductBarcode[];
  rating_avg?: number | null;
  rating_count?: number;
  rating_breakdown?: Record<string, number>;
  reviews?: ShopProductReview[];
  can_review?: boolean;
  has_purchased?: boolean;
  my_review?: ShopProductReview | null;
  created_at?: string;
  updated_at?: string;
};

export type ShopProductWriteInput = {
  business_id: string;
  sku?: string;
  name: string;
  brand?: string;
  description?: string;
  details_html?: string;
  status?: string;
  price?: string | number;
  tax_rate?: string | number;
  gst_rate?: string | number;
  hsn_sac?: string;
  currency?: string;
  stock_on_hand?: string | number;
  godown_id?: string | null;
  low_stock_threshold?: string | number;
  pack_size?: string;
  image_url?: string;
  category?: ShopProductCategory | string;
  metadata?: Record<string, unknown>;
  barcodes?: Array<{
    code: string;
    barcode_type?: string;
    is_primary?: boolean;
  }>;
};

export type ShopBarcodeEnrichment = {
  found: boolean;
  code: string;
  source?: string | null;
  sku?: string;
  name?: string;
  brand?: string;
  pack_size?: string;
  serving_size?: string;
  image_url?: string;
  local_image_url?: string;
  front_image_url?: string;
  back_image_url?: string;
  description?: string;
  categories?: string;
  query?: string;
  message?: string;
  barcode_candidates?: string[];
  tools?: string[];
  confidence?: 'high' | 'medium' | 'low' | 'none' | string;
  match_method?: 'barcode' | 'search' | 'none' | string;
  metadata?: Record<string, unknown>;
  error?: string;
};

export type ShopPackagingAnalyzeJob = {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | string;
  result?: ShopBarcodeEnrichment | null;
  error?: string | null;
  front_image_url?: string;
  back_image_url?: string;
};

export type ShopOrderLine = {
  id: string;
  product: string;
  product_name: string;
  product_image_url?: string;
  barcode_scanned?: string;
  quantity: string | number;
  unit_price: string | number;
  tax_rate?: string | number;
  discount_type?: string;
  discount_value?: string | number;
  discount_amount?: string | number;
  line_subtotal: string | number;
  line_tax: string | number;
  line_total: string | number;
};

export type ShopOrder = {
  id: string;
  business: string;
  customer_id?: string | null;
  order_number: string;
  status: string;
  fulfillment_mode: string;
  currency?: string;
  subtotal: string | number;
  discount_total?: string | number;
  tax_total: string | number;
  total: string | number;
  notes?: string;
  delivery_address?: string;
  metadata?: Record<string, unknown>;
  payment_method?: string;
  payment_status?: string;
  upi_utr?: string;
  payment_proof_url?: string;
  upi_pay_url?: string;
  delivery_fee?: string | number;
  coupon_code?: string;
  coupon_name?: string;
  coupon_discount?: string | number;
  lines?: ShopOrderLine[];
  created_at?: string;
  updated_at?: string;
};

export type ShopDeliveryQuote = {
  available: boolean;
  reason?: string;
  provider?: 'mock' | 'porter' | 'shiprocket_quick' | string;
  provider_label?: string;
  quote_id?: string;
  quoted_fee?: string | number;
  customer_fee?: string | number;
  merchant_fee?: string | number;
  eta_minutes?: number;
  expires_in_seconds?: number;
};

export type ShopDeliveryLive = {
  available: boolean;
  order_id: string;
  provider?: string;
  partner_status:
    | 'packing'
    | 'finding_rider'
    | 'rider_assigned'
    | 'at_pickup'
    | 'picked_up'
    | 'nearby'
    | 'delivered'
    | 'failed'
    | 'cancelled'
    | string;
  headline: string;
  subtitle?: string;
  eta_minutes?: number | null;
  rider?: { name?: string; phone?: string; vehicle?: string; photo_url?: string };
  pickup?: { latitude?: number; longitude?: number; address?: string };
  drop?: { latitude?: number; longitude?: number; address?: string };
  rider_location?: { latitude?: number | null; longitude?: number | null };
  events?: Array<{ status: string; label?: string; occurred_at?: string; reason?: string }>;
  tracking_url?: string;
  can_call_rider?: boolean;
  last_updated?: string | null;
  terminal?: boolean;
};

export type ShopDeliverySettings = {
  instant_delivery_enabled: boolean;
  delivery_integration: {
    provider?: 'mock' | 'porter' | 'shiprocket_quick' | string;
    credentials?: Record<string, string>;
    base_url?: string;
    webhook_secret?: string;
    charge_bearer?: 'customer' | 'merchant' | 'split' | string;
    free_delivery_min_order?: string | number;
    merchant_absorb_cap?: string | number;
    default_parcel_weight_kg?: string | number;
  };
};

export type ShopOrderCreateInput = {
  business_id: string;
  customer_id?: string | null;
  /** Buyer GSTIN for B2B GST invoices. Empty / omitted = B2C. */
  customer_gstin?: string | null;
  fulfillment_mode?: string;
  notes?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_postal_code?: string;
  delivery_latitude?: string | number | null;
  delivery_longitude?: string | number | null;
  delivery_method?: 'standard' | 'instant' | string;
  delivery_quote_id?: string;
  displayed_delivery_fee?: string | number | null;
  confirm?: boolean;
  bill_discount_type?: '' | 'percent' | 'amount' | string;
  bill_discount_value?: string | number;
  payment_method?: '' | 'cash' | 'upi' | 'card' | 'borrow' | string;
  coupon_code?: string;
  points_to_redeem?: number;
  lines: Array<{
    product_id: string;
    quantity?: string | number;
    unit_price?: string | number;
    tax_rate?: string | number;
    tax_inclusive?: boolean;
    barcode_scanned?: string;
    discount_type?: '' | 'percent' | 'amount' | string;
    discount_value?: string | number;
  }>;
};

export type ShopReturn = {
  id: string;
  business: string;
  order: string;
  customer?: string | null;
  return_number: string;
  status: string;
  reason?: string;
  restock: boolean;
  refund_total: string | number;
  currency?: string;
  credit_invoice?: string | null;
  line_items?: unknown[];
  metadata?: Record<string, unknown>;
  refund_mode?: string;
  refund_instruction?: string;
  created_at?: string;
  updated_at?: string;
};

export type ShopReturnCreateInput = {
  business_id: string;
  order_id: string;
  reason?: string;
  restock?: boolean;
  complete?: boolean;
  lines: Array<{
    order_line_id: string;
    quantity: string | number;
  }>;
};

export type ShopDeliveryZone = {
  id: string;
  business: string;
  name: string;
  enabled: boolean;
  cities?: string[];
  postal_prefixes?: string[];
  same_day?: boolean;
  fee?: string | number;
  min_order_total?: string | number;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopDeliveryZoneWriteInput = {
  business_id: string;
  name: string;
  enabled?: boolean;
  cities?: string[];
  postal_prefixes?: string[];
  same_day?: boolean;
  fee?: string | number;
  min_order_total?: string | number;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export type ShopPet = {
  id: string;
  business: string;
  customer: string;
  customer_name?: string;
  name: string;
  species?: string;
  breed?: string;
  sex?: string;
  birthday?: string | null;
  photo_url?: string;
  medical_notes?: string;
  medical_records?: unknown[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopPetWriteInput = {
  business_id: string;
  customer_id: string;
  name: string;
  species?: string;
  breed?: string;
  sex?: string;
  birthday?: string | null;
  photo_url?: string;
  medical_notes?: string;
  medical_records?: unknown[];
  metadata?: Record<string, unknown>;
};

export type ShopSettings = {
  id: string;
  business: string;
  enabled_packs?: string[];
  pets_enabled?: boolean;
  default_fulfillment_mode?: string;
  same_day_delivery_enabled?: boolean;
  instant_delivery_enabled?: boolean;
  metadata?: Record<string, unknown>;
};

export type ShopBarcodeBulkLookupResult = {
  items: Array<{
    code: string;
    found: boolean;
    product?: ShopProduct;
  }>;
  found_count: number;
};

export type ShopInvoice = {
  id: string;
  business: string;
  customer?: string | null;
  order?: string | null;
  invoice_number: string;
  status: string;
  currency?: string;
  subtotal: string | number;
  tax_total: string | number;
  total: string | number;
  amount_paid?: string | number;
  notes?: string;
  line_items?: unknown[];
  created_at?: string;
};

export type ShopQuotation = {
  id: string;
  business: string;
  customer?: string | null;
  quotation_number: string;
  status: string;
  currency?: string;
  subtotal: string | number;
  tax_total: string | number;
  total: string | number;
  notes?: string;
  line_items?: unknown[];
  valid_until?: string | null;
  converted_order?: string | null;
  created_at?: string;
};

export type ShopQuotationCreateInput = {
  business_id: string;
  customer_id?: string | null;
  notes?: string;
  valid_until?: string | null;
  lines: Array<{
    product_id: string;
    quantity?: string | number;
    unit_price?: string | number;
    tax_rate?: string | number;
  }>;
};

export type ShopBooksDashboard = {
  cash: string;
  bank: string;
  to_collect: string;
  to_pay: string;
  accounts: Array<{
    id: string;
    name: string;
    account_type: string;
    current_balance: string;
  }>;
};

export type ShopSupplier = {
  id: string;
  business: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billing_state?: string;
  billing_address?: string;
  credit_limit?: string | number;
  opening_balance?: string | number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopSupplierWriteInput = {
  business_id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billing_state?: string;
  billing_address?: string;
  credit_limit?: string | number;
  opening_balance?: string | number;
  metadata?: Record<string, unknown>;
};

export type ShopCoupon = {
  id: string;
  business: string;
  code: string;
  name: string;
  description?: string;
  discount_type: 'percent' | 'amount' | string;
  discount_value: string | number;
  min_order_total?: string | number;
  max_discount_amount?: string | number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  max_redemptions_per_customer?: number | null;
  first_order_only?: boolean;
  redemption_count?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ShopCouponWriteInput = {
  business_id: string;
  code: string;
  name: string;
  description?: string;
  discount_type: 'percent' | 'amount' | string;
  discount_value: string | number;
  min_order_total?: string | number;
  max_discount_amount?: string | number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  max_redemptions_per_customer?: number | null;
  first_order_only?: boolean;
  is_active?: boolean;
};

export type ShopCouponPreview = {
  valid: boolean;
  code: string;
  name: string;
  description?: string;
  discount_type: string;
  discount_value: string;
  discount_amount: string;
  min_order_total: string;
  merchandise_subtotal: string;
};

export type ShopCouponOffer = {
  code: string;
  name: string;
  description?: string;
  discount_type: string;
  discount_value: string;
  min_order_total: string;
  max_discount_amount?: string | null;
  discount_amount: string;
  applicable: boolean;
  reason: string;
  remaining_to_unlock: string;
  first_order_only?: boolean;
  ends_at?: string | null;
};

export type ShopDashboardAd = {
  id: string;
  business: string;
  title: string;
  body?: string;
  media?: string | null;
  image_url?: string;
  link_url?: string;
  sort_order?: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ShopDashboardAdWriteInput = {
  business_id: string;
  title: string;
  body?: string;
  media_id?: string | null;
  image_url?: string;
  link_url?: string;
  sort_order?: number;
  is_active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type CustomerReferralCode = {
  id: string;
  business: string;
  customer: string;
  code: string;
  created_at?: string;
  updated_at?: string;
};

export type CustomerReferral = {
  id: string;
  business: string;
  referrer: string;
  referrer_name?: string;
  referred: string;
  referred_name?: string;
  status: 'pending' | 'qualified' | 'rewarded' | 'void' | string;
  rewarded_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopCashAccount = {
  id: string;
  business: string;
  name: string;
  account_type: 'cash' | 'bank' | string;
  opening_balance: string | number;
  current_balance: string | number;
  is_active: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopCashAccountWriteInput = {
  business_id: string;
  name: string;
  account_type?: 'cash' | 'bank' | string;
  opening_balance?: string | number;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

export type ShopBooksVoucherType =
  | 'sale'
  | 'purchase'
  | 'payment_in'
  | 'payment_out'
  | 'expense'
  | 'other_income'
  | 'transfer'
  | 'credit_note'
  | 'debit_note';

export type ShopBooksVoucherLineInput = {
  product_id?: string | null;
  name?: string;
  hsn_sac?: string;
  qty: string | number;
  rate?: string | number;
  discount?: string | number;
  gst_rate?: string | number;
  /** When true, rate is GST-inclusive (product MRP / tax-included price). */
  tax_inclusive?: boolean;
};

export type ShopBooksVoucher = {
  id: string;
  business: string;
  voucher_type: ShopBooksVoucherType | string;
  voucher_type_display?: string;
  voucher_number: string;
  voucher_date?: string;
  status: string;
  customer?: string | null;
  customer_name?: string;
  supplier?: string | null;
  supplier_name?: string;
  cash_account?: string | null;
  cash_account_name?: string;
  contra_account?: string | null;
  contra_account_name?: string;
  currency?: string;
  subtotal: string | number;
  discount_total?: string | number;
  tax_total: string | number;
  cgst_total?: string | number;
  sgst_total?: string | number;
  igst_total?: string | number;
  total: string | number;
  amount_paid?: string | number;
  place_of_supply?: string;
  is_interstate?: boolean;
  notes?: string;
  line_items?: unknown[];
  linked_order?: string | null;
  linked_invoice?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopBooksVoucherCreateInput = {
  voucher_type: ShopBooksVoucherType | string;
  business_id: string;
  customer_id?: string | null;
  supplier_id?: string | null;
  cash_account_id?: string | null;
  contra_account_id?: string | null;
  amount?: string | number;
  category?: string;
  voucher_date?: string;
  voucher_number?: string;
  status?: string;
  lines?: ShopBooksVoucherLineInput[];
  is_interstate?: boolean;
  place_of_supply?: string;
  notes?: string;
  amount_paid?: string | number;
  currency?: string;
  metadata?: Record<string, unknown>;
  points_to_redeem?: number;
};

export type ShopPartyLedgerEntry = {
  id: string;
  party_kind: 'customer' | 'supplier' | string;
  customer?: string | null;
  supplier?: string | null;
  entry_type: string;
  amount: string | number;
  direction: string;
  balance_after: string | number;
  voucher?: string | null;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type ShopPartyStatement = {
  party_kind: 'customer' | 'supplier' | string;
  party_id: string;
  party_name: string;
  opening_balance: string;
  closing_balance: string;
  entries: ShopPartyLedgerEntry[];
};

export type ShopBooksReportSlug = 'sales' | 'purchase' | 'daybook' | 'gstr1' | 'gstr3b' | 'pnl';

export type ShopGstComplianceProvider = 'mock' | 'nic_sandbox' | 'nic_production' | 'custom';

export type ShopGstCompliance = {
  provider?: ShopGstComplianceProvider | string;
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  base_url?: string;
  seller_legal_name?: string;
  seller_trade_name?: string;
  seller_addr1?: string;
  seller_addr2?: string;
  seller_loc?: string;
  seller_pin?: string;
  seller_state_code?: string;
};

export type ShopComplianceSettings = {
  id: string;
  business: string;
  einvoice_enabled: boolean;
  eway_enabled: boolean;
  gst_compliance: ShopGstCompliance;
};

export type ShopComplianceSettingsUpdateInput = {
  business_id: string;
  einvoice_enabled?: boolean;
  eway_enabled?: boolean;
  gst_compliance?: ShopGstCompliance;
};

export type ShopEInvoiceStatus = 'draft' | 'pending' | 'generated' | 'cancelled' | 'failed';

export type ShopEInvoice = {
  id: string;
  business: string;
  voucher: string;
  voucher_number?: string;
  status: ShopEInvoiceStatus | string;
  doc_type: 'INV' | 'CRN' | 'DBN' | string;
  irn?: string;
  ack_no?: string;
  ack_date?: string | null;
  signed_qr?: string;
  signed_invoice?: string;
  error_message?: string;
  cancelled_at?: string | null;
  cancel_reason?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopEWayBillStatus = 'draft' | 'generated' | 'cancelled' | 'failed';

export type ShopEWayGenerateInput = {
  supply_type?: 'O' | 'I' | string;
  sub_supply_type?: string;
  doc_type?: string;
  transporter_id?: string;
  transporter_name?: string;
  transport_mode?: '1' | '2' | '3' | '4' | string;
  vehicle_no?: string;
  vehicle_type?: 'R' | 'O' | string;
  distance_km?: number | string;
  from_place?: string;
  from_state_code?: string;
  to_place?: string;
  to_state_code?: string;
};

export type ShopEWayBill = {
  id: string;
  business: string;
  voucher: string;
  voucher_number?: string;
  einvoice?: string | null;
  status: ShopEWayBillStatus | string;
  ewb_no?: string;
  ewb_date?: string | null;
  valid_upto?: string | null;
  supply_type: string;
  sub_supply_type?: string;
  doc_type?: string;
  transporter_id?: string;
  transporter_name?: string;
  transport_mode?: string;
  vehicle_no?: string;
  vehicle_type?: string;
  distance_km?: number;
  from_place?: string;
  from_state_code?: string;
  to_place?: string;
  to_state_code?: string;
  error_message?: string;
  cancelled_at?: string | null;
  cancel_reason?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ShopQuotationConvertToSaleInput = {
  voucher_date?: string;
  notes?: string;
  amount_paid?: string | number;
  cash_account_id?: string | null;
  is_interstate?: boolean;
  place_of_supply?: string;
};

export type ShopBooksDocumentType = 'sale_order' | 'purchase_order' | 'delivery_challan' | 'job_work';

export type ShopBooksDocument = {
  id: string;
  business: string;
  doc_type: ShopBooksDocumentType | string;
  doc_type_display?: string;
  document_number: string;
  document_date?: string;
  status: string;
  customer?: string | null;
  customer_name?: string;
  supplier?: string | null;
  supplier_name?: string;
  currency?: string;
  subtotal: string | number;
  tax_total: string | number;
  total: string | number;
  notes?: string;
  line_items?: unknown[];
  converted_voucher?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type ShopBooksDocumentCreateInput = {
  business_id: string;
  doc_type: ShopBooksDocumentType | string;
  customer_id?: string | null;
  supplier_id?: string | null;
  document_date?: string;
  notes?: string;
  lines: Array<{
    product_id: string;
    quantity?: string | number;
    qty?: string | number;
    unit_price?: string | number;
    rate?: string | number;
    tax_rate?: string | number;
    gst_rate?: string | number;
  }>;
};

export type ShopGodownStock = {
  product: string;
  product_name?: string;
  sku?: string;
  quantity: string | number;
  price?: string | number;
  low_stock_threshold?: string | number;
  catalog_stock?: string | number;
};

export type ShopGodown = {
  id: string;
  business: string;
  /** Office this stock location belongs to, when it maps to one. */
  branch?: string | null;
  branch_name?: string;
  name: string;
  code?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  effective_location?: {
    latitude: string | number;
    longitude: string | number;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    contact_name?: string;
    contact_phone?: string;
    branch_id?: string;
    godown_id: string;
    source_type: 'office' | 'godown';
  } | null;
  online_fulfillment_ready?: boolean;
  is_default?: boolean;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  stocks?: ShopGodownStock[];
  created_at?: string;
};

export type ShopStockTransfer = {
  id: string;
  business: string;
  from_godown: string;
  from_godown_name?: string;
  to_godown: string;
  to_godown_name?: string;
  transfer_number: string;
  transfer_date?: string;
  status: string;
  notes?: string;
  line_items?: unknown[];
  created_at?: string;
};

export type ShopCheque = {
  id: string;
  business: string;
  direction: 'in' | 'out' | string;
  status: string;
  customer?: string | null;
  customer_name?: string;
  supplier?: string | null;
  supplier_name?: string;
  cash_account?: string | null;
  amount: string | number;
  cheque_number: string;
  bank_name?: string;
  due_date?: string | null;
  cleared_at?: string | null;
  linked_voucher?: string | null;
  notes?: string;
  created_at?: string;
};

export type ShopLoan = {
  id: string;
  business: string;
  party_kind: string;
  customer?: string | null;
  customer_name?: string;
  supplier?: string | null;
  supplier_name?: string;
  title: string;
  principal: string | number;
  interest_rate?: string | number;
  balance: string | number;
  start_date?: string;
  status: string;
  notes?: string;
  repayments?: Array<{ amount: string; date: string; notes?: string }>;
  created_at?: string;
};

export type ShopGrowSettings = {
  whatsapp?: {
    phone?: string;
    country_iso?: string;
    dial_code?: string;
    national_number?: string;
    default_message?: string;
    attachment_media_id?: string;
    attachment_url?: string;
  };
  google_profile?: { url?: string; place_id?: string };
  online_store?: { enabled?: boolean; url?: string; slug?: string };
  sync?: { last_export_at?: string; last_export_sections?: string[] };
  loyalty?: { enabled?: boolean; points_per_100?: number; redeem_value?: number };
  referral?: {
    enabled?: boolean;
    points_per_referral?: number;
    success_event?: 'signup' | 'first_booking' | 'first_paid_order';
  };
};

export type BusinessUpdateInput = Partial<
  Pick<
    Business,
    | 'business_name'
    | 'display_name'
    | 'business_type'
    | 'email'
    | 'currency'
    | 'timezone'
    | 'status'
    | 'selected_product'
    | 'logo'
    | 'upi_vpa'
    | 'payment_qr_url'
  >
> & {
  industry_category?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  address_line1?: string;
  latitude?: number | null;
  longitude?: number | null;
  primary_contact?: string;
  website?: string;
  language?: string;
  settings?: Record<string, unknown>;
  gst_tax_number?: string;
};

export type Branch = {
  id: string;
  business: string;
  branch_code: string;
  branch_name: string;
  display_name?: string;
  is_primary?: boolean;
  email?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
};

export type BranchCreateInput = {
  branch_name: string;
  branch_code?: string;
  display_name?: string;
  is_primary?: boolean;
  email?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string;
  status?: string;
};

export type BranchUpdateInput = Partial<BranchCreateInput>;

export type OperationsSearchResult = {
  customers: Customer[];
  services: Service[];
  staff: StaffMember[];
};

export type CustomerAddress = {
  id?: string;
  address_type?: string;
  line1?: string;
  line2?: string;
  full_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  is_default?: boolean;
};

export type Customer = {
  id: string;
  customer_code?: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  status?: string;
  full_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: CustomerAddress | null;
  addresses?: Array<CustomerAddress & { is_default?: boolean; full_address?: string | null }>;
  billing_state?: string;
  gstin?: string;
  borrow_balance_due?: string | number;
  borrow_currency?: string;
  loyalty_points?: number;
  created_at?: string;
  updated_at?: string;
};

export type CustomerBorrowBalance = {
  customer_id: string;
  balance_due: string | number;
  currency: string;
};

export type CustomerBorrowLedgerEntry = {
  id: string;
  entry_type: 'charge' | 'payment' | 'adjustment' | string;
  amount: string | number;
  balance_after: string | number;
  payment_method?: string;
  notes?: string;
  order_id?: string | null;
  order_number?: string;
  created_at?: string;
};

export type CustomerBorrowPaymentInput = {
  amount: string | number;
  payment_method?: 'cash' | 'upi' | 'card' | string;
  notes?: string;
  order_id?: string | null;
};

export type CustomerBorrowPaymentResult = {
  entry_id: string;
  amount: string | number;
  payment_method: string;
  balance_due: string | number;
  currency: string;
  allocations?: Array<{
    order_id: string;
    order_number: string;
    applied: string;
    amount_due: string;
  }>;
};

export type CustomerCreateInput = {
  business: string;
  customer_code: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  alternate_phone?: string;
  date_of_birth?: string;
  gender?: string;
  source?: string;
  status?: string;
  tags?: string[];
  billing_state?: string;
  gstin?: string;
  metadata?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  send_registration_invite?: boolean;
  referral_code?: string;
  default_address?: {
    line1?: string;
    full_address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    is_default?: boolean;
  };
};

export type CustomerUpdateInput = Partial<CustomerCreateInput>;

export type ServiceDuration = {
  id?: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  cleanup_minutes?: number;
  is_default?: boolean;
};

export type Service = {
  id: string;
  name?: string;
  description?: string | null;
  status?: string;
  duration_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  cleanup_minutes?: number;
  loyalty_points_earn?: number;
  durations?: ServiceDuration[];
  price?: number;
  currency?: string | null;
  prices?: Array<{
    id?: string;
    currency?: string;
    base_price?: string | number;
    sale_price?: string | number | null;
    is_default?: boolean;
  }>;
  image_url?: string | null;
  images?: Array<{
    id?: string;
    media?: string;
    alt_text?: string;
    display_order?: number;
    is_primary?: boolean;
    image_url?: string | null;
    thumbnail_url?: string | null;
  }>;
  created_at?: string;
  updated_at?: string;
};

export type ServiceCreateInput = {
  business: string;
  service_code: string;
  name: string;
  display_name?: string;
  short_description?: string;
  description?: string;
  status?: string;
  visibility?: string;
  online_booking_enabled?: boolean;
  gender_restriction?: string;
  min_age?: number;
  max_age?: number;
  tags?: string[];
  display_order?: number;
  loyalty_points_earn?: number;
  addons_metadata?: Record<string, unknown>;
  packages_metadata?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  default_duration?: Record<string, unknown>;
  default_price?: Record<string, unknown>;
  primary_image?: {
    media_id?: string;
    alt_text?: string;
    clear?: boolean;
  };
};

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

export type StaffMember = {
  id: string;
  user?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  staff_code?: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  designation?: string | null;
  department?: string | null;
  employment_status?: string;
  is_bookable?: boolean;
  status?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type StaffWeeklySchedule = {
  id: string;
  business: string;
  staff_id: string;
  weekday: number;
  is_available: boolean;
  shift_start: string;
  shift_end: string;
  break_periods?: unknown[];
  capacity: number;
  overtime_allowed?: boolean;
};

export type StaffWeeklyScheduleInput = {
  weekday: number;
  is_available?: boolean;
  shift_start: string;
  shift_end: string;
  capacity?: number;
  break_periods?: Array<{ start: string; end: string }>;
  overtime_allowed?: boolean;
};

export type StaffWeeklyScheduleBulkInput = {
  business?: string;
  staff_id: string;
  schedules: StaffWeeklyScheduleInput[];
};

export type StaffLeave = {
  id: string;
  business?: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  leave_type?: string;
  reason?: string;
  approved?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type StaffLeaveInput = {
  business?: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  leave_type?: string;
  reason?: string;
  approved?: boolean;
};

export type StaffSpecialAvailability = {
  id: string;
  business?: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  capacity?: number;
  reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type StaffSpecialAvailabilityInput = {
  business?: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  capacity?: number;
  reason?: string;
};

export type StaffSlotBlock = {
  id: string;
  business?: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type StaffSlotBlockInput = {
  business?: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason?: string;
};

export type StaffEmergencySlot = {
  id: string;
  business?: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity?: number;
  reason?: string;
  created_at?: string;
  updated_at?: string;
};

export type StaffEmergencySlotInput = {
  business?: string;
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity?: number;
  reason?: string;
};

export type StaffServiceAssignment = {
  id: string;
  tenant?: string;
  staff: string;
  service: string;
  default_duration_override?: number | null;
  default_price_override?: string | number | null;
  priority?: number;
  is_active_assignment?: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type StaffServiceAssignmentInput = {
  staff: string;
  service: string;
  default_duration_override?: number | null;
  default_price_override?: string | number | null;
  priority?: number;
  is_active_assignment?: boolean;
  metadata?: Record<string, unknown>;
};

export type StaffCreateInput = {
  business: string;
  staff_code: string;
  first_name: string;
  last_name?: string;
  display_name: string;
  email?: string;
  phone_number?: string;
  photo?: string | null;
  designation?: string;
  department?: string;
  working_location?: string;
  joining_date?: string;
  employment_status?: string;
  is_bookable?: boolean;
  emergency_contact?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  employment?: Record<string, unknown>;
};

export type StaffUpdateInput = Partial<StaffCreateInput>;

export type Notification = {
  id: string;
  subject?: string;
  body?: string;
  channel?: string;
  status?: string;
  is_read?: boolean;
  created_at?: string;
  updated_at?: string;
  booking_id?: string | null;
  pet_id?: string | null;
  notification_type?: string;
};

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
};

/**
 * Workspace = Current Product + Current Business (user-facing session scope).
 * Tenant is internal and must not be exposed in UI. See ADR-002.
 */
export type WorkspaceSnapshot = {
  productCode: string | null;
  productName: string;
  businessId: string | null;
  businessName: string;
  businessStatus?: string | null;
  currency?: string | null;
  timezone?: string | null;
  /** Internal only — never display in end-user UI */
  tenantId?: string | null;
};

export type TenantSettingsPayload = {
  business_name?: string;
  display_name?: string;
  selected_product?: string;
  product_code?: string;
  product_name?: string;
  branding?: {
    logo?: string;
    dark_logo?: string;
    favicon?: string;
    primary_color?: string;
    secondary_color?: string;
    theme_mode?: string;
  };
  subscription?: {
    plan?: string | null;
    status?: string;
    feature_flags?: Record<string, unknown>;
    limits?: Record<string, unknown>;
  };
};

export type TenantSettingsResponse = {
  id?: string;
  business_name?: string | null;
  display_name?: string | null;
  selected_product?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  subscription?: {
    plan?: string | null;
    plan_code?: string | null;
    plan_name?: string | null;
    status?: string;
    feature_flags?: Record<string, unknown>;
    limits?: Record<string, unknown>;
  };
};

export type TenantCreateInput = {
  slug: string;
  display_name: string;
  legal_name?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  country?: string;
  state?: string;
  city?: string;
  logo?: string;
  favicon?: string;
  primary_color?: string;
  secondary_color?: string;
  brand_settings?: Record<string, unknown>;
  subscription_reference?: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
};

export type RegisterBusinessInput = RegisterRequest & {
  slug: string;
  business_name: string;
  display_name?: string;
  business_code?: string;
  business_type?: string;
  industry_category?: string;
  business_email?: string;
  primary_contact?: string;
  website?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  address_line1?: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  currency?: string;
  language?: string;
  selected_product?: string;
  selected_products?: string[];
  plan_code?: string;
  plan_codes?: Record<string, string>;
  primary_color?: string;
  secondary_color?: string;
  phone_number?: string;
  settings?: Record<string, unknown>;
  affiliate_code?: string;
};

export type WorkspaceProvisionResponse = {
  access: string;
  refresh: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
  tenant: TenantSummary;
  business: Business;
};

export type TenantSlugAvailability = {
  slug: string;
  available: boolean;
};

class ApiClient {
  private readonly resolveBaseUrl: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: HeadersInit;
  private token: string | null;

  constructor(config: ApiClientConfig) {
    const configuredBaseUrl = config.baseUrl;
    this.resolveBaseUrl =
      typeof configuredBaseUrl === 'function'
        ? configuredBaseUrl
        : () => configuredBaseUrl.replace(/\/$/, '');
    const rawFetch = config.fetchImpl ?? fetch;
    this.fetchImpl = rawFetch.bind(globalThis as unknown as typeof fetch);
    this.defaultHeaders = config.headers ?? {};
    this.token = config.token ?? null;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  auth = {
    login: (body: LoginRequest) => this.request<LoginResponse>('/auth/login', { method: 'POST', body }),
    refresh: (body: RefreshRequest) => this.request<LoginResponse>('/auth/refresh', { method: 'POST', body }),
    logout: (body: { refresh: string; all_sessions?: boolean }) => this.request<{ logged_out: boolean }>('/auth/logout', { method: 'POST', body }),
    forgotPassword: (body: ForgotPasswordRequest) => this.request<{ accepted: boolean }>('/auth/forgot-password', { method: 'POST', body }),
    resetPassword: (body: ResetPasswordRequest) => this.request<{ reset: boolean }>('/auth/reset-password', { method: 'POST', body }),
    changePassword: (body: ChangePasswordRequest) => this.request<{ changed: boolean }>('/auth/change-password', { method: 'POST', body }),
    register: (body: RegisterRequest) => this.request<UserProfile>('/auth/register', { method: 'POST', body }),
    registerBusiness: (body: RegisterBusinessInput) =>
      this.request<WorkspaceProvisionResponse>('/auth/register-business', { method: 'POST', body }),
    verifyEmail: (body: VerifyEmailRequest) => this.request<{ verified: boolean; email: string }>('/auth/verify-email', { method: 'POST', body }),
    resendVerification: (body?: { email?: string }) =>
      this.request<{ sent: boolean; debug_token?: string }>('/auth/resend-verification', { method: 'POST', body: body ?? {} }),
    me: () => this.request<UserProfile>('/auth/me', { method: 'GET' }),
    patchMe: (body: PatchAuthMeRequest) => this.request<UserProfile>('/auth/me', { method: 'PATCH', body }),
  };

  shop = {
    listProducts: (query: {
      business_id: string;
      search?: string;
      status?: string;
      category?: string;
      page_size?: number;
    }) => this.request<ShopProduct[]>('/shop/products', { method: 'GET', query }),
    createProduct: (body: ShopProductWriteInput) =>
      this.request<ShopProduct>('/shop/products', { method: 'POST', body }),
    getProduct: (productId: string) => this.request<ShopProduct>(`/shop/products/${productId}`, { method: 'GET' }),
    patchProduct: (productId: string, body: Partial<ShopProductWriteInput>) =>
      this.request<ShopProduct>(`/shop/products/${productId}`, { method: 'PATCH', body }),
    lookupBarcode: (body: { business_id: string; code: string }) =>
      this.request<ShopProduct>('/shop/barcodes/lookup', { method: 'POST', body }),
    lookupBarcodesBulk: (body: { business_id: string; codes: string[] }) =>
      this.request<ShopBarcodeBulkLookupResult>('/shop/barcodes/lookup-bulk', { method: 'POST', body }),
    enrichBarcode: (body: { code?: string; query?: string; image_url?: string; hint?: string }) =>
      this.request<ShopBarcodeEnrichment>('/shop/barcodes/enrich', { method: 'POST', body }),
    analyzePackaging: (body: {
      business_id: string;
      front_image_url?: string;
      back_image_url?: string;
      hint?: string;
      async_mode?: boolean;
    }) => this.request<ShopPackagingAnalyzeJob>('/shop/products/analyze-packaging', { method: 'POST', body }),
    getPackagingAnalysis: (jobId: string) =>
      this.request<ShopPackagingAnalyzeJob>(`/shop/products/analyze-packaging/${jobId}`, { method: 'GET' }),
    adjustStock: (productId: string, body: { quantity_delta: number | string; reason?: string; movement_type?: string; godown_id?: string | null }) =>
      this.request<ShopProduct>(`/shop/products/${productId}/stock-adjust`, { method: 'POST', body }),
    listProductOfficeStock: (productId: string) =>
      this.request<ShopProductOfficeStock[]>(`/shop/products/${productId}/office-stock`, {
        method: 'GET',
      }),
    listOrders: (query: { business_id: string; status?: string; customer_id?: string }) =>
      this.request<ShopOrder[]>('/shop/orders', { method: 'GET', query }),
    createOrder: (body: ShopOrderCreateInput) => this.request<ShopOrder>('/shop/orders', { method: 'POST', body }),
    getOrder: (orderId: string) => this.request<ShopOrder>(`/shop/orders/${orderId}`, { method: 'GET' }),
    setOrderStatus: (orderId: string, body: { status: string }) =>
      this.request<ShopOrder>(`/shop/orders/${orderId}/status`, { method: 'POST', body }),
    dispatchOrder: (orderId: string) =>
      this.request<ShopOrder>(`/shop/orders/${orderId}/dispatch`, { method: 'POST', body: {} }),
    getOrderDeliveryLive: (orderId: string, refresh = true) =>
      this.request<ShopDeliveryLive>(`/shop/orders/${orderId}/delivery-live`, {
        method: 'GET',
        query: { refresh },
      }),
    confirmOrderPayment: (orderId: string, body: { action: 'confirm' | 'reject' | string; note?: string }) =>
      this.request<ShopOrder>(`/shop/orders/${orderId}/confirm-payment`, { method: 'POST', body }),
    settleOrderPayment: (orderId: string, body?: { settled_via?: 'cash' | 'upi' | 'card' | string }) =>
      this.request<ShopOrder>(`/shop/orders/${orderId}/settle-payment`, { method: 'POST', body: body ?? {} }),
    createInvoiceFromOrder: (orderId: string) =>
      this.request<ShopInvoice>(`/shop/orders/${orderId}/invoice`, { method: 'POST' }),
    listReturns: (query: { business_id: string; order_id?: string }) =>
      this.request<ShopReturn[]>('/shop/returns', { method: 'GET', query }),
    createReturn: (body: ShopReturnCreateInput) =>
      this.request<ShopReturn>('/shop/returns', { method: 'POST', body }),
    listDeliveryZones: (query: { business_id: string }) =>
      this.request<ShopDeliveryZone[]>('/shop/delivery-zones', { method: 'GET', query }),
    createDeliveryZone: (body: ShopDeliveryZoneWriteInput) =>
      this.request<ShopDeliveryZone>('/shop/delivery-zones', { method: 'POST', body }),
    patchDeliveryZone: (zoneId: string, body: Partial<ShopDeliveryZoneWriteInput>) =>
      this.request<ShopDeliveryZone>(`/shop/delivery-zones/${zoneId}`, { method: 'PATCH', body }),
    listCoupons: (query: { business_id: string; active_only?: boolean }) =>
      this.request<ShopCoupon[]>('/shop/coupons', { method: 'GET', query }),
    createCoupon: (body: ShopCouponWriteInput) =>
      this.request<ShopCoupon>('/shop/coupons', { method: 'POST', body }),
    getCoupon: (couponId: string) => this.request<ShopCoupon>(`/shop/coupons/${couponId}`, { method: 'GET' }),
    updateCoupon: (couponId: string, body: Partial<ShopCouponWriteInput>) =>
      this.request<ShopCoupon>(`/shop/coupons/${couponId}`, { method: 'PATCH', body }),
    deleteCoupon: (couponId: string) =>
      this.request<{ deleted: boolean }>(`/shop/coupons/${couponId}`, { method: 'DELETE' }),
    matchDeliveryZone: (body: { business_id: string; city?: string; postal_code?: string }) =>
      this.request<{ matched: boolean; zone: ShopDeliveryZone | null }>('/shop/delivery-zones/match', {
        method: 'POST',
        body,
      }),
    quoteDelivery: (body: {
      business_id: string;
      latitude: string | number;
      longitude: string | number;
      address?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      subtotal: string | number;
      lines?: Array<{ product_id: string; quantity: string | number }>;
    }) => this.request<ShopDeliveryQuote>('/shop/delivery/quote', { method: 'POST', body }),
    getDeliverySettings: (query: { business_id: string }) =>
      this.request<ShopDeliverySettings>('/shop/delivery-settings', { method: 'GET', query }),
    patchDeliverySettings: (body: {
      business_id: string;
      instant_delivery_enabled?: boolean;
      delivery_integration?: ShopDeliverySettings['delivery_integration'];
    }) => this.request<ShopDeliverySettings>('/shop/delivery-settings', { method: 'PATCH', body }),
    getSettings: (query: { business_id: string }) =>
      this.request<ShopSettings>('/shop/settings', { method: 'GET', query }),
    patchSettings: (body: {
      business_id: string;
      enabled_packs?: string[];
      enable_pets?: boolean;
      default_fulfillment_mode?: string;
      same_day_delivery_enabled?: boolean;
      metadata?: Record<string, unknown>;
    }) => this.request<ShopSettings>('/shop/settings', { method: 'PATCH', body }),
    listPets: (query: { business_id: string; customer_id?: string }) =>
      this.request<ShopPet[]>('/shop/pets', { method: 'GET', query }),
    createPet: (body: ShopPetWriteInput) => this.request<ShopPet>('/shop/pets', { method: 'POST', body }),
    getPet: (petId: string) => this.request<ShopPet>(`/shop/pets/${petId}`, { method: 'GET' }),
    patchPet: (petId: string, body: Partial<ShopPetWriteInput>) =>
      this.request<ShopPet>(`/shop/pets/${petId}`, { method: 'PATCH', body }),
    deletePet: (petId: string) => this.request<{ deleted: boolean }>(`/shop/pets/${petId}`, { method: 'DELETE' }),
    notifyPetOwner: (
      petId: string,
      body: { subject: string; body: string; channels?: Array<'in_app' | 'email'> },
    ) =>
      this.request<{
        sent_channels: string[];
        notification_ids: string[];
        user_id?: string | null;
      }>(`/shop/pets/${petId}/notify`, { method: 'POST', body }),
    listInvoices: (query: { business_id: string }) =>
      this.request<ShopInvoice[]>('/shop/invoices', { method: 'GET', query }),
    listQuotations: (query: { business_id: string }) =>
      this.request<ShopQuotation[]>('/shop/quotations', { method: 'GET', query }),
    createQuotation: (body: ShopQuotationCreateInput) =>
      this.request<ShopQuotation>('/shop/quotations', { method: 'POST', body }),
    convertQuotationToSale: (quotationId: string, body?: ShopQuotationConvertToSaleInput) =>
      this.request<ShopBooksVoucher>(`/shop/quotations/${quotationId}/convert-to-sale`, {
        method: 'POST',
        body: body ?? {},
      }),
    listDocuments: (query: { business_id: string; doc_type?: string }) =>
      this.request<ShopBooksDocument[]>('/shop/books/documents', { method: 'GET', query }),
    createDocument: (body: ShopBooksDocumentCreateInput) =>
      this.request<ShopBooksDocument>('/shop/books/documents', { method: 'POST', body }),
    convertDocument: (
      documentId: string,
      body?: { amount_paid?: string | number; cash_account_id?: string | null },
    ) =>
      this.request<ShopBooksVoucher | ShopBooksDocument>(`/shop/books/documents/${documentId}/convert`, {
        method: 'POST',
        body: body ?? {},
      }),
    listGodowns: (query: { business_id: string }) =>
      this.request<ShopGodown[]>('/shop/godowns', { method: 'GET', query }),
    createGodown: (body: {
      business_id: string;
      name: string;
      code?: string;
      is_default?: boolean;
      phone_number?: string;
      address_line1: string;
      address_line2?: string;
      city: string;
      state?: string;
      country: string;
      postal_code?: string;
      latitude: number;
      longitude: number;
    }) => this.request<ShopGodown>('/shop/godowns', { method: 'POST', body }),
    listStockTransfers: (query: { business_id: string }) =>
      this.request<ShopStockTransfer[]>('/shop/stock-transfers', { method: 'GET', query }),
    createStockTransfer: (body: {
      business_id: string;
      from_godown_id: string;
      to_godown_id: string;
      transfer_date?: string;
      notes?: string;
      lines: Array<{ product_id: string; quantity?: string | number; qty?: string | number }>;
    }) => this.request<ShopStockTransfer>('/shop/stock-transfers', { method: 'POST', body }),
    listCheques: (query: { business_id: string }) =>
      this.request<ShopCheque[]>('/shop/cheques', { method: 'GET', query }),
    createCheque: (body: {
      business_id: string;
      direction: 'in' | 'out' | string;
      amount: string | number;
      cheque_number: string;
      bank_name?: string;
      due_date?: string;
      customer_id?: string | null;
      supplier_id?: string | null;
      cash_account_id?: string | null;
      notes?: string;
    }) => this.request<ShopCheque>('/shop/cheques', { method: 'POST', body }),
    clearCheque: (chequeId: string, body?: { cash_account_id?: string | null }) =>
      this.request<ShopCheque>(`/shop/cheques/${chequeId}/clear`, { method: 'POST', body: body ?? {} }),
    bounceCheque: (chequeId: string) =>
      this.request<ShopCheque>(`/shop/cheques/${chequeId}/bounce`, { method: 'POST', body: {} }),
    listLoans: (query: { business_id: string }) =>
      this.request<ShopLoan[]>('/shop/loans', { method: 'GET', query }),
    createLoan: (body: {
      business_id: string;
      title: string;
      principal: string | number;
      interest_rate?: string | number;
      party_kind?: string;
      customer_id?: string | null;
      supplier_id?: string | null;
      start_date?: string;
      notes?: string;
    }) => this.request<ShopLoan>('/shop/loans', { method: 'POST', body }),
    repayLoan: (loanId: string, body: { amount: string | number; notes?: string }) =>
      this.request<ShopLoan>(`/shop/loans/${loanId}/repay`, { method: 'POST', body }),
    booksDashboard: (query: { business_id: string }) =>
      this.request<ShopBooksDashboard>('/shop/books/dashboard', { method: 'GET', query }),
    listSuppliers: (query: { business_id: string; search?: string }) =>
      this.request<ShopSupplier[]>('/shop/suppliers', { method: 'GET', query }),
    createSupplier: (body: ShopSupplierWriteInput) =>
      this.request<ShopSupplier>('/shop/suppliers', { method: 'POST', body }),
    updateSupplier: (supplierId: string, body: Partial<ShopSupplierWriteInput>) =>
      this.request<ShopSupplier>(`/shop/suppliers/${supplierId}`, { method: 'PATCH', body }),
    deleteSupplier: (supplierId: string) =>
      this.request<{ deleted: boolean }>(`/shop/suppliers/${supplierId}`, { method: 'DELETE' }),
    listAds: (query: { business_id: string; active_only?: boolean }) =>
      this.request<ShopDashboardAd[]>('/shop/dashboard-ads', { method: 'GET', query }),
    createAd: (body: ShopDashboardAdWriteInput) =>
      this.request<ShopDashboardAd>('/shop/dashboard-ads', { method: 'POST', body }),
    updateAd: (adId: string, body: Partial<ShopDashboardAdWriteInput>) =>
      this.request<ShopDashboardAd>(`/shop/dashboard-ads/${adId}`, { method: 'PATCH', body }),
    deleteAd: (adId: string) =>
      this.request<{ deleted: boolean }>(`/shop/dashboard-ads/${adId}`, { method: 'DELETE' }),
    listCustomerReferrals: (query: { business_id: string }) =>
      this.request<CustomerReferral[]>('/shop/customer-referrals', { method: 'GET', query }),
    getMyReferralCode: (query: { business_id: string; customer_id: string }) =>
      this.request<CustomerReferralCode>('/shop/customer-referral-codes/mine', { method: 'GET', query }),
    createMyReferralCode: (body: { business_id: string; customer_id: string; code?: string }) =>
      this.request<CustomerReferralCode>('/shop/customer-referral-codes/mine', { method: 'POST', body }),
    listCashAccounts: (query: { business_id: string }) =>
      this.request<ShopCashAccount[]>('/shop/books/accounts', { method: 'GET', query }),
    createCashAccount: (body: ShopCashAccountWriteInput) =>
      this.request<ShopCashAccount>('/shop/books/accounts', { method: 'POST', body }),
    listVouchers: (query: {
      business_id: string;
      type?: ShopBooksVoucherType | string;
      status?: string;
      date_from?: string;
      date_to?: string;
      customer_id?: string;
      supplier_id?: string;
    }) => this.request<ShopBooksVoucher[]>('/shop/books/vouchers', { method: 'GET', query }),
    createVoucher: (body: ShopBooksVoucherCreateInput) =>
      this.request<ShopBooksVoucher>('/shop/books/vouchers', { method: 'POST', body }),
    getVoucher: (voucherId: string) =>
      this.request<ShopBooksVoucher>(`/shop/books/vouchers/${voucherId}`, { method: 'GET' }),
    voidVoucher: (voucherId: string) =>
      this.request<ShopBooksVoucher>(`/shop/books/vouchers/${voucherId}/void`, { method: 'POST' }),
    partyStatement: (query: { business_id: string; kind: 'customer' | 'supplier'; id: string }) =>
      this.request<ShopPartyStatement>('/shop/books/party-statement', { method: 'GET', query }),
    booksReport: (
      slug: ShopBooksReportSlug | string,
      query: { business_id: string; date_from?: string; date_to?: string },
    ) => this.request<Record<string, unknown>>(`/shop/books/reports/${slug}`, { method: 'GET', query }),
    getComplianceSettings: (query: { business_id: string }) =>
      this.request<ShopComplianceSettings>('/shop/books/compliance-settings', { method: 'GET', query }),
    updateComplianceSettings: (body: ShopComplianceSettingsUpdateInput) =>
      this.request<ShopComplianceSettings>('/shop/books/compliance-settings', { method: 'PATCH', body }),
    generateEInvoice: (voucherId: string, body?: { allow_b2c?: boolean }) =>
      this.request<ShopEInvoice>(`/shop/books/vouchers/${voucherId}/einvoice`, {
        method: 'POST',
        body: body ?? {},
      }),
    getEInvoice: (voucherId: string) =>
      this.request<ShopEInvoice>(`/shop/books/vouchers/${voucherId}/einvoice`, { method: 'GET' }),
    cancelEInvoice: (voucherId: string, body: { reason: string }) =>
      this.request<ShopEInvoice>(`/shop/books/vouchers/${voucherId}/einvoice/cancel`, {
        method: 'POST',
        body,
      }),
    generateEWay: (voucherId: string, body: ShopEWayGenerateInput) =>
      this.request<ShopEWayBill>(`/shop/books/vouchers/${voucherId}/eway`, { method: 'POST', body }),
    listEWay: (query: { business_id: string; voucher_id?: string; status?: string }) =>
      this.request<ShopEWayBill[]>('/shop/books/eway', { method: 'GET', query }),
    cancelEWay: (ewayId: string, body: { reason: string }) =>
      this.request<ShopEWayBill>(`/shop/books/eway/${ewayId}/cancel`, { method: 'POST', body }),
  };

  bookings = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Booking[]>('/bookings', { method: 'GET', query }),
    create: (body: BookingCreateInput) => this.request<Booking>('/bookings', { method: 'POST', body }),
    get: (bookingId: string) => this.request<Booking>(`/bookings/${bookingId}`, { method: 'GET' }),
    patch: (bookingId: string, body: Partial<BookingCreateInput>) => this.request<Booking>(`/bookings/${bookingId}`, { method: 'PATCH', body }),
    confirm: (bookingId: string, body?: { reason?: string }) => this.request<Booking>(`/bookings/${bookingId}/confirm`, { method: 'POST', body }),
    cancel: (bookingId: string, body?: { reason?: string }) => this.request<Booking>(`/bookings/${bookingId}/cancel`, { method: 'POST', body }),
    checkIn: (bookingId: string, body?: { reason?: string }) => this.request<Booking>(`/bookings/${bookingId}/check-in`, { method: 'POST', body }),
    complete: (bookingId: string, body?: { reason?: string }) => this.request<Booking>(`/bookings/${bookingId}/complete`, { method: 'POST', body }),
    reschedule: (bookingId: string, body: { start_at: string; reason?: string }) => this.request<Booking>(`/bookings/${bookingId}/reschedule`, { method: 'POST', body }),
    listReviews: (query?: {
      business?: string;
      customer?: string;
      booking?: string;
      rating?: number;
    }) => this.request<BookingReview[]>('/booking-reviews', { method: 'GET', query }),
    availability: (query: {
      business?: string;
      staff_id?: string;
      service_id?: string;
      date: string;
      duration_minutes?: number;
      interval_minutes?: number;
      buffer_minutes?: number | null;
    }) => this.request<AvailabilitySlot[]>(`/availability`, { method: 'GET', query }),
    staffWeeklySchedules: {
      list: (query: { staff_id: string; business?: string }) =>
        this.request<StaffWeeklySchedule[]>('/staff-weekly-schedules', { method: 'GET', query }),
      upsert: (body: StaffWeeklySchedule & { business?: string }) =>
        this.request<StaffWeeklySchedule>('/staff-weekly-schedules', { method: 'POST', body }),
      bulkUpsert: (body: StaffWeeklyScheduleBulkInput) =>
        this.request<StaffWeeklySchedule[]>('/staff-weekly-schedules/bulk', { method: 'PUT', body }),
    },
    staffLeaves: {
      list: (query: { staff_id: string; business?: string; date_from?: string; date_to?: string }) =>
        this.request<StaffLeave[]>('/staff-leaves', { method: 'GET', query }),
      create: (body: StaffLeaveInput) => this.request<StaffLeave>('/staff-leaves', { method: 'POST', body }),
      get: (leaveId: string) => this.request<StaffLeave>(`/staff-leaves/${leaveId}`, { method: 'GET' }),
      patch: (leaveId: string, body: Partial<StaffLeaveInput>) =>
        this.request<StaffLeave>(`/staff-leaves/${leaveId}`, { method: 'PATCH', body }),
      delete: (leaveId: string) => this.request<null>(`/staff-leaves/${leaveId}`, { method: 'DELETE' }),
    },
    staffSpecialAvailability: {
      list: (query: { staff_id: string; business?: string; date_from?: string; date_to?: string }) =>
        this.request<StaffSpecialAvailability[]>('/staff-special-availability', { method: 'GET', query }),
      create: (body: StaffSpecialAvailabilityInput) =>
        this.request<StaffSpecialAvailability>('/staff-special-availability', { method: 'POST', body }),
      get: (specialId: string) =>
        this.request<StaffSpecialAvailability>(`/staff-special-availability/${specialId}`, { method: 'GET' }),
      patch: (specialId: string, body: Partial<StaffSpecialAvailabilityInput>) =>
        this.request<StaffSpecialAvailability>(`/staff-special-availability/${specialId}`, {
          method: 'PATCH',
          body,
        }),
      delete: (specialId: string) =>
        this.request<null>(`/staff-special-availability/${specialId}`, { method: 'DELETE' }),
    },
    staffSlotBlocks: {
      list: (query: { staff_id: string; business?: string; date_from?: string; date_to?: string }) =>
        this.request<StaffSlotBlock[]>('/staff-slot-blocks', { method: 'GET', query }),
      create: (body: StaffSlotBlockInput) =>
        this.request<StaffSlotBlock>('/staff-slot-blocks', { method: 'POST', body }),
      get: (blockId: string) => this.request<StaffSlotBlock>(`/staff-slot-blocks/${blockId}`, { method: 'GET' }),
      patch: (blockId: string, body: Partial<StaffSlotBlockInput>) =>
        this.request<StaffSlotBlock>(`/staff-slot-blocks/${blockId}`, { method: 'PATCH', body }),
      delete: (blockId: string) => this.request<null>(`/staff-slot-blocks/${blockId}`, { method: 'DELETE' }),
    },
    staffEmergencySlots: {
      list: (query: { staff_id: string; business?: string; date_from?: string; date_to?: string }) =>
        this.request<StaffEmergencySlot[]>('/staff-emergency-slots', { method: 'GET', query }),
      create: (body: StaffEmergencySlotInput) =>
        this.request<StaffEmergencySlot>('/staff-emergency-slots', { method: 'POST', body }),
      get: (slotId: string) =>
        this.request<StaffEmergencySlot>(`/staff-emergency-slots/${slotId}`, { method: 'GET' }),
      patch: (slotId: string, body: Partial<StaffEmergencySlotInput>) =>
        this.request<StaffEmergencySlot>(`/staff-emergency-slots/${slotId}`, { method: 'PATCH', body }),
      delete: (slotId: string) =>
        this.request<null>(`/staff-emergency-slots/${slotId}`, { method: 'DELETE' }),
    },
  };

  businesses = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Business[]>('/businesses', { method: 'GET', query }),
    create: (body: BusinessCreateInput) => this.request<Business>('/businesses', { method: 'POST', body }),
    me: () => this.request<Business>('/businesses/me', { method: 'GET' }),
    get: (businessId: string) => this.request<Business>(`/businesses/${businessId}`, { method: 'GET' }),
    patch: (businessId: string, body: BusinessUpdateInput) => this.request<Business>(`/businesses/${businessId}`, { method: 'PATCH', body }),
    patchMe: (body: BusinessUpdateInput) => this.request<Business>('/businesses/me', { method: 'PATCH', body }),
    subscribeProduct: (businessId: string, body: BusinessProductSubscribeInput) =>
      this.request<Business>(`/businesses/${businessId}/product-subscriptions`, { method: 'POST', body }),
    unsubscribeProduct: (businessId: string, productCode: string) =>
      this.request<Business>(`/businesses/${businessId}/product-subscriptions/${productCode}`, { method: 'DELETE' }),
    changeProductPlan: (businessId: string, productCode: string, body: BusinessProductPlanChangeInput) =>
      this.request<Business & { billing?: BusinessBillingSnapshot }>(
        `/businesses/${businessId}/product-subscriptions/${productCode}/plan`,
        { method: 'PATCH', body },
      ),
    cancelPendingPlanChange: (businessId: string, productCode: string) =>
      this.request<Business & { billing?: BusinessBillingSnapshot }>(
        `/businesses/${businessId}/product-subscriptions/${productCode}/pending-plan`,
        { method: 'DELETE' },
      ),
    updateProductAddons: (
      businessId: string,
      productCode: string,
      body: { extra_staff: number; extra_offices: number; pets_pack_enabled?: boolean },
    ) =>
      this.request<Business & { billing?: BusinessBillingSnapshot }>(
        `/businesses/${businessId}/product-subscriptions/${productCode}/addons`,
        { method: 'PATCH', body },
      ),
    billingSnapshot: (businessId: string, query?: { product_code?: string }) =>
      this.request<BusinessBillingSnapshot>(`/businesses/${businessId}/billing`, { method: 'GET', query }),
    listProductPlans: (query?: { product_code?: string }) =>
      this.request<ProductPlan[]>('/product-plans', { method: 'GET', query }),
    branches: {
      list: (businessId: string) => this.request<Branch[]>(`/businesses/${businessId}/branches`, { method: 'GET' }),
      create: (businessId: string, body: BranchCreateInput) =>
        this.request<Branch>(`/businesses/${businessId}/branches`, { method: 'POST', body }),
      get: (businessId: string, branchId: string) =>
        this.request<Branch>(`/businesses/${businessId}/branches/${branchId}`, { method: 'GET' }),
      patch: (businessId: string, branchId: string, body: BranchUpdateInput) =>
        this.request<Branch>(`/businesses/${businessId}/branches/${branchId}`, { method: 'PATCH', body }),
    },
  };

  operations = {
    search: (query?: Record<string, string | number | boolean | undefined | null>) =>
      this.request<OperationsSearchResult>('/search', { method: 'GET', query }),
  };

  tenants = {
    checkSlug: (slug: string) =>
      this.request<TenantSlugAvailability>('/tenants/check-slug', { method: 'GET', query: { slug } }),
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<TenantSummary[]>('/tenants', { method: 'GET', query }),
    create: (body: TenantCreateInput) => this.request<TenantSummary>('/tenants', { method: 'POST', body }),
    get: (tenantId: string) => this.request<TenantSummary>(`/tenants/${tenantId}`, { method: 'GET' }),
    patch: (tenantId: string, body: Partial<TenantCreateInput>) => this.request<TenantSummary>(`/tenants/${tenantId}`, { method: 'PATCH', body }),
    getSettings: () => this.request<TenantSettingsResponse>('/tenant/settings', { method: 'GET' }),
    settings: (body: TenantSettingsPayload) => this.request<unknown>('/tenant/settings', { method: 'PATCH', body }),
  };

  customers = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Customer[]>('/customers', { method: 'GET', query }),
    create: (body: CustomerCreateInput) => this.request<Customer>('/customers', { method: 'POST', body }),
    get: (customerId: string) => this.request<Customer>(`/customers/${customerId}`, { method: 'GET' }),
    patch: (customerId: string, body: CustomerUpdateInput) => this.request<Customer>(`/customers/${customerId}`, { method: 'PATCH', body }),
    delete: (customerId: string) => this.request<null>(`/customers/${customerId}`, { method: 'DELETE' }),
    restore: (customerId: string) => this.request<Customer>(`/customers/${customerId}/restore`, { method: 'POST' }),
    getBorrowBalance: (customerId: string) =>
      this.request<CustomerBorrowBalance>(`/customers/${customerId}/borrow`, { method: 'GET' }),
    listBorrowLedger: (customerId: string) =>
      this.request<CustomerBorrowLedgerEntry[]>(`/customers/${customerId}/borrow/ledger`, { method: 'GET' }),
    recordBorrowPayment: (customerId: string, body: CustomerBorrowPaymentInput) =>
      this.request<CustomerBorrowPaymentResult>(`/customers/${customerId}/borrow/payments`, {
        method: 'POST',
        body,
      }),
  };

  services = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Service[]>('/services', { method: 'GET', query }),
    create: (body: ServiceCreateInput) => this.request<Service>('/services', { method: 'POST', body }),
    get: (serviceId: string) => this.request<Service>(`/services/${serviceId}`, { method: 'GET' }),
    patch: (serviceId: string, body: ServiceUpdateInput) => this.request<Service>(`/services/${serviceId}`, { method: 'PATCH', body }),
    categories: {
      list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown[]>('/service-categories', { method: 'GET', query }),
    },
  };

  staff = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<StaffMember[]>('/staff', { method: 'GET', query }),
    create: (body: StaffCreateInput) => this.request<StaffMember>('/staff', { method: 'POST', body }),
    get: (staffId: string) => this.request<StaffMember>(`/staff/${staffId}`, { method: 'GET' }),
    patch: (staffId: string, body: StaffUpdateInput) => this.request<StaffMember>(`/staff/${staffId}`, { method: 'PATCH', body }),
    delete: (staffId: string) => this.request<null>(`/staff/${staffId}`, { method: 'DELETE' }),
    assignments: {
      list: (query?: { staff?: string; service?: string }) =>
        this.request<StaffServiceAssignment[]>('/staff/assignments', { method: 'GET', query }),
      create: (body: StaffServiceAssignmentInput) =>
        this.request<StaffServiceAssignment>('/staff/assignments', { method: 'POST', body }),
      get: (assignmentId: string) =>
        this.request<StaffServiceAssignment>(`/staff/assignments/${assignmentId}`, { method: 'GET' }),
      patch: (assignmentId: string, body: Partial<StaffServiceAssignmentInput>) =>
        this.request<StaffServiceAssignment>(`/staff/assignments/${assignmentId}`, {
          method: 'PATCH',
          body,
        }),
      delete: (assignmentId: string) =>
        this.request<null>(`/staff/assignments/${assignmentId}`, { method: 'DELETE' }),
    },
  };

  notifications = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Notification[]>('/notifications', { method: 'GET', query }),
    markRead: (notificationId: string) => this.request<Notification>(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    readAll: () => this.request<{ updated: number }>('/notifications/read-all', { method: 'PATCH' }),
    delete: (notificationId: string) => this.request<null>(`/notifications/${notificationId}`, { method: 'DELETE' }),
  };

  analytics = {
    summary: (query?: Record<string, string | number | boolean | undefined | null>) =>
      this.request<AnalyticsSummary>('/analytics/summary', { method: 'GET', query }),
    list: (query?: Record<string, string | number | boolean | undefined | null>) =>
      this.request<AnalyticsSummary[]>('/analytics', { method: 'GET', query }),
    dashboard: {
      summary: (query?: Record<string, string | number | boolean | undefined | null>) =>
        this.request<DashboardSummary>('/dashboard/summary', { method: 'GET', query }),
    },
  };

  bi = {
    overview: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIOverviewResponse>('/bi/overview', { method: 'GET', query }),
    revenue: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIRevenueReport>('/bi/revenue', { method: 'GET', query }),
    trends: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BITrendsReport>('/bi/trends', { method: 'GET', query }),
    forecast: (query?: { horizon_days?: number }) =>
      this.request<BIForecastReport>('/bi/forecast', { method: 'GET', query }),
    growth: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIGrowthReport>('/bi/growth', { method: 'GET', query }),
    operations: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIOperationsReport>('/bi/operations', { method: 'GET', query }),
    reports: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIReportsBundle>('/bi/reports', { method: 'GET', query }),
  };

  platform = {
    tenants: () => this.request<{ tenants: PlatformTenantSummary[] }>('/platform/tenants', { method: 'GET' }),
    tenant: (tenantId: string) =>
      this.request<PlatformTenantDetail>(`/platform/tenants/${tenantId}`, { method: 'GET' }),
    updateTenant: (tenantId: string, body: { status?: string; reason?: string }) =>
      this.request<PlatformTenantDetail>(`/platform/tenants/${tenantId}`, { method: 'PATCH', body }),
    createTenant: (body: {
      display_name: string;
      business_name?: string;
      owner_email?: string;
      slug?: string;
      selected_product?: string;
      reason: string;
    }) => this.request<{ tenant_id: string; slug: string; business_id: string }>('/platform/tenants/create', { method: 'POST', body }),
    tenantAction: (tenantId: string, action: 'suspend' | 'reactivate' | 'archive', body: { reason: string }) =>
      this.request<{ id: string; status: string }>(`/platform/tenants/${tenantId}/actions/${action}`, { method: 'POST', body }),
    tenantBilling: (tenantId: string, query?: { product_code?: string; business_id?: string }) =>
      this.request<{
        tenant_id: string;
        business_id: string;
        billing: BusinessBillingSnapshot;
        billings?: BusinessBillingSnapshot[];
      }>(
        `/platform/tenants/${tenantId}/billing`,
        { method: 'GET', query },
      ),
    tenantBillingAction: (
      tenantId: string,
      body: {
        action:
          | 'change_plan'
          | 'update_addons'
          | 'clear_soft_lock'
          | 'force_soft_lock'
          | 'extend_trial'
          | 'set_complimentary'
          | string;
        reason: string;
        business_id?: string;
        days?: number;
        plan_code?: string;
        product_code?: string;
        billing_interval?: 'monthly' | 'yearly';
        extra_staff?: number;
        extra_offices?: number;
        pets_pack_enabled?: boolean;
      },
    ) => this.request<{ billing: BusinessBillingSnapshot }>(`/platform/tenants/${tenantId}/billing/actions`, { method: 'POST', body }),
    tenantUsers: (tenantId: string) =>
      this.request<{ users: PlatformUserRow[] }>(`/platform/tenants/${tenantId}/users`, { method: 'GET' }),
    tenantFlags: (tenantId: string) =>
      this.request<{ flags: PlatformFeatureFlag[] }>(`/platform/tenants/${tenantId}/flags`, { method: 'GET' }),
    updateTenantFlags: (tenantId: string, body: { flags: Record<string, boolean>; reason: string }) =>
      this.request<{ flags: PlatformFeatureFlag[] }>(`/platform/tenants/${tenantId}/flags`, { method: 'PATCH', body }),
    tenantPayments: (tenantId: string) =>
      this.request<{ payments: PlatformPaymentRow[] }>(`/platform/tenants/${tenantId}/payments`, { method: 'GET' }),
    upiClaims: (query?: { limit?: number }) =>
      this.request<{ claims: PlatformPaymentRow[] }>('/platform/upi-claims', { method: 'GET', query }),
    refundPayment: (tenantId: string, paymentId: string, body: { reason: string; amount_paise?: number }) =>
      this.request<Record<string, unknown>>(`/platform/tenants/${tenantId}/payments/${paymentId}/refund`, {
        method: 'POST',
        body,
      }),
    confirmTenantUpiClaim: (
      tenantId: string,
      paymentId: string,
      body: { action: 'confirm' | 'reject'; reason: string },
    ) =>
      this.request<{ session_id: string; status: string; payment_status?: string }>(
        `/platform/tenants/${tenantId}/payments/${paymentId}/confirm`,
        { method: 'POST', body },
      ),
    tenantCredits: (tenantId: string) =>
      this.request<{ balance_paise: number }>(`/platform/tenants/${tenantId}/credits`, { method: 'GET' }),
    grantCredit: (tenantId: string, body: { amount_paise: number; reason: string }) =>
      this.request<Record<string, unknown>>(`/platform/tenants/${tenantId}/credits`, { method: 'POST', body }),
    impersonate: (tenantId: string, body: { reason: string; user_id?: string }) =>
      this.request<{
        access: string;
        refresh: string;
        token_type: string;
        expires_in: number;
        impersonator_id: string;
        acting_as: UserProfile;
      }>(`/platform/tenants/${tenantId}/impersonate`, { method: 'POST', body }),
    endImpersonation: () =>
      this.request<{
        access: string;
        refresh: string;
        token_type: string;
        expires_in: number;
        user: UserProfile;
      }>('/platform/impersonation/end', { method: 'POST' }),
    transferOwnership: (tenantId: string, body: { user_id: string; reason: string }) =>
      this.request<{ tenant_id: string; owner_id: string }>(`/platform/tenants/${tenantId}/transfer-ownership`, {
        method: 'POST',
        body,
      }),
    purgeTenant: (tenantId: string, body: { confirm_slug: string; reason: string }) =>
      this.request<{ tenant_id: string; status: string; purged: boolean }>(`/platform/tenants/${tenantId}/purge`, {
        method: 'POST',
        body,
      }),
    searchUsers: (params: PlatformUserSearchParams | string = {}) =>
      this.request<PlatformUserSearchResult>('/platform/users/search', {
        method: 'GET',
        query: typeof params === 'string' ? { q: params } : { ...params },
      }),
    userAction: (userId: string, action: 'disable' | 'enable' | 'reset_password', body: { reason: string }) =>
      this.request<Record<string, unknown>>(`/platform/users/${userId}/actions/${action}`, { method: 'POST', body }),
    audit: (query?: PlatformAuditQuery) =>
      this.request<PlatformAuditResult>('/platform/audit', { method: 'GET', query }),
    exportCsv: (exportType: 'tenants' | 'audit' | 'payments', query?: PlatformAuditQuery) =>
      this.request<string>(`/platform/exports/${exportType}`, { method: 'GET', query }),
    coupons: () =>
      this.request<{
        coupons: Array<{
          id: string;
          code: string;
          percent_off?: number | null;
          amount_off_paise?: number | null;
          is_active: boolean;
          redemption_count: number;
        }>;
      }>('/platform/coupons', { method: 'GET' }),
    upsertCoupon: (body: {
      code: string;
      percent_off?: number;
      amount_off_paise?: number;
      is_active?: boolean;
      reason: string;
    }) => this.request<{ id: string; code: string }>('/platform/coupons', { method: 'POST', body }),
    affiliates: () =>
      this.request<{ affiliates: PlatformAffiliate[]; insights: PlatformAffiliateInsights }>(
        '/platform/affiliates',
        { method: 'GET' },
      ),
    affiliate: (affiliateId: string) =>
      this.request<PlatformAffiliateDetail>(`/platform/affiliates/${affiliateId}`, { method: 'GET' }),
    upsertAffiliate: (body: {
      id?: string;
      affiliate_type?: 'tenant' | 'partner' | string;
      type?: 'tenant' | 'partner' | string;
      tenant_id?: string | null;
      name: string;
      email: string;
      status?: string;
      payout_method?: 'upi' | 'bank' | 'other' | string;
      upi_vpa?: string;
      bank_account_name?: string;
      bank_account_number?: string;
      bank_ifsc?: string;
      payout_notes?: string;
      default_commission_paise?: number;
      commission_trigger?: 'first_payment' | 'every_payment' | 'none' | string;
      commission_type?: 'flat' | 'percent' | string;
      commission_percent?: number;
      metadata?: Record<string, unknown>;
      reason: string;
    }) => this.request<PlatformAffiliate>('/platform/affiliates', { method: 'POST', body }),
    deleteAffiliate: (affiliateId: string, body?: { reason?: string }) =>
      this.request<{ deleted: boolean }>(`/platform/affiliates/${affiliateId}`, {
        method: 'DELETE',
        body: body ?? { reason: 'delete affiliate' },
      }),
    affiliateCodes: (query?: { affiliate_id?: string }) =>
      this.request<{ codes: PlatformAffiliateCode[] }>('/platform/affiliate-codes', {
        method: 'GET',
        query,
      }),
    upsertAffiliateCode: (body: {
      affiliate_id: string;
      code: string;
      is_active?: boolean;
      reason: string;
    }) => this.request<PlatformAffiliateCode>('/platform/affiliate-codes', { method: 'POST', body }),
    deleteAffiliateCode: (codeId: string, body?: { reason?: string }) =>
      this.request<{ deleted: boolean }>(`/platform/affiliate-codes/${codeId}`, {
        method: 'DELETE',
        body: body ?? { reason: 'delete affiliate code' },
      }),
    affiliateReferrals: (query?: { affiliate_id?: string }) =>
      this.request<{ referrals: PlatformAffiliateReferral[] }>('/platform/affiliate-referrals', {
        method: 'GET',
        query,
      }),
    affiliateAccruals: (query?: { referral_id?: string }) =>
      this.request<{ accruals: PlatformAffiliateAccrual[] }>('/platform/affiliate-accruals', {
        method: 'GET',
        query,
      }),
    createAffiliateAccrual: (body: {
      referral_id: string;
      period_yyyy_mm: string;
      amount_paise: number;
      benefit_type?: 'credit' | 'payout' | string;
      reason: string;
    }) => this.request<PlatformAffiliateAccrual>('/platform/affiliate-accruals', { method: 'POST', body }),
    approveAffiliateAccrualCredit: (accrualId: string, body: { reason: string }) =>
      this.request<PlatformAffiliateAccrual>(`/platform/affiliate-accruals/${accrualId}/credit`, {
        method: 'POST',
        body,
      }),
    approveAffiliateAccrualPayout: (
      accrualId: string,
      body: { reason: string; payment_ref?: string; notes?: string },
    ) =>
      this.request<PlatformAffiliatePayout>(`/platform/affiliate-accruals/${accrualId}/payout`, {
        method: 'POST',
        body,
      }),
    affiliatePayouts: (query?: { affiliate_id?: string }) =>
      this.request<{ payouts: PlatformAffiliatePayout[] }>('/platform/affiliate-payouts', {
        method: 'GET',
        query,
      }),
    markAffiliatePayoutPaid: (payoutId: string, body: { reason: string; payment_ref?: string }) =>
      this.request<PlatformAffiliatePayout>(`/platform/affiliate-payouts/${payoutId}/mark-paid`, {
        method: 'POST',
        body,
      }),
    affiliateLedger: (query?: { affiliate_id?: string; referral_id?: string; kind?: string }) =>
      this.request<{ entries: PlatformAffiliateLedgerEntry[] }>('/platform/affiliate-ledger', {
        method: 'GET',
        query,
      }),
    createAffiliateLedgerEntry: (body: {
      affiliate_id: string;
      referral_id?: string | null;
      kind: 'earning' | 'payment' | 'credit' | string;
      amount_paise: number;
      period_yyyy_mm?: string;
      payment_ref?: string;
      notes?: string;
      reason: string;
      metadata?: Record<string, unknown>;
    }) => this.request<PlatformAffiliateLedgerEntry>('/platform/affiliate-ledger', { method: 'POST', body }),
    voidAffiliateLedgerEntry: (entryId: string, body: { reason: string }) =>
      this.request<PlatformAffiliateLedgerEntry>(`/platform/affiliate-ledger/${entryId}/void`, {
        method: 'POST',
        body,
      }),
    planPackages: (query?: { product_code?: string }) =>
      this.request<{ plan_packages: PlatformPlanPackage[] }>('/platform/plan-packages', {
        method: 'GET',
        query,
      }),
    upsertPlanPackage: (body: PlatformPlanPackageUpsertInput) =>
      this.request<{ id: string; code: string; product_code: string }>('/platform/plan-packages', {
        method: 'POST',
        body,
      }),
    addonPricing: () =>
      this.request<PlatformAddonPricing>('/platform/addon-pricing', { method: 'GET' }),
    updateAddonPricing: (body: {
      staff_price_paise: number;
      office_price_paise: number;
      pets_price_paise: number;
      reason: string;
    }) => this.request<PlatformAddonPricing>('/platform/addon-pricing', { method: 'PUT', body }),
    tickets: (query?: { tenant_id?: string }) =>
      this.request<{ tickets: SupportTicketSummary[] }>('/platform/tickets', { method: 'GET', query }),
    ticket: (ticketId: string) =>
      this.request<SupportTicketDetail>(`/platform/tickets/${ticketId}`, { method: 'GET' }),
    updateTicket: (
      ticketId: string,
      body: { status?: string; assignee_id?: string | null; assign_to_me?: boolean; reason?: string },
    ) => this.request<SupportTicketSummary>(`/platform/tickets/${ticketId}`, { method: 'PATCH', body }),
    createTicket: (body: { tenant_id: string; subject: string; body?: string }) =>
      this.request<{ id: string }>('/platform/tickets', { method: 'POST', body }),
    addTicketNote: (ticketId: string, body: { body: string; is_internal?: boolean; status?: string }) =>
      this.request<{ id: string; status?: string }>(`/platform/tickets/${ticketId}/notes`, { method: 'POST', body }),
    announcements: () => this.request<{ announcements: PlatformAnnouncement[] }>('/platform/announcements', { method: 'GET' }),
    createAnnouncement: (body: {
      title: string;
      message: string;
      severity?: string;
      is_active?: boolean;
      reason?: string;
    }) => this.request<{ id: string }>('/platform/announcements', { method: 'POST', body }),
    helpArticlesAdmin: () => this.request<{ articles: HelpArticleSummary[] }>('/platform/help/articles', { method: 'GET' }),
    upsertHelpArticle: (body: {
      id?: string;
      title: string;
      slug?: string;
      category?: string;
      body?: string;
      is_published?: boolean;
      keywords?: string;
    }) => this.request<{ id: string; slug: string; is_published?: boolean }>('/platform/help/articles', { method: 'POST', body }),
    whiteLabelProfiles: () => this.request<WhiteLabelProfile[]>('/platform/white-label', { method: 'GET' }),
    whiteLabelProfile: (businessId: string) =>
      this.request<MobileBootstrapResponse>(`/platform/white-label/${businessId}`, { method: 'GET' }),
    updateWhiteLabelProfile: (businessId: string, body: Partial<WhiteLabelProfile>) =>
      this.request<MobileBootstrapResponse>(`/platform/white-label/${businessId}`, { method: 'PATCH', body }),
  };

  help = {
    articles: (query?: { q?: string; slug?: string }) =>
      this.request<{ articles?: HelpArticleSummary[] } & Partial<HelpArticleSummary>>('/help/articles', {
        method: 'GET',
        query,
      }),
    activeAnnouncements: () =>
      this.request<{ announcements: PlatformAnnouncement[] }>('/platform/announcements/active', { method: 'GET' }),
  };

  support = {
    tickets: () => this.request<{ tickets: SupportTicketSummary[] }>('/support/tickets', { method: 'GET' }),
    createTicket: (body: { subject: string; body?: string; tenant_id?: string }) =>
      this.request<{ id: string; status: string }>('/support/tickets', { method: 'POST', body }),
  };

  billing = {
    status: () => this.request<BillingStatus>('/billing/status', { method: 'GET' }),
    plans: () => this.request<BillingPlanCatalogItem[]>('/billing/plans', { method: 'GET' }),
    publicPlans: (query?: { product_code?: string }) =>
      this.request<{
        trial_days: number;
        addon_staff_price_paise: number;
        addon_office_price_paise: number;
        addon_pets_price_paise: number;
        plans: BillingPlanCatalogItem[];
      }>('/billing/public-plans', { method: 'GET', query, auth: false }),
    goLiveCheck: () => this.request<BillingGoLiveReport>('/billing/go-live-check', { method: 'GET' }),
    observability: (query?: { window_hours?: number }) =>
      this.request<BillingObservabilitySignals>('/billing/observability', { method: 'GET', query }),
    opsSnapshot: (query?: { window_hours?: number }) =>
      this.request<BillingOpsSnapshot>('/billing/ops-snapshot', { method: 'GET', query }),
    opsDigest: (query?: { window_hours?: number }) =>
      this.request<BillingOpsDigest>('/billing/ops-digest', { method: 'GET', query }),
    platformOpsSummary: (query?: { window_hours?: number; limit?: number }) =>
      this.request<BillingPlatformOpsSummary>('/billing/platform-ops-summary', { method: 'GET', query }),
    platformSubscriptions: () =>
      this.request<BillingPlatformSubscriptions>('/billing/platform-subscriptions', { method: 'GET' }),
    platformRevenue: () =>
      this.request<BillingPlatformRevenue>('/billing/platform-revenue', { method: 'GET' }),
    platformMonitoring: (query?: { window_hours?: number }) =>
      this.request<BillingPlatformMonitoring>('/billing/platform-monitoring', { method: 'GET', query }),
    platformWebhookEvents: (query?: {
      window_hours?: number;
      status?: string;
      q?: string;
      tenant_id?: string;
      provider?: string;
      event_type?: string;
      limit?: number;
      offset?: number;
    }) =>
      this.request<{
        window_hours: number;
        count: number;
        total: number;
        limit: number;
        offset: number;
        providers: string[];
        event_types: string[];
        events: BillingWebhookEvent[];
      }>(
        '/billing/platform-webhook-events',
        { method: 'GET', query },
      ),
    platformReprocessWebhookEvent: (eventId: string, body?: { reason?: string }) =>
      this.request<BillingWebhookReprocessResult>(`/billing/platform-webhook-events/${eventId}/reprocess`, {
        method: 'POST',
        body,
      }),
    platformReprocessWebhookEventsBulk: (body: BillingWebhookBulkReprocessInput) =>
      this.request<BillingWebhookBulkReprocessResult>('/billing/platform-webhook-events/reprocess-bulk', {
        method: 'POST',
        body,
      }),
    platformAuditFeed: (query?: { limit?: number }) =>
      this.request<BillingPlatformAuditFeed>('/billing/platform-audit-feed', { method: 'GET', query }),
    releaseGate: () => this.request<BillingReleaseGateReport>('/billing/release-gate', { method: 'GET' }),
    runReconciliation: (body?: { lookback_hours?: number }) =>
      this.request<BillingReconciliationResult>('/billing/reconciliation/run', { method: 'POST', body }),
    checkout: (body: BillingCheckoutInput) => this.request<BillingCheckoutSession>('/billing/checkout', { method: 'POST', body }),
    createUpiCheckout: (body: {
      product_code: string;
      plan_code: string;
      business_id?: string;
      amount_paise?: number;
      extra_staff?: number;
      extra_offices?: number;
      pets_pack_enabled?: boolean;
    }) =>
      this.request<{
        session_id: string;
        order_id: string;
        amount: number;
        currency: string;
        product_code: string;
        plan_code: string;
        upi_vpa: string;
        upi_pay_url: string;
        payment_qr_url?: string;
        payment_status: string;
        expires_at: string;
      }>('/billing/checkout/upi', { method: 'POST', body }),
    claimUpiCheckout: (
      sessionId: string,
      body: { upi_utr: string; payment_proof_url?: string; business_id?: string },
    ) =>
      this.request<{ session_id: string; payment_status?: string; upi_utr?: string }>(
        `/billing/checkout/upi/${sessionId}/claim`,
        { method: 'POST', body },
      ),
    confirmUpiCheckout: (sessionId: string, body: { action: 'confirm' | 'reject' | string; note?: string }) =>
      this.request<{ session_id: string; status: string; payment_status?: string }>(
        `/billing/checkout/upi/${sessionId}/confirm`,
        { method: 'POST', body },
      ),
    webhookSummary: (query?: { window_hours?: number }) =>
      this.request<BillingWebhookSummary>('/billing/webhooks/summary', { method: 'GET', query }),
    webhookEvents: (
      query?: {
        status?: 'received' | 'processed' | 'failed' | 'ignored' | 'dead_letter';
        exhausted?: boolean;
      },
    ) =>
      this.request<BillingWebhookEvent[]>('/billing/webhooks/events', { method: 'GET', query }),
    reprocessWebhookEvent: (eventId: string) =>
      this.request<BillingWebhookReprocessResult>(`/billing/webhooks/events/${eventId}/reprocess`, {
        method: 'POST',
      }),
    reprocessWebhookEventsBulk: (body: BillingWebhookBulkReprocessInput) =>
      this.request<BillingWebhookBulkReprocessResult>('/billing/webhooks/reprocess-bulk', {
        method: 'POST',
        body,
      }),
  };

  mobile = {
    bootstrap: (query: {
      flavor_key?: string;
      app_slug?: string;
      tenant_slug?: string;
      business_code?: string;
    }) => this.request<MobileBootstrapResponse>('/mobile/bootstrap', { method: 'GET', query, auth: false }),
    discoverServices: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileDiscoverResponse>('/mobile/discover/services', { method: 'GET', query }),
    branches: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileBranch[]>('/mobile/branches', { method: 'GET', query }),
    getService: (serviceId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileDiscoverServiceDetail>(`/mobile/discover/services/${serviceId}`, {
        method: 'GET',
        query,
      }),
    listStaff: (query: { tenant_slug: string; business_code: string; service_id?: string }) =>
      this.request<MobileStaffMember[]>('/mobile/staff', { method: 'GET', query }),
    availability: (query: {
      tenant_slug: string;
      business_code: string;
      date: string;
      duration_minutes?: number;
      interval_minutes?: number;
      buffer_minutes?: number;
      staff_id?: string | null;
      service_id?: string | null;
    }) => this.request<MobileAvailabilityResponse>('/mobile/availability', { method: 'GET', query }),
    requestBooking: (body: MobileBookingRequestInput) =>
      this.request<MobileBookingRequestResponse>('/mobile/bookings/request', { method: 'POST', body }),
    listBookings: (query: {
      tenant_slug: string;
      business_code: string;
      upcoming?: boolean;
      status?: string;
    }) => this.request<MobileBooking[]>('/mobile/bookings', { method: 'GET', query }),
    getBooking: (bookingId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileBooking>(`/mobile/bookings/${bookingId}`, { method: 'GET', query }),
    cancelBooking: (
      bookingId: string,
      body: { tenant_slug: string; business_code: string; reason?: string },
    ) => this.request<MobileBooking>(`/mobile/bookings/${bookingId}/cancel`, { method: 'POST', body }),
    rescheduleBooking: (
      bookingId: string,
      body: { tenant_slug: string; business_code: string; start_at: string; reason?: string },
    ) => this.request<MobileBooking>(`/mobile/bookings/${bookingId}/reschedule`, { method: 'POST', body }),
    registerCustomer: (body: {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      phone_number?: string;
    }) => this.request<UserProfile>('/mobile/auth/register', { method: 'POST', body, auth: false }),
    getCustomerProfile: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileCustomerProfile>('/mobile/customer/profile', { method: 'GET', query }),
    updateCustomerProfile: (
      body: {
        full_address?: string;
        line1?: string;
        city?: string;
        state?: string;
        country?: string;
        postal_code?: string;
        latitude?: number | null;
        longitude?: number | null;
      },
      query: { tenant_slug: string; business_code: string },
    ) => this.request<MobileCustomerProfile>('/mobile/customer/profile', { method: 'PATCH', body, query }),
    listMyReviews: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileReview[]>('/mobile/reviews/mine', { method: 'GET', query }),
    createReview: (
      bookingId: string,
      body: { tenant_slug: string; business_code: string; rating: number; comment?: string },
    ) =>
      this.request<MobileReview>(`/mobile/bookings/${bookingId}/reviews`, { method: 'POST', body }),
    getLoyalty: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileLoyaltyBalance>('/mobile/loyalty', { method: 'GET', query }),
    quoteLoyalty: (body: {
      tenant_slug: string;
      business_code: string;
      service_id?: string;
      amount?: string | number;
      points_to_redeem: number;
    }) => this.request<MobileLoyaltyQuote>('/mobile/loyalty/quote', { method: 'POST', body }),
    registerDevice: (body: {
      tenant_slug: string;
      business_code: string;
      expo_push_token: string;
      platform?: string;
      app_flavor?: string;
    }) => this.request<MobileDeviceRegistration>('/mobile/devices/register', { method: 'POST', body }),
    unregisterDevice: (body: {
      tenant_slug: string;
      business_code: string;
      expo_push_token: string;
    }) => this.request<{ unregistered: number }>('/mobile/devices/unregister', { method: 'POST', body }),
    listNotifications: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileNotificationItem[]>('/mobile/notifications', { method: 'GET', query }),
    markNotificationRead: (notificationId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileNotificationItem>(`/mobile/notifications/${notificationId}/read`, { method: 'PATCH', query }),
    readAllNotifications: (query: { tenant_slug: string; business_code: string }) =>
      this.request<{ updated: number }>('/mobile/notifications/read-all', { method: 'PATCH', query }),
    listShopAds: (query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopDashboardAd[]>('/mobile/shop/ads', { method: 'GET', query, auth: false }),
    listShopProducts: (query: {
      tenant_slug: string;
      business_code: string;
      search?: string;
      category?: string;
    }) => this.request<ShopProduct[]>('/mobile/shop/products', { method: 'GET', query, auth: false }),
    getShopProduct: (productId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopProduct>(`/mobile/shop/products/${productId}`, { method: 'GET', query }),
    listShopProductReviews: (productId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopProductReview[]>(`/mobile/shop/products/${productId}/reviews`, {
        method: 'GET',
        query,
        auth: false,
      }),
    createShopProductReview: (
      productId: string,
      body: {
        tenant_slug: string;
        business_code: string;
        rating: number;
        title?: string;
        comment?: string;
      },
    ) =>
      this.request<ShopProductReview>(`/mobile/shop/products/${productId}/reviews`, { method: 'POST', body }),
    updateShopProductReview: (
      productId: string,
      body: {
        tenant_slug: string;
        business_code: string;
        rating: number;
        title?: string;
        comment?: string;
      },
    ) =>
      this.request<ShopProductReview>(`/mobile/shop/products/${productId}/reviews`, { method: 'PATCH', body }),
    listShopOrders: (query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopOrder[]>('/mobile/shop/orders', { method: 'GET', query }),
    createShopOrder: (body: {
      tenant_slug: string;
      business_code: string;
      fulfillment_mode?: string;
      notes?: string;
      preferred_date?: string;
      preferred_time?: string;
      fulfillment_note?: string;
      delivery_address?: string;
      delivery_city?: string;
      delivery_state?: string;
      delivery_postal_code?: string;
      delivery_latitude?: string | number | null;
      delivery_longitude?: string | number | null;
      delivery_method?: 'standard' | 'instant';
      delivery_quote_id?: string;
      displayed_delivery_fee?: string | number | null;
      payment_method?: string;
      coupon_code?: string;
      points_to_redeem?: number;
      lines: Array<{ product_id: string; quantity?: string | number; barcode_scanned?: string }>;
    }) => this.request<ShopOrder>('/mobile/shop/orders', { method: 'POST', body }),
    validateShopCoupon: (body: {
      tenant_slug: string;
      business_code: string;
      code: string;
      fulfillment_mode?: string;
      lines: Array<{ product_id: string; quantity?: string | number }>;
    }) => this.request<ShopCouponPreview>('/mobile/shop/coupons/validate', { method: 'POST', body }),
    listAvailableShopCoupons: (body: {
      tenant_slug: string;
      business_code: string;
      fulfillment_mode?: string;
      lines: Array<{ product_id: string; quantity?: string | number; unit_price?: string | number }>;
    }) => this.request<ShopCouponOffer[]>('/mobile/shop/coupons/available', { method: 'POST', body }),
    getAvailableShopCoupons: (query: {
      tenant_slug: string;
      business_code: string;
      fulfillment_mode?: string;
    }) => this.request<ShopCouponOffer[]>('/mobile/shop/coupons/available', { method: 'GET', query }),
    getShopOrder: (orderId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopOrder>(`/mobile/shop/orders/${orderId}`, { method: 'GET', query }),
    getShopOrderDeliveryLive: (
      orderId: string,
      query: { tenant_slug: string; business_code: string; refresh?: boolean },
    ) => this.request<ShopDeliveryLive>(`/mobile/shop/orders/${orderId}/delivery-live`, { method: 'GET', query }),
    cancelShopOrder: (orderId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopOrder>(`/mobile/shop/orders/${orderId}/cancel`, { method: 'POST', query }),
    claimShopPayment: (
      orderId: string,
      body: { tenant_slug: string; business_code: string; upi_utr: string; payment_proof_url?: string },
    ) => this.request<ShopOrder>(`/mobile/shop/orders/${orderId}/claim-payment`, { method: 'POST', body }),
    matchDeliveryZone: (query: {
      tenant_slug: string;
      business_code: string;
      city?: string;
      postal_code?: string;
    }) =>
      this.request<{
        matched: boolean;
        zone: null | {
          id: string;
          name: string;
          fee: string;
          min_order_total: string;
          same_day: boolean;
        };
      }>('/mobile/shop/delivery-zones/match', { method: 'GET', query, auth: false }),
    quoteShopDelivery: (body: {
      tenant_slug: string;
      business_code: string;
      latitude: string | number;
      longitude: string | number;
      address?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      subtotal: string | number;
      lines?: Array<{ product_id: string; quantity: string | number }>;
    }) => this.request<ShopDeliveryQuote>('/mobile/shop/delivery/quote', { method: 'POST', body }),
    listMyPets: (query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopPet[]>('/mobile/shop/pets', { method: 'GET', query }),
    createMyPet: (
      body: {
        tenant_slug: string;
        business_code: string;
        name: string;
        species?: string;
        breed?: string;
        sex?: string;
        birthday?: string | null;
        photo_url?: string;
        medical_notes?: string;
      },
    ) => this.request<ShopPet>('/mobile/shop/pets', { method: 'POST', body }),
    getMyPet: (petId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopPet>(`/mobile/shop/pets/${petId}`, { method: 'GET', query }),
    patchMyPet: (
      petId: string,
      body: {
        name?: string;
        species?: string;
        breed?: string;
        sex?: string;
        birthday?: string | null;
        photo_url?: string;
        medical_notes?: string;
      },
      query: { tenant_slug: string; business_code: string },
    ) => this.request<ShopPet>(`/mobile/shop/pets/${petId}`, { method: 'PATCH', body, query }),
    listMyReturns: (query: { tenant_slug: string; business_code: string; order_id?: string }) =>
      this.request<ShopReturn[]>('/mobile/shop/returns', { method: 'GET', query }),
    createMyReturn: (body: {
      tenant_slug: string;
      business_code: string;
      order_id: string;
      reason?: string;
      lines: Array<{ order_line_id: string; quantity: string | number }>;
    }) => this.request<ShopReturn>('/mobile/shop/returns', { method: 'POST', body }),
    getMyReturn: (returnId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<ShopReturn>(`/mobile/shop/returns/${returnId}`, { method: 'GET', query }),
    listAddresses: (query: { tenant_slug: string; business_code: string }) =>
      this.request<CustomerAddress[]>('/mobile/customer/addresses', { method: 'GET', query }),
    createAddress: (body: Record<string, unknown> & { tenant_slug: string; business_code: string }) =>
      this.request<CustomerAddress>('/mobile/customer/addresses', { method: 'POST', body }),
    updateAddress: (
      addressId: string,
      body: Record<string, unknown>,
      query: { tenant_slug: string; business_code: string },
    ) => this.request<CustomerAddress>(`/mobile/customer/addresses/${addressId}`, { method: 'PATCH', body, query }),
    deleteAddress: (addressId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<{ deleted: boolean }>(`/mobile/customer/addresses/${addressId}`, { method: 'DELETE', query }),
  };

  iam = {
    roles: () => this.request<IamRole[]>('/auth/iam/roles', { method: 'GET' }),
    permissions: () => this.request<IamPermission[]>('/auth/iam/permissions', { method: 'GET' }),
    members: () => this.request<TenantMember[]>('/auth/iam/members', { method: 'GET' }),
    assignRole: (userId: string, body: { role_code: string }) =>
      this.request<{ user_id: string; role_code: string }>(`/auth/iam/members/${userId}/roles`, { method: 'POST', body }),
    removeRole: (userId: string, roleCode: string) =>
      this.request<{ user_id: string; role_code: string; removed: boolean }>(
        `/auth/iam/members/${userId}/roles/${roleCode}`,
        { method: 'DELETE' },
      ),
  };

  invitations = {
    list: (businessId: string) => this.request<StaffInvitation[]>(`/businesses/${businessId}/invitations`, { method: 'GET' }),
    create: (businessId: string, body: StaffInvitationCreateInput) =>
      this.request<StaffInvitation>(`/businesses/${businessId}/invitations`, { method: 'POST', body }),
    revoke: (businessId: string, invitationId: string) =>
      this.request<StaffInvitation>(`/businesses/${businessId}/invitations/${invitationId}`, { method: 'DELETE' }),
    accept: (body: AcceptInvitationInput) =>
      this.request<{ invitation_id: string; user_id: string; staff_id: string; email: string; created_user: boolean }>(
        '/auth/accept-invitation',
        { method: 'POST', body, auth: false },
      ),
  };

  health = {
    getHealth: () => this.request<{ status: string }>('/health', { method: 'GET' }),
    getLiveness: () => this.request<{ status: string }>('/liveness', { method: 'GET' }),
    getReadiness: () => this.request<{ status: string }>('/readiness', { method: 'GET' }),
  };

  places = {
    autocomplete: (body: {
      input: string;
      session_token: string;
      latitude?: number;
      longitude?: number;
      country_code?: string;
      language_code?: string;
    }) =>
      this.request<{
        predictions: Array<{
          place_id: string;
          description: string;
          main_text: string;
          secondary_text?: string;
          types?: string[];
        }>;
      }>(
        '/places/autocomplete',
        { method: 'POST', body },
      ),
    details: (query: { place_id: string; session_token: string; language_code?: string }) =>
      this.request<{
        formatted_address: string;
        line1: string;
        display_name?: string | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
        postal_code?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }>('/places/details', { method: 'GET', query }),
    reverse: (query: { latitude: number; longitude: number; language_code?: string }) =>
      this.request<{
        formatted_address: string;
        line1: string;
        display_name?: string | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
        postal_code?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }>('/places/reverse', { method: 'GET', query }),
  };

  private async request<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
    const url = this.buildUrl(path, options.query);
    const headers = new Headers(this.defaultHeaders);
    headers.set('Accept', 'application/json');
    headers.set('Content-Type', 'application/json');
    if (options.auth !== false && this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body,
    });

    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const errorPayload = this.asErrorPayload(payload);
      throw new ApiClientError(errorPayload, response.status);
    }

    if (payload && typeof payload === 'object' && 'data' in payload && 'meta' in payload) {
      return payload as ApiEnvelope<T>;
    }

    return {
      data: payload as T,
      meta: {},
    };
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | null | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const cleanBaseUrl = this.resolveBaseUrl().replace(/\/$/, '');

    let url: URL;
    if (/^https?:\/\//i.test(cleanBaseUrl)) {
      url = new URL(`${cleanBaseUrl}${cleanPath}`);
    } else if (typeof window !== 'undefined' && window.location?.origin) {
      url = new URL(`${cleanBaseUrl}${cleanPath}`, window.location.origin);
    } else {
      url = new URL(`${cleanBaseUrl}${cleanPath}`, 'http://localhost');
    }

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  private asErrorPayload(payload: unknown): ApiErrorPayload {
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload as { error?: { code?: unknown; message?: unknown; details?: unknown } };
      return {
        error: {
          code: typeof error.error?.code === 'string' ? error.error.code : 'REQUEST_FAILED',
          message: typeof error.error?.message === 'string' ? error.error.message : 'Request failed.',
          details: error.error?.details,
        },
      };
    }
    return {
      error: {
        code: 'REQUEST_FAILED',
        message: typeof payload === 'string' ? payload : 'Request failed.',
      },
    };
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

export type IEPlatformClient = ReturnType<typeof createApiClient>;

export {
  consumeNotificationStream,
  subscribeToNotificationStream,
  type NotificationStreamConfig,
  type NotificationStreamEvent,
  type NotificationStreamSubscription,
} from './notificationStream';
