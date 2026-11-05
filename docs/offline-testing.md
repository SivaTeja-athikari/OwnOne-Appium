# Offline access and persistence test strategy

## Decision and app inventory

Fresh sign-in and account creation require a live server response. A profile verified by Firebase and Firestore is cached in SQLite so an existing user can reopen their last workspace while offline. This cached workspace is read-only: it contains no Firebase token, and server-backed actions remain unavailable until the user signs in online. Reconnecting does not silently convert a cached profile into an authenticated server session. Wi-Fi off alone is not an outage if mobile data still reaches the internet.

Signup drafts are stored in SQLite by environment. Name, email, and selected workspaces survive an app restart; passwords and confirmation values are deliberately never written to disk. After reconnecting, the user re-enters the password and submits the draft. Drafts are cleared only after the server confirms account creation. Explicit sign out clears the cached profile.

The signup screen labels this as a device-only draft, not a server submission. A cached profile has no Firebase token: changing workspaces and other server-backed actions are blocked, while cached reads remain available. The banner offers **Sign in to refresh** after connectivity returns; this clears the local cached session and opens the normal login route. No offline action is replayed automatically.

The three actual tabs are Overview, Companies, and Account. The signup form selects sample workspaces. Overview metrics are bundled presentation fixtures in development, QA, and staging; production has no fixture. The transaction/export buttons only show permission messages. The app has no live CRUD form, PDF download, upload, camera, offline operation queue, or server data refresh workflow. Those cases cannot receive a passing result until such screens and server contracts exist. The `apiBaseUrl` values in the environment registry are placeholders.

The shared API client retries only idempotent reads (`GET`, `HEAD`, `OPTIONS`) for network failures, timeouts, and transient HTTP statuses (408, 429, 500, 502, 503, 504), respecting a bounded `Retry-After` value. It never automatically retries a write. A future write queue requires a backend idempotency-key contract, per-record conflict policy, and visible pending/failed/synced states before it can be enabled safely.

## Firebase setup

