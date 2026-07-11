#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT_DIR/apps/mobile/ios/tabitomo.xcworkspace"

if [[ ! -d "$WORKSPACE" ]]; then
  "$ROOT_DIR/scripts/ios-sync-xcode-project.sh"
fi

open "$WORKSPACE"
