type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{value}</div>
      {hint ? <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}
