import { Link } from 'react-router-dom';
import { ORGANIZATION_NAME } from '../../seo/config';
import { LegalContactBlock, LegalDocument, LegalToc } from './LegalDocument';

const toc = [
  { id: 'what', label: 'What this policy covers' },
  { id: 'types', label: 'Cookies and similar technologies' },
  { id: 'why', label: 'Why we use them' },
  { id: 'table', label: 'What we store' },
  { id: 'essential', label: 'Essential' },
  { id: 'functional', label: 'Preferences' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'third-party', label: 'Third-party cookies' },
  { id: 'mobile', label: 'Apps are different' },
  { id: 'choices', label: 'Your choices' },
  { id: 'contact', label: 'Contact' },
];

export function CookiesPage() {
  return (
    <LegalDocument path="/cookies" title="Cookie Policy">
      <p>
        This Cookie Policy explains how {ORGANIZATION_NAME} uses cookies and similar storage when you use the IE Orbit
        website, sign-in, and workspace in a browser. It should be read with the{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <LegalToc items={toc} />

      <h2 id="what">What this policy covers</h2>
      <p>
        It covers ie-orbit.com and the web workspace (including registration, sign-in, owner and staff dashboards, and
        Platform Admin in the browser). Native iOS and Android apps use device storage and OS permissions rather than
        website cookies; those are summarised under “Apps are different”.
      </p>

      <h2 id="types">Cookies and similar technologies</h2>
      <p>
        A cookie is a small file a site stores in your browser. We also use HTML local storage and session storage for
        the same kinds of job — keeping you signed in, remembering a draft, or storing a language choice. In this
        policy, “cookies” includes those similar technologies.
      </p>
      <p>
        Some cookies are set by us (first-party). Others are set by Google or similar vendors when you use Sign-In,
        Maps, or public-site analytics (third-party).
      </p>

      <h2 id="why">Why we use them</h2>
      <ul>
        <li>Authenticate you and keep a session after you enter an email OTP or continue with Google</li>
        <li>Remember which business and product workspace you last used</li>
        <li>Keep registration progress if you refresh during Create account</li>
        <li>Remember language, onboarding hints, and dashboard layout choices</li>
        <li>Understand which public marketing pages are used, when analytics is configured</li>
        <li>Load maps and address search when you pick a business or office location</li>
      </ul>

      <h2 id="table">What we store</h2>
      <div className="public-legal-table-wrap">
        <table className="public-legal-table" aria-label="Cookies and similar storage we use">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Examples</th>
              <th scope="col">How long</th>
              <th scope="col">Needed to use the site?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Essential — sign-in</td>
              <td>Access and refresh session tokens, session-started marker</td>
              <td>Until you sign out, or the token expires</td>
              <td>Yes. Blocking these signs you out</td>
            </tr>
            <tr>
              <td>Essential — workspace</td>
              <td>Active business / tenant so the correct workspace opens</td>
              <td>Until you switch workspace or sign out</td>
              <td>Yes, after you have a workspace</td>
            </tr>
            <tr>
              <td>Essential — registration</td>
              <td>Onboarding draft in the current browser tab</td>
              <td>Until the tab is closed or you finish signup</td>
              <td>Yes, if you are creating an account</td>
            </tr>
            <tr>
              <td>Preferences</td>
              <td>Language, dashboard layout, dismissed hints, affiliate referral code</td>
              <td>Until you change or clear site data</td>
              <td>No, but the site forgets those choices</td>
            </tr>
            <tr>
              <td>Analytics</td>
              <td>Google Analytics 4 cookies such as _ga and _gid on public pages</td>
              <td>Typically up to 2 years (_ga) or 24 hours (_gid)</td>
              <td>No. Marketing pages still work without them</td>
            </tr>
            <tr>
              <td>Third-party — Google Sign-In</td>
              <td>Cookies Google sets when you choose Continue with Google</td>
              <td>Set by Google</td>
              <td>Only if you use Google Sign-In</td>
            </tr>
            <tr>
              <td>Third-party — Maps</td>
              <td>Cookies or storage used by Google Maps / Places on address pickers</td>
              <td>Set by Google, often for the session</td>
              <td>Only if you use map or address search</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="essential">Essential</h2>
      <p>
        Session tokens are stored in the browser so we can recognise you on later requests without asking for a new
        OTP every page load. They are not used for advertising. If you block or clear this storage you will need to
        sign in again and may lose an unfinished registration draft.
      </p>
      <p>
        We also store a marker for the active workspace and, during Create account, a draft of the wizard in session
        storage so Back and refresh do not wipe what you already typed.
      </p>

      <h2 id="functional">Preferences</h2>
      <p>
        Language, some dashboard views, “don’t show this hint again”, and similar flags are stored locally so the
        product feels consistent. An affiliate or referral code may be remembered so pricing attribution survives a
        few steps of signup. These are not required for security.
      </p>

      <h2 id="analytics">Analytics</h2>
      <p>
        On the public marketing website we may load Google Analytics 4 when a measurement ID is configured. That helps
        us see which pages (Home, Pricing, Features, and similar) are used. We configure analytics not to run on:
      </p>
      <ul>
        <li>Platform Admin</li>
        <li>Sign-in and other /auth routes</li>
        <li>Onboarding / workspace provisioning routes</li>
        <li>Signed-in owner and staff app routes that are not public marketing pages</li>
        <li>Help Center searches that include a query string, to avoid sending search text as a page path</li>
      </ul>
      <p>
        We do not send passwords, OTP codes, or full support-message bodies to analytics. Google’s own cookies and
        processing apply to this measurement; see Google’s analytics documentation for cookie names and duration.
      </p>

      <h2 id="third-party">Third-party cookies</h2>
      <p>
        If you use Continue with Google, Google sets cookies to complete OAuth. If you search or pin an address, Google
        Maps / Places may set cookies or use local storage. Those vendors are independent controllers for the data they
        collect under their own policies. You can avoid them by using email OTP instead of Google, and by typing an
        address without opening the map when the form allows it.
      </p>

      <h2 id="mobile">Apps are different</h2>
      <p>
        The ops app and white-label customer app store a session on the device (and may use secure device storage or
        biometric unlock after you sign in). They may use Firebase Cloud Messaging for push notifications if you allow
        notifications. Starter customer apps may show Google Ads (AdMob); that uses advertising identifiers under
        Google’s policies, not this website’s cookies. Details are in the <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2 id="choices">Your choices</h2>
      <p>
        You can delete cookies and site data in your browser settings, use private browsing, or block third-party
        cookies. Most browsers also offer controls for local storage. Blocking essential storage will prevent staying
        signed in.
      </p>
      <p>
        For Google Analytics you can use Google’s opt-out tools or a browser add-on that blocks analytics scripts. We
        do not currently show a separate cookie banner; public analytics is limited to marketing pages as described
        above. If you contact us we can confirm whether analytics is enabled on the production site.
      </p>
      <p>
        Mobile OS settings control notifications, tracking, and ad personalisation on the apps. You can sign out and
        clear app data to remove the local session.
      </p>

      <h2 id="contact">Contact</h2>
      <LegalContactBlock />
      <p>
        How we use account and business data is explained in the <Link to="/privacy">Privacy Policy</Link>. Using the
        product is covered by the <Link to="/terms">Terms &amp; Conditions</Link>.
      </p>
    </LegalDocument>
  );
}
