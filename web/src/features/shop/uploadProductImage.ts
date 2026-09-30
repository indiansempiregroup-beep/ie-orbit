type UploadProductImageArgs = {
  accessToken: string;
  tenantId: string;
  businessId: string;
  imageFile: File;
  label?: string;
  prepareProductCanvas?: boolean;
  removeBackground?: boolean;
  crop?: { left: number; top: number; width: number; height: number };
};

export async function uploadProductImage({
  accessToken,
  tenantId,
  businessId,
  imageFile,
  label = 'Product',
  prepareProductCanvas = true,
  removeBackground = false,
  crop,
}: UploadProductImageArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', imageFile);
  uploadData.set('business', businessId);
  uploadData.set('folder_type', 'products');
  uploadData.set('visibility', 'public');
  uploadData.append('tags', 'shop');
  uploadData.append('tags', 'product');
  uploadData.append('tags', 'image');
  uploadData.set('display_name', `${label} image`);
  if (prepareProductCanvas) {
    uploadData.set('prepare_product_canvas', 'true');
  }
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
    throw new Error('Product image upload failed.');
  }

  const uploadPayload = (await uploadResponse.json()) as {
    data?: { id?: string; public_url?: string; private_url?: string };
  };
  const url = uploadPayload.data?.public_url || uploadPayload.data?.private_url;
  if (!url) {
    throw new Error('Image uploaded but no URL was returned.');
  }
  return String(url);
}

type UploadPetImageArgs = {
  accessToken: string;
  tenantId: string;
  businessId: string;
  imageFile: File;
  petName?: string;
};

export async function uploadPetImage({
  accessToken,
  tenantId,
  businessId,
  imageFile,
  petName = 'Pet',
}: UploadPetImageArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', imageFile);
  uploadData.set('business', businessId);
  uploadData.set('folder_type', 'pets');
  uploadData.set('visibility', 'public');
  uploadData.append('tags', 'shop');
  uploadData.append('tags', 'pet');
  uploadData.append('tags', 'photo');
  uploadData.set('display_name', `${petName} photo`);

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
    throw new Error('Pet photo upload failed.');
  }

  const uploadPayload = (await uploadResponse.json()) as {
    data?: { id?: string; public_url?: string; private_url?: string };
  };
  const url = uploadPayload.data?.public_url || uploadPayload.data?.private_url;
  if (!url) {
    throw new Error('Image uploaded but no URL was returned.');
  }
  return String(url);
}
