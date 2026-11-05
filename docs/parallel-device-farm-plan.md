# Parallel test execution and device-farm sizing

Planning baseline: 2026-11-05. Scope: test distribution, device count, OS coverage and regression wall-clock time only. No runner changes or device executions were performed for this review.

V1 means native Kotlin on Android and Swift on iOS. V2 means React Native AppReact. V1 artifacts and its executable test mappings are not available in this repository; V1 timing below is a capacity assumption, not execution evidence.

## Repository findings

- Collection under `automation/tests` finds 32 cases: 23 offline/auth/report journeys, 2 additional authentication cases, and 7 network-manager/framework tests. Use **25 device-facing cases** as the initial full mobile regression inventory. Run the 7 framework tests separately; they do not establish device coverage.
- `scripts/run-device-farm.mjs` selects only 6 cases marked `regression`, all in 2 modules. It launches a pytest process per device and assigns whole modules by estimated duration.
- Its estimates total 22.5 minutes: authentication 7 minutes and reports 15.5 minutes. On two devices, the estimated test-work critical path is therefore 15.5 minutes, before setup/reporting. These are hard-coded estimates, not measured timings.
- Additional workers cannot accelerate those two module groups. Empty assignments must be skipped explicitly: currently a worker with no node IDs can fall back to pytest's default collection and run unintended tests.
- Android has per-worker `systemPort` allocation, but probing a free port does not reserve it against another farm run. iOS lacks per-worker WDA ports and derived-data directories. Current screenshots/offline summaries are not consistently isolated by run and attempt.
- Current device factories permit Android emulators and iOS simulators only. A device named after a Samsung model does not establish Samsung hardware/One UI coverage.

## Execution model

