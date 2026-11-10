import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  billingInterval?: 'monthly' | 'yearly';
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
  const { t } = useTranslation();
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

  const title = useMemo(() => {
    if (request.title) return request.title;
    const names = request.items.map((item) => getProductName(item.productCode));
    if (names.length > 1) return t('settings.upiPay.subscription.titleMulti', { names: names.join(' + ') });
    return t('settings.upiPay.subscription.titleRenew', { name: names[0] || t('settings.upiPay.subscription.fallbackName') });
  }, [request.title, request.items, t]);

  async function startCheckout() {
    setLoading(true);
    setFormError(null);
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
              billing_interval: request.items[0].billingInterval,
            }
          : {
              business_id: workspace.businessId ?? undefined,
              items: request.items.map((item) => ({
                product_code: item.productCode,
                plan_code: item.planCode,
                extra_staff: item.extraStaff ?? 0,
                extra_offices: item.extraOffices ?? 0,
                pets_pack_enabled: Boolean(item.petsPackEnabled),
                billing_interval: item.billingInterval,
              })),
            };
      const res = await client.billing.createUpiCheckout(body);
      setSession(res.data);
      setStatus('ready');
    } catch (err) {
      const message = getApiErrorMessage(err, t('settings.upiPay.subscription.startFailed'));
      setFormError(message);
      onError(message);
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
      const message = t('settings.upiPay.signInFirst');
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
        throw new Error(t('settings.upiPay.uploadFailed'));
      }
      const payload = (await response.json()) as {
        data?: { id?: string; public_url?: string; private_url?: string };
      };
      const id = String(payload.data?.id || '');
      const url = payload.data?.public_url || payload.data?.private_url || '';
      if (!id) throw new Error(t('settings.upiPay.noMediaId'));
      setProofMediaId(id);
      setProofUrl(url.startsWith('http') ? url : url);
      clearProofErrors();
    } catch (err) {
      const message = getApiErrorMessage(err, t('settings.upiPay.uploadFailed'));
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
        utr: t('settings.upiPay.proofRequired'),
        proof: t('settings.upiPay.screenshotRequired'),
      });
      setFormError(t('settings.upiPay.proofRequired'));
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
      const message = getApiErrorMessage(err, t('settings.upiPay.claimFailed'));
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
      aria-labelledby="upi-pay-title"
      onClick={onClose}
    >
      <div className="admin-drawer admin-drawer--sheet" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
        <p className="product-settings-kicker">{t('settings.upiPay.subscription.kicker')}</p>
        <h2 id="upi-pay-title" className="product-settings-title">
          {title}
        </h2>
        <ol className="product-settings-lead" style={{ paddingLeft: 18 }}>
          <li>{t('settings.upiPay.step1')}</li>
          <li>{t('settings.upiPay.step2')}</li>
          <li>{t('settings.upiPay.step3')}</li>
          <li>{t('settings.upiPay.subscription.step4')}</li>
        </ol>

        {status === 'idle' ? (
          <p className="product-settings-lead">{t('settings.upiPay.subscription.idleHint')}</p>
        ) : null}

        {session && (status === 'ready' || status === 'awaiting') ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="product-settings-cycle">
              <div className="product-settings-cycle-grid">
                <div>
                  <span>{t('settings.upiPay.amountDue')}</span>
                  <strong>{paiseToInr(session.amount)}</strong>
                </div>
                <div>
                  <span>{t('settings.upiPay.upiId')}</span>
                  <strong>{session.upi_vpa}</strong>
                </div>
              </div>
            </div>
            {session.upi_pay_url ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={session.payment_qr_url || qrImageSrc(session.upi_pay_url)}
                  alt={t('settings.upiPay.qrAlt')}
                  width={188}
                  height={188}
                  style={{ borderRadius: 12, background: '#fff' }}
                />
                <p className="product-settings-lead">{t('settings.upiPay.scanLocked')}</p>
                <p>
                  <a href={session.upi_pay_url}>{t('settings.upiPay.openUpi')}</a>
                </p>
              </div>
            ) : null}

            {status === 'ready' ? (
              <>
                <p className="product-settings-lead" style={{ margin: 0 }}>
                  {t('settings.upiPay.afterPay')}
                </p>
                <label className="product-settings-lead" style={{ display: 'grid', gap: 6 }}>
                  {t('settings.upiPay.utrLabel')}
                  <input
                    value={utr}
                    onChange={(event) => {
                      setUtr(event.target.value);
                      if (fieldErrors.utr || formError) clearProofErrors();
                    }}
                    autoCapitalize="characters"
                    placeholder={t('settings.upiPay.utrPlaceholder')}
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
                    {uploading ? t('settings.upiPay.uploading') : proofUrl || proofMediaId ? t('settings.upiPay.changeShot') : t('settings.upiPay.uploadShot')}
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
                  <img src={proofUrl} alt={t('settings.upiPay.shotAlt')} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />
                ) : null}
              </>
            ) : (
              <div className="product-settings-pending">
                <strong>{t('settings.upiPay.received')}</strong>
                <p>
                  {utr ? t('settings.upiPay.subscription.claimedUtr', { utr }) : t('settings.upiPay.subscription.claimed')}
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
                {t('settings.upiPay.generate')}
              </Button>
              <Button variant="neutral" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </>
          ) : null}
          {status === 'ready' ? (
            <>
              <Button variant="primary" loading={claiming} onClick={() => void submitClaim()}>
                {t('settings.upiPay.claimSubmit')}
              </Button>
              <Button variant="neutral" onClick={onClose}>
                {t('common.close')}
              </Button>
            </>
          ) : null}
          {status === 'awaiting' ? (
            <Button variant="primary" onClick={onClose}>
              {t('common.done')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
