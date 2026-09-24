import React from 'react';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  compact?: boolean;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
};

export const Select = React.forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, compact = false, required, options, style, id, className, ...rest },
  ref,
) {
  const selectId = id ?? rest.name;
  return (
    <label className={`ui-field${compact ? ' ui-field--compact' : ''}`} htmlFor={selectId}>
      {label ? (
        <span className="ui-field-label">
          {label}
          {required ? (
            <span className="ui-field-required" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </span>
      ) : null}
      <select
        id={selectId}
        ref={ref}
        className={['ui-control', 'ui-control--select', error ? 'is-error' : '', className]
          .filter(Boolean)
          .join(' ')}
        {...rest}
        style={style}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="field-error">
          {error}
        </span>
      ) : null}
    </label>
  );
});

export default Select;
