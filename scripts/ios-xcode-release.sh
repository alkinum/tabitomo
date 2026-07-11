#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/apps/mobile/ios"
WORKSPACE="${TABITOMO_XCODE_WORKSPACE:-$IOS_DIR/tabitomo.xcworkspace}"
SCHEME="${TABITOMO_XCODE_SCHEME:-tabitomo}"
CONFIGURATION="${TABITOMO_XCODE_CONFIGURATION:-Release}"
TEAM_ID="${TABITOMO_DEVELOPMENT_TEAM:-PB8H83VL3Z}"
ARCHIVE_PATH="${TABITOMO_ARCHIVE_PATH:-$ROOT_DIR/build/ios/archives/tabitomo-app-store.xcarchive}"
EXPORT_PATH="${TABITOMO_EXPORT_PATH:-$ROOT_DIR/build/ios/testflight-export}"
EXPORT_OPTIONS="${TABITOMO_EXPORT_OPTIONS_PLIST:-$ROOT_DIR/apps/mobile/ExportOptionsAppStore.plist}"
COMMAND="${1:-archive}"
BUILD_NUMBER=""
ALLOW_PROVISIONING_UPDATES=1
XCODEBUILD_ARGUMENTS=()

usage() {
  cat <<'USAGE'
Usage: scripts/ios-xcode-release.sh <archive|upload> [options] [-- xcodebuild args...]

Archives tabitomo with Xcode-managed automatic signing. The upload command
also exports the archive directly to App Store Connect/TestFlight.

Options:
  --build-number NUMBER        Override CURRENT_PROJECT_VERSION for this archive.
  --team-id TEAM_ID            Override the Apple Developer Team ID.
  --archive-path PATH          Override the .xcarchive output path.
  --export-path PATH           Override the export/upload output path.
  --export-options-plist PATH  Override the App Store export options plist.
  --no-provisioning-updates    Do not pass -allowProvisioningUpdates to Xcode.
  -h, --help                   Show this help.

Environment:
  TABITOMO_DEVELOPMENT_TEAM, TABITOMO_XCODE_WORKSPACE,
  TABITOMO_XCODE_SCHEME, TABITOMO_XCODE_CONFIGURATION,
  TABITOMO_ARCHIVE_PATH, TABITOMO_EXPORT_PATH,
  TABITOMO_EXPORT_OPTIONS_PLIST

Arguments after -- are forwarded to both xcodebuild invocations. This can be
used for App Store Connect API key flags on CI. Never commit private keys.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

if [[ "$COMMAND" == "-h" || "$COMMAND" == "--help" ]]; then
  usage
  exit 0
fi
[[ "$COMMAND" == "archive" || "$COMMAND" == "upload" ]] || fail "first argument must be archive or upload"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-number)
      shift
      [[ $# -gt 0 ]] || fail "--build-number requires a value"
      BUILD_NUMBER="$1"
      ;;
    --team-id)
      shift
      [[ $# -gt 0 ]] || fail "--team-id requires a value"
      TEAM_ID="$1"
      ;;
    --archive-path)
      shift
      [[ $# -gt 0 ]] || fail "--archive-path requires a value"
      ARCHIVE_PATH="$1"
      ;;
    --export-path)
      shift
      [[ $# -gt 0 ]] || fail "--export-path requires a value"
      EXPORT_PATH="$1"
      ;;
    --export-options-plist)
      shift
      [[ $# -gt 0 ]] || fail "--export-options-plist requires a value"
      EXPORT_OPTIONS="$1"
      ;;
    --no-provisioning-updates)
      ALLOW_PROVISIONING_UPDATES=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        XCODEBUILD_ARGUMENTS+=("$1")
        shift
      done
      break
      ;;
    *)
      fail "unknown option: $1; place raw xcodebuild arguments after --"
      ;;
  esac
  shift
done

[[ -d "$WORKSPACE" ]] || fail "Xcode workspace not found at $WORKSPACE; run pnpm ios:sync-project"
[[ -n "$TEAM_ID" ]] || fail "Apple Developer Team ID is empty"
if [[ -n "$BUILD_NUMBER" && ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  fail "--build-number must be a positive integer"
fi
if [[ "$COMMAND" == "upload" ]]; then
  [[ -f "$EXPORT_OPTIONS" ]] || fail "export options plist not found at $EXPORT_OPTIONS"
fi

mkdir -p "$(dirname "$ARCHIVE_PATH")"
provisioning_arguments=()
if [[ "$ALLOW_PROVISIONING_UPDATES" -eq 1 ]]; then
  provisioning_arguments+=(-allowProvisioningUpdates)
fi

build_settings=(
  "CODE_SIGN_STYLE=Automatic"
  "DEVELOPMENT_TEAM=$TEAM_ID"
  "PROVISIONING_PROFILE_SPECIFIER="
)
if [[ -n "$BUILD_NUMBER" ]]; then
  build_settings+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER")
fi

archive_command=(
  xcodebuild archive
  -workspace "$WORKSPACE"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
)
if (( ${#provisioning_arguments[@]} > 0 )); then
  archive_command+=("${provisioning_arguments[@]}")
fi
if (( ${#XCODEBUILD_ARGUMENTS[@]} > 0 )); then
  archive_command+=("${XCODEBUILD_ARGUMENTS[@]}")
fi
archive_command+=("${build_settings[@]}")
"${archive_command[@]}"

if [[ "$COMMAND" == "archive" ]]; then
  echo "Created tabitomo archive at $ARCHIVE_PATH. Open Xcode Organizer to distribute it."
  exit 0
fi

mkdir -p "$ROOT_DIR/build/ios" "$EXPORT_PATH"
runtime_export_options="$(mktemp "$ROOT_DIR/build/ios/export-options.XXXXXX.plist")"
trap 'rm -f "$runtime_export_options"' EXIT
cp "$EXPORT_OPTIONS" "$runtime_export_options"
if ! /usr/libexec/PlistBuddy -c "Set :teamID $TEAM_ID" "$runtime_export_options" 2>/dev/null; then
  /usr/libexec/PlistBuddy -c "Add :teamID string $TEAM_ID" "$runtime_export_options"
fi

export_command=(
  xcodebuild -exportArchive
  -archivePath "$ARCHIVE_PATH"
  -exportPath "$EXPORT_PATH"
  -exportOptionsPlist "$runtime_export_options"
)
if (( ${#provisioning_arguments[@]} > 0 )); then
  export_command+=("${provisioning_arguments[@]}")
fi
if (( ${#XCODEBUILD_ARGUMENTS[@]} > 0 )); then
  export_command+=("${XCODEBUILD_ARGUMENTS[@]}")
fi
"${export_command[@]}"

echo "Uploaded tabitomo iOS archive to App Store Connect."
