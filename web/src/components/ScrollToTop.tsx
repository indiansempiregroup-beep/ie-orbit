import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Reset window scroll when the route path changes (SPA navigations keep scroll otherwise). */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
