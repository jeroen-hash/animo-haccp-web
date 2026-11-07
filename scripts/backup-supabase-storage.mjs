import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDir = process.env.BACKUP_OUTPUT_DIR || 'storage-backup';
const pageSize = 1000;

if (!supabaseUrl || !serviceKey) {
  throw new Error('Required Supabase environment variables are missing.');
}

const headers = {
  apikey: serviceKey,
  Authorization: 'Bearer ' + serviceKey,
};

async function listBuckets() {
  const response = await fetch(supabaseUrl + '/storage/v1/bucket', { headers });
  if (!response.ok) throw new Error('Supabase Storage bucket inventory failed (HTTP ' + response.status + ').');
  const result = await response.json();
  if (!Array.isArray(result)) throw new Error('Unexpected Supabase Storage bucket inventory response.');
  const names = result.map(bucket => String(bucket?.name || bucket?.id || '')).sort();
  if (names.length === 0 || names.some(name => !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(name))) {
    throw new Error('Storage bucket inventory is empty or contains an unsafe bucket name.');
  }
  if (new Set(names).size !== names.length) throw new Error('Storage bucket inventory contains duplicate names.');
  return names;
}

async function listPage(bucket, prefix, offset) {
  const response = await fetch(supabaseUrl + '/storage/v1/object/list/' + encodeURIComponent(bucket), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix,
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    }),
  });
  if (!response.ok) {
    throw new Error('Supabase Storage listing failed for bucket ' + bucket + ' (HTTP ' + response.status + ').');
  }
  return response.json();
}

async function listAll(bucket, prefix = '') {
  const found = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listPage(bucket, prefix, offset);
    if (!Array.isArray(page)) throw new Error('Unexpected Storage listing response for bucket ' + bucket + '.');
    found.push(...page);
    if (page.length < pageSize) break;
  }
  return found;
}

function safeDestination(bucket, objectPath) {
  const destination = path.resolve(outputDir, bucket, ...objectPath.split('/'));
  const root = path.resolve(outputDir) + path.sep;
  if (!destination.startsWith(root)) throw new Error('Unsafe object path returned by Storage.');
  return destination;
}

async function discoverAndDownload(bucket, prefix = '', seenFolders = new Set(), manifest = []) {
  const entries = await listAll(bucket, prefix);
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || entry.name === '.' || entry.name === '..' || entry.name.includes('\\')) {
      throw new Error('Storage returned an invalid object name.');
    }
    const objectPath = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.id === null) {
      if (seenFolders.has(objectPath)) continue;
      seenFolders.add(objectPath);
      await discoverAndDownload(bucket, objectPath, seenFolders, manifest);
      continue;
    }

    const response = await fetch(
      supabaseUrl + '/storage/v1/object/authenticated/' +
      encodeURIComponent(bucket) + '/' +
      objectPath.split('/').map(encodeURIComponent).join('/'),
      { headers },
    );
    if (!response.ok) {
      throw new Error('Supabase Storage download failed for an object in ' + bucket + ' (HTTP ' + response.status + ').');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const destination = safeDestination(bucket, objectPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });

    manifest.push({
      bucket,
      path: objectPath,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return manifest;
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

const buckets = await listBuckets();
console.log('Discovered ' + buckets.length + ' Storage bucket(s): ' + buckets.join(', '));
const manifest = [];
for (const bucket of buckets) {
  await discoverAndDownload(bucket, '', new Set(), manifest);
}

manifest.sort((a, b) => (a.bucket + '/' + a.path).localeCompare(b.bucket + '/' + b.path));
await fs.writeFile(
  path.join(outputDir, 'manifest.json'),
  JSON.stringify({
    format: 1,
    createdAt: new Date().toISOString(),
    project: 'zimzsovvtdmrthrflkgm',
    buckets,
    bucketCount: buckets.length,
    objectCount: manifest.length,
    objects: manifest,
  }, null, 2) + '\n',
  { mode: 0o600 },
);

console.log('Storage backup source collection completed. Bucket count: ' + buckets.length + '; object count: ' + manifest.length);
