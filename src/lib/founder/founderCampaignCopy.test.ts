/**
 * The founder campaign's materials must not carry the phrases the owner
 * removed on 17 Nov 2026 (TEST-PLAN أ.4–5, README «محذوف»): the Najiz
 * illustrated index, the library's old «251», the academy, «مستشار» as a
 * product word, the absolute «لن يتكرر أبداً», and the prototype's
 * «عيّنة توضيحية» / preview bar. Comments are stripped first — only what
 * can reach the page counts.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const CAMPAIGN_FILES = [
  ...files(join(SRC, "app", "founder")),
  ...files(join(SRC, "app", "founder-terms")),
  ...files(join(SRC, "lib", "founder")),
  join(SRC, "app", "dashboard", "lawyer", "_components", "FounderCampaignNotice.tsx"),
];

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const BANNED: Array<[RegExp, string]> = [
  [/الفهرس المصو[ّ]?ر لناجز/, "the Najiz illustrated index"],
  [/(?<![0-9])251(?![0-9])|٢٥١/, "the library's old 251"],
  [/الأكاديمية|أكاديمية/, "the academy"],
  [/مستشار/, "«مستشار» as a product word"],
  [/لن يتكرر أبد/, "an absolute «never again»"],
  [/توضيحي|توضيحية/, "a prototype «illustrative» label"],
  [/className="dev"|class="dev"/, "the prototype's preview bar"],
  [/25\s*يناير|٢٥\s*يناير|2027-01/, "the superseded end date"],
];

test("campaign files exist", () => {
  assert.ok(CAMPAIGN_FILES.length >= 10, CAMPAIGN_FILES.join("\n"));
});

test("no removed phrase reaches the founder campaign pages", () => {
  for (const path of CAMPAIGN_FILES) {
    const text = code(path);
    for (const [re, what] of BANNED) {
      assert.doesNotMatch(text, re, `${path}: ${what}`);
    }
  }
});

test("the landing page keeps the owner's required lines", () => {
  const page = code(join(SRC, "app", "founder", "page.tsx"));
  for (const s of ["ستة أعمال قضائية كاملة بالصائغ القانوني", "FOUNDER_ADVOCATE_ONLY_LINE", "FOUNDER_ONCE_LINE", "<s ", "LibraryGifs", "SampleMemos"]) {
    assert.ok(page.includes(s), s);
  }
  assert.doesNotMatch(page, /<Navbar|<Footer/, "the site-wide navbar/footer name removed products");
});

test("owner 17 Nov (١٢، ١٥، ١٧، ١٨): the library year, the 100 founding points, the 14-day refund, «ساعات لا أيام»", () => {
  const page = code(join(SRC, "app", "founder", "page.tsx"));
  for (const s of [
    "مكتبة قانونية ضخمة لسنة كاملة من تفعيلك، تغذّي الصائغ بالنص ولائحته",
    "<li>١٠٠ نقطة تأسيسية لمساعد المكتبة الذكي.</li>",
    "والشحن لا يجدّد السنة",
    "ويصلك ١٠٠ نقطة تأسيسية لمساعد المكتبة الذكي وحده، والسؤال الواحد عليه يخصم ٥ نقاط، فإذا نفدت أُغلق المساعد الذكي وحده",
    "وتبقى المكتبة مفتوحة طوال السنة",
    "نعم، خلال ١٤ يوماً من الشراء إن لم تستخدم أي ميزة ذكاء اصطناعي في الباقة، ولا يمنع الاسترداد تصفح المكتبة، ويُردّ المبلغ كاملاً شاملاً الضريبة، وفق",
    "في ساعات لا في أيام",
  ]) {
    assert.ok(page.includes(s), s);
  }
  assert.doesNotMatch(page, /٣٦٥ يوماً/, "the library is a year from activation, not a fixed 365 days");
  // the refund answer links item ٧ of the terms page; so does the footer's «سياسة الاسترداد» (file 09 أ-11)
  assert.match(page, /وفق\{" "\}\s*<Link href=\{FOUNDER_TERMS_REFUND_PATH\}/);
  assert.match(page, /<Link href=\{FOUNDER_TERMS_REFUND_PATH\} className="hover:text-\[#E6CD8E\]">\s*سياسة الاسترداد/);
  assert.doesNotMatch(page, /خدمات الباقة/, "the old refund wording the owner fixed on 18 Nov");
  assert.doesNotMatch(page, /المرخّص للترافع/, "file 09 أ-9: «للمحامي المرخص فقط»");
});

test("V16: the promo sits right after the hero, with a poster, controls, no autoplay, loaded only on play", () => {
  const page = code(join(SRC, "app", "founder", "page.tsx"));
  const video = page.slice(page.indexOf("<video"), page.indexOf("</video>"));
  assert.ok(video.length > 0, "a <video> element");
  assert.ok(page.indexOf("<video") > page.indexOf('id="founder-h1"') && page.indexOf("<video") < page.indexOf('id="samples"'), "after the hero, before the samples");
  for (const s of ["controls", 'preload="none"', "playsInline", "poster={PROMO_POSTER_SRC}"]) assert.ok(video.includes(s), s);
  assert.doesNotMatch(video, /autoPlay|autoplay/);
  assert.match(page, /const PROMO_VIDEO_SRC = "\/media\/founder\/promo-whatsapp-720p\.mp4";/);
  assert.match(page, /const PROMO_POSTER_SRC = "\/media\/founder\/video-poster\.jpg";/);
  assert.match(page, /<figcaption/);
  for (const f of ["promo-whatsapp-720p.mp4", "video-poster.jpg"]) {
    const size = statSync(join(SRC, "..", "public", "media", "founder", f)).size;
    assert.ok(size > 10_000 && size < 10_000_000, `${f}: ${size} bytes`);
  }
});
