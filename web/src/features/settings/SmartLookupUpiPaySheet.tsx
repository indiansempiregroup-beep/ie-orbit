import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useApiClient } from '../../hooks/useApiClient';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const PROOF_REQUIRED_MESSAGE = 'Enter a UTR / UPI reference or upload a payment screenshot.';
const SCREENSHOT_REQUIRED_MESSAGE = 'Upload a payment screenshot or enter a UTR / UPI reference.';

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
  amountPaise: number;
  onClose: () => void;
  onClaimed: () => Promise<void> | void;
  onError: (message: string) => void;
};

function paiseToInr(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function qrImageSrc(upiPayUrl: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=188x188&margin=8&data=${encodeURIComponent(upiPayUrl)}`;
}

export function SmartLookupUpiPaySheet({ amountPaise, onClose, onClaimed, onError }: Props) {
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
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ utr?: string; proof?: string }>({});

  function clearProofErrors() {
    setFormError(null);
    setFieldErrors({});
  }

  async function startCheckout() {
    if (!workspace.businessId) {
      const message = 'Select a business before topping up.';
      setFormError(message);
      onError(message);
      return;
    }
    setLoading(true);
    setFormError(null);
    try {
      const res = await client.shop.createSmartLookupTopUp({
        business_id: workspace.businessId,
        amount_paise: amountPaise,
      });
      setSession(res.data);
      setStatus('ready');
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to start UPI top-up. Set PLATFORM_UPI_VPA on the server.');
      setFormError(message);
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'idle' && !loading && !session) {
      void startCheckout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadProof(file: File) {
    if (!auth.token || !workspace.tenantId || !workspace.businessId) {
      const message = 'Sign in to a business before uploading a screenshot.';
      setFormError(message);
      setFieldErrors((current) => ({ ...current, proof: message }));
      onError(message);
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
      form.append('tags', 'smart_lookup');
      form.set('display_name', `Smart lookup top-up ${paiseToInr(amountPaise)}`);
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
      clearProofErrors();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to upload screenshot.');
      setFormError(message);
      setFieldErrors((current) => ({ ...current, proof: message }));
      onError(message);
    } finally {
      setUploading(false);
    }
  }

  async function submitClaim() {
    if (!session) return;
    if (utr.trim().length < 6 && !proofMediaId && !proofUrl) {
      setFieldErrors({
        utr: PROOF_REQUIRED_MESSAGE,
        proof: SCREENSHOT_REQUIRED_MESSAGE,
      });
      setFormError(PROOF_REQUIRED_MESSAGE);
      return;
    }
    setClaiming(true);
    clearProofErrors();
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
      const message = getApiErrorMessage(err, 'Unable to submit payment claim.');
      setFormError(message);
      onError(message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div
      className="admin-drawer-backdrop admin-drawer-backdrop--sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-lookup-upi-title"
      onClick={onClose}
    >
      <div className="admin-drawer admin-drawer--sheet" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
        <p className="product-settings-kicker">Smart lookup wallet</p>
        <h2 id="smart-lookup-upi-title" className="product-settings-title">
          Top up {paiseToInr(amountPaise)}
        </h2>
        <ol className="product-settings-lead" style={{ paddingLeft: 18 }}>
          <li>Pay the exact amount with UPI</li>
          <li>Submit your UTR or screenshot</li>
          <li>IE confirms — wallet credits at actual AI cost, no markup</li>
        </ol>

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
                    onChange={(event) => {
                      setUtr(event.target.value);
                      if (fieldErrors.utr || formError) clearProofErrors();
                    }}
                    autoCapitalize="characters"
                    placeholder="From your UPI app"
                    aria-invalid={Boolean(fieldErrors.utr)}
                    style={fieldErrors.utr ? { borderColor: '#dc2626' } : undefined}
                  />
                  {fieldErrors.utr ? (
                    <span role="alert" className="field-error">
                      {fieldErrors.utr}
                    </span>
                  ) : null}
                </label>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label
                    className="button"
                    style={{
                      display: 'inline-flex',
                      justifyContent: 'center',
                      borderColor: fieldErrors.proof ? '#dc2626' : undefined,
                    }}
                  >
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
                  {fieldErrors.proof ? (
                    <span role="alert" className="field-error">
                      {fieldErrors.proof}
                    </span>
                  ) : null}
                </div>
                {proofUrl ? (
                  <img src={proofUrl} alt="Payment screenshot" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />
                ) : null}
              </>
            ) : (
              <div className="product-settings-pending">
                <strong>Payment received — waiting for IE to confirm (usually same day).</strong>
                <p>
                  Your claim was submitted{utr ? ` · UTR ${utr}` : ''}. Wallet credits after confirmation.
                </p>
              </div>
            )}
          </div>
        ) : null}

        <div className="product-settings-product-actions" style={{ marginTop: 16 }}>
          {formError ? (
            <div role="alert" className="auth-error" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              {formError}
            </div>
          ) : null}
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
