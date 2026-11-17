/**
 * draftingRequest.ts — owner Q485 (N02-7 / N06-18): the library assistant
 * explains the texts; it never writes a memo, a statement of claim, an appeal
 * or any other pleading. A message that asks it to is answered with a polite
 * refusal BEFORE anything is charged or sent to the model (runCore
 * startRunWith, tools.ts `draftingGuard`); a caller who may use «الصائغ
 * القانوني» is pointed to it.
 *
 * Deterministic and pure (no model): a message is a drafting request when a
 * drafting cue — an imperative («اكتب»، «صغ»، «حرر»، «جهز»، «أعد»)، a
 * second-person verb («تكتب لي»)، a want («أريد»، «أبي»، «أحتاج»)، or a verbal
 * noun («صياغة»، «كتابة»، «تحرير») that opens the message or follows an ask
 * («هل يمكنك صياغة…») — is followed within two words by a pleading
 * («مذكرة»، «لائحة دعوى»، «صحيفة دعوى»، «استئناف»، «التماس»، «اعتراض»…).
 * A question about a pleading («ما مدة الاستئناف؟»، «ما شروط صياغة لائحة
 * الدعوى؟»، «كيف أكتب مذكرة؟») is not a request and goes to the model as
 * before (whose prompt also says it does not draft).
 */

/** Arabic letters folded so spelling variants compare equal. */
export function foldArabic(text: string): string {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel, dagger alef, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const set = (words: string): ReadonlySet<string> => new Set(words.split(/\s+/).filter(Boolean).map(foldArabic));

/** «اكتب لي…»: the imperatives (and their «-ها» / «-لي» forms). */
const IMPERATIVES = set(`
  اكتب اكتبي اكتبها اكتبه اكتبلي اكتبوا
  صغ صغي صغها صغه صيغ صيغي
  حرر حرري حررها حرره حررلي
  جهز جهزي جهزها جهزه جهزلي
  اعد اعدي اعدها اعده اعدلي
  انشئ انشئي
  سو سوي سويلي سويها
  اعمل اعملي اعمللي
`);

/** «هل تكتب لي…» / «أريد أن تكتب…»: the second-person verbs. */
const SECOND_PERSON = set(`
  تكتب تكتبي تكتبين تكتبها تكتبه تكتبلي
  تصيغ تصيغي تصيغها تصيغه
  تحرر تحرري تحررها تحرره
  تجهز تجهزي تجهزها تجهزه تجهزلي
  تعدلي
  تنشئ تسوي تسويلي تعمللي
`);

/** «صياغة مذكرة»: the verbal nouns — a cue only when they open the message or follow an ask. */
const MASDARS = set("كتابة صياغة تحرير اعداد تجهيز انشاء");

/** «أبي مذكرة»: wanting the document itself. */
const WANTS = set("اريد نريد ابي نبي ابغي ابغى ابغا نبغي احتاج نحتاج ودي اطلب");

/** What makes a following verbal noun an ask of the assistant («هل يمكنك صياغة…»). */
const ASKS = set(`
  اريد نريد ابي نبي ابغي ابغى ابغا نبغي احتاج نحتاج ودي اطلب
  يمكنك بامكانك ممكن تقدر تستطيع ارجو نرجو رجاء ابغاك ابيك
`);

/** «اكتب لي نموذج مذكرة»: a word naming a draft of the document, skipped like a filler. */
const TEMPLATES = set("نموذج نموذجا مسوده صيغه نص");

/** Words skipped between a cue and the document («اكتب لي من فضلك مذكرة»). */
const FILLERS = set("لي لنا منك ان من فضلك لو سمحت رجاء ارجو الان سريعا");

/** Before a verb: the verb is the asker's own («كيف أكتب…»، «هل يجب أن أكتب…»)، not an ask. */
const QUESTION_BEFORE_VERB = set("كيف متي ماذا لماذا ما اين ان عندما حين لم لن سوف");
/** «هل» and «أن» still make a second-person verb an ask («هل تكتب لي…»، «أريد أن تكتب…»). */
const QUESTION_BEFORE_SECOND = set("كيف متي ماذا لماذا ما اين عندما حين");

/** Right after a cue: the user wants an explanation, not a document («اكتب لي ملخص أحكام الاستئناف»). */
const EXPLANATIONS = set(`
  ملخص ملخصا تلخيص خلاصه شرح شرحا تعريف نبذه معني مفهوم مقارنه الفرق
  شروط مده مدة احكام اركان اجراءات مواعيد ميعاد معرفه حكم رايك
`);

/** Documents that are a pleading on their own. */
const PLEADINGS = set(`
  مذكره مذكرات استئناف التماس اعتراض اعتراضيه عريضه دعوي دعاوي
  طعن تظلم مرافعه دفوع انذار شكوي
`);
/** «لائحة» / «صحيفة» are a pleading only with what follows («لائحة دعوى»، «صحيفة دعوى»). */
const NEEDS_NEXT = set("لائحه لوائح صحيفه صحايف");
const NEXT_MAKES_PLEADING = set(`
  دعوي اعتراضيه اعتراض استئناف جوابيه ادعاء دفاع رد طعن نقض التماس
`);

const PREFIXES = ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل"];

/** The token and its forms without a leading article / conjunction and without a tanween alef. */
function forms(token: string): string[] {
  const out = new Set<string>([token]);
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 2) out.add(token.slice(p.length));
  }
  for (const f of [...out]) if (f.length > 3 && f.endsWith("ا")) out.add(f.slice(0, -1));
  return [...out];
}

