import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { createAuthenticatedClient } from '../lib/apiClient';
import { resolveMediaAssetUrl, toStoredMediaAssetUrl } from '../lib/mediaUrl';

type MediaAsset = {
  public_url?: string;
  private_url?: string;
};

export function useBusinessLogo(logoFromBusiness?: string | null) {
  const auth = useAuth();
  const workspace = useWorkspace();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLogo() {
      const directLogo = resolveMediaAssetUrl(logoFromBusiness ?? workspace.activeBusiness?.logo);
      if (directLogo) {
        setLogoUrl(directLogo);
        return;
      }

      if (!auth.token || !workspace.tenantId || !workspace.businessId) {
        setLogoUrl(null);
        return;
      }

      try {
        const client = createAuthenticatedClient(auth.token, workspace.tenantId, workspace.businessId);
        const response = await fetch(
          `/api/v1/media?business=${workspace.businessId}&tags=logo`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
              'X-Tenant-ID': workspace.tenantId,
              'X-Business-ID': workspace.businessId,
            },
          },
        );
        if (!response.ok) {
          setLogoUrl(null);
          return;
        }
        const payload = (await response.json()) as { data?: MediaAsset[] };
        const mediaLogo = payload.data?.[0]?.public_url || payload.data?.[0]?.private_url;
        const resolved = resolveMediaAssetUrl(mediaLogo);
        if (!resolved || cancelled) {
          setLogoUrl(null);
          return;
        }

        setLogoUrl(resolved);
        if (!logoFromBusiness && !workspace.activeBusiness?.logo) {
          const storedLogo = toStoredMediaAssetUrl(mediaLogo);
          if (storedLogo) {
            void client.businesses.patch(workspace.businessId, { logo: storedLogo });
          }
        }
      } catch {
        if (!cancelled) setLogoUrl(null);
      }
    }

    void loadLogo();
    return () => {
      cancelled = true;
    };
  }, [
    auth.token,
    workspace.tenantId,
    workspace.businessId,
    workspace.activeBusiness?.logo,
    workspace.activeBusiness?.id,
    logoFromBusiness,
  ]);

  return logoUrl;
}
