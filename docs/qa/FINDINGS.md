# QA Findings Backlog

Canonical backlog for IE Orbit QA. Cursor agents: read this file first when triaging bugs or working on QA items.

**Legend:** `P0` blocked · `P1` major · `P2` minor · `suggestion` · Status: `open` | `in_progress` | `resolved` | `won't_fix`

---

## Open bugs

_No open bugs from the initial QA pass._

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

---

## Resolved / verified

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
