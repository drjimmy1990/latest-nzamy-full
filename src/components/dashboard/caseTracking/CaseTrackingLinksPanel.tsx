"use client";

/**
 * CaseTrackingLinksPanel — «رابط متابعة للموكل» on the lawyer case file
 * (N3.6, owner §٤٥ axis 6; v2 = D2, owner ٢٧٦).
 *
 *   create   pick the lifetime: 7 / 30 / 90 days or until the current stage
 *            ends. Refused while the case file has no client mobile — the
 *            client opens the link with its last 4 digits.
 *   states   نشط · موقوف مؤقتاً · منتهي — موقوف · ملغى (the state SQL
 *            computed; a stage link ends with its stage), and «موقوف —
 *            محاولات خاطئة كثيرة» when 20 wrong digit tries paused it (the
 *            client sees an ordinary pause), with the advice to cancel it.
 *            Re-activate shows only when the server says the caller may
 *            (a colleague's manual pause: its maker, pauser or the lead).
 *   actions  إيقاف مؤقت · إعادة تفعيل (asks a new lifetime; the SAME link) ·
 *            إلغاء نهائي (confirmed; never comes back).
 *
 * The full link exists only in the moment it is created: the database keeps
 * its sha256 alone (20261025_32), so it cannot be shown again later. The
 * panel says so, and a lost link is cancelled and replaced.
 */

import { useCallback, useEffect, useState } from "react";
import { LinkSimple, Copy, Check, Prohibit, ArrowClockwise, Eye, Pause, Play, Warning, LockSimple } from "@phosphor-icons/react";
import {
  createTrackingLink,
  getTrackingLinks,
  pauseTrackingLink,
  resumeTrackingLink,
  revokeTrackingLink,
  type TrackingLink,
} from "@/lib/services/trackingLinksService";
import {
  DEFAULT_TRACKING_LIFETIME,
  LIFETIME_LABEL_AR,
  LOCKED_PAUSE_HINT_AR,
  TRACKING_LIFETIMES,
  trackingBadgeLabelAr,
  type TrackingLifetime,
  type TrackingLinkState,
} from "@/lib/tracking/trackingLinkState";

const WHEN_AR = new Intl.DateTimeFormat("ar-EG", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? WHEN_AR.format(Date.parse(iso)) : null);

const NO_PHONE_AR = "أضف رقم جوال الموكل في ملف القضية أولاً — يفتح الموكل الرابط بآخر ٤ أرقام منه (من بطاقة الموكل المرتبطة بالقضية، أو من حسابه إن كان هو مقدّم الطلب).";

