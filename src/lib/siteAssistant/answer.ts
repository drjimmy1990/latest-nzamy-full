/**
 * answer.ts — «مساعد نظامي»: the site help assistant's rules (O20 / A21,
 * batch l11-misc; owner register 14 items 21 + 26).
 *
 * WHAT IT IS. A deterministic answerer, not a language model: the message is
 * folded (normalize.ts), matched against word lists, and the reply is built
 * from the feed (feed.ts: the price book, this viewer's open offers, the
 * founder campaign, whether online payment is on) and from vetted platform
 * sentences. So it needs no outside service (it ships ON), it can never invent
 * a price, and every number in a reply is a price-book number.
 *
 * WHAT IT NEVER DOES.
 *   - Legal advice. A message that reads as a legal question about the
 *     visitor's own matter («هل يحق لي…», «طلاق», «قضيتي»…) gets a refusal that
 *     points to the AI tools and to a lawyer; a mixed message (a platform topic
 *     AND a legal question) gets the platform answer plus that line.
 *   - Library text. A request for the text of an article / ruling is refused
 *     and pointed to the library (the reader applies the paywall there).
 *   - Guessing. Anything it does not recognise gets the topic menu.
 *
 * Replies are plain text (the widget renders them as text, never HTML) plus
 * same-site links. Fusha Arabic, neutral tone.
 *
 * Pure (relative imports only), so node --test loads it.
 */
import { foldArabic, foldMessage, hasPhrase, hasStem, type FoldedMessage } from "./normalize.ts";
import type { AssistantFeed, PriceLine, TopupLine } from "./feed.ts";
import { BILLING_LABEL_AR, formatSarAmount } from "../pricing/priceBook.ts";
import { VAT_NOTICE } from "../pricing/vatNotice.ts";
import { SALE_PAUSED_LINE_AR } from "../payments/checkoutView.ts";
import { LEGAL_IDENTITY_AR, NO_DIRECT_CONSULTATION_AR } from "../../constants/legalIdentity.ts";

export const ASSISTANT_NAME_AR = "مساعد نظامي";
export const ASSISTANT_MAX_MESSAGE = 400;

export type AssistantIntent =
  | "greeting"
  | "thanks"
  | "legal_advice"
  | "library_text"
  | "founder"
  | "offers"
  | "points"
  | "library"
  | "payment"
  | "signup"
  | "prices"
  | "ai_tools"
  | "contact"
  | "lawyer_service"
  | "about"
  | "app"
  | "fallback";

export interface AssistantLink {
  readonly label: string;
  readonly href: string;
}

export interface AssistantReply {
  readonly intent: AssistantIntent;
  /** Plain text; lines separated by "\n". */
  readonly text: string;
  readonly links: readonly AssistantLink[];
  readonly suggestions: readonly string[];
  /** True when a legal question was also detected (the no-advice line was added). */
  readonly legalNote: boolean;
}

// ── the word lists (written in plain Arabic, folded once at load) ───────────

const fold = (xs: readonly string[]) => Object.freeze(xs.map(foldArabic));

/** A legal question about the visitor's own matter. */
const LEGAL_STEMS = fold([
  "يحق", "حقوقي", "قضيتي", "دعوى", "دعاوى", "المحكمة", "محكمة", "طلاق", "طلقني", "طلقت", "نفقة", "حضانة",
  "ميراث", "الورث", "ورثة", "تعسفي", "فصلني", "فصلوني", "مستحقاتي", "عقوبة", "سجن", "غرامة", "مخالفة",
  "جريمة", "جنائي", "ابتزاز", "تشهير", "احتيال", "تعويض", "كفيلي", "الكفيل", "مستأجر", "المؤجر", "إيجار",
  "شيك", "مطالبة", "خصمي", "قضية", "جلسة", "الجلسة",
]);
const LEGAL_PHRASES = fold([
  "هل يجوز", "ما الحكم", "ما حكم", "وش الحكم", "ماذا أفعل", "ماذا افعل", "وش اسوي", "ايش اسوي", "كيف أتصرف",
  "استشارة قانونية في", "رأيك القانوني", "ما رأيك في قضية", "هل من حقي", "ما حقي", "حكم علي", "حكم ضدي",
  "أرفع دعوى", "ارفع قضية", "أرفع قضية", "هل أنا مخطئ",
]);

