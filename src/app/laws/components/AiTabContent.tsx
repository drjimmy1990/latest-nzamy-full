"use client";

/**
 * AiTabContent — نظامي AI مساعد قانوني ذكي
 * Design: DESIGN_VARIANCE=8, MOTION_INTENSITY=6, VISUAL_DENSITY=4
 * Font: Cairo (brand), IBM Plex Sans Arabic (body), JetBrains Mono (mono)
 * Colors: royal=#0B3D2E, gold=#C8A762, dark-bg=#0c0f12
 * Anti-patterns: No Inter, no centered hero, no 3-col cards, no neon glow
 */

import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  PaperPlaneTilt,
  Robot,
  User,
  Paperclip,
  WarningDiamond,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Books,
  Plus,
  PencilSimple,
  MagnifyingGlass,
  Scales,
  ChartLineUp,
  Translate,
  Notebook,
  Sparkle,
  Trash,
  X,
  CheckCircle,
  ChatCircleDots,
  SidebarSimple,
  ArrowRight,
} from "@phosphor-icons/react";

// ─── Brand Design Tokens ──────────────────────────────────────────────────────
const ROYAL = "#0B3D2E";
const GOLD  = "#C8A762";
const GOLD_DARK = "#b08f4a";

// ─── Types ────────────────────────────────────────────────────────────────────
type MsgRole = "user" | "ai" | "system";

interface Msg {
  id: string;
  role: MsgRole;
  text: string;
  time: string;
  sources?: string[];
}

interface Conv {
  id: string;
  title: string;
  date: Date;
  msgs: Msg[];
}

// ─── Quick Actions — نظامي's actual services ──────────────────────────────────
const QUICK_ACTIONS = [
  {
    id: "consult",
    icon: ChatCircleDots,
    label: "استشارة قانونية",
    sub: "فورية بناءً على أنظمة المملكة",
    prompt: "أحتاج استشارة قانونية حول: ",
    gradient: `linear-gradient(135deg, ${ROYAL}, #1a6b50)`,
    accent: "#4ade80",
  },
  {
    id: "contract",
    icon: PencilSimple,
    label: "صغ عقد أو مذكرة",
    sub: "صياغة احترافية بالذكاء الاصطناعي",
    prompt: "ساعدني في صياغة عقد/مذكرة قانونية احترافية حول: ",
    gradient: "linear-gradient(135deg, #1e3a5f, #2d5f8a)",
    accent: "#60a5fa",
  },
  {
    id: "review",
    icon: MagnifyingGlass,
    label: "راجع عقداً",
    sub: "تحليل البنود وكشف المخاطر",
    prompt: "حلّل هذا العقد وأبرز البنود الخطرة والمخاطر القانونية: ",
    gradient: "linear-gradient(135deg, #3b1f6a, #5a3298)",
    accent: "#a78bfa",
  },
  {
    id: "litigation",
    icon: Scales,
    label: "مسار قضائي",
    sub: "تقييم فرص القضية واستراتيجيتها",
    prompt: "قيّم فرص قضيتي القانونية وساعدني في وضع الاستراتيجية المناسبة: ",
    gradient: "linear-gradient(135deg, #7c2d12, #c2410c)",
    accent: "#fb923c",
  },
  {
    id: "library",
    icon: Books,
    label: "ابحث في المكتبة",
    sub: "نصوص الأنظمة والمبادئ القضائية",
    prompt: "ابحث في المكتبة القانونية عن: ",
    gradient: "linear-gradient(135deg, #134e4a, #0f766e)",
    accent: "#2dd4bf",
  },
  {
    id: "corporate",
    icon: ChartLineUp,
    label: "تأسيس وهيكلة",
    sub: "الشركات والمشاريع التجارية",
    prompt: "أحتاج مساعدة قانونية لتأسيس/هيكلة مشروع/شركة: ",
    gradient: "linear-gradient(135deg, #92400e, #b45309)",
    accent: GOLD,
  },
  {
    id: "translate",
    icon: Translate,
    label: "ترجم مستنداً",
    sub: "ترجمة قانونية دقيقة المصطلحات",
    prompt: "ترجم النص القانوني التالي مع الحفاظ على الدقة الاصطلاحية: ",
    gradient: "linear-gradient(135deg, #1e3a5f, #155e75)",
    accent: "#38bdf8",
  },
  {
    id: "summary",
    icon: Notebook,
    label: "لخّص حكماً",
    sub: "استخلاص المبادئ من الأحكام",
    prompt: "لخّص هذا الحكم القضائي واستخلص المبادئ القانونية المستفادة: ",
    gradient: "linear-gradient(135deg, #312e81, #4338ca)",
    accent: "#818cf8",
  },
] as const;

