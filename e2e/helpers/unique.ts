export function e2eRunId(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function e2eEmail(runId: string, label = 'customer'): string {
  return `${runId}-${label}@example.com`;
}

export function e2eMobile(runId: string): string {
  const digits = runId.replace(/\D/g, '').padEnd(9, '8').slice(-9);
  return `9${digits}`;
}
