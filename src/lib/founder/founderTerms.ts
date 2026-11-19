/**
 * founderTerms.ts — the text of /founder-terms and its publication switch.
 *
 * The text is the owner's founder terms (TERMS-founder-draft.md — 17 Nov
 * 2026 items ١–٩, his 19 Nov version adds ١٠–١٥; copied as is but for the
 * two register-14 points named below) plus the platform-protection clause (owner file 11, part «ثالثاً — أ», revised
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
 * Batch l8 (owner 18 Nov evening, message item 1.2 and decisions ٤٩/ك),
 * version 2026-11-20: item ٥ no longer said top-ups of «any amount», and the
 * 15 % founder discount was on point top-ups only.
 *
 * Batch l9 (owner register 14 items 4, 6, 7, 12, 16, 28–32, 41, 44, 48, 49,
 * 55, 57–62; his TERMS-founder-draft.md of 19 Nov, clauses 4, 5, 7 and 10–15),
 * version 2026-11-21 — THE one new terms version before payment goes live
 * (register 31; no paying customer before it, so no exception). The id is the
 * deploy date: 2026-11-20 was already published, so the draft's own
 * «2026-11-19» would go backwards (gap register C9).
 *   - ٤: renewal at the price announced then, announced 60 days before the
 *     year ends;
 *   - ٥: the library stays open for the year while the balance is 50 points
 *     or more (register 48; the gate itself is the library reader's); the
 *     minimum top-up is 50 points (register 7); the 15 % founder discount is
 *     on top-ups AND any plan, his own yearly renewal included, while his
 *     yearly subscription is active — the larger discount only (register
 *     29 / 32 / 55; src/lib/payments/founderDiscount.ts enforces it).
 *     Two places where register 14 beats the draft: the «مخرج مستقل واحد من
 *     أدوات المحترفين» bullet is NOT published (register 62: «لا يظهر في
 *     الشروط وصفحة المؤسس»), and the assistant stops when the balance is
 *     below one question's cost (register 6), not at 50;
 *   - ٧: the refund also requires no more than 5 full texts read (register
 *     16 / 44; the counter is the server's own, never shown to the client);
 *   - ١٠–١٣: read limits, two devices, points validity, discount rules;
 *   - ١٤، ١٤-أ، ١٥: anti-scraping, its one narrow exception, the TDM
 *     reservation — the draft's text as is;
 *   - the «البحث الحي على الإنترنت … 10 نقاط» item is removed (register 12,
 *     file 15 row 81): live search is not built and not sold.
 *
 * FOUNDER_TERMS_VERSION names this text. The founder checkout requires the
 * buyer to accept exactly this version (founderConsent.ts) and stores it on
 * the order: change it whenever a word of the terms changes. It equals
 * CURRENT_TERMS_VERSION (src/lib/legal/termsVersion.ts): /terms gained the
 * same clauses 14, 14-أ and 15 in the same version.
 *
 * `**…**` marks bold, rendered by the page. Pure: no imports.
 */

export const FOUNDER_TERMS_PUBLISHED: boolean = true;

/** The version of the text below, as recorded on each founder order (metadata.founder_terms_version). */
export const FOUNDER_TERMS_VERSION = "2026-11-21";
/** FOUNDER_TERMS_VERSION as the page shows it (item ٩: the date of the last update). */
export const FOUNDER_TERMS_UPDATED_AR = "21 نوفمبر 2026";

export const FOUNDER_TERMS_TITLE = "شروط وأحكام باقة المحامي المؤسس";

export const FOUNDER_TERMS_PENDING_NOTE =
  "الشروط الخاصة بباقة المؤسس قيد المراجعة القانونية النهائية، وتُنشر قبل فتح الشراء";

export interface TermsItem {
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  /** Paragraphs shown AFTER the bullets (clause ١٤-أ's closing paragraph). */
  after?: readonly string[];
  /** An anchor on the page (/founder-terms#refund). */
  id?: string;
}

/**
 * Item ٧ — the owner's refund wording: TERMS-founder-draft.md clause 7 of
 * 19 Nov, copied as is: no AI feature used (drafter, pro tools, library
 * assistant and points) AND no more than 5 files read in full text in the
 * library (register 16 / 44); ordinary browsing within these limits never
 * blocks it; full refund incl. VAT to the same method with no fee, and a
 * credit note. /refund-policy shows this text word for word
 * (refundPolicy.ts FOUNDER_REFUND_LINE_AR); the admin refund screen checks it
 * (src/lib/payments/refundEligibility.ts — the 5-file count is the library
 * reader's server-side log).
 */
export const FOUNDER_REFUND_CLAUSE =
  "يحق لك الاسترداد خلال **14 يوماً** من الشراء بشرط **ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي في الباقة**: الصائغ القانوني، أو أدوات المحترفين، أو مساعد المكتبة الذكي والنقاط، **وألا تكون قد قرأت أكثر من 5 ملفات نصاً كاملاً في المكتبة القانونية**. ولا يمنع الاسترداد تصفح المكتبة القانونية العادية في هذه الحدود. ويُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة إلى وسيلة الدفع نفسها دون خصم أي رسوم، ويصدر بذلك إشعار دائن. وتحدد جهة إصدار بطاقتك مدة ظهور المبلغ في حسابك.";

