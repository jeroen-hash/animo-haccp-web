import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.env.BACKUP_EXTRACT_DIR || 'storage-backup-restore-check');
const manifestPath = path.join(root, 'manifest.json');
const allowedBuckets = new Set(['onboarding-lead-documents', 'onboarding-documents']);

const manifestStat = await fs.lstat(manifestPath).catch(() => null);
if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) {
  throw new Error('manifest.json is missing or is not a regular file.');
}

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.format !== 1 || manifest.project !== 'zimzsovvtdmrthrflkgm') {
  throw new Error('Backup manifest format or Supabase project ID is unexpected.');
}
if (!Array.isArray(manifest.objects) || !Number.isInteger(manifest.objectCount) ||
    manifest.objectCount !== manifest.objects.length || manifest.objectCount < 1) {
  throw new Error('Backup manifest object count is invalid.');
}

const seen = new Set();
for (const item of manifest.objects) {
  if (!item || !allowedBuckets.has(item.bucket) || typeof item.path !== 'string' ||
      item.path.length === 0 || item.path.startsWith('/') || item.path.includes('\\') ||
      item.path.split('/').some(part => !part || part === '.' || part === '..') ||
      !Number.isInteger(item.size) || item.size < 0 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)) {
    throw new Error('Backup manifest contains an invalid object entry.');
  }

  const identity = item.bucket + '/' + item.path;
  if (seen.has(identity)) throw new Error('Backup manifest contains a duplicate object path.');
  seen.add(identity);

  const filePath = path.resolve(root, item.bucket, ...item.path.split('/'));
  if (!filePath.startsWith(root + path.sep)) throw new Error('Manifest path escapes extraction directory.');

  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error('A backed-up object is missing or is not a regular file: ' + identity);
  }
  if (stat.size !== item.size) {
    throw new Error('Object size mismatch: ' + identity);
  }

  const hash = crypto.createHash('sha256');
  const bytes = await fs.readFile(filePath);
  hash.update(bytes);
  if (hash.digest('hex') !== item.sha256) {
    throw new Error('Object SHA-256 mismatch: ' + identity);
  }
}

console.log('Verified ' + manifest.objects.length + ' restored object(s): every file exists and matches its recorded size and SHA-256 hash.');
