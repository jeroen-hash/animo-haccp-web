import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_RECOVERY_SERVICE_ROLE_KEY;
const root = path.resolve(process.env.BACKUP_EXTRACT_DIR || 'storage-backup-restore');

if (!supabaseUrl || !serviceKey) {
  throw new Error('Recovery Supabase URL or recovery service key is missing.');
}

const allowedBuckets = new Set(['onboarding-documents', 'onboarding-lead-documents']);
const mimeByExtension = new Map([
  ['.pdf', 'application/pdf'],
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

const headers = {
  apikey: serviceKey,
  Authorization: 'Bearer ' + serviceKey,
};

const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

if (manifest.format !== 1 || manifest.project !== 'zimzsovvtdmrthrflkgm') {
  throw new Error('Backup manifest is not from the expected ANIMO production project.');
}
if (!Array.isArray(manifest.buckets) ||
    manifest.buckets.length !== allowedBuckets.size ||
    manifest.buckets.some(name => !allowedBuckets.has(name)) ||
    new Set(manifest.buckets).size !== manifest.buckets.length ||
    !Array.isArray(manifest.objects) ||
    manifest.objectCount !== manifest.objects.length) {
  throw new Error('Backup manifest bucket or object inventory is not the expected ANIMO set.');
}

for (const bucketName of manifest.buckets) {
  const response = await fetch(
    supabaseUrl + '/storage/v1/bucket/' + encodeURIComponent(bucketName),
    { headers },
  );
  if (!response.ok) {
    throw new Error('Recovery bucket is missing or inaccessible: ' + bucketName + ' (HTTP ' + response.status + ').');
  }
  const bucket = await response.json();
  if (bucket.public !== false) {
    throw new Error('Refusing to restore into a public bucket: ' + bucketName);
  }
}

let restored = 0;
for (const item of manifest.objects) {
  if (!item || !allowedBuckets.has(item.bucket) ||
      typeof item.path !== 'string' || !item.path ||
      item.path.startsWith('/') || item.path.includes('\\') ||
      item.path.split('/').some(part => !part || part === '.' || part === '..') ||
      !Number.isInteger(item.size) || item.size < 0 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)) {
    throw new Error('Backup manifest contains an invalid object entry.');
  }

  const filePath = path.resolve(root, item.bucket, ...item.path.split('/'));
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error('Refusing an object path outside the verified backup folder.');
  }

  const bytes = await fs.readFile(filePath);
  if (bytes.length !== item.size) {
    throw new Error('Object size mismatch before upload: ' + item.bucket + '/' + item.path);
  }
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== item.sha256) {
    throw new Error('Object SHA-256 mismatch before upload: ' + item.bucket + '/' + item.path);
  }

  const extension = path.extname(item.path).toLowerCase();
  const contentType = mimeByExtension.get(extension);
  if (!contentType) {
    throw new Error('Unsupported file type in backup: ' + item.path);
  }

  const objectUrl = supabaseUrl + '/storage/v1/object/' +
    encodeURIComponent(item.bucket) + '/' +
    item.path.split('/').map(encodeURIComponent).join('/');

  const response = await fetch(objectUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  });

  if (!response.ok) {
    throw new Error('Storage restore failed for ' + item.bucket + '/' + item.path +
      ' (HTTP ' + response.status + ').');
  }

  restored += 1;
  console.log('Restored verified object ' + restored + '/' + manifest.objectCount +
    ': ' + item.bucket + '/' + item.path);
}

console.log('Recovery Storage restore completed: ' + restored + ' verified object(s) uploaded.');
