#!/usr/bin/env node
// Owner decision ١٠٢ — which laws are numbered by PAGE rather than by article.
//
// GUEST-ONLY and READ-ONLY. It reads the public catalogue (library.laws, with
// the public anon key from .env.local, never printed) and then the public law
// API of the site (/api/library/laws/<slug>) for every law typed «نظام»,
// «لائحة تنفيذية» or «تعميم», and records how many of its articles are «الصفحة N».
// It writes nothing anywhere but the output file. Four requests at a time,
// about one per second each: far under the site's library-read limit
// (300 a minute), so it never throttles anyone else on the same IP.
//
//   node scripts/library-q102-page-numbered-scan.mjs <out.jsonl> [site=https://nezamy.sa]
//
// Resumable: laws already in <out.jsonl> are skipped. ~25 minutes for ~2,500 laws.
// Then: node scripts/library-q102-page-numbered-generate.cjs <out.jsonl> …
import fs from 'node:fs';
import path from 'node:path';

const [out, site = 'https://nezamy.sa'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/library-q102-page-numbered-scan.mjs <out.jsonl> [site]');
  process.exit(2);
}
const envFile = path.resolve('.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // the PUBLIC key only
if (!U || !K) throw new Error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');

const TYPES = ['نظام', 'لائحة تنفيذية', 'تعميم'];
// The reader's rule (isPageLocator in src/app/laws/[slug]/_citation.ts), on the
// API's cleaned numberText.
const PAGE_RE = /^\s*(?:الصفحة|صفحة|ص\.?)\s*[\d٠-٩۰-۹]/;
const clean = (s) => (s ?? '').replace(/^\s*#{1,6}\s*/, '').replace(/[\s:：]+$/, '').trim();

const laws = [];
for (const t of TYPES) {
  for (let off = 0; ; off += 1000) {
    const u = `${U}/rest/v1/laws?select=slug,title,type,total_articles&type=eq.${encodeURIComponent(t)}&order=slug&offset=${off}&limit=1000`;
    const r = await fetch(u, { headers: { apikey: K, Authorization: `Bearer ${K}`, 'Accept-Profile': 'library' } });
    if (!r.ok) throw new Error(`catalogue read failed: HTTP ${r.status}`);
    const rows = await r.json();
    laws.push(...rows);
    if (rows.length < 1000) break;
  }
}
const done = new Set(fs.existsSync(out)
  ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).slug)
  : []);
const todo = laws.filter((l) => !done.has(l.slug));
console.log('candidates', laws.length, 'todo', todo.length);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let i = 0;
async function worker() {
  while (i < todo.length) {
    const law = todo[i++];
    let rec;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${site}/api/library/laws/${encodeURIComponent(law.slug)}`);
        if (r.status === 429) { await sleep(30000); continue; }
        if (!r.ok) { rec = { slug: law.slug, type: law.type, title: law.title, http: r.status }; break; }
        const j = await r.json();
        const arts = (j.chapters || []).flatMap((c) => c.articles || []);
        const nts = arts.map((a) => clean(a.numberText));
        const page = nts.filter((n) => PAGE_RE.test(n)).length;
        rec = { slug: law.slug, type: law.type, title: law.title, n: arts.length, page,
                sampleOther: nts.find((n) => !PAGE_RE.test(n)) ?? null, firstIds: arts.slice(0, 2).map((a) => a.id) };
        break;
      } catch (e) {
        await sleep(5000);
        rec = { slug: law.slug, type: law.type, title: law.title, error: String(e) };
      }
    }
    fs.appendFileSync(out, JSON.stringify(rec) + '\n');
    await sleep(900);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log('done');
