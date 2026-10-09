# Channel notification copy — Email / In-app / WhatsApp / Push

Companion to [notification-message-copy.md](./notification-message-copy.md) (toast/snackbar CRUD feedback).

This doc covers **messages customers and staff receive** via email, in-app inbox, Expo push, and WhatsApp.

**Tone:** warm, clear, India English; short subjects; plain bodies. Keep placeholders (`{{…}}` / `{…}` / Meta `{{1}}`).

**Push:** reuses the same subject/body as in-app/email — no separate catalog.

---

## Constraint: WhatsApp (Meta)

Bodies in [`whatsapp_catalog.py`](../../backend/apps/notifications/services/whatsapp_catalog.py) are what get submitted to Meta on first sync. **After Meta approval, changing wording requires re-review.**

No credentials are connected yet, so catalog bodies were updated in code before the first submit.

Email / in-app / push can be updated freely (booking templates re-seed via `ensure_notification_templates`).

---

## Prompt (for rewrite review)

```text
You are a UX copywriter for IE Orbit (salon/spa + retail, India).
Rewrite email, in-app, and push notification subjects/bodies to feel warm and human.
Keep placeholders. Do not invent features. WhatsApp Meta {{1}} param order must stay identical.
Flag anything that needs Meta re-approval.
```

---

## Bookings — customer (email + in-app + push)

Source: [`template_seed.py`](../../backend/apps/notifications/services/template_seed.py) `CUSTOMER_TEMPLATES`

| Code | Current subject | Proposed subject | Current body (summary) | Proposed body notes |
|------|-----------------|------------------|------------------------|---------------------|
| booking_created | We've received your booking at {{business_name}} | Booking received · {{business_name}} | Booking is in; we'll confirm shortly | Keep tone; subject slightly clearer |
| booking_confirmed | You're confirmed · {{service_name}} | You're confirmed · {{service_name}} | Great news… See you soon | **Keep** (already warm) |
| booking_cancelled | Booking cancelled · {{booking_number}} | Booking cancelled · {{booking_number}} | Cancelled; need a new time? | **Keep** |
| booking_rescheduled | New time for {{service_name}} | New time · {{service_name}} | Moved to {{start_at}} | Light subject polish |
| booking_completed | Thanks for visiting {{business_name}} | Thanks for visiting {{business_name}} | Complete; we'd love feedback | **Keep** |
| booking_reminder | ⏰ Your appointment starts in 15 minutes! | Reminder · {{service_name}} in 15 minutes | Almost here + details | Drop leading emoji in subject (cleaner in email clients) |

---

## Bookings — staff / admin (email + in-app + push)

Source: `ADMIN_TEMPLATES` in same file

| Code | Current subject | Proposed subject | Body change |
|------|-----------------|------------------|-------------|
| booking_created_admin | New booking · {{customer_name}} | New booking · {{customer_name}} | Keep |
| booking_confirmed_admin | Confirmed · {{booking_number}} | Confirmed · {{booking_number}} | Keep |
| booking_cancelled_admin | Cancelled · {{booking_number}} | Cancelled · {{booking_number}} | Keep |
| booking_rescheduled_admin | Rescheduled · {{booking_number}} | Rescheduled · {{booking_number}} | Keep |
| booking_completed_admin | Completed · {{booking_number}} | Completed · {{booking_number}} | “marked complete” → “is complete” |
| booking_reminder_admin | 📋 Upcoming appointment in 15 min | Upcoming in 15 min · {{customer_name}} | Drop emoji; name in subject |
| booking_reminder_staff | ✨ You're up in 15 minutes! | You're up in 15 minutes | Drop emoji; keep body energy |
| booking_reviewed_admin | New review · {{rating}}★ | New review · {{rating}}★ | Keep |
| booking_staff_assigned_admin | Assigned · {{service_name}} | You're assigned · {{service_name}} | “You have been assigned” → “You're on {{service_name}} for {{customer_name}}…” |

---

## WhatsApp (Meta catalog) — applied

Source: [`whatsapp_catalog.py`](../../backend/apps/notifications/services/whatsapp_catalog.py)

