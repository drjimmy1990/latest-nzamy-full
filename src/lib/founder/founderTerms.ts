/**
 * founderTerms.ts — the text of /founder-terms and its publication switch.
 *
 * The text is the owner's founder terms (TERMS-founder-draft.md, 17 Nov
 * 2026, items ١–٩ and the live-search line, copied as is) plus the
 * platform-protection clause (owner file 11, part «ثالثاً — أ», revised
 * 16 Nov 2026), which the owner asked to be added to /founder-terms as well.
 *
 * Owner decision ١٦ (17 Nov 2026): the owner, a lawyer, reviewed and approved
 * the text, including the 14-day refund in item ٧; it is published before the
 * founder sale opens, under a production title (never «مسودة»). The editorial
 * notes of the source file are not part of the terms and are not carried.
 *   - FOUNDER_TERMS_PUBLISHED = false → the page shows only a short honest
 *     note and a link to /terms, and is `noindex`;
 *   - founderTerms.test.ts fails while the flag is true and a bracketed
 *     placeholder or the word «مسودة» is left in anything shown.
 *
 * FOUNDER_TERMS_VERSION names this text. The founder checkout requires the
 * buyer to accept exactly this version (founderConsent.ts) and stores it on
 * the order: change it whenever a word of the terms changes.
 *
 * `**…**` marks bold, rendered by the page. Pure: no imports.
 */

export const FOUNDER_TERMS_PUBLISHED: boolean = true;

/** The version of the text below, as recorded on each founder order (metadata.founder_terms_version). */
export const FOUNDER_TERMS_VERSION = "2026-11-19";
/** FOUNDER_TERMS_VERSION as the page shows it (item ٩: the date of the last update). */
export const FOUNDER_TERMS_UPDATED_AR = "19 نوفمبر 2026";

export const FOUNDER_TERMS_TITLE = "شروط وأحكام باقة المحامي المؤسس";

export const FOUNDER_TERMS_PENDING_NOTE =
  "الشروط الخاصة بباقة المؤسس قيد المراجعة القانونية النهائية، وتُنشر قبل فتح الشراء";

export interface TermsItem {
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  /** An anchor on the page (/founder-terms#refund). */
  id?: string;
}

/**
 * Item ٧ — the owner's refund wording: TERMS-founder-draft.md clause 7, copied
 * as is, after his 18-Nov decision (an urgent fix of the published text: no AI
 * feature used — drafter, pro tools, library assistant and points; browsing
 * the library never blocks it; full refund incl. VAT to the same method with
 * no fee, and a credit note). The admin refund screen checks exactly this
 * (src/lib/payments/refundEligibility.ts).
 */
export const FOUNDER_REFUND_CLAUSE =
  "يحق لك الاسترداد خلال **14 يوماً** من الشراء بشرط **ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي في الباقة**: الصائغ القانوني، أو أدوات المحترفين، أو مساعد المكتبة الذكي والنقاط. ولا يمنع الاسترداد تصفح المكتبة القانونية العادية. ويُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة إلى وسيلة الدفع نفسها دون خصم أي رسوم، ويصدر بذلك إشعار دائن. وتحدد جهة إصدار بطاقتك مدة ظهور المبلغ في حسابك.";

