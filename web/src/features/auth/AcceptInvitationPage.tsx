import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { getApiErrorMessage } from '../../lib/apiClient';

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const client = useMemo(() => createApiClient({ baseUrl: '/api/v1' }), []);

  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <Card>
        <h2>Invalid invitation</h2>
        <p>This invitation link is missing a token.</p>
        <Link to="/auth">
          <Button variant="primary">Go to sign in</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 520, margin: '0 auto' }}>
      <p className="public-kicker">Team invitation</p>
      <h2 style={{ margin: '8px 0' }}>Accept your invitation</h2>
      <p style={{ color: 'var(--muted-foreground)' }}>
        Create your account password to join the workspace. If you already have an account, leave password blank and sign in after accepting.
      </p>

      <form
        style={{ display: 'grid', gap: 12, marginTop: 20 }}
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus('submitting');
          setErrorMessage(null);
          try {
            await client.invitations.accept({
              token,
              password: password || undefined,
              first_name: firstName || undefined,
              last_name: lastName || undefined,
            });
            setStatus('success');
            navigate('/auth', { replace: true, state: { message: 'Invitation accepted. Sign in to continue.' } });
          } catch (error) {
            setStatus('error');
            setErrorMessage(getApiErrorMessage(error, 'Unable to accept invitation.'));
          }
        }}
      >
        <label style={{ display: 'grid', gap: 8 }}>
          <span>First name</span>
          <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Last name</span>
          <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Password</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters for new accounts"
            minLength={8}
          />
        </label>

        {status === 'error' && errorMessage ? (
          <p style={{ color: '#dc2626', margin: 0 }}>{errorMessage}</p>
        ) : null}

        <Button type="submit" variant="primary" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </form>
    </Card>
  );
}
