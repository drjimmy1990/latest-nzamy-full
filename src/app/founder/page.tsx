import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import {
  FOUNDER_ADVOCATE_ONLY_LINE,
  FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE,
  FOUNDER_ONCE_LINE,
  FOUNDER_TERMS_PATH,
  FOUNDER_TERMS_REFUND_PATH,
  FOUNDER_WORK_KINDS,
  founderLandingPrice,
} from "@/lib/founder/landingCopy";
import { buildFounderOfferJsonLd, serializeJsonLd } from "@/lib/publicSeo/structuredData";
import { FounderWindowProvider } from "./_components/FounderWindowProvider";
import { HeroMeter } from "./_components/HeroMeter";
import { JoinButton } from "./_components/JoinButton";
import { LibraryGifs } from "./_components/LibraryGifs";
import { PulsePopup } from "./_components/PulsePopup";
import { SampleMemos } from "./_components/SampleMemos";
import { WindowLine } from "./_components/WindowLine";

/**
 * /founder — the founder-lawyer campaign landing page (owner package of
 * 17 Nov 2026, «02_حملة_المؤسس_واللانديج»), ported from the owner's
 * prototype. What was deliberately NOT ported:
 *   - the preview bar (`.dev`), the seat slider, the prototype footer line;
 *   - the hero's eight-station race track with its «٩ من ١٠» trophy: the
 *     owner's conflict ruling ٣ allows the page to describe the live
 *     drafter's stages only, never the unpublished eight;
 *   - the prototype's video placeholder: the real promo (V16, the owner's
 *     WhatsApp 720p cut, public/media/founder/) sits right after the hero
 *     instead — controls, no autoplay, preload="none" so nothing but the
 *     poster loads before the visitor presses play;
 *   - the site-wide Navbar/Footer: they name products the campaign must not
 *     mention, so the page carries its own small header and footer.
 * Numbers: the price from quote() (landingCopy.ts, pinned to the manifest),
 * the dates, clock and seats from GET /api/v1/campaigns/active
 * (FounderWindowProvider). Nothing time-dependent renders on the server.
 */

// l9 (owner register 14 item 62): the «other tool» output stays an internal
// entitlement and is not shown on this page nor in /founder-terms.
const FOUNDER_DESCRIPTION =
  "عضوية تأسيسية محدودة للمحامي المرخص فقط: ستة أعمال قضائية بالصائغ القانوني، والمكتبة القانونية، لمدة اثني عشر شهراً من التفعيل.";

// Owner 18 Nov, item 4.6: schema.org Product + Offer (price 2,996 SAR before
// VAT from quote(), valid to the manifest's last day) — src/lib/publicSeo/structuredData.ts.
const FOUNDER_OFFER_JSON_LD = buildFounderOfferJsonLd({
  description: FOUNDER_DESCRIPTION,
  endsAtExclusive: FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE,
});

export const metadata = buildMetadata({
  titleAr: "باقة المحامي المؤسس",
  titleEn: "Founding Lawyer Membership",
  descriptionAr: FOUNDER_DESCRIPTION,
  path: "/founder",
  keywords: ["المحامي المؤسس", "باقة المؤسس", "الصائغ القانوني"],
});

const JOIN_ID = "join";
/** V16 promo (owner package 17 Nov 2026, 08_المواد_التسويقية/video): 1280×720, 122.7 s, 7.5 MB. */
const PROMO_VIDEO_SRC = "/media/founder/promo-whatsapp-720p.mp4";
const PROMO_POSTER_SRC = "/media/founder/video-poster.jpg";
const PRICE = founderLandingPrice();