export const FOUNDER_TERMS_ITEMS: readonly TermsItem[] = Object.freeze([
  {
    title: "١. الأهلية",
    paragraphs: [
      "العرض للمحامي المرخص فقط، بعد توثيق الرخصة وإتمام السداد وحجز المقعد. لا تُمنح شارة المؤسس إلا للمدفوع.",
    ],
  },
  {
    title: "٢. المدة",
    paragraphs: [
      "نافذة العرض من 18 نوفمبر 2026 حتى 17 ديسمبر 2026 بتوقيت الرياض، أو اكتمال 1096 مقعداً أيهما أسبق.",
    ],
  },
  {
    title: "٣. السعر",
    paragraphs: [
      "2,996 ر.س قبل ضريبة القيمة المضافة (15%)، والإجمالي 3,445.40 ر.س، وهو سعر الباقة كلها وليس سعر عمل منفرد. السعر الطبيعي 9,500 ر.س قبل الضريبة. وهذا عرض تأسيسي خاص بهذه الحملة، ولا نتوقع تكراره بهذه الصيغة.",
    ],
  },
  {
    title: "٤. مدة العضوية",
    paragraphs: ["12 شهراً من تاريخ التفعيل، دون تجديد تلقائي ودون سحب لاحق من البطاقة."],
  },
  {
    title: "٥. ما تشمله الباقة",
    bullets: [
      "**6 أعمال قانونية** عبر الصائغ، من الأنواع السبعة المؤهلة، متنوعة أو مكررة، خلال سنة العضوية. جولة التنقيح الثانية داخل الجلسة لا تخصم عملاً.",
      "**مخرج مستقل واحد** إجمالاً تختاره من أدوات المحترفين الأربع.",
      "**المكتبة القانونية** لسنة كاملة من تفعيل الباقة، و**الشحن لا يجدّد السنة**. استخدام المكتبة العادية لا يستهلك نقاطاً. ويصلك **100 نقطة تأسيسية** تُخصَّص لمساعد المكتبة الذكي وحده، والسؤال الواحد عليه يخصم **5 نقاط** من أول سؤال. فإذا نفدت النقاط أُغلق المساعد الذكي وحده حتى **شحن النقاط بأي قيمة**، وتبقى المكتبة مفتوحة طوال مدة العضوية. وكل استخدام للذكاء الاصطناعي مرتبط بالنقاط، وأعمال الصائغ الستة مشمولة في السعر.",
      "إدارة المكتب قريباً: مدتها ضمن سنة العضوية من التفعيل، ولا تبدأ سنة جديدة عند إتاحتها.",
      "خصم المؤسس **15%** على شحنات النقاط ورسوم نظامي المؤهلة. وإذا وُجد عرض عام أقل سعراً يُطبَّق الأفضل فقط دون جمع الخصمين، ولا يشمل الرسوم الحكومية ولا مبالغ الأطراف الثالثة.",
      "**3 دعوات** تتجدد شهرياً لمحامين مرخصين جدد لم يسبق لهم التسجيل، ولا تتراكم.",
    ],
  },
  {
    title: "٦. حدود الخدمة",
    paragraphs: ["المحامي يراجع ويعتمد كل مذكرة قبل تقديمها، ولا تضمن الأدوات نتيجة قضائية بعينها."],
  },
  {
    title: "٧. الاسترداد",
    id: "refund",
    paragraphs: [FOUNDER_REFUND_CLAUSE],
  },
  {
    title: "٨. تحديث العروض",
    paragraphs: [
      "تحتفظ نظامي بحق تحديث عروضها وباقاتها وأسعارها في أي وقت بما يحفظ استمرارية الخدمة وجودتها، دون المساس بحقوق المشتركين المكتسبة في باقتهم القائمة ومدتها.",
    ],
  },
  {
    title: "٩. التوثيق والتصحيح",
    paragraphs: [
      "تُنشر في هذه الصفحة تواريخ آخر تحديث، وما صُحّح من أرقام وتواريخ في المواد الدعائية، حتى لا يختلف العرض بين الصفحة والبروشور والفيديو.",
    ],
  },
  {
    title: "البحث الحي على الإنترنت",
    paragraphs: [
      "**البحث الحي على الإنترنت** (حيث يتاح في باحث المكتبة والتشريع المقارن) اختياري وتكلفته 10 نقاط للسؤال، وتُعرض قبل الإرسال.",
    ],
  },
]);

/** Owner file 11, part «ثالثاً — أ»: «حماية المنصة ومحتواها». */
export const FOUNDER_PROTECTION_TITLE = "حماية المنصة ومحتواها";

