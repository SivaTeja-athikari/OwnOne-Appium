# Appium QA review — 2026-11-03

Verdict: the primary workflow matches the current Reports UI, but device execution
and additional failure coverage are required before demo sign-off.

## Corrections made

- Offline login now uses a real registered account and checks successful login
  with the same credentials after connectivity returns.
- Report lookup checks for ambiguous visible references instead of taking the
  first record. This is not a collection-wide duplicate check.
- Online and reconnect delivery compare all five form values with Firebase.
- Quick Settings evidence waits for System UI to be the foreground package;
  merely finding System UI in an XML dump could match a navigation bar.
- Network teardown errors remain errors even if emergency restoration succeeds.
  Session-level restoration failure now also fails the process exit status.
- Server-verification config supports environment variables without requiring a
  local .env file, and missing settings produce an explicit error.
- Readable generated addresses have a larger suffix space to reduce collisions.

## Verified

- Six network/framework helper tests passed. These use fakes and a localhost
  fault server; they do not prove native radio behavior or actual Firebase faults.
- Active suite collects 16 cases: eight report/offline scenarios, two authentication
  checks and six framework checks.
- TypeScript and lint pass; lint has three existing warnings.

## Remaining gates

- Run all current UI scenarios on the rebuilt Android emulator app with published
  Firestore rules. No native UI pass is claimed by this review.
- Verify native tab labels, radio selection attributes, scrolling and keyboard
  behavior against the actual accessibility tree.
- Complete video capture currently has a 180-second limit; use segmented capture
  before delivering a longer manager demo.
- Add double-submit, response-lost-after-commit, multiple queued reports, server
  errors, storage failure and account-isolation coverage. A stable reference is
  useful evidence but does not prove absence of all duplicate documents.
- iOS proxy control is not Wi-Fi control; Firebase routing must be demonstrated
  before claiming iOS offline coverage.
- Fresh accounts are created in the configured test Firebase project; automatic
  account cleanup is not implemented. Use a dedicated test environment.

## Demo order

Sign in online → show radios off → complete all form fields → save pending report
→ restart offline → verify retained data → show radios restored → automatic session
recovery without login → server-confirmed status → verify exact Firebase document.
