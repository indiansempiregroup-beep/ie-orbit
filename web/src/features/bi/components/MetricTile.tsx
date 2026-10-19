import React, { useState } from 'react';
import { HelpPanel, HelpTip } from './HelpTip';

type Tone = 'positive' | 'negative' | 'warning' | 'neutral';
type MetricIcon = 'gift' | 'trending-up' | 'tag';

type Props = {
  label: string;
  value: React.ReactNode;
  help: string;
  /** Short hover tooltip on the whole chip */
  title?: string;
  icon?: MetricIcon;
  tone?: Tone;
};

const TONE: Record<Tone, { bg: string; border: string; accent: string; iconBg: string }> = {
  positive: { bg: '#ECFDF5', border: '#A7F3D0', accent: '#0f766e', iconBg: '#D1FAE5' },
  negative: { bg: '#FFF1F2', border: '#FECDD3', accent: '#be123c', iconBg: '#FFE4E6' },
  warning: { bg: '#FFFBEB', border: '#FDE68A', accent: '#b45309', iconBg: '#FEF3C7' },
  neutral: {
    bg: 'var(--card)',
    border: 'var(--border)',
    accent: 'var(--foreground)',
    iconBg: 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)',
  },
};

function MetricIconMark({ name, color }: { name: MetricIcon; color: string }) {
  if (name === 'gift') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden>
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    );
  }
  if (name === 'tag') {
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

/** Compact inline chip: icon + value + help tip. */
export function MetricTile({ label, value, help, title, icon, tone = 'neutral' }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const palette = TONE[tone];

  return (
    <div
      title={title || help}
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        padding: '3px 4px 3px 5px',
        borderRadius: 8,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        maxWidth: '100%',
        whiteSpace: 'nowrap',
      }}
    >
      {icon ? (
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            display: 'inline-grid',
            placeItems: 'center',
            background: palette.iconBg,
            color: palette.accent,
            flexShrink: 0,
          }}
        >
          <MetricIconMark name={icon} color={palette.accent} />
        </span>
      ) : null}
      <span
        style={{
          fontWeight: 700,
          fontSize: 12,
          color: palette.accent,
          lineHeight: 1.2,
          minWidth: 0,
        }}
      >
        {value}
      </span>
      <HelpTip label={label} open={helpOpen} onToggle={() => setHelpOpen((open) => !open)} size="sm" />
      <HelpPanel title={label} help={help} open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
