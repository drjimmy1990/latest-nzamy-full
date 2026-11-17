"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, SealCheck } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import {
  founderCta,
  founderMemberFromReply,
  founderVerificationFromProfile,
  type FounderMember,
  type FounderVerification,
} from "@/lib/pricing/founderCard";
import { founderJoinButton } from "@/lib/founder/joinButton";
import { useFounderWindow } from "./FounderWindowProvider";

/**
 * The join card's button. The window decides first (only `live` sells), then
 * the advocate-only rule, then founderCta — the same per-viewer logic as the
 * /pricing card (sign in, verify the licence, gateway, checkout). Checkout
 * itself is the existing /checkout?item=lawyer-founder-2026 flow; the seat is
 * reserved there (founder_reserve_seat), never here.
 */

const PRIMARY =
  "inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-l from-[#E6CD8E] to-[#C8A762] px-6 py-3 text-base font-bold text-[#2A1F07] shadow-[0_8px_24px_rgba(200,167,98,.35)] motion-safe:transition hover:brightness-105 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#C8A762]";
const QUIET =
  "inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-[#0B3D2E]/30 px-6 py-3 text-sm font-bold text-[#0B3D2E]";

export function JoinButton() {
  const { view } = useFounderWindow();
  const { isLoggedIn, loading, userType, practiceKind } = useUser();
  const payments = usePaymentsStatus();
  const [verification, setVerification] = useState<FounderVerification>("loading");
  const [member, setMember] = useState<FounderMember>("loading");

  const lawyerSignedIn = !loading && isLoggedIn && userType === "lawyer";
  const live = view.phase === "live";

  useEffect(() => {
    if (!lawyerSignedIn || !live) return;
    let cancelled = false;
    const get = (url: string) =>
      fetch(url, { cache: "no-store" })
        .then((res) => res.json() as Promise<unknown>)
        .catch(() => null);
    void get("/api/v1/profile").then((r) => {
      if (!cancelled) setVerification(founderVerificationFromProfile(r));
    });
    void get("/api/v1/membership/founder").then((r) => {
      if (!cancelled) setMember(founderMemberFromReply(r));
    });
    return () => {
      cancelled = true;
    };
  }, [lawyerSignedIn, live]);

  const kind = userType === "lawyer" ? practiceKind : null;
  const cta = founderCta({
    sessionLoading: loading,
    signedIn: isLoggedIn,
    userType: userType ?? null,
    practiceKind: kind,
    verification,
    member,
    gateway: payments,
  });
  const button = founderJoinButton({
    phase: view.phase,
    remainingMs: view.remainingMs,
    userType: userType ?? null,
    practiceKind: kind,
    cta,
  });

  if (button.kind === "locked") {
    return (
      <p className={`${QUIET} cursor-not-allowed opacity-80`} role="status" aria-live="polite">
        <Lock size={16} weight="bold" aria-hidden />
        {button.label}
      </p>
    );
  }

  const c = button.cta;
  return (
    <div className="space-y-2.5">
      {c.kind === "guest" && (
        <>
          <Link href={c.href} className={PRIMARY}>
            {c.label}
          </Link>
          <Link href={c.registerHref} className={QUIET}>
            {c.registerLabel}
          </Link>
        </>
      )}
      {(c.kind === "verify" || c.kind === "checkout") && (
        <Link href={c.href} className={PRIMARY}>
          {c.label}
        </Link>
      )}
      {c.kind === "member" && (
        <p className={QUIET} role="status">
          <SealCheck size={18} weight="fill" className="text-[#C8A762]" aria-hidden />
          {c.label}
        </p>
      )}
      {(c.kind === "loading" || c.kind === "wait" || c.kind === "unavailable" || c.kind === "lawyers_only") && (
        <p className={QUIET} role="status" aria-live="polite">
          {c.label}
        </p>
      )}
    </div>
  );
}
