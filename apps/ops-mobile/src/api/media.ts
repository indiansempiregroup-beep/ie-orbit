import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { getApiBaseUrl } from '../config/apiBaseUrl';

type PickerAssetWithFile = ImagePickerAsset & { file?: Blob };

async function appendPickerFile(formData: FormData, asset: ImagePickerAsset, field = 'file') {
  const fileName = asset.fileName ?? `upload-${Date.now()}.jpg`;
  const mimeType = asset.mimeType ?? 'image/jpeg';
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

export type MediaUploadResult = {
  id: string;
  public_url?: string;
  private_url?: string;
};

type UploadMediaArgs = {
  token: string;
  tenantId: string;
  businessId: string;
  asset: ImagePickerAsset;
  folderType: 'business' | 'services' | 'staff';
  tags: string[];
  displayName: string;
};

export async function uploadMedia({
  token,
  tenantId,
  businessId,
  asset,
  folderType,
  tags,
  displayName,
}: UploadMediaArgs): Promise<MediaUploadResult> {
  const formData = new FormData();
  await appendPickerFile(formData, asset);
  formData.append('business', businessId);
  formData.append('folder_type', folderType);
  formData.append('visibility', 'public');
  tags.forEach((tag) => formData.append('tags', tag));
  formData.append('display_name', displayName);

  const response = await fetch(`${getApiBaseUrl()}/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      'X-Business-ID': businessId,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Image upload failed.');
  }

  const payload = (await response.json()) as {
    data?: { id?: string; public_url?: string; private_url?: string };
  };

  if (!payload.data?.id) {
    throw new Error('Upload did not return a media id.');
  }

  return {
    id: String(payload.data.id),
    public_url: payload.data.public_url,
    private_url: payload.data.private_url,
  };
}

export async function uploadBrandingLogo(args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { displayName: string }) {
  return uploadMedia({
    ...args,
    folderType: 'business',
    tags: ['branding', 'logo'],
    displayName: `${args.displayName} logo`,
  });
}

export async function uploadServiceImage(args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { serviceName: string }) {
  return uploadMedia({
    ...args,
    folderType: 'services',
    tags: ['service', 'image'],
    displayName: `${args.serviceName} image`,
  });
}

export async function uploadProductImage(
  args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { productName?: string },
) {
  return uploadMedia({
    ...args,
    folderType: 'business',
    tags: ['shop', 'product', 'image'],
    displayName: `${args.productName?.trim() || 'Product'} image`,
  });
}

export async function uploadPetImage(
  args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { petName?: string },
) {
  return uploadMedia({
    ...args,
    folderType: 'business',
    tags: ['shop', 'pet', 'photo'],
    displayName: `${args.petName?.trim() || 'Pet'} photo`,
  });
}

export async function uploadProfilePhoto({
  token,
  tenantId,
  businessId,
  asset,
}: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { userName?: string }): Promise<MediaUploadResult> {
  const formData = new FormData();
  await appendPickerFile(formData, asset);

  const response = await fetch(`${getApiBaseUrl()}/auth/me/photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      'X-Business-ID': businessId,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Profile photo upload failed.');
  }

  const payload = (await response.json()) as {
    data?: { profile_photo?: string; media_id?: string };
  };

  if (!payload.data?.profile_photo) {
    throw new Error('Photo uploaded but no URL was returned.');
  }

  return {
    id: String(payload.data.media_id ?? ''),
    public_url: payload.data.profile_photo,
  };
}
