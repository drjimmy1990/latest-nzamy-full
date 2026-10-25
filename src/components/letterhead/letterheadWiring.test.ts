/**
 * letterheadWiring.test.ts — the letterhead (D4, owner ٢٥٦) survives the
 * site's print rules and is reachable by exactly the right people.
 *
 * globals.css @media print hides header/footer/nav/aside/button and forces
 * every background transparent; `.dark` remaps Tailwind's gray tokens. The
 * sheet is therefore built from <div>s with hex inline styles — pinned here,
 * because one innocent <footer> would silently drop the platform stamp from
 * every printed page.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getFirmRouteDecision } from "../../constants/entityRouteAccess.ts";
import { LAWYER_SIDEBAR, FIRM_SIDEBAR } from "../../constants/navigation.sidebars.legal.ts";

const sheet = readFileSync(new URL("./Letterhead.tsx", import.meta.url), "utf8");
const qr = readFileSync(new URL("./BrandedQr.tsx", import.meta.url), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the sheet uses no element the global print CSS hides, and no theme-remapped class", () => {
  for (const src of [code(sheet), code(qr)]) {
    assert.ok(!/<(header|footer|nav|aside|button)\b/.test(src), "no header/footer/nav/aside/button");
    assert.ok(!/className="[^"]*\b(text|bg|border)-(gray|slate|zinc)-/.test(src), "no Tailwind gray tokens");
  }
  assert.match(sheet, /<thead>/, "the header repeats on every page");
  assert.match(sheet, /position: fixed; left: 0; right: 0; bottom: 0/, "the footer sits at the foot of every page");
});

test("both dashboards link the letterhead; the firm page is for its owner, managing partner and office admin", () => {
  const hrefs = (groups: { items: { href: string }[] }[]) => groups.flatMap((g) => g.items.map((i) => i.href));
  assert.ok(hrefs(LAWYER_SIDEBAR).includes("/dashboard/lawyer/letterhead"));
  assert.ok(hrefs(FIRM_SIDEBAR).includes("/dashboard/firm/letterhead"));
  assert.equal(getFirmRouteDecision("/dashboard/firm/letterhead", "managing_partner").allowed, true);
  assert.equal(getFirmRouteDecision("/dashboard/firm/letterhead", "office_admin").allowed, true);
  for (const role of ["partner", "lawyer", "trainee", "legal_secretary", "finance_manager"] as const) {
    assert.equal(getFirmRouteDecision("/dashboard/firm/letterhead", role).allowed, false, role);
  }
});
