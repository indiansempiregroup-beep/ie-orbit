import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { getApiErrorMessage } from '../../lib/apiClient';

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const client = useMemo(() => createApiClient({ baseUrl: '/api/v1' }), []);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});

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
        Confirm your name to join the workspace. After accepting, sign in with a one-time code sent to your invited email.
      </p>

      <form
        style={{ display: 'grid', gap: 12, marginTop: 20 }}
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus('submitting');
          setErrorMessage(null);
          try {
            const nextErrors: { firstName?: string; lastName?: string } = {};
            if (!firstName.trim()) nextErrors.firstName = 'First name is required';
            if (!lastName.trim()) nextErrors.lastName = 'Last name is required';
            if (Object.keys(nextErrors).length) {
              setFieldErrors(nextErrors);
              setStatus('idle');
              return;
            }
            setFieldErrors({});
            await client.invitations.accept({
              token,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            });
            setStatus('success');
            navigate('/auth', { replace: true, state: { message: 'Invitation accepted. Sign in with OTP to continue.' } });
          } catch (error) {
            setStatus('error');
            setErrorMessage(getApiErrorMessage(error, 'Unable to accept invitation.'));
          }
        }}
      >
        <label style={{ display: 'grid', gap: 8 }}>
          <span>First name</span>
          <Input
            required
            value={firstName}
            onChange={(event) => {
              setFirstName(event.target.value);
              setFieldErrors((current) => ({ ...current, firstName: undefined }));
            }}
            error={fieldErrors.firstName}
          />
        </label>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Last name</span>
          <Input
            required
            value={lastName}
            onChange={(event) => {
              setLastName(event.target.value);
              setFieldErrors((current) => ({ ...current, lastName: undefined }));
            }}
            error={fieldErrors.lastName}
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