const isIn = (words: ReadonlySet<string>, token: string | undefined): boolean =>
  token !== undefined && forms(token).some((f) => words.has(f));

/** True when tokens[i] (or tokens[i] with tokens[i+1]) names a pleading. */
function isPleadingAt(tokens: string[], i: number): boolean {
  if (isIn(PLEADINGS, tokens[i])) return true;
  return isIn(NEEDS_NEXT, tokens[i]) && isIn(NEXT_MAKES_PLEADING, tokens[i + 1]);
}

/**
 * A pleading among the first `words` words after the cue at `i` (fillers and
 * draft words skipped), with no explanation word before it.
 */
function pleadingFollows(tokens: string[], i: number, words: number): boolean {
  let seen = 0;
  for (let j = i + 1; j < tokens.length && seen < words; j += 1) {
    if (isIn(FILLERS, tokens[j]) || isIn(TEMPLATES, tokens[j])) continue;
    if (isIn(EXPLANATIONS, tokens[j])) return false;
    if (isPleadingAt(tokens, j)) return true;
    seen += 1;
  }
  return false;
}

/** The index of the word before `i` that is not a filler, or -1. */
function previousWord(tokens: string[], i: number): number {
  for (let j = i - 1; j >= 0; j -= 1) if (!isIn(FILLERS, tokens[j])) return j;
  return -1;
}

/** True when the message asks the assistant to write a memo, a claim, an appeal or another pleading. */
export function isDraftingRequest(message: string): boolean {
  const tokens = foldArabic(message).split(" ").filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const before = tokens[i - 1];
    let cue = false;
    // «أريد أن أقدم اعتراضاً» is not «أريد اعتراضاً»: a want takes the very next word.
    let words = 2;
    if (isIn(IMPERATIVES, t)) {
      cue = !isIn(QUESTION_BEFORE_VERB, before);
    } else if (isIn(SECOND_PERSON, t)) {
      cue = !isIn(QUESTION_BEFORE_SECOND, before);
    } else if (isIn(WANTS, t)) {
      cue = true;
      words = 1;
    } else if (isIn(MASDARS, t)) {
      const prev = previousWord(tokens, i);
      // Opening the message («صياغة لائحة دعوى»), or asked for («هل يمكنك صياغة…»).
      cue = prev === -1 || isIn(ASKS, tokens[prev]);
    }
    if (cue && pleadingFollows(tokens, i, words)) return true;
  }
  return false;
}

export const DRAFTING_REFUSED_CODE = "drafting_refused";
/** Where «الصائغ القانوني» lives; the only link a refusal may carry. */
export const DRAFTER_HREF = "/ai/draft";

export const DRAFTING_REFUSAL_TEXT =
  "عذراً، مساعد المكتبة يشرح النصوص النظامية ويجيب عن أسئلتك عنها، ولا يكتب المذكرات أو صحائف الدعوى أو اللوائح.";
const DRAFTER_HINT = " لصياغتها استعمل «الصائغ القانوني».";

/**
 * The reply body for a refused drafting request. `canUseDrafter` is whether
 * this caller may run «الصائغ القانوني» (a lawyer or a firm, not a consultant,
 * or an admin): only then does it carry the link.
 */
export function draftingRefusal(canUseDrafter: boolean): {
  error: string;
  code: typeof DRAFTING_REFUSED_CODE;
  action?: { label: string; href: string };
} {
  if (!canUseDrafter) return { error: DRAFTING_REFUSAL_TEXT, code: DRAFTING_REFUSED_CODE };
  return {
    error: DRAFTING_REFUSAL_TEXT + DRAFTER_HINT,
    code: DRAFTING_REFUSED_CODE,
    action: { label: "افتح الصائغ القانوني", href: DRAFTER_HREF },
  };
}
