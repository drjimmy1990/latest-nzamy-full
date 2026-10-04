"use client";

/**
 * PendingInvitationsBanner — «لديك دعوة للانضمام».
 *
 * Review 2026-09-21 A5 / F03. A company or firm owner who knows an e-mail
 * address can put that account on their roster; until this banner the person
 * was simply ON it, as `active`, with their private service requests flowing
 * into the company feed (20260914's policy + /api/v1/service-requests). Both
 * roster routes now write `status: 'invited'`, which grants nothing, and this
 * is the surface where the invited person says yes or no.
 *
 * ── WHAT IT RENDERS, AND WHEN ──────────────────────────────────────────────
 *   loading      nothing — a dashboard must not flash a consent prompt
 *   unreadable   a compact amber strip with «إعادة المحاولة». NOT silence:
 *                `listRead.ts`'s rule is that «we could not read it» and
 *                «there is nothing» are different answers, and here the
 *                difference is whether somebody is waiting for an answer.
 *   empty        nothing at all
 *   ready        one card per invitation, with «قبول» and «رفض»
 *
 * ── AFTER ACCEPTING ────────────────────────────────────────────────────────
 * `useUser()` returns a session value and exposes no refresh (see
 * src/hooks/useUser.ts:1055 — `{ ...session, isDemoBypass, loading }`), and
 * joining an entity changes what `resolveActiveEntityIds` and the edge guards
 * decide. A full `window.location.reload()` is therefore the honest option:
 * the alternative is a dashboard that renders as if nothing had changed.
 * Declining changes nothing about the session, so it only drops the card.
 *
 * No localStorage: an unanswered invitation lives in `*_members`, not in the
 * browser.
 */

import { useCallback, useEffect, useState } from "react";
import { Buildings, Check, WarningCircle, X, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  inviterNameAr,
  invitationKindLabelAr,
  type PendingInvitation,
} from "@/lib/services/invitationsService";
import { type ListRead, listViewState, itemsOf } from "@/lib/services/listRead";

export default function PendingInvitationsBanner() {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<ListRead<PendingInvitation> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await getMyInvitations());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const view = listViewState(loading, read);
  const invitations = itemsOf(read).filter((i) => !declined.includes(i.id));

  const answer = async (invitation: PendingInvitation, accept: boolean) => {
    setBusyId(invitation.id);
    setError("");
    try {
      if (accept) {
        await acceptInvitation(invitation.kind, invitation.id);
        // The session's entity memberships changed — re-read everything.
        window.location.reload();
        return;
      }
      await declineInvitation(invitation.kind, invitation.id);
      setDeclined((prev) => [...prev, invitation.id]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : accept
            ? "تعذّر قبول الدعوة."
            : "تعذّر رفض الدعوة.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (view === "loading" || view === "empty") return null;

  if (view === "unreadable") {
    return (
      <div
        dir="rtl"
        className={`flex items-start gap-2 rounded-2xl p-4 text-[12px] ${
          isDark
            ? "bg-amber-900/20 border border-amber-700/30 text-amber-300"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}
      >
        <WarningCircle size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
        <span className="flex-1 leading-6">
          تعذّرت قراءة دعوات الانضمام الخاصة بك — إن كانت هناك دعوة بانتظار ردّك فهي غير معروضة الآن.
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-bold cursor-pointer ${
            isDark ? "border-amber-700/40 hover:bg-amber-900/30" : "border-amber-300 hover:bg-amber-100"
          }`}
        >
          <ArrowClockwise size={12} weight="bold" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (invitations.length === 0) return null;

  return (
    <div dir="rtl" className="space-y-2">
      {invitations.map((invitation) => (
        <div
          key={`${invitation.kind}:${invitation.id}`}
          className={`rounded-2xl p-4 border ${
            isDark
              ? "bg-royal/10 border-royal/30 text-zinc-100"
              : "bg-royal/5 border-royal/20 text-slate-800"
          }`}
        >
          <div className="flex items-start gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-royal/15 flex items-center justify-center flex-shrink-0">
              <Buildings size={18} weight="fill" className="text-royal" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[13px] font-bold leading-6">
                دعوة للانضمام إلى فريق {invitationKindLabelAr(invitation.kind)}
              </p>
              <p className={`text-[12px] leading-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                دعتك «{inviterNameAr(invitation)}» للانضمام بصفة «{invitation.roleLabel}».
                لن يطّلع الفريق على طلباتك ومعاملاتك الخاصة إلا بعد قبولك.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void answer(invitation, true)}
                disabled={busyId !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Check size={13} weight="bold" />
                قبول
              </button>
              <button
                type="button"
                onClick={() => void answer(invitation, false)}
                disabled={busyId !== null}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                  isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                <X size={13} weight="bold" />
                رفض
              </button>
            </div>
          </div>
          {error && busyId === null && (
            <p className="mt-2 text-[11px] text-red-400 flex items-center gap-1">
              <WarningCircle size={11} weight="fill" /> {error}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
