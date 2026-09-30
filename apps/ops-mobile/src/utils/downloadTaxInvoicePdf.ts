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
