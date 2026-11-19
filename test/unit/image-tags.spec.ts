import { spawnSync } from 'child_process';
import path from 'path';

// The release workflow pushes the image under every tag that
// scripts/image-tags.sh prints for the released version.

const SCRIPT = path.resolve(__dirname, '../../scripts/image-tags.sh');

function imageTags(version: string) {
  const result = spawnSync('sh', [SCRIPT, version], { encoding: 'utf8' });
  return { status: result.status, tags: result.stdout.trim().split('\n').filter(Boolean), stderr: result.stderr };
}

describe('scripts/image-tags.sh', () => {
  test('tags a release with its version, minor, major and latest', () => {
    expect(imageTags('4.1.0')).toMatchObject({ status: 0, tags: ['4.1.0', '4.1', '4', 'latest'] });
  });

  test('tags a prerelease with its exact version only', () => {
    expect(imageTags('4.1.0-rc.1')).toMatchObject({ status: 0, tags: ['4.1.0-rc.1'] });
  });

  test('rejects a version that is not semver', () => {
    const result = imageTags('v4.1');

    expect(result.status).not.toBe(0);
    expect(result.tags).toEqual([]);
    expect(result.stderr).toMatch(/not a semver version: v4\.1/);
  });
});
