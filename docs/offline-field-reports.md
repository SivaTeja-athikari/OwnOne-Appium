# Offline field reports

Open the **Reports** tab after signing in.

The Reports form captures a report title, report type, site/location, optional
customer or work-order reference, priority, work outcome, observed risk,
optional next-action handover note, optional on-site phone, conditional
follow-up date, site checklist, sign-off name and details. The report capture
timestamp is recorded automatically. The previous company dashboard and
transaction controls have been removed.
Company selection is hidden. The existing account workspace association remains internal for server authorization and local data isolation.

## Implemented behavior

- Nonempty form edits persist immediately to SQLite, in serialized order.
- Navigation away and app restart restore the saved draft for the same account,
  environment and workspace. Passwords and authentication tokens are not stored
  in the reports database.
- Required fields, minimum lengths, phone format and conditional follow-up date
  validation are enforced before queuing. A follow-up date is required only when
  follow-up is enabled; invalid or past dates are rejected inline.
- Work outcome, risk, contact, follow-up, checklist state, sign-off, work-order
  reference and handover note are saved to SQLite with the draft and included
  in the same immutable submission.
- Report type and priority use accessible, described selection sheets and remain
  part of the local SQLite draft and server-confirmed report.
- Submit durably queues the report before clearing the form. A storage failure
  keeps the entered details visible and reports an error.
- Pending reports send while the app is foregrounded, on reconnection and on
  subsequent 30-second retry intervals. Manual sending is also available.
- Firebase authentication persists in native secure storage. Cold offline restart
  restores the matching account's cached reports; reconnect revalidates the session
  without unmounting the form and resumes delivery. Explicit logout or rejected
  credentials still requires sign-in.
- Reports queued in another workspace wait until that workspace is active.
- Delivery uses a bounded REST request and an immutable, persistent UUID.
  The client checks for an existing matching document before creating, and uses
  a create-only precondition. A lost acknowledgment retries the same reference.
- Only a successful server response or an exact matching server document marks
  a record submitted. A timeout, denied permission or server error retains it.
- Drafts can be discarded with confirmation. Queued reports are immutable.
- Local history is scoped to account + workspace + environment. Sign-out keeps
  reports, but another account cannot see or send them through the app.
- In non-production environments, the form offers five scenario starters:
  offline delivery, maintenance follow-up, a blocked safety incident and two
  separate batch reports. Choosing one pre-fills the editable draft and saves it
  locally. It does not create an Activity record or submit anything; the report
  enters Activity only after the user submits it. Replacing a nonempty draft
  requires confirmation. Production does not show the scenario starters.
- Delivery while the app is closed is not implemented. Reopen the app and allow session recovery. Uninstalling or clearing app storage removes local
  reports that have not reached the server.

## Firebase setup required

Publish the updated repository `firestore.rules` in Firebase Console → Firestore
Database → Rules. Keep the profile rules as well as the new submission rules.
No new Firebase project, API key or native dependency is required.

Server location:

```
environments/{environment}/workspaces/{tenantId}/members/{userId}/submissions/{reference}
```

The updated rules allow members to create and read their own reports only, and
validate the optional structured report fields. Publish the latest repository
`firestore.rules` before testing server delivery. Reports cannot
be updated, deleted or listed through the client. The UI shows its local history;
it does not claim to show reports from other devices.

## Manager demonstration

1. Sign in online and open New report. Choose a scenario starter to prefill the
   editable form. Review the fields and make any changes before continuing.
2. Visibly disable both Wi-Fi and mobile data in emulator Quick Settings.
3. For the batch scenario, fill and submit Report 1, then choose Report 2 and
   submit it separately. For the main offline demo, complete the dropdown
   selections, work-order reference, work details, next-action handover,
   outcome, risk level, site checklist, contact, follow-up and sign-off. Show
   the draft-saved message.
4. Submit. Show the real report in Activity as Pending with its reference.
5. Close and reopen the app. Show the same pending record and details.
6. Visibly restore connectivity. Allow the saved session to recover automatically.
7. Open Reports. Show Submitted — Server confirmed and the same reference.
8. Open the Firestore document at that reference to show the received data.

Frontend checks: TypeScript and lint. Appium scenarios and recording are deferred
until the frontend workflow and Firebase rules are ready, as requested.

References used for SDK 58:
- https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/
- https://docs.expo.dev/versions/v58.0.0/sdk/network/
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit

The SQLite schema migrates existing report rows without deleting drafts or queued submissions. New metadata is included only when present, preserving retry compatibility for older queued reports. Publish the latest rules to permit the additional fields.
