# QA Findings Backlog

Canonical backlog for IE Orbit QA. Cursor agents: read this file first when triaging bugs or working on QA items.

**Legend:** `P0` blocked · `P1` major · `P2` minor · `suggestion` · Status: `open` | `in_progress` | `resolved` | `won't_fix`

---

## Open bugs

_No open bugs from this QA pass._

---

## Open suggestions

## QA-014 | suggestion | open | Legal
- **Area:** Privacy policy
- **Suggestion:** Upgrade the privacy policy section
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #9

## QA-017 | suggestion | open | Auth / Sign-up
- **Area:** Create Account — business address
- **Suggestion:** Include business address verification
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #12

## QA-032 | suggestion | open | Marketing / Header
- **Area:** Header vs footer
- **Suggestion:** Help Center and Integrations only in the footer
- **Source:** findings/2026-09-05.md
- **Notes:** Deferred. Extra header links wrap the bar; a More menu is extra UI. Links stay in the footer until a compact header treatment.

---

## Resolved / verified

## QA-018 | P1 | resolved | Marketing / Pricing
- **Area:** Industry pages → header Pricing
- **Steps:** Open Retail or Education & Training → click Pricing in the header
- **Expected:** Pricing shows the relevant product first (Orbit Mart for Retail)
- **Actual:** Generic `/pricing` always listed Orbit Appoint first
- **Source:** findings/2026-09-05.md; Defects #1–2
- **Notes:** Industry pages pass `?product=shopie|appointie`; PricingPage leads with that product.

## QA-019 | P1 | resolved | Contact
- **Area:** Contact form
- **Steps:** Click Send message without mandatory fields
- **Expected:** Field-level error messages
- **Actual:** `Input` stripped `required`; no in-page errors
- **Source:** findings/2026-09-05.md; Defects #3
- **Notes:** Client-side name/email/message validation; `Input` forwards `required` and `error`.

## QA-020 | P2 | resolved | Auth / Sign-up
- **Area:** Create Account field alignment
- **Steps:** Submit empty business step
- **Expected:** Fields stay aligned
- **Actual:** Error spans were extra grid cells (`grid-column: 1 / -1`)
- **Source:** findings/2026-09-05.md; Defects #4
- **Notes:** Errors render inside `Input`; wizard grid uses `align-items: start`.

## QA-021 | P1 | resolved | Auth / Sign-up
- **Area:** Use current location vs map pin
- **Steps:** Use current location; compare map pin and address text
- **Expected:** Human address matches the pin
- **Actual:** Plus Codes and mismatched locality/pincode
- **Source:** findings/2026-09-05.md; Defects #5
- **Notes:** `preferHumanAddress` keeps a previous human line or composes city/state/postal instead of Plus Codes.

## QA-022 | P1 | resolved | Auth / Sign-up
- **Area:** Sticky required errors after location fill
- **Steps:** Continue empty → Use current location
- **Expected:** Required errors clear when fields fill
- **Actual:** `setValue` without `shouldValidate` left errors
- **Source:** findings/2026-09-05.md; Defects #6
- **Notes:** Place fill now validates and `clearErrors` on address fields.

## QA-023 | P2 | resolved | Auth / Sign-up
- **Area:** Derived address fields
- **Steps:** Fill address from map
- **Expected:** Country/state/city/postal disabled while coords exist
- **Actual:** Only country/state were read-only
- **Source:** findings/2026-09-05.md; Defects #7
- **Notes:** All four derived fields lock when lat/lng are set; same contract on web settings, ops-mobile, and customer address forms.

## QA-024 | P1 | resolved | Auth / Sign-up
- **Area:** Clearing address search
- **Steps:** Fill location → delete search text
- **Expected:** City/country/state/postal/coords clear
- **Actual:** Search-only `onChangeText` left derived fields
- **Source:** findings/2026-09-05.md; Defects #8
- **Notes:** Empty search calls `onPlaceSelected(emptyPlace())` in web, ops-mobile, and customer pickers.

## QA-025 | P1 | resolved | Auth / Sign-up
- **Area:** Branding logo upload
- **Steps:** Upload a `.docx` on Branding
- **Expected:** Reject non-image files
- **Actual:** HTML `accept` only; preview broke
- **Source:** findings/2026-09-05.md; Defects #9
- **Notes:** `LogoUploadField` checks MIME/extension; ImagePicker buttons reject non-image MIME.

