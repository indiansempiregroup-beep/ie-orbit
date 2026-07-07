import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'neutral' | 'ghost' };
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string; variant?: 'primary' | 'neutral' | 'ghost' };

export function Button({ variant = 'primary', style, children, className, ...rest }: ButtonProps) {
  const base: React.CSSProperties = {
    border: 'none',
    borderRadius: 12,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
    boxShadow: '0 1px 2px rgba(15, 22, 35, 0.04)',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 8px 16px rgba(26, 86, 219, 0.18)' },
    neutral: { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--muted-foreground)', boxShadow: 'none' },
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
    color: 'var(--muted-foreground)',
    transition: 'background-color 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
    boxShadow: '0 1px 2px rgba(15, 22, 35, 0.04)',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 8px 16px rgba(26, 86, 219, 0.18)' },
    neutral: { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--muted-foreground)', boxShadow: 'none' },
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
