import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

export function parseDevices(value, platform) {
  if (!value?.trim()) throw new Error(`${platform.toUpperCase()}_FARM_DEVICES is required`);
  const devices = value.split(',').map((entry) => {
    const parts = entry.split('|').map((part) => part.trim());
    let [id, version = '', name = ''] = parts;
    if (parts.length > 3 || !id || (version && !/^\d+(\.\d+)*$/.test(version))) {
      throw new Error(`Invalid device entry: ${entry}`);
    }
    if (platform === 'android' ? !/^emulator-\d+$/.test(id) : !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) {
      throw new Error(`Expected an ${platform} emulator/simulator ID: ${id}`);
    }
    if (platform === 'ios') id = id.toUpperCase();
    return { id, version, name };
  });
  if (new Set(devices.map(({ id }) => id)).size !== devices.length) throw new Error('Duplicate device ID');
  return devices;
}

const estimates = {
  test_report_follow_up_validation_and_offline_save: 240,
  test_demo_offline_capture_restore_and_send: 180,
  test_login_blocked_offline_and_recovers_online: 180,
  test_signup_invalid_and_valid_login_online: 150,
  test_signup_empty_form_validation: 90,
  test_corrected_inline_validation_can_be_saved_offline: 210,
};

export function schedule(cases, count, mode = 'shard', grouping = 'module') {
  if (!cases.length || !Number.isInteger(count) || count < 1) throw new Error('Empty suite or device pool');
  if (!['shard', 'replicate'].includes(mode) || !['case', 'module'].includes(grouping)) throw new Error('Invalid scheduling mode');
  if (new Set(cases.map((item) => item.nodeid)).size !== cases.length) throw new Error('Duplicate collected case');
  const jobs = Array.from({ length: count }, () => ({ cases: [], estimatedSeconds: 0 }));
  const cost = (item) => estimates[item.nodeid.split('::').at(-1)] ?? 180;
  if (mode === 'replicate') return jobs.map(() => ({ cases: [...cases], estimatedSeconds: cases.reduce((n, item) => n + cost(item), 0) }));
  const groups = new Map();
  for (const item of cases) {
    const key = grouping === 'module' ? item.nodeid.split('::')[0] : item.nodeid;
    const group = groups.get(key) ?? { cases: [], estimatedSeconds: 0 };
    group.cases.push(item);
    group.estimatedSeconds += cost(item);
    groups.set(key, group);
  }
  for (const group of [...groups.values()].sort((a, b) => b.estimatedSeconds - a.estimatedSeconds)) {
    const job = jobs.reduce((best, current) => current.estimatedSeconds < best.estimatedSeconds ? current : best);
    job.cases.push(...group.cases);
    job.estimatedSeconds += group.estimatedSeconds;
  }
  return jobs;
}

// Locks are shared across checkouts on this host. Fail closed on stale locks:
// a dead parent does not prove its pytest/Appium session has stopped.
export function lease(directory, resource, owner) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, createHash('sha256').update(resource).digest('hex'));
  try { mkdirSync(path); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let details = 'owner metadata unavailable';
    try { details = readFileSync(join(path, 'owner.json'), 'utf8'); } catch { /* interrupted acquisition */ }
    throw new Error(`Resource busy: ${resource}; lock ${path}; ${details}`);
  }
  try { writeFileSync(join(path, 'owner.json'), JSON.stringify({ resource, ...owner })); }
  catch (error) { rmdirSync(path); throw error; }
  return () => { unlinkSync(join(path, 'owner.json')); rmdirSync(path); };
}

export async function leasePort(directory, owner, start, end, excluded = new Set()) {
  for (let port = start; port <= end; port++) {
    if (excluded.has(port)) continue;
    let release;
    try { release = lease(directory, `tcp:${port}`, owner); } catch (error) {
      if (error.message.startsWith('Resource busy:')) continue;
      throw error;
    }
    try {
      const free = await new Promise((done, reject) => {
        const server = net.createServer();
        server.once('error', (error) => error.code === 'EADDRINUSE' ? done(false) : reject(error));
        server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
      });
      if (free) return { port, release };
    } catch (error) { release(); throw error; }
    release();
  }
  throw new Error('No free leased ports');
}

export function validateResults(expected, result) {
  if (!result || result.exitCode !== 0 || !Array.isArray(result.cases)) return false;
  const ids = result.cases.map((item) => item.nodeid);
  return ids.length === expected.length && new Set(ids).size === ids.length
    && expected.every((item) => ids.includes(item.nodeid))
    && result.cases.every((item) => ['setup', 'call', 'teardown'].every((phase) => item[phase]?.outcome === 'passed') && !item.xfail);
}
