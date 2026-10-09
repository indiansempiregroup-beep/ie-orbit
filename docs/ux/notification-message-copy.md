# Notification message copy — Current → Proposed

UX rewrite for QA feedback: add/edit/delete (and related) toasts/snackbars feel robotic or inconsistent.

**Tone:** warm, clear, short (~80 chars), no “Failed to… / Unable to… / successfully / succeeded” unless clarity needs it. Keep `{placeholders}`. Align web + ops-mobile wording.

**Apply to:** web / ops-mobile / customer mobile as noted.

---

## Core ops

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Customers | create | success | Customer added. / Customer created. | Customer added. | web, ops |
| Customers | update | success | Customer profile updated. / Customer updated. | Customer details saved. | web, ops |
| Customers | create/update | error | Failed to create customer / Failed to update customer / Unable to save customer. | Couldn’t save this customer. Check the details and try again. | web, ops |
| Customers | activate | success | Customer activated. | Customer is active again. | web |
| Customers | deactivate | success | Customer deactivated. | Customer deactivated. | web |
| Customers | archive | success | Customer archived. | Customer archived. | web |
| Customers | record payment | success | Payment of {money} recorded. | Recorded payment of {money}. | web, ops |
| Customers | record payment | error | Unable to record payment. | Couldn’t record that payment. Try again. | web, ops |
| Customers | payment validation | error | Enter a valid payment amount. | Enter a valid payment amount. | web, ops |
| Customers | payment validation | error | Amount cannot exceed outstanding {money}. | Amount can’t be more than {money} outstanding. | web, ops |
| Staff | create | success | Staff member added. / Staff created. | Team member added. | web, ops |
| Staff | update | success | Staff profile updated. / Staff updated. | Team member details saved. | web, ops |
| Staff | create/update | error | Failed to create/update staff / Unable to save staff. | Couldn’t save this team member. Check the details and try again. | web, ops |
| Staff | create + invite fail | error | Staff saved, but the login invitation could not be sent. | Team member saved, but the invite email didn’t send. Try inviting again. | ops |
| Staff | activate | success | Staff activated. | Team member is active again. | web |
| Staff | deactivate | success | Staff deactivated. | Team member deactivated. | web |
| Staff | status | error | Unable to update staff status. | Couldn’t update their status. Try again. | ops |
| Staff | invite | success | Invitation sent. / Invitation sent. They can accept via email… | Invite sent. They can accept by email, then sign in. | web, ops |
| Staff | invite | error | Unable to send invitation. | Couldn’t send the invite. Try again. | web, ops |
| Staff | schedule | success | Availability saved. / Schedule saved. | Weekly schedule saved. | web, ops |
| Staff | schedule | error | Failed to save schedule / Unable to save schedule. | Couldn’t save the schedule. Try again. | web, ops |
| Bookings | create | success | Booking created. / Booking created successfully | Booking created. | web, ops |
| Bookings | confirm | success | Booking confirmed. / Confirm successful. | Booking confirmed. | web, ops |
| Bookings | check-in | success | Customer checked in. / Check in successful. | Customer checked in. | web, ops |
| Bookings | complete | success | Booking completed. / Complete successful. | Booking completed. | web, ops |
| Bookings | cancel | success | Booking cancelled. / Cancel successful. | Booking cancelled. | web, ops |
| Bookings | reschedule | success | Booking rescheduled. | Booking rescheduled. | web, ops |
| Bookings | update generic | success | Updated. | Booking updated. | ops |
| Bookings | create | error | Failed to create booking / Unable to create booking. | Couldn’t create this booking. Check the details and try again. | web, ops |
| Bookings | actions | error | Unable to {action}. / Action failed. | That didn’t go through. Try again. | web, ops |
| Bookings | confirm/cancel/etc | error | Unable to confirm. / Unable to complete. / Unable to reschedule. | Couldn’t confirm this booking. Try again. (same pattern per action) | web |
| Bookings | reassign | success | Staff assignment updated. / Staff reassigned. Assigned staff members have been notified. | Staff updated — they’ve been notified. | web, ops |
| Bookings | reassign | error | Unable to reassign staff. | Couldn’t change the staff. Try again. | web |
| Services | create | success | *(missing on web)* / Service created. | Service added. | web, ops |
| Services | update | success | *(missing on web)* / Service updated. | Service details saved. | web, ops |
| Services | create/update | error | Failed to create/update service / Unable to save service. | Couldn’t save this service. Check the details and try again. | web, ops |
| Team | assign role | success | Assigned {role}. | {role} assigned. | web |
| Team | remove role | success | Role removed. | Role removed. | web |
| Team | invite | success | Invitation sent. | Invite sent. | web |
| Team | revoke invite | success | Invitation revoked. | Invite cancelled. | web |
| Offices | create | success | Office created successfully. / Office created. | Office added. | web, ops |
| Offices | update | success | Office updated. | Office details saved. | web, ops |
| Offices | save | error | Unable to save office. | Couldn’t save this office. Check the details and try again. | web, ops |
| Offices | primary | success | Primary office updated. | Primary office updated. | web, ops |
| Offices | deactivate | success | Office deactivated. | Office deactivated. | web, ops |
| Offices | reactivate | success | Office reactivated. | Office is active again. | web, ops |
| Offices | update | error | Unable to update office. | Couldn’t update this office. Try again. | web, ops |

