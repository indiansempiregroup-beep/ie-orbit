import { createAuthenticatedClient } from '../../lib/apiClient';
import { toStoredMediaAssetUrl } from '../../lib/mediaUrl';

type UploadBrandingLogoArgs = {
  accessToken: string;
  tenantId: string;
  businessId: string;
  logoFile: File;
  displayName: string;
};

export async function uploadBrandingLogo({
  accessToken,
  tenantId,
  businessId,
  logoFile,
  displayName,
}: UploadBrandingLogoArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', logoFile);
  uploadData.set('business', businessId);
  uploadData.set('folder_type', 'branding');
  uploadData.set('visibility', 'public');
  uploadData.append('tags', 'branding');
  uploadData.append('tags', 'logo');
  uploadData.set('display_name', `${displayName} logo`);

  const uploadResponse = await fetch('/api/v1/media/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-ID': tenantId,
      'X-Business-ID': businessId,
    },
    body: uploadData,
  });

  if (!uploadResponse.ok) {
    throw new Error('Workspace was created, but logo upload failed.');
  }

  const uploadPayload = (await uploadResponse.json()) as {
    data?: { public_url?: string; private_url?: string };
  };
  const logoUrl = uploadPayload.data?.public_url || uploadPayload.data?.private_url;
  if (!logoUrl) {
    throw new Error('Workspace was created, but logo upload did not return a URL.');
  }
  const storedLogoUrl = toStoredMediaAssetUrl(logoUrl);
  if (!storedLogoUrl) {
    throw new Error('Workspace was created, but logo upload did not return a valid URL.');
  }

  const tenantClient = createAuthenticatedClient(accessToken, tenantId, businessId);
  await tenantClient.businesses.patch(businessId, { logo: storedLogoUrl });

  try {
    await tenantClient.tenants.patch(tenantId, { logo: storedLogoUrl });
    await tenantClient.tenants.settings({ branding: { logo: storedLogoUrl } });
  } catch {
    // Tenant branding sync is best-effort; business logo is the source of truth.
  }

  return storedLogoUrl;
}
