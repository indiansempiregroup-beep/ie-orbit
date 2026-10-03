import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getApiBaseUrl } from '../config/apiBaseUrl';

type DownloadTaxInvoicePdfArgs = {
  invoiceId: string;
  invoiceNumber?: string | null;
  token: string;
  tenantId?: string | null;
  businessId?: string | null;
};

/** Fetch an authenticated SaaS tax invoice / credit note PDF and share or download it. */
export async function downloadTaxInvoicePdf({
  invoiceId,
  invoiceNumber,
  token,
  tenantId,
  businessId,
}: DownloadTaxInvoicePdfArgs): Promise<void> {
  if (!businessId) {
    throw new Error('Select a business before downloading invoices');
  }
  if (!tenantId) {
    throw new Error('Workspace context missing — reopen Products & Billing and try again');
  }

  const params = new URLSearchParams({ business_id: businessId });
  const url = `${getApiBaseUrl()}/billing/tax-invoices/${invoiceId}/pdf?${params.toString()}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'X-Business-ID': businessId,
    Accept: '*/*',
  };

  // Always use fetch — Expo File.downloadFileAsync often drops custom headers,
  // which makes the API return 404 (no tenant context).
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    const detail =
      response.status === 404
        ? 'Invoice not found for this business (or workspace header missing)'
        : `Could not download PDF (${response.status})`;
    throw new Error(detail);
  }

  const filename = `${(invoiceNumber || invoiceId).replace(/[^\w.-]+/g, '_')}.pdf`;
  // Prefer arrayBuffer — response.blob() is unreliable on Expo mobile / RN.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) {
    throw new Error('PDF download was empty');
  }

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    if (isMobile) {
      const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.assign(objectUrl);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device');
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Share ${filename}`,
  });
}
