"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Medal, Fire, HandHeart, PencilSimpleLine, Scales,
  MagnifyingGlass, Handshake, ChartBar, Brain, Users,
  Star, ArrowUp, ArrowDown, Export, Lightning, Crown,
  Target, Sparkle, CalendarCheck, Clock, Briefcase,
  GraduationCap, UserCircle, Gift,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ── Types ─────────────────────────────────────────────────
type Tab = "overview" | "leaderboard" | "rewards";

// ── Mock data ─────────────────────────────────────────────
const MY_STATS = {
  xp: 7200, level: 4, levelLabel: "محامي متقدم", streak: 14,
  tasksCompleted: 23, totalTasks: 28, memos: 6, cases: 4,
  rating: 4.8, hoursLogged: 87, hoursTarget: 120, helpCount: 3,
};

const HEXAGON = [
  { axis: "الصياغة القانونية", score: 4, prev: 3.5, icon: PencilSimpleLine },
  { axis: "البحث النظامي", score: 5, prev: 4, icon: MagnifyingGlass },
  { axis: "الترافع", score: 3, prev: 2.5, icon: Scales },
  { axis: "التفاوض", score: 3, prev: 2.5, icon: Handshake },
  { axis: "التحليل", score: 4, prev: 3.5, icon: ChartBar },
  { axis: "التعاون والمساعدة", score: 5, prev: 4.5, icon: HandHeart },
];

const BADGES = [
  { name: "باحث من الطراز الأول", desc: "أنجزت ٥٠ بحثاً نظامياً", icon: "🔍", earned: true },
  { name: "شعلة المكتب", desc: "١٤ يوم إنجاز متواصل", icon: "🔥", earned: true },
  { name: "يد العون", desc: "ساعدت ١٠ زملاء هذا الربع", icon: "🤝", earned: true },
  { name: "قلم ذهبي", desc: "٣ مذكرات حصلت على ٥ نجوم", icon: "📝", earned: true },
  { name: "سريعة البرق", desc: "متوسط تسليمك أسرع من الفريق ب ٣٠٪", icon: "⚡", earned: true },
  { name: "المحارب", desc: "كسب ١٠ قضايا", icon: "⚔️", earned: false },
  { name: "المفاوض الماهر", desc: "٥ تسويات ناجحة", icon: "🤝", earned: false },
  { name: "الأسطورة", desc: "الوصول لمستوى ٢٥,٠٠٠ XP", icon: "💎", earned: false },
];

const TEAM = [
  { rank: 1, name: "أ. فهد السبيعي", role: "شريك", xp: 850, level: "خبير", color: "🔴", streak: 21, medal: "🥇" },
  { rank: 2, name: "أ. نورة الزهراني", role: "محامية مساعدة", xp: 720, level: "متقدم", color: "🟡", streak: 14, medal: "🥈" },
  { rank: 3, name: "ريم القحطاني", role: "باحثة", xp: 540, level: "متمكن", color: "🟢", streak: 7, medal: "🥉" },
  { rank: 4, name: "أحمد المالكي", role: "متدرب", xp: 380, level: "مبتدئ", color: "🔵", streak: 3, medal: "" },
  { rank: 5, name: "سارة العتيبي", role: "سكرتارية", xp: 290, level: "متدرب", color: "🟤", streak: 0, medal: "" },
];

const SPECIAL_CATEGORIES = [
  { label: "🤝 الأكثر مساعدة", winner: "نورة", stat: "٨ مرات" },
  { label: "📝 الأكثر صياغة", winner: "فهد", stat: "١٢ مذكرة" },
  { label: "🔍 الأكثر بحثاً", winner: "ريم", stat: "١٨ بحث" },
  { label: "⚡ الأسرع تسليماً", winner: "نورة", stat: "متوسط ٦ ساعات" },
];

