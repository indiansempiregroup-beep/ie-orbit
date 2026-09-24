import React from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  required?: boolean;
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { label, required, error, style, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label className="ui-field" htmlFor={inputId}>
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
      <input
        id={inputId}
        ref={ref}
        className={['ui-control', error ? 'is-error' : '', className].filter(Boolean).join(' ')}
        {...rest}
        required={required}
        aria-invalid={Boolean(error) || rest['aria-invalid']}
        style={style}
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
