"use client";

/**
 * CaseTrackingLinksPanel — «رابط متابعة للموكل» on the lawyer case file
 * (N3.6, owner §٤٥ axis 6). Create a link, copy it once, revoke it.
 *
 * The full link exists only in the moment it is created: the database keeps
 * its sha256 alone (20261025_32), so it cannot be shown again later. The
 * panel says so, and a lost link is revoked and replaced.
 */

import { useCallback, useEffect, useState } from "react";
import { LinkSimple, Copy, Check, Prohibit, ArrowClockwise, Eye } from "@phosphor-icons/react";
import {
  createTrackingLink,
  getTrackingLinks,
  revokeTrackingLink,
  type TrackingLink,
} from "@/lib/services/trackingLinksService";

const WHEN_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? WHEN_AR.format(Date.parse(iso)) : null);

export default function CaseTrackingLinksPanel({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [canIssue, setCanIssue] = useState(false);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState("loading");
    getTrackingLinks(caseId)
      .then((r) => { setLinks(r.links); setCanIssue(r.canIssue); setState("ready"); })
      .catch(() => setState("error"));
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const { link, url } = await createTrackingLink(caseId);
      setFresh(url);
      setLinks((prev) => [link, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إنشاء الرابط.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setError("تعذّر النسخ تلقائياً — حدّد الرابط وانسخه يدوياً.");
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      const updated = await revokeTrackingLink(caseId, id);
      setLinks((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إيقاف الرابط.");
    }
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const active = links.filter((l) => !l.revokedAt);

  return (
    <section className={`${card} p-5`} aria-labelledby="case-tracking-title" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 id="case-tracking-title" className={`flex items-center gap-2 text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            <LinkSimple size={18} weight="duotone" className="text-[#C8A762]" aria-hidden="true" />
            رابط متابعة للموكل
          </h2>
          <p className={`mt-1 text-[12px] ${muted}`}>
            يرى الموكل منه عنوان القضية ورقمها والمحكمة والمرحلة الحالية والجلسات القادمة فقط — لا الملاحظات ولا المذكرات ولا المستندات.
          </p>
        </div>
        {canIssue && (
          <button type="button" onClick={create} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#092e22] disabled:opacity-60 dark:bg-[#C8A762] dark:text-[#0B3D2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]">
            <LinkSimple size={13} aria-hidden="true" /> {busy ? "جارٍ الإنشاء…" : "إنشاء رابط جديد"}
          </button>
        )}
      </div>

      {state === "ready" && !canIssue && (
        <p className={`mt-3 text-[12px] ${muted}`}>
          إنشاء روابط المتابعة وإيقافها للمحامي المسؤول وفريق القضية ومن يملك صلاحية قضايا المكتب.
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-[12px] font-semibold text-red-600 dark:text-red-400">{error}</p>}

      {fresh && (
        <div className={`mt-4 rounded-xl border p-3 ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-900"}`}>
            انسخ الرابط الآن وأرسله لموكلك — لن يُعرض مرة أخرى لأسباب أمنية.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={fresh} dir="ltr" aria-label="رابط المتابعة" onFocus={(e) => e.currentTarget.select()}
              className={`min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-mono ${isDark ? "bg-zinc-950 border-white/10 text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`} />
            <button type="button" onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-[#0B3D2E] text-white dark:bg-[#C8A762] dark:text-[#0B3D2E]">
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? "نُسخ" : "نسخ"}
            </button>
          </div>
          <p className={`mt-2 text-[11px] ${muted}`}>إن ضاع الرابط فأوقفه وأنشئ رابطاً جديداً.</p>
        </div>
      )}

      <div className="mt-4">
        {state === "loading" ? (
          <p className={`text-[12px] ${muted}`} aria-live="polite">جارٍ تحميل الروابط…</p>
        ) : state === "error" ? (
          <button type="button" onClick={load} className={`inline-flex items-center gap-1 text-[12px] font-bold underline ${muted}`}>
            <ArrowClockwise size={12} aria-hidden="true" /> تعذّر تحميل الروابط — إعادة المحاولة
          </button>
        ) : links.length === 0 ? (
          <p className={`text-[12px] ${muted}`}>لا روابط متابعة لهذه القضية بعد.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-white/[0.06]" : "border-slate-100"} ${l.revokedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <p className={`font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    رابط أُنشئ {when(l.createdAt) ?? "—"}{l.mine ? "" : " (زميل)"}
                  </p>
                  <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${muted}`}>
                    {l.revokedAt ? (
                      <>موقوف منذ {when(l.revokedAt)}</>
                    ) : (
                      <><Eye size={11} aria-hidden="true" />{l.lastViewedAt ? `آخر فتح ${when(l.lastViewedAt)}` : "لم يُفتح بعد"}</>
                    )}
                  </p>
                </div>
                {!l.revokedAt && (l.mine || canIssue) && (
                  <button type="button" onClick={() => revoke(l.id)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${isDark ? "border-red-400/30 text-red-300 hover:bg-red-500/10" : "border-red-200 text-red-700 hover:bg-red-50"}`}>
                    <Prohibit size={12} aria-hidden="true" /> إيقاف
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {active.length > 0 && <p className={`mt-2 text-[11px] ${muted}`}>{active.length.toLocaleString("ar-EG")} رابط فعّال.</p>}
      </div>
    </section>
  );
}