Use **one pytest worker, one Appium session and one exclusive device lease per active device**. Test steps run sequentially within a device. Different independent test cases run concurrently on different devices; two workers must never manipulate the same device simultaneously. Appium supports parallel sessions, but the test runner must distribute the work. See the official [Android parallel guide](https://appium.github.io/appium-uiautomator2-driver/latest/guides/parallel-tests/) and [iOS parallel guide](https://appium.github.io/appium-xcuitest-driver/latest/guides/parallel-tests/).

Retain Python/pytest and evolve the existing runner. Use a separate Appium process per worker for process ownership and recovery; this is a project design choice, since Appium also supports a shared server.

1. Collect the exact selected cases once, including parameters. Assign every case a version/platform eligibility, required OS/network capabilities and estimated duration.
2. Treat a complete business journey as an atomic job. Prove fixture/account independence before splitting existing modules into individual cases. Keep declared dependent cases together, preserving order.
3. Within each eligible device pool, schedule longest jobs first onto the least-loaded device. Replace estimates with measured setup + test + teardown durations by version/platform/OS. Do not add nested pytest workers within a device worker.
4. Use separate accounts, report references, app state, proxy routes and artifact directories per run/device/case/attempt. Reuse sessions only for explicitly grouped journeys. Install and verify the selected version's artifact before its job starts.
5. Lease device IDs and host ports atomically across runs. Allocate unique Appium ports; Android `appium:systemPort`; iOS `appium:wdaLocalPort` and `appium:derivedDataPath`; and MJPEG/Chromedriver ports when those features are used. Keep capability values namespaced as described in [Appium session capabilities](https://appium.io/docs/en/latest/guides/caps/).
6. Never run host-wide network disruption alongside other workers on that host. Give iOS offline jobs isolated, verified network routes or dedicated hosts; otherwise serialize that resource and include the delay in estimates. A shared proxy name is not isolation.
7. Stop assigning jobs to an unhealthy device. Preserve the failed attempt and schedule at most one fresh diagnostic attempt on an equivalent available device. Report retry time separately. A failed or skipped case cannot establish completed coverage.
8. Release sessions, owned server processes, ports and network state on completion or cancellation. A supervisor must recover leases after worker crashes. Never start workers with empty assignments.

## Two distinct run modes

| Mode | Scheduling | What completion establishes |
| --- | --- | --- |
| Sharded regression | Split all 25 cases across devices of the same platform/version; two workers ideally run about half each | Every case ran somewhere in that pool; not every case on every OS |
| Full OS coverage | Repeat all 25 cases for each required version/platform/OS cell; shard only among equivalent replicas within that cell | Every required case ran on every declared cell |

Android and iOS are separate pools: an Android pass cannot replace an iOS case. Likewise V1 and V2 are separate workloads. Device count means simultaneously available sessions, not merely registered inventory.

## Device count and OS coverage

Start with **4 concurrent devices**: 2 Android emulators and 2 iOS simulators. Use equivalent OS replicas per platform for the first speed benchmark. Spread these across hosts as needed; do not assume one laptop can sustain four devices. This pilot validates concurrency and establishes durations, but does not provide the full OS matrix.

For the initial full coverage farm, use **6 concurrent devices**, one per cell:

| Cell | Platform / form factor | OS selection |
| --- | --- | --- |
| A-min | Android compact phone emulator | Lowest OS supported by the actual app artifact and chosen driver |
| A-prev | Android standard phone emulator | Previous supported major release |
| A-current | Android large phone emulator | Current supported stable major release |
| I-min | iOS compact iPhone simulator | Lowest supported app OS with an available compatible runtime/toolchain |
| I-prev | iOS standard iPhone simulator | Previous supported major release |
| I-current | iOS large iPhone simulator | Current supported stable major release |

These are coverage roles, not verified installed devices. Before provisioning, resolve each role to an exact OS/API/patch, runtime/image, device profile, UDID, host and driver version. Verify actual artifact minimum OS values and product support policy; existing defaults and README examples are not an authoritative support matrix. Collapse duplicate OS tiers if the support window is narrower. Explicitly record any supported minimum OS that the available toolchain cannot test.

Six devices can execute all six OS cells concurrently for V2, then repeat them for V1. **12 devices** allow either two equivalent replicas per OS cell to accelerate one version, or one device per cell per version to run V1 and V2 concurrently. Those are different allocations. Accelerating both versions with two replicas per cell requires **24 devices**.

This emulator/simulator plan does not cover OEM firmware, real radios, or physical-device performance. Physical devices and tablet coverage would be separate additions if required by the product; they are not currently executable with the repository's device restrictions. Do not label emulator form-factor coverage as OEM coverage.

## Expected wall-clock time

Define a full pass as completion of all applicable device cases for the selected version/platform/OS matrix in **one backend environment**. Unsupported cases must be listed as gaps. The existing six-case selection is a smaller regression subset.

Use this model:

```text
wall time = provisioning/install + longest eligible worker workload
            + reporting + resource serialization + retry time
worker workload = sum(case setup + test actions + teardown)
```

For budgeting only, assume 25 cases averaging **3 minutes including per-case setup/teardown**, or 75 device-minutes per version/OS cell. Allow 20% scheduling/runtime headroom and 10 minutes per run wave for provisioning/install/reporting. This yields `10 + 1.2 × 75 / replicas` minutes when cases balance well. A longest indivisible journey or constrained network resource can make it slower. Build generation and queue wait are excluded and must be added to delivery time.

| Allocation and scope | Concurrent devices | Planning time |
| --- | ---: | ---: |
| V2 Android and iOS, one baseline OS each, full suite on each | 2 | ~100 minutes |
| V2 Android and iOS, two replicas per baseline OS, case-level sharding | 4 | ~55 minutes |
| V2 full six-cell OS matrix, one device per cell | 6 | ~100 minutes |
| V1 then V2 full six-cell matrix, two waves | 6 | ~200 minutes |
| V1 and V2 full six-cell matrix concurrently | 12 | ~100 minutes |
| V2 full six-cell matrix, two replicas per cell | 12 | ~55 minutes |

**These figures are forecasts, not AppReact benchmark results.** The 3-minute average is unmeasured for the full suite; some known journeys already have 8-minute estimates. A 2–5 minute average changes the six-device V2 matrix estimate to approximately **70–160 minutes**. V1 may have different setup times and applicable cases, so it needs its own measurements. Running development, QA and staging sequentially roughly triples the corresponding scope's workload.

For the existing six-case subset, the present module scheduler predicts 15.5 minutes of test work on two devices. Under the same 20% headroom and 10-minute overhead assumption, budget about **29 minutes per platform**, but do not call that a full regression pass. Individual-case scheduling could reduce its estimated test critical path to 11.5 minutes with two workers, provided independence is demonstrated.

## Implementation and sizing acceptance

1. Extend collection beyond the six-case marker to the agreed 25-case inventory; expose explicit sharded and full-coverage selections. Validate eligible case counts before starting sessions.
2. Add leased devices/ports, iOS worker capabilities, isolated artifacts and network-resource constraints. Skip empty workers and ensure cancellation cleanup.
3. Prove case independence and replace whole-module assignment with duration-weighted atomic jobs. Keep the module mode until that proof exists.
4. Run one-device and two-device benchmarks on equivalent OS configurations for each platform. Record setup, test, teardown, provisioning, retries and total elapsed time. [Appium event timings](https://appium.io/docs/en/latest/guides/event-timing/) can supplement pytest timings to locate session/command overhead.
5. Complete at least five successful comparable full runs to establish an initial observed range and median; accumulate more history before treating a p95 as dependable. Failed setup runs are not successful-regression duration evidence.
6. Demonstrate that all required case/cell pairs are accounted for, no devices or ports overlap, workers do not overwrite artifacts, and network changes affect only the intended jobs. Then choose 6 versus 12 concurrent slots using measured time and the desired completion budget.

Validation for this planning change: pytest collection succeeded (32 total, 25 device-facing, 6 in the current farm subset). TypeScript typecheck passed. Lint completed with zero errors and three existing warnings. No device-run timing or successful V1/V2 regression is claimed.