const LEVELS = [
  { label: "متدرب", min: 0, max: 500, color: "bg-amber-900" },
  { label: "مبتدئ", min: 500, max: 2000, color: "bg-blue-500" },
  { label: "متمكن", min: 2000, max: 5000, color: "bg-emerald-500" },
  { label: "متقدم", min: 5000, max: 10000, color: "bg-yellow-500" },
  { label: "خبير", min: 10000, max: 25000, color: "bg-red-500" },
  { label: "أسطورة المكتب", min: 25000, max: 50000, color: "bg-purple-500" },
];

const REWARDS = [
  { name: "يوم إجازة إضافي", xpCost: 2000, icon: "🌴", claimed: false },
  { name: "بطاقة هدية ٥٠٠ ﷼", xpCost: 3000, icon: "🎁", claimed: false },
  { name: "حضور مؤتمر قانوني", xpCost: 5000, icon: "🎓", claimed: false },
  { name: "BONUS ١,٠٠٠ ﷼", xpCost: 8000, icon: "💰", claimed: true },
  { name: "لقب شريك مبتدئ", xpCost: 25000, icon: "👑", claimed: false },
];

export default function AchievementsPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<Tab>("overview");

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  const levelInfo = LEVELS[MY_STATS.level - 1];
  const nextLevel = LEVELS[MY_STATS.level] || LEVELS[LEVELS.length - 1];
  const levelProgress = ((MY_STATS.xp - levelInfo.min) / (nextLevel.max - levelInfo.min)) * 100;

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${tp}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${tp}`}>إنجازاتي ومكافآتي</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">GAMIFICATION</span>
          </div>
          <p className={`text-[13px] ${ts}`}>تتبع أدائك وتطورك المهني — وقارن مع فريقك</p>
        </div>
        <button className={`px-3 py-2 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-500"}`}>
          <Export size={13} /> مشاركة إنجازاتي
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {[
          { key: "overview" as Tab, label: "نظرة عامة", icon: Trophy },
          { key: "leaderboard" as Tab, label: "المتصدرون", icon: Crown },
          { key: "rewards" as Tab, label: "المكافآت", icon: Gift },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
              tab === t.key ? "bg-royal/10 text-royal dark:bg-royal/20 dark:text-[#C8A762]" : `${ts} hover:bg-white/[0.04]`
            }`}>
            <t.icon size={14} weight={tab === t.key ? "fill" : "regular"} />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ═══════════════════ OVERVIEW TAB ═══════════════════ */}
        {tab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* XP + Level + Streak */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`${card} p-5 shadow-sm md:col-span-2`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className={`text-[11px] uppercase tracking-wider font-bold ${ts}`}>المستوى الحالي</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-extrabold text-royal">{MY_STATS.levelLabel}</span>
                      <span className={`text-[11px] ${ts}`}>🟡 المستوى {MY_STATS.level}</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className={`text-3xl font-black font-mono ${tp}`}>{MY_STATS.xp.toLocaleString()}</p>
                    <p className={`text-[10px] ${ts}`}>XP إجمالي</p>
                  </div>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(levelProgress, 100)}%` }}
                    transition={{ duration: 1 }} className="h-full rounded-full bg-gradient-to-l from-[#C8A762] to-royal" />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-[10px] ${ts}`}>{levelInfo.label} ({levelInfo.min.toLocaleString()})</span>
                  <span className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-royal"}`}>← {(nextLevel.max - MY_STATS.xp).toLocaleString()} XP للمستوى التالي</span>
                  <span className={`text-[10px] ${ts}`}>{nextLevel.label} ({nextLevel.max.toLocaleString()})</span>
                </div>
              </div>

              <div className={`${card} p-5 shadow-sm flex flex-col items-center justify-center text-center`}>
                <Fire size={28} weight="fill" className="text-orange-500 mb-1" />
                <p className={`text-4xl font-black font-mono ${tp}`}>{MY_STATS.streak}</p>
                <p className={`text-[11px] ${ts}`}>يوم إنجاز متواصل</p>
                <div className="flex gap-0.5 mt-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className={`w-3.5 h-3.5 rounded-full ${i < MY_STATS.streak % 7 ? "bg-orange-500" : isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Monthly stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "مهام مُنجزة", value: `${MY_STATS.tasksCompleted}/${MY_STATS.totalTasks}`, pct: Math.round(MY_STATS.tasksCompleted/MY_STATS.totalTasks*100), icon: Target },
                { label: "مذكرات مُسلّمة", value: String(MY_STATS.memos), icon: PencilSimpleLine },
                { label: "قضايا نشطة", value: String(MY_STATS.cases), icon: Briefcase },
                { label: "تقييم العملاء", value: `${MY_STATS.rating}/٥`, icon: Star },
                { label: "ساعات مُسجّلة", value: `${MY_STATS.hoursLogged}/${MY_STATS.hoursTarget}`, pct: Math.round(MY_STATS.hoursLogged/MY_STATS.hoursTarget*100), icon: Clock },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className={`${card} p-4 shadow-sm text-center`}>
                    <Icon size={16} weight="duotone" className="text-royal mx-auto mb-1.5" />
                    <p className={`text-lg font-black font-mono ${tp}`}>{s.value}</p>
                    <p className={`text-[10px] ${ts}`}>{s.label}</p>
                  </motion.div>
                );
              })}
            </div>

            {/* Hexagonal Profile */}
            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-5">
                <ChartBar size={16} className="text-royal" weight="duotone" />
                <p className={`text-[13px] font-bold ${tp}`}>تحليل هكسا — الملف التطوري</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>آخر ٦ أشهر</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {HEXAGON.map((h, i) => {
                  const Icon = h.icon;
                  const improved = h.score > h.prev;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                      className={`p-4 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/50"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={14} weight="duotone" className="text-royal" />
                        <span className={`text-[11px] font-semibold ${tp}`}>{h.axis}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, si) => (
                          <div key={si} className={`h-3 flex-1 rounded-sm ${si < h.score ? "bg-royal" : isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />
                        ))}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className={`text-[11px] font-bold ${tp}`}>{h.score}/٥</span>
                        {improved ? (
                          <span className="text-[9px] text-emerald-500 flex items-center gap-0.5"><ArrowUp size={8} weight="bold" />+{(h.score - h.prev).toFixed(1)}</span>
                        ) : (
                          <span className="text-[9px] text-zinc-400">—</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className={`mt-4 p-3 rounded-xl ${isDark ? "bg-royal/10 border border-royal/20" : "bg-royal/5 border border-royal/15"}`}>
                <div className="flex items-start gap-2">
                  <Sparkle size={14} className="text-[#C8A762] mt-0.5 shrink-0" weight="fill" />
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                    <strong>توصية AI:</strong> "تتطورين بسرعة في البحث والتعاون. الترافع يحتاج تجربة أكثر — ننصح بتعيينك محامية ثانية في ٢-٣ قضايا ترافع الشهر القادم."
                  </p>
                </div>
              </div>
            </div>

            {/* Badges */}
            <div className={`${card} p-5 shadow-sm`}>
              <p className={`text-[13px] font-bold mb-4 ${tp}`}>🏅 الشارات والإنجازات</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {BADGES.map((b, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                    className={`p-3 rounded-xl text-center border transition-all ${
                      b.earned
                        ? isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5" : "border-[#C8A762]/40 bg-[#C8A762]/5"
                        : isDark ? "border-white/[0.04] bg-white/[0.01] opacity-40" : "border-zinc-100 bg-zinc-50 opacity-40"
                    }`}>
                    <span className="text-2xl block mb-1">{b.icon}</span>
                    <p className={`text-[11px] font-bold ${tp}`}>{b.name}</p>
                    <p className={`text-[9px] mt-0.5 ${ts}`}>{b.desc}</p>
                    {!b.earned && <p className={`text-[8px] mt-1 font-bold ${ts}`}>🔒 لم تُحقق بعد</p>}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ LEADERBOARD TAB ═══════════════════ */}
        {tab === "leaderboard" && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-5">
                <Trophy size={18} weight="duotone" className="text-[#C8A762]" />
                <p className={`text-[14px] font-bold ${tp}`}>🏆 متصدرو هذا الشهر</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ms-auto ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>أبريل ٢٠٢٦</span>
              </div>
              <div className="space-y-2.5">
                {TEAM.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className={`flex items-center gap-3 p-3.5 rounded-xl ${
                      m.rank <= 3
                        ? isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/20" : "bg-[#C8A762]/5 border border-[#C8A762]/15"
                        : isDark ? "bg-white/[0.02] border border-white/[0.04]" : "bg-zinc-50 border border-zinc-100"
                    }`}>
                    <span className="text-xl w-8 text-center">{m.medal || `${m.rank}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-bold ${tp}`}>{m.name}</p>
                      <p className={`text-[10px] ${ts}`}>{m.role} — {m.color} {m.level}</p>
                    </div>
                    <div className="text-end">
                      <p className={`text-[14px] font-black font-mono ${tp}`}>{m.xp}</p>
                      <p className={`text-[9px] ${ts}`}>XP هذا الشهر</p>
                    </div>
                    <div className="text-center w-14">
                      {m.streak > 0 ? (
                        <div className="flex items-center gap-0.5 justify-center">
                          <Fire size={12} weight="fill" className="text-orange-500" />
                          <span className={`text-[11px] font-bold ${tp}`}>{m.streak}</span>
                        </div>
                      ) : <span className={`text-[10px] ${ts}`}>—</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Special categories */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SPECIAL_CATEGORIES.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className={`${card} p-4 shadow-sm text-center`}>
                  <p className={`text-[11px] font-bold mb-1 ${ts}`}>{c.label}</p>
                  <p className={`text-[14px] font-black ${tp}`}>{c.winner}</p>
                  <p className={`text-[10px] ${isDark ? "text-[#C8A762]" : "text-royal"}`}>{c.stat}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ REWARDS TAB ═══════════════════ */}
        {tab === "rewards" && (
          <motion.div key="rewards" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            <div className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Gift size={18} weight="duotone" className="text-[#C8A762]" />
                  <p className={`text-[14px] font-bold ${tp}`}>🎁 المكافآت المتاحة</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${ts}`}>رصيدك:</span>
                  <span className={`text-[14px] font-black font-mono text-royal`}>{MY_STATS.xp.toLocaleString()} XP</span>
                </div>
              </div>
              <p className={`text-[11px] ${ts} mb-4`}>🏢 المكافآت يُحددها صاحب المكتب — يمكنه تعديلها وإضافة مكافآت جديدة من إعدادات المكتب</p>
              <div className="space-y-2.5">
                {REWARDS.map((r, i) => {
                  const canClaim = MY_STATS.xp >= r.xpCost && !r.claimed;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className={`flex items-center gap-4 p-4 rounded-xl border ${
                        r.claimed
                          ? isDark ? "border-emerald-700/20 bg-emerald-900/5" : "border-emerald-200 bg-emerald-50"
                          : canClaim
                            ? isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"
                            : isDark ? "border-white/[0.04]" : "border-zinc-100"
                      }`}>
                      <span className="text-2xl">{r.icon}</span>
                      <div className="flex-1">
                        <p className={`text-[13px] font-bold ${tp}`}>{r.name}</p>
                        <p className={`text-[10px] ${ts}`}>{r.xpCost.toLocaleString()} XP مطلوب</p>
                      </div>
                      {r.claimed ? (
                        <span className="text-[11px] font-bold text-emerald-500">✅ تم الاستلام</span>
                      ) : canClaim ? (
                        <button className="px-4 py-2 rounded-xl bg-royal text-white text-[11px] font-bold">
                          استلام المكافأة
                        </button>
                      ) : (
                        <span className={`text-[10px] ${ts}`}>🔒 تحتاج {(r.xpCost - MY_STATS.xp).toLocaleString()} XP إضافي</span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
