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
 *
 * Owner ١٣ / ٢٢ (17 Nov 2026): a CONTRACT is refused the same way
 * («اكتب لي عقداً»، «صغ لي عقد إيجار»، «أبي عقد عمل جاهز»، «draft an NDA»)
 * and referred to «محترف العقود» (/ai/contracts) for whoever may run it.
 * Reviewing one is not writing it: «راجع لي هذا العقد»، «ما رأيك في هذا
 * البند» go to the assistant, whose prompt explains the clauses in general and
 * refers the full review (n8n/ai/workflows.mjs). A review word right after a
 * cue («اكتب لي مراجعة للعقد») stops the match like an explanation word.
 *
 * Owner ٢٦ (18 Nov 2026): an individual or a business that asks for a
 * contract gets the same apology, no charge, and a link to «صياغة العقود عبر
 * محامٍ في المنصة» — the client request form (CLIENT_CONTRACT_DRAFTING_HREF).
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
  انواع اسباب طرق عناصر متطلبات مرفقات رسوم
  مراجعه تدقيق تحليل ملاحظات تقييم تفسير
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

/** Owner ٢٢: a contract, an agreement or one of its clauses («اكتب لي بنداً»). */
const CONTRACTS = set("عقد عقود اتفاقيه اتفاقيات بند");
/** «عقد اجتماع»: the verb «عَقْد» (holding a meeting), not a contract. */
const NOT_A_CONTRACT_NEXT = set("اجتماع جلسه جمعيه مؤتمر ندوه قران لقاء ورشه دوره");
/** «عقد إيجار جاهز»: a ready-made contract. */
const READY = set("جاهز جاهزه");
/** What may stand before «عقد … جاهز» for it to be a request («عندك عقد إيجار جاهز؟»). */
const READY_ASKS = set("عندك لديك يوجد توجد هات اعطني اعطيني عطني ارسل ارسلي ابي اريد ابغي ابغى احتاج نبي بدي ممكن");
/** A message that opens with «نموذج عقد…» and asks nothing else is a request for one. */
const QUESTION_WORDS = set("ما ماذا متي هل كيف لماذا اين كم هو هي");

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

/** True when tokens[i] names a contract (not «عقد اجتماع»). */
function isContractAt(tokens: string[], i: number): boolean {
  return isIn(CONTRACTS, tokens[i]) && !isIn(NOT_A_CONTRACT_NEXT, tokens[i + 1]);
}

export type DraftingKind = "pleading" | "contract";

/**
 * The document among the first `words` words after the cue at `i` (fillers and
 * draft words skipped), with no explanation word before it.
 */
function documentFollows(tokens: string[], i: number, words: number): DraftingKind | null {
  let seen = 0;
  for (let j = i + 1; j < tokens.length && seen < words; j += 1) {
    if (isIn(FILLERS, tokens[j]) || isIn(TEMPLATES, tokens[j])) continue;
    if (isIn(EXPLANATIONS, tokens[j])) return null;
    if (isPleadingAt(tokens, j)) return "pleading";
    if (isContractAt(tokens, j)) return "contract";
    seen += 1;
  }
  return null;
}

/**
 * «عقد إيجار جاهز» / «عندك عقد عمل جاهز؟» / «نموذج عقد إيجار»: a contract asked
 * for without a verb. Not «هل عقد الإيجار الجاهز في منصة إيجار ملزم؟».
 */
function readyContractAsked(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isContractAt(tokens, i)) continue;
    let p = i - 1;
    let template = false;
    while (p >= 0 && (isIn(TEMPLATES, tokens[p]) || isIn(FILLERS, tokens[p]))) {
      template ||= isIn(TEMPLATES, tokens[p]);
      p -= 1;
    }
    const opens = p === -1 || isIn(READY_ASKS, tokens[p]);
    if (!opens) continue;
    if (tokens.slice(i + 1, i + 4).some((t) => isIn(READY, t))) return true;
    // «نموذج عقد إيجار» on its own (a short message with no question in it).
    if (template && p === -1 && tokens.length <= 5 && !tokens.some((t) => isIn(QUESTION_WORDS, t))) return true;
  }
  return false;
}

