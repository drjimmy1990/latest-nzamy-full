"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Buildings, Gavel, ArrowRight, ListChecks, X, Warning, Star, User,
  LinkSimple, IdentificationCard,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FLAG_CONFIG } from "@/constants/lawyerClientsData";
import { apiGet } from "@/lib/services/api";
import { createLawyerClient, type LawyerClient } from "@/lib/services/lawyerClientsService";

/** One real service_requests row linked to this client. */
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
function formatContactDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function ClientDrawer({ client, isDark, onClose }: { client: LawyerClient; isDark: boolean; onClose: () => void }) {
  const router = useRouter();
  const hasTotal = client.feeTotalSar !== null;
  const hasPaid = client.feePaidSar !== null;
  const outstanding = hasTotal && hasPaid ? (client.feeTotalSar as number) - (client.feePaidSar as number) : null;

  // ── A2: create a card for a "profile" row, straight from the drawer ──────
  // Same call and the same prefill as the client-file page's version — the
  // account's own name/phone/email, and `clientUserId` linking the new card
  // back to it immediately, so it never re-appears as an unlinked "profile".
  const [creatingCard, setCreatingCard] = useState(false);
  const [createCardError, setCreateCardError] = useState<string | null>(null);

  const createCardForProfile = async () => {
    if (client.source !== "profile" || creatingCard) return;
    setCreatingCard(true);
    setCreateCardError(null);
    try {
      const created = await createLawyerClient({
        name: client.name,
        clientType: "individual",
        phone: client.phone ?? undefined,
        email: client.email ?? undefined,
        clientUserId: client.clientUserId ?? client.id,
      });
      router.push(`/dashboard/lawyer/clients/${created.id}`);
    } catch (e) {
      setCreateCardError(e instanceof Error ? e.message : "تعذّر إنشاء بطاقة الموكّل.");
      setCreatingCard(false);
    }
  };

  // ── Linked requests ────────────────────────────────────────────────────────
  // A "card" client is a public.lawyer_clients row — service-requests are
  // linked to it via lawyer_client_id (migration 20260903_phase2). A "profile"
  // client has no card yet; its `id` IS the platform account's user id, so its
  // requests are found by requester_user_id instead. A card linked to a real
  // account (clientUserId set) sends both, so a request filed before the card
  // existed is still found.
  const [linked, setLinked] = useState<LinkedRequest[] | null>(null);
  const [linkedError, setLinkedError] = useState<string | null>(null);

  const loadLinked = useCallback(() => {
    const params: Record<string, string | number> = { limit: 100 };
    if (client.source === "card") params.lawyer_client_id = client.id;
    if (client.clientUserId) params.requester_user_id = client.clientUserId;

    // Neither key set is not a real state today (every card or profile row
    // carries at least one), but if it ever happens there is nothing to ask
    // the endpoint — querying with no filter would return every request the
    // lawyer can see, attributed to this one client.
    if (!params.lawyer_client_id && !params.requester_user_id) {
      setLinked([]);
      return;
    }

    setLinkedError(null);
    setLinked(null);
    apiGet<{ data: LinkedRequest[]; degraded?: boolean }>("/api/v1/service-requests", params)
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
  }, [client.id, client.source, client.clientUserId]);

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
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${client.clientType === "company" ? "bg-indigo-500/10 text-indigo-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              {client.clientType === "company" ? <Buildings size={18} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{client.name}</p>
              <p className={`text-[10px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {client.source === "profile" ? "حساب على المنصّة" : "بطاقة"}
              </p>
              {/* A2: a card linked to a platform account — the chip only;
                  linking/unlinking itself lives on the full client-file page. */}
              {client.source === "card" && client.clientUserId && (
                <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                  <LinkSimple size={9} /> مربوطة بحساب على المنصّة
                </span>
              )}
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

          {/* A2: a "profile" row has no lawyer_clients row yet — this is how
              one gets made, prefilled from the account, linked immediately. */}
          {client.source === "profile" && (
            <div className={`p-3 rounded-xl border ${isDark ? "border-royal/30 bg-royal/[0.06]" : "border-royal/20 bg-royal/[0.04]"}`}>
              <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                حساب على المنصّة بلا بطاقة موكّل بعد — أنشئ واحدة لتسجيل ملاحظات وأتعاب وتصنيفات لهذا الموكّل.
              </p>
              <button onClick={createCardForProfile} disabled={creatingCard}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] disabled:opacity-50 transition-colors">
                <IdentificationCard size={14} weight="duotone" /> {creatingCard ? "جارٍ الإنشاء…" : "إنشاء بطاقة موكّل"}
              </button>
              {createCardError && <p className="mt-2 text-[10px] font-semibold text-red-500">{createCardError}</p>}
            </div>
          )}

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
              `feeTotalSar === null` means nobody ever entered one; printing 0 ﷼
              would be a claim about this client's account. `feePaidSar` is
              independently nullable — an agreed total with no advance on
              record yet is a real, different state from a settled one. */}
          {hasTotal && (
            <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${panelTitle}`}>الأتعاب المتفق عليها</p>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي الأتعاب</span>
                <span className={`font-bold text-[13px] ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{(client.feeTotalSar as number).toLocaleString()} ﷼</span>
              </div>
              {hasPaid && (
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المسدَّد</span>
                  <span className="font-bold text-[13px] text-emerald-500">{(client.feePaidSar as number).toLocaleString()} ﷼</span>
                </div>
              )}
              {outstanding !== null && outstanding > 0 && (
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المتبقٍّ</span>
                  <span className="font-bold text-[13px] text-red-500">{outstanding.toLocaleString()} ﷼</span>
                </div>
              )}
              {hasPaid && (client.feeTotalSar as number) > 0 && (
                <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                  <div className={`h-full rounded-full ${outstanding === 0 ? "bg-emerald-500" : (outstanding ?? 0) > (client.feeTotalSar as number) * 0.5 ? "bg-red-500" : "bg-amber-500"}`}
                    style={{ width: `${Math.round(((client.feePaidSar as number) / (client.feeTotalSar as number)) * 100)}%` }} />
                </div>
              )}
            </div>
          )}

          {/* Linked service requests */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${panelTitle}`}>
              <Gavel size={10} className="inline me-1" />
              الطلبات المرتبطة{linked ? ` (${linked.length})` : ""}
            </p>

            {linkedError ? (
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

          {/* The full client file (identity block, confidential notes, inline
              edit) lives at /dashboard/lawyer/clients/[id]. Until 2026-09-04
              nothing linked to it — a skeptic pass on the owner's test guide
              found the page reachable only by typing the URL. First button. */}
          <Link href={`/dashboard/lawyer/clients/${encodeURIComponent(client.id)}`}
            className="flex items-center justify-center gap-2 p-3 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition-colors">
            <User size={14} weight="duotone" /> ملف الموكّل الكامل <ArrowRight size={11} className="opacity-70" />
          </Link>

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
