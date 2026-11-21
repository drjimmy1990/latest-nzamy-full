import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRAFT_GUIDANCE_LINE,
  DRAFT_LIMITS_DEFAULT,
  DRAFT_LOCKED_LINE,
  capForCopy,
  draftDocBlocks,
  draftDocKey,
  draftEntryPath,
  draftLimitsIssue,
  draftShareLinks,
  draftShareMessage,
  parseDraftExportBody,
  parseDraftLimits,
  riyadhDateAr,
  shareExcerpt,
  type DraftExportItem,
} from "./draftExport.ts";
import { draftCarriesText, resolveDraftEntries, DRAFT_LOCKED_TITLE_CHARS } from "./draftExportResolve.ts";

const APP = join(import.meta.dirname, "../../app");

const item = (over: Partial<DraftExportItem> = {}): DraftExportItem => ({
  articleId: "labor-law__art-77",
  lawSlug: "labor-law",
  lawName: "نظام العمل",
  label: "المادة ٧٧",
  title: "إنهاء العقد",
  withArticle: true,
  withExecReg: false,
  text: "نص من السلة",
  ...over,
});

test("limits: defaults 30 items / 200 characters; a bad field takes its default; the admin validator", () => {
  assert.deepEqual(parseDraftLimits(null), DRAFT_LIMITS_DEFAULT);
  assert.deepEqual(parseDraftLimits({ max_items: 10, share_excerpt_chars: 120 }), { maxItems: 10, shareExcerptChars: 120 });
  assert.deepEqual(parseDraftLimits({ max_items: 0, share_excerpt_chars: 9999 }), DRAFT_LIMITS_DEFAULT);
  assert.equal(draftLimitsIssue({ max_items: 30, share_excerpt_chars: 200 }), null);
  assert.ok(draftLimitsIssue({ max_items: 30 }));
  assert.ok(draftLimitsIssue({ max_items: 30, share_excerpt_chars: 200, x: 1 }));
  assert.ok(draftLimitsIssue([]));
});

test("the request: shapes checked, duplicates once, over the cap refused with a clear message", () => {
  const ok = parseDraftExportBody({ items: [item(), item(), item({ articleId: "labor-law__art-78" })] }, DRAFT_LIMITS_DEFAULT);
  assert.ok(ok.ok && ok.items.length === 2);
  const empty = parseDraftExportBody({ items: [] }, DRAFT_LIMITS_DEFAULT);
  assert.ok(!empty.ok && empty.status === 400);
  const bad = parseDraftExportBody({ items: [{ ...item(), articleId: "<script>" }] }, DRAFT_LIMITS_DEFAULT);
  assert.ok(!bad.ok);
  const many = parseDraftExportBody({ items: Array.from({ length: 3 }, (_, i) => item({ articleId: `a-${i}` })) }, { maxItems: 2, shareExcerptChars: 200 });
  assert.ok(!many.ok && many.status === 413 && /2/.test(many.error));
  const order = parseDraftExportBody({ items: [item({ lawSlug: "orders/abc", articleId: "order-abc-art-0" })] }, DRAFT_LIMITS_DEFAULT);
  assert.ok(order.ok, "a royal order's slug orders/<id> is accepted");
});

test("answer أ: one quota document per draft — the same items in any order are one key, a changed draft another", () => {
  const a = item();
  const b = item({ articleId: "labor-law__art-78" });
  assert.equal(draftDocKey([a, b]), draftDocKey([b, a]));
  assert.notEqual(draftDocKey([a, b]), draftDocKey([a]));
  assert.notEqual(draftDocKey([a]), draftDocKey([{ ...a, withExecReg: true }]));
  assert.match(draftDocKey([a]), /^draft:[0-9a-f]{16}$/);
});

