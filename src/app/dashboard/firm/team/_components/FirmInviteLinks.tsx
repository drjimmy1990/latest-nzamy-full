"use client";

/**
 * «دعوة برابط» — F7 (migration 20261125_40). For an address that has no
 * account yet (or any address): the firm gets a link to copy and send itself,
 * and (T10-F7, batch l11-remind) the platform e-mails it too once e-mail is
 * set up — the POST answers `emailed`. If the address already
 * belongs to a lawyer/individual account, that person also gets an in-app
 * notification. GET/POST /api/v1/firm/invitations, DELETE …/[id].
 *
 * Colours: zinc/slate text only (globals.css turns gray-50/100/200 into dark
 * SURFACES).
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, CheckCircle, LinkSimple, Spinner, Trash } from "@phosphor-icons/react";
import type { FirmRole } from "@/types/firmBackendReady";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import LimitRefusalLink from "@/components/limits/LimitRefusalLink";

interface Pending { id: string; email: string; role: string; path: string; expiresAt: string }

type ListState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "hidden" } | { kind: "ready"; items: Pending[] };

const ROLE_OPTIONS = Object.keys(FIRM_ROLE_LABEL) as FirmRole[];

function fullLink(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

export default function FirmInviteLinks({ isDark, card }: { isDark: boolean; card: string }) {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FirmRole>("lawyer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; notified: boolean; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/firm/invitations", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { data?: Pending[]; error?: string };
      if (res.status === 503 || res.status === 403 || res.status === 404) { setList({ kind: "hidden" }); return; }
      if (!res.ok) { setList({ kind: "error", message: body.error || "تعذّر تحميل الدعوات." }); return; }
      setList({ kind: "ready", items: body.data ?? [] });
    } catch {
      setList({ kind: "error", message: "تعذّر تحميل الدعوات." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (list.kind === "hidden") return null;

  async function create() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/v1/firm/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { path?: string; notified?: boolean; emailed?: boolean }; error?: string };
      if (!res.ok || !body.data?.path) {
        setError(body.error || "تعذّر إنشاء الدعوة.");
        return;
      }
      setCreated({ link: fullLink(body.data.path), notified: body.data.notified === true, emailed: body.data.emailed === true });
      setEmail("");
      void load();
    } catch {
      setError("تعذّر إنشاء الدعوة — تحقّق من الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("إلغاء هذه الدعوة؟ لن يعمل رابطها بعد ذلك.")) return;
    const res = await fetch(`/api/v1/firm/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || "تعذّر إلغاء الدعوة.");
      return;
    }
    void load();
  }

  function copy(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(link);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => setError("تعذّر النسخ — انسخ الرابط يدوياً."));
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";
  const input = `rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-100" : "bg-white border-slate-200 text-slate-800"}`;

  return (
    <section className={`${card} p-5 space-y-4`} dir="rtl" aria-labelledby="invite-links-title">
      <div className="flex items-start gap-2">
        <LinkSimple size={18} weight="duotone" className="text-[#C8A762] mt-0.5" />
        <div>
          <h2 id="invite-links-title" className={`text-base font-black ${strong}`}>دعوة برابط</h2>
          <p className={`text-xs mt-1 ${muted}`}>
            لمن ليس له حساب على المنصة بعد: أنشئ رابط دعوة، وسنخبرك هنا إن أرسلته المنصة إلى بريده، ويمكنك دائماً نسخه وإرساله إليه بنفسك. يُقبل الرابط من حساب مسجّل بالبريد نفسه، وتنتهي صلاحيته بعد ٧ أيام. إن كان للبريد حساب قائم يصله إشعار داخل المنصة أيضاً.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com" aria-label="البريد الإلكتروني" className={`${input} flex-1`} />
        <select value={role} onChange={(e) => setRole(e.target.value as FirmRole)} aria-label="الدور" className={input}>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{FIRM_ROLE_LABEL[r]}</option>)}
        </select>
        <button type="button" disabled={busy || !email.trim()} onClick={() => void create()}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-bold text-[#C8A762] disabled:opacity-50">
          {busy ? <Spinner size={14} className="animate-spin" /> : <LinkSimple size={14} />} إنشاء رابط
        </button>
      </div>

      {created && (
        <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50"}`}>
          <p className={`text-xs font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
            أُنشئت الدعوة{created.emailed ? "، وأُرسل رابطها إلى البريد" : ""}{created.notified ? "، ووصل صاحبَ البريد إشعارٌ داخل المنصة" : ""}. {created.emailed ? "ويمكنك نسخ الرابط أيضاً:" : "انسخ الرابط وأرسله:"}
          </p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className={`flex-1 truncate text-[11px] ${strong}`}>{created.link}</code>
            <button type="button" onClick={() => copy(created.link)} className="flex items-center gap-1 text-xs font-bold text-royal">
              {copied === created.link ? <CheckCircle size={13} weight="fill" /> : <Copy size={13} />} {copied === created.link ? "نُسخ" : "نسخ"}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-500">{error} <LimitRefusalLink message={error} /></p>}

      {list.kind === "loading" ? (
        <p className={`flex items-center gap-2 text-xs ${muted}`}><Spinner size={13} className="animate-spin" /> جارٍ تحميل الدعوات…</p>
      ) : list.kind === "error" ? (
        <p className="text-xs text-red-500">{list.message}</p>
      ) : list.items.length === 0 ? (
        <p className={`text-xs ${muted}`}>لا توجد دعوات برابط بانتظار القبول.</p>
      ) : (
        <ul className="space-y-2">
          {list.items.map((inv) => (
            <li key={inv.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              <span dir="ltr" className={`text-xs font-bold ${strong}`}>{inv.email}</span>
              <span className={`text-[11px] ${muted}`}>{(FIRM_ROLE_LABEL as Record<string, string>)[inv.role] ?? inv.role}</span>
              <span className={`text-[11px] ${muted}`}>حتى {new Date(inv.expiresAt).toLocaleDateString("ar-SA", { dateStyle: "medium" })}</span>
              <span className="flex-1" />
              <button type="button" onClick={() => copy(fullLink(inv.path))} className="flex items-center gap-1 text-[11px] font-bold text-royal">
                <Copy size={12} /> {copied === fullLink(inv.path) ? "نُسخ" : "نسخ الرابط"}
              </button>
              <button type="button" onClick={() => void cancel(inv.id)} className="flex items-center gap-1 text-[11px] font-bold text-red-500">
                <Trash size={12} /> إلغاء
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
