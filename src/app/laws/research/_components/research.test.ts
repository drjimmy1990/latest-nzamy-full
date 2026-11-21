/**
 * Researcher V3 (owner file 11) phase A2: the live stages move only on what the
 * server reported, and the progress watcher follows the key askLibrary sends.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/laws/research/_components/research.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  foldedIsEmpty,
  foldedSteps,
  mergeEvents,
  RESEARCH_STAGES,
  SENT_STEP_LABEL,
  sourcesCountAr,
  stageView,
  STAGE_WAITING_AR,
  type StageEvent,
} from "./researchStages.ts";
import { PROGRESS_POLL_MS, watchResearchProgress } from "./researchProgress.ts";
import { STEP_LABEL_AR } from "../../../../lib/ai/progressEvents.ts";
import { cartRefusal, citationCartEntry, slugFromSourceUrl } from "./researchCart.ts";
import { selectionPrompts } from "./researchPrompts.ts";
import { readFileSync } from "node:fs";
import { LAWS_STATIC_SEGMENTS, isLawReaderPath } from "../../../../components/library/libraryGuardPaths.ts";

const q = (label: string, id?: number): StageEvent => ({ id, kind: "query", label });

test("the four stage names are the owner's, in his order", () => {
  assert.deepEqual(RESEARCH_STAGES.map((s) => s.key), ["facts", "texts", "validity", "principles"]);
  assert.match(RESEARCH_STAGES[0].running, /تفكيك وقائع/);
  assert.match(RESEARCH_STAGES[1].running, /النصوص السارية/);
  assert.match(RESEARCH_STAGES[2].running, /سريان/);
  assert.match(RESEARCH_STAGES[3].running, /المبادئ/);
  // The «sent» step the stages listen for is the server's own label.
  assert.equal(SENT_STEP_LABEL, STEP_LABEL_AR.sent);
});

test("nothing reported: waiting, no stage ticked", () => {
  const v = stageView([], false);
  assert.equal(v.waiting, true);
  assert.equal(v.done, 0);
  assert.equal(v.headline, STAGE_WAITING_AR);
  assert.equal(v.counter, "1 / 4");
  assert.deepEqual(v.completed, []);
});

test("each stage completes only on its real event, in order", () => {
  assert.equal(stageView([q("مدة الإشعار")], false).done, 1);
  const sources = [q("مدة الإشعار"), { kind: "law", label: "نظام العمل — المادة 75" }];
  assert.equal(stageView(sources, false).done, 2);
  assert.equal(stageView(sources, false).counter, "3 / 4");
  const sent = [...sources, { kind: "step", label: SENT_STEP_LABEL }];
  assert.equal(stageView(sent, false).done, 3);
  assert.equal(stageView(sent, true).done, 4);
  assert.equal(stageView(sent, true).current, null);
  // A source without the search phrases before it does not skip stage 1.
  assert.equal(stageView([{ kind: "law", label: "x" }], false).done, 0);
  // Another step label (an engine stage) does not complete «السريان».
  assert.equal(stageView([...sources, { kind: "step", label: "يكتب الناتج" }], false).done, 2);
});

test("the folded steps list only what was recorded; the source count is Arabic", () => {
  const f = foldedSteps([q("مدة الإشعار", 1), q("مدة الإشعار", 2), { kind: "law", label: "نظام العمل — المادة 75" }, { kind: "principle", label: "مبدأ 12" }, { kind: "verify", label: "تحقق من إحالتين" }, { kind: "step", label: SENT_STEP_LABEL }]);
  assert.deepEqual(f, { queries: ["مدة الإشعار"], texts: ["نظام العمل — المادة 75"], principles: ["مبدأ 12"], checks: ["تحقق من إحالتين"] });
  assert.equal(foldedIsEmpty(foldedSteps([])), true);
  assert.equal(sourcesCountAr(0), "بلا مراجع");
  assert.equal(sourcesCountAr(1), "مرجع واحد");
  assert.equal(sourcesCountAr(2), "مرجعان");
  assert.equal(sourcesCountAr(3), "٣ مراجع");
  assert.equal(sourcesCountAr(12), "١٢ مرجعاً");
});

test("events merge by id, keep order, and drop malformed rows", () => {
  const a = mergeEvents([], [q("a", 1), q("b", 2)]);
  const b = mergeEvents(a, [q("b", 2), q("c", 3), { kind: 1 } as unknown as StageEvent]);
  assert.deepEqual(b.map((e) => e.label), ["a", "b", "c"]);
});

/** A manual clock: timers run only when the test says so. */
function harness(replies: Array<Response | Error>) {
  const urls: string[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let seq = 0;
  let t = 0;
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    const r = replies.shift() ?? new Response(JSON.stringify({ events: [] }), { status: 200 });
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const deps = {
    fetchImpl,
    setTimer: (fn: () => void, ms: number) => {
      timers.set(++seq, { fn, ms });
      return seq;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    now: () => t,
  };
  const tick = async () => {
    const [id, timer] = [...timers.entries()][0] ?? [];
    if (!timer) return null;
    timers.delete(id!);
    t += timer.ms;
    await timer.fn();
    await new Promise((r) => setImmediate(r));
    return timer.ms;
  };
  return { deps, urls, timers, tick };
}

const ok = (events: unknown[]) => new Response(JSON.stringify({ events }), { status: 200 });
const KEY1 = "11111111-1111-4111-8111-111111111111";
const KEY2 = "22222222-2222-4222-8222-222222222222";

test("the watcher polls the key every 1.5 s with a cursor, and hands only new events", async () => {
  const h = harness([ok([{ id: 5, kind: "query", label: "س" }]), ok([{ id: 7, kind: "law", label: "م" }])]);
  const got: StageEvent[][] = [];
  const w = watchResearchProgress((e) => got.push(e), h.deps);
  w.follow(KEY1);
  assert.equal(await h.tick(), PROGRESS_POLL_MS);
  assert.equal(h.urls[0], `/api/v1/ai/runs/progress?key=${KEY1}&after=0`);
  await h.tick();
  assert.equal(h.urls[1], `/api/v1/ai/runs/progress?key=${KEY1}&after=5`);
  assert.deepEqual(got.map((g) => g.map((e) => e.id)), [[5], [7]]);
  w.stop();
  assert.equal(h.timers.size, 0);
});

test("the watcher waits as asked on 429, survives a failed read, follows a retry's key and finishes with one read", async () => {
  const limited = new Response("{}", { status: 429, headers: { "Retry-After": "4" } });
  const h = harness([limited, new Error("offline"), ok([{ id: 9, kind: "query", label: "س" }]), ok([{ id: 11, kind: "verify", label: "تحقق" }])]);
  const got: StageEvent[] = [];
  const w = watchResearchProgress((e) => got.push(...e), h.deps);
  w.follow("not a key");
  assert.equal(h.timers.size, 0, "a malformed key is never polled");
  w.follow(KEY1);
  await h.tick();
  assert.equal([...h.timers.values()][0].ms, 4000);
  await h.tick();
  assert.equal([...h.timers.values()][0].ms, PROGRESS_POLL_MS);
  w.follow(KEY2);
  await h.tick();
  assert.match(h.urls[2], new RegExp(`key=${KEY2}&after=0$`));
  await w.finish();
  assert.match(h.urls[3], new RegExp(`key=${KEY2}&after=9$`));
  assert.deepEqual(got.map((e) => e.id), [9, 11]);
  assert.equal(h.timers.size, 0);
  w.follow(KEY1);
  assert.equal(h.timers.size, 0, "a finished watch stays stopped");
});

// ── A4: «حفظ للتجميع» and the selection toolbar's questions ──────────────────

const ART = { sid: "S1", kind: "article", id: "labor-law__art-77", title: "نظام العمل — المادة 77", url: "/laws/labor-law#labor-law__art-77" };
const full = { lawTitle: "نظام العمل", label: "المادة 77", status: "active", excerpt: "نص المادة كاملاً", truncated: false, locked: false, deviceRefused: false };

test("a complete, unlocked text becomes a draft-cart entry; an excerpt never does", () => {
  const e = citationCartEntry(ART, full);
  assert.ok(e);
  assert.equal(e.articleId, "labor-law__art-77");
  assert.equal(e.lawSlug, "labor-law");
  assert.equal(e.articleNum, "المادة 77");
  assert.equal(e.articleText, "نص المادة كاملاً");
  assert.equal(e.lawName, "نظام العمل");
  assert.equal(e.isArticleAdded, true);
  assert.equal(citationCartEntry(ART, { ...full, locked: true }), null, "a non-subscriber's excerpt");
  assert.match(String(cartRefusal(ART, { ...full, locked: true })), /لمشتركي المكتبة/);
  assert.equal(citationCartEntry(ART, { ...full, truncated: true }), null, "a cut text");
  assert.equal(citationCartEntry(ART, { ...full, excerpt: "  " }), null);
  assert.equal(citationCartEntry(ART, null), null, "not loaded yet");
  assert.equal(citationCartEntry({ ...ART, kind: "feqh" }, full), null);
  assert.equal(citationCartEntry({ ...ART, id: undefined }, full), null);
  const pr = citationCartEntry({ sid: "S2", kind: "principle", id: "LAW-98-1255__pr-1", title: "مبدأ 1", url: "/precedents/LAW-98-1255#LAW-98-1255__pr-1" }, { ...full, label: null, lawTitle: null });
  assert.equal(pr?.lawSlug, "LAW-98-1255");
  assert.equal(pr?.articleNum, "مبدأ 1");
  assert.equal(slugFromSourceUrl("/laws/%D9%86%D8%B8%D8%A7%D9%85#x"), "نظام");
  assert.equal(slugFromSourceUrl("https://evil.example/laws/x"), null);
});

test("the selection toolbar writes research questions (never a drafting request) and only for a real selection", () => {
  const p = selectionPrompts("  لا يُسقط   الإبراء العام حق التعويض ");
  assert.ok(p);
  assert.equal(p.ask, "فصّل التأصيل النظامي لهذه الجزئية: «لا يُسقط الإبراء العام حق التعويض»");
  assert.match(p.counter, /^ما الدفوع المضادة الممكنة/);
  assert.doesNotMatch(p.ask + p.counter, /اكتب|صُغ|صغ /);
  assert.equal(selectionPrompts("ab"), null);
  assert.equal(selectionPrompts("x".repeat(400))?.ask.length, "فصّل التأصيل النظامي لهذه الجزئية: «»".length + 300);
});

test("A6: /laws/research is a static page under the section guard, not indexed, and the tour has four cards", () => {
  assert.ok(LAWS_STATIC_SEGMENTS.has("research"));
  assert.equal(isLawReaderPath("/laws/research"), false);
  const page = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /<ResearchStudio \/>/);
  const tour = readFileSync(new URL("./ResearchTour.tsx", import.meta.url), "utf8");
  assert.equal((tour.match(/^\s+target: "/gm) ?? []).length, 4);
  assert.match(tour, /إغلاق وعدم الإظهار/);
  assert.match(tour, /try \{\s*return window\.localStorage\.getItem\(TOUR_HIDDEN_KEY\) === "1";/);
  const studio = readFileSync(new URL("./ResearchStudio.tsx", import.meta.url), "utf8");
  // Phase B is not built: the sidebar says so, and no question text goes to the browser's storage.
  assert.match(studio, /حفظ سجل أبحاثك في حسابك ومزامنته بين أجهزتك — قريباً\./);
  assert.doesNotMatch(studio + readFileSync(new URL("./useLibraryResearch.ts", import.meta.url), "utf8"), /localStorage|sessionStorage/);
  assert.match(studio, /<NotePencil /);
  assert.match(studio, /href="\/login\?next=%2Flaws%2Fresearch"/);
  // A5 copy confirmation: two seconds.
  const actions = readFileSync(new URL("./ResearchAnswerActions.tsx", import.meta.url), "utf8");
  assert.match(actions, /export const COPY_CONFIRM_MS = 2000;/);
  assert.match(actions, /جارٍ تجهيز ملف Word…/);
  assert.match(actions, /motion-safe:active:scale/);
});
