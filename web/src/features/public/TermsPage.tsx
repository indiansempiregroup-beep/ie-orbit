import { Link } from 'react-router-dom';
import { ORGANIZATION_NAME, TRIAL_DAYS } from '../../seo/config';
import { LegalContactBlock, LegalDocument, LegalToc } from './LegalDocument';

const toc = [
  { id: 'agreement', label: 'Agreement' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'service', label: 'The service' },
  { id: 'accounts', label: 'Accounts and workspaces' },
  { id: 'trial', label: 'Trial' },
  { id: 'billing', label: 'Subscriptions and billing' },
  { id: 'upi', label: 'UPI payment claims' },
  { id: 'customer-payments', label: 'Customer payments' },
  { id: 'white-label', label: 'White-label customer app' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'your-data', label: 'Your content and customer data' },
  { id: 'ip', label: 'Intellectual property' },
  { id: 'third-parties', label: 'Third-party services' },
  { id: 'compliance', label: 'Tax and professional advice' },
  { id: 'availability', label: 'Availability and disclaimer' },
  { id: 'liability', label: 'Limitation of liability' },
  { id: 'indemnity', label: 'Indemnity' },
  { id: 'suspension', label: 'Suspension and termination' },
  { id: 'changes', label: 'Changes' },
  { id: 'law', label: 'Governing law' },
  { id: 'contact', label: 'Contact' },
];