test("resolve: a law article's text comes from the SERVER row, never the cart; locked = title only", () => {
  const rows = [{ id: "labor-law__art-77", law_slug: "labor-law", title: "إنهاء العقد", text: "النص الرسمي", article_regulations: [{ ref: "اللائحة (م/٥١ بتاريخ ١٤٢٦)", text: "نص اللائحة", sort_key: "1" }] }];
  const sub = resolveDraftEntries([item({ withExecReg: true })], rows, { isSubscriber: true, openLaws: new Set() });
  assert.equal(sub[0].text, "النص الرسمي");
  assert.equal(sub[0].execReg?.text, "نص اللائحة");
  assert.equal(sub[0].source, "library");
  const guest = resolveDraftEntries([item({ withExecReg: true, text: "نص كامل مزوَّر" })], rows, { isSubscriber: false, openLaws: new Set() });
  assert.equal(guest[0].text, null, "a non-subscriber gets no text");
  assert.equal(guest[0].execReg, null);
  assert.ok(!JSON.stringify(guest).includes("مزوَّر"), "the cart's text never reaches the file");
  const open = resolveDraftEntries([item()], rows, { isSubscriber: false, openLaws: new Set(["labor-law"]) });
  assert.equal(open[0].text, "النص الرسمي", "an open law is open to everyone, as in the reader");
  const longTitle = resolveDraftEntries([item()], [{ ...rows[0], title: "ت".repeat(500) }], { isSubscriber: false, openLaws: new Set() });
  assert.equal(longTitle[0].title.length, DRAFT_LOCKED_TITLE_CHARS);
});

test("resolve: anything that is not a law article — cart text for a subscriber only", () => {
  const order = item({ lawSlug: "orders/abc", articleId: "order-abc-art-0", text: "نص الأمر" });
  assert.equal(resolveDraftEntries([order], [], { isSubscriber: true, openLaws: new Set() })[0].text, "نص الأمر");
  assert.equal(resolveDraftEntries([order], [], { isSubscriber: false, openLaws: new Set() })[0].text, null);
  assert.equal(resolveDraftEntries([order], [], { isSubscriber: true, openLaws: new Set() })[0].source, "cart");
});

test("answer ب / the count: only a file carrying text is a full open", () => {
  const base = { lawName: "ن", lawSlug: "s", label: "م", title: "ت", execReg: null, source: "library" as const };
  assert.equal(draftCarriesText([{ ...base, text: null }]), false);
  assert.equal(draftCarriesText([{ ...base, text: "نص" }]), true);
  assert.equal(draftCarriesText([{ ...base, text: null, execReg: { ref: "", text: "لائحة" } }]), true);
});

test("the Word body: «استرشادي» header, the download date, a source line per item, the locked line", () => {
  const blocks = draftDocBlocks(
    [
      { lawName: "نظام العمل", lawSlug: "labor-law", label: "المادة ٧٧", title: "إنهاء العقد", text: "**النص** [S1]", execReg: null, source: "library" },
      { lawName: "نظام العمل", lawSlug: "labor-law", label: "المادة ٧٨", title: "", text: null, execReg: null, source: "library" },
    ],
    new Date("2026-11-21T22:30:00Z"),
    "https://nezamy.sa/",
  );
  const flat = blocks.map((b) => ("text" in b ? b.text : "")).join("\n");
  assert.ok(flat.includes(DRAFT_GUIDANCE_LINE));
  assert.ok(flat.startsWith("مسودة التجميع"));
  assert.ok(flat.includes("تاريخ التنزيل: ٢٠٢٦/١١/٢٢"), "Riyadh date (UTC+3), Arabic digits");
  assert.ok(flat.includes("المصدر: نظام العمل — المادة ٧٧ — https://nezamy.sa/laws/labor-law"));
  assert.ok(flat.includes(DRAFT_LOCKED_LINE));
  assert.ok(flat.includes("النص") && !flat.includes("**") && !flat.includes("[S1]"));
  assert.equal(blocks.filter((b) => b.kind === "heading" && b.text === "نظام العمل").length, 1, "one heading per law");
  assert.equal(riyadhDateAr(new Date("2026-01-05T00:00:00Z")), "٢٠٢٦/٠١/٠٥");
});

