#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

target_environment=${1:-development}
case "$target_environment" in
  development|qa|staging) ;;
  *) echo "Unsupported simulator build environment: $target_environment" >&2; exit 2 ;;
esac

test -f .env || { echo 'Missing .env. Create it from .env.example first.' >&2; exit 2; }
set -a
. ./.env
set +a

if [ -z "${IOS_UDID:-}" ]; then
  echo 'Set IOS_UDID to a booted iOS Simulator UDID in .env.' >&2
  exit 2
fi
if ! xcrun simctl list devices booted | grep -F "$IOS_UDID" >/dev/null; then
  echo 'IOS_UDID is not a booted iOS Simulator; refusing to target a physical device.' >&2
  exit 2
fi

# The shell already exported .env; avoid parsing it a second time.
EXPO_NO_DOTENV=1 EXPO_PUBLIC_APP_ENV="$target_environment" npx expo run:ios \
  --configuration Release --device "$IOS_UDID"
