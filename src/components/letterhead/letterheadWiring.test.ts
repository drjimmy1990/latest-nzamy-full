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
import { LETTERHEAD_REDIRECT, parseVaultTab } from "./legalVaultTabs.ts";
import { identityInputsLocked } from "./letterheadFormLock.ts";

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

test("both dashboards reach the letterhead THROUGH the vault (note 09 §٤); the firm vault is for its owner, managing partner and office admin", () => {
  const hrefs = (groups: { items: { href: string }[] }[]) => groups.flatMap((g) => g.items.map((i) => i.href));
  // NOTE-09-C06: no separate letterhead entry, no «قريباً» vault.
  assert.ok(hrefs(LAWYER_SIDEBAR).includes("/dashboard/lawyer/vault"));
  assert.ok(!hrefs(LAWYER_SIDEBAR).includes("/dashboard/lawyer/letterhead"));
  assert.ok(!hrefs(LAWYER_SIDEBAR).includes("/ai/vault"), "the lawyer's vault is no longer the «قريباً» /ai/vault");
  assert.ok(hrefs(FIRM_SIDEBAR).includes("/dashboard/firm/vault?tab=branding"));
  assert.ok(!hrefs(FIRM_SIDEBAR).includes("/dashboard/firm/letterhead"));
  for (const groups of [LAWYER_SIDEBAR, FIRM_SIDEBAR]) {
    const labels = groups.flatMap((g) => g.items.map((i) => (i as { label: string }).label));
    assert.ok(!labels.includes("الورق المروّس"), "no separate «الورق المروّس» entry");
  }
  for (const path of ["/dashboard/firm/vault", "/dashboard/firm/letterhead"]) {
    assert.equal(getFirmRouteDecision(path, "managing_partner").allowed, true, path);
    assert.equal(getFirmRouteDecision(path, "office_admin").allowed, true, path);
    for (const role of ["partner", "lawyer", "trainee", "legal_secretary", "finance_manager"] as const) {
      assert.equal(getFirmRouteDecision(path, role).allowed, false, `${path} ${role}`);
    }
  }
});

test("the old letterhead pages redirect permanently into the vault's branding tab", () => {
  for (const scope of ["lawyer", "firm"] as const) {
    const src = code(readFileSync(new URL(`../../app/dashboard/${scope}/letterhead/page.tsx`, import.meta.url), "utf8"));
    assert.match(src, /permanentRedirect\(LETTERHEAD_REDIRECT\.(lawyer|firm)\)/);
    assert.ok(src.includes(`LETTERHEAD_REDIRECT.${scope}`), scope);
    assert.ok(!/"use client"/.test(src), "a server redirect, not a client hop");
    const vault = code(readFileSync(new URL(`../../app/dashboard/${scope}/vault/page.tsx`, import.meta.url), "utf8"));
    assert.ok(!/"use client"/.test(vault) && /await searchParams/.test(vault), "the vault page reads ?tab on the server");
    assert.ok(!/DashboardComingSoon/.test(vault));
  }
  assert.deepEqual(LETTERHEAD_REDIRECT, { lawyer: "/dashboard/lawyer/vault?tab=branding", firm: "/dashboard/firm/vault?tab=branding" });
  assert.equal(parseVaultTab("branding"), "branding");
  assert.equal(parseVaultTab(["branding", "documents"]), "branding");
  for (const v of [undefined, null, "", "x", "documents"]) assert.equal(parseVaultTab(v), "documents");
});

test("NOTE-09-C03/C04: the letter editor is gone; the page prints the letterhead blank", () => {
  const ws = code(readFileSync(new URL("./LetterheadWorkspace.tsx", import.meta.url), "utf8"));
  for (const gone of ["lh-body", "lh-subject", "lh-to", "lh-sign", "setLetter", "LetterBody"]) {
    assert.ok(!ws.includes(gone), `${gone} removed`);
  }
  assert.match(ws, /<BlankBody \/>[\s\S]*printRoot/, "the printed copy is the blank sheet");
  assert.match(ws, /preview === "sample" \? <SampleBody \/> : <BlankBody \/>/, "the sample text is preview-only");
});

test("CODE-F37: every identity input is locked while a save is in flight", () => {
  assert.equal(identityInputsLocked({ available: true, canManage: true, saveKind: "saving" }), true);
  assert.equal(identityInputsLocked({ available: true, canManage: true, saveKind: "idle" }), false);
  assert.equal(identityInputsLocked({ available: true, canManage: true, saveKind: "saved" }), false);
  assert.equal(identityInputsLocked({ available: true, canManage: true, saveKind: "error" }), false);
  assert.equal(identityInputsLocked({ available: false, canManage: true, saveKind: "idle" }), true);
  assert.equal(identityInputsLocked({ available: true, canManage: false, saveKind: "idle" }), true, "owner ٣١٥: no manage permission");
  const ws = code(readFileSync(new URL("./LetterheadWorkspace.tsx", import.meta.url), "utf8"));
  const inputs = ws.match(/<input\b[\s\S]*?\/>/g) ?? [];
  const identityInputs = inputs.filter((i) => /id="lh-|id=\{`lh-/.test(i));
  assert.equal(identityInputs.length, 2, "the text inputs (mapped) and the colour picker");
  for (const i of identityInputs) assert.match(i, /disabled=\{locked\}/, i.slice(0, 60));
  // The «ذهبي المنصة» reset and the logo buttons obey the same lock.
  assert.match(ws, /setField\("accent_color", BRANDING_DEFAULT_ACCENT\)\} disabled=\{locked\}/);
  assert.equal((ws.match(/disabled=\{locked \|\| logoState\.kind === "busy"\}/g) ?? []).length, 2);
  // setField itself refuses while locked (a keystroke racing the disable).
  assert.match(ws, /const setField = [^\n]*\n\s*if \(locked\) return;/);
});

test("owner ٣١٥: printing follows the server's explicit permission, never a role guessed on the page", () => {
  const ws = code(readFileSync(new URL("./LetterheadWorkspace.tsx", import.meta.url), "utf8"));
  assert.match(ws, /\{permissions\.print \? \(\s*<button\s*onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(ws, /printRoot && identity && permissions\.print && createPortal/);
  assert.ok(!/managing_partner|office_admin/.test(ws), "no role names on the page");
});
