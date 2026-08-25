# IE Orbit — Web Foundation

This folder contains the foundational React workspace for the IE Orbit web dashboard.

Quick start:

```bash
cd web
corepack pnpm install
corepack pnpm dev
```

What's included:

- App bootstrap and global providers (`AppProviders`) — Query, Auth, Theme, ErrorBoundary
- Authentication context wired to the Shared SDK (`AuthContext`)
- Theme context with light/dark/system modes (`ThemeContext`)
- Snackbar provider and hook for transient messages
- Shared components: `Button`, `Card`, `Spinner`, `ErrorState`
- Guards: `ProtectedRoute`, `RoleGuard`, `PermissionGuard`, `FeatureGuard`
- Simple feature flags service using `localStorage`

Notes:
- Use the Shared SDK only for API access; do not call APIs directly.
- Follow the design tokens and component mapping in the `ie-orbit-design` repository.

## M11.7 — Self-Service Onboarding

Public marketing routes (`/`, `/features`, `/pricing`, etc.) and the registration wizard (`/auth/register/start`) are implemented under:

- `src/features/public/` — marketing pages and `PublicLayout`
- `src/features/onboarding/` — wizard, provisioning, getting-started checklist
- `src/features/auth/` — sign in, forgot/reset password, email verification

See `../docs/M11.7-Self-Service-Onboarding.md` for architecture notes and backend integration TODOs.

Storybook (local only)
- Storybook files and stories are included under `web/.storybook` and `web/src/**/*.stories.*`.
- I attempted to install Storybook and build it in CI, but the build encountered package-version compatibility issues during automated build. The Storybook sources and CI workflow are present, but the build was not fully validated here.

To run Storybook locally (recommended):

```bash
cd web
corepack pnpm install
corepack pnpm storybook
```

If the Storybook build fails locally, align Storybook package versions or run `pnpm install` in the workspace root and inspect the build errors. The CI job is present at `.github/workflows/build-storybook.yml` but may require version pinning before enabling.
