import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Exercise the actual coordinator with fake command executables and an Appium
// HTTP double. No real adb, simulator, backend account or Appium session is used.
async function fixture(t, behavior = 'pass') {
  const directory = mkdtempSync(join(tmpdir(), 'farm-integration-'));
  const commands = join(directory, 'commands.jsonl');
  const invocations = join(directory, 'workers.jsonl');
  const adb = join(directory, 'adb');
  writeFileSync(adb, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(commands)}, JSON.stringify(args)+'\\n');
if (args.includes('get-state')) console.log('device');
else if (args.includes('getprop')) console.log('15');
else if (args.includes('pm')) console.log('package:/fake/app.apk');
else if (args.includes('settings')) console.log(args.includes('airplane_mode_on') ? '0' : '1');
`, { mode: 0o755 });
  const python = join(directory, 'python');
  writeFileSync(python, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const option = (name) => args.find(s => s.startsWith(name+'='))?.slice(name.length+1);
if (args.includes('--collect-only')) {
  fs.writeFileSync(option('--farm-collection-file'), JSON.stringify([
    {nodeid:'tests/offline/first.py::test_a'}, {nodeid:'tests/offline/second.py::test_b'}
  ]));
} else {
  fs.appendFileSync(${JSON.stringify(invocations)}, JSON.stringify({id:process.env.ANDROID_UDID,
    version:process.env.ANDROID_PLATFORM_VERSION, port:process.env.APPIUM_SYSTEM_PORT,
    root:process.env.FARM_ARTIFACT_ROOT, start:Date.now()})+'\\n');
  const cases = JSON.parse(fs.readFileSync(option('--farm-assignment-file')));
  const result = {exitCode:0,cases:cases.map(nodeid=>({nodeid,setup:{outcome:'passed'},
    call:{outcome:${JSON.stringify(behavior === 'skip' ? 'skipped' : 'passed')}},teardown:{outcome:'passed'}}))};
  if (${JSON.stringify(behavior)} === 'hang') {
    process.on('SIGINT', () => process.exit(130));
    setInterval(()=>{},1000);
  } else setTimeout(()=> {
    if (${JSON.stringify(behavior)} !== 'missing') fs.writeFileSync(option('--farm-results-file'),JSON.stringify(result));
  }, 200);
}
`, { mode: 0o755 });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (!['/status', '/appium/sessions'].includes(req.url)) { res.statusCode = 404; res.end('{}'); return; }
    res.end(JSON.stringify({ value: req.url === '/status' ? { ready: true } : [] }));
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  t.after(async () => {
    await new Promise((done) => server.close(done));
    rmSync(directory, { recursive: true, force: true });
  });
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, AUTOMATION_PYTHON: python,
    APPIUM_URL: `http://127.0.0.1:${server.address().port}`, FARM_WORKER_TIMEOUT_MS: '1000',
    ANDROID_FARM_DEVICES: 'emulator-9900|15,emulator-9902|15,emulator-9904|15' };
  async function run(args = [], signal = false) {
    const child = spawn(process.execPath, ['scripts/run-device-farm.mjs', 'android', 'qa', ...args], { env, cwd: resolve('.') });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    let timer;
    if (signal) timer = setInterval(() => {
      try { if (readFileSync(invocations, 'utf8').trim().split('\n').length >= 2) child.kill('SIGTERM'); } catch { /* not started */ }
    }, 50);
    const code = await new Promise((done) => child.once('close', done));
    clearInterval(timer);
    const path = output.match(/active devices; (.+)/)?.[1];
    assert.ok(path, output);
    return { code, output, summary: JSON.parse(readFileSync(join(path, 'summary.json'), 'utf8')) };
  }
  return { run, invocations, commands, env };
}

test('real coordinator launches only nonempty workers, with distinct ports/artifacts, and restores radios', async (t) => {
  const f = await fixture(t);
  const { code, summary, output } = await f.run();
  assert.equal(code, 0, output);
  assert.equal(summary.results.length, 2);
  const workers = readFileSync(f.invocations, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(workers.length, 2);
  assert.equal(new Set(workers.map((worker) => worker.port)).size, 2);
  assert.equal(new Set(workers.map((worker) => worker.root)).size, 2);
  assert.ok(workers.every((worker) => worker.version === '15'));
  assert.ok(Math.abs(workers[0].start - workers[1].start) < 200, 'workers must overlap');
  const commands = readFileSync(f.commands, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(commands.filter((cmd) => cmd.includes('collapse')).length, 2);
});

for (const behavior of ['skip', 'missing', 'hang']) {
  test(`coordinator rejects ${behavior} results and still cleans devices`, async (t) => {
    const f = await fixture(t, behavior);
    const { code, summary } = await f.run();
    assert.equal(code, 1);
    assert.equal(summary.passed, false);
    assert.equal(summary.cleanupOk, true);
    if (behavior === 'hang') assert.ok(summary.results.every((item) => item.timedOut));
  });
}

test('SIGTERM interrupts workers, waits for exit, and restores radios', async (t) => {
  const f = await fixture(t, 'hang');
  const { code, summary } = await f.run([], true);
  assert.equal(code, 130);
  assert.equal(summary.cancelled, true);
  assert.equal(summary.cleanupOk, true);
});

test('OS mismatch fails before any worker starts', async (t) => {
  const f = await fixture(t);
  f.env.ANDROID_FARM_DEVICES = 'emulator-9900|14';
  const { code, summary } = await f.run();
  assert.equal(code, 1);
  assert.match(summary.failure, /OS mismatch/);
  assert.throws(() => readFileSync(f.invocations));
});
