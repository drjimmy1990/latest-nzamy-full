"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  SealCheck,
  Star,
  MapPin,
  Clock,
  Trophy,
  Smiley,
  CalendarBlank,
  ChatsCircle,
  GraduationCap,
  Briefcase,
  CaretDown,
  CaretUp,
  CheckCircle,
  ArrowRight,
  ChatCircle,
  Gavel,
  FileText,
  UserCircle,
  PlayCircle,
  Eye,
  Newspaper,
  Medal,
  ChartBar,
  ThumbsUp,
  X,
  Crown,
  Scales,
  ArrowLeft,
  Chat,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ──────────────────────────────────────────────────────────────────
const LAWYER = {
  name: "الأستاذ أحمد محمد الغامدي",
  nameEn: "Ahmed Mohammed Al-Ghamdi",
  initials: "أغ",
  specialties: ["قانون عمالي", "قانون تجاري", "النزاعات العقارية"],
  specialtiesEn: ["Labor Law", "Commercial Law", "Real Estate Disputes"],
  rating: 4.9,
  reviewCount: 234,
  sessions: 89,
  city: "الرياض",
  cityEn: "Riyadh",
  experience: 14,
  winRate: 74,
  satisfaction: 98,
  avgDuration: "٣ أشهر",
  responseRate: "١.٥ ساعة",
  bio: "محامٍ معتمد لدى وزارة العدل السعودية بخبرة تزيد على ١٤ عاماً في مجال القانون العمالي والتجاري. تخصص في تمثيل الشركات والأفراد أمام المحاكم العمالية وتسوية النزاعات التجارية.",
  bioEn: "A certified lawyer with the Saudi Ministry of Justice, with over 14 years of experience in labor and commercial law. Specializes in representing companies and individuals before labor courts and resolving commercial disputes.",
  hasVideo: true,
  isElite: true, // 4.8+ with 20+ reviews
  profileViews: 1247,
  bookingClicks: 89,
  subSpecialties: [
    "عقود العمل", "التسريح التعسفي", "النزاعات التجارية",
    "العقود والاتفاقيات", "التحكيم التجاري", "قضايا الإيجار",
    "حقوق الموظفين", "الملكية الفكرية", "الاندماج والاستحواذ",
  ],
};

const RATINGS_BREAKDOWN = {
  quality: 4.9, timing: 5.0, communication: 4.7, value: 4.8,
};

const SERVICES = [
  { id: 1, title: "استشارة قانونية", titleEn: "Legal Consultation", desc: "جلسة مدتها ٣٠ دقيقة لمناقشة قضيتك", descEn: "30-minute session to discuss your case", price: "٩٩ – ١٩٩ ر.س", priceEn: "SAR 99 – 199", icon: ChatCircle },
  { id: 2, title: "مراجعة العقد", titleEn: "Contract Review", desc: "مراجعة شاملة للعقود والاتفاقيات", descEn: "Comprehensive review of contracts & agreements", price: "٣٠٠ – ٨٠٠ ر.س", priceEn: "SAR 300 – 800", icon: FileText },
  { id: 3, title: "تمثيل قضائي", titleEn: "Court Representation", desc: "تمثيل كامل أمام المحاكم المختصة", descEn: "Full representation before competent courts", price: "٢,٠٠٠ – ١٥,٠٠٠ ر.س", priceEn: "SAR 2,000 – 15,000", icon: Gavel },
];

const ARTICLES = [
  { id: 1, title: "حقوق العمال في حالة الفصل التعسفي", titleEn: "Workers' Rights in Wrongful Termination", date: "فبراير ٢٠٢٦", dateEn: "Feb 2026", category: "قانون عمالي", categoryEn: "Labor Law", readTime: "٥ دقائق", readTimeEn: "5 min" },
  { id: 2, title: "كيف تحمي شركتك من النزاعات التجارية؟", titleEn: "How to Protect Your Business from Commercial Disputes", date: "يناير ٢٠٢٦", dateEn: "Jan 2026", category: "قانون تجاري", categoryEn: "Commercial Law", readTime: "٨ دقائق", readTimeEn: "8 min" },
  { id: 3, title: "دليلك الكامل لعقود الإيجار في السعودية", titleEn: "Complete Guide to Lease Contracts in KSA", date: "ديسمبر ٢٠٢٥", dateEn: "Dec 2025", category: "عقاري", categoryEn: "Real Estate", readTime: "٦ دقائق", readTimeEn: "6 min" },
];

