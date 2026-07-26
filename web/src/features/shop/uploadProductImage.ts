type UploadProductImageArgs = {
  accessToken: string;
  tenantId: string;
  businessId: string;
  imageFile: File;
  label?: string;
};

export async function uploadProductImage({
  accessToken,
  tenantId,
  businessId,
  imageFile,
  label = 'Product',
}: UploadProductImageArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', imageFile);
  uploadData.set('business', businessId);
  uploadData.set('folder_type', 'business');
  uploadData.set('visibility', 'public');
  uploadData.append('tags', 'shop');
  uploadData.append('tags', 'product');
  uploadData.append('tags', 'image');
  uploadData.set('display_name', `${label} image`);

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
