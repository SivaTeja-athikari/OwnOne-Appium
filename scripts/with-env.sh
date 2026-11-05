#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -f "$project_root/.env" ]; then
  set -a
  . "$project_root/.env"
  set +a
fi

# Keep Appium's extension registry in one project-local home, regardless of
# where a wrapped command is launched from. Resolve relative .env values from
# the project root so both `npm run appium:server` and driver installs agree.
APPIUM_HOME="${APPIUM_HOME:-$project_root/automation/.appium}"
case "$APPIUM_HOME" in
  /*) ;;
  *) APPIUM_HOME="$project_root/$APPIUM_HOME" ;;
esac
export APPIUM_HOME

# Python dependencies belong to the automation process, not Expo's dotenv file.
export PYTHONPATH="${PYTHONPATH:-$project_root/automation/.lib:$project_root}"

# Farm workers carry explicit per-process device and UiAutomator2 port values.
# Reapply them after .env so parallel workers do not all target its default device.
if [ -n "${FARM_ANDROID_UDID:-}" ]; then
  ANDROID_UDID="$FARM_ANDROID_UDID"
  export ANDROID_UDID
fi
if [ -n "${FARM_IOS_UDID:-}" ]; then
  IOS_UDID="$FARM_IOS_UDID"
  export IOS_UDID
fi
if [ -n "${FARM_APPIUM_SYSTEM_PORT:-}" ]; then
  APPIUM_SYSTEM_PORT="$FARM_APPIUM_SYSTEM_PORT"
  export APPIUM_SYSTEM_PORT
fi

exec "$@"