Create a Firebase project, enable Email/Password in Authentication, create Firestore, and register a web app. Supply its public client configuration at build time:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=... \
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=... \
EXPO_PUBLIC_FIREBASE_PROJECT_ID=... \
EXPO_PUBLIC_FIREBASE_APP_ID=... \
npx expo run:android --variant release
```

Apply [firestore.rules](../firestore.rules) before registering users. The client stores Firebase credentials in memory, so after a cold relaunch SQLite restores only the cached read-only profile; a fresh Firebase session still requires online sign-in. Registration creates an Auth identity and its Firestore profile; a failed profile write can leave an Auth identity without a profile, so provisioning should eventually move to a trusted backend transaction. The selected workspace list is **demo presentation data**, not a server-granted company role. All client-selected roles are viewer. A real company backend must issue memberships, permissions, and business data before production use.

Without Firebase configuration, the app shows a configuration error and does not authenticate. This is an intentional fail-closed state. Do not set `OFFLINE_FIREBASE_CONFIGURED=1` unless the installed build has working Firebase configuration and Firestore rules.

## Emulator cases

Use an Android **emulator only**. The pytest session enables radios before Appium starts, saves their initial state, and restores it when the session ends. Each offline test restores its per-test network state, including on failure. Cases that require server access skip with a clear precondition message if the emulator still has no internet. A bundled release build is required because Metro cannot be assumed reachable offline. Name-based test emails look like `alex.morgan.4821@example.com`; configure a test domain accepted by your Auth project if needed.

| ID | Scenario | Preconditions and data | Steps | Expected result |
|---|---|---|---|---|
| OFF-001 | Cached workspace after offline relaunch | Firebase test account, verified online at least once | Sign in online, disable Wi-Fi and data, terminate/relaunch | SQLite restores the verified workspace; offline banner is visible; no crash |
| OFF-002 | Fresh login offline | Signed-out app | Disable both transports, inspect access, restore | Login blocked offline; login form returns after restore |
| OFF-003 | Signup draft persistence | Unique readable email; signup screen | Fill fields offline, submit, terminate/relaunch, reopen signup | Name/email/workspaces restore from SQLite; passwords are empty; offline submit is rejected; after reconnect and password re-entry, account is created once |
| OFF-004 | Navigation during outage | Firebase test account with two sample workspaces | Visit actual tabs online, cut network, navigate, restore | Cached workspace tabs remain accessible; reconnect keeps the cache visible until online sign-in refreshes it |
| OFF-005 | Cached workspace restoration and read-only policy | Firebase test account, Apex selected | Cut all radios, terminate/relaunch, attempt workspace switch, restore radios | SQLite restores Apex offline; other workspace choices are disabled; reconnect keeps the cache read-only and exposes **Sign in to refresh** |
| OFF-018 | Android radio modes | Emulator | Disable Wi-Fi, disable data, enable airplane mode, disable both; restore between | Appium observes requested states; teardown restores initial states |

OFF-001, OFF-004, and OFF-005 require `OFFLINE_FIREBASE_CONFIGURED=1` and a bundled Firebase-configured build. Without a configured project they are **skipped**, not passed. OFF-002 and OFF-003 verify fresh-login/signup blocking and local draft persistence; OFF-018 verifies Android radio control.

The HTML report records test ID, scenario, actual outcome, status, timestamp, logs, and screenshot paths. Open `automation/reports/offline/index.html`; machine-readable results are in `results.json`, with screenshots under `automation/reports/android/emulator-5554/`. An old report from a prior local-auth build must not be treated as evidence for this implementation.

## Run

```bash
npm run appium:server
```

In another terminal, with only `emulator-5554` selected:

```bash
OFFLINE_BUNDLED_BUILD=1 ANDROID_UDID=emulator-5554 PYTHONPATH=./automation/.lib:. \
python3 -s -m pytest automation/tests/offline --real --platform android \
--environment production -p no:cacheprovider
```

Add `OFFLINE_FIREBASE_CONFIGURED=1` only for the configured release build. Android uses UiAutomator2 `mobile: getConnectivity` and `mobile: setConnectivity`; a device-scoped ADB fallback restores initial state if Appium disconnects.

iOS has no native radio-control APIs in XCUITest or iOS Simulator. The upgraded `IOSNetworkManager` controls the host network interface (`networksetup -setairportpower <active_interface> off/on`, auto-detecting `en0` via `scutil --nwi`), immediately triggering `NWPathMonitor` on the simulator to transition to `.unsatisfied` while keeping Appium's WebDriverAgent connection over `127.0.0.1` intact. Emergency teardown restores host Wi-Fi automatically on test completion or failure. If a routed proxy is explicitly verified (`OFFLINE_PROXY_VERIFIED=1`), it controls the routed proxy instead.

Both Android and iOS support full offline regression suites:
- **Smoke**: Online validation, online signup/login with invalid/valid credentials, and server-confirmed reports.
- **Regression**: Full offline workflow including empty validation, radio/network drop, offline sample submission to SQLite outbox, offline restart verification, network restoration, automatic background sync, and server Firestore document verification.

Configure `IOS_UDID` with a booted Simulator UDID; the build and driver reject physical-device identifiers.

Run a platform/environment pair with the corresponding command. Jenkins exposes the same selections as build parameters:

```bash
npm run test:reports:android:regression:development
npm run test:reports:android:regression:qa
npm run test:reports:android:regression:staging
npm run test:reports:ios:smoke:development
npm run test:reports:ios:smoke:qa
npm run test:reports:ios:smoke:staging
npm run test:reports:ios:regression:development
npm run test:reports:ios:regression:qa
npm run test:reports:ios:regression:staging
```

To build and install an iOS Simulator app, use `npm run build:e2e:ios:dev`, `:qa`, or `:stage`. The target UDID must already be booted and listed by `xcrun simctl`; physical iOS devices are refused.

## Pending real workflows

| IDs | Coverage awaiting an app workflow and backend contract |
|---|---|
| OFF-006–007 | API screen errors, loading completion, retry, and mid-request interruption |
| OFF-008–009 | Form submission and CRUD idempotency |
| OFF-010–012 | PDF download, image/document upload, and camera capture |
| OFF-013–015 | Slow link, latency, packet loss, DNS failure, timeout, HTTP 500/503 |
| OFF-016–017 | Wi-Fi/mobile switching and queued operation synchronization |

`automation/offline/proxy.py` and `fault_server.py` provide controllable network faults and request logs for those future routes. They do not substitute for an application API integration. Add stable accessibility IDs for loading, errors, retry, server record IDs, and transfer progress when the corresponding screens are built.

## Platform references

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Expo Firebase integration](https://docs.expo.dev/guides/using-firebase/)
- [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [UiAutomator2 connectivity methods](https://appium.github.io/appium-uiautomator2-driver/latest/reference/execute-methods/)
- [Toxiproxy](https://github.com/Shopify/toxiproxy)
