import { formatMoney } from '../lib/currency';

export type RewardPointsBannerProps = {
  earned?: number;
  pending?: number;
  redeemed?: number;
  reversed?: number;
  remaining?: number;
  discountAmount?: number;
  reversalReason?: string;
  currency?: string | null;
};

export function RewardPointsBanner({
  earned = 0,
  pending = 0,
  redeemed = 0,
  reversed = 0,
  remaining,
  discountAmount = 0,
  reversalReason = '',
  currency,
}: RewardPointsBannerProps) {
  const kept = remaining != null ? remaining : Math.max(0, earned - reversed);
  if (!(earned || pending || redeemed || reversed)) return null;

  const fullyReversed = reversed > 0 && kept <= 0;
  const tone = fullyReversed ? 'reversed' : earned > 0 ? 'earned' : pending > 0 ? 'pending' : 'used';
  const hero = fullyReversed ? reversed : earned > 0 ? earned : pending > 0 ? pending : redeemed;
  const heroPrefix = fullyReversed || (earned <= 0 && pending <= 0 && redeemed > 0) ? '−' : '+';
  const title = fullyReversed
    ? 'Points reversed'
    : earned > 0
      ? 'Points given'
      : pending > 0
        ? 'Will earn'
        : 'Points used';
  const subtitle = fullyReversed
    ? reversalReason || 'These points were taken back after cancel or refund.'
    : earned > 0
      ? reversed > 0
        ? `${kept} still kept · ${reversalReason || 'some points were reversed'}`
        : 'Credited when this appointment was completed.'
      : pending > 0
        ? 'These points credit when the appointment is completed.'
        : discountAmount > 0
          ? `Customer saved ${formatMoney(discountAmount, currency)} on this bill.`
          : 'Redeemed on this booking.';

  return (
    <div className={`reward-banner reward-banner--${tone}`}>
      <div className="reward-banner__hero">
        <div className="reward-banner__icon" aria-hidden="true">
          {fullyReversed ? '↺' : '✦'}
        </div>
        <div className="reward-banner__copy">
          <div className="reward-banner__eyebrow">{title}</div>
          <div className="reward-banner__points">
            {heroPrefix}
            {hero}
            <span> pts</span>
          </div>
          <div className="reward-banner__subtitle">{subtitle}</div>
        </div>
      </div>
      {earned > 0 || redeemed > 0 || reversed > 0 || discountAmount > 0 || pending > 0 ? (
        <div className="reward-banner__chips">
          {earned > 0 ? <span className="reward-chip reward-chip--ok">Given +{earned}</span> : null}
          {pending > 0 && earned <= 0 ? (
            <span className="reward-chip reward-chip--warn">Will earn +{pending}</span>
          ) : null}
          {redeemed > 0 ? <span className="reward-chip reward-chip--warn">Used −{redeemed}</span> : null}
          {discountAmount > 0 ? (
            <span className="reward-chip reward-chip--ok">
              Saved {formatMoney(discountAmount, currency)}
            </span>
          ) : null}
          {reversed > 0 ? <span className="reward-chip reward-chip--danger">Reversed −{reversed}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