/** Clause ١٤ — anti-reverse-engineering and anti-scraping (draft clause 14, as is). */
export const ANTI_SCRAPING_CLAUSE_AR =
  "يُمنع منعاً باتاً الهندسة العكسية لمنصة نظامي، وأي سحب (scraping) أو استخراج آلي أو جمع منهجي لمحتواها أو بياناتها أو نصوص مكتبتها، سواء بالروبوتات أو البرمجيات أو **أدوات الذكاء الاصطناعي ووكلائها** (مثل Claude وCodex وChatGPT وAntigravity وGemini وغيرها)، ويتحمل المسؤولية القانونية كاملة من شغّل الأداة أو أمرها بذلك. وأي محاولة التفاف على القيود التقنية (حدود المشاهدة أو الطلبات أو الأجهزة أو التحقق) ممنوعة. ويحق لنظامي إيقاف الحساب وإنهاء الخدمة فوراً والمطالبة بالتعويض واتخاذ الإجراءات النظامية.";

/** Clause ١٤-أ — the one exception and its limits (draft clause 14-أ, as is). */
export const CRAWLER_EXCEPTION_AR: Readonly<{ intro: string; limits: readonly string[]; closing: string }> = Object.freeze({
  intro:
    "يُستثنى من المنع في البند 14 أمر واحد فقط: قيام زواحف محركات البحث ومحركات الإجابة **المسمّاة في ملف robots.txt المنشور على المنصة**، بعد تحقق نظامي من هويتها بنطاقات IP المنشورة رسمياً من مزوّدها أو بـreverse-DNS، بفهرسة **الصفحات العامة** المسموحة في ذلك الملف، وعرض عنوانها وملخصها العام ومقتطف قصير منها في نتائج البحث وإجابات الذكاء الاصطناعي، مع ذكر «نظامي» ورابط مباشر للصفحة المصدر. ويُفسَّر هذا الاستثناء تفسيراً ضيقاً، ولا يشمل:",
  limits: Object.freeze([
    "(1) النص الكامل لأي مستند في المكتبة، ولا أي محتوى خلف تسجيل دخول أو اشتراك أو سقف مشاهدة، ولا واجهات الـAPI؛",
    "(2) النسخ الجماعي أو المنهجي، أو رسم خريطة محتوى المكتبة أو بنيتها أو روابطها؛",
    "(3) بناء قواعد بيانات أو مجموعات بيانات، أو تدريب النماذج أو تحسينها أو تقييمها، إلا في الحدود الواردة في البند 15؛",
    "(4) إعادة النشر أو البيع أو الترخيص أو تقديم المحتوى لطرف ثالث، أو أي عرض يغني عن زيارة الصفحة المصدر؛",
    "(5) أي أداة أو وكيل ذكاء اصطناعي أو متصفح آلي يعمل بطلب مستخدم، فهو يُعامل كزائر عادي ويخضع لكل القيود، ويُسأل عنه من شغّله أو أمره؛",
    "(6) أي التفاف على القيود التقنية.",
  ]),
  closing:
    "ولا يجوز لأي شخص الاحتجاج بهذا الاستثناء أو بوصف نشاطه بأنه «تحسين محركات بحث» أو «GEO» أو «بحث» أو «إجابة لمستخدم» لتبرير فعل ممنوع. ونظامي وحدها تقرر من يشمله الاستثناء وتتحقق منه، ولها تعديل قائمة الزواحف أو سحب الاستثناء عن أي جهة في أي وقت، وسجلات خوادمها بيّنة معتبرة في إثبات المخالفة. والمشترك لا يكتسب بهذا الاستثناء أي حق، ولا يجوز له تمكين أي أداة أو طرف ثالث من محتوى اشتراكه. وعند الشك يُفسَّر النص لصالح المنع.",
});

