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

export type Booking = {
  id: string;
  tenant?: string;
  business?: string;
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
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
};

export type BookingCreateInput = {
  business?: string;
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
  status: 'trialing' | 'active' | 'canceled';
  plan_code?: string | null;
  plan_name?: string | null;
  billing_interval?: 'monthly' | 'yearly' | null;
  subscribed_at?: string;
  trial_ends_at?: string | null;
  canceled_at?: string | null;
  current_period_starts_at?: string | null;
  current_period_ends_at?: string | null;
  external_billing_reference?: string | null;
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
};

export type BusinessProductSubscribeInput = {
  product_code: string;
  plan_code?: string;
  set_active?: boolean;
};

export type BusinessProductPlanChangeInput = {
  plan_code: string;
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
  amount_paise?: number | null;
  currency: string;
};

export type BillingWebhookEvent = {
  id: string;
  tenant_id?: string | null;
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

export type BillingPlatformMonitoring = {
  window_hours: number;
  failed_events: number;
  dead_letter_events: number;
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
  notification_type?: string;
};

export type MobileCustomerProfile = {
  id: string;
  display_name: string;
  email?: string;
  phone_number?: string;
  address?: CustomerAddress | null;
};

export type MobileAvailabilityResponse = {
  slots: Array<{
    start_at: string;
    end_at: string;
    staff_id?: string | null;
    capacity: number;
  }>;
};

export type MobileBookingRequestInput = {
  tenant_slug: string;
  business_code: string;
  service_id: string;
  staff_id?: string | null;
  start_at: string;
  duration_minutes: number;
  customer_name?: string;
  phone_number?: string;
  email?: string;
  notes?: string;
};

export type MobileBookingRequestResponse = {
  booking_id: string;
  booking_number: string;
  status: string;
};

export type MobileBooking = {
  id: string;
  booking_number: string;
  status: string;
  service_id: string;
  service_name: string;
  staff_id?: string | null;
  staff_name?: string;
  appointment_date: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  notes?: string;
  created_at: string;
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
  };
  branding: MobileBootstrapBranding;
  enabled_products: string[];
  features: Record<string, boolean>;
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

export type PlatformTenantSummary = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  business_count: number;
  primary_color: string;
  created_at: string;
};

export type PlatformTenantDetail = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  businesses: Array<{
    id: string;
    business_code: string;
    display_name: string;
    status: string;
    selected_product?: string;
    has_white_label_profile: boolean;
    flavor_key?: string | null;
  }>;
};

