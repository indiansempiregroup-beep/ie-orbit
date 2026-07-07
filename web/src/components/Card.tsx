import React from 'react';

export function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ background: 'var(--card)', borderRadius: 16, padding: 20, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(15, 22, 35, 0.04)', ...style }}>
      {children}
    </div>
  );
}
