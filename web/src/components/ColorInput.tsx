type ColorInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function ColorInput({ label, value, onChange, id }: ColorInputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
  const normalized = normalizeHexColor(value, '#000000');

  return (
    <label className="color-input" htmlFor={inputId}>
      <span className="color-input-label">{label}</span>
      <div className="color-input-row">
        <input
          id={inputId}
          type="color"
          className="color-input-picker"
          value={normalized}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="color-input-value" aria-live="polite">
          {normalized.toUpperCase()}
        </span>
      </div>
    </label>
  );
}

export default ColorInput;
