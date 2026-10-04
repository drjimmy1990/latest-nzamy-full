/**
 * Source contract for migration 20261004_01 (owner question ١٦٢): library.laws,
 * library.judicial_collections and library.principles are COLUMN-LOCKED for the
 * anon key. A request-client (anon / cookie) read of one of them may name only
 * allow-list columns — in its select AND in its filters, orders and
 * textSearch, because a filter needs the same privilege as a select — and
 * never `*` (PostgREST's `*` needs every column, so it answers 42501). A read
 * that needs a locked column goes through createServiceClient() and the route
 * masks the result per tier.
 *
 * The allow-lists are parsed from the migration, so this test cannot drift
 * from it; _verify.sql and the RLS harness test must carry the same lists.
 * The routes import next/server and "@/…" aliases, so (like the other route
 * contracts in this folder) this reads their source.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // src/app/api/library
const repo = path.resolve(here, "../../../..");
const read = (rel: string) => readFileSync(path.join(repo, rel), "utf8");

const MIGRATION = read("supabase/migrations/20261004_01_library_column_lock.sql");
const VERIFY = read("supabase/migrations/_verify.sql");
const HARNESS = read("supabase/tests/rls/library_column_lock.test.sql");

const TABLES = ["laws", "judicial_collections", "principles"] as const;
type LockedTable = (typeof TABLES)[number];

/** Live column lists (self-hosted production schema, 2026-10-04). */
const LIVE_COLUMNS: Record<LockedTable, string[]> = {
  laws: [
    "slug", "title", "title_en", "type", "description", "section_code", "section_name", "issuing_body",
    "issuing_instrument", "issue_date_hijri", "publication_date_hijri", "effective_date_hijri",
    "boe_source_url", "official_source_url", "total_articles", "status", "preamble",
    "article_status_summary", "latest_update", "has_merged_regulation", "fts", "created_at", "updated_at",
    "issue_date_gregorian", "law_guid", "publication_date_gregorian", "effective_date_gregorian",
    "effective_date_note", "gazette_issue_number", "gazette_publication_date", "gazette_url",
    "enactment_period_days", "enactment_clause_text", "enactment_article_number", "supersedes_law_ref",
    "supersedes_law_slug", "supersedes_law_title", "instrument_id", "parent_law_id", "parent_law",
    "enabling_article",
  ],
  judicial_collections: [
    "id", "title", "court", "year_hijri", "part", "source_id", "track", "description", "ruling_count",
    "free", "progress", "created_at", "updated_at", "series_id", "metadata",
  ],
  principles: [
    "id", "collection_id", "principle_number", "issuing_body", "session_date", "decision_number",
    "reference", "text", "ruling_basis", "facts", "reasons", "ruling", "year_hijri", "order_index", "fts",
    "created_at", "updated_at", "classification_keywords", "hashtags", "is_redacted", "metadata",
  ],
};

function grantList(table: LockedTable): string[] {
  const m = new RegExp(String.raw`grant select \(([^)]*)\) on library\.${table} to anon, authenticated;`).exec(MIGRATION);
  assert.ok(m, `20261004_01 must grant an explicit column list on library.${table}`);
  return m[1].split(",").map((c) => c.trim()).filter(Boolean);
}

const ALLOWED = Object.fromEntries(TABLES.map((t) => [t, grantList(t)])) as Record<LockedTable, string[]>;
const LOCKED = Object.fromEntries(
  TABLES.map((t) => [t, LIVE_COLUMNS[t].filter((c) => !ALLOWED[t].includes(c))]),
) as Record<LockedTable, string[]>;

// ── The scanner ──────────────────────────────────────────────────────────────

/** Index of the closing quote of the string literal that opens at `i`. */
function skipString(src: string, i: number): number {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (quote === "`" && src[j] === "$" && src[j + 1] === "{") {
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        if (depth > 0) j++;
      }
      continue;
    }
    if (src[j] === quote) return j;
  }
  return src.length;
}

