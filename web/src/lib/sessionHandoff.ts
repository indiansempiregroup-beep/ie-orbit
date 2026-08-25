import { writeAuthTokens } from './impersonation';

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeSessionHandoff(params: { access: string; refresh: string }): string {
  return toBase64Url(JSON.stringify({ access: params.access, refresh: params.refresh }));
}

/**
 * Apply `?ie-session=` tokens before AuthProvider reads localStorage.
 * Call from main.tsx, not inside a React effect.
 */
export function captureWebSessionHandoff() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('ie-session');
  if (!encoded) return;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as { access?: string; refresh?: string };
    if (!parsed.access || !parsed.refresh) return;
    writeAuthTokens(parsed.access, parsed.refresh);
  } catch {
    return;
  }
  params.delete('ie-session');
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
  try {
    history.replaceState(null, '', next);
  } catch {
    // ignore
  }
}
