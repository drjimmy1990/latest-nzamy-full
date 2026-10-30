import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Source contract for GET /api/library/init (LIB-16 / LIB-08 / LIB-03). The
// route needs a live Supabase to run, so these checks read its source: they
// pin the properties a refactor could silently lose.
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "route.ts"), "utf8");

test("list reads name their card columns instead of select('*')", () => {
  assert.doesNotMatch(source, /fetchSection\(\s*"[a-z_]+",\s*"\*"/);
  assert.doesNotMatch(source, /\.select\(\s*"\*"/);
  // The heavy columns stay out of every list.
  for (const heavy of ["fts", "preamble", "metadata"]) {
    const lists = source.match(/const [A-Z_]+_LIST_COLUMNS =\s*\n?\s*"[^"]+"/g) ?? [];
    assert.ok(lists.length >= 4, "expected the four *_LIST_COLUMNS constants");
    for (const list of lists) {
      assert.doesNotMatch(list, new RegExp(`\\b${heavy}\\b`), `${heavy} leaked into ${list}`);
    }
  }
});

test("every paged section carries a deterministic order", () => {
  const sections = source.match(/\? fetchSection\(/g) ?? [];
  assert.equal(sections.length, 4, "laws, decrees, principles, books are paged");
  for (const table of ["laws", "decrees_circulars", "principles", "feqh_books"]) {
    const m = new RegExp(`fetchSection\\(\\s*"${table}"`).exec(source);
    assert.ok(m, `${table} section not found`);
    // The call's own shape callback, up to the next section's ternary.
    const rest = source.slice(m.index);
    const end = rest.indexOf(": Promise.resolve(emptySection())");
    assert.match(rest.slice(0, end), /\.order\(/, `${table} has no .order()`);
  }
});

test("N2.5: the laws catalogue is ordered in SQL — merged, then the newest of (amendment, issue) (desc, nulls last), then title, slug", () => {
  const n = source.replace(/\r\n/g, "\n");
  const lawsCall = n.slice(n.indexOf('fetchSection("laws"'), n.indexOf('shouldFetch("decrees")'));
  assert.match(
    lawsCall,
    /if \(on\.has\("sort"\)\) \{\s*return out\s*\.order\("has_merged_regulation", DESC_NULLS_LAST\)\s*\.order\(LAW_SORT_KEY, DESC_NULLS_LAST\)\s*\.order\("title"\)\s*\.order\("slug"\);/,
  );
  // ONE combined key (20261025_40: greatest(amendment, issue)), matching
  // idx_laws_catalogue_recency column for column.
  assert.match(n, /const LAW_SORT_KEY = "catalogue_recency_key";/);
  assert.match(n, /\{ key: "sort", columns: \[LAW_SORT_KEY\] \}/);
  assert.match(n, /const DESC_NULLS_LAST = \{ ascending: false, nullsFirst: false \} as const;/);
  // Before 20261025_40 the old order still pages deterministically.
  assert.match(lawsCall, /return out\.order\("section_code"\)\.order\("title"\)\.order\("slug"\);/);
  // Every viewer gets the order; the موجز only through the ٢٦٠ flag.
  assert.match(lawsCall, /wanted: lawSummaryVisible\(hasFullAccess\) \? \["summary", "sort"\] : \["sort"\]/);
  // No in-page JS sort of the laws rows.
  assert.doesNotMatch(n.slice(n.indexOf("const lawsRows")), /lawsRows[^;]*\.sort\(/);
});

test("N2.5: the sort key is the locked dates — ordered by, never selected or sent", () => {
  const n = source.replace(/\r\n/g, "\n");
  const list = n.match(/const LAW_LIST_COLUMNS =\n\s*"([^"]*)"/)?.[1] ?? "";
  assert.ok(list.includes("slug"), "LAW_LIST_COLUMNS found");
  for (const key of ["catalogue_recency_key", "latest_update"]) {
    assert.doesNotMatch(list, new RegExp(`\\b${key}\\b`));
  }
  // The select callback only ever adds the موجز column.
  assert.match(n, /fetchSection\("laws", \(on\) => \(on\.has\("summary"\) \? `\$\{LAW_LIST_COLUMNS\}, \$\{LAW_SUMMARY_COLUMN\}` : LAW_LIST_COLUMNS\)/);
});

test("collections are read whole through selectAllPages, not one 50-row page", () => {
  assert.match(source, /selectAllPages<Record<string, unknown>>\(\s*\(f, t\)\s*=>\s*supabase\s*\.schema\("library"\)\s*\.from\("judicial_collections"\)/);
  assert.match(source, /hasMore: false, page, limit: data\.length/);
});

test("the laws filters reach PostgREST only through .eq (no user input in .or)", () => {
  assert.match(source, /out\.eq\("section_code", lawSectionCode\)/);
  assert.match(source, /out\.eq\("type", lawType\)/);
  // The only .or() is the fixed executive-regulation literal.
  const ors = source.match(/\bout\.or\([^\n]*/g) ?? [];
  assert.equal(ors.length, 1);
  assert.match(ors[0], /EXEC_REGULATION_TYPE/);
  assert.doesNotMatch(ors[0], /lawType/);
});

test("the outer failure answers in Arabic, not with a raw driver message", () => {
  assert.doesNotMatch(source, /error: error\.message/);
});

// ── Task 1.6: the library pages decide «full library» from the server ──────
// Full library access is a Pro+ tier, an active library grant, or an admin
// (getLibraryAccessForUser().hasFullAccess, owner ٢٠٥/٢٠٩). The client's
// can("library-full-access") is tier-only, so a library-grant holder got the
// texts from the server and lock icons from the client. These pins keep the
// six client sites on the server's answer.
const repo = path.resolve(here, "../../../../..");
const readRepo = (rel: string) => fs.readFileSync(path.join(repo, rel), "utf8");

const LIBRARY_ACCESS_SITES = [
  "src/app/laws/components/FeqhTabContent.tsx",
  "src/app/laws/components/LawsTabContent.tsx",
  "src/app/laws/components/PrecedentsTabContent.tsx",
  "src/app/laws/[slug]/_article-components.tsx",
  "src/app/laws/subscribe/page.tsx",
  "src/components/InvitationBanner.tsx",
] as const;
const TABS = ["FeqhTabContent", "LawsTabContent", "PrecedentsTabContent"] as const;

test("the response tells the page whether this viewer has the full library", () => {
  assert.match(source, /const \{ hasFullAccess, whitelistedSlugs, freeItemsByType \} = await getLibraryAccessForUser\(userId\)/);
  assert.match(source, /viewer: \{ hasFullAccess \}/);
});

test("/laws keeps the viewer flag from init and hands it to the three tabs", () => {
  const page = readRepo("src/app/laws/page.tsx");
  assert.match(page, /const \[viewerHasFullAccess, setViewerHasFullAccess\] = useState\(false\)/);
  // The first load and the server-filtered laws pages both carry it.
  const reads = page.match(/setViewerHasFullAccess\((?:data\?|body)\.viewer\?\.hasFullAccess === true\)/g) ?? [];
  assert.equal(reads.length, 2, "the first load and fetchLawsPage both read viewer.hasFullAccess");
  for (const tab of TABS) {
    const m = new RegExp(`<${tab}\\b`).exec(page);
    assert.ok(m, `${tab} is not rendered`);
    const tag = page.slice(m.index, page.indexOf("/>", m.index));
    assert.match(tag, /viewerHasFullAccess=\{viewerHasFullAccess\}/, `${tab} does not get the flag`);
  }
});

test("the tabs take viewerHasFullAccess as a required prop", () => {
  for (const tab of TABS) {
    const src = readRepo(`src/app/laws/components/${tab}.tsx`);
    assert.match(src, /\n\s*viewerHasFullAccess: boolean;/, `${tab} has no required viewerHasFullAccess prop`);
    assert.doesNotMatch(src, /useSubscription/, `${tab} still reads the tier on the client`);
  }
});

test("the law reader locks articles on the law API's paywall.hasFullAccess", () => {
  const page = readRepo("src/app/laws/[slug]/page.tsx");
  assert.match(page, /setViewerHasFullAccess\(data\?\.paywall\?\.hasFullAccess === true\)/);
  // Reset with the other per-law fields, so a new slug never inherits it.
  assert.match(page, /setPreambleLocked\(false\);\r?\n\s*setViewerHasFullAccess\(false\);/);
  const blocks = page.match(/<ArticleBlock\b[\s\S]*?\/>/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const block of blocks) assert.match(block, /viewerHasFullAccess=\{viewerHasFullAccess\}/);

  const reader = readRepo("src/app/laws/[slug]/_article-components.tsx");
  assert.match(reader, /viewerHasFullAccess: boolean;/);
  assert.match(reader, /const isLocked\s+= !article\.free && !viewerHasFullAccess;/);
});

test("the redeem CTA and the invitation banner ask GET /api/v1/library/access, and wait for it", () => {
  const subscribe = readRepo("src/app/laws/subscribe/page.tsx");
  assert.match(subscribe, /import \{ useLibraryFullAccess \} from "@\/lib\/library\/useLibraryFullAccess";/);
  assert.match(subscribe, /const canRedeemCode = isLoggedIn && isSupabaseMode && !libraryAccess\.loading && !libraryAccess\.hasFullAccess;/);

  const banner = readRepo("src/components/InvitationBanner.tsx");
  assert.match(banner, /import \{ useLibraryFullAccess \} from "@\/lib\/library\/useLibraryFullAccess";/);
  assert.match(banner, /const eligible = isLoggedIn && isSupabaseMode && !libraryAccess\.loading && !libraryAccess\.hasFullAccess;/);
});

test("none of the six sites gates library text on the tier-only can(\"library-full-access\")", () => {
  for (const rel of LIBRARY_ACCESS_SITES) {
    const src = readRepo(rel);
    assert.doesNotMatch(src, /library-full-access/, `${rel} still names the tier-only gate`);
  }
});

test("the assistant keeps its own rule: no full-library flag shows or hides it (owner ٢٠٧)", () => {
  const files = [...LIBRARY_ACCESS_SITES, "src/app/laws/page.tsx", "src/app/laws/[slug]/page.tsx"];
  const flag = /hasFullAccess|HasFullAccess|libraryAccess\./;
  for (const rel of files) {
    const lines = readRepo(rel).split(/\r?\n/);
    lines.forEach((line, i) => {
      // The assistant panel (and the line that would wrap it in a condition)
      // and the article's «اشرح لي» button.
      if (/<LibraryAI\b/.test(line)) {
        assert.doesNotMatch(`${lines[i - 1] ?? ""}\n${line}`, flag, `${rel}:${i + 1}: ${line.trim()}`);
      } else if (/showExplainBtn/.test(line)) {
        assert.doesNotMatch(line, flag, `${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
});

test("N2.5: the owner loader never sends the generated sort key (a generated column refuses a value)", () => {
  // The loader's table list lives in ownerLoaderTables.ts since note ١١ (2026-10-30).
  const loader = fs.readFileSync(path.join(here, "../../../../lib/library/ownerLoaderTables.ts"), "utf8");
  const laws = loader.match(/name: "laws",[\s\S]*?stripKeys: \[([^\]]*)\]/)?.[1] ?? "";
  for (const key of ["summary_brief", "catalogue_recency_key"]) assert.match(laws, new RegExp(`"${key}"`));
});