| Code | Body (live in catalog) | Notes |
|------|------------------------|-------|
| auth_otp | Your IE Orbit sign-in code is {{1}}. It expires in {{2}} minutes. | Unchanged |
| booking_created | Hi {{1}}, we received your booking {{2}} for {{3}} at {{4}} on {{5}}. We'll confirm shortly. | Applied |
| booking_confirmed | Hi {{1}}, you're confirmed: {{3}} at {{4}} on {{5}} ({{2}}). See you soon! | Applied; same {{n}} params |
| booking_cancelled | Hi {{1}}, booking {{2}} for {{3}} at {{4}} on {{5}} was cancelled. Reply if you need a new time. | Applied |
| booking_reminder | Hi {{1}}, reminder — {{2}} at {{3}} starts at {{4}} ({{5}}). We look forward to seeing you. | Applied |
| order_confirmed | Hi {{1}}, {{2}} confirmed your order {{3}} and is getting it ready. | Applied |
| order_ready | Hi {{1}}, order {{2}} from {{3}} is ready for you. | Applied |
| order_out_for_delivery | Hi {{1}}, order {{2}} from {{3}} is on the way. | Applied |
| order_completed | Hi {{1}}, order {{2}} from {{3}} is complete. Thank you for shopping with us. | Applied |
| order_cancelled | Hi {{1}}, order {{2}} from {{3}} was cancelled. Contact the shop if you need help. | Applied |
| sale_invoice_shared | Hi {{1}}, here's invoice {{3}} from {{2}} for {{4}}. View: {{5}} | Applied |
| quotation_shared | Hi {{1}}, here's quotation {{3}} from {{2}} for {{4}}. View: {{5}} | Applied |
| delivery_challan_shared | Hi {{1}}, here's delivery challan {{3}} from {{2}} for {{4}}. View: {{5}} | Applied |

---

## Shop orders — customer (email + in-app + push)

Source: [`order_notify.py`](../../backend/apps/shopie/services/order_notify.py) `_copy_for_status` / `_copy_for_shipment`

Most lines are already warm. Targeted polish:

| When | Current subject / issue | Proposed |
|------|-------------------------|----------|
| pending | We've received your order · #{n} | Order received · #{n} |
| finding_rider body | “Finding your rider for order…” (awkward) | “We're finding a rider for order #{n}. Open the order for live updates.” |
| rider_assigned / at_pickup | Same pattern | “A rider is assigned…” / “Your rider is at the shop…” |
| staff new order | New online order · #{n} | Keep |

Returns / shipment bodies: keep (already clear).

---

## Shop documents (email + WhatsApp free-text share)

Source: [`shop_documents.py`](../../backend/apps/shopie/services/shop_documents.py) `share_message`

| Kind | Current | Proposed |
|------|---------|----------|
| share | `{business}: your {title} {number} for {currency} {total}. View: {url}` | `{business}: here's your {title} {number} ({currency} {total}). View: {url}` |
| payment reminder | `{business}: payment reminder for {title} {number}. Due …` | `{business}: friendly reminder — {title} {number} has {currency} {due} due. View: {url}` |
| email subject | `{short_title} {number} from {business}` | Keep |
| email subject remind | `Payment reminder · {number}` | Keep |

---

## Auth & invites (email)

| Source | Current | Proposed |
|--------|---------|----------|
| [`otp_email.py`](../../backend/apps/authentication/emails/otp_email.py) | `{code} is your IE Orbit sign-in code` | **Keep** (security-clear; test asserts this) |
| [`verification_email.py`](../../backend/apps/authentication/emails/verification_email.py) | Your IE Orbit verification code | **Keep** |
| [`registration_invite.py`](../../backend/apps/customers/emails/registration_invite.py) | `{shop} added you as a customer…` | `{shop} invited you to book with them. Create your account to book, see visit history, and manage notifications.` |
| [`invitations.py`](../../backend/apps/staff/services/invitations.py) | You are invited to join {business} on IE Orbit / You have been invited… | You're invited to join {business} on IE Orbit / You've been invited to join {business} as {role}. Accept to get started… |

---

## Billing / UPI (email + in-app + push)

Source: [`upi_notifications.py`](../../backend/apps/billing/services/upi_notifications.py)

| Event | Current (owner) | Proposed |
|-------|-----------------|----------|
| claim submitted | We received your {products} payment | Payment received · {products} |
| claim confirmed | {products} is active | {products} is active — you're all set |
| claim rejected | We could not confirm your UPI payment… | We couldn't confirm your UPI payment of {amount} for {products}. {reason} Open Products & billing to try again. |
| refund submitted | Refund request received for {products} | Refund request received · {products} |
| refund resolved | Refund processed for {products} | Refund processed · {products} |
| refund rejected | We could not approve… | We couldn't approve your refund request for {products}. {reason} |

Admin subjects (`UPI claim waiting · …`) — keep terse for ops inbox.

---

## Apply order

1. Booking `template_seed.py` (in-app/email/push) — applied when templates are re-ensured for tenants
2. Staff/customer invite emails
3. Order notify awkward rider lines + pending subject
4. Document share_message
5. UPI owner-facing reject/confirm polish
6. WhatsApp catalog bodies — applied before first Meta submit

---

## Status

- Inventory complete → [docs/ux/channel-notification-copy.md](./channel-notification-copy.md)
- Applied: booking template seed, staff/customer invites, order notify, document share, UPI, **WhatsApp catalog**
- Note: existing tenants get updated booking email/in-app templates when `ensure_notification_templates` runs again
- WhatsApp: new wording ships on first credential connect + template sync to Meta
