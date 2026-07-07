function normalizeHex(color: string): string | null {
  const trimmed = color.trim();
  if (!trimmed.startsWith('#')) return null;
  let hex = trimmed.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length === 8) {
    hex = hex.slice(0, 6);
  }
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return hex;
}

export function withAlpha(color: string, alpha: number): string {
  const hex = normalizeHex(color);
  if (!hex) return color;
  const clamped = Math.max(0, Math.min(1, alpha));
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

export function buildBrandSplashGradient(primary: string, secondary: string): [string, string, string] {
  return [withAlpha(secondary, 0.38), withAlpha(primary, 0.16), '#ffffff'];
}
