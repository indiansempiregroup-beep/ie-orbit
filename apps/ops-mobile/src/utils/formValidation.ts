export function requiredMessage(label: string): string {
  return `${label} is required`;
}

export function indianMobileError(value: string, required = false): string | null {
  const compact = value.replace(/[\s-]/g, '');
  if (!compact) return required ? 'Phone number is required' : null;
  if (!/^(\+91)?[6-9]\d{9}$/.test(compact)) {
    return 'Enter a valid 10-digit Indian mobile number';
  }
  return null;
}

export function websiteFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(url);
    return null;
  } catch {
    return 'Enter a valid website URL (for example, https://yoursalon.com)';
  }
}

export function passwordFieldError(
  value: string,
  options: { required?: boolean; confirm?: string } = {},
): string | null {
  const required = options.required ?? true;
  if (!value) return required ? 'Password is required' : null;
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(value)) return 'Include at least one uppercase letter';
  if (!/[a-z]/.test(value)) return 'Include at least one lowercase letter';
  if (!/[0-9]/.test(value)) return 'Include at least one number';
  if (/^(password|qwerty|12345678)/i.test(value)) return 'Choose a less common password';
  if (options.confirm !== undefined && value !== options.confirm) return 'Passwords do not match';
  return null;
}
