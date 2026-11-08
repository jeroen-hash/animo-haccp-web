import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = 'scripts/restore-supabase-storage.mjs';

function run(projectRef, url) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_RECOVERY_PROJECT_REF: projectRef,
      SUPABASE_URL: url,
      SUPABASE_RECOVERY_SERVICE_ROLE_KEY: 'test-only-not-a-real-key',
      BACKUP_EXTRACT_DIR: '/tmp/animo-restore-guard-test-missing',
    },
  });
}

test('refuses production and historical Supabase projects', () => {
  for (const ref of ['zimzsovvtdmrthrflkgm', 'xwjcwravfeldndwlugai']) {
    const result = run(ref, 'https://' + ref + '.supabase.co');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing restore/);
  }
});

test('refuses a URL that does not match the explicitly configured recovery project', () => {
  const result = run('abcdefghijklmnopqrst', 'https://xwjcwravfeldndwlugai.supabase.co');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing restore/);
});

test('accepts only a distinct project reference and matching URL before reading the backup', () => {
  const ref = 'abcdefghijklmnopqrst';
  const result = run(ref, 'https://' + ref + '.supabase.co');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest\.json/);
  assert.doesNotMatch(result.stderr, /Refusing restore/);
});
