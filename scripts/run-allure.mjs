import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const separator = process.argv.indexOf('--');
if (separator < 0 || separator === process.argv.length - 1) {
  console.error('Usage: node scripts/run-allure.mjs -- <pytest arguments>');
  process.exit(2);
}

const projectRoot = process.cwd();
const reportRoot = resolve(projectRoot, 'automation/reports');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = join(reportRoot, 'allure-results', runId);
const reportName = process.env.ALLURE_REPORT_NAME || 'allure-report';
if (!/^[A-Za-z0-9_.-]+$/.test(reportName)) {
  console.error('ALLURE_REPORT_NAME may contain only letters, numbers, dot, underscore, and dash.');
  process.exit(2);
}
const htmlDir = join(reportRoot, reportName);
mkdirSync(resultsDir, { recursive: true });

const pytest = spawnSync(
  'python3',
  ['-m', 'pytest', ...process.argv.slice(separator + 1), `--alluredir=${resultsDir}`],
  { cwd: projectRoot, env: process.env, stdio: 'inherit' },
);
const testExitCode = pytest.status ?? 1;

const resultFiles = readdirSync(resultsDir).filter((name) => name.endsWith('.json'));
if (resultFiles.length === 0) {
  console.error('No Allure results were produced; skipping HTML generation.');
  process.exit(testExitCode || 1);
}

const allureCli = resolve(projectRoot, 'node_modules/.bin/allure');
const report = spawnSync(
  allureCli,
  ['generate', resultsDir, '--clean', '-o', htmlDir],
  { cwd: projectRoot, env: process.env, stdio: 'inherit' },
);
const reportExitCode = report.status ?? 1;

console.log(`Allure HTML report: ${join(htmlDir, 'index.html')}`);
process.exit(testExitCode || reportExitCode);
