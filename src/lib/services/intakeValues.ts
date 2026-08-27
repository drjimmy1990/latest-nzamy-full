/**
 * intakeValues.ts — "Task 4 — Arabic field values", owner question س٤.
 * (The 20 August plan's numbering.)
 *
 * Stored intake values are machine ids in English. Two surfaces read an
 * order's intake back, so both must render it in Arabic — the same Arabic the
 * picker showed when the client chose it, taken from each wizard's own
 * constant rather than re-translated here, so the two can never drift apart.
 * Every group below names the file and line it was copied from; when a
 * picker's label changes, that citation is where to go.
 *
 * WHY THIS FILE IS IN src/lib/services AND MUST STAY THERE
 * It used to live in src/app/ai/orders/[id]/_components/, next to its only
 * importer, OrderSummary.tsx. Being locked inside a client page's private
 * folder WAS a reported bug, not just untidiness: the admin fulfilment panel
 * (src/app/dashboard/admin/service-orders/page.tsx) could not import it, so
 * buildOrderPrompt() in ./orderPrompt.ts fell back to printing the raw stored
 * object. The owner screenshotted one order showing «**contractDesc:**»,
 * «**complexity:** simple» and «**schemaVersion:** 1» to the team, while the
 * client's own page showed «وصف العقد», «مستوى التفصيل: عقد بسيط» and no
 * schemaVersion row at all — every Arabic string the admin needed already
 * existed, in a folder the admin could not reach.
 *
 * So: ONE copy, here, imported by both. A second copy anywhere re-creates
 * that bug the next time a label changes on one side only.
 *
 * Keyed by value, not by field, because the same id (e.g. "individual") means
 * the same thing in every service. Where a value is genuinely field-specific,
 * key it as `field:value` and look that up first — which is most of this file,
 * because the four wizards reuse the same ids with different wording far more
 * often than they agree: "plaintiff" is "مُدَّعِي" in الصائغ القانوني,
 * "مدّعٍ / موكلي مدّعٍ" in المحاكي الشامل and "مدّعٍ" in مذكرة رأي, all three
 * from their own picker.
 *
 * ONLY picker values belong here. Free text the client typed — caseText,
 * contractDesc, concerns, otherParty, keywords, witnessRole, … — must reach
 * the screen exactly as written, which the dictionary miss-fallback in
 * valueLabelAr() gives it for free.
 */
