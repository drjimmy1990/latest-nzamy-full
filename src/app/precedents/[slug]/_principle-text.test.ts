import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LONG_PARAGRAPH, cleanPrincipleText, principleParagraphs } from "./_principle-text.ts";

/** The words of a text, ignoring whitespace and line-only bullets. */
function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w !== "" && !/^[-–—•*+]$/.test(w));
}

test("raw bold and heading marks are removed, the words stay", () => {
  assert.equal(cleanPrincipleText("**الوقائع:** تتلخص وقائع الدعوى"), "الوقائع: تتلخص وقائع الدعوى");
  // A heading is its own paragraph block.
  assert.equal(cleanPrincipleText("### المبدأ رقم 1\nيُعد عدم تقديم الضمان"), "المبدأ رقم 1\n\nيُعد عدم تقديم الضمان");
  assert.equal(cleanPrincipleText("__المنطوق__ رفض الدعوى"), "المنطوق رفض الدعوى");
  assert.equal(cleanPrincipleText("أولاً\n---\nثانياً"), "أولاً\nثانياً");
  assert.equal(cleanPrincipleText("نص<!-- PAGE_END -->\n> اقتباس"), "نص\nاقتباس");
});

test("a locked principle cut at 150 characters keeps no unpaired ** mark", () => {
  const cut = "**يُشترط لقبول التظلم شكلاً أن يكون الضمان البنكي صادراً باسم لجنة النظر في التظلمات، ويُعد تقديمه باسم جهة أخرى موجب";
  const clean = cleanPrincipleText(cut);
  assert.doesNotMatch(clean, /\*/);
  assert.deepEqual(words(clean), words(cut.replace(/\*\*/g, "")));
});

test("blank lines are paragraph breaks", () => {
  assert.deepEqual(principleParagraphs("الفقرة الأولى\n\nالفقرة الثانية"), ["الفقرة الأولى", "الفقرة الثانية"]);
  assert.equal(cleanPrincipleText("أ\n\n\n\nب"), "أ\n\nب");
});

test("a PDF wrap mid-sentence is joined; a line ending a sentence or a label breaks", () => {
  const text = [
    "يُعد عدم تقديم المتظلم للضمان البنكي المقرر نظاماً سبباً موجباً لعدم قبول تظلمه شكلاً،",
    "لكونه من المتطلبات الأولية التي تسبق النظر في الموضوع.",
    "الموضوعات:",
    "عدم تقديم الضمان البنكي للجنة – الجوانب الشكلية – عدم قبول التظلم شكلاً.",
  ].join("\n");
  assert.deepEqual(principleParagraphs(text), [
    "يُعد عدم تقديم المتظلم للضمان البنكي المقرر نظاماً سبباً موجباً لعدم قبول تظلمه شكلاً، لكونه من المتطلبات الأولية التي تسبق النظر في الموضوع.",
    "الموضوعات:",
    "عدم تقديم الضمان البنكي للجنة – الجوانب الشكلية – عدم قبول التظلم شكلاً.",
  ]);
});

test("a bullet alone on its line starts an item, and the bullet itself is not printed", () => {
  const text = "الأسانيد النظامية:\n-\nالفقرة 4 من المادة 86 من نظام المنافسات\n-\nالفقرة 1 من المادة 40 من نظام المنافسات";
  assert.deepEqual(principleParagraphs(text), [
    "الأسانيد النظامية:",
    "الفقرة 4 من المادة 86 من نظام المنافسات",
    "الفقرة 1 من المادة 40 من نظام المنافسات",
  ]);
});

test("numbered items and a short heading line start their own paragraphs", () => {
  assert.deepEqual(principleParagraphs("حكمت الدائرة بما يلي\n1- إلزام المدعى عليه بالمبلغ\n2- رفض ما عدا ذلك"), [
    "حكمت الدائرة بما يلي",
    "1- إلزام المدعى عليه بالمبلغ",
    "2- رفض ما عدا ذلك",
  ]);
  assert.deepEqual(principleParagraphs("الأسباب\nحيث إن الدعوى استوفت أوضاعها الشكلية"), [
    "الأسباب",
    "حيث إن الدعوى استوفت أوضاعها الشكلية",
  ]);
});

