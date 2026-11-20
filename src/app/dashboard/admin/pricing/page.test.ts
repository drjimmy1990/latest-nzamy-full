/**
 * page.test.ts — source contract for /dashboard/admin/pricing (S6-T8). The
 * page is a client component (React, phosphor icons), so it cannot load under
 * `node --test`; what it computes is executed in
 * src/lib/pricing/catalogAdminRules.test.ts, and the wiring is pinned here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("S6: the pricing screen is real", () => {
  assert.ok(source.includes('"/api/v1/admin/pricing-catalog"'), "the rows come from the admin API");
  assert.ok(source.includes("قريباً"), "the commission is «قريباً», with no number");
  for (const banned of ["محلياً", "Backend-ready", "individual-quick-question", "platformFeePct: 15", "حفظ محلي"]) {
    assert.equal(source.includes(banned), false, `the page still carries ${banned}`);
  }
});

test("S6: no invented rows, no local draft editor, no number for the market commission", () => {
  for (const banned of ["INITIAL_PRICING", "EMPTY_PRICING", "marketplace-platform-fee", "provider-verification-fee", "AdminPricingItem"]) {
    assert.equal(source.includes(banned), false, `the page still carries ${banned}`);
  }
  assert.match(source, /عمولة السوق: قريباً/);
  // owner ٤٢١ answered: the rates come from commission.ts, never a typed number
  assert.match(source, /\{commissionRatesLine\("ar"\)\}/);
  assert.doesNotMatch(source, /عمولة السوق[^"\n]*\d+\s*%/);
});

test("S6: an edit is a PATCH to the row's own URL, sending only what changed; the toast is the server's answer", () => {
  assert.match(source, /const API = "\/api\/v1\/admin\/pricing-catalog";/);
  assert.match(source, /`\$\{API\}\/\$\{encodeURIComponent\(row\.service_id\)\}`/);
  assert.ok(source.includes('method: "PATCH"'));
  assert.ok(source.includes("changedCatalogFields("), "the body is the diff against what the customer sees");
  assert.match(source, /json\.error \?\?/, "a refused save shows the server's error");
});

test("S6: loading, unreadable and empty are three different screens", () => {
  assert.ok(source.includes("listViewState("));
  assert.ok(source.includes('state === "loading"'));
  assert.ok(source.includes('state === "unreadable"'));
  assert.ok(source.includes('state === "empty"'));
  assert.ok(source.includes("تعذّرت قراءة قائمة الأسعار"));
});

test("S6: each row shows its audience, and a legacy row says it shows the code's price", () => {
  assert.ok(source.includes('"الأفراد"'), "individual badge");
  assert.ok(source.includes('"الأعمال"'), "corporate badge");
  assert.ok(source.includes("قديم — يُعرض سعر الكود"));
  assert.ok(source.includes("customerViewOf("), "a legacy row displays what the customer sees (the code entry)");
});

test("S6: the plans and top-ups are read-only, from the price book", () => {
  assert.ok(source.includes("الباقات والشحن — من دفتر الأسعار"));
  assert.ok(source.includes("تتغيّر بنشر الكود، لا من هذه الشاشة"));
  assert.ok(source.includes("bookSar("));
});

test("S6: the console is dark-only — zinc tokens, never text-gray-100/200, no dates", () => {
  assert.doesNotMatch(source, /text-gray-(100|200)\b/);
  assert.doesNotMatch(source, /new Date\(/);
  assert.ok(source.includes('toLocaleString("ar-SA")'));
});

test("S6 M7: no bare amount for a mode whose customer string prints none", () => {
  assert.match(source, /!AMOUNTLESS_PRICE_MODES\.includes\(view\.priceMode\) && <span>\{view\.basePrice\.toLocaleString\("ar-SA"\)\}<\/span>/);
});

test("S6 M10: the platform readiness list no longer says pricing is local-only", () => {
  const readiness = readFileSync(new URL("../../../../constants/adminBackendReadiness.ts", import.meta.url), "utf8");
  const pricing = [...readiness.matchAll(/id: "pricing",[\s\S]*?note: "[^"]*",/g)].map((m) => m[0]);
  assert.equal(pricing.length, 2, "fixture: both pricing entries found");
  for (const entry of pricing) {
    // S5-4 (l11-misc): the note is plain Arabic — it says the prices are saved
    // on the server, without naming the route (pricing-catalog stays in the
    // developer comment).
    const note = /note: "([^"]*)",/.exec(entry)?.[1] ?? "";
    assert.match(note, /تُحفظ على الخادم/);
    assert.doesNotMatch(entry, /محلياً|Pricing API|pricing API|AdminPricingItem/);
    assert.doesNotMatch(note, /[A-Za-z]/, "no Latin words in an admin-facing note");
  }
});

test("S5-4: the readiness list shows plain Arabic only (titles and notes), and the page prints no code names", () => {
  const readiness = readFileSync(new URL("../../../../constants/adminBackendReadiness.ts", import.meta.url), "utf8");
  const shown = [...readiness.matchAll(/(?:title|note): "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(shown.length >= 26, `fixture: ${shown.length} titles + notes`);
  for (const text of shown) assert.doesNotMatch(text, /[A-Za-z]/, `«${text}»`);
  const page = readFileSync(new URL("../platform/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /\{surface\.contract\}/);
  assert.doesNotMatch(page, /owner-level|مراجعة sitemap/);
});

test("S5-4: the shipped admin code carries no «Backend-ready» / «UI Working» / «Feature Flags» strings", () => {
  for (const rel of [
    "../../../../types/adminBackendReady.ts",
    "../../../../constants/adminBackendReadiness.ts",
    "../../../../constants/businessProfileReadiness.ts",
    "../../../../constants/firmProfileReadiness.ts",
    "../../../../constants/sectorProfileReadiness.ts",
    "../../../../constants/adminNavItems.ts",
    "../platform/page.tsx",
    "../business/page.tsx",
    "../sector-profiles/page.tsx",
    "../features/page.tsx",
  ]) {
    const code = readFileSync(new URL(rel, import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    for (const word of ['"Backend-ready"', '"UI Working"', '"Missing UI"', "Feature Flags", "Feature flag"]) {
      assert.equal(code.includes(word), false, `${rel}: ${word}`);
    }
  }
  // A readiness key is never printed raw: the sector page prints its Arabic label.
  const sector = readFileSync(new URL("../sector-profiles/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sector, /\{(?:item|control)\.readiness\}/);
});
