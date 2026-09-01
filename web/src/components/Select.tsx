import React from 'react';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  compact?: boolean;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
};

export const Select = React.forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, compact = false, required, options, style, id, ...rest },
  ref,
) {
  const selectId = id ?? rest.name;
  return (
    <label style={{ display: 'block', marginBottom: compact ? 0 : 12 }} htmlFor={selectId}>
      {label ? (
        <div style={{ marginBottom: 6, fontSize: 13, color: '#374151' }}>
          {label}
          {required ? <span aria-hidden="true" style={{ color: '#dc2626' }}> *</span> : null}
        </div>
      ) : null}
      <select
        id={selectId}
        ref={ref}
        {...rest}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${error ? '#dc2626' : '#e5e7eb'}`,
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
          background: '#fff',
          ...(style as React.CSSProperties),
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#dc2626' }}>
          {error}
        </span>
      ) : null}
    </label>
  );
});

export default Select;
