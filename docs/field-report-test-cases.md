# Field report demo test cases

Status: implemented. Android emulator execution on 2026-11-03 used one signup, one sign-in and one reused Appium session. Offline persistence and validation cases passed; server-confirmation cases require the latest Firestore rules to be published.

The report suite covers all five editable scenario starters, verifies prefilled
values and local draft persistence without creating an Activity submission, and
uses both batch starters to queue two distinct offline reports. Quick Settings
remains expanded for four seconds after each radio-state screenshot so the
recording visibly shows the Wi-Fi and mobile-data state. The delivery result is
also held for four seconds after it appears, whether it is confirmed or remains
pending. Configure these with `OFFLINE_RADIO_EVIDENCE_HOLD_SECONDS` and
`OFFLINE_SYNC_CONFIRMATION_HOLD_SECONDS` (0–10 seconds each).

## DEMO-001: Offline capture and server receipt

- Test: `test_demo_offline_capture_restore_and_send`
- Preconditions: Android emulator, embedded build, published submission rules, online signup
- Data: Delivery inspection; Hyderabad Warehouse 02; work order WO-2048; Delivery; High; next-action handover
- Steps: Show Quick Settings offline; fill form; queue; relaunch; show restored connectivity; automatically recover session; verify Firebase document
- Expected: Pending survives restart; reference and handover notes persist; exact payload reaches the original reference; receipt survives relaunch
- Actual result: The report remained queued locally, but Firebase rejected creation because the deployed rules do not yet allow `workOrderReference` and `nextAction`.
- Status: BLOCKED — publish the latest `firestore.rules`, then rerun.
- Evidence: Produced during execution under `automation/reports/android/`.

## FORM-002: Draft persistence

- Test: `test_report_draft_survives_offline_restart`
- Preconditions: Authenticated account and embedded app
- Data: Report text, work order reference, next-action note, outcome, risk, contact, follow-up date, checklist and sign-off
- Steps: Disable connectivity; complete form; await saved message; relaunch
- Expected: Text, reference, handover note, conditional fields and selected controls restore without submission
- Actual result: Passed on the Android emulator. The reference and next-action note survived app restart.
- Status: PASS
- Evidence: Produced during execution under `automation/reports/android/`.

## AUTH-001: Offline login blocked

- Test: `test_login_requires_network`
- Preconditions: Signed out and radios disabled
- Data: Readable email; valid-format password
- Steps: Enter credentials; submit offline
- Expected: Login remains visible; offline error; no authenticated report screen
- Actual result: Excluded from the authenticated report-form run because this case deliberately signs out. It has not been rerun in this pass.
- Status: NOT RUN
- Evidence: Produced during execution under `automation/reports/android/`.

## FORM-003: Online server-confirmed submission

- Test: `test_online_report_has_server_receipt`
- Preconditions: Signed in, online, published Firestore rules
- Data: Delivery report with all fields
- Steps: Fill; submit; await confirmation; read Firebase document
- Expected: Exact report reaches server
- Actual result: Not rerun after the Appium cleanup fix; requires published rules for server confirmation.
- Status: BLOCKED — publish the latest `firestore.rules`, then rerun.
- Evidence: Produced during execution under `automation/reports/android/`.

## FORM-004: Automatic reconnect delivery

- Test: `test_reconnection_sends_pending_without_restart`
- Preconditions: Signed in and embedded build
- Data: Delivery report with all fields
- Steps: Disable network; submit; restore network without restart
- Expected: Pending becomes confirmed automatically; server contains report
- Actual result: Not rerun after the Appium cleanup fix; server confirmation requires published rules.
- Status: BLOCKED — publish the latest `firestore.rules`, then rerun.
- Evidence: Produced during execution under `automation/reports/android/`.

## FORM-VALIDATION-MATRIX: Inline field validation

- Test: `test_inline_validation_blocks_invalid_report_submission`
- Preconditions: Signed in
- Data: Empty and below-minimum values for title, location and details
- Steps: Verify required markers; submit each invalid variant; inspect the field-specific helper; inspect activity
- Expected: Required markers and exact inline messages appear, entered data remains, and no report is queued
- Actual result: Passed on the Android emulator. All six invalid variants showed the required inline message, preserved the other entered values and created no report.
- Status: PASS
- Evidence: `automation/reports/android/emulator-5554/test_inline_validation_blocks_invalid_report_submission/validation-*.png`

