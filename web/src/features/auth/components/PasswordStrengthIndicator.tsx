type PasswordStrengthIndicatorProps = {
  password: string;
};

function scorePassword(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;
  const score = scorePassword(password);
  const label = labels[Math.max(0, Math.min(score - 1, labels.length - 1))];

  return (
    <div className="password-strength" aria-live="polite">
      <div className="password-strength-bars" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className={index < score ? 'active' : undefined} />
        ))}
      </div>
      <span className="password-strength-label">Password strength: {label}</span>
    </div>
  );
}
