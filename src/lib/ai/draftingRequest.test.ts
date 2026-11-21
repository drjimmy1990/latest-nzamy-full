/**
 * draftingRequest.test.ts — owner Q485 (N02-7 / N06-18): the library
 * assistant's drafting guard. A request to write a memo / claim / appeal is
 * refused before the model; a question ABOUT one is not.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/draftingRequest.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_CONTRACT_DRAFTING_HREF,
  CLIENT_CONTRACT_DRAFTING_LABEL,
  CONTRACT_SERVICES_HREF,
  CONTRACTS_HREF,
  CONTRACT_REFUSAL_TEXT,
  DRAFTER_HREF,
  DRAFTING_REFUSAL_TEXT,
  DRAFTING_REFUSED_CODE,
  contractDraftingRefusal,
  draftingRefusal,
  draftingRequestKind,
  foldArabic,
  isDraftingRequest,
} from "./draftingRequest.ts";

const REQUESTS = [
  "اكتب لي مذكرة",
  "اكتب لي مذكرة اعتراضية على حكم المحكمة العمالية",
  "اكتبْ لي مذكرةً",
  "صياغة لائحة دعوى",
  "صياغة لائحة الدعوى ضد صاحب العمل",
  "حرر لي استئناف",
  "حرّر لي استئنافاً ضد الحكم",
  "صغ لي لائحة اعتراضية",
  "جهز لي صحيفة دعوى مطالبة بأجور",
  "أريد منك أن تكتب لي صحيفة دعوى",
  "ممكن تجهز لي مذكرة رد؟",
  "هل يمكنك صياغة مذكرة دفاع؟",
  "هل تكتب لي مذكرة جوابية؟",
  "ابي مذكرة جوابية",
  "أحتاج لائحة اعتراضية",
  "أعدّ لي عريضة دعوى",
  "اكتب التماس إعادة نظر",
  "من فضلك اكتب لي مذكرة",
  "اكتب لي نموذج مذكرة اعتراضية",
  "لو سمحت صياغة مذكرة بالدفوع",
  "كتابة مذكرة استئناف",
  "حررلي تظلماً إلى ديوان المظالم",
];

const QUESTIONS = [
  "ما هي مدة الاستئناف؟",
  "ما شروط صياغة لائحة الدعوى؟",
  "كيف أكتب مذكرة اعتراضية؟",
  "اشرح لي المادة الثمانين",
  "متى يجوز الاعتراض على الحكم؟",
  "اكتب لي ملخص أحكام الاستئناف",
  "اكتب لي شروط الاستئناف",
  "أريد معرفة مدة الاستئناف",
  "أريد أن أقدم اعتراضاً على الحكم، ما المدة؟",
  "ما الفرق بين الاستئناف والتماس إعادة النظر؟",
  "هل يمكن تقديم مذكرة بعد قفل باب المرافعة؟",
  "هل تعد المذكرة الاعتراضية من طرق الطعن؟",
  "اشرح اللائحة التنفيذية لنظام العمل",
  "هل يجب أن أكتب مذكرة قبل الجلسة؟",
  "ما المقصود بصحيفة الدعوى في هذه المادة؟",
  "اكتب لي شرحاً لهذه المادة",
  "اكتب لي أنواع الدعاوى",
  "اكتب لي أسباب الطعن",
  "اكتب لي متطلبات صحيفة الدعوى",
  "",
];

test("a request to write a pleading is a drafting request", () => {
  for (const m of REQUESTS) assert.equal(isDraftingRequest(m), true, m);
});

test("a question about a pleading is not", () => {
  for (const m of QUESTIONS) assert.equal(isDraftingRequest(m), false, m);
});

test("folding: alef forms, taa marbuta, alef maqsura, tashkeel and tatweel compare equal", () => {
  assert.equal(foldArabic("أُكْتُبْ مذكـرةً إلى"), "اكتب مذكره الي");
  assert.equal(foldArabic("استئناف"), foldArabic("استيناف"));
});

test("the refusal: the drafter link only for a caller who may use it", () => {
  const plain = draftingRefusal(false);
  assert.equal(plain.code, DRAFTING_REFUSED_CODE);
  assert.equal(plain.error, DRAFTING_REFUSAL_TEXT);
  assert.equal("action" in plain, false);
  const lawyer = draftingRefusal(true);
  assert.equal(lawyer.code, DRAFTING_REFUSED_CODE);
  assert.match(lawyer.error, /الصائغ القانوني/);
  assert.deepEqual(lawyer.action, { label: "افتح الصائغ القانوني", href: DRAFTER_HREF });
  assert.equal(DRAFTER_HREF, "/ai/draft");
});

// ── owner ١٣ / ٢٢ (17 Nov 2026): contract writing is refused, contract review is not ──

const CONTRACT_REQUESTS = [
  "اكتب لي عقداً",
  "اكتب لي عقد إيجار",
  "صغ لي عقد عمل",
  "صغ لي عقد شراكة بين ثلاثة شركاء",
  "حرر لي عقد بيع سيارة",
  "جهز لي عقد توريد",
  "أعدّ لي عقد مقاولة",
  "اكتبلي عقد ايجار شقة",
  "ممكن تكتب لي عقد عمل؟",
  "هل يمكنك صياغة عقد إيجار تجاري؟",
  "صياغة عقد عمل لموظف أجنبي",
  "أريد عقد عمل",
  "ابي عقد ايجار جاهز",
  "أبغى عقد بيع",
  "سوّي لي عقد شراكة",
  "اعمل لي اتفاقية عدم إفصاح",
  "اكتب لي بنداً جزائياً للعقد",
  "اكتب لي نموذج عقد إيجار",
  "عقد إيجار جاهز",
  "عندك عقد عمل جاهز؟",
  "نموذج عقد إيجار",
  "اكتب لي عقد صلح بين الطرفين",
  "Write me a lease contract",
  "Can you draft an NDA for my company?",
  "please draft a partnership agreement",
  "prepare an employment contract",
];

const CONTRACT_QUESTIONS = [
  "راجع لي هذا العقد",
  "راجع لي هذا العقد: يلتزم المستأجر بدفع الأجرة كل ستة أشهر",
  "ما رأيك في هذا البند؟",
  "هل هذا البند في العقد صحيح نظاماً؟",
  "ما شروط عقد الإيجار؟",
  "اكتب لي شروط عقد العمل",
  "اكتب لي مراجعة لهذا العقد",
  "كيف أكتب عقداً؟",
  "كيف أكتب عقد إيجار صحيح؟",
  "ما مدة عقد العمل المحدد المدة؟",
  "أريد فسخ عقد الإيجار",
  "أريد عقد اجتماع للجمعية العمومية، ما الإجراءات؟",
  "هل عقد الإيجار الجاهز في منصة إيجار ملزم؟",
  "هل عقد الإيجار جاهز للتوقيع إذا لم يوثق؟",
  "اشرح لي العقد",
  "ما حكم الشرط الجزائي في العقد؟",
  "نموذج عقد الإيجار الموحد ما مدته؟",
  "ما الفرق بين عقد العمل المحدد وغير المحدد؟",
  "How do I draft a lease contract?",
  "Review this contract clause please",
  "write me a summary of the contract",
  "what are the requirements to draft an appeal",
];

test("owner ٢٢: a request to WRITE a contract is a contract drafting request", () => {
  for (const m of CONTRACT_REQUESTS) assert.equal(draftingRequestKind(m), "contract", m);
  for (const m of CONTRACT_REQUESTS) assert.equal(isDraftingRequest(m), true, m);
});

test("owner ٢٢: reviewing a contract, a clause question or a how-to is not refused", () => {
  for (const m of CONTRACT_QUESTIONS) assert.equal(draftingRequestKind(m), null, m);
});

test("a pleading stays a pleading (the memo refusal and its drafter link are unchanged)", () => {
  for (const m of REQUESTS) assert.equal(draftingRequestKind(m), "pleading", m);
  assert.equal(draftingRequestKind("draft an appeal against the labour court ruling"), "pleading");
  assert.equal(draftingRequestKind("write my statement of claim"), "pleading");
});

test("the contract refusal: «محترف العقود» only for a caller who may use it", () => {
  const plain = contractDraftingRefusal(false);
  assert.equal(plain.code, DRAFTING_REFUSED_CODE);
  assert.equal(plain.error, CONTRACT_REFUSAL_TEXT);
  assert.equal("action" in plain, false);
  const lawyer = contractDraftingRefusal(true);
  assert.match(lawyer.error, /محترف العقود/);
  assert.deepEqual(lawyer.action, { label: "افتح محترف العقود", href: CONTRACTS_HREF });
  assert.equal(CONTRACTS_HREF, "/ai/contracts");
});

test("owner ٢٦ + 02 [78] / 06 هـ2 (l12): every non-lawyer account is refused politely, uncharged, with «اطلب صياغة عقد» → /services/contracts", () => {
  for (const userType of ["individual", "corporate", "micro", "provider", "government", "ngo"]) {
    const r = contractDraftingRefusal(false, userType);
    assert.equal(r.code, DRAFTING_REFUSED_CODE);
    assert.ok(r.error.startsWith(CONTRACT_REFUSAL_TEXT), userType);
    assert.match(r.error, /محامٍ في المنصة/);
    assert.doesNotMatch(r.error, /محترف العقود/, "never the lawyers' tool");
    assert.deepEqual(r.action, { label: CLIENT_CONTRACT_DRAFTING_LABEL, href: CONTRACT_SERVICES_HREF }, userType);
  }
  assert.equal(CLIENT_CONTRACT_DRAFTING_LABEL, "اطلب صياغة عقد");
  assert.equal(CONTRACT_SERVICES_HREF, "/services/contracts");
  // the client request form is no longer offered by this refusal
  assert.notEqual(contractDraftingRefusal(false, "individual").action?.href, CLIENT_CONTRACT_DRAFTING_HREF);
  // a lawyer-side caller refused for another reason: no link (unchanged)
  for (const t of ["lawyer", "firm", "admin", null, undefined]) assert.equal("action" in contractDraftingRefusal(false, t), false, String(t));
  // a caller who may run «محترف العقود» keeps that link whatever the type
  assert.deepEqual(contractDraftingRefusal(true, "lawyer").action, { label: "افتح محترف العقود", href: CONTRACTS_HREF });
});

test("owner ٢٦: runCore passes the caller's type; the library client lets the services link through", async () => {
  const { readFileSync } = await import("node:fs");
  const core = readFileSync(new URL("./runCore.ts", import.meta.url), "utf8");
  assert.match(core, /contractDraftingRefusal\(pro !== null && toolRoleRefusal\(pro, actor\) === null, actor\.userType\)/);
  const client = readFileSync(new URL("../../app/laws/[slug]/_library-assistant.ts", import.meta.url), "utf8");
  assert.ok(client.includes(`"${CONTRACT_SERVICES_HREF}"`));
});