/** One call chain from `start`: up to a `;`, or a `,` / unmatched closer at depth 0. */
function chainAt(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/") {
      const eol = src.indexOf("\n", i);
      if (eol < 0) return src.slice(start);
      i = eol;
      continue;
    }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) return src.slice(start, i);
      depth--;
    } else if ((ch === ";" || ch === ",") && depth === 0) return src.slice(start, i);
  }
  return src.slice(start);
}

type ClientKind = "service" | "request" | "unknown";

/** Which client the identifier `name` holds at `pos`: its last declaration before `pos`. */
function clientKind(src: string, name: string, pos: number): ClientKind {
  const before = src.slice(0, pos);
  const decl = new RegExp(
    String.raw`(?:const|let|var)\s+${name}\s*=\s*(?:await\s+)?(createServiceClient|createClient|createSupabaseClient)\(([^;]*)`,
    "g",
  );
  let last: RegExpExecArray | null = null;
  for (let m = decl.exec(before); m; m = decl.exec(before)) last = m;
  if (last) {
    if (last[1] === "createServiceClient") return "service";
    if (last[1] === "createSupabaseClient") return /SERVICE_ROLE_KEY/.test(last[2]) ? "service" : "request";
    return "request";
  }
  // A parameter typed with one of this file's client aliases
  // (lawTitleHits.ts: the service client; facets/route.ts: the request client).
  for (const alias of src.matchAll(/type (\w+) = Awaited<ReturnType<typeof (createServiceClient|createClient)>>;/g)) {
    if (new RegExp(String.raw`\b${name}\s*:\s*${alias[1]}\b`).test(before)) {
      return alias[2] === "createServiceClient" ? "service" : "request";
    }
  }
  return "unknown";
}

/** Every string literal in a piece of source, joined with ", ". */
const literalsIn = (code: string) => [...code.matchAll(/(['"`])([\s\S]*?)\1/g)].map((s) => s[2]).join(", ");

/**
 * The text of an expression made ONLY of string literals (joined with `+`,
 * optionally parenthesised), or undefined for anything else: a variable, a
 * call, a ternary, a template with `${…}`.
 */
function pureLiteral(code: string): string | undefined {
  let s = code.trim();
  while (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1).trim();
  if (s === "") return undefined;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const quote = s[i];
    if (quote !== "'" && quote !== '"' && quote !== "`") return undefined;
    const end = skipString(s, i);
    if (end >= s.length) return undefined;
    const body = s.slice(i + 1, end);
    if (quote === "`" && body.includes("${")) return undefined;
    out += body;
    i = end + 1;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i < s.length) {
      if (s[i] !== "+") return undefined;
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) return undefined;
    }
  }
  return out;
}

/** The first argument of a call, given the index just past its `(`. */
const firstArg = (text: string, afterParen: number) => chainAt(text, afterParen).trim();

/**
 * The columns a request-client select on a LOCKED table names — strictly: a
 * pure string literal, or a same-file `const` holding one. `null` = no select
 * or an empty one (PostgREST's default `*`); `undefined` = anything this
 * scanner cannot read (a call, a ternary, an interpolated template, a
 * parameter), which is a violation unless the chain is marked reviewed.
 */
function selectColumns(src: string, chain: string): string | null | undefined {
  const at = chain.indexOf(".select(");
  if (at < 0) return null;
  const arg = firstArg(chain, at + ".select(".length);
  if (arg === "") return null;
  let cols = pureLiteral(arg);
  if (cols === undefined && /^[A-Za-z_]\w*$/.test(arg)) {
    const decl = new RegExp(String.raw`const ${arg}\s*=\s*([\s\S]*?);`).exec(src);
    cols = decl ? pureLiteral(decl[1]) : undefined;
  }
  if (cols === undefined) return undefined;
  return cols.trim() === "" ? null : cols;
}

/** Any other library table's select, loosely (every literal in it) — only to spot embeds. */
function selectLiterals(src: string, chain: string): string {
  const at = chain.indexOf(".select(");
  if (at < 0) return "";
  const arg = firstArg(chain, at + ".select(".length);
  if (/^[A-Za-z_]\w*$/.test(arg)) {
    const decl = new RegExp(String.raw`const ${arg}\s*=\s*([\s\S]*?);`).exec(src);
    return decl ? literalsIn(decl[1]) : "";
  }
  return literalsIn(arg);
}

/**
 * A chain carrying this comment (e.g. `// column-lock-reviewed: <why>`) may
 * pass a select / filter column the scanner cannot read; literal columns in
 * it are still checked.
 */
const REVIEWED_MARK = "column-lock-reviewed:";

const FILTER_METHODS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy",
  "overlaps", "rangeGt", "rangeGte", "rangeLt", "rangeLte", "rangeAdjacent", "textSearch", "match",
  "not", "or", "order", "filter", "likeAllOf", "likeAnyOf", "ilikeAllOf", "ilikeAnyOf",
];
const FILTER_CALL_RE = new RegExp(String.raw`\.(${FILTER_METHODS.join("|")})\(`, "g");

