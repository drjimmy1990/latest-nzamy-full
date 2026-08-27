"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowClockwise, CheckCircle, Info, SpinnerGap, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

type Form = {
  bio_ar: string;
  specialties: string; // comma-separated in the input, split on submit
  years_experience: string;
  hourly_rate: string;
  license_number: string;
  bar_association: string;
  city: string;
  marketplace_visible: boolean;
  is_accepting_clients: boolean;
  show_contact: boolean;
};

/** The three boolean fields, narrowed so the toggle list needs no casts. */
type BooleanFormKey = "marketplace_visible" | "is_accepting_clients" | "show_contact";

const EMPTY: Form = {
  bio_ar: "", specialties: "", years_experience: "", hourly_rate: "",
  license_number: "", bar_association: "", city: "",
  marketplace_visible: false, is_accepting_clients: true, show_contact: false,
};

type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "موثّق",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  suspended: "موقوف",
};

type ProfileApiResponse = {
  profile: { city?: string | null } | null;
  roleProfile: {
    bio_ar?: string | null; specialties?: string[] | null;
    years_experience?: number | null; hourly_rate?: number | null;
    license_number?: string | null; bar_association?: string | null;
    city?: string | null; marketplace_visible?: boolean | null;
    is_accepting_clients?: boolean | null; show_contact?: boolean | null;
    verification_status?: VerificationStatus | null;
  } | null;
};

