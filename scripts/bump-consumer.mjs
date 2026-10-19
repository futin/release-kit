#!/usr/bin/env node
// Opens, refreshes or skips one consumer's bump PR for one release, then closes that consumer's superseded bump PRs.
// The bump-consumers workflow runs it once per consumer, inside the consumer's checkout; spec Part 1 §Bump workflow, D10–D12.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['dependencies', 'devDependencies'];
const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

/** @param {string} v `vX.Y.Z` @returns {number[] | null} */
function parseVersion(v) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @param {number[]} a @param {number[]} b */
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class CommandError extends Error {}

/**
 * Rewrite one dependency's spec in package.json text without touching anything else: the section's object is located textually and the result is
 * checked against a parse of the original with only that one value changed, so formatting survives and a wrong match can never be written.
 */
function rewriteSpec(text, section, pkg, oldSpec, newSpec) {
  const expected = JSON.parse(text);
  expected[section][pkg] = newSpec;
  const sectionRe = new RegExp(`"${escapeRegExp(section)}"\\s*:\\s*\\{[^{}]*\\}`, 'g');
  const entryRe = new RegExp(`("${escapeRegExp(pkg)}"\\s*:\\s*)"${escapeRegExp(oldSpec)}"`);
  for (const m of text.matchAll(sectionRe)) {
    if (!entryRe.test(m[0])) continue;
    const replaced = m[0].replace(entryRe, (_, key) => `${key}${JSON.stringify(newSpec)}`);
    const candidate = text.slice(0, m.index) + replaced + text.slice(m.index + m[0].length);
    if (isDeepStrictEqual(JSON.parse(candidate), expected)) return candidate;
  }
  throw new Error(`could not rewrite ${section}.${pkg} in package.json in place`);
}

/**
 * @param {{ pkg: string, repository: string, consumer: string, version: string, versions?: string[], dir: string,
 *   run: (cmd: string, args: string[], opts?: { cwd?: string }) => Promise<{ code: number, stdout: string, stderr?: string }> }} o
 * @returns {Promise<{ outcome: 'pinned' | 'open' | 'closed' | 'missing' | 'opened', pr?: number, closed: number[], warning?: string }>}
 */