/** English: «write me a contract», «draft an NDA», «can you draft my appeal». Not «how do I draft…». */
const EN_HOW_TO = /\bhow (?:do|can|should|would|to)\b|\bhow i\b|\bsteps to\b|\btips\b/;
const EN_EXPLAIN = /\b(?:summary|summari[sz]e|explanation|explain|overview|review|analysis|analy[sz]e|meaning|requirements|conditions|rules|deadline)\b/;
const EN_CUE = /\b(?:write|draft|prepare|create|make|generate|compose|produce|draw up)\b((?: [^ ]+){0,4}?) (contracts?|agreements?|nda|leases?|clauses?|memos?|memorandums?|memoranda|pleadings?|statements? of claim|lawsuits?|appeals?|petitions?|complaints?|objections?)\b/;

function englishDraftingKind(text: string): DraftingKind | null {
  const t = String(text ?? "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || EN_HOW_TO.test(t)) return null;
  const m = EN_CUE.exec(t);
  // «a summary of», or «the requirements to draft…»: an explanation, before or inside.
  if (!m || EN_EXPLAIN.test(m[1] ?? "") || EN_EXPLAIN.test(t.slice(0, m.index))) return null;
  return /^(?:contracts?|agreements?|nda|leases?|clauses?)$/.test(m[2]) ? "contract" : "pleading";
}

/** What the message asks the assistant to write: a pleading, a contract, or nothing. */
export function draftingRequestKind(message: string): DraftingKind | null {
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
    if (cue) {
      const kind = documentFollows(tokens, i, words);
      if (kind) return kind;
    }
  }
  if (readyContractAsked(tokens)) return "contract";
  return englishDraftingKind(message);
}

/** The index of the word before `i` that is not a filler, or -1. */
function previousWord(tokens: string[], i: number): number {
  for (let j = i - 1; j >= 0; j -= 1) if (!isIn(FILLERS, tokens[j])) return j;
  return -1;
}

