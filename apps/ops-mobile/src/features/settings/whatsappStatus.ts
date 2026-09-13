import type { WhatsAppNotificationSettings } from '@ie-orbit/sdk';
import { colors } from '../../theme/tokens';
import { formatDateTime } from '../../utils/format';

export type WhatsAppStatusTone = 'success' | 'warning' | 'danger' | 'muted';

export function whatsappStatusLabel(
  status: WhatsAppNotificationSettings['status'],
  lastError?: string,
) {
  if (lastError) return 'Needs attention';
  switch (status) {
    case 'live':
      return 'Live';
    case 'paused':
      return 'Paused';
    case 'verification_required':
      return 'Templates pending';
    case 'not_in_plan':
      return 'Not in plan';
    default:
      return 'Not configured';
  }
}

export function whatsappStatusTone(
  status: WhatsAppNotificationSettings['status'],
  lastError?: string,
): WhatsAppStatusTone {
  if (lastError) return 'danger';
  switch (status) {
    case 'live':
      return 'success';
    case 'paused':
    case 'verification_required':
      return 'warning';
    case 'not_in_plan':
      return 'danger';
    default:
      return 'muted';
  }
}

export function whatsappStatusColors(tone: WhatsAppStatusTone) {
  switch (tone) {
    case 'success':
      return { bg: colors.successSoft, text: '#047857' };
    case 'warning':
      return { bg: colors.warningSoft, text: '#B45309' };
    case 'danger':
      return { bg: colors.destructiveSoft, text: '#B91C1C' };
    default:
      return { bg: colors.muted, text: '#475569' };
  }
}

export function whatsappConnectionSubtitle(settings: WhatsAppNotificationSettings | null) {
  if (!settings) return 'Loading connection…';
  if (settings.display_number) return settings.display_number;
  if (settings.status === 'not_in_plan') return 'WhatsApp notifications are not in this plan.';
  if (settings.configured) return 'Cloud API number linked.';
  return 'Connect your Cloud API number below.';
}

export function whatsappConnectionHint(settings: WhatsAppNotificationSettings | null) {
  if (!settings) return 'Checking WhatsApp connection.';
  if (settings.last_error) return settings.last_error;
  const counts = settings.template_counts;
  const approved = counts ? `${counts.approved} of ${counts.total} templates approved` : '';
  const tested = settings.last_tested_at ? `Last verified ${formatDateTime(settings.last_tested_at)}` : '';
  const quality = settings.quality_rating ? `Quality ${settings.quality_rating}` : '';
  const extra = [tested, quality, approved].filter(Boolean).join(' · ');

  switch (settings.status) {
    case 'live':
      return extra || 'Ready to send to customers who opt in.';
    case 'paused':
      return extra ? `Sending is paused. ${extra}` : 'Sending is paused. Credentials are kept.';
    case 'verification_required':
      return extra
        ? `Number is linked. Sync templates and wait for Meta approval. ${extra}`
        : 'Number is linked. Sync templates and wait for Meta approval before customers can receive messages.';
    case 'not_in_plan':
      return 'Upgrade your plan to include WhatsApp notifications.';
    default:
      return 'Add Phone number ID, WABA ID, and a permanent token, then Save & test.';
  }
}
