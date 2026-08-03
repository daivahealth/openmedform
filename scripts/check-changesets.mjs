#!/usr/bin/env node
/**
 * Validate the pending changesets against the workspace and the release config.
 *
 * `release.yml` runs only after merge, so a bad changeset fails on main rather
 * than on the PR that wrote it — the same after-merge-only blind spot that took
 * a deploy down. This catches the three ways a changeset goes wrong before it
 * can do that:
 *
 *   1. mixing a published package with an ignored one (changesets refuses the
 *      whole release plan, not just that entry);
 *   2. naming a package that does not exist, usually a typo or a rename;
 *   3. a bump that is not patch/minor/major.
 *
 * `changeset status` covers the first, but it diffs against `main` and so needs
 * full git history that CI's shallow clone does not have. This reads the files.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHANGESET_DIR = '.changeset';
const WORKSPACE_DIRS = ['apps', 'packages'];
const BUMPS = new Set(['patch', 'minor', 'major']);

function workspacePackages() {
  const names = new Set();
  for (const dir of WORKSPACE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(dir, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      if (name) names.add(name);
    }
  }
  return names;
}

/** The `"pkg": bump` lines between the opening and closing `---`. */
function parseFrontMatter(source) {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') return null;

  const end = lines.indexOf('---', 1);
  if (end === -1) return null;

  const entries = [];
  for (const line of lines.slice(1, end)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^["']?(@?[^"':]+)["']?\s*:\s*["']?([a-z]+)["']?$/.exec(trimmed);
    entries.push(match ? { name: match[1], bump: match[2] } : { raw: trimmed });
  }
  return entries;
}

const { ignore = [] } = JSON.parse(readFileSync(join(CHANGESET_DIR, 'config.json'), 'utf8'));
const ignored = new Set(ignore);
const known = workspacePackages();
const problems = [];

const files = existsSync(CHANGESET_DIR)
  ? readdirSync(CHANGESET_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
  : [];

for (const file of files) {
  const path = join(CHANGESET_DIR, file);
  const entries = parseFrontMatter(readFileSync(path, 'utf8'));

  if (!entries) {
    problems.push(`${path} — no \`---\` front matter block.`);
    continue;
  }

  for (const entry of entries) {
    if (entry.raw) {
      problems.push(`${path} — cannot parse front-matter line: ${entry.raw}`);
      continue;
    }
    if (!known.has(entry.name)) {
      problems.push(`${path} — "${entry.name}" is not a workspace package.`);
    }
    if (!BUMPS.has(entry.bump)) {
      problems.push(`${path} — "${entry.name}" has bump "${entry.bump}"; expected patch/minor/major.`);
    }
  }

  const named = entries.filter((e) => e.name).map((e) => e.name);
  const inRelease = named.filter((n) => !ignored.has(n));
  const outOfRelease = named.filter((n) => ignored.has(n));

  if (inRelease.length > 0 && outOfRelease.length > 0) {
    problems.push(
      `${path} — mixes published packages with ignored ones, which changesets refuses:\n` +
        `      published: ${inRelease.join(', ')}\n` +
        `      ignored:   ${outOfRelease.join(', ')}\n` +
        `      Drop the ignored ones; they ship with the merge but are not versioned.`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Found ${problems.length} changeset problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(
  files.length === 0
    ? 'No pending changesets.'
    : `${files.length} changeset${files.length === 1 ? '' : 's'}: front matter is valid.`,
);
