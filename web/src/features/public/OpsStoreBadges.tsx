import { Link } from 'react-router-dom';
import { OPS_ANDROID_STORE_URL, OPS_IOS_STORE_URL } from '../../seo/config';
import { trackEvent } from '../../seo/analytics';

const badges = [
  {
    href: OPS_IOS_STORE_URL,
    platform: 'ios' as const,
    kicker: 'Download on the',
    name: 'App Store',
    label: 'Download IE Orbit on the App Store',
    icon: AppleMark,
  },
  {
    href: OPS_ANDROID_STORE_URL,
    platform: 'android' as const,
    kicker: 'Get it on',
    name: 'Google Play',
    label: 'Download IE Orbit on Google Play',
    icon: PlayMark,
  },
];

function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 12.81c-.03-3.04 2.48-4.5 2.59-4.57-1.41-2.06-3.61-2.34-4.39-2.37-1.87-.19-3.65 1.1-4.6 1.1-.95 0-2.42-1.07-3.98-1.04-2.05.03-3.94 1.19-4.99 3.02-2.13 3.69-.54 9.16 1.53 12.16 1.01 1.47 2.22 3.12 3.8 3.06 1.54-.06 2.12-.99 3.98-.99 1.86 0 2.39.99 3.99.96 1.65-.03 2.7-1.5 3.71-2.98 1.17-1.71 1.65-3.37 1.68-3.46-.04-.02-3.21-1.23-3.24-4.89ZM13.5 5.4c.85-1.03 1.42-2.46 1.26-3.9-1.22.05-2.7.81-3.58 1.84-.79.91-1.48 2.37-1.29 3.77 1.37.11 2.77-.7 3.61-1.71Z"
      />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M3.2 2.4 13.3 12 3.2 21.6V2.4Z" />
      <path fill="#FBBC04" d="m13.3 12 4.4-4.2 3.7 2.1c.9.5.9 1.9 0 2.4l-3.7 2.1L13.3 12Z" />
      <path fill="#4285F4" d="M3.2 21.6 13.3 12l4.4 4.2-9.7 5.6c-1.3.8-3 .2-3.5-1.2Z" />
      <path fill="#34A853" d="M3.2 2.4c.5-1.4 2.2-2 3.5-1.2l9.7 5.6-4.4 4.2L3.2 2.4Z" />
    </svg>
  );
}

export function OpsStoreBadges({ className }: { className?: string }) {
  return (
    <div className={`public-store-badges${className ? ` ${className}` : ''}`} aria-label="Download on iOS and Android">
      {badges.map((badge) => {
        const Icon = badge.icon;
        const onClick = () =>
          trackEvent('select_content', { content_type: 'ops_app_download', item_id: badge.platform });
        const inner = (
          <>
            <Icon />
            <span>
              <small>{badge.kicker}</small>
              <b>{badge.name}</b>
            </span>
          </>
        );
        if (isExternal(badge.href)) {
          return (
            <a
              key={badge.platform}
              className="public-store-badge"
              href={badge.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={badge.label}
              onClick={onClick}
            >
              {inner}
            </a>
          );
        }
        return (
          <Link
            key={badge.platform}
            className="public-store-badge"
            to={badge.href}
            aria-label={badge.label}
            onClick={onClick}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
