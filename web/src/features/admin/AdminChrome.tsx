import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';

export const ADMIN_PRODUCT_LABELS: Record<string, string> = {
  appointie: 'Orbit Appoint',
  shopie: 'Orbit Mart',
};

export function productLabel(code?: string | null) {
  if (!code) return '—';
  return ADMIN_PRODUCT_LABELS[code] ?? code.replace(/-/g, ' ');
}

export function planLabel(code?: string | null, name?: string | null) {
  if (name) {
    const stripped = name.replace(/^(Orbit Appoint|Orbit Mart|AppointIE|ShopIE)\s+/i, '').trim();
    if (stripped && !/appointie|shopie/i.test(stripped)) return stripped;
  }
  const value = (code ?? '').toLowerCase();
  if (value.includes('pro')) return 'Pro';
  if (value.includes('starter')) return 'Starter';
  if (!code) return '—';
  return code.replace(/^(appointie|shopie)[-_]/i, '').replace(/-/g, ' ');
}

export function AdminPage({ children }: { children: ReactNode }) {
  return <div className="admin-page">{children}</div>;
}

export function AdminPageHeader({
  eyebrow = 'Platform admin',
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

export function humanizeAction(action?: string | null) {
  if (!action) return 'Event';
  return action.replace(/[._-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AdminKpi({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}) {
  return (
    <article className={`admin-kpi admin-kpi--${tone}`}>
      <div className="admin-kpi__top">
        <p className="admin-kpi__label">{label}</p>
        {icon ? <span className="admin-kpi__icon">{icon}</span> : null}
      </div>
      <p className="admin-kpi__value">{value}</p>
      {hint ? <p className="admin-kpi__hint">{hint}</p> : null}
    </article>
  );
}

export function AdminStatus({ status }: { status?: string | null }) {
  const normalized = (status || 'unknown').toLowerCase().replace(/_/g, ' ');
  const tone =
    normalized.includes('active') ||
    normalized.includes('ready') ||
    normalized.includes('paid') ||
    normalized.includes('paying') ||
    normalized.includes('published') ||
    normalized.includes('resolved') ||
    normalized === 'open'
      ? 'good'
      : normalized.includes('trial') ||
          normalized.includes('pending') ||
          normalized.includes('public') ||
          normalized.includes('complimentary') ||
          normalized.includes('draft')
        ? 'warn'
        : normalized.includes('suspend') ||
            normalized.includes('fail') ||
            normalized.includes('archiv') ||
            normalized.includes('lock') ||
            normalized.includes('inactive') ||
            normalized.includes('dead')
          ? 'danger'
          : 'neutral';
  return <span className={`admin-status admin-status--${tone}`}>{normalized}</span>;
}

export function AdminEmpty({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty-state">
      {title ? <p className="admin-empty-state__title">{title}</p> : null}
      <p className="admin-empty">{children}</p>
      {action}
    </div>
  );
}

export function AdminSearch({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="admin-search">
      <Search size={16} aria-hidden />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function AdminChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`admin-chip${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AdminField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="admin-field">
      <span className="admin-field__label">{label}</span>
      {children}
      {hint ? <span className="admin-field__hint">{hint}</span> : null}
    </label>
  );
}

export function AdminTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AdminDrawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide,
  variant = 'drawer',
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  variant?: 'drawer' | 'sheet';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const sheet = variant === 'sheet';
  return (
    <div
      className={`admin-drawer-backdrop${sheet ? ' admin-drawer-backdrop--sheet' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <aside
        className={`admin-drawer${wide ? ' admin-drawer--wide' : ''}${sheet ? ' admin-drawer--sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 id="admin-drawer-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="admin-drawer__body">{children}</div>
        {footer ? <footer className="admin-drawer__footer">{footer}</footer> : null}
      </aside>
    </div>
  );
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
