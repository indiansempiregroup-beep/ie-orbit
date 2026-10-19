import React, { useState } from 'react';
import { HelpPanel, HelpTip } from './HelpTip';

type StatTone = 'default' | 'profit' | 'revenue' | 'cost' | 'warning' | 'info' | 'success';

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  /** Plain-language explanation shown via ? help tip */
  help?: string;
  tone?: StatTone;
  delta?: string;
  deltaPositive?: boolean | null;
  meter?: number; // 0..100 optional fill under the value
};

const TONE_STYLES: Record<
  StatTone,
  { accent: string; soft: string; value?: string }
> = {
  default: { accent: 'var(--border)', soft: 'var(--card)' },
  profit: { accent: '#0f766e', soft: 'color-mix(in srgb, #0f766e 10%, var(--card))', value: '#0f766e' },
  revenue: { accent: '#1d4ed8', soft: 'color-mix(in srgb, #1d4ed8 10%, var(--card))', value: '#1d4ed8' },
  cost: { accent: '#57534e', soft: 'color-mix(in srgb, #57534e 10%, var(--card))' },
  warning: { accent: '#b45309', soft: 'color-mix(in srgb, #b45309 12%, var(--card))', value: '#b45309' },
  info: { accent: '#0369a1', soft: 'color-mix(in srgb, #0369a1 10%, var(--card))', value: '#0369a1' },
  success: { accent: '#15803d', soft: 'color-mix(in srgb, #15803d 10%, var(--card))', value: '#15803d' },
};

export function StatCard({
  label,
  value,
  hint,
  help,
  tone = 'default',
  delta,
  deltaPositive = null,
  meter,
}: StatCardProps) {
  const palette = TONE_STYLES[tone] || TONE_STYLES.default;
  const meterWidth = Math.max(0, Math.min(100, Number.isFinite(meter) ? Number(meter) : -1));
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div
      style={{
        background: palette.soft,
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 108,
        display: 'grid',
        alignContent: 'start',
        gap: 6,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          borderRadius: '14px 0 0 14px',
          background: palette.accent,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          alignItems: 'start',
          paddingLeft: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            fontWeight: 600,
            minWidth: 0,
          }}
        >
          <span>{label}</span>
          {help ? (
            <HelpTip
              label={label}
              open={helpOpen}
              onToggle={() => setHelpOpen((value) => !value)}
            />
          ) : null}
        </div>
        {delta ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              background:
                deltaPositive === true
                  ? 'color-mix(in srgb, #15803d 14%, transparent)'
                  : deltaPositive === false
                    ? 'color-mix(in srgb, #b91c1c 14%, transparent)'
                    : 'color-mix(in srgb, var(--muted-foreground) 12%, transparent)',
              color:
                deltaPositive === true ? '#15803d' : deltaPositive === false ? '#b91c1c' : 'var(--muted-foreground)',
            }}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 750,
          marginTop: 2,
          paddingLeft: 6,
          color: palette.value || 'var(--foreground)',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', paddingLeft: 6, lineHeight: 1.35 }}>
          {hint}
        </div>
      ) : null}
      {meterWidth >= 0 ? (
        <div
          style={{
            marginTop: 6,
            marginLeft: 6,
            height: 5,
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--border) 80%, transparent)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${meterWidth}%`,
              height: '100%',
              borderRadius: 999,
              background: palette.accent,
            }}
          />
        </div>
      ) : null}
      {help ? (
        <HelpPanel
          title={label}
          help={help}
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
        />
      ) : null}
    </div>
  );
}
