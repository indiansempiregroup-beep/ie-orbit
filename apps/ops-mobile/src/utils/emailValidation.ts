const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailFieldError(email: string, required = true): string | null {
  const trimmed = email.trim();
  if (!trimmed) return required ? 'Email is required' : null;
  if (!EMAIL_PATTERN.test(trimmed)) return `Invalid email address: ${trimmed}`;
  return null;
}

export function invalidEmailMessage(email: string): string | null {
  return emailFieldError(email, true);
}