const wrap = "mx-auto max-w-[1180px] px-4 sm:px-6";
const goldBtn =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-gradient-to-l from-[#E6CD8E] to-[#C8A762] px-6 py-3 font-bold text-[#2A1F07] shadow-[0_8px_24px_rgba(200,167,98,.35)] motion-safe:transition hover:brightness-105";
const ghostBtn =
  "inline-flex min-h-[46px] items-center justify-center rounded-full border-[1.5px] border-white/40 px-6 py-3 font-bold text-white motion-safe:transition hover:bg-white/10";
const h2Light = "font-brand text-[26px] font-extrabold leading-snug text-[#0B3D2E] dark:text-[#E6CD8E] md:text-[36px]";
const subLight = "mt-3.5 max-w-[44em] text-[#4B6158] dark:text-zinc-400";
const lightBase = "bg-[#F2F5F1] text-[#14261F] dark:bg-[#0c0f12] dark:text-zinc-200";
const lightSection = `${lightBase} py-16 md:py-20`;
const darkSection = "bg-[#06201A] py-16 text-white md:py-20";

const BENTO: Array<{ title: string; text: string; wide?: boolean }> = [
  { title: "ترويسة مكتبك الرسمية", text: "شعارك وترخيصك وباركود التحقق على كل مطبوع ومذكرة تصدرها." },
  { title: "منقح ناجز الذكي", text: "يضبط الصحائف والمذكرات على سقف الحروف المسموح دون إخلال بالحجة." },
  { title: "الحاسبات القانونية", text: "حاسبة المواعيد والرسوم القضائية والمستحقات العمالية." },
  { title: "شارة «المحامي المؤسس»", text: "تظهر في ملفك المهني بعد التفعيل." },
  {
    title: "إدارة المكتب تُفتح تباعاً",
    text: "مشمولة تلقائياً ضمن مدة عضويتك المحسوبة من تاريخ التفعيل، دون أي رسوم إضافية، ولا تبدأ مدة جديدة عند إتاحتها.",
    wide: true,
  },
];

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "ماذا يعني «٦ أعمال»؟",
    a: "ستة أعمال من الأنواع السبعة المؤهلة تختارها أنت وتكرر النوع الواحد إن شئت، خلال سنة العضوية.",
  },
  { q: "هل التنقيح يخصم عملاً آخر؟", a: "لا. جولة التنقيح الثانية داخل الجلسة نفسها لا تخصم من رصيد أعمالك." },
  {
    q: "ماذا يشمل السعر؟",
    // l9 (register 14 items 6 / 48 / 63; /founder-terms item ٥): open for the year while the balance is 50 or more
    a: "يشمل ٦ أعمال قانونية. والمكتبة القانونية مفتوحة لك طوال سنة العضوية بشرط ألا ينزل رصيدك عن ٥٠ نقطة، فإذا نزل عنها أُقفل التصفح حتى تشحن، والشحن لا يجدّد السنة. ويصلك ١٠٠ نقطة تأسيسية فتعمل المكتبة من اليوم الأول، وتُستعمل أيضاً في مساعد المكتبة الذكي، والسؤال الواحد عليه يخصم ٥ نقاط، ويقف المساعد إذا قلّ رصيدك عن كلفة السؤال، ويعود التصفح والمساعد بعد الشحن فور بلوغ رصيدك ٥٠ نقطة. وأقل شحنة للمحامي ٥٠٠ نقطة، والنقطة = ريال واحد قبل الضريبة.",
  },
  { q: "هل السعر هو سعر كل مذكرة؟", a: "لا. ٢٬٩٩٦ ر.س قيمة الباقة كلها، وليست سعراً لعمل منفرد." },
  { q: "متى تبدأ مدة العضوية؟", a: "من لحظة تفعيل العضوية بعد توثيق الرخصة وإتمام السداد." },
  {
    q: "هل تعدّلون العروض والباقات لاحقاً؟",
    a: "تحتفظ نظامي بحق تحديث عروضها وباقاتها في أي وقت بما يحفظ استمرارية الخدمة وجودتها، دون المساس بحقوق المشتركين المكتسبة في باقتهم. ويبقى ما اشتريته لك كاملاً طوال مدة عضويتك.",
  },
  {
    // Owner 18 Nov (urgent fix of item ٧ of /founder-terms): 14 days, if no AI feature was used; l9 (register 16): and no more than 5 full texts read.
    q: "هل أستطيع الاسترداد؟",
    a: (
      <>
        نعم، خلال ١٤ يوماً من الشراء إن لم تستخدم أي ميزة ذكاء اصطناعي في الباقة ولم تقرأ أكثر من ٥ ملفات نصاً كاملاً في المكتبة، ولا يمنع الاسترداد تصفح المكتبة في هذه الحدود، ويُردّ المبلغ كاملاً شاملاً الضريبة، وفق{" "}
        <Link href={FOUNDER_TERMS_REFUND_PATH} className="font-bold text-[#0B3D2E] underline dark:text-[#E6CD8E]">
          صفحة الشروط
        </Link>
        .
      </>
    ),
  },
];

