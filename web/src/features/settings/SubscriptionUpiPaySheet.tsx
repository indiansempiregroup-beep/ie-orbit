import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { getProductName } from '../../config/products';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useApiClient } from '../../hooks/useApiClient';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export type SubscriptionUpiPayItem = {
  productCode: string;
  planCode: string;
  extraStaff?: number;
  extraOffices?: number;
  petsPackEnabled?: boolean;
};

export type SubscriptionUpiPayRequest = {
  items: SubscriptionUpiPayItem[];
  title?: string;
  autoStart?: boolean;
};

type SessionPayload = {
  session_id: string;
  amount: number;
  currency: string;
  upi_vpa: string;
  upi_pay_url: string;
  payment_qr_url?: string;
  payment_status: string;
};

type Props = {
  request: SubscriptionUpiPayRequest;
  onClose: () => void;
  onClaimed: () => Promise<void> | void;
  onError: (message: string) => void;
};

function paiseToInr(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function qrImageSrc(upiPayUrl: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=188x188&margin=8&data=${encodeURIComponent(upiPayUrl)}`;
}

export function SubscriptionUpiPaySheet({ request, onClose, onClaimed, onError }: Props) {
  const client = useApiClient();
  const auth = useAuth();
  const workspace = useWorkspace();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [utr, setUtr] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofMediaId, setProofMediaId] = useState('');
  const [status, setStatus] = useState<'idle' | 'ready' | 'awaiting'>('idle');

  const title = useMemo(() => {
    if (request.title) return request.title;
    const names = request.items.map((item) => getProductName(item.productCode));
    if (names.length > 1) return `Pay selected · ${names.join(' + ')}`;
    return `Renew ${names[0] || 'subscription'}`;
  }, [request.title, request.items]);

  async function startCheckout() {
    setLoading(true);
    try {
      const body =
        request.items.length === 1
          ? {
              product_code: request.items[0].productCode,
              plan_code: request.items[0].planCode,
              business_id: workspace.businessId ?? undefined,
              extra_staff: request.items[0].extraStaff ?? 0,
              extra_offices: request.items[0].extraOffices ?? 0,
              pets_pack_enabled: Boolean(request.items[0].petsPackEnabled),
            }
          : {
              business_id: workspace.businessId ?? undefined,
              items: request.items.map((item) => ({
                product_code: item.productCode,
                plan_code: item.planCode,
                extra_staff: item.extraStaff ?? 0,
                extra_offices: item.extraOffices ?? 0,
                pets_pack_enabled: Boolean(item.petsPackEnabled),
              })),
            };
      const res = await client.billing.createUpiCheckout(body);
      setSession(res.data);
      setStatus('ready');
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to start UPI checkout. Set PLATFORM_UPI_VPA on the server.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (request.autoStart && status === 'idle' && !loading && !session) {
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.autoStart]);

  async function uploadProof(file: File) {
    if (!auth.token || !workspace.tenantId || !workspace.businessId) {
      onError('Sign in to a business before uploading a screenshot.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('business', workspace.businessId);
      form.set('folder_type', 'documents');
      form.set('visibility', 'public');
      form.append('tags', 'billing');
      form.append('tags', 'upi_proof');
      form.set('display_name', `UPI proof ${request.items.map((item) => item.productCode).join(' ')}`);
      const response = await fetch('/api/v1/media/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'X-Tenant-ID': workspace.tenantId,
          'X-Business-ID': workspace.businessId,
        },
        body: form,
      });
      if (!response.ok) {
        throw new Error('Unable to upload screenshot.');
      }
      const payload = (await response.json()) as {
        data?: { id?: string; public_url?: string; private_url?: string };
      };
      const id = String(payload.data?.id || '');
      const url = payload.data?.public_url || payload.data?.private_url || '';
      if (!id) throw new Error('Upload did not return a media id.');
      setProofMediaId(id);
      setProofUrl(url.startsWith('http') ? url : url);
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to upload screenshot.'));
    } finally {
      setUploading(false);
    }
  }

  async function submitClaim() {
    if (!session) return;
    if (utr.trim().length < 6 && !proofMediaId && !proofUrl) {
      onError('Enter a UTR / UPI reference or upload a payment screenshot.');
      return;
    }
    setClaiming(true);
    try {
      await client.billing.claimUpiCheckout(session.session_id, {
        upi_utr: utr.trim(),
        payment_proof_url: proofUrl || undefined,
        payment_proof_media_id: proofMediaId || undefined,
        business_id: workspace.businessId ?? undefined,
      });
      setStatus('awaiting');
      await onClaimed();
    } catch (err) {
      onError(getApiErrorMessage(err, 'Unable to submit payment claim.'));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      className="admin-drawer-backdrop admin-drawer-backdrop--sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-pay-title"
      onClick={onClose}
    >
      <div className="admin-drawer admin-drawer--sheet" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
        <p className="product-settings-kicker">Pay with UPI</p>
        <h2 id="upi-pay-title" className="product-settings-title">
          {title}
        </h2>
        <ol className="product-settings-lead" style={{ paddingLeft: 18 }}>
          <li>Pay the exact amount with UPI</li>
          <li>Submit your UTR or screenshot</li>
          <li>IE confirms — access restores until the next due date</li>
        </ol>

        {status === 'idle' ? (
          <p className="product-settings-lead">Generate a QR for this period. We do not charge automatically.</p>
        ) : null}

        {session && (status === 'ready' || status === 'awaiting') ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="product-settings-cycle">
              <div className="product-settings-cycle-grid">
                <div>
                  <span>Amount due</span>
                  <strong>{paiseToInr(session.amount)}</strong>
                </div>
                <div>
                  <span>UPI ID</span>
                  <strong>{session.upi_vpa}</strong>
                </div>
              </div>
            </div>
            {session.upi_pay_url ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={session.payment_qr_url || qrImageSrc(session.upi_pay_url)}
                  alt="UPI payment QR"
                  width={188}
                  height={188}
                  style={{ borderRadius: 12, background: '#fff' }}
                />
                <p className="product-settings-lead">Scan with any UPI app — amount is locked.</p>
                <p>
                  <a href={session.upi_pay_url}>Open UPI app</a>
                </p>
              </div>
            ) : null}

            {status === 'ready' ? (
              <>
                <label className="product-settings-lead" style={{ display: 'grid', gap: 6 }}>
                  UTR / UPI reference (optional if you upload a screenshot)
                  <input
                    value={utr}
                    onChange={(event) => setUtr(event.target.value)}
                    autoCapitalize="characters"
                    placeholder="From your UPI app"
                  />
                </label>
                <label className="button" style={{ display: 'inline-flex', justifyContent: 'center' }}>
                  {uploading ? 'Uploading…' : proofUrl || proofMediaId ? 'Change payment screenshot' : 'Upload payment screenshot'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadProof(file);
                    }}
                  />
                </label>
                {proofUrl ? (
                  <img src={proofUrl} alt="Payment screenshot" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />
                ) : null}
              </>
            ) : (
              <div className="product-settings-pending">
                <strong>Payment received — waiting for IE to confirm (usually same day).</strong>
                <p>
                  Your claim was submitted{utr ? ` · UTR ${utr}` : ''}. The product stays as-is until we confirm.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div className="product-settings-product-actions" style={{ marginTop: 16 }}>
          {status === 'idle' ? (
            <>
              <Button variant="primary" loading={loading} onClick={() => void startCheckout()}>
                Generate payment QR
              </Button>
              <Button variant="neutral" onClick={onClose}>
                Cancel
              </Button>
            </>
          ) : null}
          {status === 'ready' ? (
            <>
              <Button variant="primary" loading={claiming} onClick={() => void submitClaim()}>
                I’ve paid — submit for confirmation
              </Button>
              <Button variant="neutral" onClick={onClose}>
                Close
              </Button>
            </>
          ) : null}
          {status === 'awaiting' ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
