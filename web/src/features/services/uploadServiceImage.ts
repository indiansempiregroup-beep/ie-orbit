type UploadServiceImageArgs = {
  accessToken: string;
  tenantId: string;
  businessId: string;
  imageFile: File;
  serviceName: string;
  removeBackground?: boolean;
  crop?: { left: number; top: number; width: number; height: number };
};

export async function uploadServiceImage({
  accessToken,
  tenantId,
  businessId,
  imageFile,
  serviceName,
  removeBackground = false,
  crop,
}: UploadServiceImageArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', imageFile);
  uploadData.set('business', businessId);
  uploadData.set('folder_type', 'services');
  uploadData.set('visibility', 'public');
  uploadData.append('tags', 'service');
  uploadData.append('tags', 'image');
  uploadData.set('display_name', `${serviceName} image`);
  if (removeBackground) {
    uploadData.set('remove_background', 'true');
  }
  if (crop) {
    uploadData.set('crop_left', String(crop.left));
    uploadData.set('crop_top', String(crop.top));
    uploadData.set('crop_width', String(crop.width));
    uploadData.set('crop_height', String(crop.height));
  }

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
    throw new Error('Service was saved, but image upload failed.');
  }

  const uploadPayload = (await uploadResponse.json()) as {
    data?: { id?: string };
  };
  const mediaId = uploadPayload.data?.id;
  if (!mediaId) {
    throw new Error('Service was saved, but image upload did not return a media id.');
  }

  return String(mediaId);
}
