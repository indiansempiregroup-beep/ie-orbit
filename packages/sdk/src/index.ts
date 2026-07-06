export type ApiEnvelope<T> = {
  data: T;
  meta: {
    request_id?: string | null;
    timestamp?: string;
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

export type Business = {
  id: string;
  business_name?: string;
  display_name?: string;
  business_type?: string;
  email?: string | null;
  status?: string;
  currency?: string | null;
  timezone?: string | null;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
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

class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: HeadersInit;
  private token: string | null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
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
    verifyEmail: (body: VerifyEmailRequest) => this.request<{ verified: boolean; email: string }>('/auth/verify-email', { method: 'POST', body }),
    me: () => this.request<UserProfile>('/auth/me', { method: 'GET' }),
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
    me: () => this.request<Business>('/businesses/me', { method: 'GET' }),
    get: (businessId: string) => this.request<Business>(`/businesses/${businessId}`, { method: 'GET' }),
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
    markRead: (notificationId: string) => this.request<Notification>(`/notifications/${notificationId}/read`, { method: 'POST' }),
    readAll: () => this.request<{ read: boolean }>('/notifications/read-all', { method: 'POST' }),
    delete: (notificationId: string) => this.request<null>(`/notifications/${notificationId}`, { method: 'DELETE' }),
  };

  analytics = {
    summary: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown>('/analytics/summary', { method: 'GET', query }),
    list: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown[]>('/analytics', { method: 'GET', query }),
    dashboard: {
      summary: (query?: Record<string, string | number | boolean | undefined | null>) => this.request<unknown>('/dashboard/summary', { method: 'GET', query }),
    },
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
    const url = new URL(`${this.baseUrl}${cleanPath}`);
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
