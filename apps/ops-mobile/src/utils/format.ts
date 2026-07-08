export function formatRelativeTime(isoDate?: string | null) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

export function formatDateTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  const date = new Date(isoDate);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(isoDate?: string | null) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function mapBookingStatus(status: string): 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'noshow' {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
    case 'in_progress':
      return 'confirmed';
    case 'cancelled':
    case 'rejected':
      return 'cancelled';
    case 'completed':
      return 'completed';
    case 'no_show':
      return 'noshow';
    default:
      return 'pending';
  }
}

import { ApiClientError } from '@ie-platform/sdk';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.payload.error.message || error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
