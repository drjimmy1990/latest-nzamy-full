"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  MagnifyingGlass, Star, SealCheck, MapPin, Briefcase,
  ChatCircle,
  Headset, UserCircle, Clock,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getLawyers, type LawyerProfile } from "@/lib/services";

// ─── Specialty filter chips ────────────────────────────────────────────────
// `key` matches LawyerProfile.specialtyKey from the real API. "administrative"
// has no backing category in the taxonomy yet — kept for UI parity, matches
// zero results (same no-op behavior it had back when data was hardcoded).
const SPECIALTIES: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "labor", label: "عمالي" },
  { key: "commercial", label: "تجاري" },
  { key: "real-estate", label: "عقاري" },
  { key: "family", label: "أحوال شخصية" },
  { key: "criminal", label: "جنائي" },
  { key: "administrative", label: "إداري" },
];

// ─── Card shape rendered by this page (mapped from the real LawyerProfile) ─
interface LawyerCard {
  id: string;
  name: string;
  specialty: string;
  specialtyKey: string;
  city: string;
  rating: number;
  reviewCount: number;
  experience: number;
  consultationPrice: number;
  verified: boolean;
  available: boolean;
  tags: string[];
  bio: string;
  responseTime: string;
}

// lawyerService.getLawyers() now guarantees every field below is a real,
// correctly-typed value (see mapRawLawyerRow() in lawyerService.ts) — no
// defensive fallbacks needed here anymore, this is a straight reshape.
function toCard(l: LawyerProfile): LawyerCard {
  return {
    id: l.id,
    name: l.name,
    specialty: l.specialty,
    specialtyKey: l.specialtyKey,
    city: l.city,
    rating: l.rating,
    reviewCount: l.reviewCount,
    experience: l.experienceYears,
    consultationPrice: l.priceMin,
    verified: l.verified,
    available: l.available,
    tags: l.expertise.slice(0, 3),
    bio: l.bio,
    responseTime: l.responseTime,
  };
}

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
  const [specialty, setSpecialty] = useState("all");
  const [selectedLawyer, setSelectedLawyer] = useState<LawyerCard | null>(null);
  const [lawyers, setLawyers] = useState<LawyerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    getLawyers()
      .then(data => {
        setLawyers((data ?? []).map(toCard));
        setFetchError(false);
      })
      .catch(() => {
        setFetchError(true);
        setLawyers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = lawyers.filter(l =>
    (specialty === "all" || l.specialtyKey === specialty) &&
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
              key={s.key}
              onClick={() => setSpecialty(s.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                specialty === s.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`${card} p-5 animate-pulse space-y-3`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-3 w-1/2 rounded ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`} />
                  <div className={`h-2.5 w-1/3 rounded ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`} />
                </div>
              </div>
              <div className={`h-2.5 w-full rounded ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`} />
              <div className={`h-2.5 w-4/5 rounded ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`} />
            </div>
          ))}
        </div>
      ) : lawyers.length === 0 ? (
        /* Honest empty state — no lawyers returned by the API (or the fetch failed) */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${card} p-12 text-center`}
        >
          <UserCircle size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
          <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {fetchError ? "تعذّر تحميل قائمة المحامين" : "لا يوجد محامون متاحون حالياً"}
          </p>
          <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {fetchError ? "حاول تحديث الصفحة أو المحاولة لاحقاً" : "يتم التحقق من المحامين قبل ظهورهم في الدليل — سيتوفر محامون قريباً"}
          </p>
        </motion.div>
      ) : (
      <>
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
      </>
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
