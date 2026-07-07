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
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

export type Customer = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  status?: string;
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
};

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

export type StaffMember = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
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
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: HeadersInit;
  private token: string | null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
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
    resendVerification: () => this.request<{ accepted: boolean }>('/auth/resend-verification', { method: 'POST' }),
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
    summary: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown>('/analytics/summary', { method: 'GET', query }),
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown[]>('/analytics', { method: 'GET', query }),
    dashboard: {
      summary: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown>('/dashboard/summary', { method: 'GET', query }),
    },
  };

  billing = {
    status: () => this.request<BillingStatus>('/billing/status', { method: 'GET' }),
    goLiveCheck: () => this.request<BillingGoLiveReport>('/billing/go-live-check', { method: 'GET' }),
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
    const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');

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
