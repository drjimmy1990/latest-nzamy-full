#!/usr/bin/env node
// =============================================================================
// copy-reference-data.mjs — copy REFERENCE / CATALOG rows (never user data)
//                           from the old hosted (cloud) Supabase project to the
//                           self-hosted one.
//
// Why: the self-hosted database was restored from a SCHEMA-ONLY dump
// (scripts/selfhost/run4_delivery/01-schema.sql). Catalog rows that migrations
// INSERTed on cloud never reached it (service price catalog, blog sections,
// jurisdictions, statutory deadline rules, court holidays, two platform
// settings). Old users are NOT migrated (clean start), so nothing that belongs
// to a user is copied.
//
// Run from the repo root:
//   node scripts/selfhost/copy-reference-data.mjs                 # DRY-RUN (default)
//   node scripts/selfhost/copy-reference-data.mjs --execute       # write missing rows
//
// Options:
//   --source-env <file>       cloud env file (default .env.local.backup-2026-09-24)
//   --target-env <file>       self-hosted env file (default .env.local)
//   --execute                 actually write to the TARGET (never to the source)
//   --overwrite               rows present on both sides but different: update the
//                             target from the source (default: show the diff only)
//   --overwrite-settings      same, for platform_settings (never touched otherwise,
//                             not even with --overwrite)
//   --with-coupons            also copy public.coupons      (owner-authored; off by default)
//   --with-broadcasts         also copy public.broadcasts   (owner-authored; off by default)
//   --with-cloud-blog-extras  also copy cloud public.articles rows whose slug is missing
//                             on the target (cover image copied bucket-to-bucket)
//
// Both env files use the app's variable names:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
// Values are never printed. The service_role key is used on both sides ON PURPOSE
// (admin migration script, not app code). The SOURCE is only ever read with GET.
//
// Every run writes a JSON snapshot of every source row it read to
// outputs/selfhost/reference-snapshot-<timestamp>.json (outputs/ is gitignored).
// The cloud project will be paused after cutover — that snapshot is the archive.
//
// Re-runnable: only rows whose primary key is missing on the target are inserted,
// so a second run after a partial failure just skips what already landed.
// =============================================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_FILE = join(REPO_ROOT, 'scripts', 'selfhost', 'run4_delivery', '01-schema.sql');