## QA-026 | P1 | resolved | Auth / Sign-up
- **Area:** Wizard Continue / Back
- **Steps:** Fill business → Continue → Back; fill owner → next → Back
- **Expected:** Values persist and stay in the correct fields
- **Actual:** City emptied; owner fields shifted
- **Source:** findings/2026-09-05.md; Defects.docx
- **Notes:** Draft save uses `getValues()`; owner fields use distinct `autoComplete` names.

## QA-027 | suggestion | resolved | Marketing / Features
- **Area:** Features → See pricing
- **Suggestion:** More info about Orbit Appoint vs Orbit Mart purposes
- **Source:** findings/2026-09-05.md
- **Notes:** Hero copy now states Appoint (bookings) vs Mart (counter, catalog, GST books, Grow).

## QA-028 | suggestion | resolved | Marketing / Pricing
- **Area:** Pricing plan CTAs
- **Suggestion:** Starter button should be blue; label all options “Select plan”
- **Source:** findings/2026-09-05.md
- **Notes:** All plan buttons use `primary` and the label “Select plan”.

## QA-029 | suggestion | resolved | Marketing / Industries
- **Area:** Salon & Spa related chips
- **Suggestion:** Related industry labels were low-contrast
- **Source:** findings/2026-09-05.md
- **Notes:** `.public-page .public-chip` uses dark text on a light surface.

## QA-030 | suggestion | resolved | Marketing / Industries
- **Area:** Industry hero Pricing button
- **Suggestion:** Stronger look and feel
- **Source:** findings/2026-09-05.md
- **Notes:** Pricing CTA is `neutral` instead of `ghost`.

## QA-031 | suggestion | resolved | Marketing / Public pages
- **Area:** Public site navigation
- **Suggestion:** Back button on each page
- **Source:** findings/2026-09-05.md
- **Notes:** `PublicBackLink` on Features, Pricing, Contact, About, and FAQ.

## QA-033 | suggestion | resolved | Auth / Sign-up
- **Area:** Other category / industry
- **Suggestion:** Required text box when Other is selected
- **Source:** findings/2026-09-05.md
- **Notes:** `businessCategoryOther` / `industryOther` required and sent as `Other: …`.

## QA-034 | suggestion | resolved | Auth / Sign-up
- **Area:** Affiliate code
- **Suggestion:** Tooltip / help text
- **Source:** findings/2026-09-05.md
- **Notes:** Helper text under the field on web and ops-mobile.

## QA-035 | suggestion | resolved | Auth / Sign-up
- **Area:** Create Account tabs
- **Suggestion:** Clear button on each step
- **Source:** findings/2026-09-05.md
- **Notes:** Per-step Clear on web and ops-mobile wizards.

## QA-036 | suggestion | resolved | Auth / Forgot password
- **Area:** Forgot password email
- **Suggestion:** Show the invalid email address
- **Source:** findings/2026-09-05.md
- **Notes:** In-page `Invalid email address: {value}` on web, ops-mobile, and customer.

## QA-001 | P1 | resolved | Auth / Sign-up
- **Area:** Create Account — business address
- **Steps:** Open Create Account → use "Use Current location"
- **Expected:** Address fields populate from current location
- **Actual:** Functionality not working (also marked FAIL in test scenarios)
- **Source:** Execution.pdf, 2026-09-01; IE_Orbit_TewstScenarios_v1.xlsx
- **Notes:** Improved geolocation error messages in AddressLocationPicker; requires GOOGLE_PLACES_API_KEY in env for reverse geocode.

## QA-002 | P2 | resolved | Auth / Sign-up
- **Area:** Create Account form — phone number field
- **Steps:** Open Create Account → enter invalid or empty phone number → submit
- **Expected:** Validation on business phone number field
- **Actual:** Validation on phone number field is not present
- **Source:** Execution.pdf, 2026-09-01; Suggestions sheet #6
- **Notes:** Indian mobile regex on businessPhone and mobile in registerWizardSchema; errors shown in UI.

## QA-003 | P2 | resolved | Auth / Sign-up
- **Area:** Create Account form — required field indicators
- **Steps:** Open Create Account form
- **Expected:** Asterisk or marker on compulsory fields
- **Actual:** Mark for mandatory fields is not present
- **Source:** Execution.pdf, 2026-09-01; Suggestions sheet #1
- **Notes:** Required asterisk on Input and Select labels in RegisterWizard.

