"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  User, Buildings, ArrowRight, Gavel, ChatDots,
  CurrencyCircleDollar, Star, Phone, EnvelopeSimple, MapPin,
  Warning, ArrowClockwise, CalendarBlank, Scales, Notepad,
  CaretLeft, IdentificationCard, PencilSimple, FloppyDisk, X,
  Trash, LockKey, CheckCircle, Clock,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { itemsOf, listFailed, listOk, listViewState, type ListRead } from "@/lib/services/listRead";
import {
  getLawyerClient, updateLawyerClient,
  type LawyerClient, type UpdateLawyerClientInput,
  type ClientFlag, type ClientStatus,
} from "@/lib/services/lawyerClientsService";
import {
  getClientNotes, addClientNote, deleteClientNote,
  type LawyerClientNote, type NoteVisibility,
} from "@/lib/services/lawyerClientNotesService";
import { CLIENT_FLAGS, feePairIssue, isMoneyFigure } from "@/lib/services/clientIdentityRules";

// ─── Local types ──────────────────────────────────────────────────────────────

type ClientPageState = "loading" | "ready" | "notfound" | "unreadable";

interface RelatedRow {
  id: string;
  title: string;
  status: "active" | "pending" | "closed";
  date: string;
  /** ISO createdAt — used only to derive «أول تعامل» when the card has none. Never rendered. */
  rawDate: string | null;
}

interface ConsultationRow {
  id: string; title: string; date: string; status: "done" | "pending";
}

const FLAG_CONFIG: Record<ClientFlag, { label: string; color: string; bg: string; emoji: string }> = {
  vip:       { label: "VIP",         color: "text-amber-600",   bg: "bg-amber-500/10",   emoji: "👑" },
  new:       { label: "جديد",        color: "text-blue-500",    bg: "bg-blue-500/10",    emoji: "🆕" },
  loyal:     { label: "دائم",        color: "text-emerald-500", bg: "bg-emerald-500/10", emoji: "🤝" },
  urgent:    { label: "قضية حرجة",   color: "text-red-600",     bg: "bg-red-600/10",     emoji: "🔴" },
  corporate: { label: "شركة",        color: "text-indigo-500",  bg: "bg-indigo-500/10",  emoji: "🏢" },
  inactive:  { label: "غير نشط",     color: "text-slate-400",   bg: "bg-slate-100",      emoji: "💤" },
};

const STATUS_LABEL: Record<ClientStatus, string> = {
  active: "نشط", inactive: "غير نشط", archived: "مؤرشف",
};

/**
 * Shared budget for the two service_requests reads below. Each one is a
 * separate query (by lawyer_client_id, and — when the card is linked to a
 * platform account — by requester_user_id), so this is the cap PER query,
 * not a cap on the merged list.
 */
const RELATED_FETCH_LIMIT = 200;

