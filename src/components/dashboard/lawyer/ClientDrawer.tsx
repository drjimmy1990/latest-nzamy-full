"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Buildings, Gavel, ArrowRight, ListChecks, X, Warning, Star,
} from "@phosphor-icons/react";
import Link from "next/link";
import { type ClientFlag, FLAG_CONFIG } from "@/constants/lawyerClientsData";
import { apiGet } from "@/lib/services/api";

/**
 * The client shape both the directory page and this drawer render.
 *
 * It is NOT `Client` from src/constants/lawyerClientsData.ts. That interface
 * declares `totalFees`, `paidFees` and `rating` as non-optional numbers, which
 * is exactly what forced the page to invent `totalFees: 0` / `rating: 3` for
 * every row the API returned. Here each of those is nullable, and `null` means
 * "the platform has no such figure" — which the UI must render by omitting the
 * label, never by printing a 0.
 *
 * It lives in this file rather than in the constants module because that module
 * is the mock-data file (MOCK_CLIENTS) and is outside this change; keeping the
 * honest view-model next to the component that consumes it avoids editing it.
 */
export interface LawyerClientView {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  /** "profile" = a real platform account; "manual" = a card typed into AddClientModal. */
  source: "profile" | "manual";
  type: "individual" | "company" | null;
  flags: ClientFlag[];
  rating: number | null;
  totalFees: number | null;
  paidFees: number | null;
  /** Service requests in flight — NOT a case count. */
  activeRequests: number;
  closedRequests: number;
  lastContact: string;
}

/**
 * Exactly what GET (and POST) /api/v1/lawyer/clients return. Every
 * classification field is `null` when the platform holds no such value.
 */
export interface LawyerClientApiRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  userType: string | null;
  source: "profile" | "manual";
  requestCount: number;
  activeCount: number;
  closedCount: number;
  lastActivity: string | null;
  clientType: "individual" | "company" | null;
  flags: string[] | null;
  rating: number | null;
  totalFees: number | null;
  paidFees: number | null;
}

const isKnownFlag = (f: string): f is ClientFlag => f in FLAG_CONFIG;

/**
 * API row → the shape the directory card and this drawer render.
 *
 * Lives here, next to `LawyerClientView`, because both the clients page and
 * AddClientModal need it and this component imports neither — putting it in
 * the page would make the modal import the page it is rendered by.
 *
 * Note what this function does NOT do: it never substitutes a value. The old
 * mapper wrote `rating: (d.rating || 3)`, `totalFees: 0`, `paidFees: 0` and
 * `flags: []` for every row, which is where the fabricated 3-star rating and
 * the green «✓» under «متبقي» came from.
 */
export function toLawyerClientView(d: LawyerClientApiRow): LawyerClientView {
  return {
    id: d.id,
    name: d.name || "عميل نظامي",
    email: d.email || "",
    phone: d.phone || "",
    avatar: d.avatar || "",
    source: d.source,
    // Only a manually-added client has an entity type on record. For a platform
    // account the endpoint sends null and the card falls back to the neutral
    // initial avatar rather than guessing "individual".
    type: d.clientType,
    flags: (d.flags ?? []).filter(isKnownFlag),
    rating: d.rating,
    totalFees: d.totalFees,
    paidFees: d.paidFees,
    activeRequests: d.activeCount ?? 0,
    closedRequests: d.closedCount ?? 0,
    lastContact: formatContactDate(d.lastActivity),
  };
}

/** One real service_requests row belonging to this client. */
interface LinkedRequest {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string | null;
}

const STATUS_LBL: Record<string, string> = {
  pending: "بانتظار",
  pending_assignment: "بانتظار التوجيه",
  pending_payment: "بانتظار السداد",
  assigned: "قيد العمل",
  in_review: "قيد المراجعة",
  in_progress: "قيد العمل",
  completed: "مكتملة",
  cancelled: "ملغاة",
  draft: "مسودة",
};

