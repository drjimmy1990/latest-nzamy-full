import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * B6 — a dead-link test for the WhatsApp floating menu.
 *
 * `floatingServices.tsx` carries ~89 internal `href`s across every role's
 * quick-action menu. Nobody clicks all of them by hand after a route gets
 * renamed or a dashboard section gets dropped, so a stale `href` sits there
 * silently until a real user hits it.
 *
 * WHY TEXT, NOT IMPORT — floatingServices.tsx is a .tsx module: it imports
 * React and a dozen @phosphor-icons/react components, and every service's
 * `icon` field is JSX (`<ChatCircle {...iconProps} />`). This repo's
 * `test:unit` script runs every `.test.ts` file under `src` straight
 * through Node's built-in TypeScript support (no bundler, no ts-node),
 * which strips TYPE annotations only — it does not transform JSX.
 * Importing floatingServices.tsx from a `.test.ts` file would throw a
 * SyntaxError on the first `<Icon ... />` it hits, before any test body
 * runs. The href strings are also all this test needs; rendering the icons
 * is not. So the file is read as plain text and every `href: "..."` is
 * pulled out with a regex instead.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONSTANTS_FILE = path.join(REPO_ROOT, "src", "components", "floating", "constants", "floatingServices.tsx");
const APP_DIR = path.join(REPO_ROOT, "src", "app");

// Every `href: "..."` string literal in the constants file, in source order,
// duplicates included (a href reused by five roles should still be checked
// five times — cheap, and it keeps the count meaningful as a sanity check).
//
// One entry sets `href` with a ternary between two string literals instead
// of a plain literal (`href: serviceMode ? "/a" : "/b"`), both branches on
// one line. A regex anchored on `href:\s*"` never reaches either string
// there, because a quote isn't the next non-space character after `href:`.
// So this grabs the rest of the line after `href:` first, then pulls every
// quoted string out of *that* — one for a plain literal, both for a
// ternary. No line in the file sets `href` twice, so per-line capture can't
// bleed into an unrelated field.
async function extractHrefs(): Promise<string[]> {
  const body = await readFile(CONSTANTS_FILE, "utf8");
  const hrefs: string[] = [];
  const lineRe = /href:\s*([^\n]+)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRe.exec(body)) !== null) {
    const literalRe = /"([^"]*)"/g;
    let literalMatch: RegExpExecArray | null;
    while ((literalMatch = literalRe.exec(lineMatch[1])) !== null) {
      hrefs.push(literalMatch[1]);
    }
  }
  return hrefs;
}

const PAGE_FILENAMES = ["page.tsx", "page.ts", "page.jsx", "page.js"];
const ROUTE_FILENAMES = ["route.ts", "route.js"];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasPageOrRoute(dir: string): Promise<boolean> {
  for (const name of [...PAGE_FILENAMES, ...ROUTE_FILENAMES]) {
    if (await fileExists(path.join(dir, name))) return true;
  }
  return false;
}

/**
 * Does a concrete App Router page or route exist for these path segments?
 *
 * - A route group folder `(x)` is transparent: it does not consume a
 *   segment, so `/x` can resolve through `app/(group)/x/page.tsx`.
 * - A dynamic segment folder `[x]` consumes exactly one segment and matches
 *   any value there (`/dashboard/lawyer/clients/[id]` satisfies
 *   `/dashboard/lawyer/clients/anything`).
 * - A catch-all folder (`[...x]` or `[[...x]]`) is deliberately NOT treated
 *   as a match. The app has exactly one, `src/app/[...slug]/page.tsx`, and
 *   it renders a generic "coming soon" placeholder
 *   (`src/components/ComingSoon.tsx`) for whatever path reaches it — it is
 *   not a real destination for any of these menu items. Counting it as a hit
 *   would make every href in the file "resolve", which defeats the point of
 *   a dead-link test.
 */
async function routeExists(segments: string[], dir: string = APP_DIR, index = 0): Promise<boolean> {
  if (index === segments.length) return hasPageOrRoute(dir);

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  const segment = segments[index];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;

    if (name.startsWith("(") && name.endsWith(")")) {
      if (await routeExists(segments, path.join(dir, name), index)) return true;
      continue;
    }

    if (name.startsWith("[") && name.endsWith("]")) {
      const inner = name.slice(1, -1);
      if (inner.startsWith("...") || inner.startsWith("[...")) continue; // catch-all: not a match, see doc above
      if (await routeExists(segments, path.join(dir, name), index + 1)) return true;
      continue;
    }

    if (name === segment) {
      if (await routeExists(segments, path.join(dir, name), index + 1)) return true;
    }
  }

  return false;
}

function toSegments(href: string): string[] {
  const withoutQuery = href.split("?")[0].split("#")[0];
  return withoutQuery.split("/").filter(Boolean);
}

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

const PLACEHOLDER_MARKERS = [
  { needle: "966XXXXXXXXX", label: "wa.me/966XXXXXXXXX placeholder" },
  { needle: "966500000000", label: "966500000000 placeholder" },
];

test("the extractor finds real hrefs — not vacuously passing", async () => {
  const hrefs = await extractHrefs();
  assert.ok(hrefs.length > 50, `found only ${hrefs.length} href literals in floatingServices.tsx — the regex broke`);

  const internal = hrefs.filter(isInternal);
  assert.ok(internal.length > 50, `found only ${internal.length} internal hrefs — expected ~89`);
});

test("every internal href in the floating menu resolves to a real route", async () => {
  const hrefs = await extractHrefs();
  const internal = [...new Set(hrefs.filter(isInternal))];

  const dead: string[] = [];
  for (const href of internal) {
    const segments = toSegments(href);
    if (!(await routeExists(segments))) dead.push(href);
  }

  assert.deepEqual(
    dead,
    [],
    `floatingServices.tsx links to ${dead.length} route(s) with no page.tsx/route.ts under src/app:\n  ` +
      dead.join("\n  "),
  );
});

test("no href carries a wa.me placeholder number", async () => {
  const hrefs = await extractHrefs();

  const offenders: string[] = [];
  for (const href of hrefs) {
    for (const { needle, label } of PLACEHOLDER_MARKERS) {
      if (href.includes(needle)) offenders.push(`${href} (${label})`);
    }
  }

  assert.deepEqual(offenders, [], `placeholder number(s) left in an href:\n  ${offenders.join("\n  ")}`);
});
