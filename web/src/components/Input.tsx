import React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { label, style, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label style={{ display: 'block', marginBottom: 12 }} htmlFor={inputId}>
      {label && <div style={{ marginBottom: 6, fontSize: 13, color: '#374151' }}>{label}</div>}
      <input
        id={inputId}
        ref={ref}
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
});

export default Input;
