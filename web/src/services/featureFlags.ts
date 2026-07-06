const STORAGE_KEY = 'ie:features';

export function isFeatureEnabled(key: string): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(parsed[key]);
  } catch {
    return false;
  }
}

export function setFeatureFlag(key: string, value: boolean) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    parsed[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
}
