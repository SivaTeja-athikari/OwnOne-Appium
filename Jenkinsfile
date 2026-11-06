pipeline {
    agent {
        node {
            label 'built-in'
            customWorkspace '/Users/sivateja/Documents/OwnOne/AppReact'
        }
    }

    parameters {
        // ---------- WHAT to run ----------
        choice(
            name: 'PLATFORM',
            choices: ['android', 'ios'],
            description: 'Mobile platform to test.'
        )
        choice(
            name: 'TARGET_ENVIRONMENT',
            choices: ['development', 'qa', 'staging'],
            description: 'Backend environment: development (local mock server), qa (cloud QA backend) or staging.'
        )
        choice(
            name: 'TEST_SUITE',
            choices: ['regression', 'smoke'],
            description: 'Suite to run. Maps to npm script test:reports:<platform>:<suite>:<environment> in single mode.'
        )
        string(
            name: 'TEST_FILTER',
            defaultValue: '',
            description: 'Optional tag / name filter (e.g. @login). Exported as TEST_FILTER; your runner must read it.'
        )

        // ---------- WHERE to run ----------
        choice(
            name: 'RUN_MODE',
            choices: ['auto', 'farm', 'single'],
            description: 'auto = farm when more than one Android device is selected, otherwise single. iOS is always single.'
        )
        string(
            name: 'DEVICE_IDS',
            defaultValue: '',
            description: 'Android only. Comma-separated serials, e.g. emulator-5554,emulator-5556. Leave blank to auto-detect online devices.'
        )
        string(
            name: 'MAX_DEVICES',
            defaultValue: '2',
            description: 'Android auto-detect only. Maximum number of devices to use in the farm.'
        )
        string(
            name: 'IOS_SIMULATOR',
            defaultValue: 'iPhone 15 Pro',
            description: 'iOS only. Simulator name or UDID. Blank = IOS_UDID from environment/.env, then first booted simulator. It is booted automatically if needed.'
        )
        booleanParam(
            name: 'AUTO_BOOT_AVDS',
            defaultValue: false,
            description: 'Android auto-detect only. Boot AVDs from "emulator -list-avds" when fewer than MAX_DEVICES are online.'
        )

        // ---------- APP ----------
        string(
            name: 'APP_PACKAGE',
            defaultValue: 'com.anonymous.appreact',
            description: 'Android application id checked on every device.'
        )
        string(
            name: 'APK_PATH',
            defaultValue: '',
            description: 'Optional APK path (relative to workspace or absolute). Installed on any device missing APP_PACKAGE.'
        )

        // ---------- HOW to run ----------
        choice(
            name: 'FARM_SCHEDULING_MODE',
            choices: ['shard', 'replicate'],
            description: 'Farm only. shard runs each case once across devices using a dynamic queue; replicate runs the full suite on every device.'
        )
        string(
            name: 'TEST_TIMEOUT_MIN',
            defaultValue: '30',
            description: 'Timeout in minutes for the mobile test execution stage.'
        )
        booleanParam(
            name: 'ENABLE_SELF_HEALING',
            defaultValue: true,
            description: 'Enable the Self-Healing UI Engine to adapt to renamed or refactored UI elements.'
        )
        booleanParam(
            name: 'RUN_STATIC_CHECKS',
            defaultValue: true,
            description: 'Run TypeScript unit tests, typecheck, ESLint and framework contract tests before the mobile tests.'
        )
        booleanParam(
            name: 'CLEAN_OLD_REPORTS',
            defaultValue: true,
            description: 'Delete stale self-healing, JUnit and Allure results before the run so reports only show this build.'
        )

        // ---------- NAMING ----------
        string(
            name: 'RUN_LABEL',
            defaultValue: '',
            description: 'Optional free-text name for this run (e.g. "checkout fix PR-142"). Shown in the build name and description.'
        )
    }

    options {
        timestamps()
        skipDefaultCheckout(true)   // project lives on local disk; do not let SCM checkout wipe .env
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15', artifactNumToKeepStr: '10'))
        timeout(time: 90, unit: 'MINUTES')   // global safety net; stage-level timeout comes from TEST_TIMEOUT_MIN
    }

    environment {
        PROJECT_DIR      = '/Users/sivateja/Documents/OwnOne/AppReact'
        ANDROID_HOME     = '/Users/sivateja/Library/Android/sdk'
        ANDROID_SDK_ROOT = '/Users/sivateja/Library/Android/sdk'
        PATH = "/usr/local/bin:/opt/homebrew/bin:${PROJECT_DIR}/automation/.venv/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin:/Users/sivateja/Library/Android/sdk/platform-tools:/Users/sivateja/Library/Android/sdk/emulator:${env.PATH}"
    }

    stages {

        // ------------------------------------------------------------------
        stage('Initialize & Validate') {
            steps {
                script {
                    def platform = params.PLATFORM
                    def suite    = params.TEST_SUITE
                    def envName  = params.TARGET_ENVIRONMENT
                    def label    = (params.RUN_LABEL ?: '').trim()

                    // ---- input validation (free-text params are only ever read from env vars in sh, never interpolated) ----
                    if (!((params.MAX_DEVICES ?: '').trim() ==~ /\d+/) || (params.MAX_DEVICES.trim() as int) < 1) {
                        error "MAX_DEVICES must be a positive integer, got '${params.MAX_DEVICES}'"
                    }
                    if (!((params.TEST_TIMEOUT_MIN ?: '').trim() ==~ /\d+/) || (params.TEST_TIMEOUT_MIN.trim() as int) < 1) {
                        error "TEST_TIMEOUT_MIN must be a positive integer, got '${params.TEST_TIMEOUT_MIN}'"
                    }
                    if (!((params.DEVICE_IDS ?: '') ==~ /^[A-Za-z0-9._:,\- ]*$/)) {
                        error "DEVICE_IDS contains invalid characters: '${params.DEVICE_IDS}'"
                    }
                    if (!((params.APP_PACKAGE ?: '') ==~ /^[A-Za-z][A-Za-z0-9_.]*$/)) {
                        error "APP_PACKAGE is not a valid application id: '${params.APP_PACKAGE}'"
                    }

                    env.TARGET_PLATFORM = platform
                    env.ENABLE_SELF_HEALING = params.ENABLE_SELF_HEALING ? '1' : '0'   // normalised flag, see notes

                    // ---- build naming ----
                    def name = "#${env.BUILD_NUMBER} | ${platform} | ${suite} | ${envName}"
                    if (label) { name += " | ${label}" }
                    currentBuild.displayName = name
                    currentBuild.description = "Platform: ${platform} | Suite: ${suite} | Env: ${envName}" +
                        (params.TEST_FILTER?.trim() ? " | Filter: ${params.TEST_FILTER.trim()}" : '') +
                        (label ? " | ${label}" : '')

                    echo "============================================================"
                    echo "  Run Label:           ${label ?: '(none)'}"
                    echo "  Platform:            ${platform}"
                    echo "  Suite:               ${suite}"
                    echo "  Environment:         ${envName}"
                    echo "  Run Mode (requested): ${params.RUN_MODE}"
                    echo "  Device IDs:          ${params.DEVICE_IDS?.trim() ?: '(auto-detect)'}"
                    echo "  Test Filter:         ${params.TEST_FILTER?.trim() ?: '(none)'}"
                    echo "  Self-Healing:        ${params.ENABLE_SELF_HEALING}"
                    echo "  Static Checks:       ${params.RUN_STATIC_CHECKS}"
                    echo "============================================================"
                }
                sh '''
                    set -eu
                    cd "$PROJECT_DIR"
                    test -f .env || { echo 'Missing .env file. Copy from .env.example before running.'; exit 1; }
                    test -x node_modules/.bin/appium || { echo 'Missing local Appium installation. Run npm install.'; exit 1; }
                    test -f automation/.venv/bin/python || { echo 'Missing Python virtualenv at automation/.venv.'; exit 1; }

                    mkdir -p automation/reports
                    if [ "${CLEAN_OLD_REPORTS:-true}" = "true" ]; then
                        rm -f  automation/reports/healed_locators.json automation/reports/junit*.xml
                        rm -rf automation/reports/allure-results
                    fi
                    touch automation/reports/.build-start

                    echo "Toolchain versions:"
                    echo "  Node:   $(node --version)"
                    echo "  NPM:    $(npm --version)"
                    echo "  Python: $(automation/.venv/bin/python --version)"
                '''
            }
        }

        // ------------------------------------------------------------------
        stage('Static Checks & Unit Tests') {
            when { expression { params.RUN_STATIC_CHECKS } }
            parallel {
                stage('TypeScript Unit Tests') {
                    steps { sh 'cd "$PROJECT_DIR" && npm test' }
                }
                stage('Typecheck & Linter') {
                    steps { sh 'cd "$PROJECT_DIR" && npx tsc --noEmit && npx eslint src scripts tests' }
                }
                stage('Framework & Self-Healing Contracts') {
                    steps {
                        sh 'cd "$PROJECT_DIR" && automation/.venv/bin/python -m pytest automation/tests/test_farm_contracts.py automation/tests/test_self_healing.py -q -p no:cacheprovider'
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        stage('Resolve Target Devices') {
            steps {
                script {
                    if (params.PLATFORM == 'android') {
                        def out = sh(returnStdout: true, script: '''#!/bin/bash
set -eu
cd "$PROJECT_DIR"
log() { echo "$@" >&2; }
online_list() { adb devices | awk 'NR>1 && $2=="device" {print $1}'; }

adb start-server >/dev/null 2>&1 || true
max="${MAX_DEVICES:-2}"
requested="$(echo "${DEVICE_IDS:-}" | tr -d ' ')"

# --- optionally boot AVDs (auto-detect mode only) ---
if [ -z "$requested" ] && [ "${AUTO_BOOT_AVDS:-false}" = "true" ]; then
  have=$(online_list | wc -l | tr -d ' ')
  if [ "$have" -lt "$max" ]; then
    running="|"
    for s in $(online_list); do
      case "$s" in emulator-*)
        n=$(adb -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\\r')
        running="${running}${n}|" ;;
      esac
    done
    to_boot=$((max - have))
    for avd in $(emulator -list-avds); do
      [ "$to_boot" -le 0 ] && break
      case "$running" in *"|$avd|"*) continue ;; esac
      log "Booting AVD: $avd"
      BUILD_ID=dontKillMe nohup emulator -avd "$avd" -no-audio -no-boot-anim >/dev/null 2>&1 &
      to_boot=$((to_boot - 1))
    done
    for i in $(seq 1 90); do
      [ "$(online_list | wc -l | tr -d ' ')" -ge "$max" ] && break
      sleep 2
    done
  fi
fi

# --- select devices ---
selected=""
if [ -n "$requested" ]; then
  for id in $(echo "$requested" | tr ',' ' '); do
    online_list | grep -qx "$id" || { log "ERROR: '$id' is not online. Online devices: $(online_list | xargs echo)"; exit 2; }
    selected="$selected $id"
  done
else
  selected=$(online_list | head -n "$max" | xargs echo)
fi
set -- $selected
[ "$#" -gt 0 ] || { log "ERROR: no online Android devices. Start an emulator or enable AUTO_BOOT_AVDS."; exit 2; }

# --- verify each device and build the pool entry list (serial|version|model) ---
entries=""
for s in $selected; do
  for i in $(seq 1 90); do
    [ "$(adb -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r')" = "1" ] && break
    sleep 2
  done
  if ! adb -s "$s" shell pm path "$APP_PACKAGE" >/dev/null 2>&1; then
    if [ -n "${APK_PATH:-}" ] && [ -f "$APK_PATH" ]; then
      log "Installing $APK_PATH on $s"
      adb -s "$s" install -r "$APK_PATH" >&2 || { log "ERROR: install failed on $s"; exit 2; }
    else
      log "ERROR: $APP_PACKAGE not installed on $s (set APK_PATH to auto-install)."; exit 2
    fi
  fi
  ver=$(adb -s "$s" shell getprop ro.build.version.release | tr -d '\\r')
  model=$(adb -s "$s" shell getprop ro.product.model | tr -d '\\r' | tr ' ' '_')
  log "  OK $s  (Android $ver, $model)"
  entries="${entries:+$entries,}$s|$ver|$model"
done
echo "$entries"
''').trim().readLines().last()

                        def devices = out.split(',') as List
                        def mode = params.RUN_MODE
                        if (mode == 'auto') { mode = devices.size() > 1 ? 'farm' : 'single' }
                        if (mode == 'farm' && devices.size() < 2) {
                            echo "WARNING: farm requested but only 1 device available. Falling back to single mode."
                            mode = 'single'
                        }
                        env.RUN_MODE = mode
                        env.ANDROID_UDID = devices[0].split('\\|')[0]
                        if (mode == 'farm') {
                            env.ANDROID_FARM_DEVICES = out
                            env.GROUP_BY = (params.GROUP_BY ?: 'case').trim()
                        }
                        def serials = devices.collect { it.split('\\|')[0] }.join(', ')
                        currentBuild.description += " | Mode: ${mode} | Devices: ${mode == 'farm' ? serials : env.ANDROID_UDID}"
                        echo "Resolved: mode=${mode}, devices=${mode == 'farm' ? serials : env.ANDROID_UDID}"
                    } else {
                        def udid = sh(returnStdout: true, script: '''#!/bin/bash
set -eu
cd "$PROJECT_DIR"
log() { echo "$@" >&2; }
re='[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}'
want="$(echo "${IOS_SIMULATOR:-}" | sed 's/^ *//;s/ *$//')"
udid=""
if echo "$want" | grep -Eq "^${re}$"; then
  udid="$want"
elif [ -n "$want" ]; then
  udid=$(xcrun simctl list devices available | grep -F "$want (" | grep -Eo "$re" | head -1 || true)
  [ -n "$udid" ] || { log "ERROR: simulator '$want' not found. Available simulators:"; xcrun simctl list devices available >&2; exit 2; }
else
  udid="${IOS_UDID:-}"
  [ -n "$udid" ] || udid=$(grep -E '^IOS_UDID=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\\"' " || true)
  [ -n "$udid" ] || udid=$(xcrun simctl list devices booted | grep -Eo "$re" | head -1 || true)
  [ -n "$udid" ] || { log "ERROR: no simulator selected. Set IOS_SIMULATOR, IOS_UDID, or boot a simulator."; exit 2; }
fi
if ! xcrun simctl list devices booted | grep -q "$udid"; then
  log "Booting simulator $udid"
  xcrun simctl boot "$udid" >&2 || true
fi
xcrun simctl bootstatus "$udid" -b >&2 || true
log "  OK simulator $udid is booted"
echo "$udid"
''').trim().readLines().last()

                        env.IOS_UDID = udid
                        env.RUN_MODE = 'single'
                        if (params.RUN_MODE == 'farm') {
                            echo "WARNING: farm mode is not supported on iOS here. Running in single mode."
                        }
                        currentBuild.description += " | Mode: single | Simulator: ${udid}"
                        echo "Resolved: iOS simulator ${udid}"
                    }
                }
            }
        }

        // ------------------------------------------------------------------
        stage('Appium Preflight') {
            steps {
                sh '''
                    set -eu
                    cd "$PROJECT_DIR"
                    installed_drivers=$(./node_modules/.bin/appium driver list --installed 2>&1 || true)

                    case "$TARGET_PLATFORM" in
                      android)
                        printf '%s\\n' "$installed_drivers" | grep -q 'uiautomator2@' || {
                          echo 'Appium uiautomator2 driver is missing. Run npm run appium:driver:android'; exit 2;
                        }
                        ;;
                      ios)
                        printf '%s\\n' "$installed_drivers" | grep -q 'xcuitest@' || {
                          echo 'Appium xcuitest driver is missing. Run npm run appium:driver:ios'; exit 2;
                        }
                        ;;
                    esac

                    # Appium with session_discovery enabled for the multi-worker farm coordinator
                    if ! curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1; then
                        echo "Starting Appium server on 127.0.0.1:4723 (session_discovery enabled)..."
                        ./node_modules/.bin/appium --address 127.0.0.1 --port 4723 --allow-insecure='*:session_discovery' \
                            > automation/reports/jenkins-appium.log 2>&1 &
                        ready=0
                        for attempt in $(seq 1 30); do
                            if curl -fsS http://127.0.0.1:4723/status >/dev/null 2>&1; then ready=1; break; fi
                            sleep 1
                        done
                        if [ "$ready" -ne 1 ]; then
                            echo "ERROR: Appium server failed to start within 30s:"
                            tail -50 automation/reports/jenkins-appium.log || true
                            exit 1
                        fi
                        echo "  OK Appium server online"
                    else
                        echo "  OK Appium server already running on 127.0.0.1:4723"
                    fi
                '''
            }
        }

        // ------------------------------------------------------------------
        stage('Mobile Test Execution') {
            steps {
                script {
                    timeout(time: (params.TEST_TIMEOUT_MIN.trim() as int), unit: 'MINUTES') {
                        sh '''
                            set -eu
                            cd "$PROJECT_DIR"
                            export AUTOMATION_PYTHON="automation/.venv/bin/python"

                            rm -rf automation/reports/current-run
                            mkdir -p automation/reports/current-run

                            if [ "$RUN_MODE" = "farm" ]; then
                                echo "============================================================"
                                echo "Executing Farm ($FARM_SCHEDULING_MODE): $TARGET_PLATFORM / $TARGET_ENVIRONMENT / $TEST_SUITE"
                                echo "   Device Pool: $ANDROID_FARM_DEVICES"
                                echo "   Scheduling:  --mode ${FARM_SCHEDULING_MODE:-shard}"
                                echo "============================================================"
                                node scripts/run-device-farm.mjs "$TARGET_PLATFORM" "$TARGET_ENVIRONMENT" \
                                    --mode "${FARM_SCHEDULING_MODE:-shard}"

                                latest_farm_dir=$(ls -td automation/reports/farm/*/ 2>/dev/null | head -1)
                                if [ -n "$latest_farm_dir" ] && [ -d "$latest_farm_dir" ]; then
                                    find "$latest_farm_dir" -name "junit.xml" | while read -r jfile; do
                                        batch_name=$(basename "$(dirname "$jfile")")
                                        device_name=$(basename "$(dirname "$(dirname "$jfile")")")
                                        cp "$jfile" "automation/reports/current-run/junit-${device_name}-${batch_name}.xml"
                                    done
                                fi
                            else
                                target_device="${ANDROID_UDID:-${IOS_UDID:-default}}"
                                suite="test:reports:${TARGET_PLATFORM}:${TEST_SUITE}:${TARGET_ENVIRONMENT}"
                                echo "============================================================"
                                echo "Executing Single-Device Suite: $suite"
                                echo "   Target Device: $target_device"
                                echo "============================================================"
                                if ! node -e "process.exit((require('./package.json').scripts||{})['$suite']?0:1)"; then
                                    echo "ERROR: npm script '$suite' does not exist. Available:"
                                    node -e "Object.keys(require('./package.json').scripts||{}).filter(s=>s.startsWith('test:reports:')).forEach(s=>console.log('  '+s))"
                                    exit 2
                                fi
                                npm run "$suite"
                                cp automation/reports/junit-*.xml automation/reports/current-run/ 2>/dev/null || true
                            fi
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            sh '''
                cd "$PROJECT_DIR" || true
                echo "============================================================"
                echo "Post-Build Diagnostics & Telemetry"
                echo "============================================================"
                if [ -f automation/reports/healed_locators.json ]; then
                    echo "[SELF-HEALING AUDIT TRAIL]:"
                    cat automation/reports/healed_locators.json
                else
                    echo "No elements required self-healing during this run."
                fi

                latest_summary=$(find automation/reports/farm -name summary.json -newer automation/reports/.build-start 2>/dev/null | sort | tail -1 || true)
                if [ -n "$latest_summary" ] && [ -f "$latest_summary" ]; then
                    echo "[DEVICE FARM SUMMARY]:"
                    cat "$latest_summary"
                fi

                allure_results="automation/reports/jenkins-allure-results-${BUILD_NUMBER}"
                allure_report="automation/reports/jenkins-allure-report-${BUILD_NUMBER}"
                mkdir -p "$allure_results"
                allure_sources="$allure_results/.source-files"
                find automation/reports -type f -path '*/allure-results/*' -newer automation/reports/.build-start -print > "$allure_sources"
                while IFS= read -r source_file; do
                    cp -n "$source_file" "$allure_results/"
                done < "$allure_sources"
                rm -f "$allure_sources"
                if find "$allure_results" -type f -print -quit | grep -q .; then
                    if ./node_modules/.bin/allure generate "$allure_results" --clean -o "$allure_report"; then
                        echo "Allure HTML report generated at $allure_report/index.html"
                    else
                        echo "WARNING: Allure HTML report generation failed; raw results will still be archived."
                    fi
                else
                    echo "No Allure result files were produced for this build."
                fi
            '''
            script {
                dir(env.PROJECT_DIR) {
                    junit testResults: 'automation/reports/current-run/*.xml', allowEmptyResults: true
                    archiveArtifacts artifacts: 'automation/reports/healed_locators.json,automation/reports/farm/**,automation/reports/current-run/**,automation/reports/*.xml,automation/reports/allure-results/**,automation/reports/jenkins-appium.log', allowEmptyArchive: true
                    publishHTML(target: [
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: "automation/reports/jenkins-allure-report-${env.BUILD_NUMBER}",
                        reportFiles: 'index.html',
                        reportName: 'Mobile Allure Report'
                    ])
                }

                currentBuild.description = "[${currentBuild.currentResult}] ${currentBuild.description ?: ''}"
            }
        }
    }
}
