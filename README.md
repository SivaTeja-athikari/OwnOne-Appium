# Multi-Environment, Multi-Tenant Mobile SaaS Platform

A production-grade, single-codebase React Native & Expo mobile SaaS architecture engineered to serve multiple tenant organizations across multiple deployment environments with zero screen duplication, strict tenant data isolation, and automated cross-matrix testing using Python and Appium 3.

---

## Features

- **Multi-Environment Configuration**: Centralized, typed runtime configuration for `development`, `qa`, `staging`, and `production`. Validated with fail-fast assertions at bootstrap (enforcing HTTPS on production, blocking mock data in production).
- **Multi-Company / Multi-Tenant Isolation**: Authorizes tenant selection, applies dynamic company branding (palettes, logos, card radius), manages company-specific feature flags and business rules, and evicts tenant-specific query caches on switch to prevent cross-tenant data leakage.
- **Centralized API Client**: Centralized HTTP client with automatic base URL selection, `X-Tenant-ID` and `X-Correlation-ID` headers, Bearer token injection, controlled retry for eligible idempotent calls, and credential redaction during logging.
- **Secure Storage**: Backed by `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android).
- **Appium 3 Automation Framework**: Fully automated test suites in Python 3 using `Appium-Python-Client` (v6) and `pytest` implementing the Page Object Model across Android (UiAutomator2) and iOS (XCUITest).

---

## Local account flow

Authentication runs entirely on the frontend through a typed local API backed by AsyncStorage. There are no preloaded users: open **Create an account**, enter your details, and select your workspaces. You can then sign out and sign in again with those credentials. Sessions survive app restarts, and Development, QA, and Staging maintain separate accounts and sessions.

The redesigned app has standalone Sign in and Create account stack screens. After authentication, the bottom bar contains Overview, Companies, and Account. Explore has been removed. See the [demo walkthrough](docs/demo-guide.md) for presentation steps and environment-specific datasets.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Expo Development Server
```bash
# Native crypto requires a development build (Expo Go is not supported).
# Build and install the app for your target platform:
npm run android
npm run ios
npm run web
# For an already installed native development build:
npm start
```

---

## Automated Testing

### Environment configuration

Keep local machine settings in the ignored `.env` file instead of repeating
them in commands. If `.env` does not exist, copy `.env.example` to create it;
otherwise add the missing Appium settings from `.env.example` without replacing
your current Firebase values. The E2E npm scripts
load `.env` before starting Python; Expo reads the same file for
`EXPO_PUBLIC_*` values. Do not put passwords, service-account JSON, or other
private credentials in a committed file. For Jenkins, keep `.env` on the local
agent workspace (it is git-ignored); store any secrets in Jenkins Credentials.

```bash
test -f .env || cp .env.example .env
# Edit .env, then install the Python automation dependencies if needed:
python3 -m pip install -r automation/requirements.txt
```

### Offline network testing

The [offline testing guide](docs/offline-testing.md) covers online-only access,
Android emulator Appium cases, Firebase setup, network controls, evidence,
and scenarios awaiting real API workflows. Use a bundled build so an offline
relaunch does not depend on Metro.

```bash
npm run test:reports:android
```

The generated HTML report is `automation/reports/offline/index.html`.

Jenkins is parameterized by platform and environment. Android runs the offline
regression; iOS runs the supported online smoke flows. Each job targets only a
booted emulator or simulator. iOS radio toggling is not available through this
Appium setup, so the iOS smoke does not claim offline-network coverage.

The Android regression covers five high-risk workflows: empty sign-up
validation, signup/login and offline recovery, two offline sample submissions
with reconnect sync, follow-up validation, and correcting a validation error
before saving offline. These workflows now comprise six selected cases after
the online and offline authentication checks were separated. Their previous
combined timing was about 14 minutes; confirm the 20-minute target in Jenkins.
The complete Android offline suite remains available separately:

```bash
npm run test:reports:android:regression # Jenkins profile, target under 20 min
npm run test:reports:android:complete   # all offline regression cases, about 57 min previously
npm run test:reports:android:regression:all-environments
npm run test:reports:ios:smoke:all-environments
npm run test:reports:mobile:all-environments
```

Build a selected simulator app with `npm run build:e2e:ios:dev` (or `:qa` / `:stage`).
Set `IOS_UDID` to a booted Simulator UDID in `.env`; the build and Appium driver
refuse physical-device identifiers. Allure reports are written separately by
platform and environment under `automation/reports/allure-report-*`.

Jenkins retains the complete Allure report in **Build Artifacts** and publishes
test results through JUnit; the HTML Publisher plugin is not required. Download
the complete report folder, then run `python3 -m http.server 8000 --directory
<downloaded-report-folder>` and open `http://localhost:8000` to view it.

### Unit & Architecture Tests
Runs Node.js TypeScript strip-types test suite covering environment validation, tenant authorization, and query cache data isolation:
```bash
npm run test:unit
```

### Appium Automation Tests (Python 3 + Pytest)

