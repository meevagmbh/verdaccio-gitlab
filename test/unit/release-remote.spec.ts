import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// scripts/release.sh pushes the release commit and tag to the remote that
// scripts/release-remote.sh names. In a clone where `origin` is the upstream
// project, a fixed `origin` would push the release to the wrong repository.

const SCRIPT = path.resolve(__dirname, '../../scripts/release-remote.sh');
const REPOSITORY = 'https://github.com/meevagmbh/verdaccio-gitlab.git';

function checkout(remotes: Record<string, string>, repositoryUrl: string = REPOSITORY): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-remote-'));
  execFileSync('git', ['init', '-q', dir]);
  for (const [name, url] of Object.entries(remotes)) {
    execFileSync('git', ['-C', dir, 'remote', 'add', name, url]);
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ repository: { type: 'git', url: repositoryUrl } }));
  return dir;
}

function releaseRemote(dir: string) {
  const result = spawnSync('sh', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}

describe('scripts/release-remote.sh', () => {
  test('names the remote of package.json#repository, not origin', () => {
    const dir = checkout({
      origin: 'https://github.com/bufferoverflow/verdaccio-gitlab.git',
      meeva: 'https://github.com/meevagmbh/verdaccio-gitlab.git',
    });

    expect(releaseRemote(dir)).toMatchObject({ status: 0, stdout: 'meeva' });
  });

  test('matches an ssh remote url against an https repository url', () => {
    const dir = checkout({ fork: 'git@github.com:meevagmbh/verdaccio-gitlab.git' });

    expect(releaseRemote(dir)).toMatchObject({ status: 0, stdout: 'fork' });
  });

  test('matches a remote url without .git and in other letter case', () => {
    const dir = checkout({ origin: 'https://github.com/MeevaGmbH/verdaccio-gitlab' });

    expect(releaseRemote(dir)).toMatchObject({ status: 0, stdout: 'origin' });
  });

  test('fails when no remote points to the repository', () => {
    const dir = checkout({ origin: 'https://github.com/bufferoverflow/verdaccio-gitlab.git' });

    const result = releaseRemote(dir);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/no git remote points to github\.com\/meevagmbh\/verdaccio-gitlab/);
  });

  test('fails when two remotes point to the repository', () => {
    const dir = checkout({
      origin: 'https://github.com/meevagmbh/verdaccio-gitlab.git',
      meeva: 'git@github.com:meevagmbh/verdaccio-gitlab.git',
    });

    const result = releaseRemote(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/several git remotes point to .*: meeva origin/);
  });
});
