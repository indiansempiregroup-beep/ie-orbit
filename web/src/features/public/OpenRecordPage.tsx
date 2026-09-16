import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { useAuthContext } from '../../contexts/AuthContext';
import { getOpsMobileWebOrigin } from '../../lib/impersonation';
import { isRecordKind, staffRecordPath } from '../../lib/recordLinks';
import { hasTenantOpsRole, isPlatformAdmin } from '../../utils/roles';
import { usePageMeta } from '../../hooks/usePageMeta';

export function OpenRecordPage() {
  const { kind = '', id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const auth = useAuthContext();
  usePageMeta({ title: 'Open in app — IE Orbit', index: false });
  const appSlug = (searchParams.get('app') || '').trim();
  const orderId = (searchParams.get('order') || '').trim();
  const known = isRecordKind(kind) && id;
  const staffPath = known ? staffRecordPath(kind, id, { orderId }) : '';
  const appUrl = appSlug && known ? `${appSlug}://open/${kind}/${id}${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}` : '';

  useEffect(() => {
    if (!known || auth.loading || !auth.token || !auth.user) return;
    if (hasTenantOpsRole(auth.user) && staffPath) {
      window.location.assign(`${getOpsMobileWebOrigin()}${staffPath}`);
      return;
    }
    if (isPlatformAdmin(auth.user) && kind === 'ticket') {
      window.location.assign(`/admin/tickets?ticket=${encodeURIComponent(id)}`);
    }
  }, [auth.loading, auth.token, auth.user, known, staffPath, kind, id]);

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Open in app</p>
            <h1>
              Continue in your <span className="public-gradient-text">business app</span>
            </h1>
            <p className="public-lead">
              This link opens the matching appointment, order, return, or pet in the customer app for that business.
              Owners and staff are sent to the ops workspace when signed in.
            </p>
            <div className="public-hero-actions">
              {appUrl ? (
                <a href={appUrl}>
                  <Button variant="primary">Open in app</Button>
                </a>
              ) : (
                <Link to="/download">
                  <Button variant="primary">Get the app</Button>
                </Link>
              )}
              <Link to="/download">
                <Button variant="neutral">Download apps</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <div className="public-product-grid">
          <article className="public-card">
            <h2>Customer app</h2>
            <p>
              If the app is installed, use Open in app. If it is not, ask the business for their white-label download
              link — customer apps are branded to each shop, not listed as a generic IE Orbit consumer app.
            </p>
          </article>
          <article className="public-card">
            <h2>Owners and staff</h2>
            <p>
              Sign in on this site and we will send you to the ops workspace record. Platform admins use the ticket
              inbox on the admin host.
            </p>
          </article>
        </div>
      </div>
    </>
  );
}