E2E scripts use an Appium emulator or simulator; physical-device identifiers are rejected. A connection failure fails the run; it never produces a mock pass. CI reuses one account for the linear authentication and report workflow rather than repeating signup for each report case.
```bash
# Run all E2E automation tests
npm run test:e2e

# Run authentication module (Signup → Login)
npm run test:auth -- --platform android --environment development

# Run smoke suite
npm run test:smoke

# Run tenant isolation & security suite
npm run test:isolation

# Run cross-environment & cross-tenant matrix suite
npm run test:matrix

# Run both unit and E2E test suites together
npm run test:all
```

### Live Appium 3 Mobile Testing
To execute against a running physical device or emulator via Appium 3:
```bash
pytest automation/tests -m smoke \
  --environment qa \
  --company acme-corp \
  --platform android \
  --appium-url http://127.0.0.1:4723 \
  --real
```

### Parallel device-farm regression

The local farm runs one pytest worker per leased emulator/simulator, with sequential tests inside each worker. **Default mode shards the six regression cases by module**; it does not run every case on every OS. Extra devices with no assignment remain idle. Use `--mode replicate` for the complete selection on every device. `--group-by case` enables case-level balancing after verifying that the selected cases are independent.

Start the local Appium server with `npm run appium:farm:server`. This binds to loopback and enables only Appium 3 session discovery for active-session checks and cleanup. Do not use `--session-override`, which would evict other workers' sessions. Install the intended embedded AppReact build on every device first. The runner checks device availability, supplied OS versions and package presence; it does not build/install apps or prove installed binary hashes.

```bash
# Inspect collection and assignment without connecting to devices or Appium.
ANDROID_FARM_DEVICES='emulator-5554|17,emulator-5556|17' npm run test:farm:android -- qa --dry-run

# Split independent cases across two Android emulators.
ANDROID_FARM_DEVICES='emulator-5554|17,emulator-5556|17' npm run test:farm:android -- qa --group-by case

# Repeat all 25 device-facing cases on every selected Android emulator.
ANDROID_FARM_DEVICES='emulator-5554|17,emulator-5556|17' npm run test:farm:android -- qa --suite full --mode replicate

# Online smoke on booted iOS simulators (substitute actual UUIDs and OS versions).
IOS_FARM_DEVICES='<UUID-1>|27.0|iPhone 17,<UUID-2>|26.0|iPhone 16' npm run test:farm:ios -- qa --suite ios-smoke --mode replicate
```

Device entries use `id|OS-version|device-name`; OS and name are optional. Supplied OS versions must match the running devices exactly. `--suite regression` selects six cases; `--suite full` selects 25 device cases; `--suite ios-smoke` selects three online authentication/report cases and is also runnable on Android. Framework tests are excluded from device jobs. For more than one backend environment, run separate farm invocations; the existing `test:farm:mobile:regression` script runs its six platform/environment lanes sequentially.

Workers use independent accounts and sessions, Android system ports, iOS WDA ports/derived-data directories, MJPEG ports and artifact roots. The coordinator loads `.env` once before applying worker-specific settings. It rejects already-active device sessions and uses host-local locks across checkouts. Remote Appium endpoints and physical-device IDs are rejected because this runner controls local emulators/simulators.

**iOS farm offline tests cannot toggle host Wi-Fi.** For each worker needing `network_manager`, provide `FARM_IOS_PROXIES` as a JSON object keyed by simulator UUID, with `apiUrl`, `name` and `verified: true`. Each entry must identify a distinct, enabled proxy without toxics; use `OFFLINE_PROXY_TOKEN` for optional API authentication. `verified` means the app's relevant traffic and offline observations have actually been verified through that route; a flag alone cannot establish routing. Without this configuration use `--suite ios-smoke`. Proxy behavior is not proof of physical radio coverage.

Every run writes `plan.json` and `summary.json` under `automation/reports/farm/<run-id>/<platform>/<environment>/`, with per-worker JUnit, Allure, phase results, screenshots and offline logs below it. A farm pass requires every assigned case's setup, call and teardown to pass. Skips, xfails, missing/duplicate results, nonzero exits, timeouts and cleanup failures fail the run. Estimated assignment durations and measured worker/wall times are reported separately.

`FARM_WORKER_TIMEOUT_MS` defaults to one hour. SIGINT/SIGTERM interrupts workers, allows 15 seconds for teardown, and then terminates unresponsive workers. The supervisor removes remaining sessions on devices it started and restores/verifies Android radio snapshots and iOS proxy state. SIGKILL/host loss cannot run cleanup: stale locks deliberately block reuse. If cleanup fails, locks are retained too. Inspect the reported lock's `owner.json`, confirm the owning process/session is stopped and restore device/network state before manually removing that specific lock. Locks coordinate this runner; unrelated tools must not use its leased devices or ports.

Run framework verification with `npm run test:farm:framework` (local loopback access required). See [the parallel audit](docs/parallel-execution-audit.md) for findings and validation limits.

---

## Architecture Documentation
For deep-dive documentation on multi-tenant isolation, onboarding new tenants or environments, and CI/CD pipelines, see [docs/architecture-and-automation.md](docs/architecture-and-automation.md).
