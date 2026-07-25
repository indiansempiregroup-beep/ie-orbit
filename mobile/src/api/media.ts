import type { ImagePickerAsset } from 'expo-image-picker';
import { getApiBaseUrl } from '../config/apiBaseUrl';

type UploadProfilePhotoArgs = {
  token: string;
  tenantSlug: string;
  businessCode: string;
  asset: ImagePickerAsset;
};

export async function uploadCustomerProfilePhoto({
  token,
  tenantSlug,
  businessCode,
  asset,
}: UploadProfilePhotoArgs): Promise<{ profile_photo: string; media_id: string }> {
  const formData = new FormData();
  const fileName = asset.fileName ?? `profile-${Date.now()}.jpg`;
  const mimeType = asset.mimeType ?? 'image/jpeg';

  formData.append('file', {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const query = new URLSearchParams({
    tenant_slug: tenantSlug,
    business_code: businessCode,
  });

  const response = await fetch(`${getApiBaseUrl()}/mobile/customer/profile/photo?${query}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: { profile_photo?: string; media_id?: string };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Photo upload failed.');
  }

  if (!payload?.data?.profile_photo) {
    throw new Error(payload?.error?.message || 'Upload did not return a profile photo URL.');
  }

  return {
    profile_photo: payload.data.profile_photo,
    media_id: String(payload.data.media_id ?? ''),
  };
}
