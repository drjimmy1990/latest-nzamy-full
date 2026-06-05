"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  Users, UserPlus, ArrowsLeftRight, HandCoins,
  Clock, CheckCircle, X, Plus, Briefcase,
  Buildings, CaretLeft, ArrowUpRight, Star,
  ShieldCheck, Lightning, Globe, Info, MagicWand, Hourglass, Warning
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRole = "trainee" | "admin_assistant" | "part_time_lawyer";
type SecondmentStatus = "active" | "pending" | "completed";
type ReferralStatus = "pending" | "accepted" | "paid";

interface TeamMember {
  id: string; name: string; role: MemberRole;
  avatar: string; cases: number; joinedAt: string;
  isOnline: boolean; currentTask?: string;
}
interface Secondment {
  id: string; lawyerName: string; company: string;
  startDate: string; endDate: string; status: SecondmentStatus;
  monthlyFee: string;
}
interface Referral {
  id: string; clientName: string; toLaywer: string;
  caseType: string; commission: string; status: ReferralStatus;
  date: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<MemberRole, { label: string; color: string; bg: string }> = {
  trainee:          { label: "متدرب",           color: "text-blue-500",    bg: "bg-blue-500/10" },
  admin_assistant:  { label: "مساعد إداري",     color: "text-amber-500",   bg: "bg-amber-500/10" },
  part_time_lawyer: { label: "محامٍ جزئي",       color: "text-emerald-500", bg: "bg-emerald-500/10" },
};

const MOCK_TEAM: TeamMember[] = [
  { id: "m1", name: "نورة القحطاني", role: "part_time_lawyer", avatar: "ن", cases: 4, joinedAt: "يناير ٢٠٢٦", isOnline: true, currentTask: "صياغة عقد عمل" },
  { id: "m2", name: "علي المطيري",   role: "trainee",          avatar: "ع", cases: 1, joinedAt: "مارس ٢٠٢٦", isOnline: false, currentTask: "مراجعة قضية تجارية" },
];

const MOCK_SECONDMENTS: Secondment[] = [
  { id: "s1", lawyerName: "نورة القحطاني", company: "مجموعة الذهبي التجارية", startDate: "يناير ٢٠٢٦", endDate: "يونيو ٢٠٢٦", status: "active", monthlyFee: "٨,٠٠٠ ر.س" },
];

const MOCK_REFERRALS: Referral[] = [
  { id: "r1", clientName: "أحمد الزاهد", toLaywer: "م. خالد العتيبي", caseType: "تجاري", commission: "٢,٠٠٠ ر.س", status: "accepted", date: "أبريل ٢٠٢٦" },
  { id: "r2", clientName: "سارة الدوسري", toLaywer: "م. ريم المطيري", caseType: "أحوال شخصية", commission: "١,٥٠٠ ر.س", status: "pending", date: "مايو ٢٠٢٦" },
];

// ─── Perpetual Motion Helpers ─────────────────────────────────────────────────

// Spring settings for premium feel
const springy = { type: "spring", stiffness: 100, damping: 20 };

// Liquid Glass Refraction Class
const glassRefraction = (isDark: boolean) => 
  isDark 
    ? "bg-zinc-900/60 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" 
    : "bg-white/80 backdrop-blur-md border border-slate-200/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_40px_-15px_rgba(0,0,0,0.05)]";

// ─── Intelligent Activity Stream (Perpetual Animation) ──────────────────────

function LiveActivityStream({ isDark }: { isDark: boolean }) {
  const [items, setItems] = useState([
    { id: 1, text: "نورة حدثت جلسة 'نزاع تجاري'", time: "الآن" },
    { id: 2, text: "اكتملت إحالة سارة الدوسري", time: "٢د" },
    { id: 3, text: "علي رفع مستند 'لائحة اعتراضية'", time: "١٥د" },
  ]);

  // Simulate perpetual AI sorting/updating
  useEffect(() => {
    const interval = setInterval(() => {
      setItems(prev => {
        const arr = [...prev];
        const last = arr.pop();
        if (last) arr.unshift(last);
        return arr;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`p-5 rounded-[2rem] overflow-hidden relative ${glassRefraction(isDark)}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>نبض الفريق</h3>
        </div>
        <Globe size={14} className={isDark ? "text-zinc-600" : "text-slate-300"} />
      </div>
      
      <div className="relative h-[120px]">
        <AnimatePresence>
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1 - (i * 0.3), y: i * 40, scale: 1 - (i * 0.05) }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={springy}
              className={`absolute top-0 w-full p-3 rounded-2xl flex items-center justify-between border ${isDark ? "bg-zinc-800/80 border-white/5" : "bg-white border-slate-100"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Lightning size={12} weight="fill" className="text-amber-500 flex-shrink-0" />
                <p className={`text-[11px] font-semibold truncate ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.text}</p>
              </div>
              <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.time}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Fade mask at bottom */}
      <div className={`absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t pointer-events-none ${isDark ? "from-zinc-900/60 to-transparent" : "from-white/80 to-transparent"}`} />
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, isDark }: { onClose: () => void; isDark: boolean }) {
  const [role, setRole] = useState<MemberRole>("trainee");
  const [done, setDone] = useState(false);
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: -20 }} transition={springy}
        className={`w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative ${isDark ? "bg-zinc-900 border border-white/10" : "bg-white border border-slate-200"}`}>
        
        {/* Decorative ambient light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 rounded-full blur-[50px] pointer-events-none" />

        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 relative z-10">
            <motion.div 
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <CheckCircle size={32} weight="fill" className="text-emerald-500" />
            </motion.div>
            <p className={`font-bold text-lg mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>تم الإرسال بنجاح</p>
            <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>تم إرسال دعوة الانضمام لشبكتك، سيظهر العضو فور قبوله.</p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl bg-zinc-100 text-zinc-900 text-[13px] font-bold hover:bg-zinc-200 transition-colors">العودة للوحة</button>
          </motion.div>
        ) : (
          <div className="space-y-6 relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-800"}`}>دعوة عضو جديد</h3>
                <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Solo+ Mode Role-Based Access</p>
              </div>
              <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}><X size={14} weight="bold" /></button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-[11px] font-bold mb-2 uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-slate-400"}`}>البريد الإلكتروني</label>
                <input type="email" placeholder="lawyer@example.com"
                  className={`w-full rounded-2xl border px-4 py-3.5 text-[14px] outline-none transition-all focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 ${isDark ? "border-white/10 bg-zinc-800/50 text-white" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-bold mb-2 uppercase tracking-wide ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مستوى الصلاحية (RBAC)</label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.entries(ROLE_CONFIG) as [MemberRole, typeof ROLE_CONFIG[MemberRole]][]).map(([k, cfg]) => {
                    const isSel = role === k;
                    return (
                      <button key={k} onClick={() => setRole(k)}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                          isSel ? `border-emerald-500/30 ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}` : `${isDark ? 'border-white/5 hover:border-white/10' : 'border-slate-100 hover:border-slate-300'}`
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                            <ShieldCheck size={16} className={cfg.color} weight={isSel ? "fill" : "regular"} />
                          </div>
                          <div className="text-right">
                            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{cfg.label}</p>
                            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              {k === 'trainee' ? 'قراءة فقط + إضافة مسودات' : k === 'admin_assistant' ? 'تحميل مستندات + إدارة الجلسات' : 'صلاحيات تعديل شبه كاملة'}
                            </p>
                          </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSel ? 'border-emerald-500' : isDark ? 'border-zinc-700' : 'border-slate-300'}`}>
                          {isSel && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            
            <button onClick={() => setDone(true)} 
              className="w-full py-3.5 rounded-2xl bg-[#0B3D2E] text-[#C8A762] text-[14px] font-bold hover:bg-[#0a3328] transition-transform active:scale-[0.98] flex items-center justify-center gap-2">
              <MagicWand size={16} weight="duotone" /> إرسال دعوة الانضمام
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabKey = "team" | "secondments" | "referrals";

export default function NetworkPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<TabKey>("team");
  const [showInvite, setShowInvite] = useState(false);

  const TABS: { key: TabKey; label: string; icon: typeof Users; count?: number }[] = [
    { key: "team",        label: "فريقي المصغر",  icon: Users,           count: MOCK_TEAM.length },
    { key: "secondments", label: "الإعارات",       icon: Buildings,       count: MOCK_SECONDMENTS.length },
    { key: "referrals",   label: "الإحالات",       icon: HandCoins,       count: MOCK_REFERRALS.length },
  ];

  return (
    <div className="min-h-[100dvh] max-w-[1400px] mx-auto p-4 md:p-8" dir="rtl">

      {/* بيانات تجريبية Banner */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>شبكة العمل والإحالات — قريباً</p>
        </div>
      </motion.div>

      
      {/* ── Asymmetric Hero Section ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={springy}
        className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
        <div className="max-w-[65ch]">
          <h1 className={`text-4xl md:text-5xl tracking-tighter leading-none font-bold mb-4 ${isDark ? "text-white" : "text-slate-900"}`}
              style={{ fontFamily: "var(--font-brand)" }}>شبكة التعاون.</h1>
          <p className={`text-base leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            مساحتك المركزية لإدارة الاقتصاد القانوني التشاركي. أدِر فريقك المصغر (Solo+ Mode)، تابع الإعارات النشطة، وراقب إحالاتك وعمولاتك بدقة وشفافية تامة.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/marketplace/collaborate"
            className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all hover:-translate-y-1 ${glassRefraction(isDark)} ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            <Globe size={16} weight="duotone" className="text-royal" /> سوق التعاون
          </Link>
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-all hover:-translate-y-1 shadow-lg shadow-[#0B3D2E]/20">
            <UserPlus size={16} weight="bold" /> دعوة عضو
          </button>
        </div>
      </motion.div>

      {/* ── Bento 2.0 Layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Main Content Tabs (Width: 8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* Futuristic Tabs */}
          <div className="flex gap-2">
            {TABS.map(t => {
              const isActive = tab === t.key;
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative flex items-center gap-2 px-5 py-3 rounded-full text-[13px] font-bold transition-all ${
                    isActive ? isDark ? "text-zinc-900" : "text-white" : isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                  }`}>
                  {isActive && (
                    <motion.div layoutId="active-tab-bento" className={`absolute inset-0 rounded-full ${isDark ? "bg-white" : "bg-slate-900"}`} transition={springy} />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon size={16} weight={isActive ? "fill" : "duotone"} />
                    {t.label}
                    {t.count !== undefined && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        isActive ? isDark ? "bg-zinc-800 text-white" : "bg-white/20 text-white" : isDark ? "bg-white/10 text-zinc-300" : "bg-slate-100 text-slate-500"
                      }`}>{t.count}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`p-6 sm:p-8 rounded-[2.5rem] ${glassRefraction(isDark)} min-h-[400px]`}>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }} transition={springy}>
                
                {/* ── TEAM CONTENT ── */}
                {tab === "team" && (
                  <div className="space-y-4">
                    {MOCK_TEAM.length === 0 ? (
                      <div className="py-20 flex flex-col items-center text-center">
                        <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mb-6 rotate-12 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                          <Users size={40} weight="duotone" className="text-emerald-500" />
                        </div>
                        <h3 className={`text-xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>اللوحة القماشية فارغة</h3>
                        <p className={`text-sm max-w-sm mb-6 leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>قم ببناء فريقك المصغر لدعمك في المهام الإدارية والقانونية. استغل قوة العمل التشاركي.</p>
                        <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-6 py-3 rounded-full border border-emerald-500/30 text-emerald-600 bg-emerald-500/10 font-bold hover:bg-emerald-500/20 transition-all text-sm">
                          إضافة أول عضو
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MOCK_TEAM.map((m, i) => {
                          const roleCfg = ROLE_CONFIG[m.role];
                          return (
                            <motion.div key={m.id} layoutId={`member-${m.id}`}
                              className={`p-5 rounded-[2rem] border transition-all hover:-translate-y-1 hover:shadow-xl ${isDark ? "border-white/5 bg-zinc-800/40 hover:bg-zinc-800/80" : "border-slate-100 bg-white hover:border-slate-200 shadow-sm"}`}>
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold ${isDark ? "bg-zinc-700 text-zinc-200" : "bg-slate-100 text-slate-700"}`}>
                                      {m.avatar}
                                    </div>
                                    {/* Online indicator */}
                                    {m.isOnline && (
                                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
                                    )}
                                  </div>
                                  <div>
                                    <h4 className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.name}</h4>
                                    <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${roleCfg.bg} ${roleCfg.color}`}>{roleCfg.label}</span>
                                  </div>
                                </div>
                                <Link href={`/dashboard/lawyer/cases?team=${m.id}`} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}>
                                  <ArrowUpRight size={14} className={isDark ? "text-zinc-400" : "text-slate-600"} />
                                </Link>
                              </div>
                              <div className="space-y-3">
                                <div className={`flex items-center justify-between text-[11px] pb-3 border-b ${isDark ? "border-white/5 text-zinc-400" : "border-slate-100 text-slate-500"}`}>
                                  <span>القضايا المشتركة</span>
                                  <span className="font-mono font-bold text-[13px]">{m.cases}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <Info size={14} className={`mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                                    {m.isOnline ? `يعمل الآن على: ${m.currentTask}` : `آخر ظهور: منذ ٤ ساعات`}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                        {/* Add Card */}
                        <motion.div layout onClick={() => setShowInvite(true)}
                          className={`p-5 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-full min-h-[200px] ${isDark ? "border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5" : "border-slate-200 hover:border-emerald-500 hover:bg-emerald-50"}`}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                            <Plus size={20} className={isDark ? "text-zinc-400" : "text-slate-400"} />
                          </div>
                          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>أضف عضواً جديداً</p>
                          <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>وسّع شبكتك التشاركية</p>
                        </motion.div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── SECONDMENTS CONTENT ── */}
                {tab === "secondments" && (
                  <div className="space-y-4">
                    {MOCK_SECONDMENTS.map((s, i) => (
                      <motion.div key={s.id} layoutId={`sec-${s.id}`}
                        className={`p-5 rounded-[2rem] border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-lg ${isDark ? "border-white/5 bg-zinc-800/40" : "border-slate-100 bg-white"}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 ${isDark ? "bg-teal-500/10" : "bg-teal-50"}`}>
                            <Buildings size={24} className="text-teal-500" weight="duotone" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{s.company}</h4>
                              <span className={`text-[9px] uppercase tracking-wide font-black px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                                {s.status}
                              </span>
                            </div>
                            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إعارة: {s.lawyerName}</p>
                            <div className={`flex items-center gap-2 mt-2 text-[10px] font-mono ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              <Clock size={12} /> {s.startDate} → {s.endDate}
                            </div>
                          </div>
                        </div>
                        <div className={`md:text-left p-3 rounded-2xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                          <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>العائد الشهري</p>
                          <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>{s.monthlyFee}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* ── REFERRALS CONTENT ── */}
                {tab === "referrals" && (
                  <div className="space-y-4">
                    {MOCK_REFERRALS.map((r, i) => (
                      <motion.div key={r.id} layoutId={`ref-${r.id}`}
                        className={`p-5 rounded-[2rem] border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-lg ${isDark ? "border-white/5 bg-zinc-800/40" : "border-slate-100 bg-white"}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
                            <HandCoins size={24} className="text-amber-500" weight="duotone" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-[15px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{r.clientName}</h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{r.caseType}</span>
                            </div>
                            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إلى: {r.toLaywer}</p>
                            <div className={`flex items-center gap-2 mt-2 text-[10px] font-mono ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              <Hourglass size={12} /> أُحيلت في: {r.date}
                            </div>
                          </div>
                        </div>
                        <div className={`md:text-left flex items-center md:items-start flex-row-reverse md:flex-col justify-between p-3 rounded-2xl ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                          <div className="text-left">
                             <p className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>العمولة المتوقعة</p>
                             <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>{r.commission}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                            r.status === "paid" ? "bg-emerald-500/15 text-emerald-500" :
                            r.status === "accepted" ? "bg-blue-500/15 text-blue-500" :
                            "bg-amber-500/15 text-amber-500"
                          }`}>{r.status === "paid" ? "مدفوعة" : r.status === "accepted" ? "مقبولة" : "قيد المعالجة"}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT COLUMN: Perpetual Widgets (Width: 4 cols) */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Bento KPI Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-5 rounded-[2rem] flex flex-col justify-between h-[140px] ${glassRefraction(isDark)}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <Star size={16} weight="duotone" className="text-amber-500" />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono tracking-tighter ${isDark ? "text-white" : "text-slate-800"}`}>٣,٥٠٠</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ر.س عمولات الشهر</p>
              </div>
            </div>
            <div className={`p-5 rounded-[2rem] flex flex-col justify-between h-[140px] ${glassRefraction(isDark)}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
                <Buildings size={16} weight="duotone" className="text-teal-500" />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono tracking-tighter ${isDark ? "text-white" : "text-slate-800"}`}>١</p>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إعارات نشطة</p>
              </div>
            </div>
          </div>

          {/* AI Activity Stream */}
          <LiveActivityStream isDark={isDark} />

          {/* Quick Actions Panel */}
          <div className={`p-5 rounded-[2rem] ${glassRefraction(isDark)}`}>
            <h3 className={`text-[12px] font-bold uppercase tracking-wider mb-4 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>أدوات سريعة</h3>
            <div className="space-y-2">
              <Link href="/ai/templates?group=collaboration" className={`flex items-center gap-3 p-3 rounded-2xl transition-all hover:translate-x-1 ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-slate-50 hover:bg-slate-100"}`}>
                <div className="w-8 h-8 rounded-xl bg-royal/10 flex items-center justify-center text-royal">
                  <Briefcase size={16} weight="duotone" />
                </div>
                <div>
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>قوالب العقود التشاركية</p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>صيغ للإعارة والإحالات</p>
                </div>
              </Link>
            </div>
          </div>

        </div>

      </div>

      <AnimatePresence>
        {showInvite && <InviteModal onClose={() => setShowInvite(false)} isDark={isDark} />}
      </AnimatePresence>
    </div>
  );
}
