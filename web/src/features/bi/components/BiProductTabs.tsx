import type { CSSProperties } from 'react';

export type BiProductKey = 'appointie' | 'shopie';

const trackStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
  padding: 4,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'color-mix(in srgb, var(--muted-foreground) 6%, var(--card))',
  maxWidth: 420,
};

function tabStyle(active: boolean): CSSProperties {
  return {
    border: 'none',
    background: active ? 'var(--card)' : 'transparent',
    color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
    boxShadow: active ? '0 1px 2px color-mix(in srgb, var(--foreground) 10%, transparent)' : 'none',
    borderRadius: 9,
    padding: '9px 12px',
    font: 'inherit',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  };
}

export function BiProductTabs({
  showAppointie,
  showShopie,
  value,
  onChange,
}: {
  showAppointie: boolean;
  showShopie: boolean;
  value: BiProductKey;
  onChange: (next: BiProductKey) => void;
}) {
  if (!(showAppointie && showShopie)) return null;
  return (
    <div role="tablist" aria-label="Product" style={trackStyle}>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'appointie'}
        style={tabStyle(value === 'appointie')}
        onClick={() => onChange('appointie')}
      >
        Orbit Appoint
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'shopie'}
        style={tabStyle(value === 'shopie')}
        onClick={() => onChange('shopie')}
      >
        Orbit Mart
      </button>
    </div>
  );
}