## Settings / billing / profile

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Business | create | success | Business created successfully. | Business created. | web |
| Business | configure | success | Business and product configured successfully. | Business and product are set up. | web |
| Business | update | success | Business profile updated successfully. / Business profile updated. | Business profile saved. | web, ops |
| Business | create/configure/update | error | Unable to create/configure/save/update business… | Couldn’t save business details. Try again. | web, ops |
| Profile | update | success | Profile updated. | Profile saved. | all (i18n) |
| Profile | update | error | Unable to update profile. | Couldn’t save your profile. Try again. | all (i18n) |
| Payments | Razorpay connect | success | Razorpay connected, tested, and enabled. / Razorpay connected and tested. / Razorpay settings saved. | Razorpay is connected and ready. / Razorpay tested. / Razorpay settings saved. | web |
| Payments | Cashfree connect | success | Cashfree connected, tested, and enabled. / … | Cashfree is connected and ready. / Cashfree tested. / Cashfree settings saved. | web |
| Payments | connect | error | Unable to connect Razorpay/Cashfree. | Couldn’t connect {gateway}. Check the keys and try again. | web |
| Payments | save (ops) | success | Saved and verified with the payment providers. / Payment settings saved. | Payments verified and saved. / Payment settings saved. | ops |
| Payments | save | error | Unable to save payment settings. | Couldn’t save payment settings. Try again. | ops |
| Billing | add-ons | success | Add-ons updated. Billing total refreshed. | Add-ons updated — next bill total refreshed. | web, ops |
| Billing | extras | success | Extras saved. Your next total is updated. | Extras saved — next bill total updated. | web, ops |
| Billing | extras | error | Unable to save extras. Reduce staff or offices… | Couldn’t save extras. Reduce staff or offices if you’re over the limit. | web, ops |
| Billing | refund request | success | Refund request submitted. / Refund requested. IE will review… | Refund requested — IE will email you after review. | web, ops |
| Billing | refund withdraw | success | Refund request withdrawn. | Refund request withdrawn. | web, ops |
| Billing | UPI claim | success | Payment received — waiting for IE to confirm (usually same day). | Payment received — IE usually confirms the same day. | web, ops |
| Billing | cancel pending | success | Pending plan change canceled. | Pending plan change cancelled. | web |
| Billing | keep plan | success | Kept the current {product} plan. | Kept your current {product} plan. | web, ops |
| Reward points | save | success | Reward points settings saved. | Reward points settings saved. | web, ops |
| Reward points | save | error | Unable to save reward points settings. | Couldn’t save reward points settings. Try again. | web, ops |
| Smart lookup | toggle | success | Smart lookup enabled. / Smart lookup disabled. | Smart lookup on. / Smart lookup off. | web, ops |
| Smart lookup | toggle | error | Unable to update smart lookup. | Couldn’t update Smart lookup. Try again. | web, ops |
| Wallet | top-up | success | Top-up submitted. Wallet credits after IE confirms payment. | Top-up submitted — wallet credits after IE confirms. | web, ops |
| Support | reply | success | Reply sent. | Reply sent. | web, ops, mobile |
| Support | reply | error | Could not save reply / Could not send | Couldn’t send that reply. Try again. | web, ops |
| Support | update ticket | success | Ticket updated. | Ticket updated. | ops |
| Support | update ticket | error | Could not update ticket | Couldn’t update this ticket. Try again. | web, ops |

## Automations / Assistant

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Automations | create | success | Automation is live | Automation is on. | web, ops |
| Automations | delete | success | Automation deleted | Automation removed. | web, ops |
| Automations | create | error | Could not create automation | Couldn’t create that automation. Try again. | web, ops |
| Automations | toggle | error | Update failed | Couldn’t update this automation. Try again. | web, ops |
| Automations | delete | error | Could not delete | Couldn’t remove this automation. Try again. | web, ops |
| Automations | draft | error | Could not understand that yet | We couldn’t understand that yet. Try rephrasing. | web, ops |
| Assistant | confirm | error | Confirm failed. | Couldn’t confirm that action. Try again. | web, ops |
| Assistant | cancel | error | Cancel failed. | Couldn’t cancel that action. Try again. | web, ops |

