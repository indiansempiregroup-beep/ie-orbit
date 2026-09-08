import React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  required?: boolean;
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { label, required, error, style, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label style={{ display: 'block', marginBottom: 12, minWidth: 0 }} htmlFor={inputId}>
      {label && (
        <div style={{ marginBottom: 6, fontSize: 13, color: 'var(--foreground)' }}>
          {label}
          {required ? <span aria-hidden="true" style={{ color: '#dc2626' }}> *</span> : null}
        </div>
      )}
      <input
        id={inputId}
        ref={ref}
        {...rest}
        required={required}
        aria-invalid={Boolean(error) || rest['aria-invalid']}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 6,
          border: `1px solid ${error ? '#dc2626' : 'var(--border)'}`,
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
          ...(style as React.CSSProperties),
        }}
      />
      {error ? (
        <span role="alert" className="field-error">
          {error}
        </span>
      ) : null}
    </label>
  );
});

export default Input;
