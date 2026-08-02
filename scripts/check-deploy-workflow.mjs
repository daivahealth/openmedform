#!/usr/bin/env node
/**
 * Validate the `secrets:` and `env_vars:` blocks in the deploy workflow.
 *
 * Both are YAML block scalars that deploy-cloudrun splits line by line into
 * `KEY=value` pairs. They look like YAML, so a `#` line reads like a comment —
 * it is not. It becomes an entry named `# ...` and gcloud rejects the deploy.
 *
 * That failure only appears after merge, during a real deploy, with production
 * left on the previous revision. Cheap to catch here instead.
 *
 * Deliberately dependency-free (no YAML parser): it runs before anything is
 * built, and the blocks it reads are literal text anyway.
 */

import { readFileSync } from 'node:fs';

const WORKFLOW = '.github/workflows/deploy.yml';
// `NAME=SECRET:version` — version is `latest` or an integer, never omitted.
const PATTERNS = {
  secrets: /^[A-Z][A-Z0-9_]*=[A-Za-z0-9_-]+:(latest|\d+)$/,
  env_vars: /^[A-Z][A-Z0-9_]*=\S*$/,
};

const lines = readFileSync(WORKFLOW, 'utf8').split('\n');
const problems = [];

for (let i = 0; i < lines.length; i++) {
  const header = /^(\s*)(secrets|env_vars):\s*\|\s*$/.exec(lines[i]);
  if (!header) continue;

  const [, indent, key] = header;
  // The scalar runs until a line indented no deeper than its key.
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() && !line.startsWith(indent + ' ')) break;

    const entry = line.trim();
    if (!entry || PATTERNS[key].test(entry)) continue;

    problems.push(
      entry.startsWith('#')
        ? `${WORKFLOW}:${j + 1} — a comment inside the \`${key}:\` block is ` +
          `not a comment; it becomes an entry. Move it above the key.\n      ${entry}`
        : `${WORKFLOW}:${j + 1} — malformed \`${key}:\` entry.\n      ${entry}`,
    );
  }
}

if (problems.length) {
  const s = problems.length === 1 ? 'y' : 'ies';
  console.error(`Found ${problems.length} bad deploy entr${s}:\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  process.exit(1);
}

console.log(`${WORKFLOW}: secrets and env_vars entries are well-formed.`);