function mapRequestStatus(s: string | undefined): "active" | "pending" | "closed" {
  switch (s) {
    case "assigned":
    case "in_review":
      return "active";
    case "completed":
    case "cancelled":
      return "closed";
    default:
      return "pending";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(iso);
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const clientId = params.id as string;

  // ── The client card itself ────────────────────────────────────────────────
  const [client, setClient] = useState<LawyerClient | null>(null);
  const [clientState, setClientState] = useState<ClientPageState>("loading");
  const [clientErrorMsg, setClientErrorMsg] = useState<string | null>(null);

  const loadClient = useCallback(() => {
    setClientState("loading");
    setClientErrorMsg(null);
    getLawyerClient(clientId)
      .then((c) => {
        if (c === null) {
          setClient(null);
          setClientState("notfound");
          return;
        }
        setClient(c);
        setClientState("ready");
      })
      .catch((e) => {
        console.error("[lawyer client detail] client fetch failed:", e);
        setClientErrorMsg(e instanceof Error ? e.message : "تعذّر تحميل بيانات الموكّل.");
        setClientState("unreadable");
      });
  }, [clientId]);

  useEffect(() => { loadClient(); }, [loadClient]);

  // ── Related work: this client's cases + consultations ────────────────────
  const [casesRead, setCasesRead] = useState<ListRead<RelatedRow> | null>(null);
  const [consultsRead, setConsultsRead] = useState<ListRead<ConsultationRow> | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [relatedTruncated, setRelatedTruncated] = useState(false);

  const clientUserId = client?.clientUserId ?? null;

  const loadRelated = useCallback(() => {
    if (!isSupabaseMode) {
      setCasesRead(listFailed<RelatedRow>());
      setConsultsRead(listFailed<ConsultationRow>());
      setRelatedError("غير متاح في الوضع التجريبي — لا توجد قاعدة بيانات مرتبطة.");
      return;
    }
    setRelatedLoading(true);
    setRelatedError(null);

    type RelatedApiResponse = { data: unknown[]; total?: number | null; degraded?: boolean };
    const queries: Promise<RelatedApiResponse>[] = [
      apiGet<RelatedApiResponse>("/api/v1/service-requests", { lawyer_client_id: clientId, limit: RELATED_FETCH_LIMIT }),
    ];
    // A card linked to a platform account also has requests filed directly by
    // that account (requester_user_id) — read those too, and merge.
    if (clientUserId) {
      queries.push(apiGet<RelatedApiResponse>("/api/v1/service-requests", { requester_user_id: clientUserId, limit: RELATED_FETCH_LIMIT }));
    }

    Promise.all(queries)
      .then((results) => {
        // The route reports a failed query as HTTP 200 with { data: [], degraded: true }
        // — a plain .catch never sees that, so it is checked explicitly here. ANY
        // failed leg makes the merged list untrustworthy, not just the leg that failed.
        for (const res of results) {
          if (!res || res.degraded || !Array.isArray(res.data)) {
            throw new Error("تعذّر تحميل القضايا والاستشارات المرتبطة.");
          }
        }
        const byId = new Map<string, any>();
        let truncatedAny = false;
        for (const res of results as { data: any[]; total?: number | null }[]) {
          for (const r of res.data) byId.set(String(r.id), r);
          if (typeof res.total === "number" && res.total > res.data.length) truncatedAny = true;
        }

        const caseRows: RelatedRow[] = [];
        const consultRows: ConsultationRow[] = [];
        for (const r of byId.values()) {
          const type = String(r.type ?? "").toLowerCase();
          const status = mapRequestStatus(r.status);
          if (type === "consultation") {
            consultRows.push({
              id: String(r.id),
              title: String(r.title ?? "بدون عنوان"),
              date: formatDate(r.createdAt),
              status: status === "closed" ? "done" : "pending",
            });
          } else {
            caseRows.push({
              id: String(r.id),
              title: String(r.title ?? "بدون عنوان"),
              status,
              date: formatDate(r.createdAt),
              rawDate: typeof r.createdAt === "string" ? r.createdAt : null,
            });
          }
        }
        setCasesRead(listOk(caseRows));
        setConsultsRead(listOk(consultRows));
        setRelatedTruncated(truncatedAny);
      })
      .catch((e) => {
        console.error("[lawyer client detail] related fetch failed:", e);
        setRelatedError(e instanceof Error ? e.message : "تعذّر تحميل القضايا والاستشارات المرتبطة.");
        setCasesRead(listFailed<RelatedRow>());
        setConsultsRead(listFailed<ConsultationRow>());
      })
      .finally(() => setRelatedLoading(false));
  }, [clientId, clientUserId]);

  useEffect(() => {
    if (clientState === "ready") loadRelated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientState, clientId, clientUserId]);

  const casesView    = listViewState(relatedLoading, casesRead);
  const consultsView = listViewState(relatedLoading, consultsRead);
  const relatedCases    = itemsOf(casesRead);
  const relatedConsults = itemsOf(consultsRead);

  // «أول تعامل» — the card's own date, or the earliest linked request. Omitted
  // entirely (not "—") when neither source has one.
  const earliestRequestDate = useMemo(() => {
    const dates = relatedCases.map(r => r.rawDate).filter((d): d is string => !!d);
    if (dates.length === 0) return null;
    return dates.reduce((min, d) => (d < min ? d : min));
  }, [relatedCases]);
  const firstEngagement = client?.firstEngagementOn ?? earliestRequestDate;

  // ── Confidential notes ────────────────────────────────────────────────────
  const [notesRead, setNotesRead] = useState<ListRead<LawyerClientNote> | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>("private");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(() => {
    setNotesLoading(true);
    getClientNotes(clientId)
      .then(setNotesRead)
      .finally(() => setNotesLoading(false));
  }, [clientId]);

  useEffect(() => { if (clientState === "ready") loadNotes(); }, [clientState, loadNotes]);

  const notesView = listViewState(notesLoading, notesRead);
  const notes = itemsOf(notesRead);

  const submitNote = async () => {
    const body = noteBody.trim();
    if (!body || addingNote) return;
    setAddingNote(true);
    setNoteError(null);
    try {
      await addClientNote(clientId, { body, visibility: noteVisibility });
      setNoteBody("");
      loadNotes();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "تعذّر حفظ الملاحظة.");
    } finally {
      setAddingNote(false);
    }
  };

  const removeNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    setNoteError(null);
    try {
      await deleteClientNote(clientId, noteId);
      loadNotes();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "تعذّر حذف الملاحظة.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  // ── Inline edit panel ─────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editFlags, setEditFlags] = useState<Set<ClientFlag>>(new Set());
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editFeeTotal, setEditFeeTotal] = useState("");
  const [editFeePaid, setEditFeePaid] = useState("");
  const [editStatus, setEditStatus] = useState<ClientStatus>("active");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = () => {
    if (!client) return;
    setEditPhone(client.phone ?? "");
    setEditEmail(client.email ?? "");
    setEditCity(client.city ?? "");
    setEditFlags(new Set(client.flags));
    setEditRating(client.rating);
    setEditFeeTotal(client.feeTotalSar !== null ? String(client.feeTotalSar) : "");
    setEditFeePaid(client.feePaidSar !== null ? String(client.feePaidSar) : "");
    setEditStatus(client.status);
    setEditError(null);
    setIsEditing(true);
  };

  const toggleEditFlag = (f: ClientFlag) =>
    setEditFlags(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const saveEdit = async () => {
    if (!client || savingEdit) return;
    const totalTrim = editFeeTotal.trim();
    const paidTrim = editFeePaid.trim();
    const totalNum = totalTrim ? Number(totalTrim) : undefined;
    const paidNum = paidTrim ? Number(paidTrim) : undefined;
    if (totalTrim && !isMoneyFigure(totalNum)) {
      setEditError("إجمالي الأتعاب يجب أن يكون رقمًا غير سالب.");
      return;
    }
    if (paidTrim && !isMoneyFigure(paidNum)) {
      setEditError("المبلغ المقدّم يجب أن يكون رقمًا غير سالب.");
      return;
    }
    // Validate against the state the row will actually be in after this save —
    // a field left blank here keeps its CURRENT value on the server, so the
    // pair check must use that value, not "unset".
    const effectiveTotal = totalNum !== undefined ? totalNum : client.feeTotalSar;
    const effectivePaid = paidNum !== undefined ? paidNum : client.feePaidSar;
    const feeIssue = feePairIssue(effectiveTotal, effectivePaid);
    if (feeIssue) {
      setEditError(feeIssue);
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    const patch: UpdateLawyerClientInput = {
      phone: editPhone.trim(),
      email: editEmail.trim(),
      city: editCity.trim(),
      flags: Array.from(editFlags),
      status: editStatus,
    };
    // The rating field has a dedicated "مسح" (clear) control (see the star
    // row below): when the lawyer uses it, editRating goes to null while the
    // server still holds the old value — that must be sent as an explicit
    // clear, not omitted. The DTO's `rating` has no null variant, so the
    // clear is carried through a widened payload cast rather than patch
    // itself. The fee fields have no such control (an ambiguous blank input
    // can't tell "leave as-is" from "clear"), so they stay as a known,
    // disclosed gap: a blank field there leaves the current server value
    // untouched rather than being sent as a clear.
    const ratingPatch: { rating?: number | null } = {};
    if (editRating !== null) {
      ratingPatch.rating = editRating;
    } else if (client.rating !== null) {
      ratingPatch.rating = null;
    }
    if (totalNum !== undefined) patch.feeTotalSar = totalNum;
    if (paidNum !== undefined) patch.feePaidSar = paidNum;

    try {
      const updated = await updateLawyerClient(client.id, { ...patch, ...ratingPatch } as UpdateLawyerClientInput);
      setClient(updated);
      setIsEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "تعذّر حفظ التعديلات.");
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Shared styling ─────────────────────────────────────────────────────────
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const inputCls = `w-full px-3 py-2 rounded-lg border text-[12px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.08] bg-white/[0.03] text-zinc-200 placeholder:text-zinc-600 focus:border-royal/50"
      : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-royal/50"
  }`;
  const labelCls = `text-[10px] font-bold mb-1 block ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  const STATUS_CASE = {
    active:  { label: "نشطة",  dot: "bg-emerald-500", text: "text-emerald-500" },
    pending: { label: "معلقة", dot: "bg-amber-500",    text: "text-amber-500" },
    closed:  { label: "مغلقة", dot: "bg-slate-400",    text: "text-slate-400" },
  };

  // ── Loading / notfound / unreadable ───────────────────────────────────────
  if (clientState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        <p className={isDark ? "text-zinc-500" : "text-slate-400"}>جاري تحميل بيانات الموكّل...</p>
      </div>
    );
  }

  if (clientState === "unreadable") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
        <Warning size={40} weight="duotone" className="text-red-500" />
        <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{clientErrorMsg}</p>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم تنجح القراءة — هذا لا يعني أن الموكّل غير موجود.</p>
        <button onClick={loadClient} className="flex items-center gap-1.5 text-sm font-bold text-royal hover:underline">
          <ArrowClockwise size={14} /> إعادة المحاولة
        </button>
        <Link href="/dashboard/lawyer/clients" className="text-sm text-royal hover:underline flex items-center gap-1">
          <CaretLeft size={12} /> العودة لدليل الموكّلين
        </Link>
      </div>
    );
  }

  if (clientState === "notfound" || !client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
        <User size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الموكّل غير موجود</p>
        <Link href="/dashboard/lawyer/clients" className="text-sm text-royal hover:underline flex items-center gap-1">
          <CaretLeft size={12} /> العودة لدليل الموكّلين
        </Link>
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────
  const hasFees = client.feeTotalSar !== null;
  const outstanding = hasFees ? (client.feeTotalSar as number) - (client.feePaidSar ?? 0) : null;
  const payPct = hasFees && (client.feeTotalSar as number) > 0
    ? Math.round(((client.feePaidSar ?? 0) / (client.feeTotalSar as number)) * 100)
    : null;

  const hasIdentityFacts =
    client.clientType === "individual"
      ? client.hasNationalId || !!client.powerOfAttorneyNo
      : client.clientType === "company"
        ? !!client.commercialRegisterNo || !!client.taxNumber || !!client.unifiedNumber700
        : false;

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 pb-10" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-1.5 text-[12px]">
        <Link href="/dashboard/lawyer/clients" className={`hover:underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          الموكّلون
        </Link>
        <CaretLeft size={10} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{client.name}</span>
      </motion.div>

      {/* Related-fetch error banner */}
      {relatedError && (
        <div className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <Warning size={18} className="text-red-500 flex-shrink-0" />
          <p className={`text-[12px] font-semibold flex-1 ${isDark ? "text-red-400" : "text-red-600"}`}>
            {relatedError} — القائمتان أدناه لا تعرضان بيانات لأن القراءة لم تنجح، لا لأن الموكّل بلا سجلات.
          </p>
          {isSupabaseMode && (
            <button onClick={loadRelated} className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
              <ArrowClockwise size={13} /> إعادة المحاولة
            </button>
          )}
        </div>
      )}

      {relatedTruncated && !relatedError && (
        <div className={`rounded-2xl px-4 py-2.5 border flex items-center gap-2 text-[11px] ${
          isDark ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
        }`}>
          <Warning size={14} weight="fill" className="flex-shrink-0" />
          <span>لهذا الموكّل سجلات أكثر مما يعرضه هذا الصفحة — القائمتان أدناه غير مكتملتين.</span>
        </div>
      )}

      {/* ── Hero Card ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} overflow-hidden`}>
        <div className={`h-1.5 w-full ${client.flags.includes("vip") ? "bg-gradient-to-l from-amber-400 to-amber-600" : client.flags.includes("urgent") ? "bg-gradient-to-l from-red-400 to-red-600" : "bg-gradient-to-l from-[#0B3D2E] to-[#1a6b4e]"}`} />

        <div className="p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex items-start gap-4 flex-1">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-black shadow-sm ${client.clientType === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400"}`}>
              {client.clientType === "company" ? <Buildings size={28} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}
                  style={{ fontFamily: "var(--font-brand)" }}>{client.name}</h1>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                  {client.source === "card" ? "بطاقة موكّل" : "حساب منصة بلا بطاقة"}
                </span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  client.status === "active" ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                  : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                }`}>{STATUS_LABEL[client.status]}</span>
                {/* Stars only when the lawyer actually rated this client. */}
                {client.rating !== null && (
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} weight={i < (client.rating ?? 0) ? "fill" : "regular"}
                        className={i < (client.rating ?? 0) ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                    ))}
                  </div>
                )}
              </div>
              {client.flags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {client.flags.map(f => {
                    const fc = FLAG_CONFIG[f];
                    if (!fc) return null;
                    return (
                      <span key={f} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${fc.bg} ${fc.color}`}>
                        {fc.emoji} {fc.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className={`flex flex-wrap gap-4 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {client.phone && <span className="flex items-center gap-1"><Phone size={10} /> {client.phone}</span>}
                {client.email && <span className="flex items-center gap-1 dir-ltr"><EnvelopeSimple size={10} /> {client.email}</span>}
                {client.city && <span className="flex items-center gap-1"><MapPin size={10} /> {client.city}</span>}
                {client.lastActivity && (
                  <span className="flex items-center gap-1"><CalendarBlank size={10} /> آخر نشاط: {formatDate(client.lastActivity)}</span>
                )}
              </div>

              {/* Identity block — never a raw ID, only what the DB actually says was recorded. */}
              {hasIdentityFacts && (
                <div className={`flex flex-wrap gap-4 mt-2 pt-2 border-t text-[11px] ${isDark ? "border-white/[0.05] text-zinc-400" : "border-slate-100 text-slate-500"}`}>
                  {client.clientType === "individual" && client.hasNationalId && (
                    <span className="flex items-center gap-1"><IdentificationCard size={11} className="text-emerald-500" /> الهوية: مسجَّلة ✓</span>
                  )}
                  {client.clientType === "individual" && client.powerOfAttorneyNo && (
                    <span className="flex items-center gap-1"><IdentificationCard size={11} /> الوكالة: {client.powerOfAttorneyNo}</span>
                  )}
                  {client.clientType === "company" && client.commercialRegisterNo && (
                    <span className="flex items-center gap-1"><Buildings size={11} /> السجل التجاري: {client.commercialRegisterNo}</span>
                  )}
                  {client.clientType === "company" && client.taxNumber && (
                    <span className="flex items-center gap-1"><Buildings size={11} /> الرقم الضريبي: {client.taxNumber}</span>
                  )}
                  {client.clientType === "company" && client.unifiedNumber700 && (
                    <span className="flex items-center gap-1"><Buildings size={11} /> الرقم الموحد: {client.unifiedNumber700}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Edit affordance — only for an actual card. A "profile" row (a
              platform account with requests but no card yet) has no
              lawyer_clients row for updateLawyerClient to write to. */}
          <div className="flex-shrink-0">
            {client.source === "card" ? (
              !isEditing && (
                <button onClick={openEdit}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                    isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  <PencilSimple size={13} /> تعديل
                </button>
              )
            ) : (
              <p className={`text-[10px] max-w-[180px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                لا توجد بطاقة موكّل لهذا الحساب بعد — لا يمكن التعديل.
              </p>
            )}
          </div>
        </div>

        {/* Inline edit panel */}
        {isEditing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className={`px-5 pb-5 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>الهاتف</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} placeholder="05xxxxxxxx" />
              </div>
              <div>
                <label className={labelCls}>البريد الإلكتروني</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} placeholder="name@example.com" dir="ltr" />
              </div>
              <div>
                <label className={labelCls}>المدينة</label>
                <input value={editCity} onChange={e => setEditCity(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>الحالة</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value as ClientStatus)} className={inputCls}>
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                  <option value="archived">مؤرشف</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>إجمالي الأتعاب (﷼)</label>
                <input value={editFeeTotal} onChange={e => setEditFeeTotal(e.target.value)} className={inputCls} placeholder="بلا تغيير" inputMode="decimal" />
              </div>
              <div>
                <label className={labelCls}>المبلغ المسدّد (﷼)</label>
                <input value={editFeePaid} onChange={e => setEditFeePaid(e.target.value)} className={inputCls} placeholder="بلا تغيير" inputMode="decimal" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>التقييم</label>
                <div className="flex items-center gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <button key={i} type="button" onClick={() => setEditRating(i + 1)}>
                      <Star size={18} weight={editRating !== null && i < editRating ? "fill" : "regular"}
                        className={editRating !== null && i < editRating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                    </button>
                  ))}
                  {editRating !== null && (
                    <button type="button" onClick={() => setEditRating(null)}
                      className={`text-[10px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                      مسح
                    </button>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>التصنيفات</label>
                <div className="flex flex-wrap gap-2">
                  {CLIENT_FLAGS.map(f => {
                    const fc = FLAG_CONFIG[f];
                    const active = editFlags.has(f);
                    return (
                      <button key={f} type="button" onClick={() => toggleEditFlag(f)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                          active ? `${fc.bg} ${fc.color} border-current/30` : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"
                        }`}>
                        {fc.emoji} {fc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {editError && (
              <p className="mt-3 text-[11px] font-semibold text-red-500">{editError}</p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] disabled:opacity-50 transition-colors">
                <FloppyDisk size={14} /> {savingEdit ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </button>
              <button onClick={() => setIsEditing(false)} disabled={savingEdit}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                  isDark ? "text-zinc-400 hover:bg-white/[0.05]" : "text-slate-500 hover:bg-slate-100"
                }`}>
                <X size={14} /> إلغاء
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ── KPI Stats ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Gavel,    label: "طلبات نشطة", value: client.activeCount, color: "text-emerald-500", sub: `${client.closedCount} مغلقة` },
          {
            icon: ChatDots,
            label: "الاستشارات",
            value: consultsView === "ready" || consultsView === "empty" ? relatedConsults.length : "—",
            color: "text-blue-500",
            sub: consultsView === "loading" ? "جارٍ القراءة"
              : consultsView === "unreadable" ? "تعذّرت القراءة"
              : "مسجّلة",
          },
          ...(hasFees ? [{
            icon: CurrencyCircleDollar,
            label: "إجمالي الأتعاب",
            value: `${(client.feeTotalSar as number).toLocaleString()} ﷼`,
            color: (outstanding ?? 0) > 0 ? "text-red-500" : "text-emerald-500",
            sub: (outstanding ?? 0) > 0 ? `متبقي ${(outstanding as number).toLocaleString()} ﷼` : "مسدّدة بالكامل",
          }] : []),
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.04 }}
            className={`${card} p-4`}>
            <div className="flex items-start justify-between mb-2">
              <kpi.icon size={18} className={kpi.color} weight="duotone" />
            </div>
            <p className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>{kpi.value}</p>
            <p className={`text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{kpi.label}</p>
            <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>{kpi.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Main Grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column: Cases + Consultations */}
        <div className="lg:col-span-2 space-y-4">

          {/* Cases */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <Gavel size={15} className="text-[#0B3D2E] dark:text-emerald-400" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>القضايا</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                  {casesView === "ready" || casesView === "empty" ? relatedCases.length : "—"}
                </span>
              </div>
              <Link href={`/dashboard/lawyer/cases?client=${clientId}`}
                className={`text-[11px] font-semibold flex items-center gap-0.5 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}>
                عرض الكل <ArrowRight size={10} />
              </Link>
            </div>
            {casesView === "loading" ? (
              <div className="p-8 text-center">
                <div className="inline-block w-6 h-6 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
                <p className={`text-[12px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>جارٍ قراءة القضايا…</p>
              </div>
            ) : casesView === "unreadable" ? (
              <div className="p-8 text-center">
                <Warning size={28} weight="duotone" className="mx-auto mb-2 text-red-500" />
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة القضايا</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  هذه ليست قائمة فارغة — قد تكون لهذا الموكّل قضايا لم تُقرأ.
                </p>
              </div>
            ) : casesView === "empty" ? (
              <div className="p-8 text-center">
                <Scales size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} weight="duotone" />
                <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد قضايا</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04] dark:divide-white/[0.04]">
                {relatedCases.map(c => {
                  const st = STATUS_CASE[c.status];
                  return (
                    <Link key={c.id} href={`/dashboard/lawyer/cases/${c.id}`}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-royal/[0.03] transition-colors group`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.date}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"} ${st.text}`}>{st.label}</span>
                      <ArrowRight size={12} className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Consultations */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <ChatDots size={15} className="text-blue-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الاستشارات</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                  {consultsView === "ready" || consultsView === "empty" ? relatedConsults.length : "—"}
                </span>
              </div>
            </div>
            {consultsView === "loading" ? (
              <div className="p-8 text-center">
                <div className="inline-block w-6 h-6 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
                <p className={`text-[12px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>جارٍ قراءة الاستشارات…</p>
              </div>
            ) : consultsView === "unreadable" ? (
              <div className="p-8 text-center">
                <Warning size={28} weight="duotone" className="mx-auto mb-2 text-red-500" />
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة الاستشارات</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  هذه ليست قائمة فارغة — قد تكون لهذا الموكّل استشارات لم تُقرأ.
                </p>
              </div>
            ) : consultsView === "empty" ? (
              <div className="p-8 text-center">
                <ChatDots size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} weight="duotone" />
                <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد استشارات</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {relatedConsults.map(q => (
                  <div key={q.id} className="flex items-center gap-3 px-4 py-3">
                    {q.status === "done"
                      ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" weight="duotone" />
                      : <Clock size={14} className="text-amber-500 flex-shrink-0" weight="duotone" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{q.title}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {q.status === "done" ? "منتهية" : "قيد الانتظار"}{q.date ? ` · ${q.date}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column: Financial position + Notes */}
        <div className="space-y-4">

          {/* Financial position — item 81. The fee agreement the lawyer typed
              in, not a payment record: no payment provider is connected. */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الوضع المالي</p>
            {!hasFees ? (
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا اتفاق أتعاب مسجَّلاً</p>
            ) : (
              <>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إجمالي الأتعاب</p>
                    <p className={`text-base font-black ${isDark ? "text-white" : "text-slate-800"}`}>{(client.feeTotalSar as number).toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
                  </div>
                  <div className="text-left">
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مسدّد</p>
                    <p className={`text-base font-black ${isDark ? "text-white" : "text-slate-800"}`}>{(client.feePaidSar ?? 0).toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
                  </div>
                </div>
                {(outstanding ?? 0) > 0 && (
                  <p className="text-[12px] font-bold text-red-500 mb-2">متبقٍ: {(outstanding as number).toLocaleString()} ﷼</p>
                )}
                {payPct !== null && (
                  <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <div
                      className={`h-full rounded-full transition-all ${payPct === 100 ? "bg-emerald-500" : payPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${payPct}%` }} />
                  </div>
                )}
                {payPct !== null && (
                  <p className={`text-[9px] font-bold mt-1 text-left ${payPct === 100 ? "text-emerald-500" : payPct >= 50 ? "text-amber-500" : "text-red-500"}`}>{payPct}% مسدّد</p>
                )}
                <p className={`text-[9px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  أرقام مُدخَلة يدوياً — لا يوجد سجل مدفوعات في النظام.
                </p>
              </>
            )}
            {firstEngagement && (
              <div className={`flex items-center justify-between mt-3 pt-3 border-t text-[11px] ${isDark ? "border-white/[0.05] text-zinc-500" : "border-slate-100 text-slate-400"}`}>
                <span>أول تعامل</span>
                <span className={`font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{formatDate(firstEngagement)}</span>
              </div>
            )}
          </motion.div>

          {/* Confidential notes */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <Notepad size={15} className="text-amber-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ملاحظات سرية</span>
                {(notesView === "ready" || notesView === "empty") && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>{notes.length}</span>
                )}
              </div>
            </div>

            <div className={`px-4 py-2 flex items-start gap-1.5 text-[10px] border-b ${isDark ? "border-white/[0.05] bg-amber-500/[0.06] text-amber-400" : "border-slate-100 bg-amber-50 text-amber-700"}`}>
              <LockKey size={12} className="flex-shrink-0 mt-0.5" />
              <span>سرية بالكامل — الموكّل لا يرى هذه الملاحظات أبداً. «للمكتب» تُشارَك مع زملائك النشطين في المكتب فقط.</span>
            </div>

            <div className="p-4">
              <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
                <textarea
                  value={noteBody} onChange={e => setNoteBody(e.target.value)}
                  placeholder="أضف ملاحظة جديدة..."
                  onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) submitNote(); }}
                  rows={2}
                  className={`w-full bg-transparent text-[12px] outline-none resize-none ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[10px]">
                    <button type="button" onClick={() => setNoteVisibility("private")}
                      className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                        noteVisibility === "private"
                          ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                          : isDark ? "text-zinc-600" : "text-slate-400"
                      }`}>خاصة بي</button>
                    <button type="button" onClick={() => setNoteVisibility("firm")}
                      className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                        noteVisibility === "firm"
                          ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                          : isDark ? "text-zinc-600" : "text-slate-400"
                      }`}>للمكتب</button>
                  </div>
                  <button onClick={submitNote}
                    disabled={!noteBody.trim() || addingNote}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-all">
                    {addingNote ? "جارٍ الحفظ…" : "إضافة"}
                  </button>
                </div>
              </div>

              {noteError && <p className="mt-2 text-[11px] font-semibold text-red-500">{noteError}</p>}

              <div className="mt-3 space-y-2">
                {notesView === "loading" && (
                  <div className="text-center py-4">
                    <div className="inline-block w-5 h-5 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
                  </div>
                )}
                {notesView === "unreadable" && (
                  <div className="text-center py-4">
                    <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة الملاحظات</p>
                    <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد ملاحظات لم تُقرأ.</p>
                    <button onClick={loadNotes} className="mt-1.5 flex items-center gap-1 mx-auto text-[10px] font-bold text-royal hover:underline">
                      <ArrowClockwise size={11} /> إعادة المحاولة
                    </button>
                  </div>
                )}
                {notesView === "empty" && (
                  <p className={`text-center text-[11px] py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات بعد</p>
                )}
                {notesView === "ready" && notes.map(note => (
                  <motion.div key={note.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className={`relative p-3 rounded-xl border text-[11px] leading-relaxed transition-all ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-white"}`}>
                    <p className={`mb-1.5 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.body}</p>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-2 text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {formatDate(note.createdAt)}
                        <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                          note.visibility === "firm"
                            ? isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                            : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                        }`}>{note.visibility === "firm" ? "للمكتب" : "خاصة بي"}</span>
                      </span>
                      {note.mine && (
                        <button onClick={() => removeNote(note.id)} disabled={deletingNoteId === note.id}
                          className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold transition-all disabled:opacity-40 ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                          <Trash size={10} /> حذف
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </div>

    </div>
  );
}
