import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'neutral' | 'ghost' };
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string; variant?: 'primary' | 'neutral' | 'ghost' };

export function Button({ variant = 'primary', style, children, className, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    border: 'none',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: '#4338ca', color: '#fff' },
    neutral: { background: '#fff', color: '#111827', border: '1px solid #e5e7eb' },
    ghost: { background: 'transparent', color: '#374151' },
  };
  return (
    <button className={`button ${className ?? ''}`} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ icon, label, variant = 'ghost', style, className, ...rest }: IconButtonProps) {
  const base: React.CSSProperties = {
    border: 'none',
    borderRadius: 14,
    width: 56,
    height: 56,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    background: 'transparent',
    color: '#374151',
    transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: '#4338ca', color: '#fff' },
    neutral: { background: '#fff', color: '#111827', border: '1px solid #e5e7eb' },
    ghost: { background: 'transparent', color: '#374151' },
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${className ?? ''}`}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}
