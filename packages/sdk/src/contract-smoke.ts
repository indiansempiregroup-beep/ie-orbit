import { createApiClient, type ApiEnvelope, type Booking } from './index';

const client = createApiClient({ baseUrl: 'https://example.test/api' });

void client.auth.login({ email: 'user@example.com', password: 'secret123' });
void client.bookings.list({ status: 'confirmed' });
void client.health.getLiveness();

const envelope: ApiEnvelope<Booking> = {
  data: {
    id: 'booking-1',
    booking_number: 'BK-1001',
    status: 'confirmed',
  },
  meta: {
    request_id: 'req-1',
    timestamp: '2025-01-01T00:00:00Z',
  },
};

void envelope;
