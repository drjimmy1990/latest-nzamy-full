"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  MagnifyingGlass, Star, SealCheck, MapPin, Briefcase,
  FunnelSimple, ArrowLeft, ChatCircle, CalendarBlank,
  Headset, UserCircle, CheckCircle, Clock,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  "الكل",
  "عمالي",
  "تجاري",
  "عقاري",
  "أحوال شخصية",
  "جنائي",
  "إداري",
];

const LAWYERS = [
  {
    id: "L-001",
    name: "خالد الحربي",
    specialty: "عمالي",
    city: "الرياض",
    rating: 4.9,
    reviewCount: 128,
    experience: 12,
    consultationPrice: 250,
    verified: true,
    available: true,
    tags: ["عقود العمل", "فصل تعسفي", "نزاعات مهنية"],
    bio: "محامٍ متخصص في نزاعات العمل والشؤون التجارية، خبرة 12 عاماً أمام المحاكم العمالية.",
    responseTime: "خلال ساعة",
  },
  {
    id: "L-002",
    name: "نورة الزهراني",
    specialty: "أحوال شخصية",
    city: "جدة",
    rating: 4.8,
    reviewCount: 94,
    experience: 9,
    consultationPrice: 200,
    verified: true,
    available: true,
    tags: ["الطلاق", "النفقة", "الحضانة"],
    bio: "متخصصة في قضايا الأحوال الشخصية والأسرة، خبرة 9 سنوات في الفصل الودي والقضائي.",
    responseTime: "خلال ساعتين",
  },
  {
    id: "L-003",
    name: "علي السعدي",
    specialty: "تجاري",
    city: "الرياض",
    rating: 4.7,
    reviewCount: 57,
    experience: 7,
    consultationPrice: 300,
    verified: true,
    available: false,
    tags: ["العقود التجارية", "الشركات", "النزاعات التجارية"],
    bio: "متخصص في القانون التجاري وعقود الشركات، خبرة 7 سنوات مع الشركات الصغيرة والمتوسطة.",
    responseTime: "خلال 24 ساعة",
  },
  {
    id: "L-004",
    name: "ريم المطيري",
    specialty: "عقاري",
    city: "الدمام",
    rating: 4.6,
    reviewCount: 43,
    experience: 6,
    consultationPrice: 220,
    verified: false,
    available: true,
    tags: ["عقود الإيجار", "النزاعات العقارية", "الصكوك"],
    bio: "متخصصة في العقود العقارية ومنازعات الإيجار والتملك.",
    responseTime: "خلال 3 ساعات",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star
          key={i}
          size={11}
          weight={i <= Math.round(rating) ? "fill" : "regular"}
          className={i <= Math.round(rating) ? "text-[#C8A762]" : "text-zinc-300"}
        />
      ))}
    </div>
  );
}

export default function MicroFindLawyerPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("الكل");
  const [selectedLawyer, setSelectedLawyer] = useState<typeof LAWYERS[0] | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = LAWYERS.filter(l =>
    (specialty === "الكل" || l.specialty === specialty) &&
    (l.name.includes(search) || l.specialty.includes(search) || l.city.includes(search))
  );

  return (
    <div className={`p-5 md:p-8 max-w-[1000px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
        <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>ابحث عن محامٍ</h1>
        <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          محامون معتمدون متخصصون — احجز استشارة فورية أو ابدأ قضية
        </p>
      </motion.div>

      {/* Search + Filter */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو التخصص أو المدينة..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {SPECIALTIES.map(s => (
            <button
              key={s}
              onClick={() => setSpecialty(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                specialty === s
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((lawyer, i) => (
          <motion.div
            key={lawyer.id}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={i}
            className={`${card} p-5 cursor-pointer transition-all hover:border-royal/30`}
            onClick={() => setSelectedLawyer(lawyer)}
          >
            {/* Top Row */}
            <div className="flex items-start gap-3 mb-3">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center text-white text-[16px] font-bold">
                  {lawyer.name.charAt(0)}
                </div>
                {lawyer.available && (
                  <span className="absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-zinc-900" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className={`font-bold text-[15px] ${isDark ? "text-white" : "text-zinc-800"}`}>{lawyer.name}</p>
                  {lawyer.verified && <SealCheck size={15} weight="fill" className="text-[#C8A762] flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-[#0B3D2E]/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                    {lawyer.specialty}
                  </span>
                  <span className={`flex items-center gap-0.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <MapPin size={10} /> {lawyer.city}
                  </span>
                  <span className={`flex items-center gap-0.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <Briefcase size={10} /> {lawyer.experience} سنوات
                  </span>
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>{lawyer.consultationPrice} ر.س</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>للاستشارة</p>
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1.5 mb-2">
              <StarRating rating={lawyer.rating} />
              <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{lawyer.rating}</span>
              <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>({lawyer.reviewCount} تقييم)</span>
              <span className={`ms-auto text-[10px] flex items-center gap-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                <Clock size={9} /> يرد {lawyer.responseTime}
              </span>
            </div>

            {/* Bio */}
            <p className={`text-[12px] leading-relaxed mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {lawyer.bio}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {lawyer.tags.map(tag => (
                <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Link href={`/dashboard/micro/requests?lawyer=${lawyer.id}&type=consult`} className="flex-1" onClick={e => e.stopPropagation()}>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-colors cursor-pointer ${
                    lawyer.available
                      ? "bg-[#0B3D2E] text-white hover:bg-[#0d5238]"
                      : isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  }`}
                >
                  <Headset size={13} />
                  {lawyer.available ? "احجز استشارة" : "غير متاح الآن"}
                </motion.div>
              </Link>
              <Link href={`/dashboard/micro/requests?lawyer=${lawyer.id}&type=message`} onClick={e => e.stopPropagation()}>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                    isDark ? "bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:text-royal hover:bg-royal/10"
                  }`}
                >
                  <ChatCircle size={17} />
                </motion.div>
              </Link>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${card} p-12 text-center`}
        >
          <MagnifyingGlass size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
          <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد نتائج</p>
          <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>جرّب تخصصاً مختلفاً أو مدينة أخرى</p>
        </motion.div>
      )}

      {/* Lawyer Detail Modal */}
      <AnimatePresence>
        {selectedLawyer && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedLawyer(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              <div className={`p-6 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {selectedLawyer.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className={`text-[17px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{selectedLawyer.name}</h2>
                      {selectedLawyer.verified && <SealCheck size={16} weight="fill" className="text-[#C8A762]" />}
                    </div>
                    <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{selectedLawyer.specialty} · {selectedLawyer.city}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <StarRating rating={selectedLawyer.rating} />
                      <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{selectedLawyer.rating}</span>
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>({selectedLawyer.reviewCount})</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  {selectedLawyer.bio}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "الخبرة", value: `${selectedLawyer.experience} سنوات` },
                    { label: "وقت الرد", value: selectedLawyer.responseTime },
                    { label: "الاستشارة", value: `${selectedLawyer.consultationPrice} ر.س` },
                  ].map(item => (
                    <div key={item.label} className={`text-center p-3 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                      <p className={`text-[12px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{item.value}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Link href={`/dashboard/micro/requests?lawyer=${selectedLawyer.id}&type=consult`} className="flex-1">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold bg-[#0B3D2E] text-white cursor-pointer hover:bg-[#0d5238] transition-colors"
                    >
                      <Headset size={15} /> احجز استشارة
                    </motion.div>
                  </Link>
                  <button onClick={() => setSelectedLawyer(null)}
                    className={`px-4 py-3 rounded-xl text-[13px] font-bold cursor-pointer transition-colors ${isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
