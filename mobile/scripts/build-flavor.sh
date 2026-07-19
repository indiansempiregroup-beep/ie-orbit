#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
PLATFORM="${2:-all}"

if [[ -z "$PROFILE" ]]; then
  echo "Usage: ./scripts/build-flavor.sh <eas-profile> [ios|android|all]"
  echo "Profiles: demo-main-preview | demo-main-production | empire-salon-preview | empire-salon-production"
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if ! command -v eas >/dev/null 2>&1; then
  echo "EAS CLI not found. Install with: pnpm add -D eas-cli"
  exit 1
fi

case "$PLATFORM" in
  ios) eas build --profile "$PROFILE" --platform ios ;;
  android) eas build --profile "$PROFILE" --platform android ;;
  all) eas build --profile "$PROFILE" --platform all ;;
  *)
    echo "Invalid platform: $PLATFORM"
    exit 1
    ;;
esac
