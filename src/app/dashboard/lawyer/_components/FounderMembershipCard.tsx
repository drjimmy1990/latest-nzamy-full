"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, Crown, Info, SealCheck } from "@phosphor-icons/react";
import { isSupabaseMode } from "@/lib/services/api";
import {
  founderOfferFromApi,
  founderPriceLine,
  founderVerificationFromProfile,
  type FounderOffer,
  type FounderVerification,
} from "@/lib/pricing/founderCard";
import { founderDashboardCardView } from "./founderMembershipCardView";

/**
 * «عضويتي المؤسسة» on the lawyer dashboard (P3 Task 9).
 *
 * Reads, in a chain, only as far as the answer needs:
 *   1. GET /api/v1/membership/founder — a member gets the card; a failed
 *      read (401, 503, network) stops here and renders nothing;
 *   2. only for `member: false` from a lawyer session: GET
 *      /api/v1/campaigns/active — the invite needs an open sale;
 *   3. only when the sale is open: GET /api/v1/profile — the invite needs a
 *      verified licence (founderVerificationFromProfile, as on /pricing).
 *
 * The decision and every word come from the pure founderDashboardCardView;
 * this component fetches and renders. Loading and error states render
 * nothing — never a broken card. Demo mode reads nothing.
 */

// quote() is pure and the book is static: computed once per module load.
const PRICED = founderPriceLine() !== null;

type Reply = unknown;

export default function FounderMembershipCard({
  isDark,
  userLoading,
  userType,
  practiceKind,
}: {
  isDark: boolean;
  userLoading: boolean;
  userType: string | null;
  practiceKind: string | null;
}) {
  // undefined while loading; null when the fetch itself failed.
  const [membership, setMembership] = useState<Reply>(undefined);
  const [offer, setOffer] = useState<FounderOffer | null>(null);
  const [verification, setVerification] = useState<FounderVerification>("loading");

  useEffect(() => {
    if (!isSupabaseMode || userLoading) return;
    const controller = new AbortController();
    const { signal } = controller;
    const read = (url: string): Promise<{ ok: boolean; body: Reply }> =>
      fetch(url, { cache: "no-store", signal })
        .then(async (res) => ({ ok: res.ok, body: (await res.json()) as Reply }))
        .catch(() => ({ ok: false, body: null }));

    void (async () => {
      const member = await read("/api/v1/membership/founder");
      if (signal.aborted) return;
      setMembership(member.body);
      const isNonMember =
        typeof member.body === "object" && member.body !== null && (member.body as { member?: unknown }).member === false;
      if (!isNonMember || userType !== "lawyer" || !PRICED) return;

      const campaign = await read("/api/v1/campaigns/active");
      if (signal.aborted) return;
      const nextOffer = founderOfferFromApi(campaign.ok ? campaign.body : null);
      setOffer(nextOffer);
      if (nextOffer.state !== "open") return;

      const profile = await read("/api/v1/profile");
      if (signal.aborted) return;
      setVerification(founderVerificationFromProfile(profile.body));
    })();

    return () => controller.abort();
  }, [userLoading, userType]);

  const view = founderDashboardCardView({
    userLoading,
    userType,
    practiceKind,
    membership,
    verification,
    offer,
    priced: PRICED,
  });

  if (view.kind === "none") return null;

  if (view.kind === "invite") {
    return (
      <div
        className={`rounded-2xl p-4 border flex flex-wrap items-center gap-3 ${
          isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.06]" : "border-[#C8A762]/40 bg-[#C8A762]/[0.07]"
        }`}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/15" : "bg-[#C8A762]/20"}`}>
          <Crown size={18} weight="fill" className="text-[#C8A762]" aria-hidden />
        </div>
        <p className={`flex-1 min-w-[220px] text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-[#0B3D2E]"}`}>
          {view.text}
        </p>
        <Link
          href={view.href}
          className="flex items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline flex-shrink-0"
        >
          {view.linkLabel} <CaretLeft size={11} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-label={view.title}
      className={`rounded-2xl border p-5 ${
        isDark
          ? "bg-zinc-900/60 border-[#C8A762]/25"
          : "bg-white border-[#C8A762]/40 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/15" : "bg-[#C8A762]/20"}`}>
          <SealCheck size={17} weight="fill" className="text-[#C8A762]" aria-hidden />
        </div>
        <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{view.title}</h2>
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {view.lines.map((line) => (
          <li key={line} className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            {line}
          </li>
        ))}
      </ul>
      {view.note && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed ${
            isDark ? "bg-amber-900/20 text-amber-300" : "bg-amber-50 text-amber-800"
          }`}
        >
          <Info size={15} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          {view.note}
        </p>
      )}
    </section>
  );
}