// ─── Mock AI Response ─────────────────────────────────────────────────────────
function mockAI(q: string): { text: string; sources: string[] } {
  void q;
  return {
    text: `بناءً على منظومة الأنظمة السعودية المحدّثة في مكتبة نظامي، إليك تحليلاً شاملاً:\n\n**الإطار النظامي الحاكم**\nيندرج هذا الموضوع ضمن نطاق نظام العمل الصادر بالمرسوم الملكي م/51 لعام 1426هـ، إذ تنصّ المواد من (73) إلى (81) على الضوابط المتعلقة بهذه المسألة.\n\n**الشروط الجوهرية**\n• الركن المادي: إثبات وقوع الفعل أو الامتناع الضار.\n• الركن المعنوي: التعمّد أو الإهمال الجسيم.\n• علاقة السببية: الرابط المباشر بين الفعل والضرر.\n\n**موقف القضاء**\nاستقرّ قضاء المحكمة العمالية ومحاكم الاستئناف على اشتراط توافر هذه العناصر مجتمعةً قبل الحكم بالتعويض.\n\n**التوصية**\nيُنصح بتوثيق جميع المراسلات وضمّ الإثباتات قبل المضيّ في الإجراء القانوني. هل تودّ أن أساعدك في صياغة المذكرة؟`,
    sources: [
      "نظام العمل م/51 · المادة 77",
      "لائحة العمل التنفيذية · الباب الخامس",
      "مبادئ المحكمة العمالية العليا",
    ],
  };
}

// ─── Streaming Text (Isolated) ────────────────────────────────────────────────
const StreamingText = memo(function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 4)); i += 4; }
      else { setShown(text); clearInterval(iv); }
    }, 14);
    return () => clearInterval(iv);
  }, [text]);
  return <span className="whitespace-pre-wrap leading-[1.8]">{shown}</span>;
});

// ─── Thinking Indicator (Isolated) ───────────────────────────────────────────
const ThinkingIndicator = memo(function ThinkingIndicator({ isDark }: { isDark: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="flex items-start gap-3"
    >
      {/* AI Avatar */}
      <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-xl flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${ROYAL}, #1a6b50)` }}>
        <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
          <Robot size={14} weight="duotone" style={{ color: GOLD }} />
        </motion.div>
      </div>
      <div className={`rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] ${
        isDark ? "bg-dark-card border border-white/[0.06]" : "bg-white border border-slate-100 shadow-sm"
      }`}>
        <div className="flex items-center gap-1.5">
          {[0, 0.18, 0.36].map((d, i) => (
            <motion.span key={i} className="block h-1.5 w-1.5 rounded-full"
              style={{ background: GOLD }}
              animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: d }} />
          ))}
        </div>
      </div>
    </motion.div>
  );
});

