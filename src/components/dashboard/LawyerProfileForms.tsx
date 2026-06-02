"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, memo } from "react";
import {
  X,
  Copy,
  Scales,
  BookOpen,
  LinkedinLogo,
  TwitterLogo,
  Trophy,
  CheckCircle,
  Lock,
  Star,
} from "@phosphor-icons/react";

// ─── Shared UI components ─────────────────────────────────────────────────────

export function SpotlightCard({
  children,
  className,
  isDark,
}: {
  children: React.ReactNode;
  className?: string;
  isDark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, visible: false });
  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
  }
  const base = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70 relative overflow-hidden"
    : "rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] relative overflow-hidden";
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setPos((p) => ({ ...p, visible: false }))}
      className={`${base} ${className ?? ""}`}
    >
      {pos.visible && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, ${
              isDark ? "rgba(200,167,98,0.06)" : "rgba(11,61,46,0.04)"
            }, transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

export const RingScore = memo(function RingScore({
  score,
  color,
  size = 80,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        className="text-slate-100 dark:text-white/[0.06]"
      />
      <motion.circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${(score / 100) * circ} ${circ}` }}
        transition={{ duration: 0.9, delay: 0.2 }}
      />
    </svg>
  );
});

// ─── Share Modal ─────────────────────────────────────────────────────────────

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  metalTier: {
    emoji: string;
    label: string;
    color: string;
    next: number | null;
  };
  shareToggles: {
    profile: boolean;
    metalLevel: boolean;
    achievements: boolean;
    winRate: boolean;
    reviews: boolean;
    financial: boolean;
  };
  setShareToggles: React.Dispatch<
    React.SetStateAction<{
      profile: boolean;
      metalLevel: boolean;
      achievements: boolean;
      winRate: boolean;
      reviews: boolean;
      financial: boolean;
    }>
  >;
  WIN_RATE_PCT: number;
  reviewCount: number;
}

export function ShareModal({
  open,
  onClose,
  isDark,
  metalTier,
  shareToggles,
  setShareToggles,
  WIN_RATE_PCT,
  reviewCount,
}: ShareModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className={`fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-3xl p-6 ${
              isDark
                ? "bg-zinc-900 border-t border-white/[0.08]"
                : "bg-white border-t border-slate-100 shadow-2xl"
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                  تخصيص المشاركة
                </h2>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  اختر ما يظهر في بطاقتك المهنية
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100"}`}
              >
                <X size={16} className={isDark ? "text-zinc-400" : "text-slate-500"} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              {[
                {
                  key: "profile" as const,
                  label: "البيانات الشخصية والتخصص",
                  sub: "الاسم والمدينة وسنوات الخبرة",
                },
                {
                  key: "metalLevel" as const,
                  label: `مستوى الإنتاجية (${metalTier.emoji} ${metalTier.label})`,
                  sub: "إجمالي ساعات العمل التراكمية",
                },
                { key: "achievements" as const, label: "الإنجازات", sub: "الشارات المفتوحة فقط" },
                { key: "winRate" as const, label: "نسبة الفوز", sub: `${WIN_RATE_PCT}٪` },
                { key: "reviews" as const, label: "تقييمات الموكلين", sub: `${reviewCount} تقييم` },
                { key: "financial" as const, label: "التحليلات المالية", sub: "مخفية بالافتراضي" },
              ].map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isDark ? "border-white/[0.06]" : "border-slate-100"
                  }`}
                >
                  <div>
                    <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                      {item.label}
                    </p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      {item.sub}
                    </p>
                  </div>
                  <button
                    onClick={() => setShareToggles((p) => ({ ...p, [item.key]: !p[item.key] }))}
                    className={`w-10 h-5 rounded-full transition-all flex-shrink-0 relative ${
                      shareToggles[item.key] ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"
                    }`}
                  >
                    <motion.span
                      animate={{ x: shareToggles[item.key] ? 22 : 2 }}
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>
              ))}
            </div>

            <div
              className={`flex items-center gap-2 p-3 rounded-xl border mb-4 ${
                isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"
              }`}
            >
              <span className={`text-[11px] flex-1 font-mono truncate ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                nezamy.online/share/lawyer/xK9mP3q
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText("https://nezamy.online/share/lawyer/xK9mP3q")}
                className={`flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ${
                  isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"
                }`}
              >
                <Copy size={11} /> نسخ
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className={`py-3 rounded-2xl text-[13px] font-bold border ${
                  isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"
                }`}
              >
                مشاركة عبر واتسآب 💬
              </button>
              <button className="py-3 rounded-2xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold">
                مشاركة البطاقة ✨
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

interface OverviewTabProps {
  isDark: boolean;
  profile: {
    bio: string;
    expertise: string[];
    courts: string[];
    education: { degree: string; institution: string; year: string }[];
    languages: string[];
    linkedin: string;
    twitter: string;
  };
  cardClass: string;
}

export function OverviewTab({ isDark, profile, cardClass }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Bio */}
      <div className={`lg:col-span-2 ${cardClass} p-5 space-y-4`}>
        <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>نبذة مهنية</h2>
        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          {profile.bio}
        </p>

        <div>
          <p
            className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${
              isDark ? "text-zinc-600" : "text-slate-400"
            }`}
          >
            مجالات التخصص
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.expertise.map((e) => (
              <span
                key={e}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/8 text-[#0B3D2E]"
                }`}
              >
                {e}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p
            className={`text-[11px] font-bold uppercase tracking-wide mb-2 ${
              isDark ? "text-zinc-600" : "text-slate-400"
            }`}
          >
            المحاكم
          </p>
          <div className="space-y-1.5">
            {profile.courts.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <Scales size={11} className="text-[#C8A762]" />
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar: education + languages */}
      <div className="space-y-4">
        <div className={`${cardClass} p-4 space-y-3`}>
          <h3 className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>المؤهلات</h3>
          {profile.education.map((ed, i) => (
            <div key={i} className="flex gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isDark ? "bg-blue-500/10" : "bg-blue-50"
                }`}
              >
                <BookOpen size={14} weight="duotone" className="text-blue-500" />
              </div>
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  {ed.degree}
                </p>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {ed.institution} · {ed.year}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className={`${cardClass} p-4`}>
          <h3 className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>اللغات</h3>
          <div className="space-y-2">
            {profile.languages.map((l) => (
              <div key={l} className="flex items-center justify-between">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{l}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className={`w-5 h-1.5 rounded-full ${
                        s <= 5 ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardClass} p-4`}>
          <h3 className={`text-[12px] font-bold mb-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
            التواصل الاجتماعي
          </h3>
          <div className="space-y-2">
            {[
              { icon: LinkedinLogo, val: profile.linkedin, color: "text-blue-500" },
              { icon: TwitterLogo, val: profile.twitter, color: "text-sky-400" },
            ].map(({ icon: Icon, val, color }, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon size={14} className={color} />
                <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Achievements Tab ────────────────────────────────────────────────────────

interface AchievementsTabProps {
  isDark: boolean;
  totalPoints: number;
  unlockedLength: number;
  cardClass: string;
  achievements: {
    id: string;
    title: string;
    desc: string;
    icon: any;
    color: string;
    unlocked: boolean;
    points: number;
  }[];
  milestones: {
    label: string;
    current: number;
    target: number;
    color: string;
    icon: any;
  }[];
}

export function AchievementsTab({
  isDark,
  totalPoints,
  unlockedLength,
  cardClass,
  achievements,
  milestones,
}: AchievementsTabProps) {
  return (
    <div className="space-y-4">
      {/* Points hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5"
        style={{ background: "linear-gradient(135deg, #0B3D2E 0%, #125e47 60%, #1a7a5e 100%)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#C8A762]/70 text-[10px] font-bold uppercase tracking-wider mb-1">
              إجمالي النقاط
            </p>
            <p className="text-4xl font-black text-white font-mono">{totalPoints.toLocaleString()}</p>
            <p className="text-white/50 text-[11px] mt-1">
              {unlockedLength} / {achievements.length} إنجازات
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-[#C8A762]/20 flex items-center justify-center">
            <Trophy size={32} weight="duotone" className="text-[#C8A762]" />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between mb-1">
            <span className="text-white/40 text-[9px]">نحو المستوى الماسي</span>
            <span className="text-[#C8A762] text-[9px] font-bold">
              {Math.round((totalPoints / 1500) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(totalPoints / 1500) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-[#C8A762] to-[#e6c97d]"
            />
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className={`${cardClass} p-4 space-y-3`}>
        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الأهداف</p>
        {milestones.map((m, i) => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{m.label}</span>
              <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                {m.current}/{m.target}
              </span>
            </div>
            <div className={`h-1.5 rounded-full ${isDark ? "bg-white/[0.06]" : "bg-slate-100"} overflow-hidden`}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(m.current / m.target) * 100}%` }}
                transition={{ delay: i * 0.1, duration: 0.7, ease: "easeOut" }}
                className={`h-full rounded-full ${m.color}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Unlocked grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {achievements.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className={`${cardClass} p-4 flex items-start gap-3 ${!a.unlocked ? "opacity-50" : ""}`}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}
              >
                {a.unlocked ? (
                  <Icon size={18} weight="duotone" style={{ color: a.color }} />
                ) : (
                  <Lock size={16} weight="duotone" className={isDark ? "text-zinc-600" : "text-slate-400"} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                    {a.title}
                  </p>
                  {a.unlocked && <CheckCircle size={12} weight="fill" className="text-emerald-500" />}
                </div>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{a.desc}</p>
                <span className="text-[10px] font-bold text-[#C8A762]">+{a.points} نقطة</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Reviews Tab ─────────────────────────────────────────────────────────────

interface ReviewsTabProps {
  isDark: boolean;
  reviews: { name: string; rating: number; text: string; date: string }[];
  cardClass: string;
}

export function ReviewsTab({ isDark, reviews, cardClass }: ReviewsTabProps) {
  return (
    <div className="space-y-3">
      {reviews.map((r, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={`${cardClass} p-4`}
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                {r.name}
              </p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{r.date}</p>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={12}
                  weight={s <= r.rating ? "fill" : "regular"}
                  className={
                    s <= r.rating
                      ? "text-[#C8A762]"
                      : isDark
                      ? "text-zinc-700"
                      : "text-slate-300"
                  }
                />
              ))}
            </div>
          </div>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            {r.text}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
