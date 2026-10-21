import { OpsStoreBadges } from '../public/OpsStoreBadges';
import { detectPreferredOpsStore, preferredPhoneLabel } from '../../lib/preferredOpsStore';

export function InviteAppDownload({ email }: { email?: string | null }) {
  const preferred = detectPreferredOpsStore();
  const phone = preferredPhoneLabel(preferred);

  const intro =
    preferred === 'both'
      ? 'Keep bookings, billing, and the team in one place — get IE Orbit for iPhone or Android.'
      : `Looks like you're on ${phone}. Get IE Orbit and run the day from here.`;
  const signInLine = email ? ` Then sign in with a one-time code sent to ${email}.` : '';

  return (
    <div className="invite-app-download">
      <p>
        {intro}
        {signInLine}
      </p>
      <OpsStoreBadges preferred={preferred} />
    </div>
  );
}