export const FOUNDER_PROTECTION_ITEMS: readonly TermsItem[] = Object.freeze([
  {
    title: "١.",
    paragraphs: [
      "أقرّ بأن المنصة وبرمجياتها وتطبيقاتها وقواعد بياناتها ومحتوى مكتبتها القانونية مصنفات محمية بموجب نظام حقوق المؤلف، وأن دخولي إليها واستخدامي لها مشروطان بما ورد في هذه الشروط وفق المادة (الثانية عشرة) من نظام حقوق المؤلف، وأن كل دخول أو استخدام على خلاف هذه الشروط دخول غير مصرح به.",
    ],
  },
  {
    title: "٢.",
    paragraphs: ["وبناءً عليه ألتزم بما يأتي، وأعلم أن مخالفته تعرّضني للعقوبة المبيّنة أمام كل التزام:"],
    bullets: [
      "**التزام أول:** ألتزم بعدم استخراج محتوى المكتبة أو بياناتها بوسائل آلية، ومنها برمجيات الزحف والسحب والاستعلام الآلي المتتابع، أو نسخه بصورة منهجية. والعقوبة: إن تضمّن ذلك دخولاً غير مشروع فهو جريمة بموجب المادة (الثالثة) من نظام مكافحة جرائم المعلوماتية، عقوبتها السجن مدة لا تزيد على سنة وغرامة لا تزيد على خمسمائة ألف ريال، أو إحدى هاتين العقوبتين. وإن أفضى إلى إعاقة الخدمة أو تعطيلها فبموجب المادة (الخامسة) السجن مدة لا تزيد على أربع سنوات وغرامة لا تزيد على ثلاثة ملايين ريال، أو إحدى هاتين العقوبتين.",
      "**التزام ثانٍ:** ألتزم بعدم تجاوز الحصص أو حدود الاستخدام أو التحقق الأمني أو سياسة الأجهزة المصرح بها، وبعدم التحايل عليها. والعقوبة: التحايل على تدابير الحماية التقنية جريمة بموجب المادة (السابعة والأربعين) من نظام حقوق المؤلف، عقوبتها السجن مدة لا تزيد على سنة وغرامة لا تزيد على مليون ريال، أو إحدى هاتين العقوبتين.",
      "**التزام ثالث:** ألتزم بعدم فك المنصة أو تفكيكها، أو محاولة استخراج شيفرتها أو تعليمات تشغيل أدواتها أو نماذجها أو منطق عملها، بقصد استنساخها، ومنه توجيه أسئلة منهجية متتابعة أو استدراج المخرجات لاستنساخ سلوك النماذج، أو استخدام واجهات برمجية غير معلنة. والعقوبة: التحايل على تدابير الحماية لهذا الغرض يعاقب بالمادة (السابعة والأربعين) المذكورة، وللمنصة المطالبة بالتعويض وإيقاف النسخ.",
      "**التزام رابع:** ألتزم بعدم استخدام محتوى المنصة أو مخرجاتها لتدريب أي نموذج آلي أو بناء أي قاعدة بيانات، سواء كانت منافسة أم لا. والعقوبة: التعويض وفق ما يلي في البند (٣)، وما يترتب على الاستخراج الآلي من عقوبات في الالتزام الأول.",
      "**التزام خامس:** ألتزم بعدم مشاركة بيانات دخولي أو السماح لغيري باستخدام حسابي. والعقوبة: إيقاف الحساب، وتحمّلي مسؤولية ما يجريه الغير بحسابي.",
    ],
  },
  {
    title: "٣.",
    paragraphs: [
      "**الجزاء المدني والتعاقدي:** عند المخالفة يحق للمنصة فوراً إيقاف حسابي أو إنهاء اشتراكي وفق سياسة الاسترداد المعتمدة، والمطالبة بالتعويض عن الأضرار بموجب المادة (العشرين بعد المائة) من نظام المعاملات المدنية والمادة (الحادية والخمسين) من نظام حقوق المؤلف ومنها الأرباح التي جناها المتعدي، والإبلاغ للجهات المختصة. وقد يشمل التعويض ما يلحق المنصة من أضرار ناتجة عن سحب بيانات شخصية لمشتركين وفق نظام حماية البيانات الشخصية.",
    ],
  },
  {
    title: "٤.",
    paragraphs: [
      "**أحكام عامة في العقوبة:** يعاقب المحرّض والمساعد والمتفق على الجريمة وفق المادة (التاسعة) من نظام مكافحة جرائم المعلوماتية، ويعاقب الشروع بنصف الحد الأعلى وفق المادة (العاشرة) منه، وتضاعف العقوبة في العود وفق المادة (الثامنة والأربعين) من نظام حقوق المؤلف. والمبالغ والمدد المذكورة حدود قصوى، وتقدّر المحكمة المختصة العقوبة في كل حالة.",
    ],
  },
  {
    title: "٥.",
    paragraphs: [
      "لا يخلّ هذا البند بما يجيزه النظام صراحةً لمالك النسخة المشروعة بموجب المادة (الثالثة والثلاثين) من نظام حقوق المؤلف.",
    ],
  },
]);

/** Every string the published page would render (for the placeholder test). */
export function founderTermsText(): string {
  const items = [...FOUNDER_TERMS_ITEMS, ...FOUNDER_PROTECTION_ITEMS];
  return items.flatMap((i) => [i.title, ...(i.paragraphs ?? []), ...(i.bullets ?? [])]).join("\n");
}

/** `**bold**` → segments for rendering; odd indexes are bold. */
export function boldSegments(text: string): string[] {
  return text.split("**");
}
