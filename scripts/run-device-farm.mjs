import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { lease, leasePort, parseDevices, schedule, validateResults } from './device-farm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  mode: { type: 'string', default: 'shard' },
  suite: { type: 'string', default: 'regression' },
  'group-by': { type: 'string', default: 'module' },
  'dry-run': { type: 'boolean', default: false },
} });
const [platform, environment = 'qa', ...extra] = positionals;
if (!['android', 'ios'].includes(platform) || !['development', 'qa', 'staging'].includes(environment) || extra.length
    || !['regression', 'full', 'ios-smoke'].includes(values.suite)) {
  throw new Error('Usage: node scripts/run-device-farm.mjs <android|ios> <development|qa|staging> [--mode shard|replicate] [--suite regression|full|ios-smoke] [--group-by module|case] [--dry-run]');
}
function command(executable, args, env, timeout = 30000) {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${executable} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
// Load dotenv once, privately. Worker-specific values are applied afterwards,
// so .env cannot silently redirect every worker to its default OS or device.
const env = JSON.parse(command('sh', ['scripts/with-env.sh', process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.env))'], process.env));
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('FARM_') || key.endsWith('_FARM_DEVICES') || ['AUTOMATION_PYTHON', 'APPIUM_URL'].includes(key)) env[key] = value;
}
env.PYTEST_ADDOPTS = ''; // Selection must come only from the manifest, not inherited -k/-m/-n flags.
const devices = parseDevices(env[`${platform.toUpperCase()}_FARM_DEVICES`], platform);
const python = env.AUTOMATION_PYTHON || resolve(root, 'automation/.venv/bin/python');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const resultDir = resolve(root, 'automation/reports/farm', runId, platform, environment);
mkdirSync(resultDir, { recursive: true });
const write = (name, value) => writeFileSync(resolve(resultDir, name), JSON.stringify(value, null, 2));
const common = ['-s', '-m', 'pytest', '-c', 'automation/pytest.ini', '-p', 'automation.core.farm_plugin', '-p', 'no:cacheprovider', '--platform', platform, '--environment', environment];
const selection = values.suite === 'full'
  ? ['automation/tests/offline', 'automation/tests/test_authentication.py']
  : ['automation/tests/offline', '-m', values.suite === 'ios-smoke' ? 'ios_smoke' : 'regression'];
command(python, [...common, ...selection, '--collect-only', '-q', `--farm-collection-file=${resolve(resultDir, 'collection.json')}`], env, 60000);
const cases = JSON.parse(readFileSync(resolve(resultDir, 'collection.json'), 'utf8'));
const jobs = schedule(cases, devices.length, values.mode, values['group-by'])
  .map((job, index) => ({ ...job, device: devices[index], index }))
  .filter((job) => job.cases.length); // Never spawn pytest without explicit node IDs.
