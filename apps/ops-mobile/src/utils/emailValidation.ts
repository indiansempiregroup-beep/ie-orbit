const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalidEmailMessage(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required';
  if (!EMAIL_PATTERN.test(trimmed)) return `Invalid email address: ${trimmed}`;
  return null;
}
