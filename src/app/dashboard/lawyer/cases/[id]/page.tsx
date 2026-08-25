"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Gavel, ArrowRight, CalendarCheck, Clock, User, Buildings,
  FileText, ChatDots, ChartLine, Plus, Download, UploadSimple,
  ArrowUpRight, CheckCircle, Warning, PencilSimple, Scales,
  MapPin, MoneyWavy, Robot, FolderOpen, Eye, CheckSquare,
  Graph, UsersThree, Circle, DotsThree,
  ArrowsOut, ArrowsIn, Spinner,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import dynamic from "next/dynamic";
import {
  getServiceRequestDetail,
  type ServiceRequestDetail,
  type ServiceRequestEvent,
  type ServiceRequestAttachment,
} from "@/lib/services/casesService";
import {
  uploadDocumentFile,
  getDocumentFileUrl,
} from "@/lib/services/documentService";
import { getLawyerTasksByCaseId } from "@/lib/services/lawyerTasksService";
import { apiMutate, isSupabaseMode } from "@/lib/services/api";

const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center text-sm text-slate-400">جاري تحميل الجراف...</div> }
);

// ─── Types ────────────────────────────────────────────────────────────────────
type CaseStatus = "active" | "pending" | "suspended" | "closed";
type TaskStatus = "todo" | "inprogress" | "done";

interface HearingRow {
  date: string;
  court: string;
  result: string;
  status: "done" | "upcoming";
}

interface NoteRow {
  author: string;
  text: string;
  date: string;
}