/** True when the message asks the assistant to write a memo, a pleading or a contract. */
export function isDraftingRequest(message: string): boolean {
  return draftingRequestKind(message) !== null;
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

/** Where «محترف العقود» lives (toolLabels.ts); the only link a contract refusal may carry. */
export const CONTRACTS_HREF = "/ai/contracts";

export const CONTRACT_REFUSAL_TEXT =
  "عذراً، مساعد المكتبة يشرح النصوص النظامية ويجيب عن أسئلتك عنها، ولا يكتب العقود أو بنودها.";
const CONTRACTS_HINT = " لصياغة عقدك استعمل «محترف العقود».";

/**
 * Owner ٢٦: the client request form («طلب عام»). Until batch l12 the contract
 * refusal sent an individual or a business there; it no longer carries it
 * (below). Kept for the old link's readers.
 */
export const CLIENT_CONTRACT_DRAFTING_HREF = "/dashboard/client/requests/new?type=general";
/**
 * Owner file 02 [78] / guide 06 هـ2 / old-notes 10 ج9 (20 Nov 2026, batch l12):
 * every account that is not on the lawyer side — individual, business and the
 * rest — is sent to the public contracts service page to order a contract.
 */
export const CONTRACT_SERVICES_HREF = "/services/contracts";
/** Guide 06 هـ2: «اطلب صياغة عقد». */
export const CLIENT_CONTRACT_DRAFTING_LABEL = "اطلب صياغة عقد";
const CLIENT_CONTRACTS_HINT = " يمكنك طلب صياغة عقدك من محامٍ في المنصة.";

const LAWYER_SIDE_TYPES: ReadonlySet<string> = new Set(["lawyer", "firm", "admin"]);

/**
 * Owner س٢٦ (25 Nov 2026, D-134): an individual or a business is offered
 * «صائغ العقود المبسّط» (/ai/simple-contract — simpleContract.ts; the page
 * carries the «not a lawyer» notice and the upgrade link to /services/contracts)
 * BEFORE drafting through a lawyer. A high-risk contract — real estate, a
 * capital partnership, a government contract, a complex employment contract —
 * goes straight to a lawyer (/services/contracts, where the order and its
 * consent are taken). Mirrors simpleContract.SIMPLE_CONTRACT_PAGE / _ROLES
 * (kept literal: this file has no imports).
 */
export const SIMPLE_CONTRACT_HREF = "/ai/simple-contract";
export const SIMPLE_CONTRACT_ACTION_LABEL = "اكتب عقدك المبسّط";
const SIMPLE_CONTRACT_FIRST_TYPES: ReadonlySet<string> = new Set(["individual", "corporate"]);
const SIMPLE_CONTRACT_HINT =
  " يمكنك كتابة عقد مبسّط استرشادي بنفسك في «صائغ العقود المبسّط»، وهو لا يغني عن محامٍ؛ ومنه تطلب صياغة احترافية من محامٍ في المنصة متى شئت.";
const HIGH_RISK_HINT =
  " هذا النوع من العقود عالي المخاطر، فننصح بأن يصوغه محامٍ: يمكنك طلب صياغته من محامٍ في المنصة.";

const HIGH_RISK_CONTRACT = new RegExp(
  [
    // real estate
    "عقار", "عقاري", "أرض", "شقة", "فيلا", "مبنى", "صك", "وحدة سكنية", "بيع منزل", "شراء منزل",
    // capital partnerships
    "شراكة", "شركاء", "شريك", "رأس المال", "رأسمال", "راس المال", "حصص", "أسهم", "اسهم", "تأسيس شركة", "مساهمة",
    // government
    "حكومي", "حكومية", "جهة حكومية", "منافسة حكومية", "مشتريات حكومية", "وزارة",
    // complex employment
    "عدم المنافسة", "عدم منافسة", "عقد عمل تنفيذي", "حوافز وأسهم",
  ].join("|"),
);

/** True for a contract the owner's س٢٦ sends straight to a lawyer. */
export function isHighRiskContractRequest(message: string | null | undefined): boolean {
  if (typeof message !== "string" || message.trim() === "") return false;
  return HIGH_RISK_CONTRACT.test(message.normalize("NFC"));
}

/**
 * Owner ٢٢: the reply body for a refused contract-writing request.
 * `canUseContracts` is whether this caller may run «محترف العقود» (lawyers and
 * firms, consultants included, or an admin): only then does it carry that link.
 * Owner ٢٦: a client account (`userType` individual / corporate / any other
 * non-lawyer type) that may not run it gets a link to drafting through a
 * lawyer on the platform instead — since batch l12 (02 [78], 06 هـ2) always
 * /services/contracts. A lawyer-side caller refused for another reason gets
 * no link (as before).
 */
export function contractDraftingRefusal(canUseContracts: boolean, userType?: string | null, message?: string | null): {
  error: string;
  code: typeof DRAFTING_REFUSED_CODE;
  action?: { label: string; href: string };
} {
  if (!canUseContracts) {
    if (!userType || LAWYER_SIDE_TYPES.has(userType)) return { error: CONTRACT_REFUSAL_TEXT, code: DRAFTING_REFUSED_CODE };
    // س٢٦: the individual and the business — the simplified drafter first,
    // a high-risk contract straight to a lawyer.
    if (SIMPLE_CONTRACT_FIRST_TYPES.has(userType)) {
      if (isHighRiskContractRequest(message)) {
        return {
          error: CONTRACT_REFUSAL_TEXT + HIGH_RISK_HINT,
          code: DRAFTING_REFUSED_CODE,
          action: { label: CLIENT_CONTRACT_DRAFTING_LABEL, href: CONTRACT_SERVICES_HREF },
        };
      }
      return {
        error: CONTRACT_REFUSAL_TEXT + SIMPLE_CONTRACT_HINT,
        code: DRAFTING_REFUSED_CODE,
        action: { label: SIMPLE_CONTRACT_ACTION_LABEL, href: SIMPLE_CONTRACT_HREF },
      };
    }
    return {
      error: CONTRACT_REFUSAL_TEXT + CLIENT_CONTRACTS_HINT,
      code: DRAFTING_REFUSED_CODE,
      action: { label: CLIENT_CONTRACT_DRAFTING_LABEL, href: CONTRACT_SERVICES_HREF },
    };
  }
  return {
    error: CONTRACT_REFUSAL_TEXT + CONTRACTS_HINT,
    code: DRAFTING_REFUSED_CODE,
    action: { label: "افتح محترف العقود", href: CONTRACTS_HREF },
  };
}
