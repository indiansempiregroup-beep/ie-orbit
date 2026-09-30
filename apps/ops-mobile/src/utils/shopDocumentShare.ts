import { Linking, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import type { ShopDocumentKind } from '@ie-orbit/sdk';

export type ShopDocTarget = {
  kind: ShopDocumentKind | string;
  id: string;
  number?: string;
  businessId: string;
  phone?: string;
  email?: string;
};

function digitsPhone(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

function authHeaders(token: string, businessId: string, tenantId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Business-ID': businessId,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return headers;
}

export function deviceWhatsAppUrl(phone: string, message: string): string {
  const digits = digitsPhone(phone);
  const text = encodeURIComponent(message);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function deviceSmsUrl(phone: string, message: string): string {
  const digits = digitsPhone(phone);
  const body = encodeURIComponent(message);
  return digits ? `sms:${digits}${Platform.OS === 'ios' ? '&' : '?'}body=${body}` : `sms:?body=${body}`;
}

export function deviceMailtoUrl(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(email || '')}?${params.toString()}`;
}

export async function downloadAndShareShopDocumentPdf(args: {
  target: ShopDocTarget;
  token: string;
  tenantId?: string | null;
  layout?: 'a4' | 'thermal';
}): Promise<void> {
  const { target, token, tenantId, layout = 'a4' } = args;
  if (!target.businessId) throw new Error('Select a business first');
  if (!tenantId) throw new Error('Workspace context missing');

  const params = new URLSearchParams({ business_id: target.businessId, layout });
  const url = `${getApiBaseUrl()}/shop/docs/${target.kind}/${target.id}/pdf?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      'X-Business-ID': target.businessId,
      Accept: '*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`Could not download PDF (${response.status})`);
  }
  const filename = `${(target.number || target.id).replace(/[^\w.-]+/g, '_')}.pdf`;
  const blob = await response.blob();

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device');
  }
  const buffer = await blob.arrayBuffer();
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(buffer));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Share ${filename}`,
  });
}

export async function openUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error('Cannot open this link on this device');
  }
}

/** Prefer a device-openable public HTML URL (API) over the marketing frontend path. */
export function toShareableShopDocUrl(publicUrlOrToken: string): string {
  const raw = String(publicUrlOrToken || '').trim();
  if (!raw) return '';
  if (raw.includes('/open/shop-doc/')) {
    const shareToken = raw.split('/open/shop-doc/')[1]?.split(/[?#]/)[0] || '';
    if (shareToken) {
      return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(shareToken)}?format=html`;
    }
  }
  if (raw.includes('/public/shop-docs/')) {
    if (raw.includes('format=')) return raw;
    return `${raw}${raw.includes('?') ? '&' : '?'}format=html`;
  }
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) {
    return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(raw)}?format=html`;
  }
  return raw;
}

export async function copyTextToClipboard(value: string): Promise<void> {
  const text = String(value || '').trim();
  if (!text) throw new Error('Nothing to copy');

  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document !== 'undefined') {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      if (ok) return;
    }
  }

  const Clipboard = await import('expo-clipboard');
  await Clipboard.setStringAsync(text);
}

async function createPublicShopDocUrl(args: {
  target: ShopDocTarget;
  token: string;
  tenantId?: string | null;
}): Promise<string> {
  const { target, token, tenantId } = args;
  const response = await fetch(`${getApiBaseUrl()}/shop/docs/${target.kind}/${target.id}/share-link`, {
    method: 'POST',
    headers: authHeaders(token, target.businessId, tenantId),
    body: JSON.stringify({ business_id: target.businessId }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not open document (${response.status})${detail ? `: ${detail.slice(0, 120)}` : ''}`);
  }
  const json = (await response.json()) as {
    data?: { public_url?: string; token?: string };
    public_url?: string;
    token?: string;
  };
  const shareToken = String(json?.data?.token || json?.token || '').trim();
  // Prefer API public HTML so devices can open LAN/backend URLs without needing the web app host.
  if (shareToken) {
    return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(shareToken)}?format=html`;
  }
  const publicUrl = String(json?.data?.public_url || json?.public_url || '').trim();
  if (!publicUrl) throw new Error('Could not prepare document link');
  return publicUrl;
}

export async function openShopDocumentHtmlView(args: {
  target: ShopDocTarget;
  token: string;
  tenantId?: string | null;
  layout?: 'a4' | 'thermal';
  publicUrl?: string;
}): Promise<void> {
  const { target, token, tenantId, publicUrl } = args;
  if (!target.businessId) throw new Error('Select a business first');
  if (!tenantId) throw new Error('Workspace context missing');

  // Prefer a viewable URL (API public HTML when possible).
  let viewUrl = toShareableShopDocUrl(publicUrl || '');
  if (!viewUrl) {
    viewUrl = await createPublicShopDocUrl({ target, token, tenantId });
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open(viewUrl, '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Pop-up blocked — allow pop-ups to view the bill');
    return;
  }

  await WebBrowser.openBrowserAsync(viewUrl, {
    enableBarCollapsing: true,
    showTitle: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
  });
}
