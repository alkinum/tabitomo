#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
IOS_DIR="$MOBILE_DIR/ios"
EXPORT_OPTIONS_SOURCE="$MOBILE_DIR/ExportOptionsAppStore.plist"
EXPORT_OPTIONS_DESTINATION="$IOS_DIR/ExportOptionsAppStore.plist"
CLEAN=0
INSTALL_PODS=1

usage() {
  cat <<'USAGE'
Usage: scripts/ios-sync-xcode-project.sh [--clean] [--skip-pods]

Regenerates the source-controlled Expo iOS project from apps/mobile/app.json.
Signing stays Xcode-managed through the withXcodeManagedSigning config plugin.

Options:
  --clean       Delete and recreate the generated iOS project before syncing.
  --skip-pods   Do not run pod install after Expo prebuild.
  -h, --help    Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean)
      CLEAN=1
      ;;
    --skip-pods)
      INSTALL_PODS=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

prebuild_args=(--platform ios --no-install)
if [[ "$CLEAN" -eq 1 ]]; then
  prebuild_args+=(--clean)
fi

node "$ROOT_DIR/scripts/sync-mobile-app-icon.mjs"
node "$ROOT_DIR/scripts/prepare-mobile-native-runtimes.mjs"
pnpm --dir "$MOBILE_DIR" exec expo prebuild "${prebuild_args[@]}"
cp "$EXPORT_OPTIONS_SOURCE" "$EXPORT_OPTIONS_DESTINATION"

if [[ "$INSTALL_PODS" -eq 1 ]]; then
  command -v pod >/dev/null 2>&1 || {
    echo "error: CocoaPods is required; install pod or rerun with --skip-pods" >&2
    exit 1
  }
  (cd "$IOS_DIR" && pod install)
fi

[[ -d "$IOS_DIR/tabitomo.xcodeproj" ]] || {
  echo "error: Expo did not generate $IOS_DIR/tabitomo.xcodeproj" >&2
  exit 1
}
if [[ "$INSTALL_PODS" -eq 1 ]]; then
  [[ -d "$IOS_DIR/tabitomo.xcworkspace" ]] || {
    echo "error: CocoaPods workspace is missing at $IOS_DIR/tabitomo.xcworkspace" >&2
    exit 1
  }
fi

echo "Synced tabitomo iOS Xcode project."
