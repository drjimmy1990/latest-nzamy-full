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
  // Optional so an older deploy of the route (which did not send the key) reads
  // as `undefined` → `!== true` → "did not fail", which is the same conclusion
  // this page drew before the marker existed. The route always sends it,
  // including `false` (src/app/api/v1/profile/route.ts:205-212).
  roleProfileReadFailed?: boolean;
};

/**
 * WHY the form holds no server state — the banner copy below, and nothing else.
 *
 *   "read-failed" — the GET threw, or it returned 200 and the route reported
 *                   that the `lawyer_profiles` read itself failed.
 *   "no-row"      — the GET succeeded and this account has no professional row
 *                   it can see.
 *   "no-server"   — demo build; there is nothing to read from or write to.
 *
 * NEVER gate Save on this. `loaded` is the only save gate, and the reason all
 * three of these exist as one type is that they are equally unsafe to save
 * through — see the note on `loaded` below.
 */
type BlockedReason = "read-failed" | "no-row" | "no-server";

const BLOCKED_COPY: Record<BlockedReason, { title: string; body: string }> = {
  // «قد يمسح», not «سيمسح». A failed read tells us nothing about what is in
  // the row — including whether there is one — so the certain version was
  // itself a small over-claim of exactly the kind this round is closing. The
  // warning keeps its force without asserting a consequence we cannot know.
  "read-failed": {
    title: "لم تُقرأ بياناتك الحالية — الحفظ معطّل",
    body: "الحقول أدناه فارغة لأننا لم نتمكن من قراءة ملفك، لا لأن ملفك فارغ. لا نعرف ما هو محفوظ فيه الآن، والحفظ بحقول فارغة قد يمسح نبذتك وتخصصاتك ورقم ترخيصك. لن يُحفظ شيء مما تكتبه هنا قبل أن تنجح القراءة — أعد المحاولة أولاً.",
  },
  "no-row": {
    // The reason Save is off here is NOT the overwrite risk — there is nothing
    // to overwrite. It is that PATCH /api/v1/profile updates an existing row
    // (src/app/api/v1/profile/route.ts:368-378) and an UPDATE matching zero
    // rows comes back as PGRST116 → 500. Saying "we could not read you" here
    // would be the false half of the pair this round was opened to fix.
    title: "لا يوجد سجل مهني مرتبط بحسابك — الحفظ معطّل",
    body: "قرأنا حسابك بنجاح ولم نجد سجلاً مهنياً مرتبطاً به، فالحقول أدناه فارغة لهذا السبب لا لتعذّر القراءة. الحفظ هنا يُحدّث سجلاً قائماً ولا يُنشئ سجلاً جديداً، ولا يمكن إنشاء السجل المهني من لوحة التحكم — يرجى التواصل مع الدعم لإنشائه. لن يُحفظ شيء مما تكتبه هنا.",
  },
  "no-server": {
    title: "التعديل غير متاح في هذا الوضع",
    body: "هذه الصفحة تقرأ ملفك من الخادم وتحفظ إليه، والخادم غير متصل في هذا الوضع. لم نعرض بيانات بديلة، ولن يُحفظ شيء مما تكتبه هنا.",
  },
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
   * `blocked` below names WHICH of them happened, and that is ALL it does. Do
   * not fold the two together and do not gate the button on `blocked`: the
   * three reasons read very differently on screen but are identical here —
   * none of them left the form holding the lawyer's real row, so none of them
   * may be saved through. One of them is not "milder" than the others.
   *
   * REJECTED ALTERNATIVE: sending only dirty fields, which would let a lawyer
   * save through a failed load. It changes the `city` semantics — city is on
   * both allowlists, and a body containing city alone carries no lawyer-only
   * key, so lawyer_profiles.city would silently stop updating while
   * profiles.city did. Not worth the regression; blocking the save and saying
   * why costs one retry click.
   */
  const [loaded, setLoaded] = useState(false);
  // Null only before load() has resolved, and the banner is not rendered then
  // (the spinner returns first). Every non-success exit from load() sets it.
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);

  const load = useCallback(async () => {
    // `isSupabaseMode` is a module-level constant, so this branch is
    // dead-code-eliminated from a production build. In a demo build there is no
    // server to read from OR write to, and `loaded` stays false — which is the
    // correct answer for Save too.
    if (!isSupabaseMode) { setBlocked("no-server"); setLoading(false); return; }
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
        setBlocked(null);
        setLoaded(true);
      } else {
        /*
         * 200 with no professional row. WHICH of the two states this is now
         * comes from the route rather than from a guess here.
         *
         * supabase-js does not throw when a read fails — it returns
         * `{ data: null, error }` — and the route used to discard that error,
         * so "no row" and "could not read the row" arrived identical. It now
         * reads the error and reports it as `roleProfileReadFailed` next to a
         * null `roleProfile` (src/app/api/v1/profile/route.ts:152-195).
         *
         * This is NOT a clean two-way split, and the copy must not imply one:
         * an RLS-filtered SELECT returns zero rows WITHOUT raising, so a row
         * this session merely may not read also lands here with the marker
         * false — the route's own GET docstring says exactly that. A session
         * whose `user_type` is not "lawyer" lands here too: the route never
         * reads the table for it at all (route.ts:169-186), so that is a third
         * way into this branch, marker false. (routeAccess should keep it
         * unreachable; "should" is not "does".) Hence «لا يوجد سجل مهني مرتبط
         * بحسابك», a statement about what this account can see, and never "the
         * record does not exist".
         *
         * Both states leave the form empty and `loaded` false, so Save is
         * disabled either way. Only the sentence differs — and that sentence is
         * the whole point: the profile page one click away distinguishes these
         * two, so this page saying "could not read" over a successful read made
         * two adjacent screens contradict each other.
         */
        setBlocked(res.roleProfileReadFailed === true ? "read-failed" : "no-row");

        /*
         * ─── DEFERRED: creating the missing row from here ────────────────────
         *
         * An earlier pass deferred this on the ground that «no owner INSERT
         * policy exists, and adding one is a migration (banned)». That ground
         * is FALSE and should not be repeated:
         * supabase/migrations/20260614_auto_create_role_profiles.sql:195-206
         * creates policy "users insert own lawyer profile" on
         * public.lawyer_profiles for insert with check (user_id = auth.uid()).
         * No migration would be needed to use it.
         *
         * It stays deferred on a real ground instead: nobody in a coding
         * session can verify that 20260614 was ever APPLIED to production, and
         * in this project migrations are applied by the owner, never by us.
         *
         * THE ONE CHECK, against PRODUCTION, before anyone builds this:
         *   does pg_policies hold a row with tablename = 'lawyer_profiles'
         *   and policyname = 'users insert own lawyer profile'?
         * If it does not, an insert from here returns an RLS denial and this
         * honest banner becomes a runtime failure.
         *
         * DO NOT treat the existing provisioning path as evidence that it does.
         * src/app/api/v1/onboarding/account-type/route.ts:200 really does
         * create these rows in production — but on `createServiceClient()`
         * (same file, :310), which bypasses RLS entirely, so its success says
         * nothing about what an authenticated session is allowed to insert.
         * Everything this editor writes goes through `createClient()` and is
         * subject to the policy.
         *
         * And the build is not in this file: PATCH /api/v1/profile does
         * `.update().eq().select().single()`
         * (src/app/api/v1/profile/route.ts:368-378) — which is precisely why
         * the no-row save is blocked, since an UPDATE matching zero rows
         * returns PGRST116 and the route answers 500 «تعذّر حفظ التعديلات».
         * Building this means changing that call and deciding which columns a
         * self-created row may carry (verification_status must not be one; it
         * is admin-only by design).
         */
      }
    } catch { setBlocked("read-failed"); }
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
        Why the form is empty and the Save button below is disabled. An
        unexplained disabled button is its own small lie — but so is ONE
        explanation for three different states, which is what this block used to
        be: it told a lawyer who simply has no professional row that we had
        failed to read him, and that saving «كان سيمسح نبذتك ورقم ترخيصك» when
        there was nothing there to erase.

        «إعادة المحاولة» is offered for the read failure ONLY. Re-reading is a
        real fix for that and for nothing else: it cannot conjure a row, and in
        a demo build there is no server to re-read from. Offering it in those
        states would be a button that pretends to be a way out. (The old
        `isSupabaseMode` guard on it is therefore redundant now — "read-failed"
        is only ever reached from inside the try, past the demo early-return.)
      */}
      {!loaded && blocked && (
        <div className={`rounded-2xl border p-4 flex gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <Warning size={18} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              {BLOCKED_COPY[blocked].title}
            </p>
            <p className={`text-[11px] mt-1 leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-700/70"}`}>
              {BLOCKED_COPY[blocked].body}
            </p>
            {blocked === "read-failed" && (
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
          {/*
            The tooltip carries the SAME reason as the banner, never a second
            one. It used to say «الحفظ معطّل حتى تُقرأ بياناتك الحالية»
            unconditionally — the wrong reason for the lawyer who has no
            professional row at all, and the right one for only one of three.
          */}
          <button onClick={handleSave} disabled={saving || !loaded}
            title={!loaded && blocked ? BLOCKED_COPY[blocked].title : undefined}
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
