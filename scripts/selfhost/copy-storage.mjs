#!/usr/bin/env node
// =============================================================================
// copy-storage.mjs — copy every Storage bucket + file from the hosted project
//                    to the self-hosted one (the SQL dump carries only metadata).
//
//   Run from the repo root (it uses the repo's @supabase/supabase-js):
//     node --env-file=.env.storage-copy _fix-delivery-2026-09-20/backup/copy-storage.mjs --dry-run
//     node --env-file=.env.storage-copy _fix-delivery-2026-09-20/backup/copy-storage.mjs
//     node --env-file=.env.storage-copy _fix-delivery-2026-09-20/backup/copy-storage.mjs --bucket documents
//     node --env-file=.env.storage-copy _fix-delivery-2026-09-20/backup/copy-storage.mjs --verify
//
//   .env.storage-copy (git-ignored: add it to .git/info/exclude; never paste it in chat):
//     OLD_SUPABASE_URL=https://gdqfqfcxnwrwgaphtfhu.supabase.co
//     OLD_SERVICE_ROLE_KEY=...            (hosted project: Project Settings -> API -> service_role)
//     NEW_SUPABASE_URL=https://supabase.example.com   (the self-host API URL, i.e. Kong)
//     NEW_SERVICE_ROLE_KEY=...            (self-host .env SERVICE_ROLE_KEY)
//
//   * Buckets missing on the target are created with the same public flag / size limit / MIME list.
//   * Files already present on the target are skipped (re-runnable); --overwrite re-uploads them.
//   * Failures are written to copy-storage-failures.json next to the script; re-run to retry.
//   * Uses the service_role key on both sides ON PURPOSE: this is an admin migration script, not app code.
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const DRY_RUN = flag('--dry-run');
const VERIFY_ONLY = flag('--verify');
const OVERWRITE = flag('--overwrite');
const ONLY_BUCKET = opt('--bucket');
const CONCURRENCY = Number(opt('--concurrency') ?? 4);

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k} (see the header of this script)`); process.exit(2); } return v; };
const OLD_URL = need('OLD_SUPABASE_URL');
const OLD_KEY = need('OLD_SERVICE_ROLE_KEY');
const NEW_URL = need('NEW_SUPABASE_URL');
const NEW_KEY = need('NEW_SERVICE_ROLE_KEY');
if (!/^https:\/\//.test(NEW_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(NEW_URL)) {
  console.error('NEW_SUPABASE_URL must be https:// (plain http is only accepted for localhost)'); process.exit(2);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const oldMeta = createClient(OLD_URL, OLD_KEY, { ...noSession, db: { schema: 'storage' } });
const newMeta = createClient(NEW_URL, NEW_KEY, { ...noSession, db: { schema: 'storage' } });
const oldApi = createClient(OLD_URL, OLD_KEY, noSession);
const newApi = createClient(NEW_URL, NEW_KEY, noSession);

async function listObjects(client, label) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = client.from('objects').select('id,bucket_id,name,metadata').order('id', { ascending: true }).range(from, from + page - 1);
    if (ONLY_BUCKET) q = q.eq('bucket_id', ONLY_BUCKET);
    const { data, error } = await q;
    if (error) throw new Error(`${label}: cannot read storage.objects — ${error.message}`);
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

async function listBuckets(client, label) {
  const { data, error } = await client.from('buckets').select('id,name,public,file_size_limit,allowed_mime_types').order('id');
  if (error) throw new Error(`${label}: cannot read storage.buckets — ${error.message}`);
  return ONLY_BUCKET ? data.filter((b) => b.id === ONLY_BUCKET) : data;
}

function summarize(objects) {
  const per = new Map();
  for (const o of objects) per.set(o.bucket_id, (per.get(o.bucket_id) ?? 0) + 1);
  return per;
}

const oldBuckets = await listBuckets(oldMeta, 'OLD');
const oldObjects = await listObjects(oldMeta, 'OLD');
const newBuckets = await listBuckets(newMeta, 'NEW');
const newObjects = await listObjects(newMeta, 'NEW');
const oldPer = summarize(oldObjects);
const newPer = summarize(newObjects);

console.log(`OLD: ${oldBuckets.length} bucket(s), ${oldObjects.length} object(s)`);
console.log(`NEW: ${newBuckets.length} bucket(s), ${newObjects.length} object(s)`);
for (const b of oldBuckets) {
  console.log(`  ${b.id.padEnd(24)} old=${String(oldPer.get(b.id) ?? 0).padStart(6)}  new=${String(newPer.get(b.id) ?? 0).padStart(6)}  public=${b.public}`);
}
if (VERIFY_ONLY) {
  const missing = oldObjects.filter((o) => !newObjects.some((n) => n.bucket_id === o.bucket_id && n.name === o.name));
  console.log(missing.length === 0 ? 'VERIFY OK — every OLD object exists on NEW' : `VERIFY: ${missing.length} object(s) missing on NEW`);
  for (const m of missing.slice(0, 50)) console.log(`   missing: ${m.bucket_id}/${m.name}`);
  process.exit(missing.length === 0 ? 0 : 1);
}

// ---- buckets ---------------------------------------------------------------------
for (const b of oldBuckets) {
  if (newBuckets.some((n) => n.id === b.id)) continue;
  console.log(`${DRY_RUN ? '[dry-run] would create' : 'creating'} bucket ${b.id} (public=${b.public})`);
  if (DRY_RUN) continue;
  const { error } = await newApi.storage.createBucket(b.id, {
    public: !!b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  });
  if (error) throw new Error(`NEW: cannot create bucket ${b.id} — ${error.message}`);
}

// ---- objects ---------------------------------------------------------------------
const present = new Set(newObjects.map((n) => `${n.bucket_id}\u0000${n.name}`));
const todo = oldObjects.filter((o) => OVERWRITE || !present.has(`${o.bucket_id}\u0000${o.name}`));
console.log(`${todo.length} object(s) to copy (${oldObjects.length - todo.length} already on NEW)`);
if (DRY_RUN) { console.log('[dry-run] nothing uploaded'); process.exit(0); }

const failures = [];
let done = 0;
async function copyOne(o) {
  const { data: blob, error: dlErr } = await oldApi.storage.from(o.bucket_id).download(o.name);
  if (dlErr) throw new Error(`download: ${dlErr.message}`);
  const meta = o.metadata ?? {};
  const cache = typeof meta.cacheControl === 'string' ? meta.cacheControl.replace(/^max-age=/, '') : '3600';
  const { error: upErr } = await newApi.storage.from(o.bucket_id).upload(o.name, blob, {
    contentType: meta.mimetype || 'application/octet-stream',
    cacheControl: cache,
    upsert: true,
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
}
async function worker(queue) {
  for (;;) {
    const o = queue.shift();
    if (!o) return;
    try {
      await copyOne(o);
    } catch (e) {
      failures.push({ bucket: o.bucket_id, name: o.name, error: String(e.message ?? e) });
      console.error(`  FAIL ${o.bucket_id}/${o.name}: ${e.message ?? e}`);
    }
    done += 1;
    if (done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length} (${failures.length} failed)`);
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker(queue)));

const here = dirname(fileURLToPath(import.meta.url));
if (failures.length) {
  const f = join(here, 'copy-storage-failures.json');
  writeFileSync(f, JSON.stringify(failures, null, 2));
  console.log(`${failures.length} failure(s) written to ${f} — fix the cause and re-run (already-copied files are skipped)`);
  process.exit(1);
}
console.log('copy complete — run again with --verify to compare both sides');