export type AnalyticsSummary = {
  bookings: number;
  completed: number;
  cancelled: number;
  pending?: number;
  completion_rate?: number;
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BIRevenueReport = {
  estimated_revenue: number;
  currency: string;
  by_service: Array<{ service_id: string; service_name: string; revenue: number }>;
  period?: { start_date?: string | null; end_date?: string | null };
};

export type BITrendsReport = {
  rows: Array<{ day: string; total: number; completed: number; cancelled: number }>;
  period: { start_date: string; end_date: string };
};

export type BIForecastReport = {
  horizon_days: number;
  projected_bookings: number;
  projected_revenue: number;
  currency: string;
  based_on_days: number;
};

export type BIReportsBundle = {
  summary: AnalyticsSummary;
  revenue: BIRevenueReport;
  trends: BITrendsReport;
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
  status?: string;
  currency?: string | null;
  timezone?: string | null;
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
  primary_contact?: string;
  website?: string;
  selected_product?: string;
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
  >
> & {
  industry_category?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  address_line1?: string;
  primary_contact?: string;
  website?: string;
  language?: string;
  settings?: Record<string, unknown>;
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
  line1?: string;
  full_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  status?: string;
  full_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: CustomerAddress | null;
  created_at?: string;
  updated_at?: string;
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
  metadata?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  send_registration_invite?: boolean;
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

export type Service = {
  id: string;
  name?: string;
  description?: string | null;
  status?: string;
  duration_minutes?: number;
  price?: number;
  currency?: string | null;
  image_url?: string | null;
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
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  status?: string;
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
};

export type StaffWeeklyScheduleBulkInput = {
  business?: string;
  staff_id: string;
  schedules: StaffWeeklyScheduleInput[];
};

export type StaffCreateInput = {
  business: string;
  staff_code: string;
  first_name: string;
  last_name?: string;
  display_name: string;
  email?: string;
  phone_number?: string;
  designation?: string;
  department?: string;
  working_location?: string;
  joining_date?: string;
  employment_status?: string;
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
  timezone?: string;
  currency?: string;
  language?: string;
  selected_product?: string;
  primary_color?: string;
  secondary_color?: string;
  phone_number?: string;
  settings?: Record<string, unknown>;
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
    availability: (query: { business?: string; staff_id?: string; date: string; duration_minutes?: number; interval_minutes?: number; buffer_minutes?: number }) => this.request<AvailabilitySlot[]>(`/availability`, { method: 'GET', query }),
    staffWeeklySchedules: {
      list: (query: { staff_id: string; business?: string }) =>
        this.request<StaffWeeklySchedule[]>('/staff-weekly-schedules', { method: 'GET', query }),
      upsert: (body: StaffWeeklySchedule & { business?: string }) =>
        this.request<StaffWeeklySchedule>('/staff-weekly-schedules', { method: 'POST', body }),
      bulkUpsert: (body: StaffWeeklyScheduleBulkInput) =>
        this.request<StaffWeeklySchedule[]>('/staff-weekly-schedules/bulk', { method: 'PUT', body }),
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
      this.request<Business>(`/businesses/${businessId}/product-subscriptions/${productCode}/plan`, { method: 'PATCH', body }),
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
  };

  notifications = {
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<Notification[]>('/notifications', { method: 'GET', query }),
    markRead: (notificationId: string) => this.request<Notification>(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    readAll: () => this.request<{ read: boolean }>('/notifications/read-all', { method: 'PATCH' }),
    delete: (notificationId: string) => this.request<null>(`/notifications/${notificationId}`, { method: 'DELETE' }),
  };

  analytics = {
    summary: (query?: Record<string, string | number | boolean | undefined | null>) =>
      this.request<AnalyticsSummary>('/analytics/summary', { method: 'GET', query }),
    list: (query?: Record<string, string | number | boolean | undefined | null>) =>
      this.request<AnalyticsSummary[]>('/analytics', { method: 'GET', query }),
    dashboard: {
      summary: (query?: Record<string, string | number | boolean | undefined | null>) =>
        this.request<{ today_count: number }>('/dashboard/summary', { method: 'GET', query }),
    },
  };

  bi = {
    overview: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIReportsBundle>('/bi/overview', { method: 'GET', query }),
    revenue: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIRevenueReport>('/bi/revenue', { method: 'GET', query }),
    trends: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BITrendsReport>('/bi/trends', { method: 'GET', query }),
    forecast: (query?: { horizon_days?: number }) =>
      this.request<BIForecastReport>('/bi/forecast', { method: 'GET', query }),
    reports: (query?: { start_date?: string; end_date?: string }) =>
      this.request<BIReportsBundle>('/bi/reports', { method: 'GET', query }),
  };

  platform = {
    tenants: () => this.request<{ tenants: PlatformTenantSummary[] }>('/platform/tenants', { method: 'GET' }),
    tenant: (tenantId: string) =>
      this.request<PlatformTenantDetail>(`/platform/tenants/${tenantId}`, { method: 'GET' }),
    updateTenant: (tenantId: string, body: { status?: string }) =>
      this.request<PlatformTenantDetail>(`/platform/tenants/${tenantId}`, { method: 'PATCH', body }),
    whiteLabelProfiles: () => this.request<WhiteLabelProfile[]>('/platform/white-label', { method: 'GET' }),
    whiteLabelProfile: (businessId: string) =>
      this.request<MobileBootstrapResponse>(`/platform/white-label/${businessId}`, { method: 'GET' }),
    updateWhiteLabelProfile: (businessId: string, body: Partial<WhiteLabelProfile>) =>
      this.request<MobileBootstrapResponse>(`/platform/white-label/${businessId}`, { method: 'PATCH', body }),
  };

  billing = {
    status: () => this.request<BillingStatus>('/billing/status', { method: 'GET' }),
    plans: () => this.request<BillingPlanCatalogItem[]>('/billing/plans', { method: 'GET' }),
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
    platformMonitoring: (query?: { window_hours?: number }) =>
      this.request<BillingPlatformMonitoring>('/billing/platform-monitoring', { method: 'GET', query }),
    platformAuditFeed: (query?: { limit?: number }) =>
      this.request<BillingPlatformAuditFeed>('/billing/platform-audit-feed', { method: 'GET', query }),
    releaseGate: () => this.request<BillingReleaseGateReport>('/billing/release-gate', { method: 'GET' }),
    runReconciliation: (body?: { lookback_hours?: number }) =>
      this.request<BillingReconciliationResult>('/billing/reconciliation/run', { method: 'POST', body }),
    checkout: (body: BillingCheckoutInput) => this.request<BillingCheckoutSession>('/billing/checkout', { method: 'POST', body }),
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
      body: { full_address?: string; latitude?: number | null; longitude?: number | null },
      query: { tenant_slug: string; business_code: string },
    ) => this.request<MobileCustomerProfile>('/mobile/customer/profile', { method: 'PATCH', body, query }),
    listNotifications: (query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileNotificationItem[]>('/mobile/notifications', { method: 'GET', query }),
    markNotificationRead: (notificationId: string, query: { tenant_slug: string; business_code: string }) =>
      this.request<MobileNotificationItem>(`/mobile/notifications/${notificationId}/read`, { method: 'PATCH', query }),
    readAllNotifications: (query: { tenant_slug: string; business_code: string }) =>
      this.request<{ updated: number }>('/mobile/notifications/read-all', { method: 'PATCH', query }),
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
