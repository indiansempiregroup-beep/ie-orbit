import React from 'react';

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 6px 18px rgba(15,23,42,0.06)', ...style }}>
      {children}
    </div>
  );
}
