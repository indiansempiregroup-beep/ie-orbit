# IE Platform Mobile (White-label)

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

Pilot owner: `pilot-owner@ieplatform.local` / `PilotPass123!`

## Local flavor run

```bash
EXPO_PUBLIC_FLAVOR_KEY=demo-MAIN \
EXPO_PUBLIC_APP_NAME="Demo Salon" \
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 \
pnpm --filter @ie-platform/mobile start
```

Shortcut scripts:

```bash
pnpm --filter @ie-platform/mobile start:demo
pnpm --filter @ie-platform/mobile start:empire
```

## Dev mode (manual tenant/business context)

```bash
EXPO_PUBLIC_MOBILE_DEV_MODE=true \
EXPO_PUBLIC_TENANT_SLUG=demo \
EXPO_PUBLIC_BUSINESS_CODE=MAIN \
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1 \
pnpm --filter @ie-platform/mobile start
```

## EAS build profiles

Configured in `mobile/eas.json`:

- `demo-main-preview` / `demo-main-production`
- `empire-salon-preview` / `empire-salon-production`

Build commands:

```bash
pnpm --filter @ie-platform/mobile eas:build:demo:preview
pnpm --filter @ie-platform/mobile eas:build:empire:preview
```

Or directly:

```bash
cd mobile && ./scripts/build-flavor.sh demo-main-preview ios
```

Set `EXPO_PUBLIC_EAS_PROJECT_ID` after `eas init`.

## API contract

- `GET /api/v1/mobile/bootstrap`
- `GET /api/v1/mobile/discover/services`
- `GET /api/v1/mobile/availability`
- `POST /api/v1/mobile/bookings/request`
