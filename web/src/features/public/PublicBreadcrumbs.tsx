import { Link } from 'react-router-dom';
import { matchSeoPage } from '../../seo/pages';

export function PublicBreadcrumbs({ path }: { path: string }) {
  const page = matchSeoPage(path);
  const crumbs = page?.breadcrumb;
  if (!crumbs || crumbs.length < 2) return null;
  return (
    <nav className="public-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.path}>
              {last ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <Link to={crumb.path}>{crumb.name}</Link>
              )}
              {last ? null : <span className="public-breadcrumbs__sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