const ACHIEVEMENTS = [
  { icon: Trophy, label: "محامي متميز ٢٠٢٦", labelEn: "Elite Lawyer 2026", color: "#C8A762", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" },
  { icon: Medal, label: "+١٠٠ استشارة ناجحة", labelEn: "100+ Successful Consultations", color: "#0B3D2E", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
  { icon: ThumbsUp, label: "٩٨٪ رضا العملاء", labelEn: "98% Client Satisfaction", color: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20" },
  { icon: Scales, label: "٧٤٪ نسبة فوز", labelEn: "74% Win Rate", color: "#8b5cf6", bg: "bg-violet-50 dark:bg-violet-500/10", border: "border-violet-200 dark:border-violet-500/20" },
];

const REVIEWS = [
  { id: 1, name: "محمد العنزي", nameEn: "Mohammed Al-Anzi", rating: 5, qualityR: 5, timingR: 5, commR: 5, valueR: 5, date: "مارس ٢٠٢٦", dateEn: "Mar 2026", text: "محامٍ ممتاز، متعاون جداً وعلى دراية كاملة بكل تفاصيل القضية. حقق نتائج رائعة في فترة قصيرة جداً.", textEn: "Excellent lawyer, very cooperative and fully knowledgeable. Achieved great results in a very short time.", reply: "شكراً جزيلاً لكم على هذا التقييم الرائع. يسعدني أنني تمكنت من خدمتكم بالشكل المطلوب." },
  { id: 2, name: "فاطمة الرشيدي", nameEn: "Fatima Al-Rashidi", rating: 5, qualityR: 5, timingR: 5, commR: 4, valueR: 5, date: "فبراير ٢٠٢٦", dateEn: "Feb 2026", text: "أنصح الجميع بالتواصل معه. خبرة واسعة وأسلوب احترافي في التعامل. فاز بقضيتي في أقل من شهرين.", textEn: "I recommend everyone to contact him. Wide experience and professional approach. Won my case in less than two months.", reply: null },
  { id: 3, name: "عبدالله السالم", nameEn: "Abdullah Al-Salem", rating: 4, qualityR: 4, timingR: 4, commR: 5, valueR: 3, date: "يناير ٢٠٢٦", dateEn: "Jan 2026", text: "خدمة ممتازة ومتابعة دورية لمستجدات القضية. أتمنى لو كانت الأسعار أقل قليلاً.", textEn: "Excellent service and regular follow-up. I wish the prices were a little less.", reply: "نقدّر ملاحظتكم، ونسعى دائماً لتقديم أفضل قيمة مقابل خدماتنا المتخصصة." },
  { id: 4, name: "نورة القحطاني", nameEn: "Noura Al-Qahtani", rating: 5, qualityR: 5, timingR: 5, commR: 5, valueR: 5, date: "ديسمبر ٢٠٢٥", dateEn: "Dec 2025", text: "تعاملت معه في قضية عمالية معقدة وأبدى كفاءة عالية جداً. سأتواصل معه في المستقبل بالتأكيد.", textEn: "I dealt with him in a complex labor case and showed very high competence. I will definitely contact him in the future.", reply: null },
];

const CAREER = [
  { year: "٢٠١٦ – الآن", yearEn: "2016 – Present", title: "محامٍ أول", titleEn: "Senior Lawyer", place: "مكتب الغامدي للمحاماة والاستشارات القانونية", placeEn: "Al-Ghamdi Law & Legal Consultancy Office", type: "work" },
  { year: "٢٠١٢ – ٢٠١٦", yearEn: "2012 – 2016", title: "محامٍ متخصص", titleEn: "Specialist Lawyer", place: "شركة المشرق للاستشارات القانونية", placeEn: "Al-Mashriq Legal Consultancy Company", type: "work" },
  { year: "٢٠١٤", yearEn: "2014", title: "ماجستير القانون التجاري", titleEn: "Master's in Commercial Law", place: "جامعة الملك سعود، الرياض", placeEn: "King Saud University, Riyadh", type: "edu" },
  { year: "٢٠١٠", yearEn: "2010", title: "بكالوريوس في القانون", titleEn: "Bachelor of Law", place: "جامعة الملك عبدالعزيز، جدة", placeEn: "King Abdulaziz University, Jeddah", type: "edu" },
];

const SIMILAR = [
  { name: "سارة العتيبي", initials: "سع", specialty: "مدني", rating: 4.8, slug: "sara-alotaibi", color: "#1a5c45" },
  { name: "فيصل الزهراني", initials: "فز", specialty: "جنائي", rating: 4.6, slug: "faisal-alzahrani", color: "#8B1A1A" },
  { name: "خالد المطيري", initials: "خم", specialty: "تجاري", rating: 4.7, slug: "khalid-almutairi", color: "#C8A762" },
];

// أبرز ردود المحامي في المجتمع
const COMMUNITY_REPLIES = [
  {
    id: 1,
    questionSlug: "1",
    questionAr: "هل يحق لصاحب العمل خصم من الراتب بسبب التأخر عن الدوام؟",
    questionEn: "Can an employer deduct from salary for being late to work?",
    replyAr: "وفقاً للمادة ٦٩ من نظام العمل السعودي، لا يجوز لصاحب العمل توقيع أي جزاء مالي على العامل إلا إذا كانت هذه الجزاءات منصوصاً عليها في لائحة تنظيم العمل المعتمدة والمُعلَنَة. وبما أنك لم تُبلَّغ رسمياً، فهذا الخصم غير قانوني.",
    replyEn: "According to Article 69 of Saudi Labor Law, employers cannot impose financial penalties unless stated in an approved and announced work policy. Since you were not officially notified, this deduction is illegal.",
    category: "عمالي", categoryEn: "Labor",
    likes: 47, isBest: true,
    date: "٢ أبريل ٢٠٢٦", dateEn: "Apr 2, 2026",
  },
  {
    id: 2,
    questionSlug: "2",
    questionAr: "ما حقوقي عند انتهاء عقد العمل بدون تجديد من صاحب العمل؟",
    questionEn: "What are my rights when my employment contract ends without renewal?",
    replyAr: "عند انتهاء عقد العمل المحدد المدة دون تجديد، يحق لك مكافأة نهاية الخدمة كاملة بنسبة شهر عن كل سنة خدمة وفق نظام العمل. وإذا رفض صاحب العمل الصرف، فبإمكانك التقدم بشكوى مباشرة لمكتب العمل.",
    replyEn: "At the end of a fixed-term contract without renewal, you are entitled to full end-of-service benefits at one month per year of service. If the employer refuses payment, you can file a complaint directly with the Labor Office.",
    category: "عمالي", categoryEn: "Labor",
    likes: 31, isBest: false,
    date: "٢٨ مارس ٢٠٢٦", dateEn: "Mar 28, 2026",
  },
  {
    id: 3,
    questionSlug: "3",
    questionAr: "هل يجوز فسخ عقد الإيجار قبل انتهاء مدته؟",
    questionEn: "Can a lease contract be terminated before it expires?",
    replyAr: "نعم، يجوز فسخ عقد الإيجار مبكراً ما لم يكن هناك نص صريح في العقد يمنع ذلك. ويشترط في الغالب توجيه إشعار مسبق للطرف الآخر مدته لا تقل عن ٣٠ يوماً، وإلا أحق المتضرر بالتعويض.",
    replyEn: "Yes, early termination is possible unless explicitly prohibited in the contract. Typically a 30-day prior notice is required, otherwise the affected party may claim compensation.",
    category: "عقاري", categoryEn: "Real Estate",
    likes: 19, isBest: false,
    date: "١٥ مارس ٢٠٢٦", dateEn: "Mar 15, 2026",
  },
  {
    id: 4,
    questionSlug: "4",
    questionAr: "ما الفرق بين الشركة التضامنية والشركة ذات المسؤولية المحدودة؟",
    questionEn: "What is the difference between a general partnership and an LLC?",
    replyAr: "في الشركة التضامنية يكون الشركاء مسؤولين بالتضامن عن ديون الشركة من أموالهم الشخصية، بينما تقتصر المسؤولية في الشركة ذات المسؤولية المحدودة على قدر الحصة في رأس المال.",
    replyEn: "In a general partnership, partners are jointly liable for company debts from their personal assets, while in an LLC, liability is limited to each partner's share of the capital.",
    category: "تجاري", categoryEn: "Commercial",
    likes: 14, isBest: false,
    date: "١ مارس ٢٠٢٦", dateEn: "Mar 1, 2026",
  },
];

const TABS = ["overview", "reviews", "articles", "achievements", "analytics", "community"] as const;
type Tab = typeof TABS[number];

// ─── Component ─────────────────────────────────────────────────────────────
export default function LawyerProfilePage() {
  const { isRTL, isDark } = useTheme();
  const [specsOpen, setSpecsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [videoOpen, setVideoOpen] = useState(false);
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  const isOwner = false; // في الواقع: تُحدَّد من Auth
  const avgRating = (REVIEWS.reduce((a, r) => a + r.rating, 0) / REVIEWS.length).toFixed(1);

  const card = `rounded-2xl border p-6 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const heading = `text-xl font-bold mb-5 ${isDark ? "text-white" : "text-gray-800"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const gold = "#C8A762";
  const green = "#0B3D2E";

  const tabLabels: Record<Tab, { ar: string; en: string }> = {
    overview:     { ar: "نبذة", en: "Overview" },
    reviews:      { ar: "التقييمات", en: "Reviews" },
    articles:     { ar: "المقالات", en: "Articles" },
    achievements: { ar: "الإنجازات", en: "Achievements" },
    analytics:    { ar: "الإحصاءات", en: "Analytics" },
    community:    { ar: "ردود المجتمع", en: "Community" },
  };

  const StarRow = ({ label, labelEn, value }: { label: string; labelEn: string; value: number }) => (
    <div className="flex items-center gap-3 text-xs">
      <span className={`w-28 shrink-0 ${muted}`}>{isRTL ? label : labelEn}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-white/10">
        <motion.div initial={{ width: 0 }} animate={{ width: `${(value / 5) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full bg-amber-400" />
      </div>
      <span className={`w-6 text-right font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{value}</span>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── Video Modal ── */}
      <AnimatePresence>
        {videoOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setVideoOpen(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="relative w-full max-w-2xl aspect-video rounded-2xl overflow-hidden bg-black" onClick={(e) => e.stopPropagation()}>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
                <PlayCircle size={64} weight="fill" color={gold} />
                <p className="text-sm opacity-60">{isRTL ? "الفيديو التعريفي للمحامي" : "Lawyer Introduction Video"}</p>
              </div>
              <button onClick={() => setVideoOpen(false)} className="absolute top-3 end-3 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition">
                <X size={16} color="white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 space-y-6">

        {/* ── Hero Card ── */}
        <motion.section initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className={`${card} relative overflow-hidden`}>
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />

          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Avatar + video */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-3xl bg-[#0B3D2E] flex items-center justify-center text-white text-3xl font-bold">
                {LAWYER.initials}
              </div>
              {LAWYER.hasVideo && (
                <button onClick={() => setVideoOpen(true)} className="absolute -bottom-2 -end-2 w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shadow-lg hover:bg-amber-300 transition" title={isRTL ? "شاهد الفيديو" : "Watch Video"}>
                  <PlayCircle size={20} weight="fill" color="#0B3D2E" />
                </button>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {isRTL ? LAWYER.name : LAWYER.nameEn}
                </h1>
                <SealCheck size={22} color={gold} weight="fill" />
                {LAWYER.isElite && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
                    <Crown size={11} weight="fill" /> {isRTL ? "محامي متميز" : "Elite Lawyer"}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {(isRTL ? LAWYER.specialties : LAWYER.specialtiesEn).map((s, i) => (
                  <span key={i} className="text-xs px-3 py-1 rounded-full font-medium bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#0B3D2E]/30 dark:text-[#C8A762]">{s}</span>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} weight={i < Math.floor(LAWYER.rating) ? "fill" : "regular"} color={gold} />)}
                  <span className={`ms-1 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{LAWYER.rating}</span>
                  <span className={muted}>({LAWYER.reviewCount})</span>
                </div>
                <span className={`flex items-center gap-1 ${muted}`}><MapPin size={13} color={gold} />{isRTL ? LAWYER.city : LAWYER.cityEn}</span>
                <span className={`flex items-center gap-1 ${muted}`}><Briefcase size={13} color={gold} />{isRTL ? `${LAWYER.experience} سنوات خبرة` : `${LAWYER.experience} yrs exp.`}</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-2.5 w-full sm:w-auto">
              {LAWYER.hasVideo && (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setVideoOpen(true)} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400 text-sm font-semibold">
                  <PlayCircle size={16} weight="fill" />
                  {isRTL ? "الفيديو التعريفي" : "Intro Video"}
                </motion.button>
              )}
              <motion.a href="#consult" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="px-6 py-3 bg-[#0B3D2E] text-white font-semibold text-sm rounded-xl hover:bg-[#0a3328] transition text-center">
                {isRTL ? "احجز استشارة" : "Book Consultation"}
              </motion.a>
              <button className={`px-6 py-2.5 border font-semibold text-sm rounded-xl transition text-center ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                {isRTL ? "تواصل مباشر" : "Direct Contact"}
              </button>
            </div>
          </div>
        </motion.section>

        {/* ── Stats bar ── */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-2xl border ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
          {[
            { icon: Trophy, label: isRTL ? "نسبة الفوز" : "Win Rate", value: `${LAWYER.winRate}٪`, color: gold },
            { icon: Smiley, label: isRTL ? "رضا الموكلين" : "Client Satisfaction", value: `${LAWYER.satisfaction}٪`, color: green },
            { icon: CalendarBlank, label: isRTL ? "متوسط مدة القضية" : "Avg. Duration", value: LAWYER.avgDuration, color: "#1a5c45" },
            { icon: Clock, label: isRTL ? "معدل الرد" : "Response Rate", value: LAWYER.responseRate, color: gold },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className={`flex flex-col items-center py-5 px-3 gap-1.5 ${isDark ? "bg-[#161b22]" : "bg-white"}`}>
                <Icon size={24} color={stat.color} weight="duotone" />
                <p className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{stat.value}</p>
                <p className={`text-xs text-center ${muted}`}>{stat.label}</p>
              </div>
            );
          })}
        </motion.section>

        {/* ── Tabs ── */}
        <div className={`flex gap-1 p-1.5 rounded-2xl border overflow-x-auto ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
          {TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === tab ? "bg-[#0B3D2E] text-white shadow-sm" : `${muted} hover:text-gray-900 dark:hover:text-gray-200`}`}>
              {isRTL ? tabLabels[tab].ar : tabLabels[tab].en}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }} className="space-y-6">

            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && <>
              {/* About */}
              <section className={card}>
                <h2 className={heading}>{isRTL ? "نبذة عن المحامي" : "About"}</h2>
                <p className={`leading-relaxed text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>{isRTL ? LAWYER.bio : LAWYER.bioEn}</p>
              </section>

              {/* Specializations */}
              <section className={card}>
                <button className="w-full flex items-center justify-between" onClick={() => setSpecsOpen(v => !v)}>
                  <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{isRTL ? "مجالات التخصص" : "Areas of Expertise"}</h2>
                  {specsOpen ? <CaretUp size={18} color={gold} /> : <CaretDown size={18} color={gold} />}
                </button>
                <div className="flex flex-wrap gap-2 mt-4">
                  {LAWYER.subSpecialties.slice(0, specsOpen ? undefined : 5).map((s, i) => (
                    <span key={i} className={`text-sm px-3 py-1.5 rounded-full border font-medium ${isDark ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/20 text-[#C8A762]" : "border-[#0B3D2E]/20 bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>{s}</span>
                  ))}
                  {!specsOpen && LAWYER.subSpecialties.length > 5 && (
                    <button onClick={() => setSpecsOpen(true)} className={`text-sm px-3 py-1.5 rounded-full border font-medium ${isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>+{LAWYER.subSpecialties.length - 5}</button>
                  )}
                </div>
              </section>

              {/* Services */}
              <section id="consult" className={card}>
                <h2 className={heading}>{isRTL ? "الخدمات والأسعار" : "Services & Pricing"}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {SERVICES.map((s) => {
                    const Icon = s.icon;
                    return (
                      <motion.div key={s.id} whileHover={{ scale: 1.02 }} className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors ${isDark ? "border-[#2d3748] bg-[#0c0f12] hover:border-[#0B3D2E]/50" : "border-gray-200 bg-gray-50 hover:border-[#0B3D2E]/40"}`}>
                        <div className="w-10 h-10 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center"><Icon size={22} color={green} weight="duotone" /></div>
                        <div>
                          <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>{isRTL ? s.title : s.titleEn}</p>
                          <p className={`text-xs mt-1 ${muted}`}>{isRTL ? s.desc : s.descEn}</p>
                        </div>
                        <p className="font-bold text-[#C8A762] text-sm">{isRTL ? s.price : s.priceEn}</p>
                        <button className="w-full py-2 rounded-xl bg-[#0B3D2E] text-white text-xs font-semibold hover:bg-[#0a3328] transition">{isRTL ? "احجز" : "Book"}</button>
                      </motion.div>
                    );
                  })}
                </div>
              </section>

              {/* Career */}
              <section className={card}>
                <h2 className={heading}>{isRTL ? "الخبرات والمؤهلات" : "Experience & Education"}</h2>
                <div className="space-y-0">
                  {CAREER.map((entry, idx) => {
                    const isWork = entry.type === "work";
                    return (
                      <div key={idx} className="flex gap-4 relative">
                        {idx < CAREER.length - 1 && <div className={`absolute top-8 ${isRTL ? "right-4" : "left-4"} w-0.5 h-full`} style={{ backgroundColor: isDark ? "#2d3748" : "#e5e7eb" }} />}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-0.5" style={{ backgroundColor: isWork ? "#0B3D2E20" : "#C8A76220", border: `2px solid ${isWork ? green : gold}` }}>
                          {isWork ? <Briefcase size={14} color={green} weight="duotone" /> : <GraduationCap size={14} color={gold} weight="duotone" />}
                        </div>
                        <div className="pb-6 flex-1">
                          <p className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-800"}`}>{isRTL ? entry.title : entry.titleEn}</p>
                          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>{isRTL ? entry.place : entry.placeEn}</p>
                          <p className={`text-xs mt-0.5 ${muted}`}>{isRTL ? entry.year : entry.yearEn}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Similar */}
              <section className={card}>
                <h2 className={heading}>{isRTL ? "محامون مشابهون" : "Similar Lawyers"}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {SIMILAR.map((l, i) => (
                    <motion.a key={i} href={`/lawyers/${l.slug}`} whileHover={{ scale: 1.02 }} className={`flex items-center gap-3 rounded-xl border p-4 transition-colors group ${isDark ? "border-[#2d3748] bg-[#0c0f12] hover:border-[#0B3D2E]/50" : "border-gray-200 bg-gray-50 hover:border-[#0B3D2E]/30"}`}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base flex-shrink-0" style={{ backgroundColor: l.color }}>{l.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-800"}`}>{l.name}</p>
                        <p className={`text-xs ${muted}`}>{l.specialty}</p>
                        <div className="flex items-center gap-1 mt-0.5"><Star size={10} weight="fill" color={gold} /><span className={`text-xs ${muted}`}>{l.rating}</span></div>
                      </div>
                      <ArrowRight size={16} color={gold} className={`flex-shrink-0 ${isRTL ? "rotate-180" : ""}`} />
                    </motion.a>
                  ))}
                </div>
              </section>
            </>}

            {/* ── REVIEWS ── */}
            {activeTab === "reviews" && (
              <section className={card}>
                {/* Summary */}
                <div className="flex flex-col sm:flex-row gap-8 mb-8 pb-8 border-b border-gray-100 dark:border-white/10">
                  <div className="text-center">
                    <div className={`text-6xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>{avgRating}</div>
                    <div className="flex justify-center gap-0.5 my-2">{[...Array(5)].map((_, i) => <Star key={i} size={18} weight="fill" color={gold} />)}</div>
                    <p className={`text-sm ${muted}`}>{LAWYER.reviewCount} {isRTL ? "تقييم" : "reviews"}</p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <StarRow label="جودة الخدمة" labelEn="Service Quality" value={RATINGS_BREAKDOWN.quality} />
                    <StarRow label="الالتزام بالمواعيد" labelEn="Timing" value={RATINGS_BREAKDOWN.timing} />
                    <StarRow label="التواصل" labelEn="Communication" value={RATINGS_BREAKDOWN.communication} />
                    <StarRow label="القيمة/السعر" labelEn="Value for Money" value={RATINGS_BREAKDOWN.value} />
                  </div>
                </div>

                {/* Reviews list */}
                <div className="space-y-4">
                  {REVIEWS.map((r, i) => (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className={`rounded-xl p-5 border ${isDark ? "border-[#2d3748] bg-[#0c0f12]" : "border-gray-100 bg-gray-50"}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-sm font-bold">{(isRTL ? r.name : r.nameEn).charAt(0)}</div>
                          <div>
                            <p className={`font-semibold text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{isRTL ? r.name : r.nameEn}</p>
                            <p className={`text-xs ${muted}`}>{isRTL ? r.date : r.dateEn}</p>
                          </div>
                        </div>
                        <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} size={13} weight={i < r.rating ? "fill" : "regular"} color={gold} />)}</div>
                      </div>

                      <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{isRTL ? r.text : r.textEn}</p>

                      {/* Sub-ratings toggle */}
                      <button onClick={() => setExpandedReview(expandedReview === r.id ? null : r.id)} className={`mt-3 text-xs flex items-center gap-1 ${muted} hover:text-gray-700 dark:hover:text-gray-300 transition`}>
                        <ChartBar size={12} />{isRTL ? "عرض تفاصيل التقييم" : "Rating details"}{expandedReview === r.id ? <CaretUp size={10} /> : <CaretDown size={10} />}
                      </button>
                      <AnimatePresence>
                        {expandedReview === r.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-3 space-y-2 pt-3 border-t border-gray-100 dark:border-white/10">
                              <StarRow label="جودة الخدمة" labelEn="Quality" value={r.qualityR} />
                              <StarRow label="المواعيد" labelEn="Timing" value={r.timingR} />
                              <StarRow label="التواصل" labelEn="Communication" value={r.commR} />
                              <StarRow label="القيمة" labelEn="Value" value={r.valueR} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Lawyer reply */}
                      {r.reply && (
                        <div className={`mt-4 rounded-xl p-4 text-sm ${isDark ? "bg-[#0B3D2E]/20 border border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border border-[#0B3D2E]/15"}`}>
                          <p className={`text-xs font-bold mb-1.5 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>⚖️ {isRTL ? "رد المحامي:" : "Lawyer's Reply:"}</p>
                          <p className={isDark ? "text-gray-300" : "text-gray-700"}>{r.reply}</p>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ARTICLES ── */}
            {activeTab === "articles" && (
              <section className={card}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{isRTL ? "مقالاتي القانونية" : "My Legal Articles"}</h2>
                  <a href="/blog" className="text-sm text-[#0B3D2E] dark:text-[#C8A762] font-medium hover:underline flex items-center gap-1">
                    {isRTL ? "كل المقالات" : "All articles"}<ArrowLeft size={14} className={isRTL ? "rotate-180" : ""} />
                  </a>
                </div>
                <div className="space-y-4">
                  {ARTICLES.map((a, i) => (
                    <motion.a key={a.id} href={`/blog/${a.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ x: isRTL ? -4 : 4 }} className={`flex items-start gap-4 p-4 rounded-xl border transition-colors group ${isDark ? "border-[#2d3748] hover:border-[#0B3D2E]/40 bg-[#0c0f12]" : "border-gray-200 hover:border-[#0B3D2E]/30 bg-gray-50"}`}>
                      <div className="w-10 h-10 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Newspaper size={20} color={green} weight="duotone" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-[#C8A762] font-medium">{isRTL ? a.category : a.categoryEn}</span>
                          <span className={`text-xs ${muted}`}>{isRTL ? a.date : a.dateEn}</span>
                          <span className={`text-xs ${muted}`}>· {isRTL ? a.readTime : a.readTimeEn} {isRTL ? "قراءة" : "read"}</span>
                        </div>
                        <p className={`font-semibold text-sm leading-snug ${isDark ? "text-gray-200" : "text-gray-800"}`}>{isRTL ? a.title : a.titleEn}</p>
                      </div>
                      <ArrowRight size={16} color={gold} className={`flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition ${isRTL ? "rotate-180" : ""}`} />
                    </motion.a>
                  ))}
                </div>
                <div className={`mt-6 rounded-xl border border-dashed p-5 text-center ${isDark ? "border-white/10" : "border-gray-200"}`}>
                  <Newspaper size={32} color={gold} weight="duotone" className="mx-auto mb-2 opacity-50" />
                  <p className={`text-sm ${muted}`}>{isRTL ? "هل أنت المحامي؟ اكتب مقالاً لتعزيز ظهورك" : "Are you the lawyer? Write an article to boost your visibility"}</p>
                  {isOwner && <button className="mt-3 px-5 py-2 rounded-xl bg-[#0B3D2E] text-white text-sm font-semibold">{isRTL ? "اكتب مقالاً" : "Write Article"}</button>}
                </div>
              </section>
            )}

            {/* ── ACHIEVEMENTS ── */}
            {activeTab === "achievements" && (
              <section className={card}>
                <h2 className={heading}>{isRTL ? "الإنجازات والشارات" : "Achievements & Badges"}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {ACHIEVEMENTS.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.1, type: "spring" }} className={`flex flex-col items-center gap-3 rounded-2xl border p-5 text-center ${a.bg} ${a.border}`}>
                        <div className="w-12 h-12 rounded-2xl bg-white/50 dark:bg-white/10 flex items-center justify-center">
                          <Icon size={26} color={a.color} weight="duotone" />
                        </div>
                        <p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-700"} leading-snug`}>{isRTL ? a.label : a.labelEn}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── ANALYTICS (يراها المحامي فقط) ── */}
            {activeTab === "analytics" && (
              <section className={card}>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{isRTL ? "تحليلات البروفايل" : "Profile Analytics"}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-600 dark:text-amber-400 font-bold">{isRTL ? "خاص" : "Private"}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  {[
                    { icon: Eye, label: isRTL ? "مشاهدات البروفايل" : "Profile Views", value: LAWYER.profileViews.toLocaleString(), color: "#3b82f6", change: "+12%" },
                    { icon: ChatsCircle, label: isRTL ? "نقرات احجز" : "Book Clicks", value: LAWYER.bookingClicks, color: "#0B3D2E", change: "+8%" },
                    { icon: Star, label: isRTL ? "متوسط التقييم" : "Avg Rating", value: LAWYER.rating, color: gold, change: "↑ 0.1" },
                    { icon: UserCircle, label: isRTL ? "ظهور في البحث" : "Search Impressions", value: "432", color: "#8b5cf6", change: "+23%" },
                  ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={`rounded-xl border p-4 ${isDark ? "border-[#2d3748] bg-[#0c0f12]" : "border-gray-200 bg-gray-50"}`}>
                        <Icon size={20} color={stat.color} weight="duotone" />
                        <div className={`text-2xl font-black mt-2 ${isDark ? "text-white" : "text-gray-900"}`}>{stat.value}</div>
                        <div className={`text-xs mt-1 ${muted}`}>{stat.label}</div>
                        <div className="text-xs text-emerald-500 font-semibold mt-1">{stat.change}</div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* AI رضا توصيات */}
                <div className={`rounded-2xl border p-5 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                  <p className={`text-sm font-bold mb-3 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>✨ {isRTL ? "توصيات نظامي AI:" : "Nezamy AI Recommendations:"}</p>
                  <ul className={`space-y-2 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    {!LAWYER.hasVideo && <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5">💡</span>{isRTL ? "أضف فيديو تعريفياً لزيادة حجوزاتك ~٣٠٪" : "Add intro video to boost bookings by ~30%"}</li>}
                    <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✅</span>{isRTL ? "بروفايلك مكتمل بنسبة ٨٢٪ — أضف شهاداتك لتصل ١٠٠٪" : "Profile 82% complete — add your certificates to reach 100%"}</li>
                    <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">📝</span>{isRTL ? "اكتب ٣ مقالات في تخصصك لتحسين ظهورك في البحث" : "Write 3 articles in your specialty to improve search visibility"}</li>
                  </ul>
                </div>
              </section>
            )}

            {/* ── COMMUNITY REPLIES TAB ── */}
            {activeTab === "community" && (
              <section className="space-y-5">
                {/* Header */}
                <div className={`rounded-2xl border p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${isDark ? "bg-[#0B3D2E]/15 border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/20"}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E] flex items-center justify-center">
                      <ChatCircle size={24} color="#C8A762" weight="fill" />
                    </div>
                    <div>
                      <p className={`font-black text-base ${isDark ? "text-white" : "text-gray-900"}`}>
                        {isRTL ? "أبرز ردوده في المجتمع القانوني" : "Top Community Replies"}
                      </p>
                      <p className={`text-xs ${muted}`}>
                        {isRTL
                          ? `${COMMUNITY_REPLIES.length} رد مميز · ${COMMUNITY_REPLIES.reduce((a, r) => a + r.likes, 0)} إعجاب · ${COMMUNITY_REPLIES.filter(r => r.isBest).length} أفضل إجابة`
                          : `${COMMUNITY_REPLIES.length} top replies · ${COMMUNITY_REPLIES.reduce((a, r) => a + r.likes, 0)} likes · ${COMMUNITY_REPLIES.filter(r => r.isBest).length} best answers`}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/community"
                    className="ms-auto flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition hover:border-[#0B3D2E]/40"
                    style={{ borderColor: isDark ? "#2d3748" : "#e5e7eb", color: isDark ? "#9ca3af" : "#6b7280" }}
                  >
                    {isRTL ? "تصفح المجتمع" : "Browse Community"}
                    <ArrowRight size={12} className={isRTL ? "rotate-180" : ""} />
                  </Link>
                </div>

                {/* Replies */}
                {COMMUNITY_REPLIES.map((reply, i) => (
                  <motion.div
                    key={reply.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className={`rounded-2xl border p-5 ${
                      reply.isBest
                        ? isDark ? "bg-[#0B3D2E]/15 border-[#0B3D2E]/40" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/25"
                        : isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"
                    }`}
                  >
                    {/* Best badge */}
                    {reply.isBest && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-3">
                        <CheckCircle size={13} weight="fill" />
                        {isRTL ? "أفضل إجابة ✓" : "Best Answer ✓"}
                      </div>
                    )}

                    {/* Question (linked) */}
                    <Link href={`/community/${reply.questionSlug}`} className="group block mb-3">
                      <p className={`text-xs font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                        💬 {isRTL ? "السؤال:" : "Question:"}
                      </p>
                      <p className={`text-sm font-semibold leading-snug group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                        {isRTL ? reply.questionAr : reply.questionEn}
                      </p>
                    </Link>

                    {/* Divider */}
                    <div className={`h-px mb-3 ${isDark ? "bg-white/10" : "bg-gray-100"}`} />

                    {/* Reply excerpt */}
                    <p className={`text-xs font-bold mb-1.5 ${muted}`}>
                      {isRTL ? "ردي:" : "My Answer:"}
                    </p>
                    <p className={`text-sm leading-relaxed mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      {(isRTL ? reply.replyAr : reply.replyEn).slice(0, 160)}...
                    </p>

                    {/* Footer row */}
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                        {isRTL ? reply.category : reply.categoryEn}
                      </span>
                      <span className={`text-xs ${muted}`}>{isRTL ? reply.date : reply.dateEn}</span>
                      <div className="flex items-center gap-1 ms-auto">
                        <ThumbsUp size={13} color="#C8A762" weight="fill" />
                        <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{reply.likes}</span>
                      </div>
                      <Link
                        href={`/community/${reply.questionSlug}`}
                        className={`flex items-center gap-1 text-xs font-medium hover:underline ${isDark ? "text-gray-400 hover:text-[#C8A762]" : "text-gray-500 hover:text-[#0B3D2E]"}`}
                      >
                        {isRTL ? "عرض الموضوع" : "View Thread"}
                        <ArrowRight size={11} className={isRTL ? "rotate-180" : ""} />
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </section>
            )}

          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
