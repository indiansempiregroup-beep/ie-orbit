import { z } from 'zod';
import { TIMEZONES } from '../../../config/onboarding';

function normalizeWebsiteInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const optionalWebsiteSchema = z
  .string()
  .transform(normalizeWebsiteInput)
  .refine((value) => value === '' || z.string().url().safeParse(value).success, {
    message: 'Enter a valid website URL (for example, https://yoursalon.com)',
  });

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[0-9]/, 'Include at least one number')
  .refine((value) => !/^(password|qwerty|12345678)/i.test(value), {
    message: 'Choose a less common password',
  });

export const registerWizardSchema = z
  .object({
    businessName: z.string().min(2, 'Business name is required'),
    businessCategory: z.string().min(1, 'Select a category'),
    industry: z.string().min(1, 'Select an industry'),
    businessEmail: z.string().email('Enter a valid business email'),
    businessPhone: z.string().min(6, 'Enter a valid phone number'),
    website: optionalWebsiteSchema,
    country: z.string().min(1, 'Country is required'),
    state: z.string().min(1, 'State is required'),
    city: z.string().min(1, 'City is required'),
    address: z.string().min(1, 'Address is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    email: z.string().email('Enter a valid email'),
    mobile: z.string().min(6, 'Enter a valid mobile number'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    acceptTerms: z.boolean().refine((value) => value, 'Accept the terms to continue'),
    acceptPrivacy: z.boolean().refine((value) => value, 'Accept the privacy policy to continue'),
    currency: z.string().length(3, 'Select a currency'),
    timezone: z.string().refine((value) => TIMEZONES.includes(value as (typeof TIMEZONES)[number]), 'Select a timezone'),
    language: z.string().min(2, 'Select a language'),
    weekStartDay: z.enum(['monday', 'sunday']),
    businessHoursStart: z.string().min(1),
    businessHoursEnd: z.string().min(1),
    appointmentInterval: z.number().min(5),
    defaultDuration: z.number().min(5),
    bufferTime: z.number().min(0),
    dateFormat: z.string().min(1),
    timeFormat: z.enum(['12h', '24h']),
    selectedProduct: z.string().min(1),
    primaryColor: z.string().min(4),
    secondaryColor: z.string().min(4),
    theme: z.enum(['system', 'light', 'dark']),
    skipBranding: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterWizardFormValues = z.infer<typeof registerWizardSchema>;

export const stepFieldMap = {
  business: [
    'businessName',
    'businessCategory',
    'industry',
    'businessEmail',
    'businessPhone',
    'website',
    'country',
    'state',
    'city',
    'address',
    'postalCode',
  ],
  owner: [
    'firstName',
    'lastName',
    'displayName',
    'email',
    'mobile',
    'password',
    'confirmPassword',
    'acceptTerms',
    'acceptPrivacy',
  ],
  preferences: [
    'currency',
    'timezone',
    'language',
    'weekStartDay',
    'businessHoursStart',
    'businessHoursEnd',
    'appointmentInterval',
    'defaultDuration',
    'bufferTime',
    'dateFormat',
    'timeFormat',
    'selectedProduct',
  ],
  branding: ['primaryColor', 'secondaryColor', 'theme', 'skipBranding'],
  review: [],
  provision: [],
} as const;

export function getDefaultRegisterValues(): RegisterWizardFormValues {
  return {
    businessName: '',
    businessCategory: '',
    industry: '',
    businessEmail: '',
    businessPhone: '',
    website: '',
    country: '',
    state: '',
    city: '',
    address: '',
    postalCode: '',
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    acceptPrivacy: false,
    currency: 'USD',
    timezone: 'UTC',
    language: 'en',
    weekStartDay: 'monday',
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    appointmentInterval: 15,
    defaultDuration: 30,
    bufferTime: 0,
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    selectedProduct: 'appointie',
    primaryColor: '#1A56DB',
    secondaryColor: '#111827',
    theme: 'system',
    skipBranding: false,
  };
}
