"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ticket } from "@phosphor-icons/react";
import { ticketStatusAr } from "@/lib/admin/ticketsQuery";

/**
 * «تذاكر الدعم» on one user's admin page — live check of 13 Nov, row 31.
 *
 * The tab used to print the same three invented tickets (#١٢٨ «مشكلة في تصدير
 * PDF», #١٠٤, #٨٩) for every account. It now reads that account's own rows
 * from GET /api/v1/admin/tickets?user_id=…, with an honest loading, error and
 * empty state: a failed read never reads as «no tickets».
 */
type TicketRow = { id: string; subject: string | null; status: string | null; created_at: string | null };
type State = { status: "loading" } | { status: "error" } | { status: "ready"; tickets: TicketRow[] };

export const USER_TICKETS_LIMIT = 50;

export default function UserTicketsPanel({
  userId, isDark, cardClass, timeAgo,
}: {
  userId: string;
  isDark: boolean;
  cardClass: string;
  timeAgo: (d: string | null | undefined) => string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/admin/tickets?user_id=${encodeURIComponent(userId)}&limit=${USER_TICKETS_LIMIT}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { data?: TicketRow[] };
        if (!cancelled) setState({ status: "ready", tickets: Array.isArray(body.data) ? body.data : [] });
      })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  const muted = isDark ? "text-zinc-600" : "text-slate-400";
  return (
    <div className={`${cardClass} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>تذاكر الدعم</p>
        <Link href="/dashboard/admin/tickets" className="text-[11px] font-semibold text-[#C8A762] hover:underline">كل التذاكر</Link>
      </div>
      {state.status === "loading" && <p className={`py-8 text-center text-[12px] ${muted}`}>جارٍ التحميل…</p>}
      {state.status === "error" && (
        <div className="py-8 text-center">
          <p className="text-[12px] text-red-400">تعذّر تحميل تذاكر هذا المستخدم.</p>
          <button
            type="button"
            onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }}
            className="mt-3 rounded-lg border border-zinc-500/30 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {state.status === "ready" && state.tickets.length === 0 && (
        <p className={`py-8 text-center text-[12px] ${muted}`}>لا توجد تذاكر دعم لهذا المستخدم.</p>
      )}
      {state.status === "ready" && state.tickets.map((t, i) => {
        const open = t.status === "open" || t.status === "pending";
        return (
          <div key={t.id} className={`flex items-center gap-3 py-3 ${i < state.tickets.length - 1 ? `border-b ${isDark ? "border-white/[0.04]" : "border-slate-50"}` : ""}`}>
            <Ticket size={14} className={open ? "text-orange-400" : "text-zinc-500"} />
            <p className={`flex-1 text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{t.subject?.trim() || "—"}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
              open ? "border-orange-500/20 bg-orange-500/10 text-orange-400" : "border-zinc-500/20 bg-zinc-500/10 text-zinc-500"
            }`}>{ticketStatusAr(t.status)}</span>
            <span className={`text-[10px] ${muted}`}>{timeAgo(t.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
