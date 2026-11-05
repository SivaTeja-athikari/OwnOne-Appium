# Migration to the Appium master specification

Status: architecture and repository audit; implementation and acceptance are not complete.

Source: `/Users/sivateja/Downloads/Appium Mobile Test Framework Master Prompt and Documentation.md`.
Part 4 overrides earlier target and project-inventory requirements.

## Scope and assumptions

- Keep AppReact as the first V2 project pack. Preserve existing tests during migration.
- Phase 1 targets local Android emulators and iOS simulators. BrowserStack remains disabled; do not restore credentials or cloud sessions.
- Existing installation uses Appium 3.9.0 and Appium Python Client 6. The brief refers to Appium 2.x. Retain the installed stack initially and document/pin a validated compatibility set before release; a downgrade is not an assumed prerequisite.
- Android validation comes first because the current regression is unstable. iOS support is required for final acceptance, even though the immediate pilot is Android.
- V1 app artifacts, app identities, identifier mappings, and migration expectations have not been established. Do not invent native locators or count V2 runs as V1 parity evidence.
- Four-device validation can run across agents. Do not boot four emulators on this laptop merely to satisfy a device count.

## Audit

| Requirement | Existing implementation | Remaining work |
| --- | --- | --- |
| Python pytest, page objects | `automation/core`, `automation/pages`, existing tests | Extract reusable core while maintaining current commands |
| Project packs and manifests | Environment and tenant config only | Validated project YAML, screen manifests, capabilities, onboarding CLI |
| One suite for V1/V2 | Current app IDs and test IDs are embedded in code | Runtime project/version/platform resolution, four locator flavors, business action interfaces |
| Identifier contract | RN testIDs exist in app code | Export contract, compare native inventories, fail clearly for unavailable mappings |
| Offline testing | Android/iOS network managers, proxy, fault server, evidence helpers | Capability catalogue, per-scenario coverage mapping, isolated iOS proxy, unsupported reasons, crash recovery |
| Device scheduling | Node runner, two local workers, available system ports, module grouping | Configured device tiers/classes, history-based group balancing, all required ports, separate Appium server per device |
| Retry and flaky reporting | No cross-device retry policy | One fresh attempt on another eligible device; preserve original outcome; report flaky passes |
| Reports | JUnit, Allure, screenshots and some recording/evidence | Unified attempt schema, crash/ANR and log evidence, parity, healing and trend summaries |
| Jenkins | Machine-specific Jenkinsfile and test exit-code gating | Shared library, agent-local setup, selection parameters, priority gates, reviewed overrides |
| Healing | Ad hoc page-object fallbacks | Swappable resolver, audited candidates/confidence, ambiguity rejection, forbidden-role enforcement |
| Framework verification | Some network-manager tests | Config/locator self-check, scheduler isolation, gate/parity/healing tests, reproducible dependency set |

The full offline catalogue is not implemented. Payments, OTP, uploads, push, conflicts and other product-specific scenarios require declared product capabilities and observable acceptance criteria. Unsupported scenarios must be reported explicitly, not manufactured as passing examples.

## Architecture

```text
project + version + platform + environment + tier + tags
                      |
              validated configuration
                      |
       pytest collection and capability checks
                      |
       dependency groups + duration history
                      |
                device scheduler
                      |
    per-device Appium process + exclusive resource lease
                      |
     business actions -> page objects -> locator resolver
                      |                    |
           network/data controllers   constrained healing
                      |
       immutable attempts and evidence -> gates/parity/trends
```

Proposed destination, migrated incrementally:

```text
automation/
  pyproject.toml
  mobile_test_core/
    config.py, plugin.py, driver_factory.py, resources.py
    scheduling.py, network.py, locators.py, healing.py
    reporting.py, parity.py, gates.py, scaffold.py
  projects/appreact/
    project.yaml
    screens/
    locators/
    pages/
    tests/
  tests/framework/
  reports/
jenkins/vars/mobilePipeline.groovy
docs/framework-runbook.md
```

Existing entry points remain adapters during migration. Move a tested vertical slice before moving the remaining tests; do not maintain duplicate implementations of driver lifecycle or network cleanup.

## Test independence and splitting

The six selected regression cases use function-scoped fresh accounts in farm mode, and network fixtures restore the selected device's connectivity. No explicit inter-test dependency was found in those cases. Each complete business journey stays inside one test.

Current whole-module grouping is an interim conservative boundary, not proof of independence and not the final duration scheduler. It preserves collection order but is imbalanced: report journeys take longer than authentication checks.

The final scheduler must:

