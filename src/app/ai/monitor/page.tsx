"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Bell, BookOpen, Lightning, ArrowSquareOut,
  FunnelSimple, MagnifyingGlass,
  CheckCircle, Warning, Buildings,
  Scales, Users, FileText, CaretDown,
  Robot, Sparkle, Gear, WhatsappLogo, Eye, EyeSlash, 
  Trash, Archive, Heart, ChatText, Article, AppWindow,
  Anchor, Check, ArrowCounterClockwise
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type Sector   = "all" | "labor" | "commercial" | "corporate" | "real_estate" | "tech" | "finance" | "maritime";

interface Update {
  id: number;
  date: string;
  authority: string;
  title: string;
  summary: string;
  impact: string;
  sector: Sector[];
  severity: Severity;
  actionRequired: boolean;
  source: string;
}

const SECTORS: { key: Sector; label: string; icon: any }[] = [
  { key: "all",          label: "الكل",              icon: Bell },
  { key: "labor",        label: "نظام العمل",        icon: Users },
  { key: "commercial",   label: "نظام التجارة",      icon: Buildings },
  { key: "corporate",    label: "نظام الشركات",      icon: FileText },
  { key: "real_estate",  label: "العقارات والإيجار", icon: Buildings },
  { key: "tech",         label: "تقنية المعلومات",   icon: Robot },
  { key: "finance",      label: "المالية والبنوك",   icon: Scales },
  { key: "maritime",     label: "بحري وجوي",          icon: Anchor },
];

const MOCK_UPDATES: Update[] = [
  {
    id: 1,
    date: "١٥ رمضان ١٤٤٦",
    authority: "وزارة الموارد البشرية",
    title: "تعديل المادة (٧٧) من نظام العمل — رفع حد التعويض",
    summary: "تم رفع سقف التعويض عن الفسخ التعسفي من أجر شهرَين إلى ثلاثة أشهر عن كل سنة خدمة، مع تحديد الحد الأدنى بشهر واحد بدلاً من نصف شهر.",
    impact: "جميع العقود الجارية تحتاج مراجعة بند التعويض — الشركات التي تحتفظ بعقود قياسية يجب تحديثها فوراً تجنباً للمطالبات المستقبلية.",
    sector: ["labor"],
    severity: "critical",
    actionRequired: true,
    source: "الجريدة الرسمية م.ر.ب — قرار ٢١٤",
  },
  {
    id: 2,
    date: "٩ رمضان ١٤٤٦",
    authority: "وزارة التجارة",
    title: "اشتراطات جديدة للوكالات التجارية الأجنبية",
    summary: "صدر نظام جديد يلزم الوكلاء التجاريين الأجانب بتسجيل عقودهم في منصة الوكالات خلال ٦٠ يوماً من الإبرام.",
    impact: "أي عقد وكالة تجارية أجنبية غير مسجل يُعد لاغياً ابتداءً من ١ ذو القعدة ١٤٤٦.",
    sector: ["commercial", "corporate"],
    severity: "high",
    actionRequired: true,
    source: "قرار وزير التجارة رقم ٤٣٢/٢٠٢٥",
  },
  {
    id: 3,
    date: "٢ رمضان ١٤٤٦",
    authority: "هيئة السوق المالية",
    title: "تعليمات تحديث عقود الاستثمار لصناديق الادخار",
    summary: "أصدرت هيئة السوق المالية تعليمات بتعديل عقود صناديق الادخار الخاصة لتشمل إفصاحات إضافية عن الرسوم والمخاطر.",
    impact: "صناديق الادخار الخاصة لديها مهلة حتى نهاية ربع القرن الأول لتحديث العقود.",
    sector: ["finance"],
    severity: "medium",
    actionRequired: false,
    source: "تعميم هيئة السوق المالية ت.ع.م-٢٠٢٥-١٢",
  },
  {
    id: 4,
    date: "٢٨ شعبان ١٤٤٦",
    authority: "الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)",
    title: "لائحة تنفيذية جديدة لنظام حماية البيانات PDPL",
    summary: "صدرت اللائحة التنفيذية التفصيلية لنظام حماية البيانات الشخصية موضحةً متطلبات الموافقة وآليات نقل البيانات خارج المملكة.",
    impact: "جميع عقود SaaS وعقود معالجة البيانات تحتاج تضمين بنود المعالج ومتطلبات التوطين.",
    sector: ["tech", "finance", "corporate"],
    severity: "high",
    actionRequired: true,
    source: "سدايا — مرسوم ملكي م/٢١",
  },
  {
    id: 5,
    date: "٢٢ شعبان ١٤٤٦",
    authority: "وزارة الإسكان — منصة إيجار",
    title: "تحديث نموذج عقد الإيجار الموحد",
    summary: "تم إدراج بنود جديدة في النموذج الموحد تتعلق بصيانة المكيفات وتكاليف النقل في حالة إخلاء العقار قبل الأوان.",
    impact: "تستخدم عقود الإيجار المحررة بعد ١ رمضان النموذج المحدث — العقود القديمة سارية لكن يُنصح بالتحديث.",
    sector: ["real_estate"],
    severity: "low",
    actionRequired: false,
    source: "منصة إيجار — منشور تشغيلي ١٤/٢٠٢٥",
  },
  {
    id: 6,
    date: "٢٠ شعبان ١٤٤٦",
    authority: "الهيئة العامة للنقل",
    title: "تحديث شروط ترخيص وسائط النقل البحري وكود السلامة",
    summary: "أصدرت الهيئة العامة للنقل البحري لائحة محدثة لاشتراطات السلامة والترخيص للسفن ووسائط النقل البحري بالمملكة لتتوافق مع كود السلامة الدولي.",
    impact: "جميع ملاك وسائط النقل والشركات الملاحية يجب أن توائم تراخيصها خلال ٩٠ يوماً للتوافق مع الإجراءات الدولية الجديدة.",
    sector: ["maritime"],
    severity: "high",
    actionRequired: true,
    source: "الهيئة العامة للنقل — تعميم بحري ٨/٢٠٢٥",
  },
];

