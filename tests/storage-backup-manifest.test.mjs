import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifier = path.join(root, 'scripts', 'verify-storage-backup.mjs');

function runVerifier(manifest, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'animo-backup-'));
  try {
    for (const [name, bytes] of Object.entries(files)) {
      const file = path.join(dir, ...name.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
    return spawnSync(process.execPath, [verifier], {
      encoding: 'utf8',
      env: { ...process.env, BACKUP_EXTRACT_DIR: dir },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts all discovered buckets, including an empty bucket', () => {
  const bytes = Buffer.from('private onboarding file');
  const manifest = {
    format: 1,
    project: 'zimzsovvtdmrthrflkgm',
    buckets: ['onboarding-documents', 'onboarding-lead-documents', 'new-future-bucket'],
    bucketCount: 3,
    objectCount: 1,
    objects: [{
      bucket: 'onboarding-documents',
      path: 'business/file.pdf',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }],
  };
  const result = runVerifier(manifest, { 'onboarding-documents/business/file.pdf': bytes });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('accepts a valid inventory when every bucket is empty', () => {
  const result = runVerifier({
    format: 1,
    project: 'zimzsovvtdmrthrflkgm',
    buckets: ['onboarding-documents'],
    bucketCount: 1,
    objectCount: 0,
    objects: [],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('rejects an object in a bucket missing from the manifest inventory', () => {
  const bytes = Buffer.from('x');
  const result = runVerifier({
    format: 1,
    project: 'zimzsovvtdmrthrflkgm',
    buckets: ['onboarding-documents'],
    bucketCount: 1,
    objectCount: 1,
    objects: [{
      bucket: 'unlisted-bucket',
      path: 'file.txt',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }],
  }, { 'unlisted-bucket/file.txt': bytes });
  assert.notEqual(result.status, 0);
});

test('rejects unsafe bucket names and duplicate inventory entries', () => {
  const unsafe = runVerifier({
    format: 1,
    project: 'zimzsovvtdmrthrflkgm',
    buckets: ['../escape'],
    bucketCount: 1,
    objectCount: 0,
    objects: [],
  });
  assert.notEqual(unsafe.status, 0);

  const duplicate = runVerifier({
    format: 1,
    project: 'zimzsovvtdmrthrflkgm',
    buckets: ['onboarding-documents', 'onboarding-documents'],
    bucketCount: 2,
    objectCount: 0,
    objects: [],
  });
  assert.notEqual(duplicate.status, 0);
});