write('plan.json', { runId, platform, environment, suite: values.suite, mode: values.mode, grouping: values['group-by'], cases: cases.length, jobs });
console.log(`[farm] ${values.mode}: ${cases.length} cases, ${jobs.length}/${devices.length} active devices; ${resultDir}`);
for (const job of jobs) console.log(`[farm] ${job.device.id}: ${job.cases.length} cases; estimated test work ${job.estimatedSeconds}s (not a measured runtime)`);
if (values['dry-run']) process.exit(0);
if (env.USE_MOCK_DRIVER === '1') throw new Error('Farm runs cannot use a mock driver');
if (cases.some((item) => item.account) && env.OFFLINE_FIREBASE_CONFIGURED !== '1') throw new Error('Selected tests require OFFLINE_FIREBASE_CONFIGURED=1');
if (cases.some((item) => item.bundled) && env.OFFLINE_BUNDLED_BUILD !== '1') throw new Error('Selected tests require OFFLINE_BUNDLED_BUILD=1');
const timeoutMs = Number(env.FARM_WORKER_TIMEOUT_MS || 3600000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) throw new Error('FARM_WORKER_TIMEOUT_MS must be an integer >= 1000');
const appium = new URL(env.APPIUM_URL || 'http://127.0.0.1:4723');
if (!['localhost', '127.0.0.1', '[::1]'].includes(appium.hostname)) throw new Error('This runner leases local devices/ports and requires a local Appium endpoint');
const baseUrl = appium.href.replace(/\/$/, '');
async function api(path, method = 'GET') {
  const response = await fetch(`${baseUrl}${path}`, { method, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Appium ${method} ${path}: HTTP ${response.status}${path === '/appium/sessions' ? '; start the local server with npm run appium:farm:server (session_discovery required)' : ''}`);
  const result = await response.json();
  if (result.value?.error) throw new Error(`Appium ${path}: ${result.value.error}`);
  return result.value;
}
const locks = resolve(tmpdir(), `appreact-device-farm-${process.getuid?.() ?? 'user'}`);
const owner = { pid: process.pid, runId, resultDir };
const releases = [];
const children = new Set();
const radioStates = new Map();
const proxyStates = new Map();
const activeDevices = new Set();
let cancelled = false;
let forced = false;
let failure;
const started = Date.now();
function interrupt() {
  cancelled = true;
  for (const child of children) child.kill('SIGINT');
}
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
const adb = (id, ...args) => command('adb', ['-s', id, ...args], env);
const shell = (id, ...args) => adb(id, 'shell', ...args);
const proxies = JSON.parse(env.FARM_IOS_PROXIES || '{}');
async function proxyRequest(config, method = 'GET', body) {
  const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/proxies/${encodeURIComponent(config.name)}`, {
    method, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...(env.OFFLINE_PROXY_TOKEN ? { Authorization: `Bearer ${env.OFFLINE_PROXY_TOKEN}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Proxy ${config.name}: HTTP ${response.status}`);
  return response.json();
}
function sessionDevice(session) {
  return String(session.capabilities?.['appium:udid'] || session.capabilities?.udid || '').toLowerCase();
}
let results = [];
let sessionDiscoveryEnabled = true;
try {
  const status = await api('/status');
  if (!status.ready) throw new Error('Appium is not ready');
  let existing = [];
  try {
    const list = await api('/appium/sessions');
    if (Array.isArray(list)) existing = list;
  } catch (err) {
    sessionDiscoveryEnabled = false;
    console.warn(`[farm] Note: session_discovery is disabled on Appium server (${err.message.split('\n')[0]}). Proceeding without session inspection.`);
  }
  const forwardedPorts = new Set(platform === 'android' ? command('adb', ['forward', '--list'], env).split(/\s+/).filter((s) => /^tcp:\d+$/.test(s)).map((s) => Number(s.slice(4))) : []);
  const booted = platform === 'ios' ? JSON.parse(command('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], env)).devices : {};
  for (const job of jobs) {
    if (cancelled) throw new Error('Cancelled during preflight');
    const { device } = job;
    releases.push(lease(locks, `device:${platform}:${device.id}`, owner));
    if (existing.some((session) => sessionDevice(session) === device.id.toLowerCase())) throw new Error(`Device already has an Appium session: ${device.id}`);
    job.directory = resolve(resultDir, `${job.index + 1}-${device.id}`);
    mkdirSync(job.directory, { recursive: true });
    if (platform === 'android') {
      if (adb(device.id, 'get-state') !== 'device') throw new Error(`Device unavailable: ${device.id}`);
      const actual = shell(device.id, 'getprop', 'ro.build.version.release');
      if (device.version && actual !== device.version) throw new Error(`OS mismatch for ${device.id}: requested ${device.version}, found ${actual}`);
      if (!shell(device.id, 'pm', 'path', 'com.anonymous.appreact').startsWith('package:')) throw new Error(`AppReact not installed: ${device.id}`);
      job.actualVersion = actual;
      radioStates.set(device.id, {
        airplane: shell(device.id, 'settings', 'get', 'global', 'airplane_mode_on'),
        wifi: shell(device.id, 'settings', 'get', 'global', 'wifi_on'),
        data: shell(device.id, 'settings', 'get', 'global', 'mobile_data'),
      });
      if (Object.values(radioStates.get(device.id)).some((value) => !['0', '1'].includes(value))) throw new Error(`Cannot snapshot radios for ${device.id}`);
    } else {
      const entry = Object.entries(booted).find(([, list]) => list.some((item) => item.udid.toUpperCase() === device.id && item.state === 'Booted'));
      if (!entry) throw new Error(`Simulator not booted: ${device.id}`);
      job.actualVersion = entry[0].split('.iOS-')[1]?.replaceAll('-', '.');
      if (!job.actualVersion || (device.version && job.actualVersion !== device.version)) throw new Error(`Simulator OS mismatch: ${device.id}`);
      command('xcrun', ['simctl', 'get_app_container', device.id, 'com.anonymous.appreact', 'app'], env);
      if (job.cases.some((item) => item.network)) {
        const config = proxies[device.id] || proxies[device.id.toLowerCase()];
        if (!config?.apiUrl || !config.name || config.verified !== true) throw new Error(`iOS offline worker ${device.id} needs a dedicated verified FARM_IOS_PROXIES entry; host Wi-Fi control is forbidden`);
        const proxyUrl = new URL(config.apiUrl).href.replace(/\/$/, '');
        releases.push(lease(locks, `proxy:${proxyUrl}:${config.name}`, owner));
        const state = await proxyRequest(config);
        if (typeof state.enabled !== 'boolean' || !state.enabled || state.toxics?.length) throw new Error(`Proxy ${config.name} must start enabled without toxics`);
        proxyStates.set(device.id, { config, enabled: state.enabled });
      }
    }
    const driverPort = await leasePort(locks, owner, platform === 'android' ? 8200 : 8100, platform === 'android' ? 8299 : 8199, forwardedPorts);
    releases.push(driverPort.release);
    job.driverPort = driverPort.port;
    const mjpeg = await leasePort(locks, owner, 9100, 9199, forwardedPorts);
    releases.push(mjpeg.release);
    job.mjpegPort = mjpeg.port;
  }
  // All devices must pass preflight before any worker can mutate app/network state.
  write('plan.json', { runId, platform, environment, suite: values.suite, mode: values.mode, grouping: values['group-by'], jobs });
  results = await Promise.all(jobs.map((job) => new Promise((done) => {
    if (cancelled) return done({ device: job.device.id, passed: false, cancelled: true });
    const assignment = resolve(job.directory, 'assignment.json');
    writeFileSync(assignment, JSON.stringify(job.cases.map((item) => item.nodeid)));
    const proxy = proxyStates.get(job.device.id)?.config;
    const workerEnv = {
      ...env, FARM_WORKER_ID: job.device.id, FARM_ARTIFACT_ROOT: job.directory,
      FARM_PLATFORM: platform, APPIUM_MJPEG_PORT: String(job.mjpegPort),
      ...(platform === 'android' ? {
        ANDROID_UDID: job.device.id, ANDROID_PLATFORM_VERSION: job.actualVersion,
        APPIUM_SYSTEM_PORT: String(job.driverPort), IOS_UDID: '',
      } : {
        IOS_UDID: job.device.id, IOS_PLATFORM_VERSION: job.actualVersion,
        IOS_DEVICE_NAME: job.device.name || 'iPhone', ANDROID_UDID: '',
        APPIUM_WDA_PORT: String(job.driverPort), APPIUM_DERIVED_DATA_PATH: resolve(job.directory, 'wda'),
        OFFLINE_PROXY_API_URL: proxy?.apiUrl || '', OFFLINE_PROXY_NAME: proxy?.name || '',
        OFFLINE_PROXY_VERIFIED: proxy ? '1' : '0',
      }),
    };
    const args = [...common, '--real', '--farm-worker', '--appium-url', baseUrl,
      `--farm-assignment-file=${assignment}`, `--farm-results-file=${resolve(job.directory, 'results.json')}`,
      `--junitxml=${resolve(job.directory, 'junit.xml')}`, `--alluredir=${resolve(job.directory, 'allure-results')}`,
      ...job.cases.map((item) => `automation/${item.nodeid}`)];
    const begin = Date.now();
    const child = spawn(python, args, { cwd: root, env: workerEnv, stdio: 'inherit' });
    children.add(child);
    activeDevices.add(job.device.id.toLowerCase());
    let timedOut = false;
    let killTimer;
    const stop = () => {
      child.kill('SIGINT');
      if (!killTimer) killTimer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, 15000);
    };
    const timeout = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const cancelTimer = setInterval(() => { if (cancelled) stop(); }, 250);
    let spawnError;
    child.once('error', (error) => { spawnError = error.message; });
    child.once('close', (code, signal) => {
      children.delete(child);
      clearTimeout(timeout); clearTimeout(killTimer); clearInterval(cancelTimer);
      let evidence;
      try { evidence = JSON.parse(readFileSync(resolve(job.directory, 'results.json'), 'utf8')); } catch { /* Missing evidence fails closed. */ }
      done({ device: job.device.id, code, signal, spawnError, timedOut,
        seconds: (Date.now() - begin) / 1000,
        passed: !cancelled && !timedOut && code === 0 && validateResults(job.cases, evidence),
        evidence: evidence || null });
    });
  })));
} catch (error) {
  failure = error.message;
  console.error(`[farm] ${failure}`);
} finally {
  // A terminated pytest process can leave an Appium session and radios behind.
  // Only clean sessions on devices this run actually started, after workers stop.
  let cleanupOk = true;
  if (activeDevices.size && sessionDiscoveryEnabled) {
    try {
      const sessions = await api('/appium/sessions');
      for (const session of sessions) {
        if (activeDevices.has(sessionDevice(session))) await api(`/session/${encodeURIComponent(session.id)}`, 'DELETE');
      }
      if ((await api('/appium/sessions')).some((session) => activeDevices.has(sessionDevice(session)))) {
        throw new Error('Owned device still has an active session after cleanup');
      }
    } catch (error) { cleanupOk = false; console.error(`[farm] Session cleanup failed: ${error.message}`); }
  }
  for (const [id, state] of radioStates) {
    if (!activeDevices.has(id.toLowerCase())) continue;
    try {
      shell(id, 'cmd', 'connectivity', 'airplane-mode', 'disable');
      shell(id, 'svc', 'wifi', state.wifi === '1' ? 'enable' : 'disable');
      shell(id, 'svc', 'data', state.data === '1' ? 'enable' : 'disable');
      shell(id, 'cmd', 'connectivity', 'airplane-mode', state.airplane === '1' ? 'enable' : 'disable');
      shell(id, 'cmd', 'statusbar', 'collapse');
      const restored = {
        airplane: shell(id, 'settings', 'get', 'global', 'airplane_mode_on'),
        wifi: shell(id, 'settings', 'get', 'global', 'wifi_on'),
        data: shell(id, 'settings', 'get', 'global', 'mobile_data'),
      };
      if (Object.keys(state).some((key) => state[key] !== restored[key])) throw new Error('Radio state does not match the pre-run snapshot');
    } catch (error) { cleanupOk = false; console.error(`[farm] Radio cleanup failed for ${id}: ${error.message}`); }
  }
  for (const [id, { config, enabled }] of proxyStates) {
    if (!activeDevices.has(id.toLowerCase())) continue;
    try {
      await proxyRequest(config, 'POST', { enabled });
      const state = await proxyRequest(config);
      if (state.enabled !== enabled || state.toxics?.length) throw new Error('Proxy state did not recover to its clean baseline');
    }
    catch (error) { cleanupOk = false; console.error(`[farm] Proxy cleanup failed: ${error.message}`); }
  }
  const passed = !failure && !cancelled && !forced && cleanupOk && results.length === jobs.length && results.every((item) => item.passed);
  write('summary.json', { runId, platform, environment, suite: values.suite, mode: values.mode,
    seconds: (Date.now() - started) / 1000, passed, cancelled, forced, cleanupOk, failure, results });
  if (cleanupOk) for (const release of releases.reverse()) release();
  else console.error(`[farm] Locks retained in ${locks}. Verify sessions/network recovery before removing the affected owner.json and lock directories.`);
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  console.log(`[farm] ${passed ? 'PASS' : 'FAIL'}; ${results.filter((item) => item.passed).length}/${jobs.length} workers passed; artifacts: ${resultDir}`);
  process.exitCode = cancelled ? 130 : passed ? 0 : 1;
}
