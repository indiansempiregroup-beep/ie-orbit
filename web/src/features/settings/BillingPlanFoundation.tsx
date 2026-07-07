import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useBillingCheckout, useBillingStatusQuery } from './billingHooks';

export function BillingPlanFoundation() {
  const statusQuery = useBillingStatusQuery();
  const checkout = useBillingCheckout();
  const snackbar = useSnackbar();

  const status = statusQuery.data;
  const isConfigured = status?.configured ?? false;
  const mockMode = status?.mock_mode ?? true;

  return (
    <Card>
      <p className="public-kicker">Billing foundation</p>
      <h2 style={{ margin: '8px 0' }}>Razorpay checkout</h2>
      <p style={{ color: 'var(--muted-foreground)', marginTop: 0 }}>
        {isConfigured
          ? 'Payments are configured. You can start a Razorpay checkout for AppointIE Starter.'
          : 'Razorpay is not configured yet. Checkout runs in mock mode until you add API keys.'}
      </p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <p style={{ margin: 0 }}>
          <strong>Provider:</strong> {status?.provider ?? 'razorpay'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Currency:</strong> {status?.currency ?? 'INR'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Mode:</strong> {mockMode ? 'Mock (no live charges)' : 'Live'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <Button
          variant="primary"
          disabled={checkout.isPending}
          onClick={() =>
            checkout.mutate(
              { product_code: 'appointie', plan_code: 'appointie-starter' },
              {
                onSuccess: (session) => {
                  if (session.mock_mode) {
                    snackbar.push(
                      `Mock order ${session.order_id} created. Add Razorpay keys to enable live checkout.`,
                      'success',
                    );
                  } else {
                    snackbar.push(`Checkout order ${session.order_id} created.`, 'success');
                  }
                },
                onError: (error) => snackbar.push(error.message, 'error'),
              },
            )
          }
        >
          {checkout.isPending ? 'Creating checkout…' : mockMode ? 'Create mock checkout' : 'Upgrade with Razorpay'}
        </Button>
        <Link to="/pricing">
          <Button variant="ghost">View pricing</Button>
        </Link>
      </div>

      {!isConfigured ? (
        <p style={{ marginTop: 16, color: 'var(--muted-foreground)', fontSize: 14 }}>
          When your Razorpay account is ready, set <code>RAZORPAY_KEY_ID</code>,{' '}
          <code>RAZORPAY_KEY_SECRET</code>, and <code>RAZORPAY_WEBHOOK_SECRET</code> in the backend environment.
        </p>
      ) : null}
    </Card>
  );
}
