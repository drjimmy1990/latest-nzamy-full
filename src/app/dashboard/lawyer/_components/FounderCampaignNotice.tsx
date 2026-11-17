"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, Crown, X } from "@phosphor-icons/react";
import { isSupabaseMode } from "@/lib/services/api";
import {
  founderOfferFromApi,
  founderPriceLine,
  founderVerificationFromProfile,
  type FounderVerification,
} from "@/lib/pricing/founderCard";
import {
  clockOffsetMs,
  founderPhase,
  readFounderWindow,
  type WindowRead,
} from "@/lib/founder/founderWindow";
import {
  NOTICE_DISMISS_KEY_PREFIX,
  founderNoticeView,
  type NoticePhase,
} from "@/lib/founder/founderNotice";
import { founderDashboardCardView } from "./founderMembershipCardView";

/**
 * The founder campaign card at the top of the lawyer dashboard (owner item
 * 0.4): a countdown before the opening, a join card linking to /founder
 * during the campaign, nothing after it. Every decision is the pure
 * founderNoticeView; this component reads (membership, the campaign window,
 * and — during the campaign — the licence verification, to step aside when
 * «عضويتي المؤسسة» already shows its invite) and remembers a dismissal per
 * phase in localStorage. Loading and failed reads render nothing; demo mode
 * reads nothing.
 */

const PRICED = founderPriceLine() !== null;

function readDismissed(): Set<NoticePhase> {
  const out = new Set<NoticePhase>();
  try {
    for (const p of ["pre", "live"] as const) {
      if (window.localStorage.getItem(NOTICE_DISMISS_KEY_PREFIX + p) === "1") out.add(p);
    }
  } catch {
    // Storage blocked (private mode): nothing is remembered.
  }
  return out;
}

export default function FounderCampaignNotice({
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
  const [membership, setMembership] = useState<unknown>(undefined);
  const [read, setRead] = useState<WindowRead | undefined>(undefined);
  const [campaignBody, setCampaignBody] = useState<unknown>(null);
  const [offset, setOffset] = useState(0);
  const [verification, setVerification] = useState<FounderVerification>("loading");
  const [now, setNow] = useState<number | null>(null);
  // Read once on the client (this component renders nothing on the server).
  const [dismissed, setDismissed] = useState<Set<NoticePhase>>(() =>
    typeof window === "undefined" ? new Set() : readDismissed(),
  );

  const lawyer = !userLoading && userType === "lawyer" && practiceKind !== "consultant";

  useEffect(() => {
    if (!isSupabaseMode || !lawyer) return;
    const controller = new AbortController();
    const { signal } = controller;
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);

    void (async () => {
      try {
        const m = await fetch("/api/v1/membership/founder", { cache: "no-store", signal });
        const mBody: unknown = m.ok ? await m.json() : null;
        if (signal.aborted) return;
        setMembership(mBody);
        if ((mBody as { member?: unknown } | null)?.member !== false) return;

        const sentAt = Date.now();
        const c = await fetch("/api/v1/campaigns/active", { cache: "no-store", signal });
        const receivedAt = Date.now();
        const cBody: unknown = c.ok ? await c.json() : null;
        if (signal.aborted) return;
        const w = readFounderWindow(cBody, { date: c.headers.get("date"), age: c.headers.get("age") });
        if (w.kind === "window") setOffset(clockOffsetMs(w.serverNowMs, sentAt, receivedAt));
        setCampaignBody(cBody);
        setNow(Date.now());
        setRead(w);

        if (w.kind === "window" && w.state === "live") {
          const p = await fetch("/api/v1/profile", { cache: "no-store", signal });
          const pBody: unknown = await p.json().catch(() => null);
          if (signal.aborted) return;
          setVerification(founderVerificationFromProfile(pBody));
        }
      } catch {
        // Aborted or failed: render nothing.
      }
    })();

    return () => {
      controller.abort();
      window.clearInterval(tick);
    };
  }, [lawyer]);

  if (!isSupabaseMode || now === null || read === undefined) return null;
  const view = founderPhase(read, now + offset);

  // During the campaign, a verified lawyer already gets «عضويتي المؤسسة»'s invite.
  const inviteShown =
    view.phase === "live" &&
    founderDashboardCardView({
      userLoading,
      userType,
      practiceKind,
      membership,
      verification,
      offer: founderOfferFromApi(campaignBody),
      priced: PRICED,
    }).kind === "invite";
  // Until the verification answers, wait rather than flash a card that may step aside.
  if (view.phase === "live" && verification === "loading") return null;

  const notice = founderNoticeView({
    userLoading,
    userType,
    practiceKind,
    membership,
    view,
    inviteShown,
    dismissed,
  });
  if (notice.kind === "none") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(NOTICE_DISMISS_KEY_PREFIX + notice.phase, "1");
    } catch {
      // Storage blocked: hidden for this visit only.
    }
    setDismissed((prev) => new Set(prev).add(notice.phase));
  };

  return (
    <section
      aria-label={notice.title}
      className={`relative flex flex-wrap items-center gap-3 rounded-2xl border p-4 pe-11 ${
        isDark ? "border-[#C8A762]/25 bg-[#C8A762]/[0.06]" : "border-[#C8A762]/40 bg-[#C8A762]/[0.07]"
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          isDark ? "bg-[#C8A762]/15" : "bg-[#C8A762]/20"
        }`}
      >
        <Crown size={18} weight="fill" className="text-[#C8A762]" aria-hidden />
      </div>
      <div className="min-w-[220px] flex-1">
        <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-[#0B3D2E]"}`}>{notice.title}</p>
        <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{notice.text}</p>
      </div>
      <Link
        href={notice.href}
        className="flex flex-shrink-0 items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline"
      >
        {notice.linkLabel} <CaretLeft size={11} aria-hidden />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className={`absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg ${
          isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        <X size={14} aria-hidden />
      </button>
    </section>
  );
}
