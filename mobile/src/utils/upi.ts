import { Alert, Linking, Platform } from 'react-native';

export type UpiAppId = 'gpay' | 'phonepe' | 'paytm';

type UpiAppConfig = {
  label: string;
  androidPackage: string;
  /**
   * App-specific deep-link bases (NOT upi://).
   * Generic upi:// is often hijacked by WhatsApp Pay as the default UPI handler.
   */
  deepLinkBases: string[];
};

const UPI_APPS: Record<UpiAppId, UpiAppConfig> = {
  gpay: {
    label: 'Google Pay',
    androidPackage: 'com.google.android.apps.nbu.paisa.user',
    // tez:// is the historical GPay India scheme; gpay:// is newer.
    deepLinkBases: ['tez://upi/pay', 'gpay://upi/pay'],
  },
  phonepe: {
    label: 'PhonePe',
    androidPackage: 'com.phonepe.app',
    deepLinkBases: ['phonepe://pay'],
  },
  paytm: {
    label: 'Paytm',
    androidPackage: 'net.one97.paytm',
    deepLinkBases: ['paytmmp://pay'],
  },
};

export function buildUpiPayUrl(args: {
  vpa: string;
  payeeName: string;
  amount: number | string;
  note?: string;
  currency?: string;
}): string {
  const pa = String(args.vpa || '').trim();
  if (!pa) return '';
  // Reject non-VPA values (e.g. WhatsApp / http links pasted into UPI ID by mistake).
  if (pa.includes('://') || pa.toLowerCase().includes('wa.me') || pa.toLowerCase().includes('whatsapp')) {
    return '';
  }
  const amount = Number(args.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const parts = [
    `pa=${encodeURIComponent(pa)}`,
    `pn=${encodeURIComponent(String(args.payeeName || 'Shop').trim() || 'Shop')}`,
    `am=${encodeURIComponent(amount.toFixed(2))}`,
    `cu=${encodeURIComponent(args.currency || 'INR')}`,
  ];
  if (args.note) parts.push(`tn=${encodeURIComponent(String(args.note).slice(0, 80))}`);
  return `upi://pay?${parts.join('&')}`;
}

function upiQuery(url: string): string {
  return url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
}

function isValidUpiPayUrl(url: string): boolean {
  return String(url || '').trim().toLowerCase().startsWith('upi://pay');
}

function assertSafeUpiUrl(url: string): string | null {
  const trimmed = String(url || '').trim();
  if (!isValidUpiPayUrl(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes('whatsapp') || lower.includes('wa.me') || lower.includes('api.whatsapp')) {
    return null;
  }
  return trimmed;
}

/** Open a chooser / generic UPI handler. Prefer openUpiInApp for specific apps. */
export async function openUpiPayUrl(url: string): Promise<boolean> {
  const trimmed = assertSafeUpiUrl(url);
  if (!trimmed) {
    Alert.alert('UPI', 'Payment link is invalid. Scan the QR code on this screen instead.');
    return false;
  }

  try {
    // Do not use a bare intent://upi package-less open — WhatsApp Pay often wins as default.
    await Linking.openURL(trimmed);
    return true;
  } catch {
    Alert.alert(
      'No UPI app found',
      'Install Google Pay, PhonePe, or Paytm — or scan the QR code shown on this screen to pay.',
    );
    return false;
  }
}

function buildAppCandidates(app: UpiAppConfig, query: string): string[] {
  const candidates: string[] = [];

  for (const base of app.deepLinkBases) {
    candidates.push(`${base}?${query}`);
  }

  if (Platform.OS === 'android') {
    // Explicit package + app scheme (still not scheme=upi — that routes to WhatsApp).
    for (const base of app.deepLinkBases) {
      const scheme = base.split('://')[0];
      const path = base.includes('://') ? base.slice(base.indexOf('://') + 3) : 'pay';
      candidates.push(
        `intent://${path}?${query}#Intent;scheme=${scheme};package=${app.androidPackage};` +
          `action=android.intent.action.VIEW;category=android.intent.category.DEFAULT;end`,
      );
    }
  }

  return candidates;
}

/** Open a specific UPI app. Never falls back to generic upi:// (WhatsApp hijacks it). */
export async function openUpiInApp(url: string, appId: UpiAppId): Promise<boolean> {
  const trimmed = assertSafeUpiUrl(url);
  if (!trimmed) {
    Alert.alert('UPI', 'Payment link is invalid. Scan the QR code on this screen instead.');
    return false;
  }

  const app = UPI_APPS[appId];
  const query = upiQuery(trimmed);
  const candidates = buildAppCandidates(app, query);

  for (const deepLink of candidates) {
    try {
      await Linking.openURL(deepLink);
      return true;
    } catch {
      // try next candidate
    }
  }

  Alert.alert(
    `${app.label} not available`,
    `Install ${app.label}, or scan the QR code on this screen to pay with any UPI app.`,
  );
  return false;
}
