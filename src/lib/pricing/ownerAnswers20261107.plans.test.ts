/**
 * Owner answers of 3 Nov 2026 (٤١٩–٤٢٣, ٤٣٠–٤٣٨) — the plan / price / copy
 * pieces that are not held by a pure-function test elsewhere. The pricing
 * constants import the `@/` alias and React icons, which node:test cannot
 * load, so most checks read the source.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bookSar } from "./priceBook.ts";
import { resolveRequestedPlan } from "./planRequest.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("٤١٩: the smart plan badge is the yearly 249 over 12 months, on /pricing and /services/individuals", () => {
  assert.equal(bookSar("ind-ai", "yearly") / 12, 20.75);
  for (const rel of ["constants/pricing/pricing.individuals.ts", "lib/pricing/plans.ts"]) {
    const text = src(rel);
    assert.ok(text.includes("ما يعادل ٢٠٫٧٥ ر.س شهرياً تُدفع سنوياً"), `${rel}: Arabic badge`);
    assert.ok(text.includes("≈ SAR 20.75/month, billed yearly"), `${rel}: English badge`);
    assert.doesNotMatch(text, /٠٫٦٨|0\.68/, `${rel}: the old per-day figure`);
  }
});

test("٤٢٠: «عضوية الحماية القانونية» is a «قريباً» card — no price, no signup link, never requestable", () => {
  const text = src("constants/pricing/pricing.individuals.ts");
  for (const [lang, name] of [["ar", "عضوية الحماية القانونية"], ["en", "Legal Protection Membership"]] as const) {
    const at = text.indexOf(`id: "ind-protection", name: "${name}"`);
    assert.ok(at > 0, `${lang}: card missing`);
    const card = text.slice(at, text.indexOf("features:", at));
    assert.match(card, /comingSoon: true/, lang);
    assert.doesNotMatch(card, /priceMonthly|priceYearly|\/register\//, `${lang}: no price, no signup link (question ٤٥٣)`);
  }
  assert.ok(text.includes("حماية قانونية سنوية للأفراد — تُفتح قريباً"));
  // a crafted ?plan= never resolves to it, even with a signup-looking href
  const plans = [{ id: "ind-protection", name: "x", ctaHref: "/register/client?type=individual&plan=ind-protection", comingSoon: true }];
  assert.equal(resolveRequestedPlan("ind-protection", plans), null);
  // the card renders a disabled «قريباً» button, not the subscribe link
  const cards = src("components/pricing/PricingCards.tsx");
  assert.match(cards, /comingSoon \? \(\s*<button\s+type="button"\s+disabled/);
  assert.match(cards, /const badgeText = comingSoon \? soonText : plan\.badge;/);
  assert.match(cards, /\{comingSoon \? soonText : price\}/);
});

test("٤٣٧: every corporate card carries «بعض المزايا قريباً» and no unbuilt feature line is ticked ✅", () => {
  const unbuilt = /سوق|عقود الموظفين|HR|حوكمة|تقارير|انتداب|إدارات|إشراف مجتمع|Kanban|SSO|API|Marketplace|Employee contracts|[Gg]overnance|[Rr]eports|[Ss]econdment|[Cc]ommunity|Departments/;
  for (const rel of ["constants/pricing/pricing.companies.ts", "constants/pricing/pricing.companies.legaldept.ts"]) {
    const text = src(rel);
    const cards = text.match(/\{ id: "(biz|dept)-[a-z]+-[a-z]+"/g) ?? [];
    assert.equal(cards.length, 18, `${rel}: 9 cards × 2 languages`);
    assert.equal((text.match(/someFeaturesSoon: true/g) ?? []).length, cards.length, `${rel}: a badge on every card`);
    // feature strings only (the ai / platform / support arrays)
    const features = [...text.matchAll(/(?:ai|platform|support): \[([\s\S]*?)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]));
    assert.ok(features.length > 100, `${rel}: features not found`);
    for (const f of features) {
      if (unbuilt.test(f)) assert.match(f, /قريباً|coming soon/, `${rel}: «${f}» is not built yet`);
    }
  }
  assert.match(src("components/pricing/PricingCards.tsx"), /plan\.someFeaturesSoon &&/);
});

test("٤٣٧ fix round 1: no card desc, quota line or comparison cell sells an unbuilt or untracked corporate feature", () => {
  // Quotas nothing tracks (consultation hours, contract reviews, litigation
  // cases, fee discounts, request counts, a department's annual points,
  // contract-expiry alerts) and the unbuilt modules.
  const untracked = /^(استشار|مراجعة عقود|ترافع|خصم|طلبات|تنبيهات انتهاء العقود)|نقطة سنوية|^(Lawyer consultation|Consultations|Lawyer contract review|Contract review|Litigation|Requests|Legal requests|Contract expiry alerts)|% off additional|annual points/;
  const module = /Kanban|حوكمة|انتداب|HR|API|SSO|سوق|حدود صرف|تقارير|تنبيهات العقود|[Gg]overnance|[Ss]econdment|[Mm]arketplace|[Ss]pending limits|reports|contract alerts|[Pp]oints|نقاط|محفظة|[Ww]allet/;
  for (const rel of ["constants/pricing/pricing.companies.ts", "constants/pricing/pricing.companies.legaldept.ts"]) {
    const text = src(rel);
    const segments = [...text.matchAll(/(?:ai|platform|support): \[([\s\S]*?)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]))
      .flatMap((f) => f.split(" · "));
    for (const seg of segments) {
      if (untracked.test(seg) && !seg.includes("❌")) assert.match(seg, /قريباً|coming soon/, `${rel}: «${seg}»`);
    }
    const descs = [...text.matchAll(/desc: "([^"]*)"/g)].map((m) => m[1]);
    assert.equal(descs.length, 18, rel);
    for (const d of descs) {
      if (!module.test(d)) continue;
      // every unbuilt module named in a desc sits after «قريباً:» / "coming soon:"
      const soonAt = d.search(/قريباً:|[Cc]oming soon:/);
      assert.ok(soonAt >= 0, `${rel}: desc «${d}»`);
      const before = d.slice(0, soonAt);
      assert.doesNotMatch(before, module, `${rel}: desc «${d}» names an unbuilt module before «قريباً»`);
    }
  }
  const table = src("constants/pricing/pricing.companies.comparison.ts");
  for (const feature of ["مراجعة عقود محامٍ", "استشارات محامٍ متخصص", "الترافع (قضايا وجلسات)", "لوحة Kanban للمهام",
    "Lawyer Contract Review", "Specialist Lawyer Consultations", "Litigation (Cases & Hearings)", "Kanban Task Board"]) {
    const at = table.indexOf(`feature: "${feature}",`);
    assert.ok(at > 0, feature);
    const row = table.slice(at, table.indexOf("},", at));
    for (const [, cell] of row.matchAll(/"(?:biz|dept)-[a-z]+-[a-z]+": "([^"]*)"/g)) {
      assert.ok(["قريباً", "Soon", "❌", "فريق داخلي", "Internal Team"].includes(cell), `${feature}: «${cell}»`);
    }
  }
});

test("٤٣٠: the fee statement says «بيان أتعاب — ليست فاتورة ضريبية إلكترونية» on the issue modal and above the list", () => {
  const page = src("app/dashboard/lawyer/finance/page.tsx");
  assert.match(page, /const FEE_STATEMENT_LABEL = "بيان أتعاب — ليست فاتورة ضريبية إلكترونية";/);
  assert.ok((page.match(/\{FEE_STATEMENT_LABEL\}/g) ?? []).length >= 3, "header, list and modal");
  for (const old of ["إصدار فاتورة جديدة", "حفظ الفاتورة وإصدارها"]) assert.ok(!page.includes(old), old);
  assert.ok(page.includes("إصدار بيان أتعاب جديد") && page.includes("حفظ بيان الأتعاب وإصداره"));
  assert.ok(!src("app/dashboard/firm/finance/page.tsx").includes(">فاتورة جديدة<") && !src("app/dashboard/firm/finance/page.tsx").includes("<span>فاتورة جديدة</span>"));
  assert.ok(!src("app/dashboard/firm/fees/page.tsx").includes("إنشاء فاتورة"));
});

test("٤٣١: the about page's line, and no page claims a model trained on Saudi law", () => {
  const about = src("app/about/page.tsx");
  assert.ok(about.includes('descAr: "بناء أدوات ذكية تعتمد الأنظمة السعودية مصدراً."'));
  assert.ok(about.includes('descEn: "Building smart tools that take Saudi law as their source."'));
  for (const rel of [
    "app/about/page.tsx", "app/ai/page.tsx", "app/ai/contract-drafter/layout.tsx", "app/ai/analyze/layout.tsx",
    "components/ServicesBento.tsx", "app/services/individuals/page.tsx", "app/services/lawyers/page.tsx",
    "components/consultation/constants.ts", "components/AIShowcase.tsx", "app/pro/page.tsx",
    "app/ai/disclaimer/page.tsx", "app/ai-disclaimer/page.tsx", "constants/servicesData.ts", "app/laws/components/AiTabContent.tsx",
  ]) {
    assert.doesNotMatch(src(rel), /مدر[ً-ْ]*ب|تدريب النماذج|[Tt]rained (on|exclusively)|exclusively trained|specifically trained/, rel);
  }
});

test("20261107_50: one idempotent file — the plan name, the consultation rows, NZAMY50 — ending with the check SELECT", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261107_50_owner_answers_prices.sql", import.meta.url), "utf8");
  const body = sql.replace(/^\s*--.*$/gm, "");
  assert.ok(body.indexOf("begin;") < body.indexOf("commit;"), "wrapped in begin … commit");
  const writes = body.slice(0, body.indexOf("commit;"));
  assert.doesNotMatch(writes, /\b(drop|delete|truncate)\b/i);
  // ٤٢٠
  assert.match(body, /set name_ar\s+= 'عضوية الحماية القانونية',\s+name_en\s+= 'Legal Protection Membership'/);
  // ٤٣٣ — the four offered rows, their bands, and video-full hidden on purpose
  for (const [id, price, min, max] of [["written-opinion", 79, 49, 199], ["voice-call", 129, 89, 249], ["video-short", 199, 149, 399], ["in-person", 349, 249, 750]] as const) {
    const at = writes.indexOf(`('${id}', 'individual', 'consultation', `);
    assert.ok(at > 0, id);
    const row = writes.slice(at, writes.indexOf("::jsonb)", at));
    assert.ok(row.includes(`, ${price}, 'fixed', `), `${id}: ${price}`);
    assert.ok(row.includes(`"lawyerPriceRange":{"min":${min},"max":${max}}`), `${id}: band`);
  }
  assert.match(body, /set enabled\s+= false,\s+metadata\s+= metadata \|\| jsonb_build_object\('adminHidden', true/);
  // re-runs skip a stamped row (an admin's later edit is kept)
  assert.match(body, /where coalesce\(admin_pricing_catalog\.metadata->>'owner_433', ''\) = ''/);
  // ٤٣٦ — min 200 untouched
  assert.match(body, /set excluded_kinds = '\{topup,plan,library\}'::text\[\]/);
  assert.doesNotMatch(writes, /min_order_amount\s*=\s*\d/);
  // the last statement is the SELECT (the SQL editor shows only the last result)
  const tail = body.slice(body.lastIndexOf("commit;"));
  assert.equal((tail.match(/;/g) ?? []).length, 2, "commit; then exactly one SELECT");
  assert.match(tail, /select x\.check_name, x\.key, x\.in_table, x\.value, x\.ok/);
});

test("Task F fix round 1: 20261107_50 rewrites NZAMY50's rules line; _verify NOTICEs an admin re-offer of video-full; the voice-call rollback hides it", () => {
  const sql = src("../supabase/migrations/20261107_50_owner_answers_prices.sql").replace(/\r\n/g, "\n");
  const coupon = sql.slice(sql.indexOf("update public.coupons"), sql.indexOf("commit;"));
  assert.match(coupon, /'rules', '20261107_50 — owner ٤٣٦: 50 SAR off a single-service order of 200 SAR net or more; never a plan, the library, a top-up or the founder membership'/);
  assert.match(coupon, /'owner_436', /);
  assert.ok(sql.includes(`--   update public.admin_pricing_catalog set enabled = false, metadata = metadata || '{"adminHidden":true}' where service_id = 'voice-call';`));
  const verify = src("../supabase/migrations/_verify.sql").replace(/\r\n/g, "\n");
  const block = verify.slice(verify.indexOf("-- >>> verify:owner_answers_prices"), verify.indexOf("-- <<< verify:owner_answers_prices"));
  const video = block.slice(block.indexOf("where service_id = 'video-full'"), block.indexOf("select string_agg"));
  // the stamped (owner_433) branch comes first and only NOTICEs; the unstamped one RAISEs
  const stamped = video.indexOf("and coalesce(r.metadata->>'owner_433', '') <> '' then");
  assert.ok(stamped > 0, "a stamped branch exists");
  assert.match(video.slice(stamped, video.indexOf("elsif")), /raise notice '_verify: 20261107_50 — video-full was offered again on the admin pricing page/);
  assert.doesNotMatch(video.slice(stamped, video.indexOf("elsif")), /raise exception/);
  assert.match(video.slice(video.indexOf("elsif")), /raise exception '_verify: 20261107_50 — video-full is still offered/);
});
