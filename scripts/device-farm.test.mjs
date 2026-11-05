import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lease, parseDevices, schedule, validateResults } from './device-farm.mjs';

const cases = [
  'tests/a.py::test_one', 'tests/a.py::test_two', 'tests/b.py::test_three',
].map((nodeid) => ({ nodeid }));

test('rejects duplicate, empty, malformed and physical device entries', () => {
  for (const value of ['', 'emulator-5554,', 'emulator-5554,emulator-5554', 'physical123', 'emulator-1|abc', 'emulator-1|15|Pixel|extra']) {
    assert.throws(() => parseDevices(value, 'android'));
  }
  const id = 'abcdef00-0000-0000-0000-000000000001';
  assert.throws(() => parseDevices(`${id},${id.toUpperCase()}`, 'ios'));
  assert.equal(parseDevices(' emulator-5554 | 15 | Pixel 8 ', 'android')[0].version, '15');
});

test('module sharding assigns every test once; extra devices stay empty', () => {
  const jobs = schedule(cases, 4);
  assert.equal(jobs.filter((job) => job.cases.length).length, 2);
  assert.deepEqual(jobs.flatMap((job) => job.cases.map((item) => item.nodeid)).sort(), cases.map((item) => item.nodeid).sort());
  assert.equal(jobs.find((job) => job.cases.includes(cases[0])).cases.includes(cases[1]), true);
});

test('case scheduling uses idle devices and replicate means full coverage on each device', () => {
  assert.equal(schedule(cases, 3, 'shard', 'case').every((job) => job.cases.length === 1), true);
  assert.equal(schedule(cases, 3, 'replicate').every((job) => job.cases.length === 3), true);
  assert.throws(() => schedule([], 2));
  assert.throws(() => schedule([...cases, cases[0]], 2));
});

test('locks exclude other runs and cannot be silently stolen from a dead owner', () => {
  const directory = mkdtempSync(join(tmpdir(), 'farm-lock-test-'));
  try {
    const release = lease(directory, 'device:one', { pid: 999999999 });
    assert.throws(() => lease(directory, 'device:one', { pid: process.pid }), /Resource busy/);
    const releaseOther = lease(directory, 'device:two', { pid: process.pid });
    releaseOther(); release();
    lease(directory, 'device:one', { pid: process.pid })();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('results require every assigned case and all three successful phases', () => {
  const result = { exitCode: 0, cases: cases.map((item) => ({ ...item,
    setup: { outcome: 'passed' }, call: { outcome: 'passed' }, teardown: { outcome: 'passed' },
  })) };
  assert.equal(validateResults(cases, result), true);
  for (const phase of ['setup', 'call', 'teardown']) {
    const bad = structuredClone(result); bad.cases[0][phase].outcome = 'skipped';
    assert.equal(validateResults(cases, bad), false);
  }
  for (const change of [
    (bad) => { bad.cases.pop(); },
    (bad) => { bad.cases[0].xfail = true; },
    (bad) => { bad.exitCode = 1; },
    (bad) => { bad.cases[0] = bad.cases[1]; },
    (bad) => { delete bad.cases[0].teardown; },
  ]) {
    const bad = structuredClone(result); change(bad);
    assert.equal(validateResults(cases, bad), false);
  }
  assert.equal(validateResults(cases, undefined), false);
});
