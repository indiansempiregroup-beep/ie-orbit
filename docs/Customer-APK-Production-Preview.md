# Customer app — preview APK → Play Store

Platform Admin drives go-live for a tenant’s white-label customer app. No per-tenant `eas.json` / `manifest.json` commits for new businesses.

**Ops app** stays shared. This doc is only for the **customer** APK/AAB.

Hands-on entry: Platform Admin → Tenants → tenant → **Brand & app** (also on ops-mobile tenant detail). Upload one logo; tune **Icon & logo background** (style, icon/splash colors, logo size). Store icons are composed from those settings.

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

## UAT first, then prod

Same Phase A–B on both stacks. Admin hosts and databases differ; Firebase project `ie-orbit` is shared.

1. **UAT** — `https://app-uat.ie-orbit.com` → Tenants → tenant → **Brand & app** → complete Phase A → **Build preview APK** → sideload and QA against `api-uat`.
2. **Prod** — `https://app.ie-orbit.com` → same tenant steps on the **prod** record (separate DB). Reuse the same Android package, Google OAuth Android client, and Firebase Android app. Still click **Create/Refresh Firebase** once on prod so *that* profile stores `google_services_json`, then **Build preview APK** against live API.

---

## Phase A — Setup (once per environment)

1. Open the tenant → **Brand & app**. Defaults fill package / flavor / slug. **Upload** the business logo (square PNG/WebP) and set colors. Under **Icon & logo background**, choose logo-on-background vs full icon, set icon/splash colors, and adjust logo size. Use **Advanced · App icon override** only if that still looks wrong.
2. Set **App name** (e.g. Sunita Spa) → paste **Google Android OAuth client ID** → **Save brand & setup**.
3. Create the Google Android OAuth client yourself in Google Cloud (once per package; reuse on UAT and prod):
   - Package = recipe package (copy from admin)
   - SHA-1 = recipe **EAS SHA-1** (`70:D2:64:E9:…`)
   - Do **not** overwrite VPS `GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID` (Sanket’s single slot). Per-tenant client id lives on the white-label profile.
4. Click **Create Firebase app** (button becomes **Refresh Firebase app** after success).
   - If the Android app **already exists** in Firebase for that package, the API **reuses** it (no duplicate), adds EAS SHA-1 if missing, and downloads `google-services.json` onto **this** env’s white-label profile.
   - Package in admin must match the Firebase Android package exactly.

Checklist chips: Brand · Google Sign-In · Firebase → headline **Ready for preview**.

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

Then on **Brand & app**:

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

Works on **both** prod and UAT. Each stack dispatches with its own git `ref` and `api_base`.

| Variable | Prod (`/opt/ie-orbit`) | UAT (`/opt/ie-orbit-uat`) |
|---|---|---|
| `PUBLIC_API_ORIGIN` | `https://api.ie-orbit.com` | `https://api-uat.ie-orbit.com` |
| `CUSTOMER_APK_GITHUB_REPO` | `indiansempiregroup-beep/ie-orbit` | same |
| `CUSTOMER_APK_GITHUB_TOKEN` | PAT with Actions write | same value |
| `CUSTOMER_APK_MACHINE_TOKEN` | Shared with GitHub secret | **same** value |
| `CUSTOMER_APK_GITHUB_REF` | `prod` | `uat` |
| `CUSTOMER_APK_WORKFLOW` | `customer-apk.yml` | same |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/run/secrets/firebase-management.json` | same path (host file under `secrets/`) |

Prefer mounting `secrets/firebase-management.json` over inlining `FIREBASE_SERVICE_ACCOUNT_JSON`. The backend process runs as `appuser`, so the host file must be readable (`chmod 644 secrets/firebase-management.json`). Mode `600` owned by root causes `Permission denied` on Create Firebase app.

GitHub repo secrets for `.github/workflows/customer-apk.yml`:

- `EXPO_TOKEN`
- `CUSTOMER_APK_MACHINE_TOKEN` (same as both VPS stacks)

Do **not** set a global Actions variable `CUSTOMER_APK_API_BASE` — Django passes `api_base` per dispatch (prod vs UAT). Recreate backend after editing `.env` / compose.

---

## Shared constants

```
EAS project:       d3605998-b92a-497d-a72f-8028df3ca64d
Live API:          https://api.ie-orbit.com/api/v1
UAT API:           https://api-uat.ie-orbit.com/api/v1
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

## Android notification links

Customer notification emails use `https://ie-orbit.com/open/...`. Android opens
those links directly in an installed white-label app only when both sides match:

- the APK was built with `EXPO_PUBLIC_REFERRAL_LINK_BASE_URL`;
- `docker/nginx/well-known/customer-assetlinks.json` contains that APK package
  and its SHA-256 signing certificate fingerprint.

The machine build payload supplies the link origin automatically. When a new
customer package is introduced, extract its EAS/Play signing SHA-256 fingerprint,
add another entry to `customer-assetlinks.json`, and redeploy nginx. If Google
Play App Signing is enabled, include the Play signing fingerprint as well as the
EAS/internal APK fingerprint.

Verify production after deployment:

```bash
curl -fsS https://ie-orbit.com/.well-known/assetlinks.json | python3 -m json.tool
```

iOS Universal Links additionally require an Apple Developer Team ID and a valid
`/.well-known/apple-app-site-association` file. Do not publish a placeholder Team
ID; keep the web trampoline fallback until Apple signing is configured.

---

## Related

- [New-Tenant-Onboarding-Runbook.md](New-Tenant-Onboarding-Runbook.md) — tenant creation; then use this lifecycle for the customer app.
