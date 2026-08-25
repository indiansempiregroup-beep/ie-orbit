import { useState } from 'react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';

export function ContactPage() {
  usePageMeta({
    title: 'Contact — IE Orbit',
    description: 'Contact the IE Orbit team for support and sales inquiries.',
  });

  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="public-page public-page-narrow">
      <h1>Contact us</h1>
      <p>Reach out for demos, support, or partnership inquiries about AppointIE and ShopIE.</p>
      <Card>
        {submitted ? (
          <p role="status">Thank you. We will respond within two business days.</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <Input label="Name" name="name" required autoComplete="name" />
            <Input label="Email" name="email" type="email" required autoComplete="email" />
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontSize: 13, color: '#374151' }}>Message</div>
              <textarea
                name="message"
                required
                rows={5}
                style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb', padding: '10px 12px' }}
              />
            </label>
            <Button type="submit" variant="primary">
              Send message
            </Button>
          </form>
        )}
      </Card>
      <p style={{ color: 'var(--muted-foreground)' }}>Email: support@indiansempire.com</p>
    </div>
  );
}
