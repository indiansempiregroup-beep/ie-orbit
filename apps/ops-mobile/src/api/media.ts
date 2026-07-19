import type { ImagePickerAsset } from 'expo-image-picker';
import { getApiBaseUrl } from '../config/apiBaseUrl';

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
  const fileName = asset.fileName ?? `upload-${Date.now()}.jpg`;
  const mimeType = asset.mimeType ?? 'image/jpeg';

  formData.append('file', {
    uri: asset.uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
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

export async function uploadStaffPhoto(args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { staffName: string }) {
  return uploadMedia({
    ...args,
    folderType: 'staff',
    tags: ['staff', 'photo'],
    displayName: `${args.staffName} photo`,
  });
}

export async function uploadProfilePhoto(args: Omit<UploadMediaArgs, 'folderType' | 'tags' | 'displayName'> & { userName: string }) {
  return uploadMedia({
    ...args,
    folderType: 'business',
    tags: ['profile', 'photo'],
    displayName: `${args.userName} profile photo`,
  });
}
