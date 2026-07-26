import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

/** Profile URLs stay inside the current shell (Platform Admin vs tenant ops). */
export function useProfileRoutes() {
  const { pathname } = useLocation();
  const embeddedInAdmin = pathname.startsWith('/admin');
  const base = embeddedInAdmin ? '/admin/profile' : '/profile';

  return useMemo(
    () => ({
      embeddedInAdmin,
      embeddedInShell: true,
      base,
      home: base,
      edit: `${base}/edit`,
      security: `${base}/security`,
      sessions: `${base}/sessions`,
    }),
    [base, embeddedInAdmin],
  );
}
