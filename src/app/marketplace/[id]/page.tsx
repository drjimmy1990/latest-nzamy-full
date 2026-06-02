"use client";

/**
 * /marketplace/[id] — تفاصيل الطلب + تقديم عرض
 * ───────────────────────────────────────────────
 * RBAC:
 *  - provider    → يرى تفاصيل الطلب + نموذج تقديم عرض
 *  - طالب الخدمة → يرى تفاصيله + العروض الواردة + يختار الفائز
 *  - آخرون      → يرون التفاصيل فقط + CTA تسجيل دخول
 *
 * لا يرى أي مزوّد اسم أو سعر المنافسين الآخرين (سرية العروض)
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Clock, CurrencyDollar, Star, SealCheck, CheckCircle,
  ArrowRight, ArrowLeft, Fire, Warning, Shield, ChatDots,
  Hourglass, Users, Eye, PencilSimple, Stamp, Buildings,
  Globe, Gavel, FileText, Briefcase, Package, X, Info,
} from "@phosphor-icons/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

// ─── Mock Single Request ──────────────────────────────────────────────────────

const MOCK_REQUEST = {
  id: 1,
  category: "tawtheeq",
  categoryLabel: "توثيق ووكالات",
  CategoryIcon: Stamp,
  title: "مطلوب مُعقِّب لتوثيق وكالة من سجين في سجن الحائر بالرياض",
  description: `نحتاج توثيق وكالة خاصة لأحد موكلينا المحتجزين في سجن الحائر. 
  
المطلوب بالتفصيل:
• التنسيق مع إدارة السجن للحصول على إذن الزيارة
• إحضار وثيقة الوكالة الموضوعة مسبقاً من قِبل المكتب
• توثيقها من الموكل بحضور الجهة المختصة
• إعادة الوثيقة الموثّقة للمكتب (يمكن إرسالها بريدياً أو DHL)

المستندات الجاهزة: نسخة من الهوية + مسودة الوكالة + خطاب المكتب.`,
  city: "الرياض",
  urgency: "urgent" as const,
  budgetMin: 300,
  budgetMax: 600,
  postedBy: "أ. فهد المطيري (محامي متقدم)",
  postedByType: "lawyer" as const,
  ownerUserId: "mock-lawyer-owner",
  ownerDisplayName: "أ. فهد المطيري",
  postedAt: "منذ ساعتين",
  status: "open" as const,
  offersCount: 3,
  views: 47,
  isVerified: true,
  tags: ["وكالة خاصة", "سجن", "توثيق عاجل"],
  duration: "في غضون ٢٤ ساعة",
  attachmentsCount: 2,
};

// ─── Mock Offers (visible to requester only) ──────────────────────────────────

const MOCK_OFFERS = [
  {
    id: 1,
    providerName: "أبو عبدالله — موثّق معتمد",
    rating: 4.9,
    reviewsCount: 127,
    experience: "٥ سنوات",
    price: 450,
    message: "لديّ خبرة طويلة في تنسيق زيارات سجن الحائر. أستطيع إنجاز الأمر خلال ٢٤ ساعة من الاتفاق. أعمل بطريقة منظمة وأرسل تقرير بصري بعد كل خطوة.",
    deliveryTime: "١٨ – ٢٤ ساعة",
    isTop: true,
    badge: "الأعلى تقييماً",
  },
  {
    id: 2,
    providerName: "المحترف للتعقيب",
    rating: 4.7,
    reviewsCount: 89,
    experience: "٣ سنوات",
    price: 380,
    message: "أنجزت نفس المهمة عشرات المرات. الأوراق كاملة ومطلوب فقط موعد التوثيق. سأتابع الأمر وأُبلّغكم فور الانتهاء.",
    deliveryTime: "٢٤ – ٣٦ ساعة",
    isTop: false,
    badge: null,
  },
  {
    id: 3,
    providerName: "متعقب الرياض",
    rating: 4.5,
    reviewsCount: 43,
    experience: "سنتان",
    price: 320,
    message: "سعري تنافسي وأستطيع البدء فوراً. لديّ علاقات بإدارة السجن.",
    deliveryTime: "٢٤ – ٤٨ ساعة",
    isTop: false,
    badge: null,
  },
];

// ─── Status/Urgency Config ────────────────────────────────────────────────────

const URGENCY_CFG = {
  urgent:   { label: "عاجل",    color: "text-red-500",     bg: "bg-red-500/10",     icon: Fire },
  normal:   { label: "عادي",    color: "text-blue-500",    bg: "bg-blue-500/10",    icon: Clock },
  flexible: { label: "مرن",     color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarketplaceDetailPage() {
  const { isDark, isRTL } = useTheme();
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerDelivery, setOfferDelivery] = useState("");
  const [offerSubmitted, setOfferSubmitted] = useState(false);
  const [acceptedOfferId, setAcceptedOfferId] = useState<number | null>(null);
  const [offerError, setOfferError] = useState("");

  useEffect(() => setMounted(true), []);

  const bg   = isDark ? "bg-[#0c0f12] text-white"   : "bg-gray-50 text-gray-900";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const input = `w-full rounded-xl border px-4 py-3 text-sm bg-transparent outline-none transition focus:border-[#0B3D2E] ${isDark ? "border-[#2d3748] text-white placeholder-gray-600" : "border-gray-200 text-gray-900 placeholder-gray-400"}`;

  const isProvider = user.userType === "provider";
  const isRequester = user.userType === "lawyer" || user.userType === "firm"
    || user.userType === "corporate" || user.userType === "micro";
  const isGuest = !user.isLoggedIn;

  const req = MOCK_REQUEST;
  const isOwner = user.isLoggedIn && isRequester && (
    user.userId === req.ownerUserId || user.name === req.ownerDisplayName
  );
  const urg = URGENCY_CFG[req.urgency];
  const UrgIcon = urg.icon;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const ArrBack = isRTL ? ArrowRight : ArrowLeft;

  const handleSubmitOffer = () => {
    if (!offerPrice || Number(offerPrice) < req.budgetMin * 0.5) {
      setOfferError(`لا يمكن تقديم عرض بأقل من ${(req.budgetMin * 0.5).toLocaleString()} ر.س`);
      return;
    }
    if (!offerMessage.trim() || offerMessage.length < 20) {
      setOfferError("يرجى كتابة رسالة وصفية لا تقل عن ٢٠ حرفاً");
      return;
    }
    if (!offerDelivery.trim()) {
      setOfferError("يرجى تحديد مدة التسليم");
      return;
    }
    setOfferError("");
    setOfferSubmitted(true);
  };

  if (!mounted) return null;

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        {/* Back button */}
        <Link href="/marketplace"
          className={`inline-flex items-center gap-1.5 text-sm ${muted} hover:text-current mb-5 transition`}>
          <ArrBack size={14} />
          العودة للسوق
        </Link>

        <div className="flex gap-6 flex-col lg:flex-row">

          {/* ── Main Content ────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Request Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${card} p-6`}>

              {/* Top badges */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl font-bold ${isDark ? "bg-[#0B3D2E]/30 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                  <req.CategoryIcon size={12} />
                  {req.categoryLabel}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl font-bold ${urg.bg} ${urg.color}`}>
                  <UrgIcon size={11} weight="fill" />
                  {urg.label}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-xl font-bold bg-emerald-500/10 text-emerald-500`}>
                  مفتوح للعروض
                </span>
                {req.isVerified && (
                  <span className={`inline-flex items-center gap-1 text-xs ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} font-bold`}>
                    <SealCheck size={13} weight="fill" /> موثّق
                  </span>
                )}
              </div>

              <h1 className={`text-xl font-black leading-snug mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                {req.title}
              </h1>

              {/* Description */}
              <div className={`text-sm leading-relaxed whitespace-pre-line ${muted} mb-4`}>
                {req.description}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {req.tags.map((t, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Meta */}
              <div className={`flex flex-wrap items-center gap-4 text-xs pt-4 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <span className={`flex items-center gap-1.5 ${muted}`}>
                  <MapPin size={12} weight="fill" /> {req.city}
                </span>
                <span className={`flex items-center gap-1.5 ${muted}`}>
                  <Clock size={12} /> {req.postedAt}
                </span>
                <span className={`flex items-center gap-1.5 ${muted}`}>
                  <Eye size={12} /> {req.views} مشاهدة
                </span>
                <span className={`flex items-center gap-1.5 ${muted}`}>
                  <Users size={12} /> {req.offersCount} عروض
                </span>
                <span className={`flex items-center gap-1.5 ${muted}`}>
                  <Package size={12} /> {req.duration}
                </span>
              </div>
            </motion.div>

            {/* ── Offers List (owner only) ──────────────────────────────────── */}
            {isOwner && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`${card} overflow-hidden`}>
                <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                  <div>
                    <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                      العروض الواردة
                    </h2>
                    <p className={`text-xs mt-0.5 ${muted}`}>{MOCK_OFFERS.length} عروض — مرتبة من الأعلى تقييماً</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-[#C8A762]/60" : "text-gray-400"}`}>
                    <Shield size={13} weight="fill" className="text-emerald-500" />
                    العروض سرية بين الطرفين
                  </div>
                </div>

                <AnimatePresence>
                  {acceptedOfferId && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className={`px-5 py-3 ${isDark ? "bg-emerald-500/5 border-b border-emerald-500/20" : "bg-emerald-50 border-b border-emerald-100"} flex items-center gap-2`}
                    >
                      <CheckCircle size={16} className="text-emerald-500" weight="fill" />
                      <p className={`text-sm font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                        تم قبول العرض! سيتواصل معك المزوّد قريباً.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="divide-y divide-gray-100 dark:divide-[#2d3748]">
                  {MOCK_OFFERS.map((offer, i) => (
                    <motion.div
                      key={offer.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className={`p-5 ${acceptedOfferId === offer.id ? (isDark ? "bg-emerald-500/5" : "bg-emerald-50") : ""}`}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`font-bold text-sm ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                              {offer.providerName}
                            </p>
                            {offer.isTop && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#C8A762]/20 text-[#C8A762] font-bold">
                                {offer.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-amber-500 font-bold">{"★".repeat(Math.floor(offer.rating))} {offer.rating}</span>
                            <span className={muted}>({offer.reviewsCount} تقييم)</span>
                            <span className={muted}>·</span>
                            <span className={muted}>خبرة {offer.experience}</span>
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <p className={`text-xl font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {offer.price.toLocaleString()} ر.س
                          </p>
                          <p className={`text-xs ${muted} text-left`}>{offer.deliveryTime}</p>
                        </div>
                      </div>
                      <p className={`text-sm leading-relaxed mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                        {offer.message}
                      </p>
                      {acceptedOfferId !== offer.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAcceptedOfferId(offer.id)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition"
                          >
                            <CheckCircle size={13} /> قبول العرض
                          </button>
                          <button className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#1a1f2e]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            <ChatDots size={13} /> تواصل
                          </button>
                        </div>
                      ) : (
                        <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                          <CheckCircle size={13} weight="fill" /> العرض المقبول
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

          </div>

          {/* ── Right Sidebar ─────────────────────────────────────────────── */}
          <aside className="w-full lg:w-80 shrink-0 space-y-4">

            {/* Budget card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={`${card} p-5`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>الميزانية المقترحة</p>
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-100"}`}>
                <CurrencyDollar size={20} className="text-[#C8A762]" weight="fill" />
                <div>
                  <p className="text-lg font-black text-[#C8A762]">
                    {req.budgetMin.toLocaleString()} – {req.budgetMax.toLocaleString()} ر.س
                  </p>
                  <p className={`text-xs ${muted}`}>سعر مقترح من المنصة</p>
                </div>
              </div>
            </motion.div>

            {/* ── Provider: Submit Offer ────────────────────────────────────── */}
            {isProvider && !offerSubmitted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`${card} p-5`}>
                <h3 className={`font-bold text-base mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                  قدِّم عرضك
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>سعرك (ر.س)</label>
                    <input
                      type="number"
                      value={offerPrice}
                      onChange={e => setOfferPrice(e.target.value)}
                      placeholder={`${req.budgetMin} – ${req.budgetMax}`}
                      className={input}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>مدة التسليم</label>
                    <input
                      type="text"
                      value={offerDelivery}
                      onChange={e => setOfferDelivery(e.target.value)}
                      placeholder="مثال: ٢٤ – ٤٨ ساعة"
                      className={input}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>رسالتك للعميل</label>
                    <textarea
                      value={offerMessage}
                      onChange={e => setOfferMessage(e.target.value)}
                      placeholder="اشرح باختصار خبرتك وكيف ستنجز هذه الخدمة..."
                      className={`${input} min-h-[100px] resize-none`}
                      maxLength={500}
                    />
                    <p className={`text-xs mt-1 text-left ${muted}`}>{offerMessage.length}/500</p>
                  </div>
                  {offerError && (
                    <div className={`flex items-start gap-2 text-xs p-3 rounded-xl ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
                      <Warning size={13} className="mt-0.5 flex-shrink-0" weight="fill" /> {offerError}
                    </div>
                  )}
                  <div className={`flex items-start gap-2 text-xs p-3 rounded-xl ${isDark ? "bg-blue-500/5 border border-blue-500/20 text-blue-300" : "bg-blue-50 border border-blue-100 text-blue-700"}`}>
                    <Info size={13} className="mt-0.5 flex-shrink-0" weight="fill" />
                    عمولة المنصة 15% تُخصم من العرض المقبول عند إفراج الضمان المالي.
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleSubmitOffer}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition shadow-lg"
                  >
                    <Arrow size={16} />
                    إرسال العرض
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Offer submitted success */}
            {isProvider && offerSubmitted && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`${card} p-5 text-center`}>
                <CheckCircle size={36} className="text-emerald-500 mx-auto mb-2" weight="fill" />
                <p className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>تم إرسال عرضك! 🎉</p>
                <p className={`text-xs mt-1 ${muted}`}>سيُبلَّغ صاحب الطلب بعرضك وسيتواصل معك عند القبول.</p>
              </motion.div>
            )}

            {/* Guest CTA */}
            {isGuest && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`${card} p-5 text-center`}>
                <Briefcase size={32} className={`mx-auto mb-3 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`} weight="duotone" />
                <p className={`font-bold text-sm mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  سجّل دخولك للتفاعل
                </p>
                <p className={`text-xs ${muted} mb-4`}>
                  سجّل كمزوّد خدمة لتقديم عرضك، أو كمحامٍ/شركة لنشر طلبك.
                </p>
                <Link href="/login"
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition">
                  تسجيل الدخول
                  <Arrow size={13} />
                </Link>
              </motion.div>
            )}

            {/* Escrow guarantee */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`${card} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={16} weight="fill" className="text-emerald-500" />
                <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>ضمان المنصة</p>
              </div>
              <ul className={`text-xs space-y-2 ${muted}`}>
                <li className="flex items-start gap-1.5">
                  <CheckCircle size={11} className="text-emerald-500 mt-0.5 flex-shrink-0" weight="fill" />
                  المبلغ محمي بنظام Escrow حتى اكتمال الخدمة
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle size={11} className="text-emerald-500 mt-0.5 flex-shrink-0" weight="fill" />
                  المزوّدون موثّقون وتمّ التحقق منهم
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle size={11} className="text-emerald-500 mt-0.5 flex-shrink-0" weight="fill" />
                  دعم نزاعات في حال حدوث خلاف
                </li>
              </ul>
            </motion.div>

          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