/** A request for the library's text itself. */
const LIBRARY_TEXT_PHRASES = fold([
  "نص المادة", "نص المواد", "نص النظام", "نص الحكم", "نص المبدأ", "اعطني نص", "أعطني نص", "انسخ لي", "اكتب لي المادة",
  "اكتب لي نص", "ما نص", "وش نص", "ماذا تنص", "ماذا تقول المادة", "المادة رقم",
]);

const TOPIC_STEMS = {
  founder: fold(["مؤسس", "المؤسسين"]),
  offers: fold(["عرض", "عروض", "تخفيض", "تخفيضات", "خصومات", "كوبون", "برومو"]),
  points: fold(["نقاط", "نقطة", "شحن", "رصيد"]),
  library: fold(["مكتبة", "المكتبة", "الأنظمة", "أنظمة", "لوائح", "مبادئ", "سوابق", "فقه", "فقهية"]),
  payment: fold(["دفع", "ادفع", "أدفع", "بطاقة", "مدى", "فاتورة", "ضريبة", "استرجاع", "استرداد", "فيزا", "أبل"]),
  signup: fold(["تسجيل", "سجل", "أسجل", "اسجل", "حساب", "إنشاء", "دخول", "أدخل", "ادخل"]),
  prices: fold(["سعر", "أسعار", "اسعار", "بكم", "تكلف", "تكلفة", "رسوم", "باقة", "باقات", "اشتراك", "اشترك", "ريال", "مجاني", "مجانا", "مجاناً"]),
  ai_tools: fold(["ذكاء", "اصطناعي", "أدوات", "ادوات", "أداة", "اداة", "الصائغ", "صياغة"]),
  contact: fold(["تواصل", "أتواصل", "نتواصل", "اتصال", "اتصل", "أكلمكم", "اكلمكم", "واتساب", "واتس", "إيميل", "ايميل", "بريد", "الدعم", "شكوى"]),
  lawyer_service: fold(["محامي", "محامٍ", "محامين", "محاماة", "استشارة", "توكيل"]),
  about: fold(["خدمات", "خدماتكم"]),
  app: fold(["تطبيق", "ايفون", "آيفون", "أندرويد", "اندرويد"]),
} as const;

/** «خصم» alone is also «the opponent» (خصمي): only these phrases mean a discount. */
const DISCOUNT_PHRASES = fold(["كود خصم", "كوبون خصم", "خصم على", "هل يوجد خصم", "يوجد خصم", "فيه خصم", "في خصم", "هل هناك خصم", "نسبة الخصم"]);
/**
 * Words that tie a message to the platform itself. A question-form legal
 * phrase («ما حكم…», «هل يجوز…», «ماذا أفعل…») is a legal question unless the
 * message also names the platform — then it is answered as a platform
 * question with the no-advice line.
 */
const PLATFORM_ANCHORS = fold(["نظامي", "المنصة", "منصتكم", "المكتبة", "باقة", "باقات", "اشتراك", "حساب", "نقاط", "شحن", "عروض", "تسجيل"]);
/** Topics whose words also occur in everyday legal questions (دفع، سجل، تواصل، أداة). */
const WEAK_TOPICS: ReadonlySet<Topic> = new Set<Topic>(["payment", "signup", "contact", "ai_tools"]);
const ABOUT_PHRASES = fold(["إدارة القضايا", "ادارة القضايا", "إدارة قضايا", "ما هو نظامي", "ما هي نظامي", "من أنتم", "من انتم", "وش نظامي", "عن نظامي", "ماذا تقدمون", "ايش تقدمون", "وش تقدمون", "ما نظامي"]);
const GREETING_STEMS = fold(["مرحبا", "السلام", "أهلا", "اهلا", "هلا", "صباح", "مساء", "هاي"]);
const THANKS_STEMS = fold(["شكرا", "شكراً", "مشكور", "يعطيك", "جزاك"]);

const AUDIENCE_STEMS = {
  firms: fold(["مكتب", "مكاتب", "شركة محاماة", "شركات محاماة"]),
  lawyers: fold(["محامي", "محامٍ", "محامين", "محامية", "مستشار"]),
  individuals: fold(["فرد", "أفراد", "افراد", "شخصي", "عميل"]),
  orgs: fold(["شركة", "شركات", "منشأة", "منشآت", "جهة", "حكومية", "جمعية", "جمعيات"]),
} as const;

/** Topic order: the first that matches is the answer (more specific first). */
const TOPIC_ORDER = [
  "founder", "offers", "points", "library", "payment", "signup", "prices", "ai_tools", "contact", "lawyer_service", "about", "app",
] as const;
type Topic = (typeof TOPIC_ORDER)[number];

