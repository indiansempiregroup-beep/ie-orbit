import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createApiClient, type InvitationPreview } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { InviteAppDownload } from './InviteAppDownload';

type PageStatus = 'loading' | 'pending' | 'success' | 'accepted' | 'expired' | 'revoked' | 'invalid';

function roleLabel(role?: string | null) {
  if (role === 'manager') return 'manager';
  if (role === 'staff') return 'staff';
  return role || 'teammate';
}

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const client = useMemo(() => createApiClient({ baseUrl: '/api/v1' }), []);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [status, setStatus] = useState<PageStatus>(token ? 'loading' : 'invalid');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.invitations.preview(token);
        if (cancelled) return;
        const next = response.data;
        setPreview(next);
        if (next.status === 'pending') setStatus('pending');
        else if (next.status === 'accepted') setStatus('accepted');
        else if (next.status === 'expired') setStatus('expired');
        else if (next.status === 'revoked') setStatus('revoked');
        else setStatus('invalid');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  if (!token || status === 'invalid') {
    return (
      <Card>
        <h2>Invalid invitation</h2>
        <p>This invitation link is missing or is not valid.</p>
        <Link to="/auth">
          <Button variant="primary">Go to sign in</Button>
        </Link>
      </Card>
    );
  }

  if (status === 'loading') {
    return (
      <Card style={{ maxWidth: 520, margin: '0 auto' }}>
        <p role="status">Checking invitation…</p>
      </Card>
    );
  }

  if (status === 'expired' || status === 'revoked') {
    return (
      <Card style={{ maxWidth: 520, margin: '0 auto' }}>
        <p className="public-kicker">Team invitation</p>
        <h2 style={{ margin: '8px 0' }}>{status === 'expired' ? 'Invitation expired' : 'Invitation revoked'}</h2>
        <p style={{ color: 'var(--muted-foreground)' }}>
          {status === 'expired'
            ? 'This invitation has expired. Ask the business owner to send a new invite.'
            : 'This invitation was revoked. Ask the business owner to send a new invite.'}
        </p>
      </Card>
    );
  }

  if (status === 'success' || status === 'accepted') {
    const business = preview?.business_name || 'the team';
    const role = roleLabel(preview?.role);
    return (
      <Card style={{ maxWidth: 520, margin: '0 auto' }}>
        <p className="public-kicker">Team invitation</p>
        <h2 style={{ margin: '8px 0' }}>
          {status === 'success' ? 'Invitation accepted' : 'This invitation was already used'}
        </h2>
        <p style={{ color: 'var(--muted-foreground)' }}>
          {status === 'success'
            ? `You're now on ${business} as ${role}. This link can only be used once.`
            : `You're already on ${business}. This invite link only works once.`}
        </p>
        <InviteAppDownload email={preview?.email} />
        <div style={{ marginTop: 16 }}>
          <Link
            to="/auth"
            state={{
              email: preview?.email,
              message: "We'll send a one-time code to this email.",
            }}
            style={{ display: 'block' }}
          >
            <Button variant="primary" style={{ width: '100%' }}>
              Sign in
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 520, margin: '0 auto' }}>
      <p className="public-kicker">Team invitation</p>
      <h2 style={{ margin: '8px 0' }}>Accept your invitation</h2>
      <p style={{ color: 'var(--muted-foreground)' }}>
        {preview?.business_name
          ? `Join ${preview.business_name} as ${roleLabel(preview.role)}. After you accept, download the IE Orbit app to sign in. This link works once.`
          : 'Join this workspace with the name already saved on your staff profile. After you accept, download the IE Orbit app to sign in. This link works once.'}
      </p>

      <form
        style={{ display: 'grid', gap: 12, marginTop: 20 }}
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setErrorMessage(null);
          try {
            const result = await client.invitations.accept({ token });
            setPreview((current) => ({
              status: 'accepted',
              business_name: current?.business_name ?? null,
              role: current?.role ?? null,
              email: result.data.email,
            }));
            setStatus('success');
          } catch (error) {
            const message = getApiErrorMessage(error, 'Unable to accept invitation.');
            if (/already been used/i.test(message)) {
              setStatus('accepted');
              return;
            }
            setErrorMessage(message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {errorMessage ? <p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p> : null}

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </form>
    </Card>
  );
}