test("answer ج / the share: title, a short excerpt and the link — never the full text", () => {
  const full = "كلمة ".repeat(400);
  const msg = draftShareMessage({ title: "المادة ٧٧ من نظام العمل", text: full, url: "https://nezamy.sa/laws/labor-law" }, { maxItems: 30, shareExcerptChars: 120 });
  const lines = msg.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].length <= 121 && lines[1].endsWith("…"));
  assert.ok(msg.length < full.length / 4);
  assert.equal(shareExcerpt("قصير", 200), "قصير");
  const links = draftShareLinks(msg, "https://nezamy.sa/laws/labor-law");
  assert.ok(links.whatsapp.startsWith("https://wa.me/?text="));
  assert.ok(links.x.startsWith("https://x.com/intent/post?text="));
  assert.equal(links.linkedin, "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fnezamy.sa%2Flaws%2Flabor-law");
  assert.equal(draftEntryPath("orders/abc"), "/laws/orders/abc");
  assert.equal(draftEntryPath("نظام-العمل"), `/laws/${encodeURIComponent("نظام-العمل")}`);
});

test("copy-all stops at the admin cap and says how many were left", () => {
  assert.deepEqual(capForCopy([1, 2, 3], { maxItems: 2, shareExcerptChars: 200 }), { kept: [1, 2], left: 1 });
  assert.deepEqual(capForCopy([1], { maxItems: 2, shareExcerptChars: 200 }), { kept: [1], left: 0 });
});

test("the export route: gate, sign-in, server re-read, device then ONE quota read, private answer", () => {
  const src = readFileSync(join(APP, "api/library/draft-export/route.ts"), "utf8");
  const at = (s: string) => {
    const i = src.indexOf(s);
    assert.ok(i > -1, s);
    return i;
  };
  const gate = at("await libraryGate()");
  const signIn = at("await requireApiUser(supabase,");
  const reread = at('.from("articles")');
  const device = at("await enforceLibraryDevice(userId, isSubscriber)");
  const quota = at("libraryReadQuotaHit(userId, draftDocKey(items))");
  const docx = at("minimalDocx(");
  assert.ok(gate < signIn && signIn < reread && reread < device && device < quota && quota < docx);
  assert.equal((src.match(/libraryReadQuotaHit\(/g) ?? []).length, 1, "the whole draft counts once (answer أ)");
  assert.ok(src.includes("draftCarriesText(entries)"), "a file of titles only spends nothing");
  assert.ok(src.includes('"private, no-store"'));
});

test("the drawer: ordered groups (copy+Word, share, send) — Word from the server, share never the full text", () => {
  const src = readFileSync(join(APP, "../components/laws/DraftDrawer.tsx"), "utf8");
  const copyAt = src.indexOf('"نسخ وتنزيل"');
  const shareAt = src.indexOf('isRTL ? "مشاركة" : "Share"}</p>');
  const sendAt = src.indexOf('isRTL ? "إرسال" : "Send"}</p>');
  assert.ok(copyAt > -1 && shareAt > copyAt && sendAt > shareAt, "the three groups, in his order");
  assert.ok(src.includes('fetch("/api/library/draft-export", {\n        method: "POST"') || src.includes('fetch("/api/library/draft-export", {\r\n        method: "POST"'));
  assert.doesNotMatch(src, /plainResultDocx|minimalDocx/, "the file is never built from the cart in the browser");
  assert.ok(src.includes("draftShareMessage("), "share = title + excerpt + link");
  assert.doesNotMatch(src, /navigator\.share\(/);
  assert.ok(src.includes("writeLibraryHandoff(sessionStorageOrNull(), text, label)"));
  assert.ok(src.includes('toolRoleRefusal(AI_TOOLS["legal-drafter"]'), "the drafter button only for the drafter's roles");
  assert.ok(src.includes("capForCopy("), "copy-all stops at the admin cap");
});
