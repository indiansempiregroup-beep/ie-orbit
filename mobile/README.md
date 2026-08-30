# IE Orbit Mobile (White-label)

Expo SDK 54 customer app with per-business flavor builds.

## Pilot flavors (seeded in dev)

| Flavor key | App name | Tenant / Business |
|---|---|---|
| `demo-MAIN` | Demo Salon | `demo` / `MAIN` |
| `empire-salon-main` | Empire Salon | `empire-salon` / `main` |

Seed command (auto-runs on `docker compose up`):

```bash
docker compose exec backend python manage.py seed_white_label_profiles --create-pilot --all-businesses
# or
bash scripts/seed-white-label.sh
```

Pilot owner: `pilot-owner@ieorbit.local` / `PilotPass123!`

## Local flavor run

```bash
EXPO_PUBLIC_FLAVOR_KEY=demo-MAIN \
EXPO_PUBLIC_APP_NAME="Demo Salon" \
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 \
pnpm --filter @ie-orbit/mobile start
```

Shortcut scripts:

```bash
pnpm --filter @ie-orbit/mobile start:demo
pnpm --filter @ie-orbit/mobile start:empire
```

## Dev mode (manual tenant/business context)

```bash
EXPO_PUBLIC_MOBILE_DEV_MODE=true \
EXPO_PUBLIC_TENANT_SLUG=demo \
EXPO_PUBLIC_BUSINESS_CODE=MAIN \
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 \
pnpm --filter @ie-orbit/mobile start
```

## EAS build profiles

Configured in `mobile/eas.json`:

| Profile suffix | Distribution | API |
|---|---|---|
| `*-preview` | Internal | `http://localhost:8000/api/v1` |
| `*-production-preview` | Internal APK | `https://api.ie-orbit.com/api/v1` |
| `*-production` | Store | `https://api.ie-orbit.com/api/v1` |

Use `production-preview` to sideload an Android APK against the live Interserver API. No Play Store or Apple Developer account is required for Android. iOS internal/TestFlight builds still need a paid Apple account.

```bash
# Live-API APK (recommended before buying store accounts)
pnpm --filter @ie-orbit/mobile eas:build:sanket:production-preview
pnpm --filter @ie-orbit/mobile eas:build:rupali:production-preview
pnpm --filter @ie-orbit/mobile eas:build:demo:production-preview
pnpm --filter @ie-orbit/mobile eas:build:empire:production-preview

# Local-API preview / store builds
pnpm --filter @ie-orbit/mobile eas:build:demo:preview
pnpm --filter @ie-orbit/mobile eas:build:empire:preview
```

Or directly:

```bash
cd mobile && ./scripts/build-flavor.sh rupali-sirsat-production-preview android
cd mobile && ./scripts/build-flavor.sh demo-main-preview ios
```

Install the APK from the EAS page (allow “Install unknown apps”). Set `EXPO_PUBLIC_EAS_PROJECT_ID` after `eas init`.

## API contract

- `GET /api/v1/mobile/bootstrap`
- `GET /api/v1/mobile/discover/services`
- `GET /api/v1/mobile/availability`
- `POST /api/v1/mobile/bookings/request`
