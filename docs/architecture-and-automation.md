# Multi-Environment, Multi-Tenant SaaS Mobile Architecture & Appium Test Framework

## 1. Architecture Overview

The app now uses Firebase Authentication and a server-read Firestore profile for registration, login, and workspace access. A network outage blocks access, and a cold launch requires a fresh online sign-in. The older device-local auth module remains for isolated unit tests only; the runtime store uses the remote adapter. The environment API URLs below are placeholders. See [the offline testing guide](offline-testing.md) for configuration and emulator coverage.

This React Native & Expo prototype is engineered to serve **multiple tenant organizations** across **multiple deployment environments** from a single, unified codebase with zero screen duplication, strict tenant data isolation, and comprehensive Python + Appium automated testing.

```
                              ┌──────────────────────────────────────────────┐
                              │           React Native Application           │
                              │           (Single Shared Codebase)           │
                              └──────────────────────┬───────────────────────┘
                                                     │
                                   ┌─────────────────┴─────────────────┐
                                   ▼                                   ▼
                      ┌────────────────────────┐          ┌────────────────────────┐
                      │ Environment Layer      │          │ Multi-Company Tenant   │
                      │ (Deploy Context)       │          │ (Organization Context) │
                      ├────────────────────────┤          ├────────────────────────┤
                      │ • development          │          │ • acme-corp            │
                      │ • qa                   │          │ • apex-health          │
                      │ • staging              │          │ • zenith-financial     │
                      │ • production           │          │ • [dynamic onboarding] │
                      └────────────────────────┘          └────────────────────────┘
                                   │                                   │
                                   └─────────────────┬─────────────────┘
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │ Centralized Core Services   │
                                      ├─────────────────────────────┤
                                      │ • Typed API Client          │
                                      │ • Secure Storage Keychain   │
                                      │ • Zustand Client State      │
                                      │ • TanStack Cache Isolation  │
                                      └─────────────────────────────┘
                                                     │
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │ Dynamic Branded UI & Views  │
                                      │ (Tokens, Flags, Perms)      │
                                      └─────────────────────────────┘
```

---

## 2. Environment Configuration

### Environments Supported
1. `development`: Local backend (`https://dev-api.saasplatform.internal/v1`), verbose debug logging, mock fallbacks enabled, 15s timeout.
2. `qa`: Quality Assurance environment (`https://qa-api.saasplatform.internal/v1`), network diagnostics enabled, 20s timeout with 3 retries.
3. `staging`: Pre-production environment (`https://staging-api.saasplatform.com/v1`), 15s timeout, mock fallback forbidden.
4. `production`: Live production (`https://api.saasplatform.com/v1`), strictly requires HTTPS, zero mock fallbacks allowed, runtime client switching disabled.

### Adding a New Environment
To onboard a new environment (e.g. `uat` or `sandbox`):
1. Add the environment key to `AppEnvironment` in `src/config/environment/types.ts`.
2. Add the validated configuration to `ENVIRONMENTS` in `src/config/environment/environments.ts`.
3. Add the Python matching config to `automation/config/environments.py`.
4. Run `npm run test:all` to ensure schema validation passes automatically.

---

## 3. Multi-Company / Multi-Tenant Architecture

### Tenant Separation vs. Environment Separation
- **Environment** represents *where* the application is deployed (API gateways, server hosts, monitoring).
- **Tenant** represents *who* is using the application (branding, colors, feature flags, role permissions, transaction limits, locale).

### Tenant Profiles Provided
- **Acme Logistics & Supply (`acme-corp`)**:
  - Primary color: `#0284C7` (Oceanic Blue)
  - Features: Advanced reporting (Enabled), CSV export (Enabled), Document scanner (Enabled)
  - Rules: USD currency, $100,000 transaction limit, 30m session timeout
- **Apex Healthcare Solutions (`apex-health`)**:
  - Primary color: `#059669` (Emerald Green)
  - Features: HIPAA-compliant CSV export (Disabled), Biometrics MFA (Enabled)
  - Rules: USD currency, $25,000 transaction limit, 15m medical session timeout
- **Zenith Capital Group (`zenith-financial`)**:
  - Primary color: `#7C3AED` (Royal Purple)
  - Features: Real-time alerts (Enabled), Document scanner (Disabled)
  - Rules: EUR currency, €1,000,000 limit, 10m fintech session timeout

### Data Isolation & Prevention of Cross-Tenant Leakage
1. **Query Keys Scoped by Tenant**: All server queries are generated using `createTenantQueryKey(tenantId, scope, ...params)`.
2. **Cache Purge on Switch**: Whenever a user switches organizations, `clearTenantCache(appQueryClient, prevTenantId)` evicts all queries belonging to the previous tenant before mounting the new tenant's data.
3. **Session Reset on Logout**: `logout()` executes `clearAllTenantCaches(appQueryClient)` and signs out of Firebase. No runtime account or session is stored in the legacy local-auth store.

---

## 4. Automated Testing (Python + Appium 3)

### Structure
```
automation/
├── config/             # Environment, tenant, and Appium capability definitions
├── core/               # DriverFactory and in-memory MockDriver for offline/CI execution
├── pages/              # Page Object Model (BasePage, LoginPage, DashboardPage, CompanySwitchModal)
├── tests/              # Test suites (Smoke, Tenant Isolation, Cross-Matrix)
├── conftest.py         # Pytest fixtures and CLI flags (--environment, --company, --platform)
└── pytest.ini          # Test runner markers and configuration
```

### Execution Commands

```bash
# Run all unit tests (Node.js TypeScript strip-types test runner)
npm run test:unit

# Run full Appium automation test suite
npm run test:e2e

# Run Smoke suite targeting QA on Android
npm run test:smoke

# Run Tenant Isolation & Data Leakage suite
npm run test:isolation

# Run Cross-Environment & Cross-Tenant Matrix suite
npm run test:matrix

# Run both Unit + E2E suites
npm run test:all
```

### Running with a Physical Device / Cloud Simulator
To execute against a real Appium server:
```bash
# Start your local Appium 3 server
appium --port 4723

# Execute tests against Android or iOS
pytest automation/tests -m smoke \
  --environment qa \
  --company acme-corp \
  --platform android \
  --appium-url http://127.0.0.1:4723
```
Real-device runs fail if Appium is unreachable. They never fall back to an in-memory driver. UI tests create fresh accounts through Signup, return to Login, and use the registered credentials. The `--platform` and `--environment` options select the actual device and environment under test.

---

## 5. CI/CD Matrix Pipeline Integration

Sample GitHub Actions workflow job matrix:

```yaml
jobs:
  mobile-cross-matrix:
    runs-on: macos-latest
    strategy:
      matrix:
        environment: [qa, staging]
        company: [acme-corp, apex-health, zenith-financial]
        platform: [android, ios]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: |
          npm ci
          pip install -r automation/requirements.txt
      - name: Run Unit Tests & Typecheck
        run: |
          npx tsc --noEmit
          npm run test:unit
      - name: Run Appium Automation Matrix
        run: |
          pytest automation/tests -m matrix \
            --environment ${{ matrix.environment }} \
            --company ${{ matrix.company }} \
            --platform ${{ matrix.platform }}
```
