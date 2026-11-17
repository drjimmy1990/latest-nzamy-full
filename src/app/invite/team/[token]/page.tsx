"use client";

/**
 * /invite/team/[token] — F7: the invitee's page of a firm invitation link
 * (migration 20261125_40). Not the library-trial /invite/[code] flow.
 *
 *   1. GET /api/v1/invite/team/<token> (no session) — firm name, role, expiry.
 *   2. Signed out → sign in (or create an account) WITH THE INVITED ADDRESS,
 *      then come back here (`/login?next=`).
 *   3. «قبول الدعوة» → POST /api/v1/invite/team/<token> (the link becomes an
 *      invited membership) → POST /api/v1/me/invitations/firm/<id>/accept, the
 *      existing consent path. Each step's refusal is shown as the server words it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle, Spinner, UsersThree, WarningCircle, ArrowClockwise } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

type Lookup =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "invalid"; reason: string | null }
  | { kind: "valid"; firmName: string; roleLabel: string; expiresAt: string | null };

const INVALID_TEXT: Record<string, string> = {
  used: "استُخدمت هذه الدعوة أو أُلغيت.",
  expired: "انتهت صلاحية هذه الدعوة — اطلب من المكتب دعوة جديدة.",
};

export default function FirmTeamInvitePage() {
  const { isDark } = useTheme();
  const user = useUser();
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";

  const [lookup, setLookup] = useState<Lookup>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLookup({ kind: "loading" });
    try {
      const res = await fetch(`/api/v1/invite/team/${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        valid?: boolean; reason?: string; firmName?: string; roleLabel?: string; expiresAt?: string;
      };
      if (res.status >= 500) { setLookup({ kind: "error" }); return; }
      if (!json.valid) { setLookup({ kind: "invalid", reason: json.reason ?? null }); return; }
      setLookup({
        kind: "valid",
        firmName: json.firmName ?? "مكتب محاماة",
        roleLabel: json.roleLabel ?? "",
        expiresAt: json.expiresAt ?? null,
      });
    } catch {
      setLookup({ kind: "error" });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const redeem = await fetch(`/api/v1/invite/team/${encodeURIComponent(token)}`, { method: "POST" });
      const r = (await redeem.json().catch(() => ({}))) as { data?: { memberId?: string }; error?: string };
      if (!redeem.ok || !r.data?.memberId) {
        setError(r.error || "تعذّر قبول الدعوة.");
        return;
      }
      const ans = await fetch(`/api/v1/me/invitations/firm/${encodeURIComponent(r.data.memberId)}/accept`, { method: "POST" });
      if (!ans.ok) {
        const a = (await ans.json().catch(() => ({}))) as { error?: string };
        // The membership row exists at «invited»: it can still be accepted from the dashboard banner.
        setError(a.error || "سُجّلت الدعوة في حسابك لكن تعذّر قبولها الآن — اقبلها من لوحة التحكم.");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر قبول الدعوة — تحقّق من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200 shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const next = `/invite/team/${encodeURIComponent(token)}`;
  const expires = lookup.kind === "valid" && lookup.expiresAt ? new Date(lookup.expiresAt) : null;

  return (
    <div dir="rtl" className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-zinc-50 text-zinc-900"}`}>
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className={`w-full max-w-md rounded-2xl p-6 space-y-4 ${card}`}>
          <div className="flex items-center gap-2">
            <UsersThree size={22} weight="duotone" className="text-[#C8A762]" />
            <h1 className="text-lg font-black">دعوة للانضمام إلى فريق مكتب</h1>
          </div>

          {lookup.kind === "loading" ? (
            <p className={`flex items-center gap-2 text-sm ${muted}`}><Spinner size={16} className="animate-spin" /> جارٍ التحقق من الدعوة…</p>
          ) : lookup.kind === "error" ? (
            <div className="space-y-2">
              <p className="text-sm text-red-500">تعذّر التحقق من الدعوة الآن — هذا لا يعني أن الرابط غير صالح.</p>
              <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-sm font-bold text-royal hover:underline">
                <ArrowClockwise size={14} /> إعادة المحاولة
              </button>
            </div>
          ) : lookup.kind === "invalid" ? (
            <p className={`flex items-start gap-2 text-sm ${muted}`}>
              <WarningCircle size={18} className="text-amber-500 flex-shrink-0" />
              {(lookup.reason && INVALID_TEXT[lookup.reason]) || "هذا الرابط لا يقابل دعوة قائمة."}
            </p>
          ) : done ? (
            <div className="space-y-3">
              <p className={`flex items-center gap-2 text-sm font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                <CheckCircle size={18} weight="fill" /> انضممت إلى فريق «{lookup.firmName}».
              </p>
              <Link href="/dashboard/firm" className="inline-block rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-bold text-[#C8A762]">
                الذهاب إلى لوحة المكتب
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">
                يدعوك <strong>«{lookup.firmName}»</strong> للانضمام إلى فريقه
                {lookup.roleLabel ? <> بصفة <strong>«{lookup.roleLabel}»</strong></> : null}.
              </p>
              {expires && !Number.isNaN(expires.getTime()) && (
                <p className={`text-xs ${muted}`}>
                  تنتهي الدعوة في {expires.toLocaleDateString("ar-SA", { dateStyle: "medium" })}.
                </p>
              )}
              <p className={`text-xs leading-relaxed ${muted}`}>
                تُقبل الدعوة من الحساب المسجّل بالبريد الإلكتروني الذي أُرسلت إليه، ويكون حساب محامٍ أو حساب فرد.
              </p>
              {user.loading ? null : user.isLoggedIn ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void accept()}
                  className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-bold text-[#C8A762] disabled:opacity-50"
                >
                  {busy && <Spinner size={14} className="animate-spin" />} قبول الدعوة
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-bold text-[#C8A762]">
                    تسجيل الدخول لقبول الدعوة
                  </Link>
                  <Link href="/register" className={`rounded-xl border px-4 py-2 text-sm font-bold ${isDark ? "border-white/[0.1] text-zinc-300" : "border-zinc-200 text-zinc-700"}`}>
                    إنشاء حساب
                  </Link>
                </div>
              )}
              {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