// ── links and fixed sentences ───────────────────────────────────────────────

const L = {
  pricing: { label: "صفحة الأسعار", href: "/pricing" },
  register: { label: "إنشاء حساب", href: "/register" },
  login: { label: "تسجيل الدخول", href: "/login" },
  laws: { label: "المكتبة القانونية", href: "/laws" },
  ai: { label: "أدوات الذكاء الاصطناعي", href: "/ai" },
  services: { label: "اطلب خدمة قانونية", href: "/services" },
  contact: { label: "تواصل معنا", href: "/contact" },
  faq: { label: "الأسئلة الشائعة", href: "/faq" },
  founder: { label: "باقة المحامي المؤسس", href: "/founder" },
  offers: { label: "عروضك", href: "/dashboard/offers" },
  refund: { label: "سياسة الاسترداد", href: "/refund-policy" },
} as const satisfies Record<string, AssistantLink>;

export const SUGGESTIONS_AR = Object.freeze([
  "ما هي باقات نظامي وأسعارها؟",
  "كم سعر اشتراك المكتبة القانونية؟",
  "كيف أشحن النقاط؟",
  "ما العروض المتاحة الآن؟",
  "كيف أنشئ حساباً؟",
]);

export const NO_LEGAL_ADVICE_AR =
  "لا أقدّم رأياً أو استشارة قانونية في حالة بعينها؛ أنا مساعد للتعريف بالمنصة فقط. لسؤالك القانوني استعمل أدوات الذكاء الاصطناعي في نظامي، أو اطلب خدمة من محامٍ عبر المنصة.";

const WELCOME_AR =
  `أهلاً بك، أنا ${ASSISTANT_NAME_AR}. أجيبك عن المنصة وخدماتها وباقاتها وأسعارها وعروضها وطريقة التسجيل والوصول إلى المكتبة القانونية. لا أقدّم استشارات قانونية.`;

// ── formatting ──────────────────────────────────────────────────────────────

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function sarAr(sar: number): string {
  return `${formatSarAmount(sar, "ar")} ر.س`;
}

