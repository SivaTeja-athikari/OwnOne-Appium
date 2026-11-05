# Android Appium tests

The tests run against the actual Android application and create unique accounts through the Signup UI. Signup saves the account and returns to Login; authentication happens only after entering the registered password. No account is injected into storage, and a failed Appium connection never falls back to a simulated pass.

## Start the application and server

1. Connect an Android device or start an emulator. Confirm it appears in `adb devices`.
2. Build/install the native development app with `npm run android`. Native password derivation requires a development build.
3. Keep Metro running on port 8081. If dependencies changed while Metro was running, restart it with `npx expo start --port 8081 --clear`.
4. Start Appium with `npm run appium:server` if there is no server on port 4723.

## Run one module or the whole suite

```bash
# Critical signup → Login → dashboard → relaunch → logout flow
npm run test:smoke -- --real --platform android --environment development

# Authentication module, including duplicate signup and password confirmation
npm run test:auth -- --real --platform android --environment development

# Company memberships, switching, and unauthorized access
npm run test:isolation -- --real --platform android --environment development

# Each company profile in the selected environment
npm run test:matrix -- --real --platform android --environment development

# All Android UI tests
npm run test:e2e -- --real --platform android --environment development
```

Use `ANDROID_UDID` to select another connected device. The default is `emulator-5554`. The suite preserves saved accounts and creates a new unique email per test; it does not clear app data. Avoid touching the emulator while automation runs.

Screenshots, native page sources, and recordings are saved to `automation/reports/android/<test-name>/`. JUnit reports can be requested with `--junitxml=automation/reports/android/results.xml`.