function badgeClass(state: TrackingLinkState, isDark: boolean, leaked: boolean): string {
  if (leaked) return isDark ? "bg-red-500/15 text-red-300 border-red-400/30" : "bg-red-50 text-red-800 border-red-200";
  switch (state) {
    case "active":
      return isDark ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" : "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "paused":
      return isDark ? "bg-amber-500/15 text-amber-300 border-amber-400/30" : "bg-amber-50 text-amber-800 border-amber-200";
    case "expired":
      return isDark ? "bg-orange-500/15 text-orange-300 border-orange-400/30" : "bg-orange-50 text-orange-800 border-orange-200";
    default:
      return isDark ? "bg-white/[0.06] text-zinc-300 border-white/10" : "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function LifetimePicker({ value, onChange, isDark, name }: { value: TrackingLifetime; onChange: (l: TrackingLifetime) => void; isDark: boolean; name: string }) {
  return (
    <fieldset className="mt-2">
      <legend className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مدة الرابط</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TRACKING_LIFETIMES.map((l) => (
          <label key={l}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12px] font-semibold ${
              value === l
                ? isDark ? "border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E] bg-emerald-50 text-[#0B3D2E]"
                : isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-700"
            }`}>
            <input type="radio" name={name} value={l} checked={value === l} onChange={() => onChange(l)} className="accent-[#0B3D2E]" />
            {LIFETIME_LABEL_AR[l]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function CaseTrackingLinksPanel({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [canIssue, setCanIssue] = useState(false);
  const [v2, setV2] = useState(false);
  const [hasPhone, setHasPhone] = useState<boolean | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lifetime, setLifetime] = useState<TrackingLifetime>(DEFAULT_TRACKING_LIFETIME);
  // one inline action at a time: re-activate (with its lifetime) or confirm a cancel
  const [pending, setPending] = useState<{ id: string; kind: "resume" | "revoke"; lifetime: TrackingLifetime } | null>(null);

  const load = useCallback(() => {
    setState("loading");
    getTrackingLinks(caseId)
      .then((r) => { setLinks(r.links); setCanIssue(r.canIssue); setV2(r.v2); setHasPhone(r.hasPhone); setState("ready"); })
      .catch(() => setState("error"));
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const { link, url } = await createTrackingLink(caseId, lifetime);
      setFresh(url);
      setLinks((prev) => [link, ...prev]);
      setCreating(false);
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

  async function act(id: string, run: () => Promise<TrackingLink>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      const updated = await run();
      setLinks((prev) => prev.map((l) => (l.id === id ? updated : l)));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const primaryBtn = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#092e22] disabled:opacity-60 dark:bg-[#C8A762] dark:text-[#0B3D2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]";
  const ghostBtn = `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold disabled:opacity-60 ${isDark ? "border-white/10 text-zinc-200 hover:bg-white/[0.04]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`;
  const dangerBtn = `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold disabled:opacity-60 ${isDark ? "border-red-400/30 text-red-300 hover:bg-red-500/10" : "border-red-200 text-red-700 hover:bg-red-50"}`;
  const live = links.filter((l) => l.state === "active");
  const noPhone = v2 && hasPhone === false;

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
            {v2 && " يفتحه الموكل بآخر ٤ أرقام من رقم جواله المسجّل في ملف القضية، دون حساب."}
          </p>
        </div>
        {canIssue && !creating && (
          <button type="button" onClick={() => { setCreating(true); setError(null); }} disabled={busy} className={primaryBtn}>
            <LinkSimple size={13} aria-hidden="true" /> إنشاء رابط جديد
          </button>
        )}
      </div>

      {state === "ready" && !canIssue && (
        <p className={`mt-3 text-[12px] ${muted}`}>
          إنشاء روابط المتابعة وإيقافها للمحامي المسؤول وفريق القضية ومن يملك صلاحية قضايا المكتب.
        </p>
      )}

      {canIssue && noPhone && (
        <p role="note" className={`mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold ${isDark ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {NO_PHONE_AR}
        </p>
      )}

      {creating && (
        <div className={`mt-4 rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`} role="group" aria-label="إنشاء رابط متابعة">
          {v2 ? (
            <LifetimePicker value={lifetime} onChange={setLifetime} isDark={isDark} name="tracking-create-lifetime" />
          ) : (
            <p className={`text-[12px] ${muted}`}>رابط بلا مدة محددة إلى أن يُلغى.</p>
          )}
          {v2 && (
            <p className={`mt-2 text-[11px] ${muted}`}>
              عند انتهاء المدة يتوقف الرابط مؤقتاً ولا يُحذف، وتستطيع إعادة تفعيله بضغطة على الرابط نفسه.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={create} disabled={busy || noPhone} className={primaryBtn}>
              {busy ? "جارٍ الإنشاء…" : "إنشاء الرابط"}
            </button>
            <button type="button" onClick={() => setCreating(false)} disabled={busy} className={ghostBtn}>إلغاء</button>
          </div>
        </div>
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
          <p className={`mt-2 text-[11px] ${muted}`}>إن ضاع الرابط فألغِه وأنشئ رابطاً جديداً.</p>
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
            {links.map((l) => {
              const may = l.mine || canIssue;
              const mayResume = l.mayResume ?? may;
              const leaked = l.state === "paused" && l.pausedReason === "locked";
              const isPending = pending?.id === l.id;
              return (
                <li key={l.id} className={`rounded-xl border px-3 py-2 text-[12px] ${isDark ? "border-white/[0.06]" : "border-slate-100"} ${l.state === "revoked" ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className={`flex items-center gap-2 font-semibold ${strong}`}>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(l.state, isDark, leaked)}`}>
                          {trackingBadgeLabelAr(l.state, l.pausedReason)}
                        </span>
                        رابط أُنشئ {when(l.createdAt) ?? "—"}{l.mine ? "" : " (زميل)"}
                      </p>
                      <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${muted}`}>
                        {l.state === "revoked" ? (
                          <span>ملغى منذ {when(l.revokedAt)}</span>
                        ) : (
                          <>
                            {l.lifetime === "stage" && <span>المدة: حتى انتهاء المرحلة</span>}
                            {l.lifetime !== "stage" && l.expiresAt && (
                              <span>{l.state === "expired" ? "انتهت مدته" : "تنتهي مدته"} {when(l.expiresAt)}</span>
                            )}
                            {l.state === "paused" && l.pausedAt && <span>أُوقف {when(l.pausedAt)}</span>}
                            <span className="inline-flex items-center gap-1"><Eye size={11} aria-hidden="true" />{l.lastViewedAt ? `آخر فتح ${when(l.lastViewedAt)}` : "لم يُفتح بعد"}</span>
                          </>
                        )}
                      </p>
                      {leaked && (
                        <p role="note" className={`mt-1 flex items-start gap-1 text-[11px] font-semibold ${isDark ? "text-red-300" : "text-red-800"}`}>
                          <Warning size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {LOCKED_PAUSE_HINT_AR}
                        </p>
                      )}
                      {l.lockedUntil && l.state === "active" && (
                        <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                          <LockSimple size={11} aria-hidden="true" /> أُدخلت أرقام خاطئة ٥ مرات — التحقق موقوف حتى {when(l.lockedUntil)}
                        </p>
                      )}
                    </div>
                    {may && l.state !== "revoked" && !isPending && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {v2 && l.state === "active" && (
                          <button type="button" disabled={busy} className={ghostBtn}
                            onClick={() => act(l.id, () => pauseTrackingLink(caseId, l.id), "تعذّر إيقاف الرابط مؤقتاً.")}>
                            <Pause size={12} aria-hidden="true" /> إيقاف مؤقت
                          </button>
                        )}
                        {v2 && mayResume && (l.state === "paused" || l.state === "expired") && (
                          <button type="button" disabled={busy} className={ghostBtn}
                            onClick={() => { setError(null); setPending({ id: l.id, kind: "resume", lifetime: l.lifetime ?? DEFAULT_TRACKING_LIFETIME }); }}>
                            <Play size={12} aria-hidden="true" /> إعادة تفعيل
                          </button>
                        )}
                        <button type="button" disabled={busy} className={dangerBtn}
                          onClick={() => { setError(null); setPending({ id: l.id, kind: "revoke", lifetime: DEFAULT_TRACKING_LIFETIME }); }}>
                          <Prohibit size={12} aria-hidden="true" /> إلغاء نهائي
                        </button>
                      </div>
                    )}
                  </div>

                  {isPending && pending.kind === "resume" && (
                    <div className={`mt-2 rounded-lg border p-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                      <p className={`text-[11px] ${muted}`}>يعود الرابط نفسه للعمل — لا حاجة لإرسال رابط جديد للموكل.</p>
                      <LifetimePicker value={pending.lifetime} onChange={(lt) => setPending({ ...pending, lifetime: lt })} isDark={isDark} name={`tracking-resume-${l.id}`} />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" disabled={busy} className={primaryBtn}
                          onClick={() => act(l.id, () => resumeTrackingLink(caseId, l.id, pending.lifetime), "تعذّر إعادة تفعيل الرابط.")}>
                          {busy ? "جارٍ التفعيل…" : "تفعيل"}
                        </button>
                        <button type="button" disabled={busy} className={ghostBtn} onClick={() => setPending(null)}>تراجع</button>
                      </div>
                    </div>
                  )}
                  {isPending && pending.kind === "revoke" && (
                    <div role="alertdialog" aria-label="تأكيد الإلغاء النهائي"
                      className={`mt-2 rounded-lg border p-2.5 ${isDark ? "border-red-400/30 bg-red-500/10" : "border-red-200 bg-red-50"}`}>
                      <p className={`text-[12px] font-bold ${isDark ? "text-red-300" : "text-red-800"}`}>
                        إلغاء نهائي: لن يعمل هذا الرابط مرة أخرى ولا يمكن التراجع. {v2 ? "للإيقاف المؤقت استخدم «إيقاف مؤقت»." : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" disabled={busy} className={dangerBtn}
                          onClick={() => act(l.id, () => revokeTrackingLink(caseId, l.id), "تعذّر إلغاء الرابط.")}>
                          نعم، ألغِ الرابط نهائياً
                        </button>
                        <button type="button" disabled={busy} className={ghostBtn} onClick={() => setPending(null)}>تراجع</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {live.length > 0 && <p className={`mt-2 text-[11px] ${muted}`}>{live.length.toLocaleString("ar-EG")} رابط نشط.</p>}
      </div>
    </section>
  );
}
