import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { resolveMediaUrl } from '../utils/mediaUrl';

type UploadProfilePhotoArgs = {
  token: string;
  tenantSlug: string;
  businessCode: string;
  asset: ImagePickerAsset;
  onProgress?: (percent: number) => void;
};

type PickerAssetWithFile = ImagePickerAsset & { file?: Blob };

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('heic') || mimeType.includes('heif')) return 'heic';
  return 'jpg';
}

function resolveFileName(asset: ImagePickerAsset, mimeType: string): string {
  const fallback = `upload-${Date.now()}.${extensionForMime(mimeType)}`;
  const raw = asset.fileName?.trim();
  if (!raw) return fallback;
  if (/\.(jpe?g|png|webp|heic|heif)$/i.test(raw)) return raw;
  return `${raw}.${extensionForMime(mimeType)}`;
}

/** Append an Expo ImagePicker asset so RN and web FormData both accept it. */
async function appendPickerFile(formData: FormData, asset: ImagePickerAsset, field = 'file') {
  const mimeType = asset.mimeType?.trim() || 'image/jpeg';
  const fileName = resolveFileName(asset, mimeType);
  const webFile = (asset as PickerAssetWithFile).file;

  // Browser FormData only accepts Blob/File. The RN `{ uri, name, type }` shape is ignored on web.
  if (typeof Blob !== 'undefined' && webFile instanceof Blob) {
    formData.append(field, webFile, fileName);
    return;
  }

  if (Platform.OS === 'web' || asset.uri.startsWith('blob:') || asset.uri.startsWith('data:')) {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const typed =
      blob.type && blob.type !== 'application/octet-stream'
        ? blob
        : new Blob([blob], { type: mimeType });
    formData.append(field, typed, fileName);
    return;
  }

  formData.append(field, {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
}

function uploadFormData(
  url: string,
  token: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'json';

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          onProgress(0);
          return;
        }
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
    }

    xhr.onload = () => {
      const json =
        typeof xhr.response === 'object' && xhr.response != null
          ? xhr.response
          : (() => {
              try {
                return JSON.parse(String(xhr.responseText || '{}'));
              } catch {
                return null;
              }
            })();
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('Network error while uploading photo.'));
    xhr.onabort = () => reject(new Error('Photo upload was cancelled.'));
    onProgress?.(0);
    xhr.send(formData);
  });
}

export async function uploadCustomerProfilePhoto({
  token,
  tenantSlug,
  businessCode,
  asset,
  onProgress,
}: UploadProfilePhotoArgs): Promise<{ profile_photo: string; media_id: string }> {
  if (!token) throw new Error('Sign in again to upload a profile photo.');
  if (!tenantSlug || !businessCode) throw new Error('Shop context is missing for photo upload.');

  const formData = new FormData();
  await appendPickerFile(formData, asset);

  const query = new URLSearchParams({
    tenant_slug: tenantSlug,
    business_code: businessCode,
  });

  const response = await uploadFormData(
    `${getApiBaseUrl()}/mobile/customer/profile/photo?${query}`,
    token,
    formData,
    onProgress,
  );

  const payload = response.json as {
    data?: { profile_photo?: string; media_id?: string };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Photo upload failed.');
  }

  const profilePhoto = payload?.data?.profile_photo?.trim() || '';
  if (!profilePhoto) {
    throw new Error(payload?.error?.message || 'Upload did not return a profile photo URL.');
  }

  onProgress?.(100);
  return {
    // Prefer a client-resolved URL so physical devices hit the LAN API host.
    profile_photo: resolveMediaUrl(profilePhoto),
    media_id: String(payload?.data?.media_id ?? ''),
  };
}

export async function uploadPetPhoto({
  token,
  tenantSlug,
  businessCode,
  asset,
  onProgress,
}: UploadProfilePhotoArgs): Promise<{ photo_url: string; media_id: string }> {
  if (!token) throw new Error('Sign in again to upload a photo.');
  if (!tenantSlug || !businessCode) throw new Error('Shop context is missing for photo upload.');

  const formData = new FormData();
  await appendPickerFile(formData, asset);

  const query = new URLSearchParams({
    tenant_slug: tenantSlug,
    business_code: businessCode,
  });

  const response = await uploadFormData(
    `${getApiBaseUrl()}/mobile/shop/pets/photo?${query}`,
    token,
    formData,
    onProgress,
  );

  const payload = response.json as {
    data?: { photo_url?: string; media_id?: string };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Photo upload failed.');
  }

  const photoUrl = payload?.data?.photo_url?.trim() || '';
  if (!photoUrl) {
    throw new Error(payload?.error?.message || 'Upload did not return a photo URL.');
  }

  onProgress?.(100);
  return {
    photo_url: resolveMediaUrl(photoUrl),
    media_id: String(payload?.data?.media_id ?? ''),
  };
}
