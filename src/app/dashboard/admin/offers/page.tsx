"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Eye, Gift, Pause, PencilSimple, Play, Plus, X } from "@phosphor-icons/react";
import { OfferCard } from "@/components/offers/OfferCard";
import {
  CLOSED_REASON_AR,
  DEFAULT_RETURN_MINUTES,
  OFFER_AUDIENCE_KEYS,
  OFFER_AUDIENCE_LABELS_AR,
  OFFER_STATUS_LABELS_AR,
  OFFER_VERIFICATION_LABELS_AR,
  FOUNDER_AUDIENCE_NOTE_AR,
  OFFER_VERIFICATIONS,
  type AdminOfferDto,
  type OfferAudienceKey,
  type OfferStatus,
  type OfferVerification,
} from "@/lib/offers/offerRules";

/**
 * «العروض» (owner item 5) — create, edit, preview and stop offers with no
 * code deploy, and read their stats (impressions / dismissals / clicks /
 * purchases). The admin console is always dark (admin/layout.tsx).
 *   GET   /api/v1/admin/offers         list + stats + plan options
 *   POST  /api/v1/admin/offers         create (settings.write, audited)
 *   PATCH /api/v1/admin/offers/[id]    edit / «إيقاف فوري» (settings.write, audited)
 * Times are entered in Riyadh time; the server compares them with its own clock.
 */

interface ListReply {
  migrationMissing: boolean;
  offers: AdminOfferDto[];
  statsError: boolean;
  planRefs: Array<{ id: string; labelAr: string }>;
}

interface Form {
  title: string;
  body: string;
  mediaUrl: string;
  mediaKind: "image" | "video";
  ctaLabel: string;
  ctaHref: string;
  audience: OfferAudienceKey[];
  verification: OfferVerification;
  excludeBuyers: boolean;
  planRef: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: string;
  seatsUsed: string;
  priority: string;
  status: OfferStatus;
  returnMinutes: string;
}

const EMPTY_FORM: Form = {
  title: "",
  body: "",
  mediaUrl: "",
  mediaKind: "image",
  ctaLabel: "",
  ctaHref: "/pricing",
  audience: [],
  verification: "any",
  excludeBuyers: true,
  planRef: "",
  startsAt: "",
  endsAt: "",
  seatsTotal: "",
  seatsUsed: "0",
  priority: "0",
  status: "draft",
  returnMinutes: String(DEFAULT_RETURN_MINUTES),
};

const RIYADH_MS = 3 * 60 * 60 * 1000;

/** ISO → the "YYYY-MM-DDTHH:mm" a datetime-local input shows, in Riyadh time. */
function toRiyadhInput(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + RIYADH_MS).toISOString().slice(0, 16);
}

/** A datetime-local value read as Riyadh time → ISO; "" → null. */
function fromRiyadhInput(v: string): string | null {
  if (!v) return null;
  return `${v}:00+03:00`;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
}

function formFrom(o: AdminOfferDto): Form {
  return {
    title: o.title,
    body: o.body,
    mediaUrl: o.mediaUrl ?? "",
    mediaKind: o.mediaKind ?? "image",
    ctaLabel: o.ctaLabel,
    ctaHref: o.ctaHref,
    audience: o.audience.filter((a): a is OfferAudienceKey => (OFFER_AUDIENCE_KEYS as readonly string[]).includes(a)),
    verification: o.verification,
    excludeBuyers: o.excludeBuyers,
    planRef: o.planRef ?? "",
    startsAt: toRiyadhInput(o.startsAt),
    endsAt: toRiyadhInput(o.endsAt),
    seatsTotal: o.seatsTotal === null ? "" : String(o.seatsTotal),
    seatsUsed: String(o.seatsUsed),
    priority: String(o.priority),
    status: o.status,
    returnMinutes: String(o.returnMinutes),
  };
}

const toInt = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v.trim()) : v);

/** The form → the API body. A founder-linked offer sends only what it may change. */
function bodyFrom(f: Form, campaignLinked: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: f.title,
    body: f.body,
    mediaUrl: f.mediaUrl.trim() || null,
    mediaKind: f.mediaUrl.trim() ? f.mediaKind : null,
    ctaLabel: f.ctaLabel,
    ctaHref: f.ctaHref,
    startsAt: fromRiyadhInput(f.startsAt),
    endsAt: fromRiyadhInput(f.endsAt),
    priority: toInt(f.priority),
    status: f.status,
    returnMinutes: toInt(f.returnMinutes),
  };
  if (!campaignLinked) {
    body.audience = f.audience;
    body.verification = f.verification;
    body.excludeBuyers = f.excludeBuyers;
    body.planRef = f.planRef || null;
    body.seatsTotal = f.seatsTotal.trim() ? toInt(f.seatsTotal) : null;
    body.seatsUsed = toInt(f.seatsUsed || "0");
  }
  return body;
}

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, body };
  } catch {
    return { ok: false, body: { error: "تعذّر الاتصال بالخادم." } };
  }
}