export function TermsPage() {
  return (
    <LegalDocument path="/terms" title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions (“Terms”) are a contract between you and {ORGANIZATION_NAME} for use of IE Orbit,
        including Orbit Appoint, Orbit Mart, the public website, owner and staff apps, Platform Admin (for our staff),
        and the white-label customer app. By creating an account, ticking acceptance during registration, or using the
        service, you agree to these Terms and the <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        If you use IE Orbit on behalf of a business, you confirm you have authority to bind that business. “You” means
        that business and its authorised users.
      </p>
      <LegalToc items={toc} />

      <h2 id="agreement">Agreement</h2>
      <p>
        These Terms, the <Link to="/privacy">Privacy Policy</Link>, the <Link to="/cookies">Cookie Policy</Link>, and
        prices shown at checkout or on the <Link to="/pricing">Pricing</Link> page form the agreement. If you do not
        agree, do not create an account or use the service.
      </p>

      <h2 id="eligibility">Eligibility</h2>
      <p>
        You must be able to form a contract under Indian law. Owner accounts are intended for business use, not for
        children. You must provide accurate registration details and keep the owner email able to receive one-time
        codes and notices.
      </p>

      <h2 id="service">The service</h2>
      <p>
        IE Orbit is provided on an as-available basis. You may subscribe to Orbit Appoint, Orbit Mart, or both in one
        workspace. They share business profile, staff, customers, offices, billing, and the customer app.
      </p>
      <ul>
        <li>
          <strong>Orbit Appoint</strong> — bookings, staff calendar, services, customer records, reminders, reviews,
          and related tools on the plan you choose
        </li>
        <li>
          <strong>Orbit Mart</strong> — POS, catalog, inventory, orders, books, GST tools on Pro, Grow tools on Pro,
          and optional Pets pack
        </li>
        <li>
          <strong>White-label customer app</strong> — included on Starter and Pro and during the trial, branded to your
          business
        </li>
      </ul>
      <p>
        Features, staff and office limits, and add-ons depend on the package shown at signup or in billing settings.
        We may add, change, or withdraw features with reasonable notice where the change is material.
      </p>

      <h2 id="accounts">Accounts and workspaces</h2>
      <p>
        You are responsible for activity under your workspace, including staff you invite and customers who use your
        branded app. Keep OTP codes, Google accounts, and devices secure. Enable roles and permissions so staff only
        see what they need. Notify us promptly if you believe an account is compromised.
      </p>
      <p>
        You must verify the owner email. Some features may be limited until verification is complete. You may not
        share a single login across unrelated businesses or resell access except as we expressly allow.
      </p>

      <h2 id="trial">Trial</h2>
      <p>
        New workspaces receive a {TRIAL_DAYS}-day trial with full Pro access for the product(s) selected at signup. No
        credit card is required to start. When the trial ends without a confirmed paid subscription, the workspace may
        soft-lock: you can typically still sign in and view existing data, but day-to-day operations pause until you
        subscribe. Data remains in place so you can upgrade later.
      </p>
      <p>
        Trials are one per business unless we agree otherwise. We may refuse, shorten, or end a trial in cases of
        abuse, duplicate signups, or risk to the platform.
      </p>

      <h2 id="billing">Subscriptions and billing</h2>
      <p>
        After the trial, paid use requires a Starter or Pro subscription for each product you want to keep active,
        plus any add-ons (extra staff, extra offices, Pets pack). Amounts, staff and office limits, and yearly billing
        (when offered at 10× monthly) are as shown on Pricing and at checkout in INR. Taxes may apply as required by
        law.
      </p>
      <p>
        You can change packages from workspace billing settings where the product allows it. Pending plan changes can
        be cancelled before they apply. Fees are for the service period indicated; we do not pro-rate unused add-ons
        unless we say so at checkout or in writing.
      </p>
      <p>
        Confirmed subscription payments are generally non-refundable, except where Indian law requires a refund, where
        we received a duplicate payment, or where we agree in writing. Contact support if you believe a charge is
        wrong.
      </p>

      <h2 id="upi">UPI payment claims</h2>
      <p>
        Platform subscription is paid by UPI from the workspace billing area. After you pay, you must submit a payment
        claim with the UTR and/or a screenshot so we can confirm the transfer. Access to paid features may wait until
        the claim is verified. Incomplete, illegible, or mismatched claims can delay or prevent activation.
      </p>
      <p>
        You must not submit claims for payments you did not make. False claims are a material breach and may lead to
        suspension.
      </p>

      <h2 id="customer-payments">Customer payments</h2>
      <p>
        On eligible Orbit Mart Pro plans you may connect your own Razorpay and/or Cashfree account so your customers
        pay you for shop orders. Settlement is between you and that provider. We are not a bank, escrow, or payment
        aggregator for those funds. You must comply with the provider’s terms, KYC, and chargeback rules. Platform
        subscription billing stays on UPI claims and is separate from customer checkout.
      </p>

      <h2 id="white-label">White-label customer app</h2>
      <p>
        The customer-facing app is branded to your business (name, colours, listings). You are responsible for the
        accuracy of prices, services, stock, hours, and messages shown to your customers. Starter plans may display
        Google Ads in that app; Pro is ad-free. Install links are issued for your business; this website is not a
        public app store for every tenant.
      </p>
      <p>
        You grant us a licence to host and display your brand assets in the apps and websites we operate for you. You
        confirm you have the rights to those names, logos, and photos.
      </p>

      <h2 id="acceptable-use">Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Misuse the platform, probe or disrupt other customers’ workspaces, or attempt unauthorised access</li>
        <li>Upload malware, scrape the service in bulk, or overload our systems</li>
        <li>Use IE Orbit for unlawful activity, fraud, GST or invoice fraud, or to harass others</li>
        <li>Send spam or unsolicited marketing except where you have a lawful basis and the channel allows it</li>
        <li>Impersonate another business or misrepresent affiliation with Indians Empire</li>
        <li>Reverse engineer the software except where applicable law allows</li>
        <li>Store or transmit content that is illegal in India, including sexual content involving minors</li>
      </ul>
      <p>We may investigate suspected abuse and cooperate with lawful requests from authorities.</p>

      <h2 id="your-data">Your content and customer data</h2>
      <p>
        You retain rights in the business data you enter. You grant us a licence to host, process, back up, and display
        that data solely to provide IE Orbit, including to your staff and customers as you configure.
      </p>
      <p>
        You are the Data Fiduciary for personal data of your customers, staff, and vendors. You must collect it
        lawfully, keep it accurate, and handle access or deletion requests those people make to you. We process that
        data as a service provider as described in the <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        You must not enter special categories of data unless the product is designed for that use and you have a
        lawful basis (for example health-related appointment notes in a clinic). You are responsible for staff
        training and local record-keeping rules that apply to your industry.
      </p>

      <h2 id="ip">Intellectual property</h2>
      <p>
        IE Orbit, Orbit Appoint, Orbit Mart, the software, documentation, and our trademarks remain the property of{' '}
        {ORGANIZATION_NAME} and licensors. These Terms do not sell the software. You may not copy, fork, or white-label
        the platform itself for third parties. Feedback you send may be used to improve the product without obligation
        to you.
      </p>

      <h2 id="third-parties">Third-party services</h2>
      <p>
        Integrations (Google Sign-In, Maps, Calendar, Analytics, AdMob, WhatsApp, Firebase, Razorpay, Cashfree,
        Shiprocket, GST e-invoice / e-way, and similar) are optional or plan-dependent. Their terms and privacy
        policies apply to your use of those services. Outages or policy changes at those providers are outside our
        control. See <Link to="/integrations">Integrations</Link> for what is connected in the product today.
      </p>

      <h2 id="compliance">Tax and professional advice</h2>
      <p>
        Orbit Mart GST reports, e-invoice (IRN), and e-way bill tools are operational aids. They are not legal, tax, or
        accounting advice and do not replace a Chartered Accountant or GST practitioner. You remain responsible for
        GSTIN accuracy, returns, e-invoice IRN, e-way bills, and any NIC or GSTN credentials you configure. Complex
        books may still need specialist software or advice.
      </p>

      <h2 id="availability">Availability and disclaimer</h2>
      <p>
        We aim for reliable uptime but do not warrant that the service will be uninterrupted, error-free, or fit for
        every purpose. The service is provided “as is” and “as available” to the maximum extent permitted by Indian
        law. We do not warrant that bookings, stock counts, or GST figures will be free of user error.
      </p>

      <h2 id="liability">Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {ORGANIZATION_NAME} and its directors, employees, and suppliers are not
        liable for indirect, incidental, special, consequential, or punitive losses, or for lost profits, lost
        revenue, lost data, business interruption, or cost of substitute software, even if advised of the possibility.
      </p>
      <p>
        Our total liability for claims arising out of these Terms or the service is limited to the subscription fees
        you actually paid to us for the affected workspace in the twelve (12) months before the claim (or, if you are
        on a trial and have paid nothing, one thousand Indian rupees). Nothing in these Terms excludes liability that
        cannot be excluded under Indian law, including for fraud or personal injury caused by our negligence.
      </p>

      <h2 id="indemnity">Indemnity</h2>
      <p>
        You will indemnify and hold us harmless from claims, losses, and reasonable legal costs arising from your
        content, your customers’ use of your branded app, your GST or invoicing, your payment-provider account, your
        breach of these Terms, or your violation of law or third-party rights.
      </p>

      <h2 id="suspension">Suspension and termination</h2>
      <p>
        You may stop using the service and request workspace deletion through support. We may suspend or terminate
        access if you materially breach these Terms, fail to pay after notice, present a security or legal risk, or
        misuse UPI claims. After termination we may delete or anonymise workspace data in line with the Privacy Policy,
        except records we must keep for law or billing disputes.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We may update these Terms. The “Last updated” date will change. Material changes may be posted on the website
        or emailed to the owner. Continued use after the effective date constitutes acceptance, except where the law
        requires additional consent.
      </p>

      <h2 id="law">Governing law</h2>
      <p>
        These Terms are governed by the laws of India. Courts of competent jurisdiction in India shall have exclusive
        jurisdiction, without prejudice to any non-derogable consumer protections that apply.
      </p>
      <p>
        If a provision is held unenforceable, the rest remains in effect. Our failure to enforce a right is not a
        waiver. You may not assign the agreement without our consent; we may assign it in a reorganisation or sale of
        the business.
      </p>

      <h2 id="contact">Contact</h2>
      <LegalContactBlock />
      <p>
        Privacy practices are described in the <Link to="/privacy">Privacy Policy</Link>. Browser storage is described
        in the <Link to="/cookies">Cookie Policy</Link>. Product questions are covered in the <Link to="/faq">FAQ</Link>{' '}
        and <Link to="/help">Help Center</Link>.
      </p>
    </LegalDocument>
  );
}
