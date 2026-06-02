"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, CheckCircle, Clock, ChatCircleDots, Warning,
  Eye, Share, Plus, Buildings, ArrowSquareOut,
  Check, X, CaretDown, Signature, SealCheck, PencilSimple,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import Link from "next/link";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type DeptStatus = "approved" | "pending" | "noted" | "not_sent";

interface DeptReview {
  dept: string;
  reviewerName: string | null;
  status: DeptStatus;
  note?: string;
  time?: string;
}

interface DocumentReview {
  id: string;
  title: string;
  contractType: string;
  contractValue: string;
  sentAt: string;
  dueDate: string;
  token: string;
  overallStatus: "pending" | "approved" | "has_notes" | "overdue";
  departments: DeptReview[];
}

const DEPT_COLORS: Record<string, string> = {
  "التشغيل": "bg-blue-500",
  "التسويق": "bg-purple-500",
  "المالية": "bg-emerald-500",
  "الموارد البشرية": "bg-orange-500",
  "القانونية": "bg-red-500",
  "تقنية المعلومات": "bg-cyan-500",
};

const MOCK_DOCS: DocumentReview[] = [
  {
    id: "d1",
    title: "عقد خدمات استشارية — حلول التحول الرقمي",
    contractType: "تجاري",
    contractValue: "٢,٤٠٠,٠٠٠ ﷼",
    sentAt: "١٥ مارس ٢٠٢٥",
    dueDate: "٢٠ مارس ٢٠٢٥",
    token: "abc123",
    overallStatus: "has_notes",
    departments: [
      { dept: "التشغيل", reviewerName: "محمد الحربي", status: "noted", note: "يُطلب زيادة عدد الاستشاريين إلى ٧", time: "منذ ٢ ساعة" },
      { dept: "التسويق", reviewerName: "ريم العتيبي", status: "noted", note: "تحديد النطاق الجغرافي لعدم المنافسة", time: "منذ ٤ ساعات" },
      { dept: "المالية", reviewerName: null, status: "pending" },
      { dept: "القانونية", reviewerName: null, status: "pending" },
    ],
  },
  {
    id: "d2",
    title: "عقد إيجار مقر رئيسي — جدة",
    contractType: "إيجار",
    contractValue: "٨٥٠,٠٠٠ ﷼",
    sentAt: "١٠ مارس ٢٠٢٥",
    dueDate: "١٧ مارس ٢٠٢٥",
    token: "def456",
    overallStatus: "approved",
    departments: [
      { dept: "التشغيل", reviewerName: "محمد الحربي", status: "approved", time: "منذ يومين" },
      { dept: "المالية", reviewerName: "سلمى الجهني", status: "approved", time: "منذ يوم" },
      { dept: "القانونية", reviewerName: "فهد المالكي", status: "approved", time: "منذ ٥ ساعات" },
    ],
  },
  {
    id: "d3",
    title: "اتفاقية شراكة استراتيجية — مجموعة الأفق",
    contractType: "شراكة",
    contractValue: "٥,٠٠٠,٠٠٠ ﷼",
    sentAt: "٥ مارس ٢٠٢٥",
    dueDate: "١٢ مارس ٢٠٢٥",
    token: "ghi789",
    overallStatus: "overdue",
    departments: [
      { dept: "التشغيل", reviewerName: "محمد الحربي", status: "noted", note: "بنود حصة الأرباح تحتاج مراجعة" },
      { dept: "المالية", reviewerName: null, status: "pending" },
      { dept: "القانونية", reviewerName: null, status: "pending" },
      { dept: "الموارد البشرية", reviewerName: null, status: "not_sent" },
    ],
  },
];

