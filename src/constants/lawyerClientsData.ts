/**
 * lawyerClientsData.ts
 * ─────────────────────────────────────────────────────────
 * `ClientFlag` and `FLAG_CONFIG` are the single presentation layer for a
 * client's classification tags. The type itself is NOT declared here — it is
 * `ClientFlag` from "@/lib/services/clientIdentityRules", which mirrors the
 * CHECK constraint on public.lawyer_clients.flags exactly (six values; «bad»
 * and «late_pay» were removed from the schema in migration 20260903_phase2,
 * DECISION 2, because neither one is a fact the platform can verify — a
 * lawyer typing "bad client" about a real person with no backing record).
 *
 * `MOCK_CLIENTS` and the `Client` interface that used to live here are gone.
 * Every screen now reads `LawyerClient` from lawyerClientsService.ts, which
 * is the API's real DTO — not an invented shape reduced from six sample rows.
 */

import type { ClientFlag } from "@/lib/services/clientIdentityRules";

export type { ClientFlag };

export const FLAG_CONFIG: Record<ClientFlag, { label: string; color: string; bg: string; emoji: string; desc: string }> = {
  vip:       { label: "VIP", color: "text-amber-600",  bg: "bg-amber-500/10",  emoji: "👑", desc: "عميل مميز — يحظى بأولوية عالية" },
  new:       { label: "جديد", color: "text-blue-500",   bg: "bg-blue-500/10",   emoji: "🆕", desc: "عميل جديد انضم مؤخراً" },
  loyal:     { label: "دائم", color: "text-emerald-500",bg: "bg-emerald-500/10",emoji: "🤝", desc: "عميل متكرر وموثوق" },
  urgent:    { label: "قضية حرجة", color: "text-red-600",    bg: "bg-red-600/10",    emoji: "🔴", desc: "لديه موعد أو طعن حرج قريب" },
  corporate: { label: "شركة", color: "text-indigo-500", bg: "bg-indigo-500/10", emoji: "🏢", desc: "كيان قانوني / شركة" },
  inactive:  { label: "غير نشط",  color: "text-slate-400",  bg: "bg-slate-100",     emoji: "💤", desc: "لا قضايا نشطة حالياً" },
};

export type SortKey = "name" | "activeCases" | "unpaid" | "lastContact" | "rating";
