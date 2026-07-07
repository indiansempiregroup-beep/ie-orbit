import React from 'react';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
};

export function Select({ label, error, options, style, id, ...rest }: Props) {
  const selectId = id ?? rest.name;
  return (
    <label style={{ display: 'block', marginBottom: 12 }} htmlFor={selectId}>
      {label ? <div style={{ marginBottom: 6, fontSize: 13, color: '#374151' }}>{label}</div> : null}
      <select
        id={selectId}
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
}
