# Repository Validation Report

## Directory Structure

Required root directories:

| Directory | Status |
| --- | --- |
| backend/ | Present |
| mobile/ | Present |
| web/ | Present |
| shared/ | Present |
| docker/ | Present |
| scripts/ | Present |
| .github/ | Present |

Required backend directories:

| Directory | Status |
| --- | --- |
| backend/config/ | Present |
| backend/apps/ | Present |
| backend/common/ | Present |
| backend/core/ | Present |
| backend/requirements/ | Present |
| backend/tests/ | Present |
| backend/utils/ | Present |
| backend/management/ | Present |
| backend/logs/ | Present |
| backend/media/ | Present |
| backend/static/ | Present |
| backend/README.md | Present |

Required backend app directories:

| Directory | Status |
| --- | --- |
| backend/apps/authentication/ | Present |
| backend/apps/tenants/ | Present |
| backend/apps/users/ | Present |
| backend/apps/businesses/ | Present |
| backend/apps/customers/ | Present |
| backend/apps/staff/ | Present |
| backend/apps/services/ | Present |
| backend/apps/bookings/ | Present |
| backend/apps/availability/ | Present |
| backend/apps/calendar/ | Present |
| backend/apps/notifications/ | Present |
| backend/apps/analytics/ | Present |
| backend/apps/workflow/ | Present |
| backend/apps/audit/ | Present |
| backend/apps/common/ | Present |

Required mobile directories:

| Directory | Status |
| --- | --- |
| mobile/ | Present |
| mobile/app/ | Present |
| mobile/src/ | Present |
| mobile/src/components/ | Present |
| mobile/src/features/ | Present |
| mobile/src/navigation/ | Present |
| mobile/src/services/ | Present |
| mobile/src/hooks/ | Present |
| mobile/src/contexts/ | Present |
| mobile/src/assets/ | Present |
| mobile/src/theme/ | Present |
| mobile/src/types/ | Present |
| mobile/src/utils/ | Present |
| mobile/README.md | Present |

Required web directories:

| Directory | Status |
| --- | --- |
| web/ | Present |
| web/src/ | Present |
| web/src/components/ | Present |
| web/src/pages/ | Present |
| web/src/layouts/ | Present |
| web/src/services/ | Present |
| web/src/hooks/ | Present |
| web/src/theme/ | Present |
| web/src/types/ | Present |
| web/src/utils/ | Present |
| web/README.md | Present |

Required shared directories:

| Directory | Status |
| --- | --- |
| shared/ | Present |
| shared/constants/ | Present |
| shared/types/ | Present |
| shared/contracts/ | Present |
| shared/utils/ | Present |
| shared/theme/ | Present |
| shared/README.md | Present |

## Missing Directories

None after remediation.

## Created Directories

- .github/
- backend/common/
- backend/core/
- backend/requirements/
- backend/utils/
- backend/management/
- backend/logs/
- backend/media/
- backend/static/
- backend/apps/authentication/
- backend/apps/tenants/
- backend/apps/users/
- backend/apps/businesses/
- backend/apps/customers/
- backend/apps/staff/
- backend/apps/services/
- backend/apps/bookings/
- backend/apps/availability/
- backend/apps/calendar/
- backend/apps/notifications/
- backend/apps/analytics/
- backend/apps/workflow/
- backend/apps/audit/
- backend/apps/common/
- mobile/
- mobile/app/
- mobile/src/components/
- mobile/src/features/
- mobile/src/navigation/
- mobile/src/services/
- mobile/src/hooks/
- mobile/src/contexts/
- mobile/src/assets/
- mobile/src/theme/
- mobile/src/types/
- mobile/src/utils/
- web/
- web/src/components/
- web/src/pages/
- web/src/layouts/
- web/src/services/
- web/src/hooks/
- web/src/theme/
- web/src/types/
- web/src/utils/
- shared/constants/
- shared/types/
- shared/contracts/
- shared/utils/
- shared/theme/
- docker/
- scripts/

## .gitignore Status

Updated. The root `.gitignore` includes the required sections for Node, Expo, React, Android, iOS, Python, Django, environment files, logs, macOS, and VS Code.

Generated dependency folders found and removed from the working tree:

- node_modules/
- apps/web/node_modules/
- apps/mobile/node_modules/
- packages/sdk/node_modules/

No generated dependency folders are currently tracked by Git.

## Git Cleanliness

The repository is not clean because the requested structure and validation files are uncommitted. Existing uncommitted scaffold files from earlier work are also present.

## Warnings

- Prior scaffold directories `apps/` and `packages/` remain in the working tree. They are outside the directory names requested by this validation task.
- Prior backend scaffold folders `backend/apps/api/`, `backend/apps/core/`, and `backend/apps/tenancy/` remain in the working tree. They were not removed because this task requested structure validation and dependency cleanup only.
- `pnpm-lock.yaml` remains from a previous dependency install. This is not a dependency folder or build artifact.

## Recommendations

- Decide whether the canonical frontend roots should be `mobile/`, `web/`, and `shared/` only, or whether the earlier `apps/` and `packages/` workspace layout should be retained.
- After the canonical structure is confirmed, remove or migrate conflicting scaffold artifacts in a dedicated cleanup task.
- Commit the validated structure and `.gitignore` before the next implementation milestone.

## Repository Health Score

88 / 100

All required validation directories are present and generated dependency folders have been removed. The score is reduced because the working tree contains uncommitted scaffold artifacts outside the requested structure.