export const INTAKE_VALUE_AR: Record<string, string> = {
  // ─── plain keys ────────────────────────────────────────────────────────────
  // The only three values whose Arabic is identical under every field that
  // uses them today: the party-type picker (`parties.one.type` /
  // `parties.two.type`) and the letter's sender/recipient pickers. Add a
  // field-scoped key the moment that stops being true — a plain key is a
  // claim that the word means one thing everywhere.
  // src/components/draft/DraftPartyForm.tsx:23 and
  // src/components/contracts/SharedComponents.tsx:45 (emoji prefix dropped —
  // it stands in for an icon, not for a word).
  individual: "فرد",
  company: "شركة",
  government: "جهة حكومية",

  // ─── الصائغ القانوني (draft) ───────────────────────────────────────────────
  // src/components/draft/steps/StepIdentify.tsx:119
  "clientRole:plaintiff": "مُدَّعِي",
  "clientRole:defendant": "مُدَّعَى عليه",
  // src/components/draft/draftConstants.ts:48-50 (MEMO_MAIN_TYPES — the
  // picker StepIdentify.tsx:139 renders).
  "memoType:case": "تحرير دعوى",
  "memoType:reply": "مذكرة رد",
  "memoType:appeal": "طعن",
  // The four specialist modes are seeded from the entry card, not picked from
  // MEMO_MAIN_TYPES (src/hooks/useDraftState.ts:41-44, seedFromMode — the file
  // is under src/hooks, not next to the other draft files), so the label the
  // client actually saw is the entry card's:
  // src/components/draft/DraftPreStep.tsx:51-54.
  "memoType:arbitration": "صائغ حكم التحكيم",
  "memoType:notary": "صائغ عقد التوثيق",
  "memoType:report": "صياغة تقرير",
  "memoType:minutes": "صياغة محضر",

  // ─── محترف العقود (contracts) ──────────────────────────────────────────────
  // src/app/ai/contracts/page.tsx:138 / :154
  "mode:draft": "صياغة عقد",
  "mode:review": "مراجعة عقد",
  // src/app/ai/contracts/page.tsx:186 / :202
  "complexity:simple": "عقد بسيط",
  "complexity:detailed": "عقد تفصيلي",
  // src/components/contracts/steps/draft/StepDomain.tsx:90-93. "ENGLISH فقط"
  // and "عربي / ENGLISH" are copied as ideas, not verbatim: an English word
  // must not reach a client-facing screen, and the same component names that
  // language in Arabic further down its own file (StepDomain.tsx:237
  // — { id: "en", label: "الإنجليزية" }), so this is that wizard's own word,
  // not a second translation. The 🌐 on "custom" is dropped for the same
  // reason the party-type emoji is.
  "language:ar": "عربي فقط",
  "language:en": "الإنجليزية فقط",
  "language:ar_en": "عربي / الإنجليزية",
  "language:custom": "لغة أخرى / مخصصة",
  // src/components/contracts/steps/draft/StepDomain.tsx:189 / :213
  "customLanguageLayout:single": "نسخة أحادية (لغة واحدة فقط)",
  "customLanguageLayout:dual": "نسخة ثنائية متقابلة (عمودين)",
  // src/components/contracts/steps/draft/StepDomain.tsx:236-237
  "customLanguageBase:ar": "العربية",
  "customLanguageBase:en": "الإنجليزية",
  // src/components/contracts/constants.ts:18-67 (CONTRACT_TYPES `title` — the
  // picker StepDomain.tsx renders). NDA / PDPL / (Handbook) are kept exactly
  // as the picker writes them: they are the terms of art the client read and
  // chose, and rewriting a legal type list here is precisely the drift this
  // file exists to prevent.
  "contractType:labor": "عقود العمل",
  "contractType:rent": "عقود الإيجار",
  "contractType:trade": "عقود التجارة",
  "contractType:corporate": "عقود الشركات",
  "contractType:construction": "عقود المقاولات",
  "contractType:tech": "عقود تقنية",
  "contractType:finance": "عقود مالية",
  "contractType:services": "عقود خدمات",
  "contractType:employment_exec": "عقد تنفيذي / إداري",
  "contractType:employment_remote": "عقد عمل عن بُعد",
  "contractType:employment_equity": "خطة حوافز وأسهم",
  "contractType:hr_handbook": "دليل الموظف (Handbook)",
  "contractType:termination": "إنهاء الخدمة",
  "contractType:nca": "عدم منافسة / سرية",
  "contractType:pip": "خطة التحسين الوظيفي",
  "contractType:ip_license": "عقد ترخيص ملكية فكرية",
  "contractType:ip_assignment": "نقل ملكية فكرية",
  "contractType:ip_nda": "اتفاقية سرية NDA",
  "contractType:ip_trademark": "عقد علامة تجارية",
  "contractType:ip_opensource": "مراجعة مصادر مفتوحة",
  "contractType:arbitration_clause": "بند التحكيم",
  "contractType:arbitration_req": "طلب التحكيم",
  "contractType:settlement": "اتفاقية تسوية",
  "contractType:demand_letter": "خطاب مطالبة / إنذار",
  "contractType:litigation_hold": "أمر حفظ الأدلة",
  "contractType:governance_board": "قرار مجلس الإدارة",
  "contractType:governance_agm": "قرار الجمعية العمومية",
  "contractType:governance_coi": "سياسة تعارض المصالح",
  "contractType:shareholders": "اتفاقية المساهمين",
  "contractType:investment": "اتفاقية استثمار",
  "contractType:whistleblower": "سياسة الإبلاغ عن المخالفات",
  "contractType:pdpl_privacy": "سياسة الخصوصية / PDPL",
  "contractType:pdpl_dpa": "اتفاقية معالجة البيانات",
  "contractType:pdpl_cookie": "سياسة ملفات تعريف الارتباط",
  "contractType:compliance_aml": "سياسة مكافحة غسل الأموال",
  "contractType:data_breach": "خطة الاستجابة لاختراق البيانات",
  "contractType:franchise": "عقد امتياز تجاري",
  "contractType:other": "أخرى",

  // ─── المحاكي الشامل (wargaming) ────────────────────────────────────────────
  // src/app/ai/wargaming/page.tsx:63-65 (CASE_ROLES)
  "role:plaintiff": "مدّعٍ / موكلي مدّعٍ",
  "role:defendant": "مدّعى عليه / دفاع",
  "role:advisor": "مستشار / محكّم / مراجع",
  // src/app/ai/wargaming/page.tsx:69-76 (CASE_AREAS)
  "area:labor": "نظام العمل",
  "area:commercial": "تجاري وشركات",
  "area:civil": "مدني",
  "area:criminal": "جنائي",
  "area:family": "أحوال شخصية",
  "area:real-estate": "عقاري",
  "area:arbitration": "تحكيم / وساطة",
  "area:admin": "إداري",
  // src/app/ai/wargaming/page.tsx:56-59 (SIM_TARGETS). `targets` is a
  // string[], so these resolve through the array branch of renderValue with
  // the parent key "targets".
  "targets:opponent": "محاكاة الخصم",
  "targets:court": "اتجاه المحكمة",
  "targets:critique": "نقض المذكرة",
  "targets:plea": "تدريب المرافعة",

  // ─── الرأي الفصل (legal_opinion) — outputType ──────────────────────────────
  // Titles from OUTPUT_TYPES (src/app/ai/legal-opinion/_constants.ts:19,28,
  // 35,42,49,59,71) but keyed on the STORED underscore ids, not that file's
  // hyphenated UI ids — page.tsx:42-50's OUTPUT_TYPE_TO_STORED does the
  // rewrite before the value is persisted, so "legal-memo" never reaches an
  // order and "memo" always does.
  "outputType:consult": "استشارة قانونية",
  "outputType:study": "دراسة قانونية",
  "outputType:memo": "مذكرة رأي",
  "outputType:research": "بحث قانوني",
  "outputType:due_diligence": "تقرير العناية الواجبة",
  "outputType:cross_exam": "مُولّد أسئلة الاستجواب",
  "outputType:letter": "خطاب رسمي",

  // ─── الرأي الفصل — topicArea ───────────────────────────────────────────────
  // src/app/ai/legal-opinion/page.tsx:57-68 (LEGAL_AREA_LABELS). In today's
  // wizard only two sub-flows put a value in this field — استشارة and دراسة,
  // the only context steps that render an area grid (grids at
  // ContextConsult.tsx:104-110 and ContextStudy.tsx:192-195), and the only two
  // setTopicArea() calls anywhere that pass a real id (ContextConsult.tsx:110,
  // ContextStudy.tsx:195). The only other invocations write "":
  // clearFlowState() (page.tsx:221, called at :540 on each sub-flow switch)
  // and the quick-chat box (page.tsx:510). The page's remaining mentions
  // (page.tsx:573, :581, :592) only pass the setter down as a prop.
  // Each of those two flows ends on a submit recap that renders topicArea
  // through this exact map (page.tsx:325 for استشارة, :335 for دراسة), so this
  // is the last Arabic the client saw for this field before pressing send; the
  // remaining branches of buildRecapRows (page.tsx:340-377) carry no
  // topic-area row at all.
  //
  // That is a statement about the wizard, not about stored data. The validator
  // takes topicArea as optional on EVERY sub-flow
  // (src/lib/services/orderIntake.legalOpinion.ts:36, :93, :102), so an order
  // written by an older build or by anything other than this wizard may carry
  // it under a different outputType — and nothing here breaks if it does,
  // because the map is keyed on the value id, not on the flow.
  //
  // The two area grids agree on all 27 ids except one: ContextStudy.tsx:20
  // labels `contracts` "تحرير عقود" where ContextConsult.tsx:18 and this map
  // both say "عقود".
  "topicArea:commercial": "تجاري",
  "topicArea:labor": "عمالي",
  "topicArea:civil": "مدني",
  "topicArea:admin": "إداري",
  "topicArea:family": "أحوال شخصية",
  "topicArea:real_estate": "عقاري",
  "topicArea:criminal": "جنائي",
  "topicArea:companies": "شركات",
  "topicArea:contracts": "عقود",
  "topicArea:ip": "ملكية فكرية",
  "topicArea:tax": "ضريبي وزكوي",
  "topicArea:insurance": "تأمين",
  "topicArea:banking": "بنكي ومالي",
  "topicArea:ma": "اندماج واستحواذ",
  "topicArea:bankruptcy": "إفلاس وإعادة هيكلة",
  "topicArea:execution": "تنفيذ وإشكالات",
  "topicArea:arbitration": "تحكيم دولي",
  "topicArea:maritime": "بحري وجوي",
  "topicArea:competition": "منافسة وحماية مستهلك",
  "topicArea:capital": "سوق مالية وأوراق مالية",
  "topicArea:gov_contract": "عقود حكومية",
  "topicArea:environment": "بيئة وموارد طبيعية",
  "topicArea:digital": "جرائم معلوماتية",
  "topicArea:medical": "طبي وصحي",
  "topicArea:tourism": "سياحة وضيافة",
  "topicArea:inheritance": "ميراث وتركات",
  "topicArea:other": "أخرى",

  // ─── الرأي الفصل — settings ────────────────────────────────────────────────
  // buildSettings() (page.tsx:271-307) writes these; each key below cites the
  // picker that produced it.
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:50-52
  "searchDepth:quick": "سريع",
  "searchDepth:deep": "عميق",
  "searchDepth:comprehensive": "شامل",
  // src/components/legal-opinion/ContextStudy.tsx:46,53,60,67,74 (STUDY_GOALS)
  "studyGoal:dispute": "دعوى / نزاع قائم",
  "studyGoal:planning": "استشارة وقائية",
  "studyGoal:drafting": "تحرير مستند / عقد",
  "studyGoal:academic": "بحث أكاديمي / مقارن",
  "studyGoal:compliance": "امتثال تنظيمي",
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:73-75
  "litigationStage:first": "ابتدائية",
  "litigationStage:appeal": "استئناف",
  "litigationStage:cassation": "نقض / تمييز",
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:120-122
  "memoDetailLevel:brief": "موجز",
  "memoDetailLevel:detailed": "مفصّل",
  "memoDetailLevel:comprehensive": "شامل",
  // src/components/legal-opinion/ContextMemo.tsx:13-16 (AUDIENCE_OPTIONS)
  "audience:judge": "قاضٍ",
  "audience:gov": "جهة حكومية",
  "audience:partner": "شريك / مستثمر",
  "audience:client": "عميل",
  // `side` carries two different pickers' values — the memo flow's lawyer
  // side (ContextMemo.tsx:143-145) and due diligence's own side
  // (ContextDueDiligence.tsx:221). The value sets don't overlap, so one field
  // scope covers both.
  "side:plaintiff": "مدّعٍ",
  "side:defendant": "مدّعى عليه",
  "side:neutral": "حيادي / مستشار",
  "side:buyer": "مشترٍ",
  "side:seller": "بائع",
  "side:investor": "مستثمر",
  // src/components/legal-opinion/ContextResearch.tsx:19,27,33
  // (RESEARCH_TYPE_OPTIONS)
  "researchType:text": "بحث في نص محدد",
  "researchType:topic": "بحث في موضوع عام",
  "researchType:compare": "بحث مقارن",
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:166-168. Field-
  // scoped rather than plain on purpose: the letter flow stores
  // `deadlineDays: "10"` (LetterWorkflow.tsx:63), and a plain "10" key would
  // silently rewrite that unrelated number too.
  "researchLimit:5": "٥",
  "researchLimit:10": "١٠",
  "researchLimit:unlimited": "غير محدود",
  // src/components/legal-opinion/ContextDueDiligence.tsx:18-21 (ENTITY_TYPES).
  // `entityType:company` is deliberately absent — the plain `company` key
  // above already resolves to that picker's own "شركة".
  "entityType:property": "عقار",
  "entityType:project": "مشروع",
  "entityType:deal": "صفقة",
  // src/components/legal-opinion/ContextDueDiligence.tsx:25-28 (DD_GOALS)
  "goal:acquisition": "استحواذ",
  "goal:investment": "استثمار",
  "goal:partnership": "شراكة",
  "goal:dispute": "تسوية نزاع",

  // ─── الرأي الفصل — letter ──────────────────────────────────────────────────
  // src/app/ai/legal-opinion/_constants.ts (LETTER_TYPES) plus the "other" tile
  // the picker appends inline
  // (src/app/ai/legal-opinion/_components/LetterWorkflow.tsx).
  // Every id in LETTER_TYPES must appear below: valueLabelAr falls back to the
  // raw stored value, so a missing key prints the English id in the admin brief.
  // Wording follows LETTER_TYPES in src/app/ai/legal-opinion/_constants.ts —
  // the owner's own list, which covers the Saudi families he asked for
  // (government/grievance, real estate, commercial). Change one, change the other.
  "letterType:warning": "إنذار قانوني",
  "letterType:termination": "إخطار بفسخ عقد / إنهاء علاقة",
  "letterType:demand": "مطالبة مالية وسداد مستحقات",
  "letterType:eviction": "إشعار إخلاء عقار",
  "letterType:settlement": "عرض تسوية ودية",
  "letterType:notice": "إخطار رسمي",
  "letterType:objection": "تظلم / اعتراض إداري",
  "letterType:request": "طلب مستند / إفادة رسمية",
  "letterType:proxy": "تفويض / إقرار رسمي",
  "letterType:release": "طلب إفراج عن مستند / كفالة",
  "letterType:other": "أخرى",
  // Retired from the picker, KEPT here on purpose. Orders placed before the list
  // was reworked still carry these ids in metadata.intake, and valueLabelAr falls
  // back to the raw stored value — so deleting these lines would print «complaint»
  // in English to the team on every one of those older letters.
  "letterType:complaint": "شكوى",
  // src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:346 and :361 —
  // these two pickers say "شركة / مؤسسة" where the party-type picker says
  // plain "شركة", so they need the field scope to win over it.
  "senderRole:company": "شركة / مؤسسة",
  "recipientType:company": "شركة / مؤسسة",
};

