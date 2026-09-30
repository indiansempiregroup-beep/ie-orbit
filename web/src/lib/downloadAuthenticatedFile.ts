/** Download a same-origin API file with the current bearer token (admin / settings PDFs). */
export async function downloadAuthenticatedFile(
  path: string,
  token: string | null | undefined,
  filename: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  if (!token) {
    throw new Error('Sign in again to download');
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: '*/*',
    ...(extraHeaders || {}),
  };
  const response = await fetch(path, { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Document not found for this payment yet'
        : `Download failed (${response.status})`,
    );
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
