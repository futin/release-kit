import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type TestRepo = {
  dir: string;
  origin?: string;
  commit(subject: string): string;
  tag(name: string, sha: string, message?: string): void;
  setOrigin(url: string): void;
  cleanup(): void;
};

// The developer's own git config (signing, hooks path, default branch) must not leak into a fixture.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const run = (cwd: string, args: string[], input?: string): string => execFileSync('git', args, { cwd, env: ENV, input, encoding: 'utf8' }).trim();

/** A throwaway repo under os.tmpdir(). `bareOrigin` also creates a bare repo there and wires it as `origin`, so a test can push tags to it. */
export function makeRepo(o: { bareOrigin?: boolean } = {}): TestRepo {
  const dir = mkdtempSync(join(tmpdir(), 'release-kit-repo-'));
  const dirs = [dir];
  run(dir, ['init', '-q', '-b', 'main']);
  run(dir, ['config', 'user.name', 'Test User']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'commit.gpgsign', 'false']);
  run(dir, ['config', 'tag.gpgsign', 'false']);

  const repo: TestRepo = {
    dir,
    commit(subject) {
      run(dir, ['commit', '-q', '--allow-empty', '-m', subject]);
      return run(dir, ['rev-parse', 'HEAD']);
    },
    tag(name, sha, message) {
      // The message goes through stdin so a multi-line body with `#` lines reaches git untouched; --cleanup=verbatim keeps it that way.
      if (message === undefined) run(dir, ['tag', name, sha]);
      else run(dir, ['tag', '-a', name, sha, '--cleanup=verbatim', '-F', '-'], message);
    },
    setOrigin(url) {
      const has = run(dir, ['remote']).split('\n').includes('origin');
      run(dir, ['remote', has ? 'set-url' : 'add', 'origin', url]);
    },
    cleanup() {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    },
  };

  if (o.bareOrigin) {
    const bare = mkdtempSync(join(tmpdir(), 'release-kit-origin-'));
    dirs.push(bare);
    run(bare, ['init', '-q', '--bare', '-b', 'main']);
    repo.origin = bare;
    repo.setOrigin(bare);
  }
  return repo;
}