## Shop / Books

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Products | create | success | Product saved. | Product added. | web, ops |
| Products | update | success | Product updated. | Product details saved. | web, ops |
| Products | save | error | Unable to save product. | Couldn’t save this product. Check the details and try again. | web, ops |
| Products | bulk create | success | Saved {n} product(s). | Added {n} product(s). | web, ops |
| Products | bulk create | info | Saved {n}, {errorTotal} need a fix. | Added {n}; {errorTotal} still need a fix. | web, ops |
| Products | bulk create | error | Nothing was saved… / Unable to save products. | Nothing was saved. Fix the row errors and try again. / Couldn’t save these products. Try again. | web, ops |
| Products | bulk update | success | Updated {n} product(s). | Updated {n} product(s). | web, ops |
| Products | bulk update | info | Updated {n}, {failed} failed. | Updated {n}; {failed} didn’t update. | web, ops |
| Products | bulk update | error | Unable to update the selected products. | Couldn’t update the selected products. Try again. | web, ops |
| Suppliers | create | success | Supplier added. | Supplier added. | web, ops |
| Suppliers | update | success | Supplier updated. | Supplier details saved. | web |
| Suppliers | delete | success | Supplier removed. | Supplier removed. | web |
| Suppliers | save/delete | error | Unable to save/remove supplier. | Couldn’t save this supplier. Try again. / Couldn’t remove this supplier. Try again. | web, ops |
| Coupons | create/update | success | Coupon saved. / Coupon updated. | Coupon added. / Coupon details saved. | web, ops |
| Coupons | delete | success | Coupon deleted. | Coupon removed. | web, ops |
| Coupons | save/delete | error | Unable to save/delete coupon. | Couldn’t save this coupon. Try again. / Couldn’t remove this coupon. Try again. | web, ops |
| Zones | create/update | success | Zone saved. / Zone updated. | Delivery zone added. / Delivery zone saved. | web, ops |
| Zones | save | error | Unable to save zone. | Couldn’t save this delivery zone. Try again. | web, ops |
| Godowns | create/update | success | Godown saved. / Godown updated. / Godown created | Godown added. / Godown details saved. | web, ops |
| Godowns | save | error | Unable to save/create/update godown. | Couldn’t save this godown. Try again. | web, ops |
| Godowns | transfer | success | Transfer {n} created. | Transfer {n} created. | web, ops |
| Pets | create/update | success | Pet saved. / Pet created. / Pet updated. | Pet added. / Pet details saved. | web, ops, mobile |
| Pets | delete | success | Pet deleted. | Pet removed. | web, ops |
| Pets | save/delete | error | Unable to save/delete pet. | Couldn’t save this pet. Try again. / Couldn’t remove this pet. Try again. | web, ops |
| Master files | create | success | Added. | Entry added. | web, ops |
| Master files | update | success | Updated. | Entry updated. | web, ops |
| Master files | delete | success | Deleted. | Entry removed. | web, ops |
| Master files | save/update/delete | error | Unable to save/update/delete master file. | Couldn’t save this entry. Try again. | web, ops |
| Master files | toggle | success | Hidden from pickers. / Shown in pickers. | Hidden from pickers. / Shown in pickers. | ops |
| Stock | adjust | success | Stock updated · {name} now {qty} | Stock updated — {name} is now {qty}. | ops |
| Stock | adjust | error | Unable to adjust stock | Couldn’t update stock. Try again. | ops |
| POS / bills | create | success | Bill {n} created… / Challan {n} created… | keep structure; prefer “created” | web, ops |
| POS / bills | create | error | Unable to create bill. / Unable to create… | Couldn’t create this bill. Try again. (same pattern) | web, ops |
| Vouchers | create | success | {voucher_number} saved successfully. | {voucher_number} saved. | web |
| Vouchers | void | success | {voucher_number} voided. | {voucher_number} voided. | web |
| Vouchers | save/void | error | Unable to save {type}. / Unable to void voucher. | Couldn’t save this {type}. Try again. / Couldn’t void this voucher. Try again. | web |
| Expenses | record | success | Expense {n} recorded. | Expense {n} recorded. | web, ops |
| Expenses | void | success | {n} voided. / Entry voided | Entry voided. | web, ops |
| Cash | account | success | Account added. | Account added. | web, ops |
| Cash | payment | success | Payment {n} recorded. | Payment {n} recorded. | web, ops |
| Cash | transfer | success | Transfer {n} recorded. | Transfer {n} recorded. | web |
| Orders | status | success | Order confirmed / Order marked ready / … | keep clear status phrases | ops |
| Orders | status | error | Unable to update order | Couldn’t update this order. Try again. | ops |
| Orders | shipment | success | Shipment saved. Customer can track the package now. | Shipment saved — customer can track it now. | web, ops |
| Orders | shipment | error | Unable to save shipment. | Couldn’t save shipment details. Try again. | web, ops |
| Orders | Shiprocket | success | Booked with Shiprocket. AWB {n}. Customer notified. | Booked with Shiprocket (AWB {n}). Customer notified. | web, ops |
| Orders | Shiprocket | error | Unable to book with Shiprocket. | Couldn’t book with Shiprocket. Try again. | web, ops |
| Orders | rider | success | Rider requested. Live tracking is now active. / …is active. | Rider requested — live tracking is on. | web, ops |
| Orders | rider | error | Dispatch failed. / Unable to dispatch order | Couldn’t request a rider. Try again. | web, ops |
| Returns | create | success | Return {n} completed. | Return {n} completed. | web, ops |
| Returns | create | error | Return failed. / Unable to process return | Couldn’t process this return. Try again. | web, ops |
| Invoice from order | create | success | Invoice {n} created. | Invoice {n} created. | web, ops |
| Invoice from order | create | error | Invoice failed. / Unable to create invoice. | Couldn’t create this invoice. Try again. | web, ops |
| E-invoice | generate | success | E-invoice generated · IRN … | E-invoice generated · IRN … | web, ops |
| E-invoice | cancel | success | E-invoice cancelled. | E-invoice cancelled. | web, ops |
| E-invoice | generate/cancel | error | Unable to generate/cancel e-invoice. | Couldn’t generate e-invoice. Try again. / Couldn’t cancel e-invoice. Try again. | web, ops |
| E-way | generate/cancel | success/error | same pattern as e-invoice | E-way bill generated… / Couldn’t generate e-way bill. Try again. | web, ops |
| Compliance | save | success | GST compliance settings saved. / Compliance settings saved | GST compliance settings saved. | web, ops |
| Compliance | save | error | Unable to save compliance settings. | Couldn’t save compliance settings. Try again. | web, ops |
| Delivery settings | save | success | Instant delivery settings saved. | Instant delivery settings saved. | web, ops |
| Delivery settings | save | error | Unable to save delivery settings. | Couldn’t save delivery settings. Try again. | web, ops |
| Books sale | record | success | Sale {n} recorded | Sale {n} recorded. | ops |
| Books sale | void | success | Sale voided | Sale voided. | ops |
| Books | various errors | error | Unable to record/void… | Couldn’t record/void…. Try again. | ops |
| Cheques | create/clear/bounce | success | Cheque recorded / Cheque cleared / Cheque marked bounced | Cheque recorded. / Cheque cleared. / Cheque marked as bounced. | ops |
| Loans | create/repay | success | Loan created / Repayment recorded | Loan created. / Repayment recorded. | ops |
| Quotations | create/convert | success | Quotation {n} created / Converted to sale {n} | Quotation {n} created. / Converted to sale {n}. | ops |
| Document share | copy | success | Link copied | Link copied. | web, ops |
| Document share | send | success | Sent | Sent. | web, ops |
| Document share | send | error | Send failed | Couldn’t send. Try again. | web, ops |