/**
 * Resolve one stored intake value to the Arabic its own picker showed.
 *
 * A non-string (boolean, number, null) is returned through String() — callers
 * that render booleans as نعم/لا must handle them BEFORE calling this, or
 * `true` arrives here and comes back as "true".
 *
 * The fallback returns the raw value unchanged. That is deliberate and must
 * stay: an untranslated value is bad, but a crash or a blank row is worse, and
 * free text — which is most of what a client submits — depends on it to reach
 * the screen exactly as typed.
 */
export function valueLabelAr(field: string, value: unknown): string {
  if (typeof value !== "string") return String(value);
  return INTAKE_VALUE_AR[`${field}:${value}`] ?? INTAKE_VALUE_AR[value] ?? value;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The label layer, and the pure walk that decides which rows the summary
 * shows.
 *
 * This lived inside OrderSummary.tsx until the review of the first pass. It
 * moved out for one reason: OrderSummary.tsx is JSX, and Node's native
 * TypeScript support strips types but does not compile JSX, so `node --test`
 * cannot import it. Both defects the reviewer found — a duplicated row, and
 * English keys inside a nested object — live in the row-building, not in the
 * value dictionary. Leaving the walk in the component meant a test could only
 * ever reach valueLabelAr() while the actual bug sat in a file the test runner
 * cannot load. OrderSummary.tsx now maps the tree below to JSX and decides
 * nothing else.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Arabic label per intake field — "what was asked", where INTAKE_VALUE_AR
 * above answers "what did they answer".
 *
 * Pooled across every field name that appears in any of the four services'
 * intake schemas (orderIntake.ts / .contracts.ts / .wargaming.ts /
 * .legalOpinion.ts), including the nested judgment/parties/letter/settings
 * sub-objects. A field not listed here still renders — under its raw key —
 * rather than silently vanishing, so a schema change never produces a
 * quietly-incomplete summary.
 *
 * Keys are either a plain field name or `parent:child`, resolved by labelFor()
 * in that order — the same two-layer scheme INTAKE_VALUE_AR uses, and for the
 * same reason: `scope` contains an `ip` and a `contracts`, `memoStructure`
 * contains an `attachments`, and a plain key for any of those three would
 * rewrite an unrelated field elsewhere in the summary.
 */
export const INTAKE_LABELS: Record<string, string> = {
  // draft (الصائغ القانوني)
  clientRole: "صفة الموكل",
  memoType: "نوع المذكرة",
  memoSubType: "نوع المذكرة الفرعي",
  legalBranch: "الفرع القانوني",
  caseText: "وقائع القضية",
  judgment: "الحكم القضائي المرفق",
  lawyerNotes: "ملاحظات إضافية",
  // contracts (محترف العقود)
  mode: "نوع الطلب",
  complexity: "مستوى التفصيل",
  contractType: "نوع العقد",
  language: "لغة العقد",
  customLanguageName: "اسم اللغة المخصصة",
  customLanguageLayout: "تنسيق اللغة المخصصة",
  customLanguageBase: "اللغة الأساس",
  contractDesc: "وصف العقد",
  courtType: "نوع المحكمة / الجهة",
  selectedClauses: "البنود المختارة",
  additionalClauses: "بنود إضافية",
  representing: "الطرف الذي تمثله",
  concerns: "نقاط القلق",
  otherParty: "الطرف الآخر",
  // shared: parties (draft + contracts)
  parties: "الأطراف",
  one: "الطرف الأول",
  two: "الطرف الثاني",
  // wargaming (المحاكي الشامل)
  role: "الصفة في القضية",
  area: "التخصص القانوني",
  caseSummary: "ملخص القضية",
  targets: "أهداف المحاكاة",
  memoText: "نص المذكرة",
  // The subset of uploaded documents the client tagged as the memo being
  // critiqued (orderIntake.wargaming.ts:35). What is stored is a list of
  // document numbers, not file names, and the label says exactly that rather
  // than promising a file list this row does not carry — the files themselves
  // are listed under مرفقاتك further down the same card. The wizard's own
  // wording for the thing is "المذكرة المراد نقضها"
  // (src/app/ai/wargaming/page.tsx:648).
  memoAttachmentIds: "أرقام مستندات المذكرة المراد نقضها",
  // ── Client + corporate intake (owner's ruling, 26 August) ──────────────────
  // Three surfaces now write a generic intake instead of one of the four AI
  // schemas: the client request form, the corporate «التقييم القانوني المجاني»
  // lead, and the public consultation booking. labelFor() falls back to the raw
  // key, so a field without an entry here reaches the fulfilment team as its
  // English name — the defect fixed in a879f6e, and adding a field is exactly
  // how it comes back.
  subject: "موضوع الطلب",
  specialty: "التخصص",
  specialtyLabel: "التخصص",
  // `companyName` is NOT repeated here — it already exists further down for the
  // letter wizard's party fields («اسم الشركة»), and that wording serves the
  // corporate lead just as well. A second entry is a duplicate-key compile error.
  companySize: "حجم الشركة",
  legalNeeds: "الاحتياجات القانونية",
  contactName: "اسم مسؤول التواصل",
  contactPhone: "رقم الجوال",
  contactEmail: "البريد الإلكتروني",
  notes: "ملاحظات العميل",
  consultationType: "نوع الاستشارة",
  // Written by the consultation wizard when the client picked a specific
  // lawyer. Without a label here the fulfilment brief prints the raw key
  // «lawyerName» — labelFor() deliberately falls back to the key rather than
  // dropping the row, so a missing label is visible but ugly.
  lawyerName: "المحامي المطلوب",
  preferredTiming: "التوقيت المطلوب",
  estimatedPrice: "السعر التقديري",
  // ── The floating WhatsApp widget (2026-08-27) ─────────────────────────────
  // A fourth surface writing a generic intake. It used to save its request to
  // browser localStorage under a `receiver` nothing reads; it now POSTs a real
  // order, which means its answers reach this map for the first time. Each
  // label is the widget's own on-screen wording, copied rather than
  // re-translated — see the rule stated above.
  city: "المدينة",
  contractService: "نوع المراجعة",
  notaryType: "نوع الوثيقة",
  notaryLocation: "طريقة التوثيق",
  // The corporate «تسجيل قضية / طلب قانوني جديد» modal
  // (src/app/dashboard/business/_components/AddCaseModal.tsx), which reached
  // localStorage instead of the queue until it was repointed at
  // /api/v1/service-requests. Each label is that modal's own on-screen
  // wording, copied rather than re-translated, on the same rule as every
  // other group in this file: the team's brief and the form the client filled
  // in must say the same thing. The four VALUES are already Arabic — they come
  // from CASE_TYPES / DEPARTMENTS / the urgency buttons, not from machine ids
  // — so they need no INTAKE_VALUE_AR entry, only these labels. Without them
  // the fulfilment team reads «caseType», «department», «urgency», «details».
  caseType: "نوع الطلب / القضية",
  department: "القسم الطالب",
  urgency: "مستوى الأهمية / الاستعجال",
  details: "تفاصيل إضافية لفريق نظامي القانوني",
  // legal_opinion (الرأي الفصل)
  outputType: "نوع الطلب",
  topicArea: "مجال الموضوع",
  description: "الوصف",
  question: "السؤال",
  settings: "إعدادات إضافية",
  letter: "بيانات الخطاب",
  // judgment sub-fields
  number: "الرقم",
  court: "المحكمة",
  date: "التاريخ",
  text: "النص",
  reasons: "الأسباب",
  // PartyData sub-fields (parties.one / parties.two — draft + contracts).
  // Sourced from the PartyData type itself (src/components/draft/
  // draftConstants.ts:124-131), not guessed: type, companyName,
  // commercialReg, unifiedNum, representative, representativeRole, address,
  // fullName, idNumber, nationality, entityName, unifiedNumGov,
  // contactPerson, taxOrCustomsNum — every field the wizard can collect for
  // a party, company or government entity.
  type: "نوع الطرف",
  companyName: "اسم الشركة",
  commercialReg: "السجل التجاري",
  unifiedNum: "الرقم الموحّد",
  representative: "الممثل",
  representativeRole: "صفة الممثل",
  address: "العنوان",
  fullName: "الاسم الكامل",
  idNumber: "رقم الهوية",
  entityName: "اسم الجهة",
  unifiedNumGov: "الرقم الموحّد للجهة",
  contactPerson: "مسؤول التواصل",
  taxOrCustomsNum: "الرقم الضريبي / الجمركي",
  nationality: "الجنسية",
  // legal_opinion `letter` sub-fields (outputType: "letter"). Sourced from the
  // object literal LetterWorkflow.tsx's submitLetterOrder() actually sends
  // (src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:154-168), read
  // rather than guessed. `letterTypeLabel` is deliberately absent — see
  // HIDDEN_NESTED_KEYS below.
  letterType: "نوع الخطاب",
  letterTypeCustom: "نوع الخطاب (مخصص)",
  senderName: "اسم المرسل",
  senderRole: "صفة المرسل",
  recipientName: "اسم المستلم",
  recipientType: "صفة المستلم",
  govEntity: "الجهة الحكومية",
  responseDeadline: "مهلة الرد مطلوبة",
  deadlineDays: "عدد أيام المهلة",
  letterSubject: "موضوع الخطاب",
  letterLegalRef: "السند النظامي",
  // أسماء يكتبها العميل لتُدرَج في قائمة «المرفقات» أسفل نص الخطاب — وليست
  // ملفات مرفوعة. الملفات الحقيقية تصل في `attachments` على مستوى الطلب، لا
  // هنا، والتسمية تقولها صراحةً كي لا يبحث الفريق عن ملف لا وجود له.
  attachmentLabels: "مرفقات ذيل الخطاب (أسماء فقط — غير مرفوعة)",
  fullLetterText: "نص الخطاب",
  // legal_opinion `settings` sub-fields — the six non-letter sub-flows
  // (consult/study/legal-memo/research/due-diligence/cross-exam). Sourced from
  // buildSettings() in src/app/ai/legal-opinion/page.tsx:271-307, read rather
  // than guessed. Some keys (side, entityName, entityType, goal) are reused
  // across more than one sub-flow with a shared, still-accurate Arabic label.
  searchDepth: "عمق البحث",
  studyGoal: "هدف الدراسة",
  litigationStage: "مرحلة التقاضي",
  memoStructure: "هيكل المذكرة",
  memoDetailLevel: "مستوى التفصيل",
  audience: "الجهة المخاطَبة",
  side: "الجهة الممثَّلة",
  researchType: "نوع البحث",
  compareWith: "المقارنة مع",
  keywords: "الكلمات المفتاحية",
  researchSources: "مصادر البحث",
  researchLimit: "حد نتائج البحث",
  entityType: "نوع الجهة",
  extraField: "بيانات إضافية",
  goal: "الهدف",
  scope: "نطاق الفحص",
  witnessRole: "صفة الشاهد",
  destroyGoal: "الهدف من الاستجواب",

  // ─── nested checkbox maps: here the KEY is the answer ─────────────────────
  // Three settings fields are Record<string, boolean> checkbox maps. Every
  // other nested object in every intake carries its meaning in field names
  // this map already translates; these three carry it in ids no other field
  // uses, so without the rows below a client reads
  // «هيكل المذكرة: facts: نعم، legal: نعم، …» — English, on their own receipt,
  // in الرأي الفصل. Each Arabic string is copied from the checkbox the client
  // actually ticked, never re-translated, on the same rule as INTAKE_VALUE_AR.
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:97-100
  "memoStructure:facts": "الوقائع",
  "memoStructure:legal": "الأساس النظامي",
  "memoStructure:recommendation": "التوصية",
  "memoStructure:attachments": "الملاحق",
  // src/app/ai/legal-opinion/_components/SettingsStep.tsx:144-147
  "researchSources:nzamy": "قاعدة نظامي",
  "researchSources:laws": "الأنظمة واللوائح",
  "researchSources:judgments": "الأحكام القضائية",
  "researchSources:decrees": "المراسيم الملكية",
  // src/components/legal-opinion/ContextDueDiligence.tsx:32-37 (DD_SCOPE_ITEMS).
  // Field-scoped rather than plain for a concrete reason: `scope` contains a
  // `contracts` and an `ip`, and a plain key for either would collide with the
  // contract-type and intellectual-property fields elsewhere in this map.
  "scope:legal_structure": "الهيكل القانوني",
  "scope:regulatory": "الالتزامات التنظيمية",
  "scope:contracts": "العقود القائمة",
  "scope:disputes": "النزاعات المعلقة",
  "scope:ip": "الملكية الفكرية",
  "scope:financial": "البنية المالية (للاطلاع فقط)",
};

/**
 * Resolve one intake key to its Arabic label. `parent` is the key of the
 * object this one sits inside, or undefined at the top level.
 *
 * The fallback returns the raw key, deliberately: an untranslated label is
 * bad, but a row that silently disappears from a client's receipt is worse.
 */
export function labelFor(key: string, parent?: string): string {
  if (parent) {
    const scoped = INTAKE_LABELS[`${parent}:${key}`];
    if (scoped) return scoped;
  }
  return INTAKE_LABELS[key] ?? key;
}

// Top-level intake keys that either duplicate the attachment list (rendered
// separately, below, with download links) or are bookkeeping the client has no
// use for — every service's *IntakeV1 shape carries `attachments`/
// `schemaVersion`/`service` inline (see collectAttachments() call sites), so
// this list is shared across all four rather than hidden per-service.
//
// Top level ONLY, and it must stay that way: `memoStructure.attachments` is
// the client's own "الملاحق" checkbox (SettingsStep.tsx:100), and applying
// this set inside nested objects would delete a real answer.
export const HIDDEN_INTAKE_KEYS = new Set(["attachments", "schemaVersion", "service"]);

/**
 * Nested keys suppressed as `parent:child`, because a sibling already says the
 * same thing.
 *
 * `letter.letterTypeLabel` is the only member today. LetterWorkflow.tsx:86-88
 * derives it from letterType and submitLetterOrder() (:154-157) stores both.
 * Once letterType itself resolves to Arabic through INTAKE_VALUE_AR the two
 * rows are byte-identical — «نوع الخطاب: إنذار قانوني» printed twice — for
 * every letter type except "other", because the only key between them,
 * letterTypeCustom, is undefined for all the rest.
 *
 * For "other", letterTypeLabel holds the client's own wording, and dropping it
 * loses nothing: letterTypeCustom holds that same text under
 * «نوع الخطاب (مخصص)», and it can never be blank in a submitted order.
 *
 * That last part is a reachability argument about LetterWorkflow.tsx, not a
 * one-line fact, so it is written out here in full. Re-derive all four steps
 * before adding any new way into step 2 — every line number below is that
 * file's:
 *   1. Steps 2, 3 and 4 are one closed group. setLetterStep(2) is called at
 *      :319 and :626, setLetterStep(3) at :450 and :745, setLetterStep(4) at
 *      :636 — and every one of those except :319 fires from a control inside
 *      a step-2/3/4 panel. So :319, step 1's "التالي", is the only door out of
 *      step 1, and :320 disables it whenever
 *      `!letterType || (letterType === "other" && !letterTypeCustom.trim())`
 *      — the second half is the one that matters here.
 *   2. letterTypeCustom is writable only from step 1: the type tiles clear it
 *      when a non-"other" type is picked (:254) and the text box sets it
 *      (:297), both inside the `letterStep === 1` block. Nothing on steps 2-4
 *      can empty it.
 *   3. The only live return to step 1 is :440, step 2's "رجوع". Going back and
 *      clearing the field re-arms that same disabled gate at :320, so the
 *      client cannot move forward again. (A grep for setLetterStep(1) finds a
 *      second call, at :837. That button is inside `{letterDone && (` at :772,
 *      the legacy "الخطاب الجاهز" panel, which never renders: the only
 *      setLetterDone(true) is at :134 inside generateLetter(), which the file
 *      defines at :130 and no line in src/ calls — :768-771 documents the
 *      panel as deliberately kept, not live. It is not a return path.)
 *   4. submitLetterOrder() is reachable only from step 4 (:755).
 */
export const HIDDEN_NESTED_KEYS = new Set(["letter:letterTypeLabel"]);

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    // An object counts as empty when none of its fields — other than a bare
    // "type" discriminant — carry a real value. Plain
    // `Object.keys(...).length === 0` is never true for an untouched party:
    // EMPTY_PARTY (src/components/draft/draftConstants.ts) always sets
    // `type: "individual"` even when the client never touched that party at
    // all, so a shallow key-count check would keep rendering its heading with
    // nothing meaningful underneath it — just "نوع الطرف: فرد". Any other
    // structural field that always carries a non-empty default would hit the
    // same trap; "type" is the one that actually occurs in today's intake
    // shapes.
    return !Object.entries(v as Record<string, unknown>).some(
      ([k, val]) => k !== "type" && !isEmptyValue(val),
    );
  }
  return false;
}