/** Clause ١٥ — the TDM and AI-training reservation (draft clause 15, as is). */
export const TDM_RESERVATION_AR =
  "جميع الحقوق محفوظة لنظامي. لا يجوز التنقيب في نصوص المنصة وبياناتها ولا استعمال محتواها في تدريب نماذج الذكاء الاصطناعي أو تحسينها أو تقييمها دون إذن كتابي مسبق. **والإذن الوحيد القائم** هو ما يسمح به ملف robots.txt للزواحف المسمّاة فيه على الصفحات العامة المحددة فيه، وهو إذن غير حصري، قابل للسحب في أي وقت، ولا يمتد إلى نصوص المكتبة الكاملة ولا إلى أي محتوى مقفول.";

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
    paragraphs: [
      "12 شهراً من تاريخ التفعيل، دون تجديد تلقائي ودون سحب لاحق من البطاقة. **التجديد بالسعر المعلن وقتها ويُعلن قبل نهاية السنة بـ60 يوماً.**",
    ],
  },
  {
    title: "٥. ما تشمله الباقة",
    bullets: [
      "**6 أعمال قانونية** عبر الصائغ، من الأنواع السبعة المؤهلة، متنوعة أو مكررة، خلال سنة العضوية. جولة التنقيح الثانية داخل الجلسة لا تخصم عملاً.",
      "**المكتبة القانونية** مفتوحة طوال سنة العضوية **بشرط ألا ينزل رصيدك عن 50 نقطة**؛ فإذا نزل عنها أُقفل التصفح حتى تشحن فيعود فور بلوغ الرصيد 50. فتح المستند نفسه لا يخصم نقاطاً. و**الشحن لا يجدّد السنة**. ويصلك **100 نقطة تأسيسية** مع الباقة فتعمل المكتبة من اليوم الأول، وتُستعمل أيضاً في مساعد المكتبة الذكي، والسؤال الواحد عليه يخصم **5 نقاط** من أول سؤال، ويقف المساعد إذا قلّ رصيدك عن كلفة السؤال. ويعود التصفح والمساعد بعد **شحن النقاط بحد أدنى 50 نقطة**. وكل استخدام للذكاء الاصطناعي مرتبط بالنقاط، وأعمال الصائغ الستة مشمولة في السعر.",
      "إدارة المكتب قريباً: مدتها ضمن سنة العضوية من التفعيل، ولا تبدأ سنة جديدة عند إتاحتها.",
      "خصم المؤسس **15%** على شحنات النقاط وعلى أي باقة تشتريها من نظامي (**بما فيها تجديد اشتراكك السنوي**)، **ما دام اشتراكك السنوي ساريّاً**. وإذا انقطع الاشتراك فُقد الخصم نهائياً. ويُطبَّق **الأعلى خصم واحد فقط** دون جمعه مع كوبون أو عرض آخر، ولا يشمل الرسوم الحكومية ولا مبالغ الأطراف الثالثة (التفصيل في البند 13).",
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
    title: "١٠. حد القراءة (المكتبة القانونية)",
    id: "read-limits",
    paragraphs: [
      "تُحتسب عند فتح **النص الكامل** فقط. يظهر **تحذير عند 30 فتحاً في اليوم**، ويُحجب الفتح عند **50 فتحاً في اليوم** أو **150 فتحاً في أسبوع** (أي 7 أيام متحركة) بتوقيت الرياض. الغرض حماية المحتوى من السحب الآلي.",
    ],
  },
  {
    title: "١١. الأجهزة",
    paragraphs: [
      "يُسمح بجهازين لاستخدام المكتبة. الجهاز الثالث يُرفض ويختار المستخدم جهازاً يحذفه، ولا يُوقَف الحساب بسبب ذلك. ويُرسَل رمز تحقق إلى البريد عند أول دخول من جهاز جديد.",
    ],
  },
  {
    title: "١٢. صلاحية النقاط",
    paragraphs: [
      "النقاط المشحونة تنتهي بانتهاء صلاحية شحنتها وتُذكر عند الشراء: **ثلاثة أشهر** للشحنات الأقل من 500 وللشحنة 500، و**6 أشهر** لشحنة 1,000، و**12 شهراً** لشحنة 2,500 فأكثر. والبونص يتبع شحنته. وبما أن فتح المكتبة مشروط ببقاء رصيدك 50 نقطة فأكثر، فانتهاء صلاحية شحنة قد يُقفل التصفح حتى تشحن من جديد. أما الـ100 نقطة التأسيسية فصالحة طوال سنة العضوية. النقاط التي انتهت لا تُسترد نقداً ولا تُنقل.",
    ],
  },
  {
    title: "١٣. قواعد الخصم",
    id: "discount",
    paragraphs: [
      "خصم المؤسس 15% على الشحن وعلى أي باقة تشتريها، **بما فيها تجديد اشتراكك السنوي نفسه بسعر التجديد المعلن وقتها**، ما دام اشتراكك السنوي ساريّاً وقت الشراء، وإذا لم تجدّد فقدته نهائياً. يُطبَّق **أعلى خصم واحد فقط** من بين خصم المؤسس والكوبونات والعروض، ولا يجتمع خصمان.",
    ],
  },
  {
    title: "١٤. منع الهندسة العكسية والسحب الآلي",
    id: "anti-scraping",
    paragraphs: [ANTI_SCRAPING_CLAUSE_AR],
  },
  {
    title: "١٤-أ. الاستثناء الوحيد وحدوده",
    paragraphs: [CRAWLER_EXCEPTION_AR.intro],
    bullets: CRAWLER_EXCEPTION_AR.limits,
    after: [CRAWLER_EXCEPTION_AR.closing],
  },
  {
    title: "١٥. حجز التنقيب في النصوص والبيانات (TDM) واستعمال الذكاء الاصطناعي",
    id: "tdm",
    paragraphs: [TDM_RESERVATION_AR],
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
  return items.flatMap((i) => [i.title, ...(i.paragraphs ?? []), ...(i.bullets ?? []), ...(i.after ?? [])]).join("\n");
}

/** `**bold**` → segments for rendering; odd indexes are bold. */
export function boldSegments(text: string): string[] {
  return text.split("**");
}
