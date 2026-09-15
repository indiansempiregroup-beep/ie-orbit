# Customer app — preview APK → Play Store

Platform Admin drives go-live for a tenant’s white-label customer app. No per-tenant `eas.json` / `manifest.json` commits for new businesses.

**Ops app** stays shared. This doc is only for the **customer** APK/AAB.

Hands-on entry: Platform Admin → Tenants → tenant → **Customer app** (also on ops-mobile tenant detail).

First tenant example: **Sunita Spa** (`sunita-spa`, package `com.ieorbit.sunitaspa`, business id `01a0725c-fdda-7fa1-b2cb-2892e6795740`).

---

## Tracks

| | Preview | Production |
|---|---|---|
| EAS profile | `customer-production-preview` | `customer-production` |
| Output | Internal **APK** | Store **AAB** |
| Ads | Test ads | Live AdMob (shared platform IDs) |
| Admin button | **Build preview APK** | **Build store AAB** |

Setup (white-label, Google client, Firebase) is shared by both tracks.

---

## Phase A — Setup (once)

1. Open the tenant → **Customer app**. Defaults fill package / flavor / slug.
2. Set **App name** (e.g. Sunita Spa) → paste **Google Android OAuth client ID** → **Save setup**.
3. Create the Google Android OAuth client yourself in Google Cloud:
   - Package = recipe package (copy from admin)
   - SHA-1 = recipe **EAS SHA-1** (`70:D2:64:E9:…`)
   - Do **not** overwrite VPS `GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID` (Sanket’s single slot). Per-tenant client id lives on the white-label profile.
4. Click **Create Firebase app** (API creates the Android app, stores `google-services.json`, adds EAS SHA-1).

Checklist chips: White-label · Google Sign-In · Firebase → headline **Ready for preview**.

---

## Phase B — Preview APK

1. **Build preview APK** (requires setup complete).
2. Admin polls ~15s while status is queued/in_progress.
3. When finished: **Open Expo build** + **Download APK**.
4. Sideload; smoke-test booking, Google Sign-In, push.

Chip: Preview APK.

---

## Phase C — Go live (Play)

Still manual in Play Console: create the Android app (same package), listing, privacy policy. Link EAS submit credentials if not already on the publisher account.

Then on **Customer app**:

1. Paste **Play App Signing SHA-1** → Save → **Refresh Firebase** (adds SHA). Add the same SHA on the Google OAuth Android client (or a second client) so Sign-In works on Play builds.
2. **Build store AAB**.
3. Download AAB from Expo (or submit via EAS when credentials are wired).
4. **Mark live on Play** when the version is published.

Chips: Store AAB · Submitted · Live.

---

## Phase D — Updates

Same tab: build store AAB again (`autoIncrement` bumps `versionCode`). No new Firebase/Google setup unless the package changes.

---

## VPS / GitHub env (ops)

On production backend (`/opt/ie-orbit/.env`):

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service account JSON with Firebase Management on project `ie-orbit` |
| `CUSTOMER_APK_GITHUB_REPO` | e.g. `indians-empire/ie-orbit` |
| `CUSTOMER_APK_GITHUB_TOKEN` | PAT / fine-grained token with `actions:write` |
| `CUSTOMER_APK_MACHINE_TOKEN` | Shared secret; GitHub Action uses the same value |
| `CUSTOMER_APK_GITHUB_REF` | Optional, default `main` |
| `CUSTOMER_APK_WORKFLOW` | Optional, default `customer-apk.yml` |
| `EXPO_ACCESS_TOKEN` / `EXPO_TOKEN` | Optional status refresh from Expo GraphQL |

GitHub repo secrets for `.github/workflows/customer-apk.yml`:

- `EXPO_TOKEN`
- `CUSTOMER_APK_MACHINE_TOKEN` (same as VPS)

Optional repo variable: `CUSTOMER_APK_API_BASE` (default `https://api.ie-orbit.com/api/v1`).

Restart backend after editing VPS `.env`.

---

## Shared constants

```
EAS project:       d3605998-b92a-497d-a72f-8028df3ca64d
Live API:          https://api.ie-orbit.com/api/v1
EAS SHA-1:         70:D2:64:E9:71:3D:41:4D:CA:D6:64:EA:E5:C4:B5:CB:52:3A:7E:99
Firebase:          ie-orbit
Google Cloud:      still-cipher-490712-n7
Web OAuth client:  373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com
```

---

## Fallback (manual EAS)

If GitHub dispatch is down, you can still build locally with the generic profiles after exporting the same env the machine endpoint returns (`EXPO_PUBLIC_*` + `GOOGLE_SERVICES_JSON`):

```bash
cd mobile
# export env from Platform Admin recipe / machine payload
npx eas-cli build --profile customer-production-preview --platform android
```

Prefer the admin button so versions and Expo URLs stay on the tenant profile.

---

## Related

- [New-Tenant-Onboarding-Runbook.md](New-Tenant-Onboarding-Runbook.md) — tenant creation; then use this lifecycle for the customer app.