// ─── Message Bubble ───────────────────────────────────────────────────────────
const MsgBubble = memo(function MsgBubble({
  msg, isDark, isLatest,
}: { msg: Msg; isDark: boolean; isLatest: boolean }) {
  const [copied, setCopied] = useState(false);

  if (msg.role === "system") return (
    <div className="flex justify-center py-2">
      <span className={`text-[10px] tracking-wide rounded-full px-3.5 py-1 font-medium ${
        isDark ? "bg-white/[0.04] text-white/30" : "bg-slate-100 text-slate-400"
      }`}>{msg.text}</span>
    </div>
  );

  const isUser = msg.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shadow-sm ${
        isUser
          ? isDark ? "bg-white/10" : "bg-slate-800"
          : ""
      }`}
        style={!isUser ? { background: `linear-gradient(135deg, ${ROYAL}, #1a6b50)` } : undefined}>
        {isUser
          ? <User size={13} weight="fill" className={isDark ? "text-white/70" : "text-white"} />
          : <Robot size={13} weight="duotone" style={{ color: GOLD }} />
        }
      </div>

      {/* Content */}
      <div className={`max-w-[84%] flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <span className="text-[9px] font-bold tracking-widest uppercase px-0.5" style={{ color: GOLD }}>نظامي AI</span>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl text-[13px] leading-[1.75] ${
          isUser
            ? "px-4 py-3 text-white rounded-tr-sm"
            : isDark
              ? "px-4 py-3.5 rounded-tl-sm border border-white/[0.07] bg-dark-card text-gray-200"
              : "px-4 py-3.5 rounded-tl-sm border border-slate-100 bg-white text-slate-800 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"
        }`}
          style={isUser ? { background: `linear-gradient(135deg, ${ROYAL} 0%, #1a6b50 100%)` } : undefined}
          dir="rtl"
        >
          {isUser
            ? msg.text
            : isLatest
              ? <StreamingText text={msg.text} />
              : <span className="whitespace-pre-wrap leading-[1.8]">{msg.text}</span>
          }
        </div>

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`w-full rounded-xl px-3.5 py-2.5 text-[11px] border ${
              isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50/80"
            }`}
          >
            <p className={`flex items-center gap-1.5 font-semibold mb-1.5 ${isDark ? "text-white/40" : "text-slate-400"}`}>
              <Books size={10} /> المصادر
            </p>
            {msg.sources.map((s, i) => (
              <p key={i} className={`flex items-center gap-1 ${isDark ? "text-white/30" : "text-slate-400"}`}>
                <span className="h-0.5 w-2 rounded-full inline-block flex-shrink-0" style={{ background: GOLD }} />
                {s}
              </p>
            ))}
          </motion.div>
        )}

        {/* Actions */}
        <div className={`flex items-center gap-3 px-0.5 text-[10px] ${isDark ? "text-white/20" : "text-slate-300"}`}>
          <span className="font-mono">{msg.time}</span>
          {!isUser && (
            <>
              <button
                onClick={() => { navigator.clipboard.writeText(msg.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className={`flex items-center gap-1 transition-colors ${isDark ? "hover:text-white/50" : "hover:text-slate-500"}`}
              >
                {copied ? <CheckCircle size={9} style={{ color: "#4ade80" }} /> : <Copy size={9} />}
                {copied ? "تم" : "نسخ"}
              </button>
              <button className="hover:text-emerald-400 transition-colors"><ThumbsUp size={9} /></button>
              <button className="hover:text-rose-400 transition-colors"><ThumbsDown size={9} /></button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// ─── Conversation List Item ───────────────────────────────────────────────────
const ConvItem = memo(function ConvItem({
  conv, isActive, onSelect, onDelete, isDark,
}: { conv: Conv; isActive: boolean; onSelect: () => void; onDelete: () => void; isDark: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onSelect}
      className={`relative group flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 ${
        isActive
          ? isDark ? "bg-white/[0.07]" : "bg-royal/[0.06]"
          : isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-100/80"
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeConvBg"
          className="absolute inset-0 rounded-xl border pointer-events-none"
          style={{ borderColor: `${GOLD}30` }}
        />
      )}
      <ChatCircleDots
        size={12}
        weight={isActive ? "fill" : "regular"}
        style={isActive ? { color: GOLD } : undefined}
        className={`flex-shrink-0 ${!isActive && (isDark ? "text-white/30" : "text-slate-400")}`}
      />
      <span className={`flex-1 text-[11.5px] truncate font-medium ${
        isActive
          ? isDark ? "text-white" : "text-royal"
          : isDark ? "text-white/50" : "text-slate-500"
      }`}>
        {conv.title}
      </span>
      <AnimatePresence>
        {hovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className={`flex-shrink-0 p-1 rounded-md transition-colors ${isDark ? "hover:bg-white/[0.08] text-white/30 hover:text-rose-400" : "hover:bg-rose-50 text-slate-300 hover:text-rose-400"}`}
          >
            <Trash size={10} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Welcome Screen ───────────────────────────────────────────────────────────
const WelcomeScreen = memo(function WelcomeScreen({
  isDark, onAction,
}: { isDark: boolean; onAction: (prompt: string) => void }) {

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 24 } },
  };

  return (
    <div className="flex-1 overflow-y-auto" dir="rtl">
      <div className="mx-auto max-w-2xl px-5 pt-8 pb-6">

        {/* Hero — Left-aligned, asymmetric (DESIGN_VARIANCE=8: Anti-center bias) */}
        <div className="flex items-start gap-4 mb-8">
          {/* Logo block */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            className="relative flex-shrink-0"
          >
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${ROYAL} 0%, #1a6b50 100%)`, boxShadow: `0 12px 32px -8px ${ROYAL}60` }}>
              <Robot size={26} weight="duotone" style={{ color: GOLD }} />
            </div>
            {/* Pulse dot */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2"
              style={{ borderColor: isDark ? "#0c0f12" : "#f9fafb" }}
            />
          </motion.div>

          <div>
            <motion.h2
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="text-lg font-bold tracking-tight"
              style={{ fontFamily: "var(--font-brand)", color: isDark ? "#fff" : ROYAL }}
            >
              نظامي AI — مساعدك القانوني
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
              className={`text-[12.5px] mt-0.5 leading-snug max-w-[36ch] ${isDark ? "text-white/40" : "text-slate-400"}`}
            >
              مدرَّب على كامل المكتبة القانونية السعودية — الأنظمة، المبادئ، والسوابق القضائية
            </motion.p>
          </div>
        </div>

        {/* Divider */}
        <motion.div
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.22, duration: 0.4 }}
          className="h-px mb-7 origin-right"
          style={{ background: `linear-gradient(to left, ${GOLD}40, transparent)` }}
        />

        {/* Quick Actions Grid — 2-col asymmetric (DESIGN_VARIANCE=8: No 3-col) */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.26 }}
          className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-white/25" : "text-slate-400"}`}
        >
          ابدأ بسرعة
        </motion.p>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-2"
        >
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.id}
                variants={itemVariants}
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97, y: 0 }}
                onClick={() => onAction(action.prompt)}
                className={`group relative flex items-start gap-3 rounded-2xl p-3.5 text-start transition-all duration-200 overflow-hidden border ${
                  isDark
                    ? "border-white/[0.06] bg-dark-card hover:border-white/[0.12]"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.08)]"
                }`}
              >
                {/* Subtle gradient bg on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                  style={{ background: `${action.gradient.replace("linear-gradient(135deg, ", "linear-gradient(135deg, ").split(")")[0]})`.replace("linear-gradient(135deg, ", "").split(",")[0] + "08)" }} />

                {/* Icon */}
                <div className="relative flex-shrink-0 h-8 w-8 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                  style={{ background: action.gradient }}>
                  <Icon size={15} weight="duotone" className="text-white" />
                </div>

                {/* Text */}
                <div className="relative min-w-0">
                  <p className={`text-[12px] font-bold leading-tight mb-0.5 ${isDark ? "text-white/85" : "text-slate-800"}`}>
                    {action.label}
                  </p>
                  <p className={`text-[10px] leading-snug ${isDark ? "text-white/30" : "text-slate-400"}`}>
                    {action.sub}
                  </p>
                </div>

                {/* Arrow (appears on hover) */}
                <motion.div
                  initial={{ opacity: 0, x: 4 }} whileHover={{ opacity: 1, x: 0 }}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                >
                  <ArrowRight size={12} style={{ color: action.accent }} className="rotate-180" />
                </motion.div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Bottom hint */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className={`text-center text-[10px] mt-5 ${isDark ? "text-white/15" : "text-slate-300"}`}
        >
          أو اكتب سؤالك مباشرةً في حقل الإدخال أدناه
        </motion.p>
      </div>
    </div>
  );
});

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function ConvSidebar({
  convs, activeId, onSelect, onNew, onDelete, isDark, open, onToggle,
}: {
  convs: Conv[]; activeId: string | null;
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
  isDark: boolean; open: boolean; onToggle: () => void;
}) {
  const now = new Date();
  const todayStr = now.toDateString();
  const ystStr = new Date(now.getTime() - 86400000).toDateString();

  const groups = [
    { label: "اليوم", items: convs.filter(c => new Date(c.date).toDateString() === todayStr) },
    { label: "أمس", items: convs.filter(c => new Date(c.date).toDateString() === ystStr) },
    { label: "سابقاً", items: convs.filter(c => {
      const d = new Date(c.date).toDateString();
      return d !== todayStr && d !== ystStr;
    }) },
  ].filter(g => g.items.length > 0);

  return (
    <motion.div
      animate={{ width: open ? 210 : 52 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`relative flex-shrink-0 flex flex-col h-full overflow-hidden border-e ${
        isDark ? "bg-[#0e1a14] border-white/[0.05]" : "bg-[#eef7f2] border-slate-200/60"
      }`}
      dir="rtl"
    >
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center h-12 px-3 border-b ${
        isDark ? "border-white/[0.05]" : "border-slate-200/60"
      }`}>
        {open && (
          <motion.span
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`flex-1 text-[11px] font-bold tracking-wide ${isDark ? "text-white/40" : "text-slate-400"}`}
          >
            المحادثات
          </motion.span>
        )}
        <button
          onClick={onToggle}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${
            isDark ? "text-white/30 hover:text-white/60 hover:bg-white/[0.06]" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          }`}
        >
          <SidebarSimple size={14} weight={open ? "fill" : "regular"} />
        </button>
      </div>

      {/* New Chat Button */}
      <div className={`flex-shrink-0 p-2 border-b ${isDark ? "border-white/[0.05]" : "border-slate-200/60"}`}>
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={onNew}
          className={`w-full flex items-center rounded-xl transition-all duration-200 ${
            open ? "gap-2.5 px-3 py-2" : "justify-center px-2 py-2"
          } ${
            isDark
              ? "bg-white/[0.05] hover:bg-white/[0.09] text-white/60 hover:text-white"
              : "bg-white hover:bg-royal hover:text-white text-slate-600 border border-slate-200 hover:border-royal shadow-sm"
          }`}
          style={{}}
        >
          <Plus size={13} weight="bold" />
          {open && <span className="text-[11.5px] font-semibold">محادثة جديدة</span>}
        </motion.button>
      </div>

      {/* Conversation List */}
      {open && (
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {convs.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`text-center py-8 text-[10.5px] ${isDark ? "text-white/20" : "text-slate-300"}`}>
              لا توجد محادثات
            </motion.div>
          ) : (
            groups.map(group => (
              <div key={group.label} className="mb-2">
                <p className={`text-[9px] font-bold uppercase tracking-widest px-3 mb-1 ${isDark ? "text-white/20" : "text-slate-300"}`}>
                  {group.label}
                </p>
                <AnimatePresence>
                  {group.items.map(c => (
                    <ConvItem key={c.id} conv={c} isActive={c.id === activeId}
                      onSelect={() => onSelect(c.id)}
                      onDelete={() => onDelete(c.id)}
                      isDark={isDark} />
                  ))}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Input Bar ────────────────────────────────────────────────────────────────
function InputBar({
  value, onChange, onSend, isThinking, isDark, onQuickAction,
}: {
  value: string; onChange: (v: string) => void; onSend: () => void;
  isThinking: boolean; isDark: boolean; onQuickAction: (p: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showQuick, setShowQuick] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 130) + "px";
    }
  }, [value]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
    if (e.key === "Escape") setShowQuick(false);
  }

  const canSend = value.trim().length > 0 && !isThinking;

  return (
    <div className={`flex-shrink-0 px-4 pb-3 pt-2.5 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`} dir="rtl">

      {/* File chip */}
      <AnimatePresence>
        {file && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className={`flex items-center gap-2 mb-2 rounded-xl px-3 py-2 text-[11px] w-fit ${
              isDark ? "bg-white/[0.05] border border-white/[0.08] text-white/50" : "bg-slate-100 text-slate-500 border border-slate-200"
            }`}>
            <Paperclip size={10} style={{ color: GOLD }} />
            <span className="max-w-[180px] truncate font-mono">{file}</span>
            <button onClick={() => setFile(null)} className="hover:text-rose-400 transition-colors"><X size={9} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input container — Liquid glass style */}
      <div className={`relative flex items-end gap-2 rounded-2xl border px-3.5 py-2.5 transition-all duration-200 ${
        isDark
          ? "border-white/[0.08] bg-dark-card hover:border-white/[0.12] focus-within:border-[rgba(200,167,98,0.3)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "border-slate-200 bg-white hover:border-slate-300 focus-within:border-[rgba(11,61,46,0.3)] focus-within:shadow-[0_2px_16px_-4px_rgba(11,61,46,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]"
      }`}>

        {/* File upload */}
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f.name); }} />
        <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
          onClick={() => fileRef.current?.click()}
          title="رفع مستند"
          className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isDark ? "text-white/25 hover:text-gold" : "text-slate-300 hover:text-royal"}`}>
          <Paperclip size={15} />
        </motion.button>

        {/* Quick actions trigger */}
        <div className="relative flex-shrink-0">
          <motion.button
            whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
            onClick={() => setShowQuick(p => !p)}
            title="أوامر سريعة"
            className={`p-1 rounded-lg transition-colors ${
              showQuick ? "text-gold" : isDark ? "text-white/25 hover:text-gold" : "text-slate-300 hover:text-royal"
            }`}
          >
            <Sparkle size={15} weight={showQuick ? "fill" : "regular"} />
          </motion.button>

          {/* Quick Menu Popup */}
          <AnimatePresence>
            {showQuick && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 8 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`absolute bottom-full mb-2 right-0 w-60 rounded-2xl border overflow-hidden z-50 ${
                  isDark
                    ? "bg-dark-card border-white/[0.08] shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]"
                    : "bg-white border-slate-200 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.8)]"
                }`}
                dir="rtl"
              >
                <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-white/25" : "text-slate-300"}`}>
                    أوامر سريعة
                  </span>
                  <button onClick={() => setShowQuick(false)} className={isDark ? "text-white/20 hover:text-white/50" : "text-slate-300 hover:text-slate-500"}>
                    <X size={10} />
                  </button>
                </div>
                <div className="p-1.5">
                  {QUICK_ACTIONS.map(action => {
                    const Icon = action.icon;
                    return (
                      <motion.button
                        key={action.id}
                        whileHover={{ x: -2 }}
                        onClick={() => { onQuickAction(action.prompt); setShowQuick(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors ${
                          isDark ? "hover:bg-white/[0.05] text-white/60 hover:text-white/90" : "hover:bg-slate-50 text-slate-600 hover:text-slate-800"
                        }`}
                      >
                        <div className="flex-shrink-0 h-6 w-6 rounded-lg flex items-center justify-center"
                          style={{ background: action.gradient }}>
                          <Icon size={12} weight="duotone" className="text-white" />
                        </div>
                        <span className="text-[11.5px] font-medium">{action.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="اسأل عن أي موضوع قانوني في المكتبة..."
          rows={1}
          dir="rtl"
          className={`flex-1 resize-none bg-transparent text-[13px] outline-none leading-relaxed font-body ${
            isDark ? "text-white/85 placeholder:text-white/20" : "text-slate-800 placeholder:text-slate-300"
          }`}
          style={{ maxHeight: 130, fontFamily: "var(--font-body)" }}
        />

        {/* Send button — Magnetic-style */}
        <motion.button
          whileHover={canSend ? { scale: 1.08 } : {}}
          whileTap={canSend ? { scale: 0.93 } : {}}
          onClick={onSend}
          disabled={!canSend}
          className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200"
          style={{
            background: canSend ? `linear-gradient(135deg, ${ROYAL}, #1a6b50)` : isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9",
            boxShadow: canSend ? `0 4px 14px -4px ${ROYAL}70` : "none",
          }}
        >
          <PaperPlaneTilt
            size={13} weight="fill"
            className={canSend ? "text-white" : isDark ? "text-white/15" : "text-slate-300"}
          />
        </motion.button>
      </div>

      {/* Disclaimer */}
      <div className={`flex items-center justify-center gap-1.5 mt-1.5 text-[9.5px] ${isDark ? "text-white/15" : "text-slate-300"}`}>
        <WarningDiamond size={8} />
        الإجابات استرشادية ولا تُعدّ استشارة قانونية رسمية
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface AiTabContentProps {
  isDark: boolean;
  isRTL: boolean;
}

export function AiTabContent({ isDark }: AiTabContentProps) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConv = convs.find(c => c.id === activeId);
  const msgs = activeConv?.msgs ?? [];
  const hasRealMsgs = msgs.some(m => m.role !== "system");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, isThinking]);

  function nowStr() {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function startConv(): string {
    const id = `conv-${Date.now()}`;
    const sys: Msg = {
      id: `sys-${id}`,
      role: "system",
      text: `نظامي AI · ${new Date().toLocaleDateString("ar-SA-u-nu-latn")}`,
      time: "",
    };
    setConvs(prev => [{
      id, title: "محادثة جديدة",
      date: new Date(), msgs: [sys],
    }, ...prev]);
    setActiveId(id);
    return id;
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || isThinking) return;
    setInput("");

    let cid = activeId;
    if (!cid) { cid = startConv(); await new Promise(r => setTimeout(r, 60)); }

    const uMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: q, time: nowStr() };

    setConvs(prev => prev.map(c => c.id === cid
      ? { ...c, title: q.slice(0, 38) + (q.length > 38 ? "..." : ""), msgs: [...c.msgs, uMsg] }
      : c
    ));
    setIsThinking(true);
    await new Promise(r => setTimeout(r, 1600 + Math.random() * 600));

    const { text: aiText, sources } = mockAI(q);
    const aMsg: Msg = { id: `a-${Date.now()}`, role: "ai", text: aiText, time: nowStr(), sources };

    setConvs(prev => prev.map(c => c.id === cid ? { ...c, msgs: [...c.msgs, aMsg] } : c));
    setIsThinking(false);
  }

  function deleteConv(id: string) {
    setConvs(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 26 }}
      className={`flex rounded-2xl overflow-hidden border ${
        isDark
          ? "border-white/[0.06] bg-dark-bg shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-20px_rgba(0,0,0,0.6)]"
          : "border-slate-200/80 bg-slate-50 shadow-[0_8px_40px_-12px_rgba(11,61,46,0.12),inset_0_1px_0_rgba(255,255,255,0.8)]"
      }`}
      style={{ height: "72vh", minHeight: 520 }}
      dir="rtl"
    >
      {/* ── Conversation Sidebar ──────────────────────────────────────────── */}
      <ConvSidebar
        convs={convs} activeId={activeId}
        onSelect={id => setActiveId(id)}
        onNew={() => setActiveId(null)}
        onDelete={deleteConv}
        isDark={isDark} open={sidebarOpen}
        onToggle={() => setSidebarOpen(p => !p)}
      />

      {/* ── Chat Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header bar */}
        <div className={`flex-shrink-0 flex items-center justify-between px-4 h-12 border-b ${
          isDark ? "border-white/[0.05]" : "border-slate-200/60"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${ROYAL}, #1a6b50)` }}>
              <Robot size={13} weight="duotone" style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-[12px] font-bold tracking-tight"
                style={{ fontFamily: "var(--font-brand)", color: isDark ? "#fff" : ROYAL }}>
                {activeConv && hasRealMsgs ? activeConv.title : "نظامي AI"}
              </p>
              <p className={`text-[9px] ${isDark ? "text-white/25" : "text-slate-400"}`}>مساعد قانوني ذكي</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online pill */}
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold ${
              isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
            }`}>
              <motion.div
                animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 2.2, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              />
              متصل
            </div>
            {/* New chat */}
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.92 }}
              onClick={() => setActiveId(null)}
              title="محادثة جديدة"
              className={`p-1.5 rounded-xl transition-colors ${
                isDark ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-slate-400 hover:text-royal hover:bg-slate-100"
              }`}
            >
              <Plus size={14} weight="bold" />
            </motion.button>
          </div>
        </div>

        {/* Messages / Welcome */}
        <AnimatePresence mode="wait">
          {!hasRealMsgs ? (
            <WelcomeScreen key="welcome" isDark={isDark} onAction={p => setInput(p)} />
          ) : (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 overflow-y-auto"
              dir="rtl"
            >
              <div className="px-5 py-5 space-y-5 max-w-2xl mx-auto">
                {msgs.map((msg, i) => (
                  <MsgBubble
                    key={msg.id}
                    msg={msg}
                    isDark={isDark}
                    isLatest={i === msgs.length - 1 && msg.role === "ai"}
                  />
                ))}
                <AnimatePresence>
                  {isThinking && <ThinkingIndicator key="think" isDark={isDark} />}
                </AnimatePresence>
                <div ref={bottomRef} className="h-1" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <InputBar
          value={input}
          onChange={setInput}
          onSend={() => send()}
          isThinking={isThinking}
          isDark={isDark}
          onQuickAction={p => setInput(p)}
        />
      </div>
    </motion.div>
  );
}