## QA-004 | P1 | resolved | Auth / Sign-up
- **Area:** Create Account — business address search
- **Steps:** Open Create Account → use business address search bar
- **Expected:** Search returns and selects address correctly
- **Actual:** Business address search bar not working (FAIL in test scenarios)
- **Source:** Execution.pdf, 2026-09-01; IE_Orbit_TewstScenarios_v1.xlsx
- **Notes:** Clearer API error messaging; search hint for 3+ characters; backend Places key required.

## QA-005 | P2 | resolved | Auth / Sign-up
- **Area:** Create Account form — Cancel button
- **Steps:** Open Create Account → click Cancel
- **Expected:** User redirected to home page
- **Actual:** Cancel does not redirect to home (FAIL in test scenarios)
- **Source:** Execution.pdf, 2026-09-01; IE_Orbit_TewstScenarios_v1.xlsx
- **Notes:** Cancel clears draft and navigates to `/`.

## QA-006 | P2 | resolved | Marketing / Home
- **Area:** Home / marketing pages — Request demo link
- **Steps:** Click "Request demo" link
- **Expected:** Link navigates to correct destination
- **Actual:** Request demo link not working (FAIL in test scenarios)
- **Source:** Execution.pdf, 2026-09-01; IE_Orbit_TewstScenarios_v1.xlsx
- **Notes:** LandingPage Request demo → `/contact?intent=demo` with message prefill.

## QA-007 | P1 | resolved | Auth / Sign-up
- **Area:** Create Account page — form state / cache
- **Steps:** Fill Create Account form → refresh page or revisit Create Account
- **Expected:** Form cache cleared; fields reset
- **Actual:** Cache is not getting cleared
- **Source:** Execution.pdf, 2026-09-01; Suggestions sheet #8
- **Notes:** Draft moved to sessionStorage; freshStart from marketing CTAs and Cancel clears draft.

## QA-008 | P2 | resolved | Auth / Sign-up
- **Area:** Create Account form — email validation
- **Steps:** Enter invalid email in Email field → submit
- **Expected:** Clear validation error message for invalid email
- **Actual:** No proper error message (FAIL in test scenarios)
- **Source:** Execution.pdf, 2026-09-01; IE_Orbit_TewstScenarios_v1.xlsx
- **Notes:** Field errors rendered for businessEmail and owner email on step validation.

## QA-009 | P2 | resolved | Auth / Forgot password
- **Area:** Forgot password flow
- **Steps:** Use Forgot password link
- **Expected:** Forgot password functionality works
- **Actual:** Pass (verified by QA)
- **Source:** Execution.pdf, 2026-09-01

## QA-010 | suggestion | resolved | Contact
- **Area:** Contact page
- **Suggestion:** Include phone number on the contact page
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #2
- **Notes:** Phone card added on ContactPage (verify number with product team).

## QA-011 | suggestion | resolved | FAQ
- **Area:** FAQ page
- **Suggestion:** Help tag appears like a button — adjust styling so it does not look clickable if it is not a button
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #3
- **Notes:** FAQ hero uses public-hero-eyebrow; page expanded with full product, billing, and support FAQ sections.

## QA-012 | suggestion | resolved | Global
- **Area:** External / footer links
- **Suggestion:** Always open links in a new tab and redirect to it
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #4
- **Notes:** externalLinkProps helper added; Terms/Privacy in wizard already use target=_blank; no external footer URLs yet.

## QA-013 | suggestion | resolved | Auth / Sign-up
- **Area:** Create Account form — country / state fields
- **Suggestion:** Disable the country and state textboxes (likely auto-filled from address)
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #7
- **Notes:** Country and state readOnly when lat/lng set from address picker.

## QA-015 | suggestion | resolved | Marketing / Home
- **Area:** Home / marketing navigation
- **Suggestion:** Remove the "Start Free Trial" option
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #10
- **Notes:** Public CTAs renamed to "Create account" (trial copy in hero text unchanged).

## QA-016 | suggestion | resolved | Marketing / Home
- **Area:** Sign-up entry points
- **Suggestion:** Remove "create workspace" link; keep single "create account" path
- **Source:** IE_Orbit_TewstScenarios_v1.xlsx, Suggestions #11
- **Notes:** Removed AuthLayout footer link; wizard labels use Create account.