const SEV_CONFIG: Record<Severity, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: "عاجل جداً", color: "text-red-500",    bg: "bg-red-500/10 border-red-500/25",     dot: "bg-red-500"    },
  high:     { label: "مهم",       color: "text-amber-500",   bg: "bg-amber-500/10 border-amber-500/25",  dot: "bg-amber-500"  },
  medium:   { label: "متوسط",     color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/25",    dot: "bg-blue-500"   },
  low:      { label: "للمعلومية", color: "text-zinc-500",    bg: "bg-zinc-500/10 border-zinc-500/25",    dot: "bg-zinc-400"   },
};

type ViewFilter = "all" | "unread" | "read" | "favorites" | "archived" | "deleted";

// ─── Components ───────────────────────────────────────────────────────────────

function UpdateCard({ 
  upd, isDark, 
  isRead, isFavorite, isArchived, isDeleted,
  onToggleRead, onToggleFavorite, onArchive, onRestoreArchive, onDelete, onRestoreDelete 
}: {
  upd: Update;
  isDark: boolean;
  isRead: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  onToggleRead: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onArchive: (id: number) => void;
  onRestoreArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onRestoreDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_CONFIG[upd.severity];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover="hover"
      className={`rounded-2xl border overflow-hidden shadow-sm transition-opacity relative group ${
        isRead
          ? isDark ? "bg-zinc-900/50 border-white/[0.04] opacity-70 hover:opacity-100" : "bg-zinc-50 border-zinc-100 opacity-60 hover:opacity-100"
          : isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70"
      }`}
    >
      {/* Severity strip + unread dot */}
      <div className="relative">
        <div className={`h-0.5 w-full transition-colors ${isRead ? "bg-zinc-300 dark:bg-zinc-800" : sev.dot}`} />
        {!isRead && !isDeleted && !isArchived && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1.5 end-3 h-2 w-2 rounded-full bg-blue-500 shadow ring-2 ring-white dark:ring-zinc-950" />
        )}
      </div>

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${isRead ? (isDark ? "bg-zinc-800 border-white/[0.05]" : "bg-zinc-100 border-zinc-200") : sev.bg}`}>
            <div className={`h-2.5 w-2.5 rounded-full transition-colors ${isRead ? (isDark ? "bg-zinc-600" : "bg-zinc-300") : sev.dot}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border transition-colors ${isRead ? (isDark ? "bg-zinc-800 border-white/[0.05] text-zinc-500" : "bg-zinc-100 border-zinc-200 text-zinc-400") : `${sev.bg} ${sev.color}`}`}>
                {sev.label}
              </span>
              {upd.actionRequired && !isDeleted && !isArchived && (
                <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 transition-colors ${isRead ? (isDark ? "bg-red-900/10 border-red-900/20 text-red-900" : "bg-red-50/50 border-red-100 text-red-300") : "bg-red-500/10 border-red-500/25 text-red-500"}`}>
                  يتطلب إجراء
                </span>
              )}
              {isFavorite && !isDeleted && !isArchived && (
                <span className="text-[10px] font-bold px-1 py-0.5 text-pink-500 flex items-center gap-1">
                  <Heart size={12} weight="fill" /> مفضلة
                </span>
              )}
              <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                {upd.date} · {upd.authority}
              </span>
            </div>
            <p className={`text-[13px] font-bold leading-snug transition-colors ${isRead ? (isDark ? "text-zinc-400" : "text-zinc-600") : (isDark ? "text-zinc-100" : "text-zinc-900")}`}>
              {upd.title}
            </p>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isArchived ? (
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onRestoreArchive(upd.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold transition-all">
                <ArrowCounterClockwise size={11} /> استعادة
              </motion.button>
            ) : isDeleted ? (
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onRestoreDelete(upd.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold transition-all">
                <ArrowCounterClockwise size={11} /> استعادة
              </motion.button>
            ) : (
              <>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onToggleFavorite(upd.id)} title="مفضلة" className={`p-1.5 rounded-lg transition-colors ${isFavorite ? "text-pink-500 bg-pink-500/10" : isDark ? "text-zinc-400 hover:text-pink-400 hover:bg-pink-500/10" : "text-zinc-400 hover:text-pink-500 hover:bg-pink-50"}`}>
                  <Heart size={15} weight={isFavorite ? "fill" : "regular"} />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onToggleRead(upd.id)} title={isRead ? "تعليم كغير مقروء" : "تعليم كمقروء"} className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"}`}>
                  {isRead ? <EyeSlash size={15} /> : <Eye size={15} />}
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onArchive(upd.id)} title="أرشفة" className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-400 hover:text-blue-400 hover:bg-white/[0.06]" : "text-zinc-400 hover:text-blue-600 hover:bg-zinc-100"}`}>
                  <Archive size={15} />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => onDelete(upd.id)} title="حذف" className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-400 hover:text-red-400 hover:bg-white/[0.06]" : "text-zinc-400 hover:text-red-500 hover:bg-zinc-100"}`}>
                  <Trash size={15} />
                </motion.button>
              </>
            )}
            
            <div className={`w-px h-5 mx-1 ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />
            
            <button onClick={() => { setExpanded(v => !v); if (!isRead && !isDeleted && !isArchived) onToggleRead(upd.id); }} className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isDark ? "bg-white/[0.06] hover:bg-white/10 text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"}`}>
              <CaretDown size={14} className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {/* Summary (always visible unless expanded overrides) */}
        {!expanded && (
          <p className={`mt-2 text-[12px] leading-relaxed line-clamp-2 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
            {upd.summary}
          </p>
        )}

        {/* Expanded detail */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 34 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                {/* Full summary */}
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {upd.summary}
                </p>

                {/* Impact */}
                <div className={`rounded-xl p-3 border ${isDark ? "border-amber-700/25 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-start gap-2">
                    <Lightning size={13} className="text-amber-500 flex-shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-500 mb-0.5">الأثر على العقود والممارسة</p>
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-700"}`}>{upd.impact}</p>
                    </div>
                  </div>
                </div>

                {/* AI Recommendation */}
                <div className={`rounded-xl p-3 border ${isDark ? "border-[#0B3D2E]/30 bg-[#0B3D2E]/10" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-start gap-2">
                    <Sparkle size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <p className="text-[10px] font-bold text-emerald-500 mb-0.5">توصية نظامي AI</p>
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-700"}`}>
                        الرجاء مراجعة الوثائق ذات الصلة بقطاع {upd.sector.join(" · ")} لضمان توافقها الكامل مع القواعد والأنظمة المحدثة فوراً.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Source */}
                <div className="flex items-center justify-between">
                  <p className={`text-[10px] font-mono ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
                    المرجع: {upd.source}
                  </p>
                  <button className={`flex items-center gap-1 text-[11px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"}`}>
                    فتح المصدر <ArrowSquareOut size={11} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Favorites Hub Module ─────────────────────────────────────────────────────

function FavoritesHub({ isDark }: { isDark: boolean }) {
  const cardStyle = isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200/70";
  
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      
      {/* Community Questions section */}
      <div>
        <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
          <ChatText className="text-blue-500" weight="fill" /> أسئلة المجتمع المحفوظة (٢)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`p-4 rounded-2xl border cursor-pointer hover:-translate-y-0.5 transition-transform ${cardStyle}`}>
            <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>كيفية صياغة الدفوع الشكلية في التدخل الهجومي؟</p>
            <p className={`text-[11px] line-clamp-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>أجاب المحامي فهد العتيبي بإجابة تفصيلية وحصلت على ١٥ إعجاب...</p>
          </div>
          <div className={`p-4 rounded-2xl border cursor-pointer hover:-translate-y-0.5 transition-transform ${cardStyle}`}>
            <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>تعويضات المطور العقاري في حال القوة القاهرة</p>
            <p className={`text-[11px] line-clamp-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>نقاش قانوني حول متى تعتبر جائحة مثل كورونا قوة قاهرة...</p>
          </div>
        </div>
      </div>

      {/* Blogs section */}
      <div>
        <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
          <Article className="text-emerald-500" weight="fill" /> المدونات والمقالات المحفوظة (١)
        </h3>
        <div className={`p-4 rounded-2xl border cursor-pointer hover:-translate-y-0.5 transition-transform flex gap-4 items-center ${cardStyle}`}>
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            <BookOpen size={24} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-500 mb-1 block">رأي قانوني</span>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>أثر اللائحة التنفيذية الجديدة لنظام المحاماة على المتدربين</p>
            <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>كتب بواسطة: فريق نظامي · قراءة (٥ دقائق)</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIMonitorPage() {
  const { isDark } = useTheme();
  
  // State
  const [sector, setSector] = useState<Sector>("all");
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set([2])); // Pre-favorited item
  const [archivedIds, setArchivedIds] = useState<Set<number>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set());
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  
  // Custom monitored sectors selection state
  const [monitoredSectors, setMonitoredSectors] = useState<Set<Sector>>(
    new Set(["labor", "commercial", "corporate", "real_estate", "tech", "finance", "maritime"])
  );

  // Handlers
  const toggleRead = (id: number) => setReadIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  
  const toggleFavorite = (id: number) => setFavoriteIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  
  const handleArchive = (id: number) => setArchivedIds(prev => new Set(prev).add(id));
  const handleDelete = (id: number) => setDeletedIds(prev => new Set(prev).add(id));

  const handleRestoreArchive = (id: number) => setArchivedIds(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  const handleRestoreDelete = (id: number) => setDeletedIds(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  // Compute updates list dynamically based on Archived/Deleted filters
  const activeUpdates = 
    viewFilter === "archived"
      ? MOCK_UPDATES.filter(u => archivedIds.has(u.id))
      : viewFilter === "deleted"
        ? MOCK_UPDATES.filter(u => deletedIds.has(u.id))
        : MOCK_UPDATES.filter(u => !deletedIds.has(u.id) && !archivedIds.has(u.id));

  const unreadCount = MOCK_UPDATES.filter(u => !deletedIds.has(u.id) && !archivedIds.has(u.id) && !readIds.has(u.id)).length;
  
  const finalFiltered = activeUpdates.filter(u => {
    // 1. View Filter (Top level tabs)
    if (viewFilter === "unread" && readIds.has(u.id)) return false;
    if (viewFilter === "read" && !readIds.has(u.id)) return false;
    if (viewFilter === "favorites" && !favoriteIds.has(u.id)) return false;
    
    // 2. Custom Monitored Sectors (Settings checkbox filtering)
    // If the update's sectors have zero overlap with our custom selection in settings, hide it
    const hasMonitoredSector = u.sector.some(sec => monitoredSectors.has(sec));
    if (!hasMonitoredSector) return false;
    
    // 3. Category & Search Filters
    const matchSector  = sector === "all" || u.sector.includes(sector);
    const matchSearch  = !search || u.title.includes(search) || u.summary.includes(search) || u.authority.includes(search);
    const matchSev     = sevFilter === "all" || u.severity === sevFilter;
    
    return matchSector && matchSearch && matchSev;
  });

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              <AppWindow className="text-[#C8A762]" weight="duotone" />
              راصد التشريعات الذكي
            </h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            رصد فوري وفلاتر متقدمة للتعديلات التشريعية مع أرشيفك الشخصي
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              settingsOpen
                ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                : isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]" : "border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <Gear size={13} />
            الإعدادات والتخصيص
          </button>
        </div>
      </div>

      {/* Settings & Customization Panel */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={`${card} p-5 shadow-sm space-y-5`}>
              {/* Specialized Category/Sector Selection Checklist */}
              <div className="space-y-2">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تخصيص مجالات الرصد الفوري</p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>اختر المجالات القانونية التي ترغب بمتابعتها في خلاصة التنبيهات (مثل التجاري، البحري... إلخ):</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {SECTORS.filter(s => s.key !== "all").map(s => {
                    const isSelected = monitoredSectors.has(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => {
                          setMonitoredSectors(prev => {
                            const next = new Set(prev);
                            if (next.has(s.key)) {
                              if (next.size > 1) next.delete(s.key);
                            } else {
                              next.add(s.key);
                            }
                            return next;
                          });
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                          isSelected
                            ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-sm"
                            : isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-500 hover:text-zinc-300" : "border-slate-200 bg-white text-zinc-500 hover:text-zinc-700"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                          isSelected ? "bg-white text-[#0B3D2E]" : "border-gray-300"
                        }`}>
                          {isSelected && <Check size={10} weight="bold" />}
                        </span>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`h-px w-full ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />

              {/* Notification Toggles */}
              <div className="space-y-3">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>إعدادات إشعارات البث المباشر</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <WhatsappLogo size={16} className="text-emerald-500" weight="fill" />
                    <div>
                      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>إشعارات واتسآب الفورية</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>استلام تحديثات التشريعات العاجلة مباشرة فور صدورها عبر الواتسآب</p>
                    </div>
                  </div>
                  <button onClick={() => setWhatsappEnabled(v => !v)} className={`relative h-6 w-11 rounded-full transition-colors ${whatsappEnabled ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${whatsappEnabled ? "start-5" : "start-0.5"}`} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top level View Tabs (Includes Archives & Trash) */}
      <div className={`p-1.5 rounded-2xl border inline-flex flex-wrap gap-1 ${isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-zinc-200/50"}`}>
        {[
          { id: "all",        label: "الكل" },
          { id: "unread",     label: `غير مقروء (${unreadCount})`, highlight: unreadCount > 0 },
          { id: "read",       label: "مقروء", icon: CheckCircle },
          { id: "favorites",  label: "المفضلة الشاملة", icon: Heart },
          { id: "archived",   label: "الأرشيف", icon: Archive },
          { id: "deleted",    label: "سلة المهملات", icon: Trash },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewFilter(tab.id as ViewFilter)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
              viewFilter === tab.id
                ? "bg-[#0B3D2E] text-white shadow-sm"
                : isDark ? "text-zinc-400 hover:text-white hover:bg-white/[0.05]" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            {tab.icon && <tab.icon size={14} className={tab.id === "favorites" && viewFilter === tab.id ? "text-pink-400" : ""} weight={tab.id === "favorites" && viewFilter === tab.id ? "fill" : "regular"} />}
            {tab.label}
            {tab.highlight && <span className={`h-1.5 w-1.5 rounded-full bg-blue-500 ${viewFilter === tab.id ? "bg-white" : ""}`} />}
          </button>
        ))}
      </div>

      {/* Filters Row (Hides when viewing Favorites, Archives or Trash to focus on saved content) */}
      <AnimatePresence>
        {viewFilter !== "favorites" && viewFilter !== "archived" && viewFilter !== "deleted" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {/* Sector filters */}
            <div className={`${card} p-3 shadow-sm mb-4`}>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {SECTORS.map(s => {
                  const Icon = s.icon;
                  // If this sector is unchecked in settings, we can style it differently or hide it
                  const isMonitored = monitoredSectors.has(s.key) || s.key === "all";
                  if (!isMonitored) return null;
                  
                  return (
                    <motion.button key={s.key} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => setSector(s.key)}
                      className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-colors ${sector === s.key ? "bg-[#0B3D2E] text-white shadow-sm" : isDark ? "bg-zinc-800 text-zinc-400 hover:text-white" : "bg-zinc-100/50 text-zinc-600 hover:bg-zinc-100 border border-transparent"}`}>
                      <Icon size={13} />
                      {s.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Search + severity filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MagnifyingGlass size={15} className={`absolute inset-y-0 end-3 my-auto ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                <input
                  type="text" placeholder="ابحث في التحديثات التشريعية..." value={search} onChange={e => setSearch(e.target.value)}
                  className={`w-full rounded-xl border pe-10 ps-4 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-700" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
                />
              </div>
              <div className="relative">
                <select
                  value={sevFilter} onChange={e => setSevFilter(e.target.value as typeof sevFilter)}
                  className={`appearance-none rounded-xl border px-4 py-2.5 text-[12px] font-semibold outline-none pr-8 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}
                >
                  <option value="all">كل المستويات</option>
                  <option value="critical">عاجل جداً</option>
                  <option value="high">مهم</option>
                  <option value="medium">متوسط</option>
                  <option value="low">للمعلومية</option>
                </select>
                <FunnelSimple size={12} className={`pointer-events-none absolute inset-y-0 end-3 my-auto ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      {viewFilter === "favorites" ? (
        <FavoritesHub isDark={isDark} />
      ) : (
        <div className="space-y-3 pt-2">
          {finalFiltered.length === 0 ? (
            <div className={`${card} p-12 text-center flex flex-col items-center justify-center`}>
              <div className={`p-4 rounded-full mb-3 ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                <Archive size={24} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
              </div>
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القائمة فارغة</p>
              <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                {viewFilter === "archived" ? "لا توجد أي تعديلات تشريعية في الأرشيف حالياً." : 
                 viewFilter === "deleted" ? "لا توجد تعديلات تشريعية في سلة المهملات." : 
                 "لا توجد تحديثات تشريعية تطابق الفلتر أو مجالات الرصد المحددة."}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {finalFiltered.map((upd) => (
                <UpdateCard 
                  key={upd.id} 
                  upd={upd} isDark={isDark} 
                  isRead={readIds.has(upd.id)} 
                  isFavorite={favoriteIds.has(upd.id)}
                  isArchived={archivedIds.has(upd.id)}
                  isDeleted={deletedIds.has(upd.id)}
                  onToggleRead={toggleRead} 
                  onToggleFavorite={toggleFavorite}
                  onArchive={handleArchive}
                  onRestoreArchive={handleRestoreArchive}
                  onDelete={handleDelete}
                  onRestoreDelete={handleRestoreDelete}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Footer tip */}
      <div className={`rounded-2xl p-4 border flex items-start gap-3 mt-8 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/[0.04]" : "border-amber-200/70 bg-amber-50/60"}`}>
        <Robot size={16} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="duotone" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          <strong className={isDark ? "text-zinc-300" : "text-zinc-700"}>نصيحة نظامي AI: </strong>
          يمكنك ربط راصد التشريعات بملفات عقودك في "محترف العقود" لمراجعة التوافق تلقائياً عند صدور أي تعديل تشريعي جديد. اضغط "إضافة للمفضلة" للرجوع السريع.
        </p>
      </div>
    </div>
  );
}