export async function bumpConsumer({ pkg, repository, consumer, version, versions = [version], dir, run, autoMerge = false }) {
  const target = parseVersion(version);
  if (!target) throw new Error(`VERSION must look like vX.Y.Z, got ${JSON.stringify(version)}`);
  const branch = `bump/${pkg}-${version}`;
  const spec = `github:${repository}#${version}`;

  const exec = async (cmd, args, opts = {}) => {
    const r = await run(cmd, args, { cwd: dir, ...opts });
    if (r.code === 0) return r.stdout;
    const detail = (r.stderr ?? '').trim();
    const line = `${cmd} ${args.join(' ')} failed (exit ${r.code})${detail ? `: ${detail}` : ''}`;
    if (cmd === 'gh' && /\b(401|403)\b|Bad credentials|authentication/i.test(detail)) {
      throw new CommandError(`${line}\nThe BUMP_TOKEN secret is missing, expired or not scoped to ${consumer}; renew it and re-run the job.`);
    }
    throw new CommandError(line);
  };
  const gh = async (args) => {
    const out = await exec('gh', args);
    return out.trim() ? JSON.parse(out) : [];
  };

  /** Close every open `bump/<pkg>-vX.Y.Z` PR below the newest version; runs on every path, so an interrupted run is repaired by the next. */
  const closeSuperseded = async (comment) => {
    const open = await gh(['pr', 'list', '--repo', consumer, '--state', 'open', '--limit', '200', '--json', 'number,headRefName']);
    const prefix = `bump/${pkg}-`;
    const closed = [];
    for (const pr of open) {
      if (!pr.headRefName.startsWith(prefix)) continue;
      const v = parseVersion(pr.headRefName.slice(prefix.length));
      if (!v || compare(v, target) >= 0) continue;
      await exec('gh', ['pr', 'close', String(pr.number), '--repo', consumer, '--comment', comment]);
      closed.push(pr.number);
    }
    return closed;
  };
  const supersededBy = (n) => `Superseded by #${n}, the bump of ${pkg} to ${version}.`;

  const pkgPath = path.join(dir, 'package.json');
  const text = readFileSync(pkgPath, 'utf8');
  const json = JSON.parse(text);
  const section = SECTIONS.find((s) => json[s] && typeof json[s][pkg] === 'string');

  if (!section) {
    const warning = `${consumer} does not depend on ${pkg} yet`;
    const closed = await closeSuperseded(`Superseded: ${pkg} ${version} is the newest release.`);
    return { outcome: 'missing', closed, warning };
  }
  const current = json[section][pkg];
  if (current === spec) {
    return { outcome: 'pinned', closed: await closeSuperseded(`Superseded: ${consumer} is already on ${version}.`) };
  }

  // Any PR from this branch, open or closed: open means it is already waiting, closed (merged or not) means a human has decided this version.
  const prs = await gh(['pr', 'list', '--repo', consumer, '--head', branch, '--state', 'all', '--json', 'number,state']);
  const openPr = prs.find((p) => p.state === 'OPEN');
  if (openPr) return { outcome: 'open', pr: openPr.number, closed: await closeSuperseded(supersededBy(openPr.number)) };
  if (prs.length > 0) return { outcome: 'closed', pr: prs[0].number, closed: await closeSuperseded(supersededBy(prs[0].number)) };

  // Nothing yet. The branch is deterministic and bot-owned, so a leftover one from a cancelled run is rebuilt and force-pushed.
  await exec('git', ['checkout', '-B', branch]);
  writeFileSync(pkgPath, rewriteSpec(text, section, pkg, current, spec));
  const files = ['package.json'];
  if (existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
    await exec('corepack', ['enable']);
    await exec('pnpm', ['install', '--lockfile-only']);
    files.push('pnpm-lock.yaml');
  } else if (existsSync(path.join(dir, 'package-lock.json'))) {
    await exec('npm', ['install', '--package-lock-only']);
    files.push('package-lock.json');
  }
  const title = `chore(deps): bump ${pkg} to ${version}`;
  await exec('git', ['add', ...files]);
  await exec('git', ['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, 'commit', '-m', title]);
  await exec('gh', ['auth', 'setup-git']);
  await exec('git', ['push', '--force', 'origin', branch]);

  // Every release above the current pin up to the new one; a pin that is not one of this repository's tags links the new release alone.
  const pinMatch = current.startsWith(`github:${repository}#`) ? parseVersion(current.slice(`github:${repository}#`.length)) : null;
  const linked = versions.filter((v) => {
    const p = parseVersion(v);
    return p && compare(p, target) <= 0 && (pinMatch ? compare(p, pinMatch) > 0 : compare(p, target) === 0);
  });
  const body = [
    `Bumps \`${pkg}\` from \`${current}\` to \`${spec}\`.`,
    '',
    'Releases in this bump:',
    ...linked.map((v) => `- https://github.com/${repository}/releases/tag/${v}`),
    '',
    `This PR is titled \`chore(deps)\`, which cuts no release of this app. If the bump changes something this app's users see, retitle it ` +
      "`fix(deps): …` or `feat(deps): …` and add a `## What's new` section before merging. To decline this version, close the PR unmerged.",
    '',
    ...(autoMerge
      ? [
          '**Auto-merge is on:** this PR squash-merges as soon as CI is green. To retitle it or decline this version, press **Disable auto-merge** ' +
            'first — this workflow never turns it back on.',
          '',
        ]
      : []),
    "**After merge:** the lockfile changed, so refresh your dev stack's `node_modules` the way this app's README says.",
  ].join('\n');
  const url = await exec('gh', ['pr', 'create', '--repo', consumer, '--head', branch, '--title', title, '--body', body]);
  const m = /\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error(`gh pr create printed no PR URL: ${url.trim()}`);
  const pr = Number(m[1]);
  const closed = await closeSuperseded(supersededBy(pr));
  // Only here, on the PR this run opened: an open PR found by a later run may have had auto-merge disabled by a human on purpose (to retitle it), and
  // re-enabling it would merge it out from under them. A refusal is a warning, not a failure — the PR exists and the consumer's CI still gates it; the
  // usual cause is the repo's "Allow auto-merge" setting being off.
  if (autoMerge) {
    const r = await run('gh', ['pr', 'merge', String(pr), '--repo', consumer, '--auto', '--squash'], { cwd: dir });
    if (r.code !== 0) {
      const detail = (r.stderr ?? '').trim();
      const warning =
        `${consumer}#${pr} was opened but auto-merge could not be enabled${detail ? ` (${detail})` : ''}; turn on "Allow auto-merge" in the repo's ` +
        'settings (scripts/apply-repo-settings.sh sets it) and merge this one by hand.';
      return { outcome: 'opened', pr, closed, warning };
    }
  }
  return { outcome: 'opened', pr, closed };
}

/** Launch a command, capturing stdout and stderr; stderr is also passed through so the job log shows it. */
function spawnRun(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    child.on('error', (e) => resolve({ code: 127, stdout, stderr: `${stderr}${e.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** The CLI: everything arrives through env, never argv or `${{ }}` (script injection); `dir` is the cwd. Returns the exit code. */
export async function main({ env = process.env, cwd = process.cwd(), run = spawnRun, log = console.log, error = console.error } = {}) {
  for (const name of ['PKG', 'REPOSITORY', 'CONSUMER', 'VERSION']) {
    if (!env[name]) {
      error(`${name} is not set; the bump-consumers workflow passes it through env`);
      return 1;
    }
  }
  if (!env.GH_TOKEN) {
    error('GH_TOKEN is not set; the workflow passes the BUMP_TOKEN secret as GH_TOKEN. Add or renew the BUMP_TOKEN secret.');
    return 1;
  }
  const versions = (env.VERSIONS ?? '').split(/\s+/).filter(Boolean);
  try {
    const r = await bumpConsumer({
      pkg: env.PKG,
      repository: env.REPOSITORY,
      consumer: env.CONSUMER,
      version: env.VERSION,
      versions: versions.length > 0 ? versions : [env.VERSION],
      dir: cwd,
      run,
      // Exactly 'true', the string a boolean workflow input renders to; anything else, unset included, leaves the PR for a human to merge.
      autoMerge: env.AUTO_MERGE === 'true',
    });
    if (r.warning) log(`::warning::${r.warning}`);
    log(`${env.CONSUMER}: ${r.outcome}${r.pr ? ` #${r.pr}` : ''}${r.closed.length ? `; closed superseded ${r.closed.map((n) => `#${n}`).join(', ')}` : ''}`);
    return 0;
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

function isMain() {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) process.exit(await main());
