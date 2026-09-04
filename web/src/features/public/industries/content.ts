export type IndustryFaq = { q: string; a: string };

export type IndustryContent = {
  slug: string;
  path: string;
  name: string;
  h1: string;
  lead: string;
  problemTitle: string;
  problem: string;
  solutionTitle: string;
  solution: string;
  featuresTitle: string;
  features: Array<{ title: string; body: string }>;
  workflowTitle: string;
  workflow: Array<{ title: string; body: string }>;
  benefitsTitle: string;
  benefits: string[];
  customerTitle: string;
  customer: string;
  businessTitle: string;
  business: string;
  faqs: IndustryFaq[];
  related: string[];
  products: Array<'appoint' | 'mart'>;
};

export const INDUSTRIES: IndustryContent[] = [
  {
    slug: 'salon-spa',
    path: '/industries/salon-spa',
    name: 'Salon & Spa',
    h1: 'Salon and spa booking software',
    lead: 'Orbit Appoint runs chairs, rooms, and staff calendars. Orbit Mart runs the front desk retail counter and GST bills when you also sell products.',
    problemTitle: 'The salon floor problem',
    problem:
      'Walk-ins, phone bookings, and a paper diary compete for the same chairs. Stylists double-book, no-shows empty slots, and product sales sit on a separate till. Owners cannot see who is free, what is billed, or which services actually make money.',
    solutionTitle: 'How IE Orbit helps salons and spas',
    solution:
      'Use Orbit Appoint so clients book online, staff see a live calendar, and reminders go out before the visit. If you sell shampoo, colour, or spa kits, add Orbit Mart in the same workspace for POS, catalog, and GST books — one login, one customer list.',
    featuresTitle: 'Features that match salon work',
    features: [
      { title: 'Online booking', body: 'Clients pick a service and time from any device instead of calling the front desk.' },
      { title: 'Staff calendar', body: 'See who is with a client, who is free, and which chair or room is taken.' },
      { title: 'Customers and reviews', body: 'Keep visit history, send reminders, and collect reviews after the appointment.' },
      { title: 'Retail POS and GST', body: 'Bill take-home products at the counter with GST-ready sales when Orbit Mart is on.' },
    ],
    workflowTitle: 'A typical salon day',
    workflow: [
      { title: 'Open the calendar', body: 'Staff see today’s bookings and walk-in gaps before the first client arrives.' },
      { title: 'Take the visit', body: 'Check in the client, run the service, and capture a review when you are ready.' },
      { title: 'Sell and close', body: 'If you stock retail, ring it up on Orbit Mart POS and keep GST books in the same workspace.' },
    ],
    benefitsTitle: 'What changes for the business',
    benefits: [
      'Fewer missed slots from confirmations and a shared calendar',
      'One customer record for services and product sales',
      'UPI billing for your IE Orbit subscription — no credit card to start the 15-day trial',
      'White-label customer app branded to your salon when you go live',
    ],
    customerTitle: 'What clients experience',
    customer:
      'Clients book a cut, colour, or spa slot on your branded app or web booking flow, get reminders, and can shop take-home products if you enable Orbit Mart.',
    businessTitle: 'What owners and staff experience',
    business:
      'Owners get Overview BI on Starter and full Growth, Revenue, Forecast, and Reports on Pro. Staff work from one calendar instead of a diary plus a separate shop till.',
    faqs: [
      {
        q: 'Is IE Orbit only for large salon chains?',
        a: 'No. Starter and Pro are built for single locations and small teams. Add extra staff or offices later as monthly add-ons.',
      },
      {
        q: 'Can we sell products as well as services?',
        a: 'Yes. Subscribe to Orbit Mart in the same workspace for POS, catalog, and GST books. You do not need a second login.',
      },
      {
        q: 'Do clients need their own IE Orbit account with you?',
        a: 'Customers use your white-label app for booking and shop orders. Your team uses the ops workspace to run the floor.',
      },
    ],
    related: ['clinic-healthcare', 'fitness-wellness', 'retail'],
    products: ['appoint', 'mart'],
  },
  {
    slug: 'clinic-healthcare',
    path: '/industries/clinic-healthcare',
    name: 'Clinic & Healthcare',
    h1: 'Clinic appointment software',
    lead: 'Orbit Appoint schedules practitioners and rooms. Orbit Mart can sit beside it if you also run a counter for billed items with GST books.',
    problemTitle: 'The clinic front-desk problem',
    problem:
      'Patients call, WhatsApp, and walk in for the same slots. Reception juggles practitioner availability, follow-up visits, and a queue that is invisible until someone is standing at the desk. If you also dispense items, that billing often lives on another system.',
    solutionTitle: 'How IE Orbit helps clinics',
    solution:
      'Orbit Appoint puts bookings, staff calendars, and customer records in one place so reception is not the only source of truth. Pair Orbit Mart when you need GST counter sales and books for items you sell — still the same business, staff, and billing.',
    featuresTitle: 'Features for clinic operations',
    features: [
      { title: 'Appointment calendar', body: 'Map visits to practitioners and rooms instead of a shared spreadsheet.' },
      { title: 'Online booking', body: 'Let patients request a slot without blocking the phone line.' },
      { title: 'Reminders and records', body: 'Keep customer history and send reminders before the visit.' },
      { title: 'Counter and GST books', body: 'Use Orbit Mart when you bill items at the desk with GST reports and e-invoice where you use them.' },
    ],
    workflowTitle: 'How a clinic day runs',
    workflow: [
      { title: 'Publish availability', body: 'Set staff schedules so online booking and walk-ins share the same calendar.' },
      { title: 'Run the session', body: 'Check the next patient, complete the visit, and keep the record on the customer profile.' },
      { title: 'Bill what you sell', body: 'If you retail supplies or billed items, close them on Orbit Mart POS in the same workspace.' },
    ],
    benefitsTitle: 'Clinic-side benefits',
    benefits: [
      'Fewer double-booked practitioners',
      'A single customer list for visits and counter sales',
      '15-day full-Pro trial with no credit card',
      'INR subscription billing over UPI when you upgrade',
    ],
    customerTitle: 'What patients experience',
    customer:
      'Patients book or manage visits through your white-label customer app where you enable it, instead of only calling reception.',
    businessTitle: 'What the practice experiences',
    business:
      'Reception sees one calendar. Owners can start with BI Overview on Starter and unlock the full BI suite on Pro. IE Orbit is operations software — it is not a clinical EMR or a substitute for medical records systems.',
    faqs: [
      {
        q: 'Does this replace hospital EMR software?',
        a: 'No. Orbit Appoint is appointment and customer operations software. It does not claim to be a clinical electronic medical record.',
      },
      {
        q: 'Can multiple practitioners share one workspace?',
        a: 'Yes. Invite staff with roles and permissions. Extra bookable staff can be added as a monthly add-on when you outgrow the plan limit.',
      },
      {
        q: 'Can we take UPI for our IE Orbit bill?',
        a: 'Yes. Platform subscription uses INR and UPI with a payment claim from the workspace. Patient payments at the clinic are separate.',
      },
    ],
    related: ['salon-spa', 'professional-services', 'fitness-wellness'],
    products: ['appoint', 'mart'],
  },
  {
    slug: 'fitness-wellness',
    path: '/industries/fitness-wellness',
    name: 'Fitness & Wellness',
    h1: 'Fitness and wellness booking software',
    lead: 'Trainers, studios, and wellness rooms need a calendar that clients can actually book. Orbit Appoint does that. Orbit Mart covers merch or supplement retail if you sell from the desk.',
    problemTitle: 'The studio scheduling problem',
    problem:
      'Class lists live in chat groups. Personal training slots live in a trainer’s phone. The front desk does not know who is coming until they arrive, and retail (bottles, bands, kits) is a cash drawer on the side.',
    solutionTitle: 'How IE Orbit helps fitness and wellness teams',
    solution:
      'Put sessions on Orbit Appoint so clients book against real availability. Keep customers, reminders, and reviews with the visit. Turn on Orbit Mart when you want POS, catalog, and GST books for what you sell in the studio.',
    featuresTitle: 'Features for studios and trainers',
    features: [
      { title: 'Session booking', body: 'Online bookings for training slots and wellness appointments from any device.' },
      { title: 'Staff availability', body: 'Trainers and therapists see their own calendar instead of a group chat.' },
      { title: 'Customer history', body: 'Know who is returning, who no-showed, and what they booked last.' },
      { title: 'Studio retail', body: 'Orbit Mart POS and GST books if you sell merchandise or packaged products.' },
    ],
    workflowTitle: 'How a studio week works',
    workflow: [
      { title: 'Set the timetable', body: 'Publish staff hours and services so clients can book without a phone call.' },
      { title: 'Run the session', body: 'Check in, complete the visit, and follow up with reminders or reviews.' },
      { title: 'Sell from the desk', body: 'If you stock retail, bill it on Orbit Mart in the same workspace.' },
    ],
    benefitsTitle: 'Studio benefits',
    benefits: [
      'A shared calendar instead of scattered chat bookings',
      'Optional retail without a second software login',
      'White-label customer app for booking and shop',
      'Yearly IE Orbit billing at 10× monthly (two months free)',
    ],
    customerTitle: 'What members experience',
    customer:
      'Members book a trainer or wellness slot on your branded app and can buy studio products if you enable Orbit Mart.',
    businessTitle: 'What operators experience',
    business:
      'Operators see today’s sessions in one place. Pro unlocks full BI and reward points on Orbit Appoint where the plan includes them.',
    faqs: [
      {
        q: 'Can we run both classes and a small shop?',
        a: 'Yes. Orbit Appoint for bookings, Orbit Mart for POS and GST books, same workspace.',
      },
      {
        q: 'Is there a free trial?',
        a: 'New workspaces get a 15-day full-Pro trial with no credit card. After that the workspace soft-locks until you subscribe.',
      },
      {
        q: 'Do we need extra offices for multiple studios?',
        a: 'Plans include a set number of offices. Extra offices are a monthly add-on with address and map location.',
      },
    ],
    related: ['salon-spa', 'education-training', 'professional-services'],
    products: ['appoint', 'mart'],
  },
  {
    slug: 'professional-services',
    path: '/industries/professional-services',
    name: 'Professional Services',
    h1: 'Consultant and professional booking software',
    lead: 'Consultants, advisors, and client-facing professionals need bookable time — not a salon chair. Orbit Appoint is built for that. Add Orbit Mart only if you also sell packaged products.',
    problemTitle: 'The consulting calendar problem',
    problem:
      'Discovery calls, paid sessions, and follow-ups live in email threads. Assistants retype the same slot three times. There is no shared view of who is booked, and invoices for any physical products sit elsewhere.',
    solutionTitle: 'How IE Orbit helps professional services',
    solution:
      'Clients book against your real availability in Orbit Appoint. Staff calendars, reminders, and reviews stay with the customer record. If you sell kits, books, or packaged offers at a counter, Orbit Mart adds POS and GST books without a second workspace.',
    featuresTitle: 'Features for consultants and firms',
    features: [
      { title: 'Bookable consultations', body: 'Publish services and let clients pick a time instead of emailing back and forth.' },
      { title: 'Staff and rooms', body: 'Map people and offices so multi-advisor teams do not collide.' },
      { title: 'Customer records', body: 'Keep who you met, when, and what they booked next.' },
      { title: 'Optional product sales', body: 'Orbit Mart for catalog and GST if you sell something at the desk.' },
    ],
    workflowTitle: 'How client work gets scheduled',
    workflow: [
      { title: 'Define services', body: 'Create consultation types and durations your clients can book.' },
      { title: 'Protect the calendar', body: 'Staff availability drives what is offered online.' },
      { title: 'Follow through', body: 'Reminders go out; reviews and history stay on the customer.' },
    ],
    benefitsTitle: 'Practice benefits',
    benefits: [
      'Less time spent coordinating slots over email',
      'A professional booking flow on a white-label customer app',
      'Same UPI subscription billing as other IE Orbit products',
      'BI Overview on Starter; full BI on Pro',
    ],
    customerTitle: 'What clients experience',
    customer:
      'Clients book a consultation on your branded app, receive reminders, and show up against a confirmed slot.',
    businessTitle: 'What the firm experiences',
    business:
      'Advisors see their own book. Owners invite staff with permissions instead of sharing one login. IE Orbit does not replace your contract, CRM, or accounting firm — it runs appointments and optional retail.',
    faqs: [
      {
        q: 'Is this only for beauty businesses?',
        a: 'No. Onboarding includes Professional Services as its own category. Orbit Appoint is industry-agnostic scheduling.',
      },
      {
        q: 'Can we use Google Sign-In?',
        a: 'Yes. Owners can continue with Google during registration, and Google Calendar connections exist in the product for eligible workflows.',
      },
      {
        q: 'How do we ask for a demo?',
        a: 'Use the Contact page (add intent=demo) or email support@indiansempire.com. Phone: +91 9766855617.',
      },
    ],
    related: ['education-training', 'clinic-healthcare', 'home-services'],
    products: ['appoint'],
  },
  {
    slug: 'retail',
    path: '/industries/retail',
    name: 'Retail',
    h1: 'Retail POS and GST software',
    lead: 'Orbit Mart is the shop floor product: counter sales, catalog, online orders, GST books, e-invoice, e-way, and Grow tools. Add Orbit Appoint only if you also sell timed services.',
    problemTitle: 'The counter-and-books problem',
    problem:
      'The till, the stock list, and GST paperwork are three different habits. Online orders arrive in a chat. Returns are a notebook. Pet retailers also keep animal records that do not fit a generic SKU list.',
    solutionTitle: 'How Orbit Mart helps retailers',
    solution:
      'Run POS / GST counter sales, catalog, inventory, pickup and delivery orders, and returns in Orbit Mart. Books cover sales, purchases, cash, expenses, parties, stock, GST reports, e-invoice (IRN), and e-way bill. Grow adds WhatsApp share, listing helpers, and calculators. Pets pack is an optional add-on for pet records.',
    featuresTitle: 'Retail features in the product today',
    features: [
      { title: 'POS and catalog', body: 'GST counter sales, products, inventory, and shop loyalty.' },
      { title: 'Orders and delivery', body: 'Online orders, returns, delivery zones, and courier-related flows including Shiprocket where you use them.' },
      { title: 'GST books', body: 'Day-to-day books plus GST reports, e-invoice, and e-way bill — not a separate accounting SKU.' },
      { title: 'Grow and Pets pack', body: 'WhatsApp and listing helpers in Grow. Pets pack is optional monthly add-on for pet retailers.' },
    ],
    workflowTitle: 'How a shop day closes',
    workflow: [
      { title: 'Sell at the counter', body: 'Ring GST-inclusive or exclusive sales on POS against the catalog.' },
      { title: 'Fulfill orders', body: 'Pick up, deliver, or return using the order and zone tools you have enabled.' },
      { title: 'Keep books', body: 'Sales, purchases, cash, and GST compliance stay in the same Orbit Mart product.' },
    ],
    benefitsTitle: 'Retailer benefits',
    benefits: [
      'One product for commerce, books, and Grow — not three subscriptions',
      'Optional Pets pack instead of a separate pet-shop system',
      'Connect Razorpay on eligible Pro plans so customers pay you for shop orders',
      '15-day full-Pro trial, then Starter or Pro in INR',
    ],
    customerTitle: 'What shoppers experience',
    customer:
      'Shoppers use your white-label customer app to browse, order, and track — depending on what you enable — while you run the counter in the ops workspace.',
    businessTitle: 'What the shop experiences',
    business:
      'Cashiers and store managers work in Orbit Mart. If you also cut hair or offer appointments, add Orbit Appoint to the same workspace rather than a second vendor.',
    faqs: [
      {
        q: 'Do we need Orbit Appoint to use Orbit Mart?',
        a: 'No. You can subscribe to Orbit Mart alone. Add Orbit Appoint later if you start booking services.',
      },
      {
        q: 'What is the Pets pack?',
        a: 'An optional Orbit Mart add-on (₹500/month at the default catalog price) for pet records. It is not in the base plan.',
      },
      {
        q: 'Does Orbit Mart include e-invoice?',
        a: 'Yes. GST reports, e-invoice (IRN), and e-way bill are part of Orbit Mart Books as implemented in the product.',
      },
    ],
    related: ['salon-spa', 'home-services', 'fitness-wellness'],
    products: ['mart'],
  },
  {
    slug: 'education-training',
    path: '/industries/education-training',
    name: 'Education & Training',
    h1: 'Class and tutoring booking software',
    lead: 'Coaching centres, tutors, and trainers schedule people and rooms. Orbit Appoint holds that calendar. Orbit Mart is optional if you sell notes, kits, or merchandise.',
    problemTitle: 'The batch-and-slot problem',
    problem:
      'Batches are announced on WhatsApp. Parents message for a makeup class. Trainers keep their own Excel sheet. There is no single view of who is in which slot, and selling printed material is a side cash sale.',
    solutionTitle: 'How IE Orbit helps education and training',
    solution:
      'Treat classes and tutoring slots as bookable services on Orbit Appoint. Staff calendars show who is teaching when. Customers (students or parents) get reminders. Use Orbit Mart if you also need a counter, catalog, and GST books for materials you sell.',
    featuresTitle: 'Features for training teams',
    features: [
      { title: 'Bookable classes', body: 'Publish session types so learners book instead of chasing a coordinator.' },
      { title: 'Trainer calendars', body: 'Staff availability drives what can be booked.' },
      { title: 'Customer records', body: 'Keep who attended, who is due back, and reviews where you collect them.' },
      { title: 'Material sales', body: 'Orbit Mart POS and GST if you sell notes, kits, or merchandise.' },
    ],
    workflowTitle: 'How a training week is run',
    workflow: [
      { title: 'Publish the timetable', body: 'Services and staff hours become the source of truth.' },
      { title: 'Take the session', body: 'Check in learners and keep the record on the customer profile.' },
      { title: 'Sell materials if needed', body: 'Bill kits or notes on Orbit Mart without leaving the workspace.' },
    ],
    benefitsTitle: 'Centre benefits',
    benefits: [
      'One calendar for coordinators and trainers',
      'White-label customer app for bookings',
      'Same trial and UPI subscription model as other IE Orbit industries',
      'Add staff or offices when the centre grows',
    ],
    customerTitle: 'What learners experience',
    customer:
      'Learners or parents book a slot on your branded app and get reminders before class.',
    businessTitle: 'What the centre experiences',
    business:
      'Coordinators stop being the human timetable. IE Orbit is not a full LMS (no invented coursework claims) — it is scheduling plus optional retail.',
    faqs: [
      {
        q: 'Can we schedule one-to-one tutoring and group batches?',
        a: 'Yes, as long as you model them as services with staff availability in Orbit Appoint. You define the services; the product does not invent a separate “LMS”.',
      },
      {
        q: 'Can we sell books or kits?',
        a: 'Add Orbit Mart for catalog, POS, and GST books in the same workspace.',
      },
      {
        q: 'Is pricing in INR?',
        a: 'Website catalog prices are INR. You can store another business currency at onboarding; UPI subscription billing is designed for Indian businesses.',
      },
    ],
    related: ['professional-services', 'fitness-wellness', 'home-services'],
    products: ['appoint', 'mart'],
  },
  {
    slug: 'home-services',
    path: '/industries/home-services',
    name: 'Home Services',
    h1: 'Home services booking software',
    lead: 'On-site teams need a calendar for visits, not a shop floor first. Orbit Appoint books the job. Orbit Mart helps if you also sell parts or products with GST invoicing.',
    problemTitle: 'The field-visit problem',
    problem:
      'Jobs are promised on a phone call. Technicians do not share one calendar. Customers do not get a confirmation they can trust. Spare parts, if sold, are billed on a handwritten slip.',
    solutionTitle: 'How IE Orbit helps home-service teams',
    solution:
      'Book visits against staff availability in Orbit Appoint. Keep the customer, the reminder, and the review with the job. If you sell parts or packaged products, Orbit Mart adds POS, catalog, and GST books — including e-invoice and e-way where you use them.',
    featuresTitle: 'Features for field and home visits',
    features: [
      { title: 'Visit booking', body: 'Customers request a slot online against real staff calendars.' },
      { title: 'Staff dispatch view', body: 'See who is booked so two technicians are not sent to the same window.' },
      { title: 'Customer history', body: 'Know what was done last visit before you roll out.' },
      { title: 'Parts and GST', body: 'Orbit Mart for counter or billed parts with GST reports and e-invoice tools.' },
    ],
    workflowTitle: 'How a job gets done',
    workflow: [
      { title: 'Take the booking', body: 'Online or staff-entered bookings share the same calendar.' },
      { title: 'Run the visit', body: 'The assigned staff member sees the slot; the customer gets reminders.' },
      { title: 'Bill parts if needed', body: 'Sell parts on Orbit Mart in the same business workspace.' },
    ],
    benefitsTitle: 'Operator benefits',
    benefits: [
      'Fewer overlapping visits',
      'A customer app branded to your trade',
      'Optional GST-ready product sales',
      '15-day full-Pro trial without a credit card',
    ],
    customerTitle: 'What households experience',
    customer:
      'Households book a visit on your white-label app and receive reminders instead of only a verbal promise.',
    businessTitle: 'What the operator experiences',
    business:
      'Dispatchers look at one calendar. Extra staff and extra offices (with maps) are add-ons when you grow beyond plan limits.',
    faqs: [
      {
        q: 'Does IE Orbit include live GPS tracking of technicians?',
        a: 'The documented product is appointment operations, optional retail, and related delivery tools in Orbit Mart — not a claimed live technician GPS product. Do not expect features that are not in the workspace.',
      },
      {
        q: 'Can we use this with multiple service areas?',
        a: 'Offices/branches have address and Google Maps location. Extra offices are a monthly add-on. Orbit Mart also has delivery zones for shop orders.',
      },
      {
        q: 'How do we start?',
        a: 'Create an account, pick Orbit Appoint (and Orbit Mart if you sell parts), and use the 15-day full-Pro trial.',
      },
    ],
    related: ['professional-services', 'retail', 'salon-spa'],
    products: ['appoint', 'mart'],
  },
];

export function industryBySlug(slug: string): IndustryContent | undefined {
  return INDUSTRIES.find((item) => item.slug === slug);
}

export function industryByPath(path: string): IndustryContent | undefined {
  return INDUSTRIES.find((item) => item.path === path);
}
