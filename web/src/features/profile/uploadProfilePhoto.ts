type UploadProfilePhotoArgs = {
  accessToken: string;
  tenantId: string;
  businessId?: string | null;
  imageFile: File;
};

export async function uploadProfilePhoto({
  accessToken,
  tenantId,
  businessId,
  imageFile,
}: UploadProfilePhotoArgs): Promise<string> {
  const uploadData = new FormData();
  uploadData.set('file', imageFile);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-ID': tenantId,
  };
  if (businessId) {
    headers['X-Business-ID'] = businessId;
  }

  const uploadResponse = await fetch('/api/v1/auth/me/photo', {
    method: 'POST',
    headers,
    body: uploadData,
  });

  if (!uploadResponse.ok) {
    let message = 'Profile photo upload failed.';
    try {
      const payload = (await uploadResponse.json()) as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const uploadPayload = (await uploadResponse.json()) as {
    data?: { profile_photo?: string };
  };
  const photoUrl = uploadPayload.data?.profile_photo;
  if (!photoUrl) {
    throw new Error('Photo uploaded but no URL was returned.');
  }
  return photoUrl;
}