## Grow

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Ads | create/update | success | Ad created / Ad updated | Ad added. / Ad details saved. | ops |
| Ads | delete | success | Ad deleted | Ad removed. | ops |
| Ads | save/delete | error | Unable to save ad / Unable to delete | Couldn’t save this ad. Try again. / Couldn’t remove this ad. Try again. | ops |
| Referral | save | success | Referral settings saved | Referral settings saved. | ops |
| Referral | save | error | Unable to save | Couldn’t save referral settings. Try again. | ops |
| Google profile | save | success | Google profile saved | Google profile saved. | ops |
| Google profile | save | error | Unable to save | Couldn’t save Google profile. Try again. | ops |
| WhatsApp (Grow) | save | success | WhatsApp settings saved | WhatsApp settings saved. | ops |
| WhatsApp (Grow) | save | error | Unable to save | Couldn’t save WhatsApp settings. Try again. | ops |
| Sync | export | success | Export shared / Copied to clipboard / CSV shared | Export shared. / Copied to clipboard. / CSV shared. | ops |
| Sync | export | error | Unable to export / Unable to copy | Couldn’t export. Try again. / Couldn’t copy. Try again. | ops |

## Platform admin

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Tenant | suspend | success | Suspend succeeded / Tenant suspended | Tenant suspended. | web, ops |
| Tenant | reactivate | success | Reactivate succeeded / Tenant reactivated | Tenant reactivated. | web, ops |
| Tenant | archive/purge | success | Archive succeeded / Purge succeeded | Tenant archived. / Tenant purged. | web |
| Claims | confirm UPI | success | Confirm UPI payment succeeded — the owner was emailed. | UPI payment confirmed — owner emailed. | web |
| Claims | reject UPI | success | Reject UPI claim succeeded — … | UPI claim rejected — owner emailed. | web |
| Claims | resolve refund | success | Resolve refund request succeeded — … | Refund resolved — owner emailed. | web |
| Claims | reject refund | success | Reject refund request succeeded — … | Refund rejected — owner emailed. | web |
| Users | enable | success | {email} can sign in again. | {email} can sign in again. | web |
| Users | disable | success | {email} is now disabled. | {email} can’t sign in now. | web |
| Users | reset | success | Sign-in code email sent to {email}. | Sign-in code emailed to {email}. | web |
| Users | action | error | Action failed | That action didn’t go through. Try again. | web |
| Coupons | save | error | Failed to save/update coupon. | Couldn’t save this coupon. Try again. | web |
| Packages | save | success | Package saved. | Package saved. | web |
| Packages | save | error | Failed to save package. | Couldn’t save this package. Try again. | web |
| Auth settings | save | success | Auth settings saved. | Auth settings saved. | web |
| Help CMS | save | success | Published / Saved as draft | Published. / Saved as draft. | web |
| Help CMS | save | error | Could not save article | Couldn’t save this article. Try again. | web |
| Customer app | brand | success | Brand identity saved. | Brand identity saved. | web, ops |
| Customer app | action fail | error | {label} failed | Couldn’t complete “{label}”. Try again. | web, ops |
| Monitoring | reprocess | success | {id} was reprocessed successfully. / Webhook event reprocessed successfully. | Reprocessed {id}. / Webhook reprocessed. | web |

