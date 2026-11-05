# OwnOne demo walkthrough

Configure Firebase Authentication and Firestore using the [offline testing guide](offline-testing.md). The app fails closed without these settings. A cold launch requires online sign-in; there are no seeded users.

1. Open **Create an account**. Enter a readable email, name, password of at least eight characters, and choose sample workspaces.
2. Submit online, return to Sign in, and authenticate with the new account.
3. Visit Overview, Companies, and Account. In development, QA, and staging, Overview activity and metrics are clearly labeled illustrative fixtures. Production has no sample metrics.
4. Switch between selected workspaces. The active selection is saved in the server profile. Client-selected workspaces have viewer presentation access only; this is not a real company invitation or permission grant.
5. Disable connectivity on an Android emulator. An offline screen covers account and workspace content. Restore connectivity and wait for server validation. After a cold relaunch, sign in again.

The transaction and export buttons demonstrate permission display only. They do not create records or files. Real company memberships and operational data require a trusted backend.
