import type { ShopDocumentKind } from '@ie-orbit/sdk';
import { downloadAuthenticatedFile } from '../../lib/downloadAuthenticatedFile';

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

export function shopDocPdfPath(target: ShopDocTarget, layout: 'a4' | 'thermal' = 'a4'): string {
  const params = new URLSearchParams({
    business_id: target.businessId,
    layout,
  });
  return `/api/v1/shop/docs/${target.kind}/${target.id}/pdf?${params.toString()}`;
}

export function shopDocHtmlPath(target: ShopDocTarget, layout: 'a4' | 'thermal' = 'a4'): string {
  const params = new URLSearchParams({
    business_id: target.businessId,
    format: 'html',
    layout,
  });
  return `/api/v1/shop/docs/${target.kind}/${target.id}?${params.toString()}`;
}

export async function downloadShopDocumentPdf(
  target: ShopDocTarget,
  token: string | null | undefined,
  layout: 'a4' | 'thermal' = 'a4',
  tenantId?: string | null,
): Promise<void> {
  const filename = `${(target.number || target.id).replace(/[^\w.-]+/g, '_')}.pdf`;
  const headers: Record<string, string> = {
    'X-Business-ID': target.businessId,
  };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  await downloadAuthenticatedFile(shopDocPdfPath(target, layout), token, filename, headers);
}

async function fetchShopDocumentHtml(
  target: ShopDocTarget,
  token: string | null | undefined,
  layout: 'a4' | 'thermal',
  tenantId?: string | null,
): Promise<string> {
  if (!token) throw new Error('Sign in again to view this document');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Business-ID': target.businessId,
    Accept: 'text/html',
  };
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  const response = await fetch(shopDocHtmlPath(target, layout), { headers });
  if (!response.ok) throw new Error(`Could not load document (${response.status})`);
  return response.text();
}

export async function openShopDocumentView(
  target: ShopDocTarget,
  token: string | null | undefined,
  layout: 'a4' | 'thermal' = 'a4',
  tenantId?: string | null,
): Promise<void> {
  const html = await fetchShopDocumentHtml(target, token, layout, tenantId);
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) throw new Error('Pop-up blocked — allow pop-ups to view the bill');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export async function printShopDocument(
  target: ShopDocTarget,
  token: string | null | undefined,
  layout: 'a4' | 'thermal' = 'a4',
  tenantId?: string | null,
): Promise<void> {
  const html = await fetchShopDocumentHtml(target, token, layout, tenantId);
  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) throw new Error('Pop-up blocked — allow pop-ups to print');
  win.document.open();
  win.document.write(html);
  win.document.close();
  const tryPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };
  setTimeout(tryPrint, 350);
}

export function deviceWhatsAppUrl(phone: string, message: string): string {
  const digits = digitsPhone(phone);
  const text = encodeURIComponent(message);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function deviceSmsUrl(phone: string, message: string): string {
  const digits = digitsPhone(phone);
  const body = encodeURIComponent(message);
  return digits ? `sms:${digits}?&body=${body}` : `sms:?&body=${body}`;
}

export function deviceMailtoUrl(email: string, subject: string, body: string): string {
  const to = encodeURIComponent(email || '');
  const params = new URLSearchParams({ subject, body });
  return `mailto:${to}?${params.toString()}`;
}

export async function copyText(value: string): Promise<void> {
  const text = String(value || '').trim();
  if (!text) throw new Error('Nothing to copy');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to execCommand for non-secure contexts / blocked permissions.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Clipboard is blocked in this browser');
}
