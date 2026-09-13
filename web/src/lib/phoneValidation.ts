export function indianMobileError(value: string, required = false): string | null {
  const compact = value.replace(/[\s-]/g, '');
  if (!compact) return required ? 'Phone number is required' : null;
  if (!/^(\+91)?[6-9]\d{9}$/.test(compact)) {
    return 'Enter a valid 10-digit Indian mobile number';
  }
  return null;
}