const card = "rounded-2xl border border-white/[0.06] bg-zinc-900/60";
const th = "p-3 text-right text-[11px] font-bold text-zinc-400";
const td = "p-3 align-top text-[12px] text-zinc-200";
const input = "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 focus:border-[#C8A762]/60 focus:outline-none disabled:opacity-50";
const label = "mb-1 block text-[11px] font-bold text-zinc-400";

export default function AdminOffersPage() {
  const [data, setData] = useState<ListReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; campaignLinked: boolean } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, body } = await call("/api/v1/admin/offers");
    if (ok && body) setData(body as unknown as ListReply);
    else setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل العروض.") });
    setLoading(false);
  }, []);

  useEffect(() => {
    let live = true;
    void call("/api/v1/admin/offers").then(({ ok, body }) => {
      if (!live) return;
      if (ok && body) setData(body as unknown as ListReply);
      else setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل العروض.") });
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditing({ id: null, campaignLinked: false });
    setNotice(null);
  }

  function startEdit(o: AdminOfferDto) {
    setForm(formFrom(o));
    setEditing({ id: o.id, campaignLinked: o.campaignLinked });
    setNotice(null);
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setNotice(null);
    const { ok, body } = await call(editing.id ? `/api/v1/admin/offers/${editing.id}` : "/api/v1/admin/offers", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFrom(form, editing.campaignLinked)),
    });
    setBusy(false);
    if (!ok) {
      setNotice({ ok: false, msg: String(body?.error ?? "تعذّر الحفظ.") });
      return;
    }
    setNotice({ ok: true, msg: "تم الحفظ. يظهر التغيير للمستخدمين فورًا، بلا نشر كود." });
    setEditing(null);
    await load();
  }

  async function setStatus(o: AdminOfferDto, status: OfferStatus) {
    const verb = status === "paused" ? "إيقاف" : "تفعيل";
    if (!window.confirm(`${verb} العرض «${o.title}» الآن؟`)) return;
    setBusy(true);
    setNotice(null);
    const { ok, body } = await call(`/api/v1/admin/offers/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    setNotice(ok ? { ok: true, msg: status === "paused" ? "أُوقف العرض فورًا." : "فُعِّل العرض." } : { ok: false, msg: String(body?.error ?? "تعذّر الحفظ.") });
    await load();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const linked = editing?.campaignLinked ?? false;

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Gift size={22} weight="duotone" className="text-[#C8A762]" /> العروض
          </h1>
          <p className="mt-1 text-[12px] text-zinc-400">
            أي عرض يُضاف أو يُعدَّل هنا يظهر لجمهوره فورًا: نافذة بعد دخول اللوحة (عرض واحد في المرة، الأعلى أولوية)، وبطاقة في قسم «العروض» وفي صفحة الأسعار.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5">
            <ArrowClockwise size={14} /> تحديث
          </button>
          {data && !data.migrationMissing ? (
            <button type="button" onClick={startCreate} className="flex items-center gap-1 rounded-lg bg-[#C8A762] px-3 py-2 text-[12px] font-bold text-[#0B3D2E]">
              <Plus size={14} weight="bold" /> عرض جديد
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p role="status" className={`rounded-xl p-3 text-[13px] ${notice.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{notice.msg}</p>
      ) : null}

      {loading && !data ? <p className="text-[13px] text-zinc-400">جارٍ التحميل…</p> : null}
      {data?.migrationMissing ? (
        <p className={`${card} p-5 text-[13px] text-amber-300`}>نظام العروض غير مفعّل بعد: لم يُنفَّذ ملف SQL ‏20261128_50 على قاعدة البيانات.</p>
      ) : null}
      {data?.statsError ? <p className="text-[12px] text-amber-300">تعذّر تحميل أرقام الظهور والإغلاق والنقر الآن؛ تظهر أصفارًا حتى تُقرأ.</p> : null}

      {editing ? (
        <section className={`${card} space-y-4 p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-white">{editing.id ? "تعديل العرض" : "عرض جديد"}</h2>
            <button type="button" onClick={() => setEditing(null)} aria-label="إغلاق" className="rounded-lg p-1 text-zinc-400 hover:bg-white/5"><X size={16} /></button>
          </div>
          {linked ? (
            <p className="rounded-lg bg-[#C8A762]/10 p-3 text-[12px] text-[#e6cf9b]">
              عرض المؤسس مرتبط بالحملة: جمهوره المحامي المترافع الموثَّق فقط (المستشار خارجه)، ومقاعده ونافذته تُقرأ من عدّاد الحملة الحالي (صفحة «حملة المؤسس»). يُعدَّل هنا نصه وصورته وزره وأولويته وحالته ومدة عودة النافذة. إيقافه يُخفي النافذة والبطاقات وشريط الحملة ولا يوقف البيع.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={label} htmlFor="o-title">العنوان</label>
              <input id="o-title" className={input} value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={label} htmlFor="o-body">النص</label>
              <textarea id="o-body" className={`${input} min-h-[90px]`} value={form.body} maxLength={1000} onChange={(e) => set("body", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-media">صورة أو فيديو (اختياري) — رابط https أو مسار داخل الموقع؛ الفيديو من الموقع أو تخزين Supabase فقط</label>
              <input id="o-media" dir="ltr" className={input} value={form.mediaUrl} onChange={(e) => set("mediaUrl", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-media-kind">نوع الوسائط</label>
              <select id="o-media-kind" className={input} value={form.mediaKind} onChange={(e) => set("mediaKind", e.target.value as "image" | "video")}>
                <option value="image">صورة</option>
                <option value="video">فيديو</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="o-cta">نص الزر</label>
              <input id="o-cta" className={input} value={form.ctaLabel} maxLength={40} onChange={(e) => set("ctaLabel", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-href">رابط الزر (مسار داخل الموقع، مثل /founder)</label>
              <input id="o-href" dir="ltr" className={input} value={form.ctaHref} onChange={(e) => set("ctaHref", e.target.value)} />
            </div>
            <fieldset className="md:col-span-2" disabled={linked}>
              <legend className={label}>الجمهور: أنواع الحسابات</legend>
              <div className="flex flex-wrap gap-3">
                {OFFER_AUDIENCE_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-1.5 text-[13px] text-zinc-200">
                    <input
                      type="checkbox"
                      checked={form.audience.includes(k)}
                      onChange={(e) => set("audience", e.target.checked ? [...form.audience, k] : form.audience.filter((a) => a !== k))}
                    />
                    {OFFER_AUDIENCE_LABELS_AR[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={label} htmlFor="o-verif">حالة التوثيق</label>
              <select id="o-verif" className={input} disabled={linked} value={form.verification} onChange={(e) => set("verification", e.target.value as OfferVerification)}>
                {OFFER_VERIFICATIONS.map((v) => <option key={v} value={v}>{OFFER_VERIFICATION_LABELS_AR[v]}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="o-plan">البند المرتبط (للشراء والاستثناء والإحصاء)</label>
              <select id="o-plan" className={input} disabled={linked} value={form.planRef} onChange={(e) => set("planRef", e.target.value)}>
                <option value="">— بلا بند —</option>
                {(data?.planRefs ?? []).map((p) => <option key={p.id} value={p.id}>{p.labelAr}</option>)}
                {form.planRef && !(data?.planRefs ?? []).some((p) => p.id === form.planRef) ? <option value={form.planRef}>{form.planRef}</option> : null}
              </select>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-zinc-200 md:col-span-2">
              <input type="checkbox" disabled={linked} checked={form.excludeBuyers} onChange={(e) => set("excludeBuyers", e.target.checked)} />
              استثناء من اشترى هذا البند (ويختفي العرض عن المستخدم بعد شرائه)
            </label>
            <div>
              <label className={label} htmlFor="o-start">البداية (بتوقيت الرياض، فارغ = فورًا)</label>
              <input id="o-start" type="datetime-local" className={input} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-end">النهاية (بتوقيت الرياض، فارغ = بلا نهاية)</label>
              <input id="o-end" type="datetime-local" className={input} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-seats">عدد المقاعد الكلي (فارغ = غير محدود)</label>
              <input id="o-seats" inputMode="numeric" className={input} disabled={linked} value={form.seatsTotal} onChange={(e) => set("seatsTotal", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-used">مقاعد مستهلكة خارج الدفع الإلكتروني (تُضاف إليها المشتريات المدفوعة)</label>
              <input id="o-used" inputMode="numeric" className={input} disabled={linked} value={form.seatsUsed} onChange={(e) => set("seatsUsed", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-prio">الأولوية (الأعلى يظهر في النافذة أولًا)</label>
              <input id="o-prio" inputMode="numeric" className={input} value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-return">عودة النافذة بعد الإغلاق (بالدقائق؛ ٤٣٢٠ = ٣ أيام)</label>
              <input id="o-return" inputMode="numeric" className={input} value={form.returnMinutes} onChange={(e) => set("returnMinutes", e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="o-status">الحالة</label>
              <select id="o-status" className={input} value={form.status} onChange={(e) => set("status", e.target.value as OfferStatus)}>
                {(["draft", "active", "paused"] as const).map((s) => <option key={s} value={s}>{OFFER_STATUS_LABELS_AR[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#C8A762] px-4 py-2 text-[13px] font-bold text-[#0B3D2E] disabled:opacity-50">حفظ</button>
            <button type="button" onClick={() => setPreview(true)} className="flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-[13px] text-zinc-200 hover:bg-white/5">
              <Eye size={14} /> معاينة
            </button>
          </div>
        </section>
      ) : null}

      {data && !data.migrationMissing ? (
        <section className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["العرض", "الحالة", "الجمهور", "الأولوية", "النافذة", "المقاعد", "ظهور", "إغلاق", "نقر", "شراء", ""].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.offers.map((o) => (
                <tr key={o.id}>
                  <td className={td}>
                    <p className="font-bold text-white">{o.title}</p>
                    {o.campaignLinked ? <p className="mt-1 text-[11px] text-[#C8A762]">مرتبط بحملة المؤسس</p> : null}
                  </td>
                  <td className={td}>
                    <p>{OFFER_STATUS_LABELS_AR[o.status]}</p>
                    <p className={`mt-1 text-[11px] ${o.openNow ? "text-emerald-400" : "text-zinc-400"}`}>
                      {o.openNow ? "ظاهر الآن لجمهوره" : o.closedReason ? CLOSED_REASON_AR[o.closedReason] : "—"}
                    </p>
                  </td>
                  <td className={td}>
                    {o.audience.map((a) => OFFER_AUDIENCE_LABELS_AR[a as OfferAudienceKey] ?? a).join("، ")}
                    <p className="mt-1 text-[11px] text-zinc-400">{o.campaignLinked ? FOUNDER_AUDIENCE_NOTE_AR : OFFER_VERIFICATION_LABELS_AR[o.verification]}</p>
                  </td>
                  <td className={td}>{o.priority}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {o.campaignLinked ? "نافذة الحملة" : <>{fmt(o.startsAt)}<br />{fmt(o.endsAt)}</>}
                  </td>
                  <td className={td}>
                    {o.seatsLeft !== null ? `متبقٍ ${o.seatsLeft}` : o.seatsTotal !== null ? `${o.seatsTotal}` : "غير محدود"}
                  </td>
                  <td className={td}>{o.stats.impressions}<p className="text-[10px] text-zinc-500">{o.stats.reachedUsers} مستخدم</p></td>
                  <td className={td}>{o.stats.dismissals}</td>
                  <td className={td}>{o.stats.clicks}</td>
                  <td className={td}>{o.stats.purchases === null ? "—" : o.stats.purchases}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => startEdit(o)} title="تعديل" aria-label="تعديل" className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/5"><PencilSimple size={15} /></button>
                      <button type="button" onClick={() => { startEdit(o); setPreview(true); }} title="معاينة" aria-label="معاينة" className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/5"><Eye size={15} /></button>
                      {o.status === "active" ? (
                        <button type="button" disabled={busy} onClick={() => void setStatus(o, "paused")} className="flex items-center gap-1 rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-bold text-rose-300 disabled:opacity-50">
                          <Pause size={12} /> إيقاف فوري
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void setStatus(o, "active")} className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-300 disabled:opacity-50">
                          <Play size={12} /> تفعيل
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.offers.length === 0 ? <p className="p-5 text-[12px] text-zinc-400">لا توجد عروض بعد.</p> : null}
          <p className="px-5 pb-4 pt-2 text-[11px] text-zinc-500">
            «شراء» = الطلبات المدفوعة لبند العرض منذ بدايته (لعرض المؤسس: كل طلبات باقة المؤسس المدفوعة). «ظهور» يُحسب مرة لكل مستخدم في نصف ساعة.
          </p>
        </section>
      ) : null}

      {preview && editing ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 px-4" onClick={() => setPreview(false)}>
          <div role="dialog" aria-modal="true" aria-label="معاينة العرض" onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl border border-[#C8A762]/30 bg-zinc-900 p-6 pt-10">
            <p className="absolute start-4 top-3 text-[11px] text-zinc-500">معاينة — هكذا تظهر النافذة للمستخدم</p>
            <button type="button" onClick={() => setPreview(false)} aria-label="إغلاق المعاينة" className="absolute end-3 top-3 rounded-lg p-1 text-zinc-400 hover:bg-white/5"><X size={16} /></button>
            <OfferCard
              ctaDisabled
              offer={{
                id: editing.id ?? "preview",
                title: form.title || "عنوان العرض",
                body: form.body,
                mediaUrl: form.mediaUrl.trim() || null,
                mediaKind: form.mediaUrl.trim() ? form.mediaKind : null,
                ctaLabel: form.ctaLabel || "نص الزر",
                ctaHref: form.ctaHref || "/",
                seatsLeft: null,
                seatsTotal: null,
                endsAt: fromRiyadhInput(form.endsAt),
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
