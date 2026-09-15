#!/usr/bin/env node
/**
 * Turn `pnpm audit` findings into pnpm overrides — the nightly audit's fixer.
 *
 * Why this exists: the production audit used to run in CI as a merge gate,
 * and it went red three times in one day with no code change, because
 * advisories are published against whatever the registry says TODAY. Blocking
 * every PR on that is noise; ignoring it is worse. So the audit runs nightly
 * (.github/workflows/audit.yml), this script proposes the fix, and the
 * workflow opens a PR that CI then builds and tests like any other.
 *
 * What it does, per high/critical advisory:
 *   - reads the version actually installed and the advisory's patched range;
 *   - picks a patched version WITHIN THE SAME MAJOR (checked against the npm
 *     registry) and writes a scoped override, e.g. `"js-yaml@3": "^3.15.2"`.
 *     Scoping is the lesson of #181: an unscoped floor happily jumps a major
 *     and breaks a consumer (js-yaml 4 dropped `safeLoad`);
 *   - when no patched version exists in that major, or the package is a DIRECT
 *     dependency of a workspace package (a pin to bump by hand, e.g. `next`),
 *     it records the finding as manual work instead of guessing.
 *
 * Output: `package.json` overrides updated in place (unless --dry-run), and a
 * Markdown report on stdout for the PR body. Exit code 0 when every high+
 * finding got an override, 1 when any needs a human.
 *
 *   pnpm audit --prod --audit-level=high --json > audit.json || true
 *   node scripts/audit-fix.mjs --input audit.json [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = args.includes('--dry-run');
const INPUT = opt('--input');
const BLOCKING = new Set(['high', 'critical']);

// --- tiny semver (enough for x.y.z comparisons; no dependency at the root) ---

function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
/** Lowest version in `patchedRange` ("|| "-separated ">=x.y.z" clauses) with the given major. */
function patchedFloorForMajor(patchedRange, major) {
  const floors = String(patchedRange)
    .split('||')
    .map((c) => /(?:>=|\^|~)?\s*(\d+\.\d+\.\d+)/.exec(c)?.[1])
    .filter(Boolean)
    .map(parse)
    .filter((p) => p && p[0] === major);
  if (floors.length === 0) return null;
  return floors.sort(cmp)[0];
}
/** Does the registry have a version >= floor within the same major? Returns the highest such. */
function registryHas(pkg, floor) {
  let versions;
  try {
    versions = JSON.parse(execFileSync('npm', ['view', pkg, 'versions', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
  const ok = (Array.isArray(versions) ? versions : [versions])
    .map(parse)
    .filter((p) => p && p[0] === floor[0] && cmp(p, floor) >= 0)
    .sort(cmp);
  return ok.length ? ok[ok.length - 1] : null;
}

// --- direct dependencies of workspace packages: pins a human bumps ----------

function directDependencies() {
  const direct = new Map(); // name -> [manifest paths]
  const add = (manifest) => {
    if (!existsSync(manifest)) return;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (!direct.has(name)) direct.set(name, []);
        direct.get(name).push(manifest);
      }
    }
  };
  add('package.json');
  for (const dir of ['apps', 'packages']) {
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) add(join(dir, e.name, 'package.json'));
    }
  }
  return direct;
}

// --- main -------------------------------------------------------------------

const raw = INPUT ? readFileSync(INPUT, 'utf8') : readFileSync(0, 'utf8');
const audit = raw.trim() ? JSON.parse(raw) : { advisories: {} };
const advisories = Object.values(audit.advisories ?? {}).filter((a) => BLOCKING.has(a.severity));

const rootPath = 'package.json';
const root = JSON.parse(readFileSync(rootPath, 'utf8'));
root.pnpm ??= {};
root.pnpm.overrides ??= {};
const direct = directDependencies();

const fixed = [];
const manual = [];
const seen = new Set();

for (const a of advisories) {
  const name = a.module_name;
  const installed = [...new Set((a.findings ?? []).map((f) => f.version))];
  for (const version of installed) {
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const v = parse(version);
    const line = {
      name,
      version,
      severity: a.severity,
      title: a.title,
      url: a.url,
      vulnerable: a.vulnerable_versions,
      patched: a.patched_versions,
    };
    if (direct.has(name)) {
      manual.push({ ...line, reason: `direct dependency in ${direct.get(name).join(', ')} — bump the pin` });
      continue;
    }
    const floor = v && patchedFloorForMajor(a.patched_versions, v[0]);
    if (!floor) {
      manual.push({ ...line, reason: `no patched release in the ${v ? v[0] : '?'}.x line — needs a major upgrade of the consumer` });
      continue;
    }
    const available = registryHas(name, floor);
    if (!available) {
      manual.push({ ...line, reason: `registry has no ${floor.join('.')} or later in the ${floor[0]}.x line` });
      continue;
    }
    const overrideKey = `${name}@${v[0]}`;
    const overrideValue = `^${floor.join('.')}`;
    if (root.pnpm.overrides[overrideKey] === overrideValue) {
      manual.push({ ...line, reason: `override ${overrideKey}: ${overrideValue} already present but the finding persists — check the lockfile` });
      continue;
    }
    root.pnpm.overrides[overrideKey] = overrideValue;
    fixed.push({ ...line, override: `"${overrideKey}": "${overrideValue}"` });
  }
}

if (!DRY && fixed.length > 0) {
  writeFileSync(rootPath, JSON.stringify(root, null, 2) + '\n');
}

// --- report -----------------------------------------------------------------

const out = [];
if (fixed.length === 0 && manual.length === 0) {
  out.push('No high or critical findings. Nothing to do.');
} else {
  if (fixed.length) {
    out.push('### Fixed by scoped overrides', '', '| Package | Installed | Severity | Advisory | Override |', '|---|---|---|---|---|');
    for (const f of fixed) out.push(`| ${f.name} | ${f.version} | ${f.severity} | [${f.title}](${f.url}) | \`${f.override}\` |`);
    out.push('');
  }
  if (manual.length) {
    out.push('### Needs a human', '', '| Package | Installed | Severity | Advisory | Why |', '|---|---|---|---|---|');
    for (const m of manual) out.push(`| ${m.name} | ${m.version} | ${m.severity} | [${m.title}](${m.url}) | ${m.reason} |`);
    out.push('');
  }
  out.push(
    'Overrides are scoped to the installed major (`pkg@N`) so a floor never jumps a major and breaks a consumer.',
    DRY ? '_Dry run: package.json not written._' : '',
  );
}
process.stdout.write(out.filter((l) => l !== undefined).join('\n') + '\n');
process.exitCode = manual.length > 0 ? 1 : 0;
