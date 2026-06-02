"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";

import { useRouter } from "next/navigation";
import {
  Plus, DotsThree, ListDashes, PresentationChart,
  Clock, Warning, CheckSquare,
  WhatsappLogo, Kanban, CirclesFour,
  Funnel, Archive, UserCircle, CalendarBlank, SquaresFour,
  Checks, Calendar, ChartPieSlice, ShieldCheck
} from "@phosphor-icons/react";

import CaseGraphView from "./CaseGraphView";

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
type UserType = "corporate" | "lawyer";
type ViewMode = "board" | "list" | "timeline" | "graph";

interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

interface KanbanCard {
  id: string;
  title: string;
  dept: string;
  lawyer: { name: string; avatar: string; color: string } | null;
  dueDate: string; /* ISO or relative for mock */
  isExpiringSoon: boolean;
  priority: Priority;
  tag: string;
  checklist: ChecklistItem[];
  blocker?: string | null;
}

interface Column {
  id: string;
  title: string;
  color: string;
}

// ── Configurations ─────────────────────────────────────────────────────────────

const CORP_COLUMNS: Column[] = [
  { id: "c_new", title: "طلبات الإدارات", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "c_review", title: "مراجعة قانونية", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { id: "c_sign", title: "توقيع", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { id: "c_done", title: "حفظ", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

const LAWYER_COLUMNS: Column[] = [
  { id: "l_study", title: "دراسة وبحث", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "l_draft", title: "صياغة مذكرات", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { id: "l_sessions", title: "جلسات قادمة", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { id: "l_done", title: "استئناف / تنفيذ", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

const MOCK_CARDS: Record<string, KanbanCard[]> = {
  // Corporate mock data
  c_new: [
    {
      id: "card-1", title: "تجديد عقد الإيجار - فرع الرياض", dept: "الإدارة العامة", 
      lawyer: null, dueDate: "٢٠ أبريل", isExpiringSoon: false, priority: "medium", tag: "عقود",
      checklist: [{ id: 1, text: "مراجعة بنود الفسخ", done: false }, { id: 2, text: "التأكد من السعر", done: false }]
    }
  ],
  c_review: [
    {
      id: "card-3", title: "صياغة لائحة العمل الداخلية المحدثة", dept: "الموارد البشرية", 
      lawyer: { name: "هند", avatar: "هـ", color: "from-pink-500 to-rose-400" }, dueDate: "غداً", isExpiringSoon: true, priority: "high", tag: "عمالي",
      checklist: [{ id: 1, text: "اعتماد المدير التنفيذي", done: true }, { id: 2, text: "رفعها في منصة قوى", done: false }]
    }
  ],
  c_sign: [],
  c_done: [],
  
  // Lawyer mock data
  l_study: [
    {
      id: "card-4", title: "نزاع مقاولة مع شركة البناء (دراسة البنود)", dept: "—", 
      lawyer: { name: "فهد", avatar: "ف", color: "from-blue-600 to-blue-400" }, dueDate: "١٢ مايو", isExpiringSoon: false, priority: "high", tag: "مدني",
      checklist: [{ id: 1, text: "مراجعة تقرير الخبير الهندسي", done: false }]
    }
  ],
  l_draft: [
    {
      id: "card-5", title: "لائحة اعتراضية على حكم ابتدائي", dept: "—", 
      lawyer: { name: "حسين", avatar: "ح", color: "from-emerald-600 to-emerald-400" }, dueDate: "بعد ٢٤ ساعة", isExpiringSoon: true, priority: "high", tag: "تجاري",
      checklist: [{ id: 1, text: "صياغة الدفوع", done: true }, { id: 2, text: "التدقيق اللغوي", done: false }],
      blocker: "محظورة: بانتظار تحويل رسوم الاستئناف من الموكل"
    }
  ],
  l_sessions: [],
  l_done: []
};

const PRIORITY_STYLE: Record<Priority, string> = {
  high: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
};
const PRIORITY_AR: Record<Priority, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

// ── Card component ─────────────────────────────────────────────────────────────

function KCard({
  card, isDark, colId, 
  onDragStart, whatsappEnabled
}: {
  card: KanbanCard; isDark: boolean; colId: string;
  onDragStart: (e: React.DragEvent, cardId: string, fromColId: string) => void;
  whatsappEnabled: boolean;
}) {
  const completedTasks = card.checklist.filter(c => c.done).length;
  const totalTasks = card.checklist.length;
  const router = useRouter();
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id, colId)}
      onClick={() => router.push(`/dashboard/business/cases/${card.id}`)}
      className={`rounded-2xl border p-4 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group ${
        isDark ? "border-white/[0.06] bg-zinc-800/70 hover:bg-zinc-800" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      {/* Priority + tag */}
      <div className="mb-2.5 flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[card.priority]}`}>
            {PRIORITY_AR[card.priority]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 text-zinc-500"}`}>
            {card.tag}
          </span>
        </div>
        
        {card.lawyer && (
          <div title={card.lawyer.name} className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${card.lawyer.color} text-[10px] font-bold text-white shadow-sm ring-2 ${isDark ? "ring-zinc-900" : "ring-white"}`}>
            {card.lawyer.avatar}
          </div>
        )}
      </div>

      {/* Title */}
      <p className={`text-[13px] font-semibold leading-snug ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{card.title}</p>

      {/* Blocker Alert */}
      {card.blocker && (
        <div className={`mt-2 flex items-start gap-1.5 rounded-lg p-2 text-[10px] font-bold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-100"}`}>
          <Warning size={12} className="flex-shrink-0 mt-0.5" weight="fill" />
          <span>{card.blocker}</span>
        </div>
      )}

      {/* Meta info layout */}
      <div className="mt-3 flex items-center justify-between border-t pt-3 flex-wrap gap-2">
        <div className={`flex items-center gap-1 text-[10px] font-semibold ${card.isExpiringSoon ? "text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-md" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          <Clock size={12} weight={card.isExpiringSoon ? "bold" : "regular"} />
          {card.dueDate}
        </div>

        {totalTasks > 0 && (
          <div className={`flex items-center gap-1 text-[10px] font-semibold ${completedTasks === totalTasks ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            <CheckSquare size={12} weight={completedTasks === totalTasks ? "fill" : "regular"} />
            {completedTasks}/{totalTasks}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BusinessKanbanPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  
  // States
  // Reads ?role=lawyer URL param to support dual-role lawyers; defaults to "corporate"
  const [userType, setUserType] = useState<UserType>("corporate");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("role") === "lawyer") setUserType("lawyer");
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [cards, setCards] = useState<Record<string, KanbanCard[]>>(MOCK_CARDS);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  
  // New Filters State
  const [activeFilter, setActiveFilter] = useState("all"); // 'all', 'eisenhower', 'active', 'done', 'blocked', 'this_week', 'this_month', 'team'
  const [isArchiveMode, setIsArchiveMode] = useState(false);
  
  // Drag state
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedFromCol, setDraggedFromCol] = useState<string | null>(null);
  const [hoveredColId, setHoveredColId] = useState<string | null>(null);

  const columns = userType === "corporate" ? CORP_COLUMNS : LAWYER_COLUMNS;
  const surface = isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-slate-50";

  const totalActive = Object.entries(cards)
    .filter(([k]) => k !== "c_done" && k !== "l_done")
    .reduce((s, [k, v]) => columns.some(c => c.id === k) ? s + v.length : s, 0);

  // ── Drag Handlers ──
  const handleDragStart = (e: React.DragEvent, cardId: string, fromColId: string) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedCardId(cardId);
    setDraggedFromCol(fromColId);
    
    // Create a ghost image if needed, or default is fine
    const target = e.target as HTMLElement;
    target.style.opacity = "0.5";
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = "1";
    setDraggedCardId(null);
    setDraggedFromCol(null);
    setHoveredColId(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (hoveredColId !== colId) {
      setHoveredColId(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, toColId: string) => {
    e.preventDefault();
    setHoveredColId(null);
    
    if (!draggedCardId || !draggedFromCol || draggedFromCol === toColId) return;

    setCards(prev => {
      const next = { ...prev };
      const fromCards = [...(next[draggedFromCol] || [])];
      const toCards = [...(next[toColId] || [])];
      
      const cardIndex = fromCards.findIndex(c => c.id === draggedCardId);
      if (cardIndex > -1) {
        const [cardToMove] = fromCards.splice(cardIndex, 1);
        toCards.push(cardToMove);
        next[draggedFromCol] = fromCards;
        next[toColId] = toCards;
      }
      return next;
    });
    
    // Simulate WhatsApp notification if moving to critical stages
    if (whatsappEnabled && (toColId === "c_review" || toColId === "l_draft")) {
      // Mock notification logic
      // alert("تم إرسال إشعار واتسآب لعضو الفريق: مهمة جديدة بانتظار المراجعة.");
    }
  };

  if (!mounted) return null;

  return (
    <SubscriptionGuard featureKey="kanban">
    <main className={`min-h-screen py-8 px-4 ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`} dir="rtl">
        <div className="mx-auto max-w-[1400px] px-4">

          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className={`font-brand text-2xl font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                  <Kanban size={24} weight="duotone" className="text-[#C8A762]" />
                  مساحة العمل القانونية
                </h1>
              </div>
              <p className={`mt-0.5 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {totalActive} قضية نشطة · قم بسحب البطاقات (Drag & Drop) لتحديث حالتها
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* WhatsApp Toggle */}
              <button 
                onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition-all ${
                  whatsappEnabled 
                  ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" 
                  : isDark ? "bg-zinc-800 border-zinc-700 text-zinc-400" : "bg-white border-zinc-200 text-zinc-400"
                }`}
              >
                <WhatsappLogo size={14} weight="fill" />
                إشعار الفريق
              </button>
              
              {/* View Toggles */}
              <div className={`flex items-center rounded-xl border p-1 ${isDark ? "bg-zinc-900 border-zinc-800" : "bg-zinc-100 border-zinc-200"}`}>
                <button onClick={() => setViewMode("board")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${viewMode === "board" ? (isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm") : "text-zinc-500 hover:text-zinc-700" }`}>
                  <Kanban size={14} /> الكانبان
                </button>
                <button onClick={() => setViewMode("graph")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${viewMode === "graph" ? "bg-[#0B3D2E] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700" }`}>
                  <CirclesFour size={14} /> اللوحة البصرية (الجراف)
                </button>
                <button onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${viewMode === "list" ? (isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm") : "text-zinc-500 hover:text-zinc-700" }`}>
                  <ListDashes size={14} /> القائمة
                </button>
                <button onClick={() => setViewMode("timeline")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${viewMode === "timeline" ? (isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm") : "text-zinc-500 hover:text-zinc-700" }`}>
                  <PresentationChart size={14} /> التسلسل الزمني
                </button>
              </div>

              <Link href="/dashboard/business/cases/new" className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] hover:bg-[#082a20] transition-colors px-4 py-2.5 text-sm font-semibold text-white">
                <Plus size={15} /> قضية و ملف جديد
              </Link>
            </div>
          </div>

          {/* ── ADVANCED FILTERS ROW ── */}
          <div className={`mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b pb-4 ${isDark ? "border-white/[0.04]" : "border-zinc-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isDark ? "bg-white/[0.03] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                <Funnel size={14} /> تصفية:
              </div>

              {[
                { id: "all",         label: "الكل",           icon: null,                        activeClass: "bg-[#0B3D2E] text-white border-transparent shadow-sm" },
                { id: "eisenhower",  label: "مصفوفة أيزنهاور", icon: <SquaresFour size={14} />,   activeClass: "bg-[#C8A762] text-white border-transparent shadow-sm" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFilter(f.id); setIsArchiveMode(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    activeFilter === f.id && !isArchiveMode
                      ? f.activeClass
                      : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10 hover:bg-white/[0.02]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {f.icon}{f.label}
                </button>
              ))}

              <div className={`h-4 w-px mx-1 ${isDark ? "bg-white/10" : "bg-zinc-300"}`} />

              {[
                { id: "active",    label: "جاري العمل", activeClass: "bg-amber-500 text-white border-transparent shadow-sm" },
                { id: "done",      label: "منتهية",       activeClass: "bg-emerald-500 text-white border-transparent shadow-sm" },
                { id: "blocked",   label: "معلقة",        activeClass: "bg-orange-500 text-white border-transparent shadow-sm" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFilter(f.id); setIsArchiveMode(false); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    activeFilter === f.id && !isArchiveMode
                      ? f.activeClass
                      : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10" : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  {f.label}
                </button>
              ))}

              <div className={`h-4 w-px mx-1 ${isDark ? "bg-white/10" : "bg-zinc-300"}`} />

              {[
                { id: "this_week", label: "هذا الأسبوع", icon: <CalendarBlank size={14} />, activeClass: "bg-blue-500 text-white border-transparent shadow-sm" },
                { id: "team",      label: "الفريق",         icon: <UserCircle size={14} />,   activeClass: "bg-purple-500 text-white border-transparent shadow-sm" },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFilter(f.id); setIsArchiveMode(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    activeFilter === f.id && !isArchiveMode
                      ? f.activeClass
                      : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10" : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  {f.icon}{f.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setIsArchiveMode(true); setActiveFilter(""); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isArchiveMode
                  ? "bg-zinc-800 text-zinc-100 border-zinc-700 shadow-sm"
                  : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              }`}
            >
              <Archive size={16} /> الفهرس والأرشيف <span className="text-[10px] bg-zinc-500/20 px-1.5 py-0.5 rounded">14</span>
            </button>
          </div>

          {/* Conditional Rendering based on ViewMode */}
          {viewMode === "board" && (
            /* ── HTML5 Drag & Drop Board ── */
            <div className={`grid gap-4 ${activeFilter === "eisenhower" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
              {activeFilter === "eisenhower" ? (
                // ── Eisenhower Matrix View ──
                [
                  { id: "e1", title: "هام وعاجل (افعلها فوراً)",     color: "bg-red-500/10 text-red-600 dark:text-red-400",    filterFn: (c: KanbanCard) => c.priority === "high" && c.isExpiringSoon },
                  { id: "e2", title: "هام وغير عاجل (جدولها)",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", filterFn: (c: KanbanCard) => c.priority === "high" && !c.isExpiringSoon },
                  { id: "e3", title: "غير هام وعاجل (فوضها)",        color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", filterFn: (c: KanbanCard) => c.priority !== "high" && c.isExpiringSoon },
                  { id: "e4", title: "غير هام وغير عاجل (اتركها)",     color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400", filterFn: (c: KanbanCard) => c.priority !== "high" && !c.isExpiringSoon },
                ].map(quadrant => {
                  const allCards = Object.values(cards).flat();
                  const qCards = allCards.filter(quadrant.filterFn);
                  return (
                    <div key={quadrant.id} className="flex flex-col gap-3 rounded-3xl p-4 border border-dashed transition-colors" style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
                      <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 border ${surface}`}>
                         <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: quadrant.color.split(' ')[0].replace('bg-', '') }}></div>
                         <h3 className={`font-bold text-sm ${quadrant.color.split(' ')[1]}`}>{quadrant.title}</h3>
                         <span className={`ms-auto text-xs font-semibold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{qCards.length}</span>
                      </div>
                      <div className="space-y-3 min-h-[150px] grid grid-cols-1 xl:grid-cols-2 gap-3 items-start content-start">
                        {qCards.map(card => (
                          <div className="w-full" key={card.id}>
                            <KCard card={card} isDark={isDark} colId={columns.find(c => cards[c.id]?.some(cd => cd.id === card.id))?.id || "unknown"} onDragStart={handleDragStart} whatsappEnabled={whatsappEnabled} />
                          </div>
                        ))}
                        {qCards.length === 0 && <div className={`col-span-full flex h-24 items-center justify-center text-[11px] font-semibold ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>فارغ المربع</div>}
                      </div>
                    </div>
                  );
                })
              ) : (
                // ── Standard Kanban View ──
                columns.map(col => {
                  let colCards = cards[col.id] || [];
                  const isHovered = hoveredColId === col.id;
                  
                  // Apply Filters
                  if (isArchiveMode) {
                    colCards = []; // If we are in archive mode, hide all from active board (or show mock archive)
                  } else {
                    if (activeFilter === "active") colCards = colCards.filter(c => col.id !== "c_done" && col.id !== "l_done");
                    else if (activeFilter === "done") colCards = colCards.filter(c => col.id === "c_done" || col.id === "l_done");
                    else if (activeFilter === "blocked") colCards = colCards.filter(c => !!c.blocker);
                    else if (activeFilter === "this_week") colCards = colCards.filter(c => c.isExpiringSoon);
                    else if (activeFilter === "team") colCards = colCards.filter(c => c.lawyer !== null);
                  }
                  
                  return (
                    <div 
                      key={col.id} 
                      className={`flex flex-col gap-3 rounded-3xl p-2 transition-colors ${isHovered ? (isDark ? "bg-white/5" : "bg-slate-100") : "bg-transparent"}`}
                      onDragOver={(e) => handleDragOver(e, col.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, col.id)}
                    >
                      {/* Column header */}
                      <div className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 ${surface}`}>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${col.color}`}>
                            {col.title}
                          </span>
                          <span className={`text-xs font-semibold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            {colCards.length}
                          </span>
                        </div>
                        <button className={`rounded-lg p-1 transition-colors ${isDark ? "hover:bg-white/[0.05] text-zinc-500" : "hover:bg-slate-100 text-zinc-400"}`}>
                          <DotsThree size={16} weight="bold" />
                        </button>
                      </div>

                      {/* Cards Container */}
                      <div className="space-y-3 min-h-[150px]">
                        {colCards.map(card => (
                          <KCard
                            key={card.id}
                            card={card}
                            isDark={isDark}
                            colId={col.id}
                            onDragStart={handleDragStart}
                            whatsappEnabled={whatsappEnabled}
                          />
                        ))}
                        {colCards.length === 0 && (
                          <div className={`flex h-24 items-center justify-center rounded-2xl border border-dashed text-[11px] font-semibold ${isHovered ? "border-blue-500 text-blue-500" : isDark ? "border-white/[0.05] text-zinc-700" : "border-slate-200 text-zinc-400"}`}>
                            {isHovered ? "أفلت البطاقة هنا" : "اسحب بطاقة هنا"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "graph" && (
            /* ── Obsidian-Style Visual Graph View ── */
            <div className={`h-[70vh] rounded-3xl border overflow-hidden relative shadow-inner ${isDark ? "border-white/[0.06] bg-[#0c0c0e]" : "border-zinc-200 bg-[#fafafa]"}`}>
              <CaseGraphView isDark={isDark} isGlobal={true} />
            </div>
          )}

          {viewMode === "list" && (() => {
            const allCards = columns.flatMap(col =>
              (cards[col.id] || []).map(c => ({ ...c, colTitle: col.title, colColor: col.color }))
            );
            return (
              <div className={`rounded-3xl border overflow-hidden shadow-sm ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-zinc-200 bg-white"}`}>
                <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                  <div className="flex items-center gap-2">
                    <ListDashes size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                    <span className={`font-bold text-[14px] ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>كل القضايا</span>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 font-bold ${isDark ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>{allCards.length}</span>
                  </div>
                </div>
                {allCards.length === 0 ? (
                  <div className="py-16 text-center">
                    <ListDashes size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                    <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد بطاقات</p>
                  </div>
                ) : (
                  <div className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
                    {/* Header row */}
                    <div className={`hidden md:grid grid-cols-12 gap-4 px-6 py-2.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      <span className="col-span-4">العنوان</span>
                      <span className="col-span-2">المرحلة</span>
                      <span className="col-span-2">الأولوية</span>
                      <span className="col-span-2">الموعد</span>
                      <span className="col-span-2">المحامي</span>
                    </div>
                    {allCards.map((card) => (
                      <div key={card.id}
                        onClick={() => {}}
                        className={`grid grid-cols-12 gap-4 items-center px-6 py-3.5 cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-50/80"}`}
                      >
                        <div className="col-span-12 md:col-span-4">
                          <div className="flex items-start gap-2">
                            <div>
                              <p className={`text-[13px] font-semibold leading-snug ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{card.title}</p>
                              {card.blocker && (
                                <div className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>
                                  <Warning size={10} /><span>محظورة</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${card.colColor}`}>{card.colTitle}</span>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[card.priority]}`}>{PRIORITY_AR[card.priority]}</span>
                        </div>
                        <div className={`col-span-6 md:col-span-2 flex items-center gap-1 text-[11px] font-medium ${
                          card.isExpiringSoon ? "text-red-500" : isDark ? "text-zinc-500" : "text-zinc-400"
                        }`}>
                          <Clock size={11} />{card.dueDate}
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          {card.lawyer ? (
                            <div className="flex items-center gap-2">
                              <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${card.lawyer.color} text-[10px] font-bold text-white`}>
                                {card.lawyer.avatar}
                              </div>
                              <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{card.lawyer.name}</span>
                            </div>
                          ) : (
                            <span className={`text-[11px] ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {viewMode === "timeline" && (() => {
            return (
              <div className={`rounded-3xl border overflow-hidden shadow-sm ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-zinc-200 bg-white"}`}>
                <div className={`flex items-center gap-3 px-6 py-4 border-b ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                  <PresentationChart size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                  <span className={`font-bold text-[14px] ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>التسلسل الزمني</span>
                  <span className={`ms-auto text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>أبريل ٢٠٢٦</span>
                </div>
                <div className="p-6 space-y-5">
                  {columns.map(col => {
                    const colCards = cards[col.id] || [];
                    if (colCards.length === 0) return null;
                    return (
                      <div key={col.id}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${col.color}`}>{col.title}</span>
                          <div className={`flex-1 h-px ${isDark ? "bg-white/[0.04]" : "bg-zinc-100"}`} />
                        </div>
                        <div className="space-y-2 ps-3 border-s-2 border-[#0B3D2E]/20 dark:border-emerald-800/40">
                          {colCards.map((card, idx) => (
                            <motion.div
                              key={card.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.06 }}
                              className={`relative flex items-center gap-4 rounded-2xl border p-4 ${
                                isDark ? "border-white/[0.06] bg-zinc-800/60" : "border-zinc-200 bg-white"
                              }`}
                            >
                              {/* Timeline dot */}
                              <div className="absolute -start-[17px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-[#0B3D2E] bg-[#0B3D2E]/30" />
                              {card.blocker && (
                                <Warning size={14} className="shrink-0 text-red-500" weight="fill" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{card.title}</p>
                                {card.dept && card.dept !== "—" && (
                                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{card.dept}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[card.priority]}`}>{PRIORITY_AR[card.priority]}</span>
                                <span className={`flex items-center gap-1 text-[11px] font-medium ${
                                  card.isExpiringSoon ? "text-red-500" : isDark ? "text-zinc-500" : "text-zinc-400"
                                }`}>
                                  <Clock size={11} />{card.dueDate}
                                </span>
                                {card.lawyer && (
                                  <div title={card.lawyer.name} className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${card.lawyer.color} text-[10px] font-bold text-white shadow ring-2 ${isDark ? "ring-zinc-900" : "ring-white"}`}>
                                    {card.lawyer.avatar}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
    </main>
    </SubscriptionGuard>
  );
}
