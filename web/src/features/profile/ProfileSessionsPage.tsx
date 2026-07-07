import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAuth } from '../../hooks/useAuth';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';

export function ProfileSessionsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const theme = useTheme();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState<string | null>(null);
  const [userAgent, setUserAgent] = useState('');
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserAgent(navigator.userAgent);
      setPlatform(navigator.platform || 'Unknown');
      setSessionStarted(localStorage.getItem('ie:auth:session_started'));
    }
  }, []);

  async function handleSignOutAllSessions() {
    setProcessing(true);
    setErrorMessage(null);

    try {
      await auth.logout(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out of all sessions. Please try again.';
      setErrorMessage(message);
      snackbar.push(message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Sessions</p>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>Review active sessions</h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Sign out of all active sessions and close access from other browsers and devices.</p>
        </div>

        <Card>
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 16, background: theme.resolved === 'dark' ? '#111827' : '#ffffff' }}>
              <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>Current session</p>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Device</span>
                  <strong>{platform || 'Unknown device'}</strong>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Browser</span>
                  <strong>{userAgent || 'Unknown browser'}</strong>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Status</span>
                  <strong>Active</strong>
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Started</span>
                  <strong>{sessionStarted ? new Date(sessionStarted).toLocaleString() : 'Unknown'}</strong>
                </div>
              </div>
            </div>

            <div style={{ color: '#374151', lineHeight: 1.7 }}>
              <p style={{ margin: 0 }}>This workspace currently only shows your current active session. Sign out of all other sessions to revoke access from other browsers and devices.</p>
            </div>

            {errorMessage ? (
              <div style={{ color: '#dc2626', padding: 12, borderRadius: 12, background: '#fef2f2' }}>{errorMessage}</div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <Button variant="ghost" type="button" onClick={() => navigate(-1)} disabled={processing}>
                Back
              </Button>
              <Button variant="primary" type="button" onClick={handleSignOutAllSessions} disabled={processing}>
                {processing ? 'Signing out…' : 'Sign out of all sessions'}
              </Button>
            </div>

            <div style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>
              Signing out of all sessions will close your account access everywhere, including the current browser. You will be redirected to the login screen.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