const STATUS_DOT: Record<string, string> = {
  assigned: "bg-emerald-400",
  in_review: "bg-blue-400",
  in_progress: "bg-emerald-400",
  pending: "bg-amber-400",
  pending_assignment: "bg-amber-400",
  pending_payment: "bg-amber-400",
  completed: "bg-slate-400",
  cancelled: "bg-slate-400",
  draft: "bg-slate-400",
};

/** ISO timestamp → a readable Arabic date, or "" when there is nothing to show
 *  (callers omit the line entirely rather than printing a placeholder). */
export function formatContactDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ClientDrawer({ client, isDark, onClose }: { client: LawyerClientView; isDark: boolean; onClose: () => void }) {
  const unpaid = client.totalFees !== null && client.paidFees !== null
    ? client.totalFees - client.paidFees
    : null;

  // ── Linked requests ────────────────────────────────────────────────────────
  // This panel used to read CLIENT_CASES / CLIENT_TASKS — two literal objects
  // keyed by seven hardcoded Arabic client names, complete with invented court
  // names and invented next-hearing dates. For every real client it rendered
  // «لا توجد قضايا مرتبطة» while the card behind it showed a live count, and for
  // any real client whose name happened to collide with one of the seven it
  // would have presented a fabricated case file for an actual person.
  //
  // The tasks half is gone rather than rewired: lawyer tasks are
  // receiver="lawyer" service_requests with no client key on them, so there is
  // no link in the schema to read. A section with no possible source is a
  // promise, not an empty state.
  const [linked, setLinked] = useState<LinkedRequest[] | null>(null);
  const [linkedError, setLinkedError] = useState<string | null>(null);

  const loadLinked = useCallback(() => {
    // A manual client's id is a service_requests row id, not a user id, and
    // nothing in the schema points at it. Querying would be a guaranteed empty
    // result dressed up as a fact about the client, so we do not query at all.
    if (client.source !== "profile") return;
    setLinkedError(null);
    setLinked(null);
    apiGet<{ data: LinkedRequest[]; degraded?: boolean }>("/api/v1/service-requests", {
      requester_user_id: client.id,
      limit: 100,
    })
      .then((res) => {
        // /api/v1/service-requests answers a failed query with HTTP 200 and
        // { data: [], degraded: true }. Without this check a database fault
        // renders as "this client has no requests".
        if (res?.degraded) {
          setLinkedError("تعذّر تحميل الطلبات المرتبطة.");
          return;
        }
        setLinked(Array.isArray(res?.data) ? res.data : []);
      })
      .catch((e) => {
        console.error("[ClientDrawer] linked requests fetch failed:", e);
        setLinkedError("تعذّر تحميل الطلبات المرتبطة.");
      });
  }, [client.id, client.source]);

  useEffect(() => { loadLinked(); }, [loadLinked]);

  const panelTitle = isDark ? "text-zinc-500" : "text-slate-400";
  const muted = isDark ? "text-zinc-600" : "text-slate-400";

  return (
    <>
      {/* Backdrop */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose} />

      {/* Panel */}
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        className="fixed inset-y-0 left-0 z-50 w-full max-w-sm overflow-y-auto"
        style={{ backgroundColor: isDark ? "#18181b" : "#ffffff" }}
        dir="rtl">

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${client.type === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              {client.type === "company" ? <Buildings size={18} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
              {/* No phone on record → no line. An em dash under a name reads as
                  a value; an absent line reads as an absence. */}
              {client.phone && (
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`} dir="ltr">{client.phone}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Rating — only when the lawyer actually gave one. */}
          {client.rating !== null && (
            <div className="flex items-center gap-2">
              <p className={`text-[11px] font-black uppercase tracking-wider ${panelTitle}`}>تقييم الموكّل</p>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star key={si} size={12} weight={si < (client.rating ?? 0) ? "fill" : "regular"}
                    className={si < (client.rating ?? 0) ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                ))}
              </div>
            </div>
          )}

          {/* Flags */}
          {client.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {client.flags.map(f => {
                const fc = FLAG_CONFIG[f];
                if (!fc) return null;
                return (
                  <span key={f} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fc.bg} ${fc.color}`}>
                    {fc.emoji} {fc.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Fee summary — rendered only when a fee agreement is on record.
              `totalFees === null` means nobody ever entered one; printing 0 ﷼
              (or a settled «✓») would be a claim about this client's account. */}
          {client.totalFees !== null && client.paidFees !== null && (
            <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${panelTitle}`}>الأتعاب المتفق عليها</p>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي الأتعاب</span>
                <span className={`font-bold text-[13px] ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{client.totalFees.toLocaleString()} ﷼</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المسدَّد</span>
                <span className="font-bold text-[13px] text-emerald-500">{client.paidFees.toLocaleString()} ﷼</span>
              </div>
              {unpaid !== null && unpaid > 0 && (
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المتبقي</span>
                  <span className="font-bold text-[13px] text-red-500">{unpaid.toLocaleString()} ﷼</span>
                </div>
              )}
              {client.totalFees > 0 && (
                <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                  <div className={`h-full rounded-full ${unpaid === 0 ? "bg-emerald-500" : (unpaid ?? 0) > client.totalFees * 0.5 ? "bg-red-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.round((client.paidFees / client.totalFees) * 100)}%` }} />
                </div>
              )}
              <p className={`text-[10px] mt-2 ${muted}`}>
                أرقام مُدخَلة يدوياً عند إضافة الموكّل — لا يوجد سجل مدفوعات في النظام.
              </p>
            </div>
          )}

          {/* Linked service requests */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${panelTitle}`}>
              <Gavel size={10} className="inline me-1" />
              الطلبات المرتبطة{linked ? ` (${linked.length})` : ""}
            </p>

            {client.source !== "profile" ? (
              <p className={`text-[12px] leading-relaxed ${muted}`}>
                هذا الموكّل مُضاف يدوياً ولا يملك حساباً على المنصة، فلا توجد طلبات مرتبطة به في النظام.
              </p>
            ) : linkedError ? (
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${isDark ? "border-red-500/20 bg-red-500/5 text-red-400" : "border-red-200 bg-red-50 text-red-600"}`}>
                <Warning size={14} weight="fill" className="flex-shrink-0" />
                <span className="text-[11px] font-semibold flex-1">{linkedError}</span>
                <button onClick={loadLinked} className="text-[11px] font-bold underline flex-shrink-0">إعادة المحاولة</button>
              </div>
            ) : linked === null ? (
              <p className={`text-[12px] ${muted}`}>جارٍ التحميل…</p>
            ) : linked.length === 0 ? (
              <p className={`text-[12px] ${muted}`}>لا توجد طلبات مرتبطة</p>
            ) : linked.map(r => (
              <div key={r.id}
                className={`flex items-start gap-3 p-3 rounded-xl mb-2 ${isDark ? "border border-white/[0.04]" : "border border-slate-100"}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[r.status] ?? "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{r.title || "بدون عنوان"}</p>
                  <p className={`text-[10px] mt-0.5 ${muted}`}>
                    {STATUS_LBL[r.status] ?? r.status}
                    {formatContactDate(r.createdAt) ? ` · ${formatContactDate(r.createdAt)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions — plain navigation, no per-client filter promised:
              /dashboard/lawyer/cases does not read a ?client= param. */}
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/lawyer/tasks"
              className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <ListChecks size={14} /> المهام
            </Link>
            <Link href="/dashboard/lawyer/cases"
              className={`flex items-center gap-2 p-3 rounded-xl border text-[11px] font-bold transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <Gavel size={14} /> القضايا <ArrowRight size={11} className="opacity-60" />
            </Link>
          </div>

        </div>
      </motion.div>
    </>
  );
}