export default function FounderPage() {
  return (
    <FounderWindowProvider>
      {FOUNDER_OFFER_JSON_LD && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(FOUNDER_OFFER_JSON_LD) }} />
      )}
      <div dir="rtl" className="font-body text-[17px] leading-[1.85]">
        {/* ── header ── */}
        <header className="sticky top-0 z-30 bg-[#06201A]/95 text-white backdrop-blur">
          <div className={`${wrap} flex h-16 items-center justify-between gap-4`}>
            <Link href="/" className="font-brand text-[22px] font-extrabold">
              نظامي<b className="text-[#C8A762]"> · </b>
              <span className="hidden text-base font-medium sm:inline">المحامي المؤسس</span>
            </Link>
            <a href={`#${JOIN_ID}`} className={`${goldBtn} whitespace-nowrap px-5 text-sm`}>
              انضم إلى المؤسسين
            </a>
          </div>
        </header>

        {/* ── hero ── */}
        <section
          aria-labelledby="founder-h1"
          className="overflow-hidden bg-[#06201A] bg-[radial-gradient(1200px_600px_at_85%_-10%,#146047_0%,transparent_60%)] pb-14 pt-16 text-white md:pt-[72px]"
        >
          <div className={`${wrap} grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]`}>
            <div>
              <span className="mb-5 inline-block rounded-full border border-[#E6CD8E]/50 px-4 py-1.5 text-sm text-[#E6CD8E]">
                عضوية تأسيسية محدودة للمحامي المرخص
              </span>
              <h1 id="founder-h1" className="font-brand text-[30px] font-extrabold leading-snug md:text-[46px]">
                مذكرتك المؤصَّلة بنصوص مكتبتك، في ساعات لا في أيام
              </h1>
              <p className="mt-5 max-w-[34em] text-[#CFE0D7]">
                الصائغ القانوني يبحث في الأنظمة ولوائحها ويجمع السوابق ويصوغ المذكرة كاملة أمامك في مسار واحد، وتبقى
                أنت صاحب القرار والاعتماد.
              </p>
              <div className="mt-8 flex flex-wrap gap-3.5">
                <a href={`#${JOIN_ID}`} className={goldBtn} data-analytics-event="reserve_seat_click" data-analytics-placement="hero">
                  احجز مقعدك
                </a>
                <a href="#samples" className={ghostBtn}>
                  شاهد ما يخرجه الصائغ
                </a>
              </div>
              <HeroMeter />
            </div>

            {PRICE && (
              <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-6 md:p-8">
                <p className="text-sm text-[#BFD3C9]">
                  السعر الطبيعي <s className="font-bold text-[#F3B4A8]">{PRICE.regular} ر.س قبل الضريبة</s>
                </p>
                <p className="mt-1 font-brand text-[42px] font-extrabold leading-tight text-[#E6CD8E]">
                  {PRICE.net} <small className="text-base font-medium text-[#CFE0D7]">ر.س قبل الضريبة</small>
                </p>
                <p className="mt-1 text-sm text-[#CFE0D7]">
                  + ضريبة القيمة المضافة {PRICE.vat} = <b className="text-white">{PRICE.total} ر.س</b>
                </p>
                <ul className="mt-5 space-y-2 text-[15px] text-[#E4EEE8]">
                  <li>✓ ستة أعمال قضائية كاملة بالصائغ القانوني</li>
                  <li>✓ مكتبة قانونية تغذّي الصائغ بالنص ولائحته</li>
                  <li>✓ ١٢ شهراً من التفعيل، دفعة واحدة بلا تجديد تلقائي</li>
                </ul>
                <p className="mt-5 rounded-xl border border-[#E8CF8A]/40 bg-[#E8CF8A]/10 px-4 py-2.5 text-sm font-bold text-[#E6CD8E]">
                  {FOUNDER_ADVOCATE_ONLY_LINE}
                </p>
              </div>
            )}
          </div>

          {/* ── V16 promo video: inside the hero's dark band (dark in both themes) ── */}
          <figure className={`${wrap} mt-11`}>
            <video
              controls
              preload="none"
              playsInline
              poster={PROMO_POSTER_SRC}
              width={1280}
              height={720}
              aria-label="الفيديو التعريفي لباقة المحامي المؤسس"
              className="block aspect-video h-auto w-full rounded-[22px] border border-white/15 bg-black"
            >
              <source src={PROMO_VIDEO_SRC} type="video/mp4" />
              متصفحك لا يدعم تشغيل الفيديو.{" "}
              <a href={PROMO_VIDEO_SRC} className="underline">
                افتح الفيديو
              </a>
            </video>
            <figcaption className="mt-3 text-sm text-[#BFD3C9]">
              باقة المحامي المؤسس في دقيقتين — اضغط للتشغيل
            </figcaption>
          </figure>
        </section>

        {/* ── samples ── */}
        <section id="samples" aria-labelledby="founder-h2s" className={`${lightBase} scroll-mt-20 pb-5 pt-16 md:pt-20`}>
          <div className={wrap}>
            <h2 id="founder-h2s" className={h2Light}>
              هكذا تبدو المذكرة المؤصَّلة التي يخرجها الصائغ
            </h2>
            <p className={subLight}>
              عينتان من مذكرات سابقة، طُمست فيهما كل البيانات التي قد يُستدل بها: الأسماء والهويات والأرقام والتواريخ
              والمبالغ ووقائع القضية. وهما بكامل بنيتهما وتأصيلهما وأسبابهما ونصوصهما النظامية، مع إخفاء ما قد يدل على
              القضية ووقائعها.
            </p>
            <div className="mt-9 rounded-3xl border border-[#D9E1DB] bg-white p-4 shadow-[0_18px_50px_rgba(11,61,46,.07)] dark:border-white/10 dark:bg-[#161b22] sm:p-7">
              <SampleMemos />
              <p className="mt-4 text-sm text-[#4B6158] dark:text-zinc-400">
                <b className="text-[#0B3D2E] dark:text-[#E6CD8E]">ملاحظة:</b> المقصود بالعرض مستوى البناء والتأصيل.
                يراجع المحامي كل مذكرة ويعتمدها قبل تقديمها.
              </p>
            </div>
          </div>
        </section>

        {/* ── six works ── */}
        <section id="works" aria-labelledby="founder-h2a" className={lightSection}>
          <div className={wrap}>
            <h2 id="founder-h2a" className={h2Light}>
              ستة أعمال قضائية كاملة بالصائغ القانوني
            </h2>
            <p className={subLight}>
              تختار أنت المزيج الذي يناسب قضاياك من الأنواع السبعة طوال سنة العضوية، وتكرر النوع الواحد كما تشاء.
            </p>
            <ul aria-label="الأنواع السبعة المشمولة" className="mt-6 flex flex-wrap gap-2.5">
              {FOUNDER_WORK_KINDS.map((kind) => (
                <li
                  key={kind}
                  className="rounded-full border border-[#D9E1DB] bg-[#FAFBF9] px-[18px] py-2 font-brand text-[14.5px] text-[#0B3D2E] dark:border-white/10 dark:bg-white/5 dark:text-[#E6CD8E]"
                >
                  {kind}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* l9 (owner register 14 item 62): the «independent output» section is
            removed — that entitlement stays internal, never shown here. */}

        {/* ── library ── */}
        <section aria-labelledby="founder-h2c" className={lightSection}>
          <div className={wrap}>
            <h2 id="founder-h2c" className={h2Light}>
              مكتبة قانونية ضخمة مفتوحة لسنة كاملة بشرط ألا ينزل رصيدك عن 50 نقطة، تغذّي الصائغ بالنص ولائحته
            </h2>
            <p className={subLight}>ابحث، ثم افتح المادة، وستجد لائحتها التنفيذية تحتها مباشرة مع حالة السريان.</p>
            <LibraryGifs />
            <div className="mt-6 grid gap-3.5 md:grid-cols-3">
              {[
                ["مكتبة ضخمة", "الأنظمة السعودية بلوائحها وتعديلاتها في مكان واحد"],
                ["آلاف", "المبادئ والسوابق القضائية بروابطها بالنصوص"],
                ["سارية؟", "حالة كل مادة تظهر أمامك قبل أن تستشهد بها"],
              ].map(([big, text]) => (
                <div key={big} className="rounded-2xl bg-[#0B3D2E] p-4 text-center text-white">
                  <b className="block font-brand text-[26px] text-[#E6CD8E]">{big}</b>
                  {text}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── bento ── */}
        <section aria-labelledby="founder-h2d" className={`${lightBase} pb-16 md:pb-20`}>
          <div className={wrap}>
            <h2 id="founder-h2d" className={h2Light}>
              وماذا تكسب أيضاً على المنصة طوال العام
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {BENTO.map((tile) =>
                tile.wide ? (
                  <div
                    key={tile.title}
                    className="rounded-[20px] bg-gradient-to-br from-[#0F5240] to-[#06201A] p-6 text-white sm:col-span-2"
                  >
                    <h3 className="mb-1.5 font-brand text-lg font-bold text-[#E6CD8E]">{tile.title}</h3>
                    <p className="text-[15.5px] text-[#CFE0D7]">{tile.text}</p>
                  </div>
                ) : (
                  <div
                    key={tile.title}
                    className="rounded-[20px] border border-[#D9E1DB] bg-white p-6 dark:border-white/10 dark:bg-[#161b22]"
                  >
                    <h3 className="mb-1.5 font-brand text-lg font-bold text-[#0B3D2E] dark:text-[#E6CD8E]">
                      {tile.title}
                    </h3>
                    <p className="text-[15.5px] text-[#4B6158] dark:text-zinc-400">{tile.text}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        {/* ── join ── */}
        <section id={JOIN_ID} aria-labelledby="founder-h2e" className={`${darkSection} scroll-mt-16`}>
          <div className={`${wrap} grid items-start gap-8 lg:grid-cols-[1.1fr_.9fr]`}>
            <div className="rounded-[26px] bg-gradient-to-br from-[#E6CD8E] via-[#C8A762] to-[#8F7433] p-[3px]">
              <div data-light-surface className="rounded-[23px] bg-white p-6 text-[#14261F] sm:p-7">
                <h2 id="founder-h2e" className="font-brand text-[26px] font-extrabold text-[#0B3D2E]">
                  بطاقة الانضمام
                </h2>
                {PRICE ? (
                  <>
                    <p className="mt-2 text-sm text-[#4B6158]">
                      السعر الطبيعي <s className="font-bold text-[#9A3B2E]">{PRICE.regular} ر.س قبل الضريبة</s>
                    </p>
                    <p className="font-brand text-[40px] font-extrabold leading-tight text-[#0B3D2E] sm:text-[46px]">
                      {PRICE.net}{" "}
                      <small className="text-base font-medium text-[#4B6158]">ر.س قبل الضريبة · سعر الباقة المؤسِّسة</small>
                    </p>
                  </>
                ) : null}
                <p className="mb-2.5 mt-1.5 text-sm font-bold text-[#7A5C16]">{FOUNDER_ONCE_LINE}</p>
                <ul className="mb-3 list-disc space-y-1 ps-5 text-sm leading-relaxed">
                  <li>
                    خصم المؤسس ١٥٪ على شحنات النقاط وعلى أي باقة تشتريها من نظامي، بما فيها تجديد اشتراكك السنوي، ما دام
                    اشتراكك السنوي سارياً، ويُفقد نهائياً إن انقطع. ويُطبَّق الأعلى خصم واحد فقط دون جمعه مع كوبون أو عرض آخر أو نقاط إضافية.
                  </li>
                  <li>١٠٠ نقطة تأسيسية لمساعد المكتبة الذكي.</li>
                  <li>٣ دعوات تتجدد شهرياً لمحامين مرخصين جدد لم يسبق لهم التسجيل، يحصل كل مدعو منهم على تجربة للمكتبة القانونية مع نقاط صالحة مدة التجربة (تعمل الدعوات بعد تفعيل الدفع الإلكتروني).</li>
                </ul>
                {PRICE && (
                  <table className="my-3.5 w-full border-collapse text-[15px]" aria-label="تفصيل السعر">
                    <tbody>
                      <tr className="border-b border-dashed border-[#D9E1DB]">
                        <td className="py-2">ضريبة القيمة المضافة ١٥٪</td>
                        <td className="py-2 text-left font-bold">{PRICE.vat} ر.س</td>
                      </tr>
                      <tr className="border-b border-dashed border-[#D9E1DB]">
                        <td className="py-2">الإجمالي شاملاً الضريبة</td>
                        <td className="py-2 text-left font-bold">{PRICE.total} ر.س</td>
                      </tr>
                      <tr className="border-b border-dashed border-[#D9E1DB]">
                        <td className="py-2">مدة العضوية من لحظة التفعيل</td>
                        <td className="py-2 text-left font-bold">١٢ شهراً</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <p className="text-sm leading-relaxed text-[#4B6158]">
                  يشمل السعر ٦ أعمال قانونية. المكتبة مفتوحة طوال سنة العضوية بشرط ألا ينزل رصيدك عن ٥٠ نقطة، والشحن
                  لا يجدّد السنة. ويصلك ١٠٠ نقطة تأسيسية تُستعمل في المكتبة ومساعدها الذكي، والسؤال عليه بـ٥ نقاط، ويعود
                  التصفح والمساعد بعد الشحن فور بلوغ رصيدك ٥٠ نقطة (أقل شحنة ٥٠٠ نقطة، والنقطة = ريال قبل الضريبة). دفعة سنوية واحدة، بلا تجديد تلقائي وبلا سحب لاحق من بطاقتك. يتم التفعيل بعد
                  توثيق الرخصة وإتمام السداد وحجز مقعدك، ويُتاح السداد بعد أن يعتمد فريق المنصة توثيق رخصتك.
                </p>
                <p className="mt-3.5 rounded-xl border border-[#E8CF8A] bg-[#FFF3D6] px-3.5 py-2.5 text-[15px] font-bold text-[#5C4200]">
                  {FOUNDER_ADVOCATE_ONLY_LINE}
                </p>
                <div className="mt-6">
                  <JoinButton />
                </div>
                <WindowLine className="mt-3 text-sm text-[#4B6158]" />
                <p className="mt-1 text-sm text-[#4B6158]">
                  <Link href={FOUNDER_TERMS_PATH} className="font-bold text-[#0B3D2E] underline">
                    شروط باقة المؤسس
                  </Link>
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-3.5 font-brand text-xl font-bold text-white">أسئلة قبل أن تشترك</h3>
              {FAQ.map(({ q, a }) => (
                <details
                  key={q}
                  className="mb-2.5 rounded-2xl border border-[#D9E1DB] bg-white px-[18px] py-1 text-[#14261F] dark:border-white/10 dark:bg-[#161b22] dark:text-zinc-200"
                >
                  <summary className="min-h-[44px] cursor-pointer py-3 font-bold">{q}</summary>
                  <p className="pb-3.5 text-[#4B6158] dark:text-zinc-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── footer ── */}
        <footer className="bg-[#06201A] py-8 text-sm text-[#9FB8AC]">
          <nav aria-label="روابط" className={`${wrap} flex flex-wrap gap-x-6 gap-y-2`}>
            <Link href="/" className="hover:text-[#E6CD8E]">
              نظامي
            </Link>
            <Link href={FOUNDER_TERMS_PATH} className="hover:text-[#E6CD8E]">
              شروط باقة المؤسس
            </Link>
            <Link href="/terms" className="hover:text-[#E6CD8E]">
              الشروط والأحكام
            </Link>
            <Link href="/privacy" className="hover:text-[#E6CD8E]">
              سياسة الخصوصية
            </Link>
            <Link href={FOUNDER_TERMS_REFUND_PATH} className="hover:text-[#E6CD8E]">
              سياسة الاسترداد
            </Link>
          </nav>
        </footer>

        <PulsePopup joinId={JOIN_ID} />
      </div>
    </FounderWindowProvider>
  );
}