/** "2027-01-25" → «٢٥ يناير ٢٠٢٧»; anything else → null. */
export function dayAr(isoDay: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  if (!m) return null;
  const month = AR_MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${formatSarAmount(Number(m[3]), "ar")} ${month} ${formatSarAmount(Number(m[1]), "ar").replace(/٬/g, "")}`;
}

function priceLineAr(line: PriceLine): string {
  const cycle = BILLING_LABEL_AR[line.billing];
  if (line.launch) {
    const until = dayAr(line.launch.endsOn);
    return `${line.labelAr} (${cycle}): ${sarAr(line.launch.sar)} سعر إطلاق بدلاً من ${sarAr(line.sar)}${until ? ` حتى ${until}` : ""}`;
  }
  return `${line.labelAr} (${cycle}): ${sarAr(line.sar)}`;
}

function topupLineAr(t: TopupLine): string {
  const months = t.months === 1 ? "شهر واحد" : t.months === 2 ? "شهران" : t.months <= 10 ? `${formatSarAmount(t.months, "ar")} أشهر` : `${formatSarAmount(t.months, "ar")} شهراً`;
  return `حزمة ${sarAr(t.sar)}: ${t.pointsText}، صالحة ${months}`;
}

const bullet = (s: string) => `• ${s}`;

function vatAndSale(feed: AssistantFeed): string[] {
  const out = [`${VAT_NOTICE.exclusive.ar}.`];
  if (!feed.saleOpen) out.push(`${SALE_PAUSED_LINE_AR}. يمكنك إرسال طلب الاشتراك من صفحة الأسعار ليتواصل معك فريق نظامي، ولا يُخصم أي مبلغ.`);
  return out;
}

// ── classification ──────────────────────────────────────────────────────────

export interface Classification {
  readonly intent: AssistantIntent;
  readonly legal: boolean;
  readonly audience: keyof typeof AUDIENCE_STEMS | null;
}

function detectAudience(msg: FoldedMessage): Classification["audience"] {
  if (hasStem(msg, AUDIENCE_STEMS.firms) || hasPhrase(msg, AUDIENCE_STEMS.firms)) return "firms";
  if (hasStem(msg, AUDIENCE_STEMS.lawyers)) return "lawyers";
  if (hasStem(msg, AUDIENCE_STEMS.individuals)) return "individuals";
  if (hasStem(msg, AUDIENCE_STEMS.orgs)) return "orgs";
  return null;
}

function detectTopic(msg: FoldedMessage): Topic | null {
  if (hasPhrase(msg, ABOUT_PHRASES)) return "about";
  for (const t of TOPIC_ORDER) {
    if (hasStem(msg, TOPIC_STEMS[t])) return t;
    if (t === "offers" && hasPhrase(msg, DISCOUNT_PHRASES)) return t;
  }
  return null;
}

export function classify(message: string): Classification {
  const msg = foldMessage(message.slice(0, ASSISTANT_MAX_MESSAGE));
  if (!msg.text) return { intent: "greeting", legal: false, audience: null };
  if (hasPhrase(msg, LIBRARY_TEXT_PHRASES)) return { intent: "library_text", legal: false, audience: null };
  const legalForm = hasPhrase(msg, LEGAL_PHRASES);
  const legal = legalForm || hasStem(msg, LEGAL_STEMS);
  const audience = detectAudience(msg);
  if (legalForm && !hasStem(msg, PLATFORM_ANCHORS)) return { intent: "legal_advice", legal: true, audience };
  let topic = detectTopic(msg);
  // «هل أدفع الغرامة؟», «كيف أسجّل الدعوى؟»: a legal matter with a weak platform
  // word is still a legal question, unless the platform itself is named.
  if (legal && topic && WEAK_TOPICS.has(topic) && !hasStem(msg, PLATFORM_ANCHORS)) topic = null;
  if (!topic) {
    if (legal) return { intent: "legal_advice", legal: true, audience };
    if (hasStem(msg, THANKS_STEMS)) return { intent: "thanks", legal: false, audience };
    if (hasStem(msg, GREETING_STEMS)) return { intent: "greeting", legal: false, audience };
    return { intent: "fallback", legal: false, audience };
  }
  return { intent: topic, legal, audience };
}

// ── the answers ─────────────────────────────────────────────────────────────

interface Built {
  lines: string[];
  links: AssistantLink[];
}

function pricesAnswer(feed: AssistantFeed, audience: Classification["audience"]): Built {
  const p = feed.prices;
  const lines: string[] = [];
  const section = (title: string, rows: readonly PriceLine[]) => {
    if (rows.length === 0) return;
    lines.push(title);
    for (const r of rows) lines.push(bullet(priceLineAr(r)));
  };
  if (audience === "individuals") section("باقة الأفراد:", p.individuals);
  else if (audience === "lawyers") section("باقة المحامي:", p.lawyers);
  else if (audience === "firms") section("باقات مكاتب المحاماة:", p.firms);
  else if (audience !== "orgs") {
    lines.push("أسعار الباقات المعلنة:");
    section("للأفراد:", p.individuals);
    section("للمحامين:", p.lawyers);
    section("لمكاتب المحاماة:", p.firms);
    if (p.library.length > 0) lines.push(bullet(`المكتبة القانونية: من ${sarAr(Math.min(...p.library.map((l) => l.sar)))} (اسأل عن المكتبة للتفاصيل).`));
  }
  if (audience === "orgs" || audience === null) {
    lines.push("باقات الشركات والجهات الحكومية والجمعيات وتفاصيلها في صفحة الأسعار، وبعضها يُتفق عليه مع فريق نظامي.");
  }
  lines.push("النقاط لأدوات الذكاء الاصطناعي لا تأتي مع الاشتراك، وتُشترى بحزم شحن مستقلة.");
  lines.push(...vatAndSale(feed));
  return { lines, links: [L.pricing, L.register] };
}

function libraryAnswer(feed: AssistantFeed): Built {
  const lines = [
    "المكتبة القانونية تضم الأنظمة واللوائح والمبادئ والأحكام القضائية. يستطيع أي زائر تصفّحها وقراءة جزء من محتواها مجاناً، والنص الكامل للمشتركين.",
  ];
  if (feed.prices.library.length > 0) {
    lines.push("اشتراك المكتبة:");
    for (const l of feed.prices.library) lines.push(bullet(`${l.labelAr}: ${sarAr(l.launch?.sar ?? l.sar)}`));
    lines.push("الاشتراك متاح لحسابات المحامين ومكاتب المحاماة والشركات والجهات الحكومية.");
  }
  lines.push(...vatAndSale(feed));
  return { lines, links: [L.laws, L.pricing] };
}

function topupsAnswer(feed: AssistantFeed, audience: Classification["audience"]): Built {
  const lines = ["النقاط تُستعمل في أدوات الذكاء الاصطناعي، ولا تأتي مع الاشتراك ولا تتجدد شهرياً؛ تُشترى بحزم شحن:"];
  const ind = feed.prices.topupsIndividual;
  const pro = feed.prices.topupsProfessional;
  if (audience === "individuals") for (const t of ind) lines.push(bullet(topupLineAr(t)));
  else if (audience === "lawyers" || audience === "firms" || audience === "orgs") for (const t of pro) lines.push(bullet(topupLineAr(t)));
  else {
    if (ind.length > 0) {
      lines.push("للأفراد:");
      for (const t of ind) lines.push(bullet(topupLineAr(t)));
    }
    if (pro.length > 0) {
      lines.push("للمحامين والمكاتب والشركات:");
      for (const t of pro) lines.push(bullet(topupLineAr(t)));
    }
  }
  lines.push(...vatAndSale(feed));
  return { lines, links: [L.pricing] };
}

function founderLines(feed: AssistantFeed): string[] {
  if (!feed.founder || feed.prices.founderSar === null) return [];
  const out = [`باقة المحامي المؤسس: ${sarAr(feed.prices.founderSar)} دفعة واحدة، للمحامين.`];
  if (feed.founder.seatsLeft !== null) out.push(`المقاعد المتبقية: ${formatSarAmount(Math.max(0, feed.founder.seatsLeft), "ar")}.`);
  return out;
}

function founderAnswer(feed: AssistantFeed): Built {
  const lines = founderLines(feed);
  if (lines.length === 0) return { lines: ["حملة المحامي المؤسس غير متاحة الآن. تجد الباقات المتاحة في صفحة الأسعار."], links: [L.pricing] };
  lines.push(...vatAndSale(feed));
  return { lines, links: [L.founder, L.pricing] };
}

function safeHref(href: string): string | null {
  return /^\/(?![/\\])[^\s<>"']*$/.test(href) ? href : null;
}

function offersAnswer(feed: AssistantFeed): Built {
  const lines: string[] = [];
  const links: AssistantLink[] = [];
  if (feed.offers === null) {
    lines.push("العروض تظهر بحسب نوع حسابك. سجّل الدخول لترى العروض المتاحة لك.");
    links.push(L.login);
  } else if (feed.offers.length === 0) {
    lines.push("لا توجد عروض متاحة لحسابك الآن.");
  } else {
    lines.push("العروض المتاحة لحسابك الآن:");
    for (const o of feed.offers.slice(0, 5)) {
      const extra = [o.endsLineAr, o.seatsLineAr].filter(Boolean).join("، ");
      lines.push(bullet(extra ? `${o.title} (${extra})` : o.title));
    }
    links.push(L.offers);
  }
  const founder = founderLines(feed);
  if (founder.length > 0 && feed.offers === null) lines.push(...founder);
  if (founder.length > 0 && feed.offers === null) links.push(L.founder);
  links.push(L.pricing);
  return { lines, links };
}

function paymentAnswer(feed: AssistantFeed): Built {
  const lines = feed.saleOpen
    ? ["الدفع الإلكتروني متاح: تختار الباقة أو حزمة الشحن من صفحة الأسعار وتدفع عبر بوابة الدفع، وتصلك فاتورة ضريبية."]
    : [`${SALE_PAUSED_LINE_AR}.`, "يمكنك إرسال طلب الاشتراك من صفحة الأسعار ليتواصل معك فريق نظامي، ولا يُخصم أي مبلغ."];
  lines.push(`${VAT_NOTICE.exclusive.ar}.`);
  return { lines, links: [L.pricing, L.refund] };
}

function signupAnswer(): Built {
  return {
    lines: [
      "إنشاء الحساب مجاني: افتح صفحة إنشاء الحساب واختر نوع حسابك (فرد، أو محامٍ، أو مكتب محاماة، أو شركة)، ثم فعّل حسابك من الرسالة التي تصل إلى بريدك الإلكتروني.",
      "المحامي يُدخل رقم رخصته، ويراجع فريق نظامي الحساب.",
    ],
    links: [L.register, L.login],
  };
}

function aiAnswer(): Built {
  return {
    lines: [
      "في نظامي أدوات ذكاء اصطناعي مساعدة تعمل بالنقاط، منها مساعد المكتبة القانونية، وتظهر الأدوات المتاحة لحسابك في صفحة الأدوات.",
      "الذكاء الاصطناعي في نظامي أداة مساعدة، ومخرجاته ليست رأياً قانونياً ولا قراراً نهائياً.",
    ],
    links: [L.ai, L.pricing],
  };
}

function contactAnswer(): Built {
  return { lines: ["يسعد فريق نظامي بالتواصل معك من صفحة «تواصل معنا»، أو من زر واتساب في أسفل الصفحة."], links: [L.contact] };
}

function lawyerServiceAnswer(): Built {
  return {
    lines: [
      "يمكنك طلب خدمة قانونية (استشارة أو صياغة أو متابعة) عبر المنصة، ويتولاها محامون مرخّصون.",
      NO_DIRECT_CONSULTATION_AR,
    ],
    links: [L.services, L.contact],
  };
}

function aboutAnswer(): Built {
  return {
    lines: [LEGAL_IDENTITY_AR, NO_DIRECT_CONSULTATION_AR, "تجد في نظامي المكتبة القانونية، وأدوات الذكاء الاصطناعي المساعدة، وإدارة القضايا والعقود للمحامين والمكاتب، وطلب الخدمات القانونية."],
    links: [L.pricing, L.laws, L.faq],
  };
}

function appAnswer(): Built {
  return { lines: ["لا يوجد تطبيق لنظامي في متاجر التطبيقات حالياً، وتعمل المنصة من متصفح الجوال."], links: [L.faq] };
}

function build(intent: AssistantIntent, feed: AssistantFeed, audience: Classification["audience"]): Built {
  switch (intent) {
    case "greeting":
      return { lines: [WELCOME_AR], links: [] };
    case "thanks":
      return { lines: ["العفو، يسعدني ذلك. هل لديك سؤال آخر عن المنصة؟"], links: [] };
    case "legal_advice":
      return { lines: [NO_LEGAL_ADVICE_AR], links: [L.ai, L.services] };
    case "library_text":
      return {
        lines: ["لا أعرض نصوص الأنظمة والأحكام هنا. تجدها في المكتبة القانونية، ويُعرض النص الكامل للمشتركين."],
        links: [L.laws],
      };
    case "founder":
      return founderAnswer(feed);
    case "offers":
      return offersAnswer(feed);
    case "points":
      return topupsAnswer(feed, audience);
    case "library":
      return libraryAnswer(feed);
    case "payment":
      return paymentAnswer(feed);
    case "signup":
      return signupAnswer();
    case "prices":
      return pricesAnswer(feed, audience);
    case "ai_tools":
      return aiAnswer();
    case "contact":
      return contactAnswer();
    case "lawyer_service":
      return lawyerServiceAnswer();
    case "about":
      return aboutAnswer();
    case "app":
      return appAnswer();
    case "fallback":
    default:
      return {
        lines: ["لم أتعرّف على سؤالك. أستطيع إجابتك عن: الباقات والأسعار، والمكتبة القانونية، والنقاط وحزم الشحن، والعروض، وطريقة التسجيل، والدفع. اختر سؤالاً من الأسئلة المقترحة أو أعد صياغة سؤالك."],
        links: [L.faq, L.contact],
      };
  }
}

/** The live reads an intent's answer uses (feedServer.ts loads only these). */
export function feedNeeds(intent: AssistantIntent): { sale: boolean; offers: boolean; founder: boolean } {
  const sale = intent === "prices" || intent === "library" || intent === "points" || intent === "payment" || intent === "founder";
  return { sale, offers: intent === "offers", founder: intent === "founder" || intent === "offers" };
}

/** The reply to one message, from the feed. */
export function answerMessage(message: string, feed: AssistantFeed): AssistantReply {
  const c = classify(message);
  const built = build(c.intent, feed, c.audience);
  const lines = [...built.lines];
  const legalNote = c.legal && c.intent !== "legal_advice";
  if (legalNote) lines.push(NO_LEGAL_ADVICE_AR);
  const links = built.links.filter((l, i, all) => safeHref(l.href) !== null && all.findIndex((x) => x.href === l.href) === i);
  return {
    intent: c.intent,
    text: lines.join("\n"),
    links,
    suggestions: c.intent === "fallback" || c.intent === "greeting" ? SUGGESTIONS_AR : SUGGESTIONS_AR.slice(0, 3),
    legalNote,
  };
}