## Customer mobile

| Feature | Action | Type | Current | Proposed | Apply to |
|---------|--------|------|---------|----------|----------|
| Profile | update | success | Profile updated. | Profile saved. | mobile (i18n) |
| Profile | prefs | success | Notification preferences updated. | Notification preferences saved. | mobile |
| Pets | create/update | success | Pet added. / Pet updated. | Pet added. / Pet details saved. | mobile |
| Addresses | create/update | success | Address saved. / Address updated. | Address saved. / Address details saved. | mobile |
| Addresses | default | success | Default address updated. | Default address updated. | mobile |
| Booking | request | success | Booking requested. | Booking requested. | mobile |
| Booking | update | success | Appointment updated. | Appointment updated. | mobile |
| Booking | review | success | Review submitted. | Thanks — your review is in. | mobile |
| Cart | place | success | Order placed. | Order placed. | mobile |
| Cart | pay | success | Payment successful. | Payment received. | mobile |
| Cart | pay | error | Payment verification failed. | We couldn’t verify the payment. Try again or pay from order details. | mobile |
| Returns | submit | success | Return {n} submitted. | Return {n} submitted. | mobile |
| Support | ticket | success | Support ticket submitted. | Support request sent. | mobile |
| Support | reply | success | Reply sent. | Reply sent. | mobile |

## Gaps to fill (add success feedback)

| Feature | Action | Gap | Proposed success | Apply to |
|---------|--------|-----|------------------|----------|
| Services | create | No success snackbar on web | Service added. | web |
| Services | update | No success snackbar on web | Service details saved. | web |

## PO review notes

- Prefer Indian English spelling: cancelled; use **cancelled** consistently (not canceled).
- Keep GST / e-invoice / godown / IRN / AWB jargon — operators know these.
- “Team member” preferred over “Staff” in user-facing success lines (staff still OK in labels).
- Applied in code: create booking uses **Booking created.** (not “Booking booked.”).
- Don’t lengthen POS money lines; keep `· {money}` pattern.
- API `error.message` still wins when present; these are fallbacks only.
- Apostrophes in copy use double-quoted JS/TS string literals (`"Couldn't…"`).

## Status

- Proposed table above: reviewed and applied across web, ops-mobile, customer mobile, and `packages/i18n`.
- Gaps filled: web Services create/update now show success snackbars.
