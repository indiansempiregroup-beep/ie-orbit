import React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export function Input({ label, style, ...rest }: Props) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {label && <div style={{ marginBottom: 6, fontSize: 13, color: '#374151' }}>{label}</div>}
      <input
        {...rest}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
          ...(style as React.CSSProperties),
        }}
      />
    </label>
  );
}

export default Input;