/** One rendered value: a line of text, a bullet list, or a nested block. */
export type SummaryValue =
  | { kind: "text"; text: string }
  | { kind: "list"; items: SummaryValue[] }
  | { kind: "fields"; fields: SummaryField[] };

/** One labelled row. `key` is the raw intake key, kept for React keys. */
export interface SummaryField {
  key: string;
  label: string;
  value: SummaryValue;
}

/**
 * Build the display tree for one intake value.
 *
 * `field` is the intake key this value sits under — threaded through every
 * branch so a scalar resolves against the right picker. An array's items
 * resolve against the array's OWN key (`targets`, not an index), and a nested
 * object's children resolve against their own child key with the parent in
 * hand, which is what makes `parties.one.type` land on the party-type picker
 * rather than on whatever else happens to be called "type", and makes
 * `memoStructure.attachments` read "الملاحق" instead of borrowing some other
 * field's label.
 *
 * Order matters: the boolean branch stays first. valueLabelAr() returns
 * String(v) for a non-string, so a hoisted call would render
 * `responseDeadline: true` as "true" — English, on a client's screen.
 *
 * Returns null when there is nothing left to show, so the caller drops the row
 * rather than printing a label with a blank after it.
 */
export function buildSummaryValue(field: string, value: unknown): SummaryValue | null {
  if (typeof value === "boolean") return { kind: "text", text: value ? "نعم" : "لا" };

  if (Array.isArray(value)) {
    const items = value
      .filter((v) => !isEmptyValue(v))
      .map((v) => buildSummaryValue(field, v))
      .filter((n): n is SummaryValue => n !== null);
    if (items.length === 0) return null;
    return { kind: "list", items };
  }

  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => !HIDDEN_NESTED_KEYS.has(`${field}:${k}`) && !isEmptyValue(v))
      .map(([k, v]) => ({ key: k, label: labelFor(k, field), value: buildSummaryValue(k, v) }))
      .filter((f): f is SummaryField => f.value !== null);
    if (fields.length === 0) return null;
    return { kind: "fields", fields };
  }

  // The dictionary miss returns the raw value unchanged, which is how a
  // client's own free text — وقائع القضية, نقاط القلق, اسم الطرف الآخر —
  // reaches the screen exactly as they typed it.
  return { kind: "text", text: valueLabelAr(field, value) };
}

/** The rows the summary shows, in stored order, for one order's intake. */
export function buildSummaryRows(intake: Record<string, unknown>): SummaryField[] {
  return Object.entries(intake)
    .filter(([k, v]) => !HIDDEN_INTAKE_KEYS.has(k) && !isEmptyValue(v))
    .map(([k, v]) => ({ key: k, label: labelFor(k), value: buildSummaryValue(k, v) }))
    .filter((r): r is SummaryField => r.value !== null);
}
