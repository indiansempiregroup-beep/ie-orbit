# Form and public-page QA checklist

Use this whenever you add or change a form or public page on **web**, **ops-mobile**, or the **customer app**. Canonical findings still live in [`FINDINGS.md`](FINDINGS.md).

## Required fields

- Required fields have a visible marker.
- Validation actually blocks submit (not asterisk-only).
- Field errors sit in the **same cell** as the control so grids do not shift.

## Email

- Empty email shows a required/invalid message.
- Invalid email shows a message that includes the typed value (for example `Invalid email address: foo`).

## Address picker

- Search, **Use current location**, and map pin drag all fill line, city, state, country, postal, and coordinates.
- Filling a place **clears** stale required errors.
- Clearing the search also clears city, state, country, postal, and coordinates.
- Derived fields are read-only while coordinates exist; they unlock when the place is cleared.
- Do not prefer a Plus Code over a human address or locality.
- Back / step change does not wipe or shift values. Persist the full form (`getValues()`), not only the mounted step. Use distinct `autoComplete` names on owner vs business fields.

## Files and images

- Reject disallowed types in JavaScript, not only `accept=` or the native picker filter.
- Show an inline error; do not preview a `.docx` as a logo.

## Other / custom options

- If category, industry, or similar has **Other**, show required free text and persist it.

## Cross-app

- If the same form exists on web, ops-mobile, or customer, apply the same contract in the same change.

## Website-only (do not copy to mobile)

- Header Help Center and Integrations (deferred: keep footer-only until a compact header treatment).
- Public-page Back link.
- Industry → Pricing product context (`?product=`).
