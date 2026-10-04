/**
 * Command line of scripts/seed-library-from-owner.mjs — the library loader
 * the owner runs from his own machine (2026-10-04).
 *
 * Why it is strict: on 2026-10-04 `--help` (a flag the loader did not know)
 * was ignored and a REAL production load started. And `npm run
 * library:seed:owner --dry --rows X` (no `--`) makes npm eat both flags and
 * hand the script only `X`. So:
 *   - an unknown flag or a stray value is an error, before anything runs;
 *   - a run is DRY unless it asks for `--apply` AND names the target host
 *     with `--confirm-host <host>` that matches the database it would write;
 *   - `--rows <dir>` is required: no silent pick of "the newest package".
 */

export interface SeedOwnerOptions {
  help: boolean;
  /** Asked to write. Still needs a matching `confirmHost` (liveWriteDecision). */
  apply: boolean;
  confirmHost: string | null;
  rows: string | null;
  table: string | null;
  from: string | null;
  limit: number | null;
  allowCloud: boolean;
}

export type SeedOwnerArgs =
  | { ok: true; options: SeedOwnerOptions }
  | { ok: false; error: string };

const VALUE_FLAGS = new Set(["--confirm-host", "--rows", "--table", "--from", "--limit"]);
const BOOLEAN_FLAGS = new Set(["--help", "-h", "--apply", "--dry", "--allow-cloud"]);

export function parseSeedOwnerArgs(argv: readonly string[]): SeedOwnerArgs {
  const o: SeedOwnerOptions = {
    help: false,
    apply: false,
    confirmHost: null,
    rows: null,
    table: null,
    from: null,
    limit: null,
    allowCloud: false,
  };
  let dry = false;
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (BOOLEAN_FLAGS.has(arg)) {
      if (arg === "--help" || arg === "-h") o.help = true;
      else if (arg === "--apply") o.apply = true;
      else if (arg === "--dry") dry = true;
      else if (arg === "--allow-cloud") o.allowCloud = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      if (seen.has(arg)) return { ok: false, error: `${arg} given twice.` };
      seen.add(arg);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) return { ok: false, error: `${arg} needs a value.` };
      i++;
      if (arg === "--confirm-host") o.confirmHost = value.trim();
      else if (arg === "--rows") o.rows = value;
      else if (arg === "--table") o.table = value;
      else if (arg === "--from") o.from = value;
      else if (arg === "--limit") {
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) return { ok: false, error: `--limit must be a positive whole number, got "${value}".` };
        o.limit = n;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, error: `Unknown option "${arg}". Nothing was run. See --help.` };
    }
    return {
      ok: false,
      error:
        `Unexpected value "${arg}". Nothing was run. If you used "npm run", npm swallows the options: ` +
        `call "node scripts/seed-library-from-owner.mjs …" directly.`,
    };
  }

  if (o.help) return { ok: true, options: o };
  if (dry && o.apply) return { ok: false, error: "--dry and --apply together: pick one. Nothing was run." };
  if (o.confirmHost && !o.apply) return { ok: false, error: "--confirm-host is only for --apply. Nothing was run." };
  if (!o.rows) return { ok: false, error: "--rows <folder with the 14 .jsonl files> is required. Nothing was run." };
  if (o.table && o.from) return { ok: false, error: "--table and --from together: pick one. Nothing was run." };
  return { ok: true, options: o };
}

export type LiveDecision = { live: true } | { live: false; error?: string };

/**
 * Dry unless `--apply` AND `--confirm-host` equal to the host this run would
 * write to. A mismatch is an error, never a silent dry run.
 */
export function liveWriteDecision(o: SeedOwnerOptions, targetHost: string): LiveDecision {
  if (!o.apply) return { live: false };
  const want = targetHost.trim().toLowerCase();
  const got = (o.confirmHost ?? "").trim().toLowerCase();
  if (!got) {
    return { live: false, error: `--apply writes to ${want}: add --confirm-host ${want} to confirm. Nothing was written.` };
  }
  if (got !== want) {
    return { live: false, error: `--confirm-host ${got} does not match the target ${want}. Nothing was written.` };
  }
  return { live: true };
}

export const SEED_OWNER_USAGE = `
Library loader — loads the 14 JSONL row files into the library database.

DRY by default: reads and checks every row, writes nothing.

  node scripts/seed-library-from-owner.mjs --rows <dir>
      dry run of all 14 tables
  node scripts/seed-library-from-owner.mjs --rows <dir> --apply --confirm-host auth.nezamy.sa
      LIVE: writes (upsert) to the database in .env.local
  --table <name>   only this table          --from <name>   this table and the ones after it
  --limit <n>      at most n rows per table (a LIVE write too, with --apply)
  --allow-cloud    allow a *.supabase.co target (the old cloud project)
  --help           this text

Tables in order: laws, chapters, articles, article_amendments, article_regulations,
decrees_circulars, decree_pages, judicial_collections, principles, principle_paragraphs,
feqh_books, feqh_chapters, feqh_sections, feqh_blocks.

Before any --apply, run scripts/library-rows-diff.mjs on the same --rows folder:
it lists rows that are new, and live rows the load would leave behind.
`.trim();
