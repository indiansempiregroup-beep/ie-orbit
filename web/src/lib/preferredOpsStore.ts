export type PreferredOpsStore = 'ios' | 'android' | 'both';

export function detectPreferredOpsStore(): PreferredOpsStore {
  if (typeof navigator === 'undefined') return 'both';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'both';
}

export function preferredPhoneLabel(preferred: PreferredOpsStore): string {
  if (preferred === 'ios') return 'iPhone';
  if (preferred === 'android') return 'Android';
  return 'iPhone or Android';
}
