import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AdminPageHeader({
  eyebrow = 'IE Platform',
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__copy">
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1 className="admin-page-title">{title}</h1>
        {description ? <p className="admin-page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-panel ${className}`.trim()}>
      {(title || actions) && (
        <div className="admin-panel__head">
          <div>
            {title ? <h2 className="admin-panel__title">{title}</h2> : null}
            {description ? <p className="admin-panel__desc">{description}</p> : null}
          </div>
          {actions ? <div className="admin-panel__actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function AdminKpi({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}) {
  return (
    <article className={`admin-kpi admin-kpi--${tone}`}>
      <p className="admin-kpi__label">{label}</p>
      <p className="admin-kpi__value">{value}</p>
      {hint ? <p className="admin-kpi__hint">{hint}</p> : null}
    </article>
  );
}

export function AdminStatus({ status }: { status?: string | null }) {
  const normalized = (status || 'unknown').toLowerCase();
  const tone =
    normalized.includes('active') || normalized.includes('ready') || normalized.includes('paid')
      ? 'good'
      : normalized.includes('trial') || normalized.includes('pending')
        ? 'warn'
        : normalized.includes('suspend') ||
            normalized.includes('fail') ||
            normalized.includes('archiv') ||
            normalized.includes('lock')
          ? 'danger'
          : 'neutral';
  return <span className={`admin-status admin-status--${tone}`}>{normalized}</span>;
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}

export function AdminListRow({
  title,
  meta,
  trailing,
  onClick,
  href,
  style,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  style?: CSSProperties;
}) {
  const content = (
    <>
      <div className="admin-list-row__main">
        <div className="admin-list-row__title">{title}</div>
        {meta ? <div className="admin-list-row__meta">{meta}</div> : null}
      </div>
      {trailing ? <div className="admin-list-row__trailing">{trailing}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link className="admin-list-row" to={href} style={style}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className="admin-list-row" onClick={onClick} style={style}>
        {content}
      </button>
    );
  }

  return (
    <div className="admin-list-row admin-list-row--static" style={style}>
      {content}
    </div>
  );
}
