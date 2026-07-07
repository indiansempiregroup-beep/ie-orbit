type TrendPoint = { day: string; total: number; completed: number };

export function TrendChart({ rows }: { rows: TrendPoint[] }) {
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.slice(-14).map((row) => (
        <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.day.slice(5)}</span>
          <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(row.total / max) * 100}%`,
                height: '100%',
                background: 'var(--primary)',
              }}
            />
          </div>
          <span style={{ fontSize: 12 }}>{row.total}</span>
        </div>
      ))}
    </div>
  );
}
