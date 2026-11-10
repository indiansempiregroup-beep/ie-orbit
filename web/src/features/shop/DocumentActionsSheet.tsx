import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopDocumentKind } from '@ie-orbit/sdk';
import { Eye, Download, Printer, Link2, MessageCircle, Mail, Smartphone } from 'lucide-react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useAuthContext } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { formatMoney } from '../../lib/currency';
import {
  copyText,
  deviceMailtoUrl,
  deviceSmsUrl,
  deviceWhatsAppUrl,
  downloadShopDocumentPdf,
  openShopDocumentView,
  printShopDocument,
  type ShopDocTarget,
} from './shopDocumentActions';

type Props = {
  open: boolean;
  onClose: () => void;
  target: ShopDocTarget | null;
  title?: string;
  allowNewBill?: boolean;
  onNewBill?: () => void;
};

function firstContact(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function DocumentActionsSheet({
  open,
  onClose,
  target,
  title,
  allowNewBill = false,
  onNewBill,
}: Props) {
  const { t } = useTranslation();
  const td = (key: string) => String(t(`shop.docSheet.${key}`));
  const auth = useAuthContext();
  const workspace = useWorkspace();
  const client = useApiClient();
  const snackbar = useSnackbar();
  const [sending, setSending] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [message, setMessage] = useState('');
  const [amountDue, setAmountDue] = useState('');

  useEffect(() => {
    if (!open || !target) return;
    setPhone(firstContact(target.phone));
    setEmail(firstContact(target.email));
    setPublicUrl('');
    setMessage('');
    setAmountDue('');
    let cancelled = false;
    (async () => {
      setLoadingShare(true);
      try {
        const [doc, share] = await Promise.all([
          client.shop.getShopDocument(target.kind, target.id, { business_id: target.businessId }).catch(() => null),
          client.shop.createShopDocumentShareLink(target.kind, target.id, {
            business_id: target.businessId,
          }),
        ]);
        if (cancelled) return;
        setPhone(
          firstContact(target.phone, share.data.customer_phone, String(doc?.data?.customer_phone || '')),
        );
        setEmail(
          firstContact(target.email, share.data.customer_email, String(doc?.data?.customer_email || '')),
        );
        setPublicUrl(share.data.public_url);
        setMessage(share.data.message || '');
        setAmountDue(String(share.data.amount_due || doc?.data?.amount_due || ''));
      } catch (error) {
        if (!cancelled) {
          snackbar.push(error instanceof Error ? error.message : td('prepareFailed'), 'error');
        }
      } finally {
        if (!cancelled) setLoadingShare(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, target?.id, target?.kind, target?.businessId, target?.phone, target?.email, client]);

  if (!target) return null;
  // Narrow for nested handlers — TS does not keep the prop guard inside closures.
  const doc = target;

  async function ensureShare(): Promise<{ url: string; text: string }> {
    if (publicUrl) return { url: publicUrl, text: message || publicUrl };
    const share = await client.shop.createShopDocumentShareLink(doc.kind, doc.id, {
      business_id: doc.businessId,
    });
    setPublicUrl(share.data.public_url);
    setMessage(share.data.message || '');
    setPhone((prev) => firstContact(prev, share.data.customer_phone));
    setEmail((prev) => firstContact(prev, share.data.customer_email));
    setAmountDue(String(share.data.amount_due || ''));
    return { url: share.data.public_url, text: share.data.message || share.data.public_url };
  }

  async function onDownload(layout: 'a4' | 'thermal') {
    try {
      await downloadShopDocumentPdf(doc, auth.token, layout, workspace.tenantId);
      snackbar.push(td('pdfDownloaded'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('downloadFailed'), 'error');
    }
  }

  async function onCopyLink() {
    try {
      const share = await ensureShare();
      const url = absoluteShareUrl(share.url);
      if (!url) throw new Error(td('linkNotReady'));
      await copyText(url);
      snackbar.push(td('linkCopied'), 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('copyFailed'), 'error');
    }
  }

  async function onDeviceWhatsApp() {
    try {
      const share = await ensureShare();
      window.open(deviceWhatsAppUrl(phone, share.text), '_blank', 'noopener,noreferrer');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('whatsappFailed'), 'error');
    }
  }

  async function onDeviceSms() {
    try {
      const share = await ensureShare();
      window.location.href = deviceSmsUrl(phone, share.text);
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('smsFailed'), 'error');
    }
  }

  async function onDeviceEmail() {
    try {
      const share = await ensureShare();
      window.location.href = deviceMailtoUrl(
        email,
        `${title || td('document')} ${doc.number || ''}`.trim(),
        share.text,
      );
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('emailFailed'), 'error');
    }
  }

  async function onServerSend(channels: Array<'email' | 'whatsapp'>, remind = false) {
    setSending(true);
    try {
      const result = await client.shop.sendShopDocument(doc.kind, doc.id, {
        business_id: doc.businessId,
        channels,
        to_phone: phone || undefined,
        to_email: email || undefined,
        remind_payment: remind,
      });
      const parts = Object.entries(result.data.channels || {}).map(
        ([channel, info]) => `${channel}: ${info.status || 'ok'}`,
      );
      snackbar.push(parts.join(' · ') || td('sent'), 'success');
      if (result.data.public_url) setPublicUrl(result.data.public_url);
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : td('sendFailed'), 'error');
    } finally {
      setSending(false);
    }
  }

  const due = Number(amountDue || 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title || `${td('document')} ${doc.number || ''}`.trim()}
      labelledBy="shop-document-actions"
      busy={sending}
      busyMessage={td('sending')}
    >
      <div style={{ display: 'grid', gap: 16, marginTop: 4 }}>
        {due > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fff7e8',
              border: '1px solid #f0d7a4',
              fontSize: 13,
            }}
          >
            {td('amountDue')} <strong>{formatMoney(due, workspace.activeBusiness?.currency)}</strong>
          </div>
        ) : null}

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
            {td('quickActions')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 8,
              alignItems: 'stretch',
            }}
          >
            <QuickTile
              icon={<Eye size={16} />}
              label={td('view')}
              onClick={() =>
                void openShopDocumentView(doc, auth.token, 'a4', workspace.tenantId).catch((error) =>
                  snackbar.push(error instanceof Error ? error.message : t('shop.vouchers.viewFailed'), 'error'),
                )
              }
            />
            <QuickTile icon={<Download size={16} />} label={td('pdf')} onClick={() => void onDownload('a4')} />
            <QuickTile icon={<Printer size={16} />} label={td('thermal')} onClick={() => void onDownload('thermal')} />
            <QuickTile
              icon={<Link2 size={16} />}
              label={td('copyLink')}
              disabled={loadingShare && !publicUrl}
              onClick={() => void onCopyLink()}
            />
          </div>
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
              {td('customerContact')}
            </div>
            {loadingShare ? <span style={{ fontSize: 12, color: '#6b7280' }}>{t('common.loading')}</span> : null}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
            {td('prefillHint')}
          </p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              {t('common.phone')}
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={td('phonePlaceholder')}
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              {t('common.email')}
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@email.com"
                style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
            {td('sendDevice')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="button" onClick={() => void onDeviceWhatsApp()}>
              <MessageCircle size={15} aria-hidden="true" /> WhatsApp
            </Button>
            <Button type="button" variant="neutral" onClick={() => void onDeviceSms()}>
              <Smartphone size={15} aria-hidden="true" /> SMS
            </Button>
            <Button type="button" variant="neutral" onClick={() => void onDeviceEmail()}>
              <Mail size={15} aria-hidden="true" /> {td('emailApp')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void printShopDocument(doc, auth.token, 'a4', workspace.tenantId).catch((error) =>
                  snackbar.push(error instanceof Error ? error.message : td('printFailed'), 'error'),
                )
              }
            >
              {td('printA4')}
            </Button>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
            {td('sendServer')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="button" variant="neutral" disabled={sending} onClick={() => void onServerSend(['whatsapp'])}>
              {td('serverWhatsapp')}
            </Button>
            <Button
              type="button"
              variant="neutral"
              disabled={sending || !email}
              onClick={() => void onServerSend(['email'])}
            >
              {td('serverEmail')}
            </Button>
            {due > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={sending}
                onClick={() => void onServerSend(['whatsapp', 'email'], true)}
              >
                {td('remindPayment')}
              </Button>
            ) : null}
          </div>
        </section>

        {publicUrl ? (
          <p style={{ margin: 0, fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>{publicUrl}</p>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {allowNewBill ? (
            <Button
              type="button"
              onClick={() => {
                onNewBill?.();
              }}
            >
              {td('newBill')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function QuickTile({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 0,
        width: '100%',
        padding: '12px 4px',
        borderRadius: 12,
        border: '1px solid var(--border, #e5e7eb)',
        background: 'var(--muted, #f3f4f6)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        color: 'var(--foreground)',
        font: '600 11px/1.2 inherit',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: 'var(--primary, #0f766e)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

function absoluteShareUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return raw;
  }
}

export type { ShopDocTarget };
export type { ShopDocumentKind };