## FORM-VALIDATION-RECOVERY: Correct and resubmit

- Test: `test_corrected_inline_validation_can_be_saved_offline`
- Preconditions: Signed in; Android emulator
- Data: Invalid short title, then corrected valid report
- Steps: Submit invalid form offline; correct title; confirm helper clears; submit again
- Expected: One pending report with corrected values; no invalid record created
- Actual result: Passed on the Android emulator; correcting the short title cleared the error and queued exactly one pending report.
- Status: PASS
- Evidence: `automation/reports/android/emulator-5554/test_corrected_inline_validation_can_be_saved_offline/corrected-report-saved-on-device.png`

## FORM-STRUCTURED-VALIDATION: Follow-up and contact validation

- Test: `test_report_follow_up_validation_and_offline_save`
- Preconditions: Signed in; Android emulator
- Data: Invalid phone, enabled follow-up without a date, invalid calendar date, then corrected values
- Steps: Submit with invalid contact/date; correct both; add outcome, risk, checklist and sign-off; submit offline
- Expected: Inline errors block invalid submission; corrected report queues once and displays its structured summary
- Actual result: Passed on the Android emulator; invalid contact/date values were blocked and the corrected report queued offline.
- Status: PASS
- Evidence: Produced during execution under `automation/reports/android/`.

## Execution

Latest local run: 4 passed — draft restart, structured follow-up validation,
required-field validation matrix, and corrected offline resubmission. The
server-receipt demo was attempted and stopped at Firestore permission denial.
Publish the current rules before rerunning online receipt, reconnect, batch and
Unicode delivery checks.

Rebuild the embedded Android app after UI changes and publish the latest firestore.rules first.

```sh
npm run build:e2e:android:dev
npm run test:demo:offline:android
npm run test:reports:android
npm run test:reports:android:full
npm run report:allure:open
```

`test:reports:android` is the shortest smoke journey: one sample report is
filled, edited, submitted offline, and verified after reconnect. The manager
run `test:reports:android:full` generates two Allure suites, Authentication and
Field reports, using one signup and one authenticated session. It covers empty
signup and report validation, successful signup, invalid and valid login,
offline login recovery, an unchanged sample submission, and an edited sample
submission followed by local restart and synchronization. The broader starter
matrix, structured-field validation and boundary cases remain available with
`test:reports:android:regression`.

The manager-ready and regression commands skip deliberate selection pauses.
Quick Settings and the sync result remain visible for two seconds each. Configure them with
`OFFLINE_RADIO_EVIDENCE_HOLD_SECONDS` and
`OFFLINE_SYNC_CONFIRMATION_HOLD_SECONDS` (0–10 seconds). Set
`OFFLINE_DEMO_PAUSE_SECONDS=0` to remove the holds or use another value up to
three seconds.
Authentication is split into online credential checks and a dedicated offline
recovery case, so the same test account is reused and the report flow does not
repeat signup. The fast regression profile selects the high-risk core; the
starter matrix, structured-field validation and boundary cases are in
`test:reports:android:complete`.

Full current suite: `npm run test:e2e:android:dev`.

The manager demo verifies OS radio state and captures Quick Settings screenshots before and after restoration. The form and pending queue are captured separately. A direct Firebase read with the test account verifies delivery independently of the UI. Credentials and tokens are not written to evidence.

Existing company cases are archived, not counted as passing. iOS currently runs
online smoke coverage only. Appium/XCUITest cannot toggle simulator radios, and
Toxiproxy is not routed through the app's Firebase requests; do not present that
as iOS offline coverage.

Current recording uses Appium's 180-second per-test capture limit. A complete demo longer than that requires segmented recording in the recording phase; screenshots and server receipts cover the full flow.

The receipt check verifies a stable document reference and unchanged creation time on relaunch; it does not claim a collection-wide duplicate audit (client listing is denied by the rules). In-flight response loss, repeated submit taps, account isolation, and interrupted uploads remain additional coverage for the next test iteration.
