import * as SecureStore from 'expo-secure-store';
import { mobileRuntime } from '../config/flavors';

const PENDING_REFERRAL_KEY = 'ie:mobile:pending-referral';

type PendingReferral = {
  code: string;
  tenantSlug?: string;
  businessCode?: string;
};

export function buildReferralLinks(input: PendingReferral) {
  const params = new URLSearchParams({
    code: input.code,
    ...(input.tenantSlug ? { tenant_slug: input.tenantSlug } : {}),
    ...(input.businessCode ? { business_code: input.businessCode } : {}),
  });
  const appUrl = `${mobileRuntime.appSlug}://invite?${params.toString()}`;
  const shareUrl = mobileRuntime.referralLinkBaseUrl
    ? `${mobileRuntime.referralLinkBaseUrl.replace(/\/$/, '')}/invite?${params.toString()}`
    : appUrl;
  return { appUrl, shareUrl, downloadUrl: mobileRuntime.appDownloadUrl };
}

export function referralFromUrl(url: string): PendingReferral | null {
  try {
    const parsed = new URL(url);
    const code = (parsed.searchParams.get('code') || parsed.searchParams.get('referral_code') || '')
      .trim()
      .toUpperCase();
    if (!code) return null;
    return {
      code,
      tenantSlug: parsed.searchParams.get('tenant_slug') || undefined,
      businessCode: parsed.searchParams.get('business_code') || undefined,
    };
  } catch {
    return null;
  }
}

export async function savePendingReferral(referral: PendingReferral) {
  await SecureStore.setItemAsync(PENDING_REFERRAL_KEY, JSON.stringify(referral));
}

export async function readPendingReferral(): Promise<PendingReferral | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_REFERRAL_KEY);
    return raw ? (JSON.parse(raw) as PendingReferral) : null;
  } catch {
    return null;
  }
}

export async function clearPendingReferral() {
  await SecureStore.deleteItemAsync(PENDING_REFERRAL_KEY);
}