export default function LawyerProfileEditPage() {
  const { isDark } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  // Always true at first render. NOT `useState(isSupabaseMode)`: that constant
  // reads `typeof window` (src/lib/services/api.ts:15-20), so it is FALSE
  // during SSR and true in the browser — the server would ship the empty form
  // plus the "could not read" banner and the client would hydrate into a
  // spinner. Reading it inside the effect-invoked load() below is safe.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  /*
   * `loaded` — true ONLY once the form actually holds server state.
   *
   * WHY THIS EXISTS: handleSave builds a COMPLETE body from `form` and PATCHes
   * it, and the API applies exactly what it is given (no merge, no partial
   * semantics — src/app/api/v1/profile/route.ts:230). So if the GET never
   * populated the form, Save writes the EMPTY defaults over the lawyer's real
   * row: bio blanked, specialties emptied, hourly_rate nulled, city blanked on
   * BOTH profiles and lawyer_profiles (`city` is on both allowlists), and
   * license_number — his bar licence — blanked. Previously the only `disabled`
   * condition was `saving`, and the failure chip sat above a form that looked
   * exactly like an ordinary empty first-time profile inviting entry.
   *
   * It is one flag rather than a `loadFailed` flag because there are three
   * non-success exits from load(): the catch, the demo-mode early return, and
   * `roleProfile` coming back null. Setting it inside `if (r)` — the one place
   * the form receives server state — covers all three.
   *
   * REJECTED ALTERNATIVE: sending only dirty fields, which would let a lawyer
   * save through a failed load. It changes the `city` semantics — city is on
   * both allowlists, and a body containing city alone carries no lawyer-only
   * key, so lawyer_profiles.city would silently stop updating while
   * profiles.city did. Not worth the regression; blocking the save and saying
   * why costs one retry click.
   */
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    // `isSupabaseMode` is a module-level constant, so this branch is
    // dead-code-eliminated from a production build. In a demo build there is no
    // server to read from OR write to, and `loaded` stays false — which is the
    // correct answer for Save too.
    if (!isSupabaseMode) { setLoading(false); return; }
    try {
      const res = await apiGet<ProfileApiResponse>("/api/v1/profile");
      const r = res.roleProfile;
      if (r) {
        setForm({
          bio_ar: r.bio_ar ?? "",
          specialties: (r.specialties ?? []).join("، "),
          years_experience: r.years_experience != null ? String(r.years_experience) : "",
          hourly_rate: r.hourly_rate != null ? String(r.hourly_rate) : "",
          license_number: r.license_number ?? "",
          bar_association: r.bar_association ?? "",
          city: (r.city ?? res.profile?.city) ?? "",
          marketplace_visible: r.marketplace_visible ?? false,
          is_accepting_clients: r.is_accepting_clients ?? true,
          show_contact: r.show_contact ?? false,
        });
        setVerification(r.verification_status ?? null);
        setLoaded(true);
      } else {
        // 200 with no lawyer_profiles row. The route swallows the error from
        // that sub-query (route.ts:100-105), so this also covers a read that
        // failed rather than a row that is genuinely absent — and we cannot
        // tell which from here. Either way there is nothing safe to overwrite.
        setMsg({ type: "err", text: "تعذّر قراءة بيانات ملفك المهني. لم نعرض بيانات بديلة، والحفظ معطّل حتى تنجح القراءة." });
      }
    } catch { setMsg({ type: "err", text: "تعذّر تحميل بيانات الملف" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!loaded) return; // belt and braces; the button is disabled too
    setSaving(true); setMsg(null);
    try {
      const body = {
        bio_ar: form.bio_ar,
        specialties: form.specialties.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
        years_experience: form.years_experience ? parseInt(form.years_experience, 10) : 0,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        license_number: form.license_number,
        bar_association: form.bar_association,
        city: form.city,
        marketplace_visible: form.marketplace_visible,
        is_accepting_clients: form.is_accepting_clients,
        show_contact: form.show_contact,
      };
      // Route the PATCH through the same api service used for the GET so auth /
      // base-url handling is consistent (never a raw fetch).
      await apiMutate("/api/v1/profile", "PATCH", body);
      setMsg({ type: "ok", text: "تم حفظ التعديلات بنجاح" });
      setTimeout(() => router.push("/dashboard/lawyer/profile"), 800);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "حدث خطأ" });
    } finally { setSaving(false); }
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const input = `w-full px-3 py-2 rounded-xl text-[13px] border transition-colors ${
    isDark ? "bg-zinc-800 border-white/[0.06] text-zinc-200 placeholder:text-zinc-600"
           : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400"}`;
  const label = `text-[11px] font-bold mb-1 block ${isDark ? "text-zinc-400" : "text-slate-500"}`;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Sub-copy under each toggle. Without it «الظهور في دليل المحامين» reads as
  // "tick this and clients find you", which is not what it does — see the
  // notice block below the toggles for the two conditions it cannot satisfy
  // on its own.
  const TOGGLES: { key: BooleanFormKey; label: string; hint: string }[] = [
    {
      key: "marketplace_visible",
      label: "أرغب بالظهور في دليل المحامين",
      hint: "تفضيل يُحفظ في ملفك. لا يُنشر ملفك بمجرد تفعيله — اقرأ الشروط أدناه.",
    },
    {
      key: "is_accepting_clients",
      label: "أستقبل موكلين جدد",
      hint: "يظهر للموكلين في ملفك العام عند نشره.",
    },
    {
      key: "show_contact",
      label: "إظهار بيانات التواصل في الدليل العام",
      hint: "يشمل رقم الجوال والبريد المسجّلين في حسابك.",
    },
  ];

  if (loading) return <div className="max-w-2xl mx-auto p-10 text-center" dir="rtl"><SpinnerGap size={24} className="animate-spin mx-auto text-zinc-400" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Link href="/dashboard/lawyer/profile"
          className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
          <ArrowLeft size={16} />
        </Link>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>تعديل الملف المهني</h1>
      </motion.div>

      {/*
        Load failed (or there is no server). Say so ABOVE the form, and make it
        the reason the Save button below is disabled — an unexplained disabled
        button is its own small lie.
      */}
      {!loaded && (
        <div className={`rounded-2xl border p-4 flex gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <Warning size={18} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              لم تُقرأ بياناتك الحالية — الحفظ معطّل
            </p>
            <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-700/70"}`}>
              الحقول أدناه فارغة لأننا لم نتمكن من قراءة ملفك، لا لأن ملفك فارغ.
              الحفظ الآن كان سيمسح نبذتك وتخصصاتك ورقم ترخيصك. أعد المحاولة أولاً.
            </p>
            {isSupabaseMode && (
              <button onClick={() => { setMsg(null); setLoading(true); load(); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[11px] font-bold text-[#C8A762] transition-colors hover:bg-[#0a3328]">
                <ArrowClockwise size={13} weight="bold" /> إعادة المحاولة
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`${card} p-5 space-y-4`}>
        <div>
          <label className={label}>نبذة تعريفية</label>
          <textarea rows={4} value={form.bio_ar} onChange={(e) => set("bio_ar", e.target.value)} className={input} placeholder="نبذة عن خبرتك ومجالات عملك" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={label}>التخصصات (افصل بفاصلة)</label>
            <input value={form.specialties} onChange={(e) => set("specialties", e.target.value)} className={input} placeholder="قانون تجاري، قانون عمل" /></div>
          <div><label className={label}>المدينة</label>
            <input value={form.city} onChange={(e) => set("city", e.target.value)} className={input} /></div>
          <div><label className={label}>سنوات الخبرة</label>
            <input type="number" min="0" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} className={input} /></div>
          <div><label className={label}>سعر الساعة (ر.س)</label>
            <input type="number" min="0" value={form.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} className={input} /></div>
          <div><label className={label}>رقم الترخيص</label>
            <input value={form.license_number} onChange={(e) => set("license_number", e.target.value)} className={input} placeholder="رقم ترخيص المحاماة" /></div>
          <div><label className={label}>جهة الترخيص</label>
            <input value={form.bar_association} onChange={(e) => set("bar_association", e.target.value)} className={input} placeholder="الهيئة السعودية للمحامين" /></div>
        </div>

        <div className="space-y-3 pt-2">
          {TOGGLES.map(({ key, label: lbl, hint }) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="accent-[#0B3D2E] w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="min-w-0">
                <span className={`block text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{lbl}</span>
                <span className={`block text-[11px] mt-0.5 leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {/*
          The two conditions the visibility toggle cannot satisfy by itself.
          Verified against the code rather than assumed:
            • GET /api/v1/lawyers filters on verification_status = 'verified'
              BEFORE marketplace_visible, and the RLS policy
              "public read verified lawyers" requires both — so an unverified
              lawyer with the box ticked is returned by nothing.
            • verification_status is deliberately excluded from the PATCH
              allowlist (self-verification would be a trust-badge bypass); only
              the admin verification endpoint can set it.
            • /lawyers is redirected away entirely while BETA_MONOPOLY_MODE is
              on, so the directory is not a live page for anyone right now.
          The beta clause is behind the flag so this stops being displayed the
          day the flag is turned off.
        */}
        <div className={`rounded-xl border p-3 flex gap-2.5 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-200 bg-slate-50/60"}`}>
          <Info size={15} weight="duotone" className="flex-shrink-0 mt-0.5 text-[#C8A762]" />
          <div className="min-w-0">
            <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>ما الذي يلزم لنشر ملفك في الدليل؟</p>
            <ul className={`text-[11px] leading-relaxed space-y-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              <li>• تفعيل خيار «أرغب بالظهور في دليل المحامين» أعلاه.</li>
              <li>
                • توثيق حسابك من إدارة المنصة. التوثيق قرار إداري ولا يمكن تعديله من هذه الصفحة.
                {verification && (
                  <span className={`font-bold ${verification === "verified" ? "text-emerald-500" : "text-amber-500"}`}>
                    {" "}حالتك الحالية: {VERIFICATION_LABEL[verification]}.
                  </span>
                )}
              </li>
              {BETA_MONOPOLY_MODE && (
                <li>• دليل المحامين العام غير مُفعَّل خلال مرحلة التجربة الحالية، فلا يظهر فيه أي محامٍ بعد — حتى الموثّقين.</li>
              )}
            </ul>
          </div>
        </div>

        {msg && (
          <div className={`text-[12px] font-bold px-3 py-2 rounded-xl flex items-start gap-2 ${msg.type === "ok" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
            {msg.type === "ok" ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" /> : <Warning size={14} className="flex-shrink-0 mt-0.5" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleSave} disabled={saving || !loaded}
            title={!loaded ? "الحفظ معطّل حتى تُقرأ بياناتك الحالية" : undefined}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />} حفظ التعديلات
          </button>
          <Link href="/dashboard/lawyer/profile"
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
            إلغاء
          </Link>
        </div>
      </div>
    </div>
  );
}