const STATUS_CONFIG: Record<DeptStatus, { label: string; cls: string; icon: React.ElementType }> = {
  approved: { label: "اعتمد", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  pending:  { label: "لم يراجع", cls: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: Clock },
  noted:    { label: "ملاحظات", cls: "text-blue-500 bg-blue-500/10 border-blue-500/20", icon: ChatCircleDots },
  not_sent: { label: "لم يُرسل", cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20", icon: X },
};

type SignoffStatus = "pending" | "signed";
interface SignoffState { [docId: string]: SignoffStatus; }
interface DocDeptState { [key: string]: DeptStatus; } // key = `${docId}__${deptIndex}`
interface NoteState { [key: string]: string; }

const OVERALL_CONFIG = {
  pending:   { label: "قيد المراجعة", cls: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  approved:  { label: "مكتمل ✅", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  has_notes: { label: "ملاحظات واردة", cls: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  overdue:   { label: "متأخر ⚠️", cls: "text-red-500 bg-red-500/10 border-red-500/20" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BusinessReviewsPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const businessRole = (user as { businessRole?: string }).businessRole ?? "owner";
  const isLegalManager = businessRole === "legal_manager" || businessRole === "owner";
  const isDeptHead = businessRole === "department_head" || isLegalManager;

  const [expanded, setExpanded] = useState<string | null>("d1");
  // Live approval state — optimistic updates, ready for backend wiring
  const [deptStates, setDeptStates] = useState<DocDeptState>({});
  const [noteInput, setNoteInput] = useState<NoteState>({});
  const [showNoteInput, setShowNoteInput] = useState<{[k:string]:boolean}>({});
  const [signoffs, setSignoffs] = useState<SignoffState>({});
  const [signoffAnim, setSignoffAnim] = useState<string | null>(null);

  const getDeptStatus = (docId: string, idx: number, original: DeptStatus): DeptStatus =>
    deptStates[`${docId}__${idx}`] ?? original;

  const approveDept = (docId: string, idx: number) => {
    setDeptStates(p => ({ ...p, [`${docId}__${idx}`]: "approved" }));
    setShowNoteInput(p => ({ ...p, [`${docId}__${idx}`]: false }));
  };

  const submitNote = (docId: string, idx: number) => {
    if (noteInput[`${docId}__${idx}`]?.trim()) {
      setDeptStates(p => ({ ...p, [`${docId}__${idx}`]: "noted" }));
      setShowNoteInput(p => ({ ...p, [`${docId}__${idx}`]: false }));
    }
  };

  const handleSignoff = (docId: string) => {
    setSignoffAnim(docId);
    setTimeout(() => { setSignoffs(p => ({ ...p, [docId]: "signed" })); setSignoffAnim(null); }, 800);
  };

  const allDeptsApproved = (doc: DocumentReview) =>
    doc.departments.every((_,i) => getDeptStatus(doc.id, i, doc.departments[i].status) === "approved");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const totalPending = MOCK_DOCS.flatMap(d => d.departments).filter(d => d.status === "pending").length;
  const totalNoted = MOCK_DOCS.flatMap(d => d.departments).filter(d => d.status === "noted").length;
  const totalApproved = MOCK_DOCS.filter(d => d.overallStatus === "approved").length;

  return (
    <SubscriptionGuard featureKey="dept-reviews">
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <FileText className="text-royal" weight="duotone" />
            متابعة مراجعات الإدارات
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            تابع حالة مراجعة كل إدارة لكل مستند قانوني مرسَل
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/business/governance">
            <button className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              إعدادات الحوكمة
            </button>
          </Link>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={14} weight="bold" /> إرسال مستند جديد
          </button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "مستندات نشطة", value: MOCK_DOCS.filter(d => d.overallStatus !== "approved").length, color: "text-royal", bg: "bg-royal/8", icon: FileText },
          { label: "مراجعات منتظرة", value: totalPending, color: "text-amber-500", bg: "bg-amber-500/8", icon: Clock },
          { label: "ملاحظات واردة", value: totalNoted, color: "text-blue-500", bg: "bg-blue-500/8", icon: ChatCircleDots },
          { label: "مكتملة", value: totalApproved, color: "text-emerald-500", bg: "bg-emerald-500/8", icon: CheckCircle },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={`${card} p-4`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${k.bg}`}>
                <Icon size={18} weight="duotone" className={k.color} />
              </div>
              <p className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{k.value}</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Documents list */}
      <div className="space-y-3">
        {MOCK_DOCS.map((doc, di) => {
          const ov = OVERALL_CONFIG[doc.overallStatus];
          const isOpen = expanded === doc.id;

          return (
            <motion.div key={doc.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: di * 0.06 }}
              className={card}>
              {/* Document header */}
              <button onClick={() => setExpanded(isOpen ? null : doc.id)}
                className="w-full p-4 flex items-center justify-between gap-3 text-right">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <FileText size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "bg-white/[0.05] border-white/[0.08] text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-500"}`}>
                        {doc.contractType}
                      </span>
                      <span className={`text-[11px] font-mono ${isDark ? "text-zinc-400" : "text-slate-400"}`}>{doc.contractValue}</span>
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>يستحق: {doc.dueDate}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ov.cls}`}>{ov.label}</span>

                  {/* Department dots */}
                  <div className="flex items-center gap-1">
                    {doc.departments.map((d, i) => {
                      const dot = DEPT_COLORS[d.dept] ?? "bg-zinc-400";
                      return (
                        <div key={i} title={`${d.dept}: ${STATUS_CONFIG[d.status].label}`}
                          className={`w-2.5 h-2.5 rounded-full ${dot} ${d.status === "pending" ? "opacity-30" : "opacity-100"}`} />
                      );
                    })}
                  </div>

                  <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={14} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                  </motion.div>
                </div>
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className={`px-4 pb-4 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                      <div className="pt-3 grid gap-2">
                        {doc.departments.map((dpt, i) => {
                          const liveStatus = getDeptStatus(doc.id, i, dpt.status);
                          const st = STATUS_CONFIG[liveStatus];
                          const StIcon = st.icon;
                          const dot = DEPT_COLORS[dpt.dept] ?? "bg-zinc-400";
                          const noteKey = `${doc.id}__${i}`;
                          const liveNote = noteInput[noteKey] ?? "";
                          const isShowingNote = showNoteInput[noteKey];
                          return (
                            <motion.div key={i} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                              className={`flex flex-col gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.02] border border-white/[0.04]" : "bg-slate-50 border border-slate-100"}`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{dpt.dept}</span>
                                    {dpt.reviewerName && <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>— {dpt.reviewerName}</span>}
                                  </div>
                                  {(dpt.note || liveStatus === "noted") && (
                                    <p className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>💬 {noteInput[noteKey] || dpt.note}</p>
                                  )}
                                  {dpt.time && <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>{dpt.time}</p>}
                                </div>
                                <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                                  <StIcon size={10} weight="bold" /> {st.label}
                                </span>
                              </div>
                              {/* Action buttons — visible to dept_head / owner / legal_manager only when pending */}
                              {isDeptHead && liveStatus === "pending" && (
                                <div className="flex items-center gap-2 ps-5">
                                  <motion.button whileTap={{ scale: 0.93 }} onClick={() => approveDept(doc.id, i)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                                    <Check size={11} weight="bold" /> اعتماد
                                  </motion.button>
                                  <motion.button whileTap={{ scale: 0.93 }} onClick={() => setShowNoteInput(p => ({...p, [noteKey]: !isShowingNote}))}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                      isShowingNote ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                                    }`}>
                                    <PencilSimple size={11} /> ملاحظة
                                  </motion.button>
                                </div>
                              )}
                              <AnimatePresence>
                                {isShowingNote && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden ps-5">
                                    <div className="flex gap-2">
                                      <input value={liveNote} onChange={e => setNoteInput(p => ({...p, [noteKey]: e.target.value}))}
                                        placeholder="اكتب ملاحظتك هنا..."
                                        className={`flex-1 rounded-lg border px-3 py-2 text-[12px] outline-none ${
                                          isDark ? "border-white/[0.08] bg-zinc-800 text-white placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800"
                                        }`} />
                                      <motion.button whileTap={{ scale: 0.93 }} onClick={() => submitNote(doc.id, i)}
                                        className="px-3 py-2 rounded-lg bg-blue-500 text-white text-[11px] font-bold">
                                        إرسال
                                      </motion.button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>

                      {/* Legal Manager Final Sign-off */}
                      {isLegalManager && (
                        <motion.div layout className={`mt-3 p-4 rounded-xl border ${
                          signoffs[doc.id] === "signed"
                            ? isDark ? "border-emerald-500/30 bg-emerald-500/8" : "border-emerald-300 bg-emerald-50"
                            : allDeptsApproved(doc)
                              ? isDark ? "border-[#C8A762]/30 bg-[#C8A762]/8" : "border-amber-300 bg-amber-50/60"
                              : isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"
                        }`}>
                          {signoffs[doc.id] === "signed" ? (
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                              className="flex items-center gap-2">
                              <SealCheck size={18} weight="fill" className="text-emerald-500" />
                              <span className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>تم التوقيع النهائي بواسطة رئيس الشؤون القانونية</span>
                            </motion.div>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Signature size={16} className={allDeptsApproved(doc) ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-zinc-400"} />
                                <span className={`text-[12px] font-semibold ${
                                  allDeptsApproved(doc) ? isDark ? "text-[#C8A762]" : "text-amber-700" : isDark ? "text-zinc-600" : "text-zinc-400"
                                }`}>
                                  {allDeptsApproved(doc) ? "جاهز للتوقيع النهائي" : "في انتظار اعتماد الإدارات"}
                                </span>
                              </div>
                              {allDeptsApproved(doc) && (
                                <motion.button
                                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
                                  onClick={() => handleSignoff(doc.id)}
                                  animate={signoffAnim === doc.id ? { opacity: [1, 0.5, 1] } : {}}
                                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold shadow-[0_4px_12px_-4px_rgba(11,61,46,0.5)] hover:bg-[#0a3328] transition-colors">
                                  <SealCheck size={13} weight="fill" /> توقيع وإغلاق
                                </motion.button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}

                      <div className="flex gap-2 mt-3">
                        <Link href={`/review/${doc.token}`} target="_blank" rel="noopener noreferrer"
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                          <ArrowSquareOut size={12} /> فتح رابط المراجعة
                        </Link>
                        <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                          <Share size={12} /> مشاركة الرابط
                        </button>
                        {doc.overallStatus === "has_notes" && (
                          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-royal text-white transition-colors">
                            <ChatCircleDots size={12} /> إرسال للمحامي
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
    </SubscriptionGuard>
  );
}
