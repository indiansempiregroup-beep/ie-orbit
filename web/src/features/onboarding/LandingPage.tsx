import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5f7fb' }}>
      <div style={{ maxWidth: 960, width: '100%', display: 'grid', gap: 20 }}>
        <Card style={{ padding: 32 }}>
          <h1 style={{ marginTop: 0 }}>Get started with AppointIE</h1>
          <p style={{ color: '#6b7280' }}>Create your business workspace and start accepting bookings in minutes.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate('/auth/register/start')}>Start Free Trial</Button>
            <Button variant="ghost" onClick={() => navigate('/auth/register')}>Get Started</Button>
            <Button variant="neutral" onClick={() => alert('Request demo placeholder')}>Request Demo</Button>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <h3 style={{ margin: 0 }}>Already have an account?</h3>
          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" onClick={() => navigate('/auth')}>Sign in</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default LandingPage;
