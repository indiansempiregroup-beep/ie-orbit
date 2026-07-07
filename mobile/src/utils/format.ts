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

export function isUpcomingBooking(status: string, startAt: string) {
  const inactive = new Set(['cancelled', 'completed', 'rejected', 'no_show', 'expired']);
  return new Date(startAt) >= new Date() && !inactive.has(status);
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