1. Collect node IDs, priorities, supported flavors, required capabilities and explicit dependency groups.
2. Reject missing or cyclic dependencies. Co-locate any genuinely ordered journey; preferably express its setup through fixtures or a single scenario.
3. Sum measured durations per atomic group, assign longest groups first to eligible workers, and preserve internal order. Use declared estimates only when history is absent.
4. Keep users, application state, artifacts and ports isolated by run/device/test/attempt. Pin one active worker to each UDID.
5. Reserve exclusive resources for host-wide network operations. iOS proxy namespaces may permit concurrency; host networking changes must serialize.
6. Retry at most once on a different device of the same configured class, with fresh setup. If no eligible alternate exists, report that limitation rather than pretending a same-device rerun satisfies the requirement.
7. Preserve first-attempt failures and mark retry passes flaky. A disconnected device is an infrastructure outcome, not an assertion failure.

Sharding provides suite coverage across devices; it does not prove that every test passed on every OS/device. Configuration must distinguish `shard` runs from replicated coverage runs. V1 and V2 parity needs matching shared test IDs and comparable coverage.

## Resolver and healing constraints

- Prefer stable accessibility identifiers, then exact resource IDs/names, then explicit alternatives; XPath remains last resort.
- Record every alternative or healed match, including why the primary failed. Existing unreported fallbacks are technical debt.
- Never heal assertion targets, expected-absence checks, destructive actions, or financial actions. A manifest override cannot weaken these prohibitions.
- Require confidence >= 0.80, a meaningful winning margin, and one unambiguous candidate. Missing/covered/off-screen elements first need readiness or bounded scrolling, not a guessed replacement.
- Keep matches in memory for the run; emit suggested locator patches for review without automatically modifying canonical mappings or publishing PRs.
- Compare a constrained custom resolver with Healenium before choosing an implementation. The resolver interface must allow replacement.

## Delivery stages and evidence

1. **Stabilize current V2 Android pilot.** Reproduce the input/scrolling issues with current screenshots and hierarchy from the same attempt. Remove speculative fallbacks after validating a root-cause fix. Require passing auth and report setup before extraction.
2. **Project/config/locator slice.** Introduce `--project`, `--app-version`, platform and target validation; seed actual AppReact manifests; migrate login as the first business action. Missing V1 mappings fail validation explicitly.
3. **Scheduling and isolation.** Device matrix, resource leases and separate Appium processes; measured duration history, dependency groups, device recovery, cross-device retries and attempt reports.
4. **Offline catalogue.** Declare supported scenarios and expectations per project; exercise existing controllers, add missing product-supported cases and isolated iOS network controls. Normal teardown cannot guarantee recovery after SIGKILL or host failure: add supervisor/Jenkins cleanup and next-run connectivity preflight.
5. **Reporting and gates.** Priority/tag metadata, parity comparison, crash/ANR collection, flaky/heal counts and gate evaluation. Missing results or all-skipped required coverage must block promotion. Quarantine requires owner/ticket/history.
6. **Healing and onboarding.** Screen capture/scaffold, contract checker, reviewable suggestions, deliberate rename/ambiguity/forbidden-action checks, shared Jenkins library and runbook.
7. **Acceptance pilot.** Real V1/V2 builds on Android/iOS; a restored offline scenario; four-device run without resource/data collisions; a Jenkins gate demonstration; a reported deliberate heal with forbidden-target rejection.

Time model: wall-clock is the longest assigned worker's measured setup + test + teardown durations, plus provisioning, retry and reporting time. Compute separately for each version/platform/coverage mode; report actual durations alongside estimates.

## Current evidence and external prerequisites

The grouped run `2026-11-05T08-42-44-069Z` produced three authentication passes on emulator-5556 and three report setup errors on emulator-5554. An earlier conversational summary incorrectly described one report pass. Subsequent focused runs still had Android input-location failures. The existing suite is not a stable acceptance baseline yet.

Required external inputs/evidence:

- V1 Android APK and iOS simulator `.app`, their identities and native identifier inventory.
- Confirmation whether an in-place V1-to-V2 data migration is supported. Different app IDs imply a different migration mechanism.
- Installed iOS runtimes/devices and Jenkins macOS agent access for real execution evidence.
- Production-supported OS/form factors for final device tiers; local emulator models do not establish Samsung/Xiaomi OEM coverage.
- Approved gate thresholds, quarantine ownership, backend seed/cleanup capabilities and test credential references.

Full compliance cannot be claimed from framework unit tests, placeholder manifests, mocked drivers, or an Android-only run.
