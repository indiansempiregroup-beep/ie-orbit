import React from 'react';

type SpinnerProps = {
  size?: number;
  animated?: boolean;
};

export function Spinner({ size = 28, animated = false }: SpinnerProps) {
  return (
    <div
      className={animated ? 'submit-spinner' : undefined}
      style={{ width: size, height: size, display: 'inline-block' }}
      aria-hidden
    >
      <svg viewBox="0 0 50 50" width={size} height={size}>
        <circle cx="25" cy="25" r="20" fill="none" stroke="var(--muted, #e5e7eb)" strokeWidth="6" />
        <path
          d="M45 25a20 20 0 0 1-20 20"
          stroke="var(--primary, #4338ca)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
