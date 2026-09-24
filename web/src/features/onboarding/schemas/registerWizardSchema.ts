import { z } from 'zod';
import { TIMEZONES } from '../../../config/onboarding';
import {
  createDefaultWeeklyHours,
  weeklyHoursAreValid,
  type WeeklyHours,
} from '../../../lib/businessHours';

function normalizeWebsiteInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .refine((value) => /^(\+91)?[6-9]\d{9}$/.test(value.replace(/[\s-]/g, '')), {
    message: 'Enter a valid 10-digit Indian mobile number',
  });

const optionalWebsiteSchema = z
  .string()
  .transform(normalizeWebsiteInput)
  .refine((value) => value === '' || z.string().url().safeParse(value).success, {
    message: 'Enter a valid website URL (for example, https://yoursalon.com)',
  });

const businessEmailSchema = z.string().trim().superRefine((value, ctx) => {
  if (!value) {
    ctx.addIssue({ code: 'custom', message: 'Business email is required' });
    return;
  }
  if (!z.string().email().safeParse(value).success) {
    ctx.addIssue({ code: 'custom', message: `Invalid email address: ${value}` });
  }
});

const dayHoursSchema = z.object({
  open: z.boolean(),
  start: z.string().min(1),
  end: z.string().min(1),
});

export const registerWizardSchema = z
  .object({
    businessName: z.string().min(2, 'Business name is required'),
    businessCategory: z.string().min(1, 'Select a category'),
    businessCategoryOther: z.string(),
    industry: z.string().min(1, 'Select an industry'),
    industryOther: z.string(),
    businessEmail: businessEmailSchema,
    businessPhone: phoneSchema,
    website: optionalWebsiteSchema,
    country: z.string().min(1, 'Country is required'),
    state: z.string().min(1, 'State is required'),
    city: z.string().min(1, 'City is required'),
    address: z.string().min(1, 'Address is required'),
    addressLine2: z.string(),
    postalCode: z.string().min(1, 'Postal code is required'),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    displayName: z.string().min(1, 'Display name is required'),
    email: z.string().email('Enter a valid email'),
    mobile: phoneSchema,
    ownerOtpCode: z.string(),
    googleIdToken: z.string(),
    acceptTerms: z.boolean().refine((value) => value, 'Accept the terms to continue'),
    acceptPrivacy: z.boolean().refine((value) => value, 'Accept the privacy policy to continue'),
    currency: z.string().length(3, 'Select a currency'),
    timezone: z.string().refine((value) => TIMEZONES.includes(value as (typeof TIMEZONES)[number]), 'Select a timezone'),
    language: z.string().min(2, 'Select a language'),
    weekStartDay: z.enum(['monday', 'sunday']),
    skipHours: z.boolean(),
    businessHours: z.object({
      monday: dayHoursSchema,
      tuesday: dayHoursSchema,
      wednesday: dayHoursSchema,
      thursday: dayHoursSchema,
      friday: dayHoursSchema,
      saturday: dayHoursSchema,
      sunday: dayHoursSchema,
    }),
    dateFormat: z.string().min(1),
    timeFormat: z.enum(['12h', '24h']),
    selectedProducts: z.array(z.enum(['appointie', 'shopie'])).min(1, 'Select at least one product'),
    planCodes: z.record(z.string(), z.string()),
    primaryColor: z.string().min(4),
    secondaryColor: z.string().min(4),
    theme: z.literal('light'),
  })
  .superRefine((data, ctx) => {
    if (!data.googleIdToken && !/^\d{6}$/.test(data.ownerOtpCode.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ownerOtpCode'],
        message: 'Enter the 6-digit code from your email',
      });
    }
    if (!data.skipHours && !weeklyHoursAreValid(data.businessHours as WeeklyHours)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessHours'],
        message: 'Open at least one day and make sure closing time is after opening time.',
      });
    }
    if (data.businessCategory === 'Other' && !data.businessCategoryOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessCategoryOther'],
        message: 'Describe your business category',
      });
    }
    if (data.industry === 'Other' && !data.industryOther.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['industryOther'],
        message: 'Describe your industry',
      });
    }
    for (const product of data.selectedProducts) {
      if (!data.planCodes[product]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['planCodes'],
          message: `Select a package for ${product === 'shopie' ? 'Orbit Mart' : 'Orbit Appoint'}.`,
        });
      }
    }
  });

export type RegisterWizardFormValues = z.infer<typeof registerWizardSchema>;

export const stepFieldMap = {
  business: [
    'businessName',
    'businessCategory',
    'businessCategoryOther',
    'industry',
    'industryOther',
    'businessEmail',
    'businessPhone',
    'website',
    'country',
    'state',
    'city',
    'address',
    'addressLine2',
    'postalCode',
  ],
  owner: [
    'firstName',
    'lastName',
    'displayName',
    'email',
    'mobile',
    'ownerOtpCode',
    'acceptTerms',
    'acceptPrivacy',
  ],
  preferences: [
    'currency',
    'timezone',
    'language',
    'weekStartDay',
    'skipHours',
    'businessHours',
    'dateFormat',
    'timeFormat',
    'selectedProducts',
    'planCodes',
  ],
  branding: ['primaryColor', 'secondaryColor', 'theme'],
  review: [],
  provision: [],
} as const;

export function getDefaultRegisterValues(): RegisterWizardFormValues {
  return {
    businessName: '',
    businessCategory: '',
    businessCategoryOther: '',
    industry: '',
    industryOther: '',
    businessEmail: '',
    businessPhone: '',
    website: '',
    country: '',
    state: '',
    city: '',
    address: '',
    addressLine2: '',
    postalCode: '',
    latitude: null,
    longitude: null,
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    mobile: '',
    ownerOtpCode: '',
    googleIdToken: '',
    acceptTerms: false,
    acceptPrivacy: false,
    currency: 'USD',
    timezone: 'UTC',
    language: 'en',
    weekStartDay: 'monday',
    skipHours: false,
    businessHours: createDefaultWeeklyHours(),
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    selectedProducts: ['appointie'],
    planCodes: { appointie: 'appointie-pro' },
    primaryColor: '#1A56DB',
    secondaryColor: '#111827',
    theme: 'light',
  };
}