// ----------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const KNOWN = new Set(['--source-env', '--target-env', '--execute', '--overwrite', '--overwrite-settings',
  '--with-coupons', '--with-broadcasts', '--with-cloud-blog-extras', '--help', '-h']);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--source-env' || a === '--target-env') { i++; continue; }
  if (!KNOWN.has(a)) { console.error(`unknown argument: ${a}`); process.exit(1); }
}
if (flag('--help') || flag('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 42).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const EXECUTE = flag('--execute');
const OVERWRITE = flag('--overwrite');
const OVERWRITE_SETTINGS = flag('--overwrite-settings');
const WITH_COUPONS = flag('--with-coupons');
const WITH_BROADCASTS = flag('--with-broadcasts');
const WITH_BLOG = flag('--with-cloud-blog-extras');
const SOURCE_ENV = opt('--source-env', '.env.local.backup-2026-09-24');
const TARGET_ENV = opt('--target-env', '.env.local');

// ----------------------------------------------------------------------------- env (values never printed)
function loadEnv(file) {
  const p = isAbsolute(file) ? file : join(REPO_ROOT, file);
  if (!existsSync(p)) { console.error(`env file not found: ${file}`); process.exit(1); }
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  const url = (out.NEXT_PUBLIC_SUPABASE_URL || out.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = out.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) { console.error(`${file}: needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY`); process.exit(1); }
  let host;
  try { host = new URL(url).host.toLowerCase(); } catch { console.error(`${file}: Supabase URL is not a valid URL`); process.exit(1); }
  return { file, url, key, host };
}
const SRC = loadEnv(SOURCE_ENV);
const TGT = loadEnv(TARGET_ENV);
if (TGT.host.endsWith('supabase.co')) { console.error(`REFUSED: target host ${TGT.host} is a hosted supabase.co project — this script only writes to the self-hosted one.`); process.exit(1); }
if (SRC.host === TGT.host) { console.error(`REFUSED: source and target are the same host (${SRC.host}).`); process.exit(1); }
if (!/^https:\/\//.test(TGT.url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(TGT.url)) { console.error('REFUSED: target URL must be https:// (plain http only for localhost)'); process.exit(1); }

// ----------------------------------------------------------------------------- HTTP
const authHeaders = (side) => ({ apikey: side.key, Authorization: `Bearer ${side.key}` });

class HttpError extends Error {}
async function readBody(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }
function errText(body) { return typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300); }

/** GET only. The only function that ever talks to the SOURCE. */
async function sourceGet(path, headers = {}) {
  const res = await fetch(`${SRC.url}${path}`, { method: 'GET', headers: { ...authHeaders(SRC), ...headers } });
  return res;
}
async function targetGet(path, headers = {}) {
  return fetch(`${TGT.url}${path}`, { method: 'GET', headers: { ...authHeaders(TGT), ...headers } });
}
/** Every write goes through here: target only, and only with --execute. */
async function targetWrite(method, path, body, headers = {}) {
  if (!EXECUTE) throw new Error(`internal: write attempted without --execute (${method} ${path})`);
  const res = await fetch(`${TGT.url}${path}`, { method, headers: { ...authHeaders(TGT), ...headers }, body });
  if (!res.ok) throw new HttpError(`${method} ${path.split('?')[0]} -> HTTP ${res.status}: ${errText(await readBody(res))}`);
  return res;
}

const PAGE = 1000; // self-hosted PostgREST max-rows is 1000
/** select=* with Range pagination, ordered by the primary key. Verifies the total. */
async function selectAll(side, schema, table, orderCols, select = '*') {
  const get = side === SRC ? sourceGet : targetGet;
  const order = orderCols.map((c) => `${c}.asc`).join(',');
  const rows = [];
  let total = null;
  for (let from = 0; ; from += PAGE) {
    const res = await get(`/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${order}`, {
      'Accept-Profile': schema, Prefer: 'count=exact', 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}`,
    });
    const body = await readBody(res);
    if (res.status === 416 && from > 0) break;
    if (!res.ok) throw new HttpError(`${side === SRC ? 'SOURCE' : 'TARGET'} GET ${schema}.${table} -> HTTP ${res.status}: ${errText(body)}`);
    const cr = res.headers.get('content-range') || '';
    const t = cr.split('/')[1];
    if (t && t !== '*') total = Number(t);
    rows.push(...body);
    if (body.length === 0 || (total !== null && rows.length >= total)) break;
  }
  if (total !== null && rows.length !== total) throw new Error(`${schema}.${table}: read ${rows.length} rows but count=exact says ${total}`);
  return rows;
}

// ----------------------------------------------------------------------------- schema file (authoritative reference)
const SCHEMA_SQL = existsSync(SCHEMA_FILE) ? readFileSync(SCHEMA_FILE, 'utf8').replace(/\r\n/g, '\n') : null;
function schemaInfo(schema, table) {
  if (!SCHEMA_SQL) return null;
  const head = `CREATE TABLE "${schema}"."${table}" (\n`;
  const i = SCHEMA_SQL.indexOf(head);
  if (i < 0) return { missing: true };
  const block = SCHEMA_SQL.slice(i, SCHEMA_SQL.indexOf('\n);', i));
  const generated = [...block.matchAll(/^\s+"([a-z0-9_]+)"[^\n]*GENERATED (?:ALWAYS|BY DEFAULT) AS/gm)].map((m) => m[1]);
  const pkRe = new RegExp(`ALTER TABLE ONLY "${schema}"\\."${table}"\\n\\s+ADD CONSTRAINT "[^"]+" PRIMARY KEY \\(([^)]+)\\)`);
  const pk = SCHEMA_SQL.match(pkRe)?.[1].split(',').map((s) => s.trim().replace(/"/g, '')) ?? null;
  return { generated, pk };
}

// ----------------------------------------------------------------------------- the allow-list
// Verified 2026-09-25: grep of supabase/migrations/*.sql (minus *_superseded / *_staging_only)
// for "insert into public." + a read-only count=exact probe of every public/library table on
// both sides. Every table populated by a migration was classified:
//
//   REFERENCE (copied below): admin_pricing_catalog, blog_sections, jurisdictions,
//     court_holidays, deadline_rules (platform defaults), platform_settings (missing keys),
//     subscription_plans + credit_packages (counts already match — diffed for price drift).
//   OWNER-AUTHORED, opt-in: coupons (--with-coupons), broadcasts (--with-broadcasts).
//   BLOG: public.articles — self already has the full 616-row blog; cloud extras by slug only.
//   NOT a seed (trigger bodies / backfills of existing users' rows): profiles, *_profiles,
//     user_settings, firm_members, business_members, consultations, service_requests
//     (20260814 only has a commented-out probe insert).
//
// USER DATA — never copied (cloud had rows, self does not; old users are not migrated):
//   profiles, user_settings, lawyer_/firm_/business_/government_/ngo_/micro_/provider_profiles
//     (accounts of old users), firm_/business_/government_/ngo_members (memberships),
//   subscriptions, credit_transactions, wallet_transactions (billing of old users),
//   service_requests, request_events, consultations, cases, attachments (users' matters/files),
//   entitlement_requests (users' upgrade requests), notifications (per-user inbox),
//   community_posts (user posts), contact_messages (visitors' messages, personal data),
//   law_article_notes, research_sessions (users' private notes/research),
//   admin_audit_events (audit trail of actions by old admin accounts).
//
// LIBRARY schema: every library table on self has >= the cloud row count (fully re-seeded);
//   invitations, issue_reports, smart_folders, smart_folder_items are user tables and empty
//   on both sides — no non-seeded library reference data to copy.
const TABLES = [
  { table: 'jurisdictions', pk: ['id'], reason: 'country/jurisdiction catalog seeded by 20260603_phase1_005' },
  { table: 'blog_sections', pk: ['code'], reason: 'blog section codes/labels seeded by 20260716_blog_seo_aeo_geo; articles.category_code uses them' },
  { table: 'admin_pricing_catalog', pk: ['service_id'], reason: 'service price catalog seeded by 20260518_client_workflow_backend_ready' },
  { table: 'court_holidays', pk: ['id'], reason: 'court holiday calendar seeded by 20260904_phase5_deadline_radar' },
  {
    table: 'deadline_rules', pk: ['id'], naturalKey: ['code'],
    reason: 'statutory deadline rules (platform defaults) seeded by 20260904_phase5_deadline_radar',
    // A rule with an owner or a firm is a user's own rule = user data.
    rowFilter: (r) => r.owner_user_id == null && r.firm_id == null,
    naturalScope: (r) => r.owner_user_id == null,
    nullify: ['owner_user_id', 'firm_id'],
  },
  {
    table: 'platform_settings', pk: ['key'], settings: true, nullify: ['updated_by'],
    reason: 'runtime settings seeded by 20260627/20260628/20260729 — missing keys only',
  },
  { table: 'subscription_plans', pk: ['id'], reason: 'plan catalog seeded by 20260603_phase1_003 (diff for admin price edits)' },
  { table: 'credit_packages', pk: ['id'], reason: 'credit package catalog seeded by 20260603_phase1_003 (diff for admin price edits)' },
  {
    table: 'coupons', pk: ['id'], naturalKey: ['code'], optIn: '--with-coupons', enabled: WITH_COUPONS,
    nullify: ['created_by'], reset: { used_count: 0 }, // coupon_usage is not carried over
    reason: 'owner-authored discount codes (operational content)',
  },
  {
    table: 'broadcasts', pk: ['id'], optIn: '--with-broadcasts', enabled: WITH_BROADCASTS,
    nullify: ['created_by'], reason: 'owner-authored announcements (operational content)',
  },
];
// No FK exists between any two of these tables (checked in 01-schema.sql); their only FKs
// point at auth.users / profiles / firm_profiles, which is why those columns are nulled.

const TIMESTAMP_COLS = new Set(['created_at', 'updated_at']);

// ----------------------------------------------------------------------------- helpers
const canon = (v) => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(canon);
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
};
const numLike = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim()));
function sameValue(a, b) {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (numLike(a) && numLike(b)) return Number(a) === Number(b);
  if (typeof a === 'string' && typeof b === 'string' && !Number.isNaN(Date.parse(a)) && /^\d{4}-\d\d-\d\dT/.test(a) && /^\d{4}-\d\d-\d\dT/.test(b)) return Date.parse(a) === Date.parse(b);
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
const keyOf = (row, cols) => JSON.stringify(cols.map((c) => row[c] ?? null));
const short = (v, n = 140) => { const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(canon(v)); return s && s.length > n ? `${s.slice(0, n)}…` : s; };
const pkFilter = (row, pk) => pk.map((c) => `${c}=eq.${encodeURIComponent(String(row[c]))}`).join('&');

let failures = 0;
const summary = [];
const snapshot = {
  taken_at: new Date().toISOString(),
  source_host: SRC.host,
  target_host: TGT.host,
  note: 'Read-only snapshot of cloud reference/catalog rows (archive before the cloud project is paused).',
  tables: {},
  blog_articles: [],
};

console.log('='.repeat(78));
console.log(`copy-reference-data  ${EXECUTE ? 'EXECUTE (writes to target)' : 'DRY-RUN (no writes)'}`);
console.log(`source (read-only): ${SRC.host}   [${SRC.file}]`);
console.log(`target            : ${TGT.host}   [${TGT.file}]`);
console.log(`flags: overwrite=${OVERWRITE} overwrite-settings=${OVERWRITE_SETTINGS} coupons=${WITH_COUPONS} broadcasts=${WITH_BROADCASTS} blog-extras=${WITH_BLOG}`);
if (!SCHEMA_SQL) console.log(`WARN: ${SCHEMA_FILE} not found — primary keys/generated columns not cross-checked`);
console.log('='.repeat(78));

// ----------------------------------------------------------------------------- phase 1: read everything (both sides)
const plans = [];
for (const cfg of TABLES) {
  const info = schemaInfo('public', cfg.table);
  if (info?.missing) throw new Error(`public.${cfg.table} not found in 01-schema.sql`);
  if (info?.pk && info.pk.join(',') !== cfg.pk.join(',')) throw new Error(`public.${cfg.table}: configured PK (${cfg.pk}) != schema PK (${info.pk})`);
  const generated = info?.generated ?? [];
  const src = await selectAll(SRC, 'public', cfg.table, cfg.pk);
  const tgt = await selectAll(TGT, 'public', cfg.table, cfg.pk);
  snapshot.tables[cfg.table] = src;
  plans.push({ cfg, generated, src, tgt });
}
// blog
const srcArticles = await selectAll(SRC, 'public', 'articles', ['id']);
const tgtArticleKeys = await selectAll(TGT, 'public', 'articles', ['id'], 'id,slug,cover');
snapshot.blog_articles = srcArticles;

// Snapshot BEFORE any write.
const outDir = join(REPO_ROOT, 'outputs', 'selfhost');
mkdirSync(outDir, { recursive: true });
const snapPath = join(outDir, `reference-snapshot-${snapshot.taken_at.replace(/[:.]/g, '-')}.json`);
writeFileSync(snapPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`snapshot of source rows written: ${snapPath.replace(REPO_ROOT, '.').replace(/\\/g, '/')}`);

// ----------------------------------------------------------------------------- phase 2: plan + (optionally) apply per table
async function slugCheck(label, slugs) {
  if (!slugs.length) { console.log(`    ${label}: (no slugs)`); return; }
  const found = new Set();
  for (let i = 0; i < slugs.length; i += 40) {
    const chunk = slugs.slice(i, i + 40);
    const list = chunk.map((s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`).join(',');
    const res = await targetGet(`/rest/v1/laws?select=slug&slug=in.(${encodeURIComponent(list)})`, { 'Accept-Profile': 'library' });
    const body = await readBody(res);
    if (!res.ok) throw new HttpError(`TARGET GET library.laws slug check -> HTTP ${res.status}: ${errText(body)}`);
    for (const r of body) found.add(r.slug);
  }
  const missing = slugs.filter((s) => !found.has(s));
  console.log(`    ${label}: ${slugs.length} slug(s), ${slugs.length - missing.length} exist in target library.laws${missing.length ? `, MISSING: ${missing.map((s) => JSON.stringify(s)).join(', ')}` : ''}`);
}

for (const { cfg, generated, src, tgt } of plans) {
  const t = cfg.table;
  console.log(`\n--- public.${t}  (${cfg.reason})`);
  if (generated.length) console.log(`    generated columns stripped on write: ${generated.join(', ')}`);
  const tgtByPk = new Map(tgt.map((r) => [keyOf(r, cfg.pk), r]));
  const tgtNatural = cfg.naturalKey ? new Map(tgt.filter(cfg.naturalScope ?? (() => true)).map((r) => [keyOf(r, cfg.naturalKey), r])) : null;
  const eligible = cfg.rowFilter ? src.filter(cfg.rowFilter) : src;
  const userOwned = src.length - eligible.length;
  if (userOwned) console.log(`    skipped ${userOwned} user-owned row(s) (not reference data)`);

  const toInsert = [];
  const differing = [];
  const conflicts = [];
  let identical = 0;
  let tsOnly = 0;
  const ignoreCols = new Set([...(cfg.nullify ?? []), ...generated]);
  for (const row of eligible) {
    const k = keyOf(row, cfg.pk);
    const existing = tgtByPk.get(k);
    if (!existing) {
      if (tgtNatural && tgtNatural.has(keyOf(row, cfg.naturalKey))) {
        conflicts.push({ row, other: tgtNatural.get(keyOf(row, cfg.naturalKey)) });
        continue;
      }
      toInsert.push(row);
      continue;
    }
    const fieldDiffs = [];
    const tsDiffs = [];
    for (const col of Object.keys(row)) {
      if (ignoreCols.has(col)) continue;
      if (!(col in existing)) { fieldDiffs.push({ col, src: row[col], tgt: '<column missing on target>' }); continue; }
      if (!sameValue(row[col], existing[col])) (TIMESTAMP_COLS.has(col) ? tsDiffs : fieldDiffs).push({ col, src: row[col], tgt: existing[col] });
    }
    if (fieldDiffs.length) differing.push({ row, fieldDiffs });
    else if (tsDiffs.length) tsOnly++;
    else identical++;
  }

  const optedOut = cfg.optIn && !cfg.enabled;
  const settingsLocked = cfg.settings && !OVERWRITE_SETTINGS;
  const willOverwrite = !optedOut && (cfg.settings ? OVERWRITE_SETTINGS : OVERWRITE);

  // report
  console.log(`    source rows ${src.length} | target rows before ${tgt.length} | to insert ${toInsert.length} | differing ${differing.length} | identical ${identical}${tsOnly ? ` | timestamps-only diff ${tsOnly}` : ''}${conflicts.length ? ` | natural-key conflicts ${conflicts.length}` : ''}`);
  if (optedOut) console.log(`    NOT COPIED by default (owner-authored) — pass ${cfg.optIn} to copy.`);
  for (const row of toInsert) {
    const label = cfg.pk.map((c) => `${c}=${row[c]}`).join(' ');
    if (t === 'coupons') console.log(`    + ${label} code=${row.code} type=${row.discount_type} value=${row.discount_value} points=${row.points_granted} plan=${row.plan_granted ?? '-'} active=${row.active} valid_until=${row.valid_until ?? '-'} used_count=${row.used_count}${row.used_count ? ' (will be reset to 0)' : ''}`);
    else if (t === 'broadcasts') console.log(`    + ${label} title=${JSON.stringify(row.title)} status=${row.status} audience=${row.audience} sent_at=${row.sent_at ?? '-'} body=${short(row.body, 120)}`);
    else if (t === 'platform_settings') console.log(`    + key=${row.key} value=${short(row.value, 400)}`);
    else console.log(`    + ${label}${row.label_ar ? ` ${row.label_ar}` : row.ar_label ? ` ${row.ar_label}` : row.title_ar ? ` ${row.title_ar}` : row.name_ar ? ` ${row.name_ar}` : ''}`);
    for (const c of cfg.nullify ?? []) if (row[c] != null) console.log(`      (will null ${c}=${row[c]} — user not migrated)`);
  }
  for (const { row, other } of conflicts) console.log(`    ! conflict: ${cfg.naturalKey.join(',')}=${keyOf(row, cfg.naturalKey)} exists on target with ${cfg.pk.join(',')}=${keyOf(other, cfg.pk)} (source ${keyOf(row, cfg.pk)}) — skipped`);
  for (const { row, fieldDiffs } of differing) {
    console.log(`    ~ ${cfg.pk.map((c) => `${c}=${row[c]}`).join(' ')}`);
    for (const d of fieldDiffs) console.log(`        ${d.col}: source=${short(d.src)}  target=${short(d.tgt)}`);
  }
  if (differing.length && !willOverwrite) console.log(`    differing rows NOT overwritten${settingsLocked ? ' (platform_settings needs --overwrite-settings)' : ' (pass --overwrite)'}`);

  // platform_settings extra checks
  if (cfg.settings) {
    const all = new Map([...tgt.map((r) => [r.key, { side: 'target', r }]), ...toInsert.map((r) => [r.key, { side: 'source→insert', r }])]);
    const st = all.get('library_status');
    if (st && st.r.value?.status !== 'open') console.log(`    WARNING: library_status (${st.side}) is ${short(st.r.value)} — the library would be CLOSED to the public`);
    const ov = all.get('library_free_law_overrides');
    if (ov) await slugCheck(`library_free_law_overrides (${ov.side}) keys`, Object.keys(ov.r.value?.overrides ?? {}));
    const wlT = tgt.find((r) => r.key === 'library_whitelisted_laws');
    if (wlT) await slugCheck('library_whitelisted_laws (target, not touched)', wlT.value?.slugs ?? []);
    const wlS = src.find((r) => r.key === 'library_whitelisted_laws');
    if (wlS && !sameValue(wlS.value, wlT?.value)) await slugCheck('library_whitelisted_laws (source value)', wlS.value?.slugs ?? []);
  }

  let inserted = 0;
  let updated = 0;
  if (EXECUTE && !optedOut) {
    const prep = (row) => {
      const out = { ...row };
      for (const c of generated) delete out[c];
      for (const c of cfg.nullify ?? []) if (c in out) out[c] = null;
      for (const [c, v] of Object.entries(cfg.reset ?? {})) if (c in out) out[c] = v;
      return out;
    };
    try {
      for (let i = 0; i < toInsert.length; i += 500) {
        const batch = toInsert.slice(i, i + 500).map(prep);
        await targetWrite('POST', `/rest/v1/${t}`, JSON.stringify(batch), { 'Content-Type': 'application/json', 'Content-Profile': 'public', Prefer: 'return=minimal' });
        inserted += batch.length;
      }
      if (willOverwrite) {
        for (const { row } of differing) {
          const body = prep(row);
          for (const c of cfg.pk) delete body[c];
          for (const c of cfg.nullify ?? []) delete body[c]; // never clobber a target-side user reference
          for (const c of Object.keys(cfg.reset ?? {})) delete body[c]; // reset is for inserts only (e.g. a live coupons.used_count)
          const res = await targetWrite('PATCH', `/rest/v1/${t}?${pkFilter(row, cfg.pk)}`, JSON.stringify(body), { 'Content-Type': 'application/json', 'Content-Profile': 'public', Prefer: 'return=representation' });
          const n = (await readBody(res))?.length ?? 0;
          if (n !== 1) throw new Error(`PATCH ${t} ${keyOf(row, cfg.pk)} updated ${n} rows (expected 1)`);
          updated++;
        }
      }
      const after = await selectAll(TGT, 'public', t, cfg.pk);
      console.log(`    WROTE: inserted ${inserted}, updated ${updated}; target rows after ${after.length}`);
    } catch (e) {
      failures++;
      console.error(`    FAILED on public.${t} after ${inserted} insert(s)/${updated} update(s): ${e.message}`);
      summary.push({ table: t, source: src.length, before: tgt.length, insert: toInsert.length, differing: differing.length, skipped: '-', result: 'FAILED' });
      break; // stop at the first failing table; a re-run skips what already landed
    }
  }
  const skipped = optedOut ? eligible.length : userOwned + conflicts.length + identical + tsOnly + (willOverwrite ? 0 : differing.length);
  summary.push({
    table: t, source: src.length, before: tgt.length,
    insert: optedOut ? 0 : toInsert.length, differing: differing.length, skipped,
    result: optedOut ? `opt-in (${cfg.optIn})` : EXECUTE ? `inserted ${inserted}${updated ? `, updated ${updated}` : ''}` : 'dry-run',
  });
}

// ----------------------------------------------------------------------------- blog extras
if (!failures) {
  console.log(`\n--- public.articles (blog)  cloud=${srcArticles.length} target=${tgtArticleKeys.length}`);
  const tgtSlugs = new Set(tgtArticleKeys.map((r) => r.slug));
  const tgtIds = new Map(tgtArticleKeys.map((r) => [r.id, r.slug]));
  const missing = srcArticles.filter((r) => !tgtSlugs.has(r.slug));
  console.log(`    ${srcArticles.length - missing.length} cloud slug(s) already on target; ${missing.length} missing`);
  const srcStoragePrefix = `${SRC.url}/storage/v1/object/public/`;
  let blogInserted = 0;
  for (const r of missing) {
    console.log(`    + slug=${r.slug}`);
    console.log(`        title=${JSON.stringify(r.title)} status=${r.status} created_at=${r.created_at} published_at=${r.published_at ?? '-'}`);
    console.log(`        author_id=${r.author_id ?? '-'} author_name=${JSON.stringify(r.author_name ?? null)} author_credentials=${JSON.stringify(r.author_credentials ?? null)} reviewer=${JSON.stringify(r.reviewer ?? null)}`);
    console.log(`        cover=${r.cover ?? '-'}`);
    if (tgtIds.has(r.id)) console.log(`        ! id ${r.id} already used on target by slug ${tgtIds.get(r.id)} — would be skipped`);
    const otherCloudRefs = Object.entries(r).filter(([k, v]) => k !== 'cover' && v != null && JSON.stringify(v).includes(SRC.host)).map(([k]) => k);
    if (otherCloudRefs.length) console.log(`        WARNING: fields still referencing ${SRC.host}: ${otherCloudRefs.join(', ')} (not rewritten)`);
  }
  if (!WITH_BLOG && missing.length) console.log('    list only — pass --with-cloud-blog-extras to copy these rows (and their covers).');
  if (WITH_BLOG) {
    for (const r of missing) {
      if (tgtIds.has(r.id)) { console.log(`    skip ${r.slug}: id collision`); continue; }
      const row = { ...r, author_id: null };
      if (typeof r.cover === 'string' && r.cover.startsWith(srcStoragePrefix)) {
        const rest = r.cover.slice(srcStoragePrefix.length).split('?')[0];
        const bucket = rest.split('/')[0];
        const objPath = rest.slice(bucket.length + 1);
        if (bucket !== 'blog-covers') { console.log(`    WARNING ${r.slug}: cover is in bucket "${bucket}", not blog-covers — URL left as is`); }
        else {
          const newUrl = `${TGT.url}/storage/v1/object/public/blog-covers/${objPath}`;
          const head = await fetch(newUrl, { method: 'HEAD' });
          console.log(`    cover ${objPath}: target object ${head.ok ? 'already exists' : 'missing -> copy from cloud'}; URL -> ${newUrl}`);
          if (EXECUTE) {
            try {
              if (!head.ok) {
                const dl = await sourceGet(`/storage/v1/object/public/blog-covers/${objPath}`);
                if (!dl.ok) throw new HttpError(`SOURCE GET cover ${objPath} -> HTTP ${dl.status}`);
                const ct = dl.headers.get('content-type') || 'application/octet-stream';
                const buf = Buffer.from(await dl.arrayBuffer());
                await targetWrite('POST', `/storage/v1/object/blog-covers/${objPath.split('/').map(encodeURIComponent).join('/')}`, buf, { 'Content-Type': ct, 'x-upsert': 'false', 'cache-control': '3600' });
              }
            } catch (e) { failures++; console.error(`    FAILED cover upload for ${r.slug}: ${e.message}`); break; }
          }
          row.cover = newUrl;
        }
      }
      if (EXECUTE) {
        try {
          await targetWrite('POST', '/rest/v1/articles', JSON.stringify([row]), { 'Content-Type': 'application/json', 'Content-Profile': 'public', Prefer: 'return=minimal' });
          blogInserted++;
        } catch (e) { failures++; console.error(`    FAILED inserting article ${r.slug}: ${e.message}`); break; }
      }
    }
  }
  summary.push({
    table: 'articles (blog, by slug)', source: srcArticles.length, before: tgtArticleKeys.length,
    insert: missing.length, differing: '-', skipped: srcArticles.length - missing.length,
    result: WITH_BLOG ? (EXECUTE ? `inserted ${blogInserted}` : 'dry-run') : 'list only (--with-cloud-blog-extras)',
  });
}

// ----------------------------------------------------------------------------- summary
console.log(`\n${'='.repeat(78)}\nSUMMARY (${EXECUTE ? 'EXECUTE' : 'DRY-RUN'})`);
const cols = ['table', 'source', 'before', 'insert', 'differing', 'skipped', 'result'];
const heads = { table: 'table', source: 'source rows', before: 'target before', insert: 'to insert', differing: 'differing', skipped: 'skipped', result: 'result' };
const w = Object.fromEntries(cols.map((c) => [c, Math.max(heads[c].length, ...summary.map((s) => String(s[c]).length))]));
console.log(cols.map((c) => heads[c].padEnd(w[c])).join(' | '));
console.log(cols.map((c) => '-'.repeat(w[c])).join('-+-'));
for (const s of summary) console.log(cols.map((c) => String(s[c]).padEnd(w[c])).join(' | '));
console.log(`snapshot: ${snapPath.replace(REPO_ROOT, '.').replace(/\\/g, '/')}`);
if (!EXECUTE) console.log('DRY-RUN: nothing was written. Re-run with --execute to insert the "to insert" rows.');
if (failures) { console.error(`${failures} failure(s) — see above. Fix and re-run; rows already written are skipped.`); process.exit(1); }