interface TimelineRow {
  event: string;
  date: string;
  icon: React.ElementType;
  color: string;
}

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string }> = {
  active:    { label: "نشطة",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
  pending:   { label: "انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400" },
  suspended: { label: "معلقة",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400" },
  closed:    { label: "مغلقة",  color: "text-slate-400 bg-slate-100 border-slate-200",             dot: "bg-slate-300" },
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "لم تبدأ",    color: "text-slate-500 bg-slate-100",         dot: "bg-slate-300" },
  inprogress: { label: "قيد التنفيذ", color: "text-blue-600 bg-blue-500/10",       dot: "bg-blue-400 animate-pulse" },
  done:       { label: "مكتملة",     color: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-400" },
};

const TABS = [
  { id: "overview",  label: "نظرة عامة",  icon: Gavel },
  { id: "tasks",     label: "المهام",      icon: CheckSquare },
  { id: "hearings",  label: "الجلسات",     icon: CalendarCheck },
  { id: "documents", label: "المستندات",   icon: FolderOpen },
  { id: "team",      label: "الفريق",      icon: UsersThree },
  { id: "graph",     label: "الجراف",      icon: Graph },
  { id: "notes",     label: "الملاحظات",   icon: ChatDots },
];

// Map service_request statuses to the UI CaseStatus.
function mapStatus(s: string | undefined): CaseStatus {
  switch (s) {
    case "assigned":
    case "in_review":
      return "active";
    case "pending_payment":
    case "pending_assignment":
    case "draft":
      return "pending";
    case "completed":
    case "cancelled":
      return "closed";
    default:
      return "pending";
  }
}

// Arabic labels for namespaced + legacy event strings.
const EVENT_LABELS: Record<string, string> = {
  "service_request.created":       "إنشاء الطلب",
  "service_request.status_changed":"تغيير الحالة",
  "service_request.updated":       "تحديث الطلب",
  "service_request.assigned":      "تعيين المحامي",
  "service_request.completed":     "إتمام الطلب",
  "service_request.cancelled":     "إلغاء الطلب",
  "service_request.note_added":    "إضافة ملاحظة",
  "service_request.hearing_added": "إضافة جلسة",
  "case.note_added":               "إضافة ملاحظة",
  "case.hearing_added":            "إضافة جلسة",
  // legacy free-text
  "created":        "إنشاء الطلب",
  "status_change":  "تغيير الحالة",
  "updated":        "تحديث الطلب",
  "assigned":       "تعيين المحامي",
  "completed":      "إتمام الطلب",
  "cancelled":      "إلغاء الطلب",
  "note_added":     "إضافة ملاحظة",
  "hearing_added":  "إضافة جلسة",
};

function eventLabel(ev: string): string {
  return EVENT_LABELS[ev] ?? ev;
}

function eventIcon(ev: string): React.ElementType {
  const e = ev.toLowerCase();
  if (e.includes("created") || e.includes("note") || e.includes("document")) return FileText;
  if (e.includes("status") || e.includes("assigned") || e.includes("updated")) return ArrowUpRight;
  if (e.includes("completed")) return CheckCircle;
  if (e.includes("cancelled")) return Warning;
  if (e.includes("hearing") || e.includes("session")) return CalendarCheck;
  return ChartLine;
}

function eventColor(ev: string): string {
  const e = ev.toLowerCase();
  if (e.includes("completed")) return "text-emerald-500";
  if (e.includes("cancelled")) return "text-amber-500";
  if (e.includes("hearing") || e.includes("session")) return "text-royal";
  return "text-royal";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [noteInput, setNoteInput] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    getServiceRequestDetail(id)
      .then((r) => {
        if (cancelled) return;
        setRequest(r);
        if (!r) setFetchError("لم يتم العثور على القضية.");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[lawyer case detail] fetch failed:", e);
        setFetchError("تعذّر تحميل بيانات القضية.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const caseData = request;

  const status: CaseStatus = useMemo(() => mapStatus(caseData?.status), [caseData?.status]);
  const statusConf = STATUS_CONFIG[status];

  // ── Derived: hearings from metadata.hearings or hearing.* events ──
  const hearings: HearingRow[] = useMemo(() => {
    if (!caseData) return [];
    const meta = caseData.metadata ?? {};
    const rawHearings = Array.isArray(meta.hearings) ? meta.hearings : null;
    if (rawHearings && rawHearings.length > 0) {
      const now = Date.now();
      return rawHearings.map((h: any): HearingRow => {
        const dateStr = h.date ? formatDate(h.date) : "—";
        const upcoming = h.date ? new Date(h.date).getTime() >= now : false;
        return {
          date: dateStr,
          court: String(h.location ?? h.court ?? meta.court ?? "—"),
          result: String(h.type ?? h.notes ?? h.caseName ?? "جلسة"),
          status: upcoming ? "upcoming" : "done",
        };
      });
    }
    // Fall back to hearing.* events
    return (caseData.events ?? [])
      .filter((e) => /hearing|session/i.test(e.event))
      .map((e): HearingRow => ({
        date: formatDate(e.created_at),
        court: String((e.metadata as any)?.location ?? caseData.metadata?.court ?? "—"),
        result: eventLabel(e.event),
        status: "done",
      }));
  }, [caseData]);

  const nextHearing = hearings.find((h) => h.status === "upcoming");

  // ── Derived: timeline from events ──
  const timeline: TimelineRow[] = useMemo(() => {
    if (!caseData?.events) return [];
    return [...caseData.events]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((e) => ({
        event: eventLabel(e.event),
        date: formatDate(e.created_at),
        icon: eventIcon(e.event),
        color: eventColor(e.event),
      }));
  }, [caseData]);

  // ── Derived: notes from events (case.note* or metadata.text) ──
  const notes: NoteRow[] = useMemo(() => {
    if (!caseData?.events) return [];
    return caseData.events
      .filter((e) => {
        const ev = (e.event || "").toLowerCase();
        const hasText = !!((e.metadata as any)?.text);
        return ev.startsWith("case.note") || ev.startsWith("service_request.note") || ev === "note_added" || hasText;
      })
      .map((e) => ({
        author: e.actor_name || "—",
        text: String((e.metadata as any)?.text ?? eventLabel(e.event)),
        date: formatDate(e.created_at),
      }))
      .reverse();
  }, [caseData]);

  // ── Derived: documents from attachments ──
  const documents = caseData?.attachments ?? [];

  // ── Derived: team = assigned lawyer + client ──
  const team = useMemo(() => {
    if (!caseData) return [] as { name: string; role: string; avatar: string }[];
    const members: { name: string; role: string; avatar: string }[] = [];
    if (caseData.assignedTo) {
      members.push({
        name: String(caseData.assignedTo),
        role: "المحامي المسؤول",
        avatar: String(caseData.assignedTo).charAt(0),
      });
    }
    if (caseData.requester?.name) {
      members.push({
        name: caseData.requester.name,
        role: "الموكل",
        avatar: caseData.requester.name.charAt(0),
      });
    }
    return members;
  }, [caseData]);

  // ── Tasks: fetch tasks linked to this case ──
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    if (!id) return;
    setTasksLoading(true);
    getLawyerTasksByCaseId(id)
      .then((data) => setTasks(data ?? []))
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [id]);

  const taskStats = {
    done:       tasks.filter(t => t.status === "done").length,
    inprogress: tasks.filter(t => t.status === "in_progress").length,
    todo:       tasks.filter(t => t.status === "todo").length,
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !isSupabaseMode) return;
    setAddingTask(true);
    try {
      const res = await apiMutate<{ data: any }>("/api/v1/lawyer/tasks", "POST", {
        title: newTaskTitle.trim(),
        category: "case",
        priority: "normal",
        caseId: id,
        caseRef: caseData?.title ?? "",
      });
      if (res?.data) {
        setTasks(prev => [res.data, ...prev]);
        setNewTaskTitle("");
        setShowAddTask(false);
      }
    } catch (e) {
      console.error("[case detail] addTask failed:", e);
    } finally {
      setAddingTask(false);
    }
  };

  // ── Notes save: events POST route does not persist metadata.text, so we
  //    cannot faithfully store a note with content through it. Gate as قريباً
  //    and do NOT pretend it saved. ──
  const saveNote = () => {
    // The POST /api/v1/service-requests/[id]/events route inserts
    // { request_id, event, actor_user_id } only — it drops metadata, so the
    // note text would be lost. Surface a "coming soon" state instead of faking.
    setNoteSaving(true);
    setTimeout(() => {
      setNoteSaving(false);
      setNoteSaved(true);
      setNoteInput("");
      setTimeout(() => setNoteSaved(false), 2500);
    }, 600);
  };

  // ── Document upload: wire to documentService.uploadDocumentFile ──
  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadDocumentFile(file, { requestId: id });
      // Refetch the case to pick up the new attachment row.
      const r = await getServiceRequestDetail(id);
      if (r) setRequest(r);
    } catch (e: any) {
      console.error("[lawyer case detail] upload failed:", e);
      setUploadError(e?.message ?? "تعذّر رفع المستند.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ServiceRequestAttachment) => {
    try {
      const url = await getDocumentFileUrl(doc.storage_path);
      if (url) {
        window.open(url, "_blank");
      }
    } catch (e) {
      console.error("[lawyer case detail] download failed:", e);
    }
  };

  // ── Render: loading ──
  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className="inline-flex flex-col items-center gap-3">
          <Spinner size={32} className="text-royal animate-spin" />
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل القضية...</p>
        </div>
      </div>
    );
  }

  // ── Render: error / not-found ──
  if (fetchError || !caseData) {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">{fetchError ?? "القضية غير موجودة"}</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قد يكون الرابط غير صحيح أو أن القضية محذوفة.</p>
          <Link href="/dashboard/lawyer/cases" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const clientType: "individual" | "corporate" =
    String(caseData.requester?.role ?? "").toLowerCase().includes("company") ||
    String(caseData.requester?.role ?? "").toLowerCase().includes("business") ||
    String((caseData.metadata as any)?.clientType ?? "").toLowerCase() === "corporate"
      ? "corporate"
      : "individual";

  const court = String((caseData.metadata as any)?.court ?? "—");
  const valueRaw = (caseData.metadata as any)?.value;
  const value = valueRaw ? String(valueRaw) : undefined;
  const filedDate = formatDate(caseData.createdAt);
  const referenceNo = caseData.id;
  const assigneeDisplay = caseData.assignedTo ?? "—";

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link href="/dashboard/lawyer/cases"
          className={`inline-flex items-center gap-1.5 text-[13px] transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          <ArrowRight size={13} />
          ملف القضايا
        </Link>
      </motion.div>

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusConf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                {statusConf.label}
              </span>
              <span className={`text-[11px] px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                {caseData.type}
              </span>
              <span className={`text-[11px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {referenceNo}
              </span>
            </div>
            <h1 className={`text-xl font-bold mb-2 leading-snug ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>
              {caseData.title || "بدون عنوان"}
            </h1>
            <div className={`flex items-center gap-4 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5">
                {clientType === "corporate" ? <Buildings size={13} /> : <User size={13} />}
                {caseData.requester?.name ?? "—"}
              </span>
              <span className="flex items-center gap-1.5"><MapPin size={13} />{court}</span>
              <span className="flex items-center gap-1.5"><User size={13} />{assigneeDisplay}</span>
              {value && (
                <span className="flex items-center gap-1.5"><MoneyWavy size={13} />{value}</span>
              )}
              <span className="flex items-center gap-1.5"><CalendarCheck size={13} />تاريخ التقديم: {filedDate}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {nextHearing && (
              <div className={`px-3 py-2 rounded-xl text-center ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? "text-amber-500/70" : "text-amber-600"}`}>الجلسة القادمة</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <CalendarCheck size={12} className="inline ml-1" />{nextHearing.date}
                </p>
              </div>
            )}
            <Link href="/ai/draft"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <PencilSimple size={14} />صياغة مذكرة
            </Link>
            <Link href="/ai/wargaming"
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Robot size={14} />محاكي الخصم
            </Link>
          </div>
        </div>

        {/* Stage bar — derived from status (no mock stage string) */}
        <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الحالة الحالية</span>
            <span className={`font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{statusConf.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {["تقديم", "قيد التداول", "مراجعة", "إغلاق"].map((s, i) => {
              const stageIdx =
                status === "active" ? 1 :
                status === "pending" ? 0 :
                status === "closed" ? 3 : 1;
              return (
                <div key={s} className="flex-1 flex flex-col items-center">
                  <div className={`h-1.5 w-full rounded-full ${i <= stageIdx ? "bg-royal" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
                  <p className={`text-[9px] mt-1 text-center ${i <= stageIdx ? "text-royal" : isDark ? "text-zinc-700" : "text-slate-300"}`}>{s}</p>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 min-w-[70px] ${activeTab === tab.id
                ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={13} weight={activeTab === tab.id ? "duotone" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}>

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
                <div>
                  <h2 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    <Scales size={14} className="text-royal" />وقائع القضية
                  </h2>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    {caseData.description || "لا يوجد وصف متاح لهذه القضية."}
                  </p>
                </div>
                {/* AI evaluation — neutral "قريباً" state (no fabricated percentage) */}
                <div className={`p-3 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Robot size={13} className="text-[#C8A762]" />
                    <span className="text-[11px] font-bold text-[#C8A762]">تقييم نظامي AI</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8A762]/10 text-[#C8A762]">قريباً</span>
                  </div>
                  <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    تحليل AI لقوة موقف الموكل سيكون متاحاً قريباً عند تفعيل أداة تحليل الملف.
                  </p>
                  <Link href="/ai/analyze-strength"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[#C8A762] hover:underline">
                    <ArrowUpRight size={10} />تحليل تفصيلي
                  </Link>
                </div>
                {/* Task quick summary */}
                <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                  {[
                    { label: "مكتملة",     value: taskStats.done,       color: "text-emerald-500" },
                    { label: "قيد التنفيذ", value: taskStats.inprogress, color: "text-blue-500" },
                    { label: "لم تبدأ",    value: taskStats.todo,        color: "text-slate-400" },
                  ].map((s, i) => (
                    <div key={i} className="text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Timeline */}
              <div className={`${card} p-5`}>
                <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  <ChartLine size={14} className="text-royal" />المخطط الزمني
                </h2>
                {timeline.length === 0 ? (
                  <div className="text-center py-8">
                    <ChartLine size={24} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد أحداث مسجّلة بعد</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((ev, i) => {
                      const Icon = ev.icon;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                            <Icon size={13} weight="duotone" className={ev.color} />
                          </div>
                          <div>
                            <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{ev.event}</p>
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{ev.date}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tasks ── */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {([
                    { key: "all",        label: "الكل",        count: tasks.length },
                    { key: "todo",       label: "لم تبدأ",    count: taskStats.todo },
                    { key: "in_progress",label: "قيد التنفيذ", count: taskStats.inprogress },
                    { key: "done",       label: "مكتملة",     count: taskStats.done },
                  ] as const).map(s => (
                    <span key={s.key}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 ${isDark ? "border-white/[0.06] text-zinc-400 bg-zinc-800/40" : "border-slate-100 text-slate-500 bg-white"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.key === "done" ? "bg-emerald-400" : s.key === "in_progress" ? "bg-blue-400" : s.key === "todo" ? "bg-slate-300" : "bg-royal"}`} />
                      {s.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                        {s.count}
                      </span>
                    </span>
                  ))}
                </div>
                <button onClick={() => setShowAddTask(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${showAddTask ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/20"}`}>
                  <Plus size={12} weight="bold" />
                  {showAddTask ? "إلغاء" : "إضافة مهمة"}
                </button>
              </div>

              {/* Add task inline form */}
              {showAddTask && (
                <div className={`${card} p-4 flex gap-3 items-center`}>
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddTask()}
                    placeholder="عنوان المهمة... (Enter للإضافة)"
                    className={`flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]" : "border-slate-200 bg-slate-50 text-slate-800 focus:border-[#0B3D2E]"}`}
                  />
                  <button onClick={handleAddTask} disabled={addingTask || !newTaskTitle.trim()}
                    className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] disabled:opacity-40 transition-colors">
                    {addingTask ? "..." : "إضافة"}
                  </button>
                </div>
              )}

              {/* Tasks list */}
              {tasksLoading ? (
                <div className={`${card} p-10 flex items-center justify-center`}>
                  <Spinner size={24} className="text-royal animate-spin" />
                </div>
              ) : tasks.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <CheckSquare size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مهام لهذه القضية بعد</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أضف مهمة باستخدام الزر أعلاه.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t, i) => {
                    const subtasks: any[] = Array.isArray(t.subtasks) ? t.subtasks : [];
                    const doneSubs = subtasks.filter((s: any) => s.done).length;
                    const statusColor =
                      t.status === "done" ? "text-emerald-500 bg-emerald-500/10" :
                      t.status === "in_progress" ? "text-blue-500 bg-blue-500/10" :
                      isDark ? "text-zinc-500 bg-white/[0.04]" : "text-slate-400 bg-slate-100";
                    const statusLabel =
                      t.status === "done" ? "مكتملة" :
                      t.status === "in_progress" ? "قيد التنفيذ" : "لم تبدأ";
                    return (
                      <motion.div key={t.id}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className={`${card} p-4`}>
                        <div className="flex items-start gap-3">
                          {/* Status dot */}
                          <span className={`mt-1 inline-flex w-2 h-2 rounded-full flex-shrink-0 ${t.status === "done" ? "bg-emerald-400" : t.status === "in_progress" ? "bg-blue-400 animate-pulse" : isDark ? "bg-zinc-600" : "bg-slate-300"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-[13px] font-semibold ${t.status === "done" ? "line-through opacity-50" : isDark ? "text-zinc-200" : "text-slate-700"}`}>
                                {t.title}
                              </p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${statusColor}`}>{statusLabel}</span>
                              {t.priority === "urgent" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500">عاجل</span>}
                              {t.priority === "high" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500">عالية</span>}
                            </div>
                            {/* Subtasks */}
                            {subtasks.length > 0 && (
                              <div className="mt-2 space-y-1 pr-2 border-r-2 border-dashed border-royal/20">
                                {subtasks.map((s: any, si: number) => (
                                  <div key={si} className={`flex items-center gap-2 text-[11px] ${s.done ? "opacity-50 line-through" : isDark ? "text-zinc-400" : "text-slate-500"}`}>
                                    <CheckCircle size={10} weight={s.done ? "fill" : "regular"} className={s.done ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-slate-300"} />
                                    {s.title}
                                  </div>
                                ))}
                                <p className={`text-[9px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                                  {doneSubs}/{subtasks.length} مكتمل
                                </p>
                              </div>
                            )}
                            {t.notes && (
                              <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.notes}</p>
                            )}
                          </div>
                          {/* Link to full task in tasks page */}
                          <Link href={`/dashboard/lawyer/tasks`}
                            title="عرض في صفحة المهام"
                            className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]" : "text-slate-300 hover:text-slate-600 hover:bg-slate-100"}`}>
                            <Eye size={14} />
                          </Link>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Hearings ── */}
          {activeTab === "hearings" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {hearings.length} جلسات مسجّلة
                </p>
                <button disabled title="قريباً"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all opacity-60 cursor-not-allowed ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                  <Plus size={12} weight="bold" />إضافة جلسة · قريباً
                </button>
              </div>
              {hearings.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <CalendarCheck size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد جلسات مسجّلة</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ستظهر الجلسات هنا عند إضافتها.</p>
                </div>
              ) : (
                hearings.map((h, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`${card} p-4 flex items-start gap-4 ${h.status === "upcoming" ? "border-l-4 border-l-royal" : ""}`}>
                    <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${h.status === "upcoming" ? "bg-royal/10" : isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                      {h.status === "upcoming"
                        ? <Clock size={18} weight="duotone" className="text-royal" />
                        : <CheckCircle size={18} weight="duotone" className="text-emerald-500" />}
                      <span className={`text-[9px] font-bold mt-0.5 ${h.status === "upcoming" ? "text-royal" : "text-emerald-500"}`}>
                        {h.status === "upcoming" ? "قادمة" : "منتهية"}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{h.date}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{h.court}</span>
                      </div>
                      <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{h.result}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {activeTab === "documents" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{documents.length} مستندات</p>
                <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${uploading ? "opacity-60 pointer-events-none" : ""} ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
                  <UploadSimple size={12} />{uploading ? "جاري الرفع..." : "رفع مستند"}
                  <input
                    ref={setFileInputEl}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      if (fileInputEl) fileInputEl.value = "";
                    }}
                  />
                </label>
              </div>
              {uploadError && (
                <div className={`p-3 rounded-xl border text-[12px] ${isDark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"}`}>
                  <Warning size={12} className="inline ml-1" />{uploadError}
                </div>
              )}
              {documents.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <FolderOpen size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مستندات</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ارفع أول مستند لهذه القضية.</p>
                </div>
              ) : (
                documents.map((doc, i) => (
                  <motion.div key={doc.id ?? i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className={`group ${card} p-4 flex items-center gap-3 hover:border-royal/20 transition-all`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${(doc.mime_type ?? "").includes("pdf") ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
                      <FileText size={18} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(doc)} title="عرض/تحميل"
                        className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
                      <button onClick={() => handleDownload(doc)} title="تحميل"
                        className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ── Team ── */}
          {activeTab === "team" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {team.length} أعضاء في الفريق
                </p>
              </div>
              {team.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <UsersThree size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا يوجد فريق معيّن</p>
                </div>
              ) : (
                team.map((m, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`${card} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[17px] font-bold text-royal">{m.avatar}</span>
                      </div>
                      <div className="flex-1">
                        <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.name}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{m.role}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ── Graph ── */}
          {activeTab === "graph" && (
            <div className={`${card} overflow-hidden`} style={{ height: "580px" }}>
              <div className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <Graph size={14} weight="duotone" className="text-royal" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  الجراف البصري للقضية — {caseData.title}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full mr-auto ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#C8A762]"}`}>
                  نظامي AI
                </span>
                <button
                  onClick={() => setGraphFullscreen(f => !f)}
                  className={`p-1.5 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
                  title="ملء الشاشة"
                >
                  <ArrowsOut size={14} />
                </button>
              </div>
              <div className="h-[calc(100%-48px)]">
                <CaseGraphView isDark={isDark} isGlobal={false} />
              </div>
              {graphFullscreen && (
                <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: isDark ? "#0f0f0f" : "#f8f8f8" }}>
                  <div className={`flex items-center gap-3 p-3 border-b ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
                    <Graph size={15} weight="duotone" className="text-royal" />
                    <p className={`text-[13px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                      {caseData.title} — الجراف البصري
                    </p>
                    <button onClick={() => setGraphFullscreen(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                        isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      <ArrowsIn size={13} /> خروج
                    </button>
                  </div>
                  <div className="flex-1">
                    <CaseGraphView isDark={isDark} isGlobal={false} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ملاحظة جديدة</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8A762]/10 text-[#C8A762]">قريباً</span>
                </div>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="اكتب ملاحظتك هنا..."
                  rows={3}
                  className={`w-full text-sm bg-transparent outline-none resize-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                />
                <div className="flex justify-end mt-2 items-center gap-2">
                  {noteSaved && (
                    <span className="text-[10px] text-amber-500 font-bold">سيتم تفعيل حفظ الملاحظات قريباً</span>
                  )}
                  <button onClick={saveNote} disabled={!noteInput.trim() || noteSaving}
                    title="قريباً"
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40 flex items-center gap-1.5">
                    {noteSaving ? <Spinner size={12} className="animate-spin" /> : null}
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <div className={`${card} p-8 text-center`}>
                    <ChatDots size={24} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                    <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات بعد</p>
                  </div>
                ) : (
                  notes.map((note, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className={`${card} p-4`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-royal/10 flex items-center justify-center">
                            <span className="text-[11px] font-bold text-royal">{note.author.charAt(0)}</span>
                          </div>
                          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.author}</p>
                        </div>
                        <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{note.date}</p>
                      </div>
                      <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{note.text}</p>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}