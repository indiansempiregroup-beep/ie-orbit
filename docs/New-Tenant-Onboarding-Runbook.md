# White-Label Customer APK — Admin Steps

When a business registers via the **ops app** (or website), they get a workspace on the shared ops platform immediately. **No ops app work per tenant** — owners keep using `https://ops.ie-orbit.com` or the single shared ops APK.

This runbook is only for building their **customer** white-label app (`mobile/`) — the app their end-customers install to book / shop.

---

## Ops app vs customer app

| | Ops app | Customer app |
|---|---------|----------------|
| Who uses it | Business owner & staff | End customers |
| Per tenant? | **No** — one shared app | **Yes** — one APK per business |
| You configure | Nothing per tenant | Steps below |

---

## Before you start

From Platform Admin → **Tenants** / **Branding**, note:

| Variable | How to get it |
|----------|----------------|
| `tenant_slug` | Tenant slug |
| `business_code` | Business code |
| `business_id` | Business UUID |
| `flavor_key` | `{tenant_slug}-{business_code}` (replace `_` with `-`) |
| `PACKAGE` | Choose once, e.g. `com.ieorbit.acmesalon` |

Customer EAS project (shared): `d3605998-b92a-497d-a72f-8028df3ca64d`

---

## Step 1 — Create white-label profile

Registration does **not** set bundle IDs. Run once per new business:

```bash
docker compose exec backend python manage.py seed_white_label_profiles --all-businesses
```

Set bundle IDs + enable white-label (Platform Admin → **Branding**, or API):

```bash
curl -X PATCH "https://api.ie-orbit.com/api/v1/platform/white-label/<business_id>" \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "flavor_key": "acme-salon-main",
    "app_name": "Acme Salon",
    "bundle_id_ios": "com.ieorbit.acmesalon",
    "bundle_id_android": "com.ieorbit.acmesalon",
    "white_label_enabled": true,
    "primary_color": "#1A56DB",
    "secondary_color": "#111827"
  }'
```

Verify:

```bash
curl "https://api.ie-orbit.com/api/v1/mobile/bootstrap?flavor_key=acme-salon-main"
```

---

## Step 2 — Add flavor to `mobile/flavors/manifest.json`

Copy the `sanket-pet-shop` entry and edit (`key` must match `flavor_key`):

```json
{
  "key": "acme-salon-main",
  "appName": "Acme Salon",
  "appSlug": "acme-salon",
  "bundleIdIos": "com.ieorbit.acmesalon",
  "bundleIdAndroid": "com.ieorbit.acmesalon",
  "tenantSlug": "acme-salon",
  "businessCode": "main",
  "primaryColor": "#1A56DB",
  "secondaryColor": "#111827"
}
```

---

## Step 3 — Add EAS profile in `mobile/eas.json`

Copy **`sanket-pet-shop-production-preview`** → rename to `<short-name>-production-preview`.  
Profile key (e.g. `acme-salon-production-preview`) can differ from `flavor_key` (e.g. `acme-salon-main`).

### `production-preview` (usual — sideload APK)

```json
"acme-salon-production-preview": {
  "distribution": "internal",
  "android": { "image": "sdk-54", "buildType": "apk" },
  "env": {
    "EXPO_PUBLIC_FLAVOR_KEY": "acme-salon-main",
    "EXPO_PUBLIC_APP_NAME": "Acme Salon",
    "EXPO_PUBLIC_APP_SLUG": "acme-salon",
    "EXPO_PUBLIC_API_BASE_URL": "https://api.ie-orbit.com/api/v1",
    "EXPO_PUBLIC_EAS_PROJECT_ID": "d3605998-b92a-497d-a72f-8028df3ca64d"
  }
}
```

Build:

```bash
cd mobile && npx eas-cli build --profile acme-salon-production-preview --platform android
```

### Optional env vars (copy from Sanket profile)

EAS does not use your local `.env` — add these to the profile `env` block when needed:

| If tenant needs… | Add to `env` | Per tenant? |
|------------------|--------------|-------------|
| Google Sign-In | `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | No — same Web client for all |
| Google Sign-In | `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID` | **Yes** — new per package + SHA-1; also set `GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID` on VPS |
| Ads (`google_ads` flag) | All four `EXPO_PUBLIC_ADMOB_*` | No — copy unchanged from `sanket-pet-shop-production-preview` |
| Delivery maps | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | No — platform Maps key |

**Sanket-style `env` block** (Google + ads):

```json
"EXPO_PUBLIC_GOOGLE_MAPS_API_KEY": "<platform-maps-key>",
"EXPO_PUBLIC_GOOGLE_PLACES_API_KEY": "<platform-maps-key>",
"EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID": "373269001775-493p9n4iglmilp2i0990q3n19sfjpr6k.apps.googleusercontent.com",
"EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID": "<per-tenant-android-client-id>",
"EXPO_PUBLIC_ADMOB_ANDROID_APP_ID": "ca-app-pub-1258778965386332~2750313610",
"EXPO_PUBLIC_ADMOB_IOS_APP_ID": "ca-app-pub-1258778965386332~4831505872",
"EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID": "ca-app-pub-1258778965386332/9124150278",
"EXPO_PUBLIC_ADMOB_IOS_BANNER_UNIT_ID": "ca-app-pub-1258778965386332/8686105928"
```

### `production` (Play Store only — add later)

Copy **`sanket-pet-shop-production`**: `"distribution": "store"`, same `env`, **no** `"buildType": "apk"`.  
Add matching entry under `"submit"`: `"acme-salon-production": {}`.

```bash
cd mobile && npx eas-cli build --profile acme-salon-production --platform android
cd mobile && npx eas-cli submit --platform android --profile acme-salon-production
```

| | `production-preview` | `production` |
|---|---------------------|--------------|
| Output | `.apk` sideload | `.aab` for Play Store |
| When | First / UAT | After preview tested |

Optional `mobile/package.json` script: `"eas:build:acme:production-preview": "bash ./scripts/build-flavor.sh acme-salon-production-preview android"`

---

## Step 4 — Firebase (Android push)

1. Firebase Console → add Android app with package `com.ieorbit.acmesalon`
2. Download `google-services.json`
3. Save locally (gitignored):

```bash
mkdir -p mobile/credentials/google-services
cp ~/Downloads/google-services.json \
  mobile/credentials/google-services/com.ieorbit.acmesalon.json
```

4. FCM V1 on EAS — **once per customer EAS project** (skip if already uploaded):

```bash
cd mobile
npx eas-cli credentials
```

5. Check:

```bash
cd mobile
EXPO_PUBLIC_FLAVOR_KEY=acme-salon-main node ./scripts/materialize-google-services.cjs
```

---

## Step 5 — Build APK

```bash
cd mobile
npx eas-cli login
npx eas-cli build --profile acme-salon-production-preview --platform android
```

Or from repo root:

```bash
corepack pnpm --filter @ie-orbit/mobile eas:build:acme:production-preview
```

Copy the **SHA-1** from EAS credentials if you need Google Sign-In (Step 6).

---

## Step 6 — Google Sign-In (optional)

Skip if customers only use email/password.

1. Google Cloud Console → Android OAuth client (package + SHA-1 from Step 5)
2. Add to `mobile/eas.json` profile env:

```json
"EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID": "<web-client-id>",
"EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID": "<android-client-id>"
```

3. VPS `.env` → `GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID=<android-client-id>` → restart backend
4. Rebuild APK (Step 5 again)

---

## Step 7 — Deliver APK

1. Download from [expo.dev](https://expo.dev) build page
2. Send APK to tenant (or publish to Play Store later)
3. Customer opens app → signs up / books / shops against live API

Push notifications need `EXPO_ACCESS_TOKEN` on VPS (platform-wide, not per tenant).

---

## Checklist

```
Tenant: _______________   flavor_key: _______________   package: _______________

[ ] seed_white_label_profiles run
[ ] Bundle IDs + white_label_enabled set
[ ] manifest.json entry
[ ] eas.json production-preview profile (sideload APK)
[ ] eas.json production profile + submit entry (only for Play Store)
[ ] google-services.json local file
[ ] EAS build succeeded
[ ] Google OAuth (if needed)
[ ] APK tested on device
```

**Not needed per tenant:** ops app build, VPS deploy, DNS.
