export function NotFoundPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5f7fb' }}>
      <div style={{ maxWidth: 560, textAlign: 'center', background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 10px 40px rgba(15, 23, 42, 0.08)' }}>
        <h1 style={{ margin: 0, fontSize: 48 }}>404</h1>
        <p style={{ margin: '16px 0 0', color: '#374151', fontSize: 18 }}>The page you are looking for could not be found.</p>
      </div>
    </div>
  );
}
