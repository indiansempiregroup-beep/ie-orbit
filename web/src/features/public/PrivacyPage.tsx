import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, ORGANIZATION_NAME, TRIAL_DAYS } from '../../seo/config';
import { LegalContactBlock, LegalDocument, LegalToc } from './LegalDocument';

const toc = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'scope', label: 'Who this policy covers' },
  { id: 'roles', label: 'Our role and yours' },
  { id: 'collect', label: 'Information we collect' },
  { id: 'use', label: 'How we use information' },
  { id: 'legal-bases', label: 'Consent and lawful use' },
  { id: 'sharing', label: 'When we share information' },
  { id: 'cookies', label: 'Cookies and similar storage' },
  { id: 'retention', label: 'How long we keep data' },
  { id: 'security', label: 'Security' },
  { id: 'transfers', label: 'Where data is processed' },
  { id: 'rights', label: 'Your rights' },
  { id: 'children', label: 'Children' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
];

export function PrivacyPage() {
  return (
    <LegalDocument path="/privacy" title="Privacy Policy">
      <p>
        This Privacy Policy explains how {ORGANIZATION_NAME} (“we”, “us”, “our”) collects, uses, stores, and shares
        personal and business information when you use IE Orbit — including Orbit Appoint, Orbit Mart, the public
        website, owner and staff apps, and the white-label customer app branded to a business.
      </p>
      <p>
        Related documents: <Link to="/terms">Terms &amp; Conditions</Link> and{' '}
        <Link to="/cookies">Cookie Policy</Link>. Creating an owner account requires accepting this policy and the
        Terms.
      </p>
      <LegalToc items={toc} />

      <h2 id="who-we-are">Who we are</h2>
      <p>
        IE Orbit is a business workspace from {ORGANIZATION_NAME}. Orbit Appoint covers bookings, staff calendars,
        services, reminders, and reviews. Orbit Mart covers POS, catalog, orders, books, GST tools, and Grow. You may
        subscribe to one product or both in the same workspace. Every Starter and Pro plan includes a customer-facing
        app under the business brand, not a public marketplace listing.
      </p>
      <p>
        For privacy questions, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or use{' '}
        <Link to="/contact">Contact</Link>.
      </p>

      <h2 id="scope">Who this policy covers</h2>
      <p>This policy applies to:</p>
      <ul>
        <li>People who visit ie-orbit.com or submit the contact form</li>
        <li>Business owners and staff who create or use an IE Orbit workspace</li>
        <li>People who sign in with email one-time codes or Google</li>
        <li>
          End customers of a business, to the limited extent we process their data on that business’s instructions
          (bookings, orders, reviews, loyalty, and similar records)
        </li>
      </ul>
      <p>
        It does not replace a business’s own privacy notice to its customers. If you book or shop in a white-label
        customer app, the business you are dealing with is responsible for telling you how it uses your information.
      </p>

      <h2 id="roles">Our role and yours</h2>
      <p>
        Under the Digital Personal Data Protection Act, 2023 (DPDP Act) and other applicable Indian law, we act in two
        ways:
      </p>
      <ul>
        <li>
          <strong>Data Fiduciary for platform accounts.</strong> We decide how to process owner and staff account data,
          billing and UPI payment claims, support tickets, security logs, and public-website analytics so we can run IE
          Orbit.
        </li>
        <li>
          <strong>Data Processor for workspace content.</strong> Appointment books, customer lists, POS sales, GST
          invoices, pet records, staff rosters, and similar operational data are entered by the business. That business
          is the Data Fiduciary for its customers, staff, and vendors. We process that data only to provide the
          subscribed products, on the business’s instructions, and as described here.
        </li>
      </ul>
      <p>
        Workspace owners must have a lawful basis to collect personal data they enter (for example customer phone
        numbers for booking reminders). They remain responsible for GST, invoices issued in their name, and messages
        they send from the workspace.
      </p>

      <h2 id="collect">Information we collect</h2>
      <h3>Account and identity</h3>
      <p>
        When you register or are invited as staff we collect name, display name, email, Indian mobile number where
        provided, role, and authentication data. Sign-in uses a one-time code sent to email (and WhatsApp when that
        channel is configured). You may also continue with Google, in which case we receive the identifier, name, and
        email Google shares with your consent. After you sign in on a mobile app you may enable biometric unlock on
        that device; biometric templates stay on the device and are not uploaded to our servers.
      </p>
      <h3>Business profile</h3>
      <p>
        We collect business name, category, industry, contact email and phone, website, address, map coordinates,
        currency, timezone, language, week start, hours, branding colours, selected products and packages, office
        (branch) details, and similar settings needed to provision the workspace.
      </p>
      <h3>Orbit Appoint operational data</h3>
      <p>
        If the workspace uses Orbit Appoint we process services, staff schedules, bookings, customer records, reminders,
        reviews, reward points where enabled, and related files you upload (for example service photos).
      </p>
      <h3>Orbit Mart operational data</h3>
      <p>
        If the workspace uses Orbit Mart we process catalog, inventory, POS and credit sales, parties, cash and
        expenses, online orders, returns, delivery details, GSTIN where entered, GST reports, e-invoice (IRN) and e-way
        bill data when those tools are used, Grow share content, and Pets pack records when that add-on is on.
      </p>
      <h3>Billing and payments</h3>
      <p>
        We collect plan selections, add-ons (staff, offices, Pets pack), trial dates, invoices, UPI payment claims
        (including UTR and screenshots you upload), and confirmation status. Platform subscription is billed in INR.
        Customer payments for shop orders, when enabled, go through the business’s own Razorpay or Cashfree account —
        we do not take custody of those settlement funds.
      </p>
      <h3>Support and marketing enquiries</h3>
      <p>
        Contact-form submissions include name, email, message, and anti-spam fields. Phone and email support may create
        a ticket history. Demo requests are treated as sales enquiries.
      </p>
      <h3>Device, logs, and usage</h3>
      <p>
        We collect IP address, browser or app type, device identifiers needed for push notifications (Firebase Cloud
        Messaging where configured), session identifiers, timestamps, and security-audit events (sign-in, permission
        changes, impersonation by platform support when authorised). Workspace dashboards show operational analytics
        derived from your own bookings and sales — that reporting stays inside the workspace.
      </p>
      <h3>Public website analytics</h3>
      <p>
        On public marketing pages we may use Google Analytics 4 to see which pages are used. Analytics is not loaded on
        Platform Admin, sign-in, or workspace app routes. See the <Link to="/cookies">Cookie Policy</Link>.
      </p>
      <h3>Advertising in the customer app</h3>
      <p>
        Starter plans may show Google Ads (AdMob) in the white-label customer app. Pro is ad-free. Ad networks may
        collect device and usage data according to Google’s advertising policies. This does not apply to the owner and
        staff ops app.
      </p>
      <h3>Information we do not seek</h3>
      <p>
        We do not ask for credit-card numbers to start a trial. We do not use analytics events to send passwords, OTP
        codes, or full message bodies. We do not sell personal data.
      </p>

      <h2 id="use">How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>
          Create and operate workspaces, including the {TRIAL_DAYS}-day full-Pro trial and later Starter or Pro
          subscriptions
        </li>
        <li>Authenticate users, verify owner email, manage sessions, roles, and invitations</li>
        <li>Provide Orbit Appoint and Orbit Mart features you subscribe to</li>
        <li>Send transactional messages: OTP, email verification, booking or order notices, and billing status</li>
        <li>Confirm UPI payment claims and keep subscription records</li>
        <li>Provide support, investigate abuse, and keep security logs</li>
        <li>Improve reliability and understand public-site usage when analytics is configured</li>
        <li>Comply with law, tax, and dispute requests we are legally required to meet</li>
      </ul>
      <p>
        We do not use workspace customer lists to market IE Orbit to those end customers. WhatsApp reminders and Grow
        shares are initiated by the business, not by us as a bulk marketing list.
      </p>

      <h2 id="legal-bases">Consent and lawful use</h2>
      <p>
        Owner registration requires acceptance of this policy. You may withdraw consent for optional processing (for
        example public-site analytics via browser controls, or Google Sign-In by using email OTP instead). We also
        process data where it is necessary to provide the service you asked for, to meet a legal obligation, or for
        employment-like staff access that the business has authorised.
      </p>
      <p>
        End customers interact with a business’s branded app. The business should obtain any consent it needs for
        reminders, loyalty, or marketing. We process that data as a processor so the booked visit or order can be
        fulfilled.
      </p>

      <h2 id="sharing">When we share information</h2>
      <p>We share information only as needed to run the product:</p>
      <ul>
        <li>
          <strong>Google.</strong> Sign-In, Maps and Places for addresses, Calendar when a workspace connects it,
          Analytics on the public site, and AdMob on Starter customer apps
        </li>
        <li>
          <strong>Email and WhatsApp providers.</strong> To deliver OTP, verification, and business-initiated reminders
          when those channels are enabled
        </li>
        <li>
          <strong>Firebase / FCM.</strong> To send push notifications to apps that have notification permission
        </li>
        <li>
          <strong>Payment partners.</strong> UPI rails for subscription claims; Razorpay or Cashfree when the business
          connects its own keys for customer checkout
        </li>
        <li>
          <strong>GST / NIC portals.</strong> E-invoice and e-way payloads the business chooses to generate from Orbit
          Mart Pro
        </li>
        <li>
          <strong>Shiprocket or similar couriers.</strong> When the business configures fulfilment
        </li>
        <li>
          <strong>Hosting and infrastructure.</strong> Cloud compute, database, object storage, and monitoring vendors
          who process data on our instructions
        </li>
        <li>
          <strong>Platform support.</strong> Authorised Indians Empire staff may access a workspace to diagnose a
          ticket or confirm a payment claim, with audit logging
        </li>
        <li>
          <strong>Legal requests.</strong> If required by Indian law, court order, or to protect users from fraud or
          harm
        </li>
      </ul>
      <p>
        Staff inside a workspace see data according to the roles the owner assigns. We do not sell, rent, or share
        personal data for unrelated third-party advertising.
      </p>

      <h2 id="cookies">Cookies and similar storage</h2>
      <p>
        We use cookies, local storage, and similar browser storage so you can stay signed in, keep registration
        progress, remember language and workspace, and (on public pages) measure site usage. Details, categories, and
        browser controls are in the <Link to="/cookies">Cookie Policy</Link>.
      </p>

      <h2 id="retention">How long we keep data</h2>
      <ul>
        <li>
          <strong>Active workspaces.</strong> Account and operational data are kept while the workspace exists,
          including during a trial and after a soft-lock if you have not subscribed, so you can sign in and upgrade
        </li>
        <li>
          <strong>Billing records.</strong> Invoices, UPI claims, and related evidence are kept as needed for
          accounting and dispute handling
        </li>
        <li>
          <strong>Security logs.</strong> Sign-in and audit events are kept for a limited period for security and
          abuse investigation
        </li>
        <li>
          <strong>Contact form.</strong> Enquiry messages are kept long enough to reply and follow up
        </li>
        <li>
          <strong>Deletion.</strong> You may request account or workspace deletion through support. We will delete or
          anonymise personal data that we no longer need, except where Indian law requires us to retain records (for
          example tax). Backup copies may persist for a short period until they rotate
        </li>
      </ul>

      <h2 id="security">Security</h2>
      <p>
        Workspaces are isolated per business. Access uses authentication, roles, and permissions. Sign-in uses one-time
        email codes (and optional Google Sign-In). Owner email should be verified after signup. We use encrypted
        transport (HTTPS), access-controlled servers, and session management. No method of transmission or storage is
        perfectly secure; please protect devices and do not share OTP codes.
      </p>

      <h2 id="transfers">Where data is processed</h2>
      <p>
        IE Orbit is offered primarily to businesses in India. Infrastructure, email, analytics, maps, and payment
        vendors may process data in India or other countries where those vendors operate. We use them only as needed
        to provide the service and require appropriate safeguards in our contracts with them.
      </p>

      <h2 id="rights">Your rights</h2>
      <p>
        Subject to the DPDP Act and other applicable law, Data Principals may request access to their personal data,
        correction of inaccurate data, erasure where we no longer need it, and withdrawal of consent for optional
        processing. Workspace owners can update much of their profile, business details, and sessions in the product.
        Staff access is managed by the owner.
      </p>
      <p>
        To exercise rights, or if you are an end customer who cannot resolve a request with the business that holds
        your booking or order, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with enough detail for us
        to locate the account. We may need to verify identity. We will not honour a request that would unlawfully
        expose another person’s data or that we must refuse under law.
      </p>
      <p>
        You may also complain to the Data Protection Board of India once that redressal channel is available, after
        contacting us.
      </p>

      <h2 id="children">Children</h2>
      <p>
        IE Orbit is a business product. Owner and staff accounts are intended for adults. Education and similar
        workspaces may store student or parent contact details entered by the business; that business is responsible
        for any consent required for children’s data. We do not knowingly allow a child to create an owner account.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        We may update this policy as the product or the law changes. The “Last updated” date at the top will change.
        Material changes may also be noted on the website or by email to the owner address. Continued use after an
        update means you accept the revised policy, except where the law requires a fresh consent.
      </p>

      <h2 id="contact">Contact</h2>
      <LegalContactBlock />
      <p>
        For cookies and browser storage, read the <Link to="/cookies">Cookie Policy</Link>. For use of the service,
        read the <Link to="/terms">Terms &amp; Conditions</Link>.
      </p>
    </LegalDocument>
  );
}
