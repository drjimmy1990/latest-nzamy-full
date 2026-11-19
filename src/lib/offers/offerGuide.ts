/**
 * offerGuide.ts — «دليل إنشاء عرض جديد» (owner register 14 item 20; file 15
 * row 25; batch l9): every field the owner listed (name, dates, audience,
 * price or discount or points, seat cap, terms version, text and button),
 * mapped to what the admin offers page REALLY does today. Shown as a
 * collapsible panel on /dashboard/admin/offers; the same text is in
 * docs/offers/OFFERS_GUIDE_AR.md.
 *
 * Honest about the limits: an offer has no price, discount or points field of
 * its own. Checkout charges the linked price-book item's price; a discount is
 * a coupon; points come from a top-up pack. A price or points amount that is
 * not in the price book needs the programmer (the price book is code).
 *
 * Pure (no imports), so `node --test` loads it (./offerGuide.test.ts).
 */

export interface OfferGuideStep {
  /** The owner's word for the field. */
  title: string;
  lines: readonly string[];
}

export const OFFER_GUIDE_TITLE_AR = "دليل إنشاء عرض جديد";

export const OFFER_GUIDE_STEPS_AR: readonly OfferGuideStep[] = [
  {
    title: "١. الاسم والنص",
    lines: [
      "«العنوان» حتى ١٢٠ حرفًا، و«النص» حتى ١٠٠٠ حرف؛ يظهران في النافذة والبطاقة وصفحة الأسعار كما تكتبهما.",
      "صورة أو فيديو اختياريان: رابط https أو مسار داخل الموقع.",
    ],
  },
  {
    title: "٢. التواريخ",
    lines: [
      "«البداية» و«النهاية» بتوقيت الرياض؛ البداية الفارغة = فورًا، والنهاية الفارغة = بلا نهاية.",
      "الخادم يقارن بساعته هو، لا بساعة جهاز المستخدم.",
    ],
  },
  {
    title: "٣. الفئة (الجمهور)",
    lines: [
      "اختر أنواع الحسابات: محامٍ مترافع، مستشار قانوني، مكتب محاماة، فرد، منشأة.",
      "«حالة التوثيق»: الكل، أو الموثَّقون فقط، أو غير الموثَّقين فقط.",
      "«استثناء من اشترى» يُخفي العرض عمّن دفع للبند المرتبط من قبل.",
    ],
  },
  {
    title: "٤. السعر أو الخصم أو النقاط",
    lines: [
      "السعر: اختر «البند المرتبط» من قائمة الأسعار. صفحة الدفع تتقاضى سعر ذلك البند كما هو في القائمة؛ لا يوجد حقل سعر خاص بالعرض.",
      "الخصم: أنشئ كوبونًا من «الكوبونات» واكتب رمزه في نص العرض؛ يكتبه المشتري في خانة الكوبون عند الدفع. الكوبون لا يسري على شحن النقاط ولا على عضوية المؤسس.",
      "النقاط: اربط العرض بباقة شحن من قائمة الأسعار؛ عدد النقاط وسعرها هما ما في الباقة.",
      "سعر أو عدد نقاط غير موجود في القائمة يحتاج المبرمج، لأن قائمة الأسعار في الكود.",
    ],
  },
  {
    title: "٥. سقف المقاعد",
    lines: [
      "«عدد المقاعد الكلي» (الفارغ = غير محدود). المتبقي = الكلي − (المقاعد المستهلكة يدويًا + المشتريات المدفوعة للبند المرتبط منذ بداية العرض).",
      "عند نفاد المقاعد يختفي العرض تلقائيًا. عرض المؤسس يقرأ مقاعده من الحملة نفسها.",
    ],
  },
  {
    title: "٦. إصدار الشروط",
    lines: [
      "كل عرض يخضع لشروط الاستخدام النافذة وقت الشراء (صفحة /terms)، ولا يُحفظ إصدار شروط خاص بكل عرض.",
      "عرض المؤسس يخضع أيضًا لشروط العضوية المؤسِّسة التي يوافق عليها المشتري في صفحة الدفع.",
    ],
  },
  {
    title: "٧. النص والزر",
    lines: [
      "«نص الزر» حتى ٤٠ حرفًا، و«رابط الزر» مسار داخل الموقع يبدأ بـ / (مثل /pricing أو /founder).",
    ],
  },
  {
    title: "٨. التجربة ثم التفعيل",
    lines: [
      "احفظ العرض «مسودة»، واضغط «معاينة» لترى البطاقة كما تظهر، ثم غيّر الحالة إلى «فعّال».",
      "«إيقاف فوري» يُخفيه في الحال. أرقام الظهور والإغلاق والنقر والمشتريات تظهر في الجدول.",
    ],
  },
  {
    title: "٩. النافذة المنبثقة",
    lines: [
      "تظهر نافذة واحدة في المرة: العرض الأعلى «أولوية». بعد إغلاقها تعود بعد «عودة النافذة» (الافتراضي ٤٣٢٠ دقيقة = ٣ أيام).",
      "لا تظهر النافذة في صفحات الدفع والتسجيل والشروط ولوحة الإدارة.",
    ],
  },
];