const isLockedTable = (t: string): t is LockedTable => (TABLES as readonly string[]).includes(t);

/**
 * The columns a builder chain filters, sorts or searches on (`rel.col`
 * belongs to the embedded `rel`), and the calls whose column it cannot read.
 */
function filterColumns(chain: string, table: LockedTable): { named: Array<[LockedTable, string]>; unreadable: string[] } {
  const named: Array<[LockedTable, string]> = [];
  const unreadable: string[] = [];
  const add = (col: string) => {
    const parts = col.trim().split(".");
    if (parts.length === 1) named.push([table, parts[0]]);
    else if (isLockedTable(parts[0])) named.push([parts[0], parts[parts.length - 1]]);
  };
  for (const m of chain.matchAll(FILTER_CALL_RE)) {
    const method = m[1];
    const arg = firstArg(chain, (m.index ?? 0) + m[0].length);
    if (method === "match") {
      if (!arg.startsWith("{")) { unreadable.push(`.match(${arg})`); continue; }
      for (const k of arg.matchAll(/[{,]\s*['"]?([A-Za-z_][\w.]*)['"]?\s*:/g)) add(k[1]);
      continue;
    }
    const lit = pureLiteral(arg);
    if (lit === undefined) { unreadable.push(`.${method}(${arg})`); continue; }
    if (method === "or") {
      for (const w of lit.matchAll(/([A-Za-z_][\w.]*)\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|sl|sr|nxl|nxr|adj|fts|plfts|phfts|wfts|not)\./g)) add(w[1]);
      continue;
    }
    add(lit);
  }
  return { named, unreadable };
}

/**
 * When the chain initialises a variable (`let q = supabase…from('laws')…;`),
 * the later `q = q.eq(…)` / `q.order(…)` calls on it, up to that variable's
 * next declaration — the builder pattern every conditional filter uses.
 */
function continuationChains(src: string, start: number, end: number): string[] {
  const decl = /(?:let|const|var)\s+(\w+)\s*=\s*(?:await\s+)?$/.exec(src.slice(Math.max(0, start - 200), start));
  if (!decl) return [];
  const v = decl[1];
  const rest = src.slice(end);
  const next = new RegExp(String.raw`(?:let|const|var)\s+${v}\b`).exec(rest);
  const region = next ? rest.slice(0, next.index) : rest;
  const re = new RegExp(String.raw`\b${v}\s*(?=\.(?:${FILTER_METHODS.join("|")})\()`, "g");
  return [...region.matchAll(re)].map((m) => chainAt(region, m.index ?? 0));
}

/** A select string with every parenthesised embed body removed. */
function topLevelOf(cols: string): string {
  let out = cols;
  while (/\([^()]*\)/.test(out)) out = out.replace(/\([^()]*\)/g, "");
  return out;
}

/**
 * Embeds of a locked table inside any select (`laws(…)`,
 * `judicial_collections!inner(…)`): the embed reads that table with the
 * caller's privileges, so it obeys the same rules.
 */
function lockedEmbedViolations(cols: string, file: string, from: string): string[] {
  const out: string[] = [];
  for (const t of TABLES) {
    const re = new RegExp(String.raw`\b${t}\s*(?:!\w+\s*)?\(`, "g");
    for (let m = re.exec(cols); m; m = re.exec(cols)) {
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      for (; i < cols.length && depth > 0; i++) {
        if (cols[i] === "(") depth++;
        else if (cols[i] === ")") depth--;
      }
      const inner = topLevelOf(cols.slice(start, i - 1));
      if (inner.includes("*")) out.push(`${file}: ${from} embeds library.${t} with * through the request client`);
      for (const tok of inner.match(/[A-Za-z_]\w*/g) ?? []) {
        if (LOCKED[t].includes(tok)) out.push(`${file}: ${from} embeds locked column "${tok}" of library.${t}`);
      }
    }
  }
  return out;
}

/** Every locked column a request-client read of a locked table names (directly or by embed), or "*". */
function violationsIn(src: string, file: string): string[] {
  const out: string[] = [];
  const re = /(\w+)\s*\.schema\(\s*['"]library['"]\s*\)\s*\.from\(\s*['"](\w+)['"]\s*\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const [, client, table] = m;
    const kind = clientKind(src, client, m.index);
    if (kind === "service") continue;
    const chain = chainAt(src, m.index);
    if (!isLockedTable(table)) {
      // Another library table: only an embed of a locked one matters.
      const cols = selectLiterals(src, chain);
      if (TABLES.some((t) => new RegExp(String.raw`\b${t}\s*(?:!\w+\s*)?\(`).test(cols))) {
        if (kind === "unknown") out.push(`${file}: cannot tell which client "${client}" is (library.${table} embeds a locked table)`);
        else out.push(...lockedEmbedViolations(cols, file, `library.${table}`));
      }
      continue;
    }
    if (kind === "unknown") {
      out.push(`${file}: cannot tell which client "${client}" is (library.${table})`);
      continue;
    }
    const chains = [chain, ...continuationChains(src, m.index, m.index + chain.length)];
    const reviewed = chains.some((c) => c.includes(REVIEWED_MARK));
    const cols = selectColumns(src, chain);
    const named: Array<[LockedTable, string]> = [];
    if (cols === null) {
      out.push(`${file}: library.${table} read with no explicit select (PostgREST default *)`);
    } else if (cols === undefined) {
      if (!reviewed) out.push(`${file}: library.${table} read with a non-literal select — name the columns in a literal or a module constant (or mark the chain "${REVIEWED_MARK} <why>")`);
    } else {
      const topLevel = topLevelOf(cols);
      if (topLevel.includes("*")) out.push(`${file}: select * on library.${table} through the request client`);
      out.push(...lockedEmbedViolations(cols, file, `library.${table}`));
      for (const c of topLevel.match(/[A-Za-z_]\w*/g) ?? []) named.push([table, c]);
    }

    // The filters / orders / textSearch / .or() of the chain and of its
    // continuations (`q = q.eq(…)`).
    for (const c of chains) {
      const f = filterColumns(c, table);
      named.push(...f.named);
      if (!reviewed) {
        for (const call of f.unreadable) out.push(`${file}: library.${table} filtered on a non-literal column — ${call}`);
      }
    }
    for (const [t, col] of named) {
      if (LOCKED[t].includes(col)) out.push(`${file}: request-client read of library.${t} names locked column "${col}"`);
    }
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(repo, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => path.relative(repo, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("the allow-lists: every live column is either allowed or locked, and the locked set is what T28-22 masks + internal data", () => {
  for (const t of TABLES) {
    for (const c of ALLOWED[t]) assert.ok(LIVE_COLUMNS[t].includes(c), `library.${t}.${c} is granted but not a live column`);
  }
  assert.deepEqual(
    [...LOCKED.laws].sort(),
    [
      "article_status_summary", "boe_source_url", "effective_date_note", "enactment_article_number",
      "enactment_clause_text", "enactment_period_days", "gazette_issue_number",
      "gazette_publication_date", "gazette_url", "issue_date_gregorian", "issue_date_hijri", "issuing_body",
      "issuing_instrument", "latest_update", "law_guid", "official_source_url", "preamble",
      "publication_date_gregorian", "publication_date_hijri", "supersedes_law_ref", "supersedes_law_title",
    ],
  );
  assert.deepEqual(LOCKED.judicial_collections, ["metadata"]);
  assert.deepEqual(LOCKED.principles, ["metadata"]);
  // fts stays readable: built from readable columns only, and the public
  // searches filter on it under anon's statement_timeout.
  assert.ok(ALLOWED.laws.includes("fts") && ALLOWED.principles.includes("fts"));
});

test("_verify.sql and the RLS harness carry the migration's allow-lists", () => {
  const section = VERIFY.slice(VERIFY.indexOf("2026-10-04 — 20261004_01_library_column_lock.sql"));
  assert.ok(section.length > 100, "_verify.sql has no 20261004_01 section");
  for (const [label, text] of [["_verify.sql", section], ["harness", HARNESS], ["migration verify", MIGRATION]] as const) {
    for (const t of TABLES) {
      const m = new RegExp(String.raw`\('library\.${t}', (?:array|ARRAY)\[([\s\S]*?)\]\)`).exec(text);
      assert.ok(m, `${label}: no allow-list for library.${t}`);
      const listed = [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
      assert.deepEqual(listed, ALLOWED[t], `${label}: library.${t} allow-list differs from the migration's grant`);
    }
  }
});

test("the migration: revoke + column grant, service_role kept, view closed, order guard, marker, raising verify", () => {
  for (const t of TABLES) {
    assert.match(MIGRATION, new RegExp(String.raw`revoke all on library\.${t} from anon, authenticated, public;`));
    assert.match(MIGRATION, new RegExp(String.raw`grant all on library\.${t} to service_role;`));
    assert.match(MIGRATION, new RegExp(String.raw`alter table library\.${t}\s+enable row level security;`));
  }
  assert.match(MIGRATION, /revoke all on library\.v_laws_enactment_status from anon, authenticated, public;/);
  assert.match(MIGRATION, /server-only since 20260929_01%' then\s*raise exception '20261004_01: apply 20260929_01/);
  assert.match(MIGRATION, /comment on table library\.laws is\s*'[^']*COLUMN-LOCKED since 20261004_01/);
  assert.match(MIGRATION, /has_column_privilege\(r, spec\.tbl, a\.name, 'SELECT'\)/, "the pg_attribute sweep");
  assert.match(MIGRATION, /raise exception '20261004_01 verify:%'/);
  assert.match(MIGRATION, /20261004_01 verify: OK — /);
  assert.equal((MIGRATION.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((MIGRATION.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(MIGRATION, /^commit;\s*\n[\s\S]*^notify pgrst, 'reload schema';$/m);
  assert.match(MIGRATION, /DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION/);
  // The older grant file warns against re-running it after this one.
  assert.match(read("supabase/migrations/20260922_01_library_grants.sql"), /NOR AFTER 20261004_01_library_column_lock\.sql/);
});

test("the scanner itself flags *, locked columns in select / filter / textSearch / or / embeds, and passes service reads", () => {
  const bad = [
    "const supabase = await createClient();",
    "const a = await supabase.schema('library').from('laws').select('*').eq('slug', s);",
    "const b = await supabase.schema('library').from('laws').select('slug, preamble');",
    "const c = await supabase.schema('library').from('laws').select('slug').textSearch('fts', q).eq('law_guid', g);",
    "const d = await supabase.schema(\"library\").from(\"judicial_collections\").select(COLS);",
    "const e = await supabase.schema('library').from('laws').select('slug').or('issue_date_hijri.like.*1447*');",
    "const f = await supabase.schema('library').from('laws').select('slug').order('publication_date_hijri');",
    "const g = await supabase.schema('library').from('principles').select('id, judicial_collections ( id, metadata )');",
    "const h = await supabase.schema('library').from('laws').eq('slug', s);",
    // Embeds from another library table read the locked one too.
    "const i = await supabase.schema('library').from('chapters').select('*, laws(*)');",
    "const j = await supabase.schema('library').from('principle_paragraphs').select('letter, principles!inner(id, metadata)');",
    "const COLS = 'id, metadata';",
  ].join("\n");
  assert.equal(violationsIn(bad, "bad.ts").length, 10, violationsIn(bad, "bad.ts").join("\n"));

  const good = [
    "const supabase = await createClient();",
    "const serverOnly = await createServiceClient();",
    "const a = await serverOnly.schema('library').from('laws').select('*').textSearch('fts', q).eq('law_guid', g);",
    "const b = await supabase.schema('library').from('laws').select('slug,title').eq('supersedes_law_slug', s);",
    "const c = await supabase.schema('library').from('principles').select('id, issuing_body, judicial_collections ( id, title )').order('id');",
    "const d = await supabase.schema('library').from('chapters').select('*, laws(slug, title)');",
    "const e = await serverOnly.schema('library').from('articles').select('id, laws!inner(slug, preamble)');",
    // fts is on the allow-list: the public full-text searches run as anon.
    "const f = await supabase.schema('library').from('principles').select('id').textSearch('fts', q);",
    "const g = await supabase.schema('library').from('laws').select(LAW_COLS).textSearch('fts', q).eq('type', t);",
    "const LAW_COLS = 'slug, title, ' + 'type';",
    "let q = supabase.schema('library').from('principles').select('id');",
    "if (x) q = q.eq('judicial_collections.track', x).order('id');",
  ].join("\n");
  assert.deepEqual(violationsIn(good, "good.ts"), []);
});

test("the scanner flags what it cannot read: a non-literal select or filter column, unless the chain is marked reviewed", () => {
  const cases: Array<[string, string]> = [
    ["a call", "const a = await supabase.schema('library').from('laws').select(buildCols());"],
    ["a parameter / unknown variable", "const b = await supabase.schema('library').from('laws').select(columnsFromSomewhere);"],
    ["an interpolated template", "const c = await supabase.schema('library').from('principles').select(`id, ${extra}`);"],
    ["a ternary", "const d = await supabase.schema('library').from('laws').select(full ? 'slug, preamble' : 'slug');"],
    ["a const that is not a pure literal", "const e = await supabase.schema('library').from('laws').select(DYN);\nconst DYN = pick();"],
    ["a variable filter column", "const f = await supabase.schema('library').from('laws').select('slug').eq(column, v);"],
    ["a variable sort column", "const g = await supabase.schema('library').from('principles').select('id').order(sortKey);"],
    ["a variable textSearch column", "const h = await supabase.schema('library').from('laws').select('slug').textSearch(field, q);"],
    ["an interpolated .or()", "const i = await supabase.schema('library').from('laws').select('slug').or(`${clauses}`);"],
    ["a .match() object from elsewhere", "const j = await supabase.schema('library').from('laws').select('slug').match(filters);"],
    ["a later q = q.eq(variable)", "let q = supabase.schema('library').from('laws').select('slug');\nq = q.eq(field, v);"],
    ["a later locked filter", "let q = supabase.schema('library').from('laws').select('slug');\nif (y) q = q.eq('preamble', v);"],
  ];
  for (const [label, code] of cases) {
    const v = violationsIn(`const supabase = await createClient();\n${code}`, "case.ts");
    assert.equal(v.length, 1, `${label}: expected one violation, got ${JSON.stringify(v)}`);
  }

  const reviewed = [
    "const supabase = await createClient();",
    "const a = await supabase.schema('library').from('laws')",
    "  // column-lock-reviewed: buildCols() returns allow-list columns only",
    "  .select(buildCols())",
    "  .eq(keyColumn, v);",
  ].join("\n");
  assert.deepEqual(violationsIn(reviewed, "reviewed.ts"), []);
  // The mark does not excuse a LITERAL locked column.
  const reviewedLocked = reviewed.replace(".eq(keyColumn, v)", ".eq('law_guid', v)");
  assert.equal(violationsIn(reviewedLocked, "reviewed.ts").length, 1);
});

test("no request-client read of laws / judicial_collections / principles anywhere in src names a locked column or *", () => {
  // src/lib/supabaseLibrary.ts is dead code (only its own dead-fetch test
  // reads it); reviving it means moving its reads to the service role first.
  const files = sourceFiles("src").filter((f) => f !== "src/lib/supabaseLibrary.ts");
  assert.ok(files.includes("src/app/sitemap.ts") && files.includes("src/app/api/library/init/route.ts"));
  const violations = files.flatMap((f) => violationsIn(read(f), f));
  assert.deepEqual(violations, []);
});

test("reads the scanner cannot see (dynamic table names, a client parameter) are pinned here", () => {
  // init: fetchSection(table, …) builds the query; only the laws section needs
  // locked columns, and it is the only one handed the service client.
  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /client: typeof supabase \| typeof serverOnly = supabase/);
  assert.match(init, /const serverOnly = await createServiceClient\(\);/);
  const lawsCall = init.slice(init.indexOf('fetchSection("laws"'), init.indexOf('shouldFetch("decrees")'));
  assert.match(lawsCall, /\}, serverOnly\)\s*: Promise\.resolve\(emptySection\(\)\)/);
  assert.equal((init.match(/, serverOnly\)/g) ?? []).length, 1, "only the laws section runs as the service role");
  const principlesStart = /fetchSection\(\s*"principles"/.exec(init);
  assert.ok(principlesStart, "the principles section");
  const principlesCall = init.slice(principlesStart.index, init.indexOf('shouldFetch("books")'));
  const principlesSelect = /`([\s\S]*?)`/.exec(principlesCall);
  assert.ok(principlesSelect, "the principles section select");
  for (const tok of principlesSelect[1].match(/[A-Za-z_]\w*/g) ?? []) {
    assert.ok(!LOCKED.principles.includes(tok) && !LOCKED.judicial_collections.includes(tok), `init principles select names locked "${tok}"`);
  }

  // autocomplete: count(table, client) selects `id` and filters on `fts`;
  // principles counts on the request client, so both must be allowed there.
  const auto = read("src/app/api/library/autocomplete/route.ts");
  assert.match(auto, /\.select\('id', \{ count: 'estimated', head: true \}\)\s*\.textSearch\('fts',/);
  assert.match(auto, /count\('principles'\),/);
  assert.ok(ALLOWED.principles.includes("id") && ALLOWED.principles.includes("fts"));
  assert.doesNotMatch(auto, /count\(['"](laws|judicial_collections)['"]/);

  // lawTitleHits runs on the request client (its callers pass `supabase`) and
  // builds its lookups as base().textSearch(…) / base().ilike(…), which the
  // chain scanner does not follow — so every filter in the file is checked
  // here: literal columns only, all on the laws allow-list.
  const callers = sourceFiles("src")
    .map((f) => [f, read(f)] as const)
    .flatMap(([f, s]) => [...s.matchAll(/fetchLawTitleHits(?:Checked)?\(\s*(\w+)\s*,/g)].map((m) => `${f}: ${m[1]}`));
  assert.ok(callers.length >= 3, callers.join("\n"));
  for (const c of callers) assert.match(c, /: supabase$/, `fetchLawTitleHits caller must pass the request client — ${c}`);
  const titleHits = read("src/app/api/library/search/lawTitleHits.ts");
  assert.match(titleHits, /type LibraryClient = Awaited<ReturnType<typeof createClient>>;/);
  const titleFilters = filterColumns(titleHits, "laws");
  assert.deepEqual(titleFilters.unreadable, [], "lawTitleHits filters on a non-literal column");
  assert.ok(titleFilters.named.length >= 5, "expected the fts / type / title / section_code filters");
  for (const [t, col] of titleFilters.named) {
    assert.ok(t === "laws" && ALLOWED.laws.includes(col), `lawTitleHits filters on ${t}.${col}, not on the laws allow-list`);
  }

  // libraryStats counts with the anon key: its laws / principles columns must be allowed.
  const stats = read("src/lib/library/libraryStats.ts");
  assert.match(stats, /laws: \{ table: "laws", column: "slug", serverOnly: false \}/);
  assert.match(stats, /principles: \{ table: "principles", column: "id", serverOnly: false \}/);
  assert.ok(ALLOWED.laws.includes("slug") && ALLOWED.principles.includes("id"));
});

test("routes that need locked columns read them with the service role and keep masking per tier", () => {
  const law = read("src/app/api/library/laws/[slug]/route.ts");
  assert.match(law, /const \{ data: law, error: lawError \} = await serverOnly\s*\.schema\('library'\)\s*\.from\('laws'\)\s*\.select\(LAW_DETAIL_COLUMNS\)/);
  assert.match(law, /const officialMeta = lawOfficialMeta\(law, isSubscriber\);/);
  assert.match(law, /preamble: officialMeta\.officialMetaLocked \? '' : preamble,/);
  // The replacedBy / parent lookups stay on the request client, on allowed columns.
  assert.match(law, /await supabase\s*\.schema\('library'\)\s*\.from\('laws'\)\s*\.select\('slug,title'\)\s*\.eq\('supersedes_law_slug', slug\)/);
  assert.match(law, /await supabase\s*\.schema\('library'\)\s*\.from\('laws'\)\s*\.select\('slug,title,status,type,instrument_id'\)\s*\.eq\('instrument_id', parentInstrumentId\)/);

  const enact = read("src/app/api/library/enactments/route.ts");
  assert.match(enact, /await serverOnly\s*\.schema\("library"\)\s*\.from\("laws"\)\s*\.select\(ENACTMENT_COLUMNS\)/);
  assert.match(enact, /issuingInstrument: isSubscriber \? row\.issuing_instrument : null,/);

  const monitor = read("src/app/api/library/monitor/route.ts");
  assert.equal((monitor.match(/serverOnly\s*\.schema\("library"\)\s*\.from\("laws"\)/g) ?? []).length, 2);
  assert.match(monitor, /supabase\s*\.schema\("library"\)\s*\.from\("decrees_circulars"\)/);
  assert.match(monitor, /maskOfficialDates\(buildLatest\(latestLawRows, orderRows, todayHijri\), isSubscriber\)/);

  // The public searches stay on the request client (anon's statement_timeout).
  const search = read("src/app/api/library/search/route.ts");
  assert.match(search, /let q = supabase\s*\.schema\('library'\)\s*\.from\('principles'\)/);
  assert.match(search, /fetchLawTitleHitsChecked\(supabase, \{/);

  const precedent = read("src/app/api/library/precedents/[slug]/route.ts");
  assert.match(precedent, /\.from\('judicial_collections'\)\s*\.select\('id, title, court, year_hijri, part, source_id, track, description, ruling_count, free'\)/);
});