test("a Markdown heading and a known section label start paragraphs; a wrapped «بأنه:» does not", () => {
  assert.deepEqual(principleParagraphs("### المبدأ رقم 7\nلا عبرة بالعرض المالي الأقل."), [
    "المبدأ رقم 7",
    "لا عبرة بالعرض المالي الأقل.",
  ]);
  assert.deepEqual(principleParagraphs("-\nالفقرة 4 من المادة 86 من النظام\nالوقائع:\nتتلخص وقائع هذا التظلم"), [
    "الفقرة 4 من المادة 86 من النظام",
    "الوقائع:",
    "تتلخص وقائع هذا التظلم",
  ]);
  assert.deepEqual(principleParagraphs("ورد جواب المتظلمة مرفقةً بالمستندات، كما أفادت\nبأنه:\nرفض عرضها"), [
    "ورد جواب المتظلمة مرفقةً بالمستندات، كما أفادت بأنه:",
    "رفض عرضها",
  ]);
});

test("a long single block is cut at sentence ends, never inside «.....», before a number, or after «م.»", () => {
  const sentence = "وحيث إن المدعي قدم ما يثبت دعواه من مستندات وبينات معتبرة لدى الدائرة وقد اطلعت عليها";
  const parts = [
    `${sentence} وأخذت منه الرسوم..... وأصدرت له الدفتر.`,
    `${sentence} في عام 2002 م. وهذا ثابت.`,
    `${sentence} بمبلغ قدره 5. 000 ريال.`,
    `${sentence} وانتهت إلى ذلك.`,
    `${sentence} وثبت للدائرة ذلك؟`,
    `${sentence} فلهذه الأسباب حكمت الدائرة.`,
  ];
  const text = parts.join(" ");
  assert.ok(text.length > LONG_PARAGRAPH);
  const paragraphs = principleParagraphs(text);
  assert.ok(paragraphs.length >= 2, "the wall of text is split");
  for (const p of paragraphs) {
    assert.doesNotMatch(p, /^\.|^\d/, "no piece starts inside an ellipsis or a number");
    assert.ok(!p.startsWith("وهذا ثابت"), "«م.» is not a sentence end");
  }
  assert.ok(paragraphs.every((p, i) => i === paragraphs.length - 1 || /[.؟!?]$/.test(p)), "every cut is at a sentence end");
  assert.deepEqual(words(paragraphs.join(" ")), words(text));
});

test("no wording changes: the paragraphs hold the cleaned text's words in order", () => {
  const samples = [
    "**الوقائع:**\nتتلخص وقائع هذه الدعوى في أن المدعي تقدم بلائحة دعوى ضد\nالمدعى عليه طالباً إلزامه بالمبلغ.\n\n**الأسباب:**\nحيث إن الثابت\nمن الأوراق أن المدعى عليه أقر.\n-\nالمادة 5 من النظام",
    "### المبدأ رقم 7\nلا عبرة بالعرض المالي الأقل في حال عدم اجتياز العرض الفني.\nالموضوعات:\nعدم اجتياز العرض الفني، مصادرة الضمان.",
    "نص واحد قصير بلا فواصل",
  ];
  for (const s of samples) {
    const paragraphs = principleParagraphs(s);
    assert.deepEqual(words(paragraphs.join(" ")), words(cleanPrincipleText(s)), s.slice(0, 30));
    for (const p of paragraphs) assert.doesNotMatch(p, /\*\*|^#/);
  }
});

test("the principle card renders every text field through the cleaner, never raw", () => {
  const src = readFileSync(new URL("./_principle-block.tsx", import.meta.url), "utf8");
  for (const field of ["ruling_basis", "facts", "reasons", "ruling"]) {
    assert.doesNotMatch(src, new RegExp(`\\{p\\.details\\.${field}\\}`), `details.${field} is not printed raw`);
    assert.match(src, new RegExp(`<Paragraphs text=\\{p\\.details\\?\\.${field}\\}`));
  }
  assert.doesNotMatch(src, /\{p\.details\['الحيثيات_والقرار'\]\}/);
  assert.doesNotMatch(src, />\{para\.text\}</);
  assert.match(src, /<Paragraphs text=\{para\.text\} \/>/);
  assert.match(src, /<Paragraphs text=\{cleanTextOfRef\(p\.text\)\} \/>/);
  // Reference lines are still recognised on the raw text.
  assert.match(src, /filter\(para => !isReferenceText\(para\.text\)/);
});

test("empty, blank or non-string input gives nothing", () => {
  assert.equal(cleanPrincipleText(""), "");
  assert.equal(cleanPrincipleText("   \n  "), "");
  assert.equal(cleanPrincipleText(null), "");
  assert.equal(cleanPrincipleText(undefined), "");
  assert.deepEqual(principleParagraphs("**"), []);
  assert.deepEqual(principleParagraphs(null), []);
});
