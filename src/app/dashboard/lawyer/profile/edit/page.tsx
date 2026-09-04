"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowClockwise, CheckCircle, Info, Plus, SpinnerGap, Trash, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import {
  slugIssue,
  suggestSlug,
  educationIssue,
  COURTS,
  LANGUAGES,
  isCourtCode,
  isLanguageCode,
  type EducationEntry,
  type CourtCode,
  type LanguageCode,
} from "@/lib/services/lawyerProfileFields";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";

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
  // Phase 7 (items 128 · 130 · 133) — contracts in lawyerProfileFields.ts.
  slug: string;
  headline_ar: string;
  education: EducationEntry[];
  courts: CourtCode[];
  languages: LanguageCode[];
};

/** The three boolean fields, narrowed so the toggle list needs no casts. */
type BooleanFormKey = "marketplace_visible" | "is_accepting_clients" | "show_contact";

// lawyer_profiles.headline_ar's own limit (src/app/api/v1/profile/route.ts
// MAX_HEADLINE_LENGTH) — not exported from there, so mirrored here for the
// counter. Keep both in sync if the column's check ever changes.
const MAX_HEADLINE_LENGTH = 160;

// AR.slugTaken in src/app/api/v1/profile/route.ts — not exported, so matched
// by exact text against the PATCH failure to show the 409 under the slug
// field too, not only in the general save banner. Keep in sync with that
// route's copy.
const SLUG_TAKEN_MESSAGE = "هذا الرابط مستخدم من محامٍ آخر";

/**
 * `lawyer_profiles.education` is jsonb — Postgres enforces "is this an
 * array" (the `education_is_array_check` constraint) but nothing enforces
 * the shape of what is inside it, and this app has no admin tool that writes
 * this column today besides this form. Coerced defensively per-entry rather
 * than trusted as `EducationEntry[]`: a malformed `degree`/`institution`
 * (missing, non-string) would otherwise reach `<input value={undefined}>`,
 * which React logs as an uncontrolled-input warning and half-renders.
 */
function sanitizeEducation(raw: unknown): EducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const entry = (e ?? {}) as Partial<EducationEntry>;
    return {
      degree: typeof entry.degree === "string" ? entry.degree : "",
      institution: typeof entry.institution === "string" ? entry.institution : "",
      year: typeof entry.year === "number" ? entry.year : null,
    };
  });
}

const EMPTY: Form = {
  bio_ar: "", specialties: "", years_experience: "", hourly_rate: "",
  license_number: "", bar_association: "", city: "",
  marketplace_visible: false, is_accepting_clients: true, show_contact: false,
  slug: "", headline_ar: "", education: [], courts: [], languages: ["ar"],
};

type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "موثّق",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  suspended: "موقوف",
};

type ProfileApiResponse = {
  // display_name_en feeds suggestSlug() below — «from the Latin display name
  // when available» — never sent back on save (it is not on the lawyer form).
  profile: { city?: string | null; display_name_en?: string | null } | null;
  roleProfile: {
    bio_ar?: string | null; specialties?: string[] | null;
    years_experience?: number | null; hourly_rate?: number | null;
    license_number?: string | null; bar_association?: string | null;
    city?: string | null; marketplace_visible?: boolean | null;
    is_accepting_clients?: boolean | null; show_contact?: boolean | null;
    verification_status?: VerificationStatus | null;
    // Phase 7 — same columns PATCH /api/v1/profile allowlists.
    slug?: string | null; headline_ar?: string | null;
    education?: EducationEntry[] | null;
    courts?: string[] | null; languages?: string[] | null;
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

/**
 * `retry` is BOTH the button's label and the condition that renders it: an
 * entry without one shows no button. That keeps "may this state be re-read?"
 * next to the sentence that state puts on screen, instead of in a separate
 * `blocked === …` test in the JSX that drifts away from it — which is exactly
 * how the no-row lawyer lost his button once already.
 */
const BLOCKED_COPY: Record<
  BlockedReason,
  { title: string; body: string; retry?: string }
> = {
  // «قد يمسح», not «سيمسح». A failed read tells us nothing about what is in
  // the row — including whether there is one — so the certain version was
  // itself a small over-claim of exactly the kind this round is closing. The
  // warning keeps its force without asserting a consequence we cannot know.
  "read-failed": {
    title: "لم تُقرأ بياناتك الحالية — الحفظ معطّل",
    body: "الحقول أدناه فارغة لأننا لم نتمكن من قراءة ملفك، لا لأن ملفك فارغ. لا نعرف ما هو محفوظ فيه الآن، والحفظ بحقول فارغة قد يمسح نبذتك وتخصصاتك ورقم ترخيصك. لن يُحفظ شيء مما تكتبه هنا قبل أن تنجح القراءة — أعد المحاولة أولاً.",
    retry: "إعادة المحاولة",
  },
  "no-row": {
    // The reason Save is off here is NOT the overwrite risk — there is nothing
    // to overwrite. It is that PATCH /api/v1/profile updates an existing row
    // (the `lawyer_profiles` update in its PATCH handler) and an UPDATE
    // matching zero rows comes back as PGRST116 → 500. Saying "we could not
    // read you" here would be the false half of the pair this round opened on.
    //
    // The body used to end «يرجى التواصل مع الدعم لإنشائه» — an instruction
    // whose outcome no feature delivers. Re-verified: no route inserts into
    // `lawyer_profiles` for an existing account (the tree's only insert is
    // onboarding/account-type through a dynamic `spec.table`, and it refuses a
    // caller whose `user_type` is already set), and the admin surface only
    // selects, updates `verification_status` or `credit_balance`, or deletes.
    // What replaces it is the MECHANISM rather than a step: the admin console
    // tells the operator to add the row by hand
    // (`newSectorRowNotes` in src/app/dashboard/admin/users/[id]/page.tsx —
    // «أنشئ الصف يدويًا من قاعدة البيانات»). Naming it is also what makes the
    // retry button below honest: it says what a re-read could ever pick up.
    title: "لا يوجد سجل مهني مرتبط بحسابك — الحفظ معطّل",
    body: "قرأنا حسابك بنجاح ولم نجد سجلاً مهنياً مرتبطاً به، فالحقول أدناه فارغة لهذا السبب لا لتعذّر القراءة. الحفظ هنا يُحدّث سجلاً قائماً ولا يُنشئ سجلاً جديداً، ولا توجد في المنصة — لا في هذه الصفحة ولا في لوحة المسؤول — أداة تُنشئ هذا السجل؛ إنشاؤه تدخّل يدوي في قاعدة البيانات من مشغّل المنصة. لن يُحفظ شيء مما تكتبه هنا، وإن أُنشئ السجل فاضغط «إعادة القراءة» أدناه ليظهر دون إعادة تحميل الصفحة.",
    retry: "إعادة القراءة",
  },
  "no-server": {
    // No `retry`: there is no server in this build, so a re-read is the one
    // thing that genuinely cannot help here.
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
  // Source for the "اقترح رابطاً" button only — never written back.
  const [displayNameEn, setDisplayNameEn] = useState("");
  /*
   * Whether 20260907_phase7_profile_services_reviews.sql — the migration that
   * adds slug/education/courts/languages/headline_ar — has actually run on
   * whatever database this deploy talks to. Migrations here are applied by
   * the project owner, never assumed from the code being merged (see
   * MASTER_PRIORITY_LIST_2026-07-16.md's deploy/migration gap and this file's
   * own "central routes send new columns only when non-null" rule).
   *
   * Detected from GET's response rather than guessed: `.select("*")` in
   * src/app/api/v1/profile/route.ts omits a column entirely when it does not
   * exist in the table (as opposed to existing and being null), so `"slug" in
   * r` is a reliable migrated/not-migrated signal — cheaper and more honest
   * than a second endpoint or a hardcoded flag that drifts from reality.
   *
   * Gates two things: whether the five new sections render at all, and
   * whether handleSave includes their keys in the PATCH body. Without this,
   * on any environment behind the migration the update would carry columns
   * PostgREST does not recognise (PGRST204), the WHOLE row update fails, and
   * bio/licence/city — fields this task was told to keep working — silently
   * stop saving right along with the new ones.
   */
  const [newFieldsAvailable, setNewFieldsAvailable] = useState(false);
  // Distinguishes "this slug is already taken" (a 409 discovered only by
  // trying to save — a race with another lawyer's save, not something the
  // client-side format check in `slugErr` below can ever catch) from every
  // other save failure, so it can be shown under the slug field too and not
  // only in the general banner. The literal text mirrors AR.slugTaken in
  // src/app/api/v1/profile/route.ts, which is not exported from there.
  const [slugServerError, setSlugServerError] = useState<string | null>(null);
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
          slug: r.slug ?? "",
          headline_ar: r.headline_ar ?? "",
          education: sanitizeEducation(r.education),
          courts: (r.courts ?? []).filter(isCourtCode),
          // The column defaults to {"ar"} and R1's route always sends the key,
          // but an empty array is treated the same as "not set yet" so the
          // preselection promised by this task still holds on an old row.
          languages: (r.languages && r.languages.length > 0 ? r.languages : ["ar"]).filter(isLanguageCode),
        });
        setVerification(r.verification_status ?? null);
        setDisplayNameEn(res.profile?.display_name_en ?? "");
        // See the state's own comment: key PRESENCE, not value, is what
        // separates a migrated row (slug present, null or not) from one read
        // off a table that never got the migration (key absent entirely).
        setNewFieldsAvailable("slug" in r);
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
    if (!loaded || hasClientIssue) return; // belt and braces; the button is disabled too
    setSaving(true); setMsg(null); setSlugServerError(null);
    try {
      const body: Record<string, unknown> = {
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
      // Phase 7 columns — keys exactly as PATCH /api/v1/profile allowlists
      // them (src/app/api/v1/profile/route.ts lawyerFields) — included ONLY
      // once the migration that adds them is confirmed live (see
      // `newFieldsAvailable`'s own comment). Sending them unconditionally
      // would fail the WHOLE update (PGRST204) on a database that lacks
      // these columns, taking bio/licence/city down with them.
      if (newFieldsAvailable) {
        body.slug = form.slug.trim();
        body.headline_ar = form.headline_ar;
        body.education = form.education;
        body.courts = form.courts;
        body.languages = form.languages;
      }
      // Route the PATCH through the same api service used for the GET so auth /
      // base-url handling is consistent (never a raw fetch).
      await apiMutate("/api/v1/profile", "PATCH", body);
      setMsg({ type: "ok", text: "تم حفظ التعديلات بنجاح" });
      setTimeout(() => router.push("/dashboard/lawyer/profile"), 800);
    } catch (err) {
      const text = err instanceof Error ? err.message : "حدث خطأ";
      setMsg({ type: "err", text });
      if (text === SLUG_TAKEN_MESSAGE) setSlugServerError(text);
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

  // Same rules the route enforces (slugIssue / educationIssue /
  // offPlatformContactIssue), run here so the lawyer sees the refusal before
  // submitting rather than only after a round trip — and so a client that
  // never even attempts the request cannot desync from what the server would
  // have said. Recomputed on every render; the inputs are a handful of short
  // strings and a ≤10-entry array, not worth memoizing.
  // "" when displayNameEn has no Latin characters at all — computed once so
  // the suggest button's onClick/disabled/title agree on one answer instead
  // of calling suggestSlug() three times per render.
  const slugSuggestion = suggestSlug(displayNameEn);
  const slugErr = slugIssue(form.slug);
  const eduErr = educationIssue(form.education);
  const bioContactErr = offPlatformContactIssue(form.bio_ar);
  const headlineContactErr = offPlatformContactIssue(form.headline_ar);
  const hasClientIssue = Boolean(slugErr || eduErr || bioContactErr || headlineContactErr);

  const addEducation = () => {
    if (form.education.length >= 10) return; // educationIssue's own ceiling
    set("education", [...form.education, { degree: "", institution: "", year: null }]);
  };
  const removeEducation = (index: number) => set("education", form.education.filter((_, i) => i !== index));
  const setEducationField = <K extends keyof EducationEntry>(index: number, key: K, value: EducationEntry[K]) =>
    set("education", form.education.map((e, i) => (i === index ? { ...e, [key]: value } : e)));

  const toggleCourt = (code: CourtCode) =>
    set("courts", form.courts.includes(code) ? form.courts.filter((c) => c !== code) : [...form.courts, code]);
  const toggleLanguage = (code: LanguageCode) =>
    set("languages", form.languages.includes(code) ? form.languages.filter((l) => l !== code) : [...form.languages, code]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
      active
        ? "bg-[#0B3D2E] border-[#0B3D2E] text-[#C8A762]"
        : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/20" : "border-slate-200 text-slate-500 hover:border-slate-300"
    }`;

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

        The retry button is driven by `BLOCKED_COPY[blocked].retry`: present for
        the two states a re-read can actually change, absent for the demo build,
        where there is no server to re-read from. An earlier pass narrowed it to
        "read-failed" alone on the ground that re-reading «cannot conjure a
        row» — true, and beside the point, because the button never claimed to.
        A re-read is the ONLY in-page way to pick up a row that came into
        existence outside this dashboard, which is precisely the state the
        no-row banner describes; without it that lawyer had to reload the whole
        browser tab, and nothing on screen told him so. (This also restores what
        the older `isSupabaseMode` guard did in the browser: shown for both
        server-backed states, hidden in a demo build.)
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
            {BLOCKED_COPY[blocked].retry && (
              <button onClick={() => { setMsg(null); setLoading(true); load(); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[11px] font-bold text-[#C8A762] transition-colors hover:bg-[#0a3328]">
                <ArrowClockwise size={13} weight="bold" /> {BLOCKED_COPY[blocked].retry}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`${card} p-5 space-y-4`}>
        <div>
          <label className={label}>نبذة تعريفية</label>
          <textarea rows={4} value={form.bio_ar} onChange={(e) => set("bio_ar", e.target.value)} className={input} placeholder="نبذة عن خبرتك ومجالات عملك" />
          {/* item 179 — same rule the route refuses with, shown before submit rather than after. */}
          {bioContactErr && (
            <p className="text-[11px] font-bold text-red-500 mt-1 flex items-start gap-1">
              <Warning size={12} weight="fill" className="flex-shrink-0 mt-0.5" /> {bioContactErr}
            </p>
          )}
        </div>

        {/*
          The four Phase 7 sections below (سطر تعريفي / رابط ملفك العام here,
          المؤهلات العلمية / المحاكم / اللغات further down) render only once
          `newFieldsAvailable` confirms the migration that adds their columns
          is live — see that state's own comment. Hidden, not disabled: an
          editable field that silently cannot save is worse than one that is
          not there yet.
        */}
        {newFieldsAvailable && <>
        <div>
          <label className={label}>سطر تعريفي</label>
          <input value={form.headline_ar} maxLength={MAX_HEADLINE_LENGTH}
            onChange={(e) => set("headline_ar", e.target.value)} className={input}
            placeholder="جملة قصيرة تظهر أعلى ملفك العام" />
          <div className="flex items-center justify-between mt-1">
            {headlineContactErr ? (
              <p className="text-[11px] font-bold text-red-500 flex items-start gap-1">
                <Warning size={12} weight="fill" className="flex-shrink-0 mt-0.5" /> {headlineContactErr}
              </p>
            ) : <span />}
            <span className={`text-[10px] flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {form.headline_ar.length}/{MAX_HEADLINE_LENGTH}
            </span>
          </div>
        </div>

        <div>
          <label className={label}>رابط ملفك العام</label>
          <div className="flex items-center gap-2">
            <span className={`text-[12px] flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>nezamy.sa/lawyers/</span>
            <input value={form.slug}
              // A typed edit means the 409 the last save attempt hit no
              // longer describes this input — leaving it up would show a
              // stale "taken" warning under a slug that is now valid, or a
              // different one nobody has tried yet.
              onChange={(e) => { set("slug", e.target.value.trim().toLowerCase()); setSlugServerError(null); }}
              className={input} placeholder="ahmad-al-ghamdi" dir="ltr" />
            <button type="button"
              // slugSuggestion is "" when displayNameEn has no Latin
              // characters at all (an Arabic-only name, or none set) —
              // guarded so the button can never silently blank a slug the
              // lawyer already typed.
              onClick={() => { if (slugSuggestion) { set("slug", slugSuggestion); setSlugServerError(null); } }}
              disabled={!slugSuggestion}
              title={slugSuggestion ? undefined : "لا يوجد اسم لاتيني في حسابك لاقتراح رابط منه"}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              اقتراح رابط
            </button>
          </div>
          {(slugErr || slugServerError) && (
            <p className="text-[11px] font-bold text-red-500 mt-1 flex items-start gap-1">
              <Warning size={12} weight="fill" className="flex-shrink-0 mt-0.5" /> {slugErr ?? slugServerError}
            </p>
          )}
        </div>
        </>}

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

        {newFieldsAvailable && <>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${label} mb-0`}>المؤهلات العلمية</label>
            <button type="button" onClick={addEducation} disabled={form.education.length >= 10}
              className="flex items-center gap-1 text-[11px] font-bold text-[#C8A762] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={12} weight="bold" /> إضافة مؤهل
            </button>
          </div>
          {form.education.length === 0 && (
            <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد مؤهلات مضافة بعد.</p>
          )}
          <div className="space-y-2">
            {form.education.map((entry, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_90px_auto] gap-2 items-start">
                <input value={entry.degree} onChange={(e) => setEducationField(i, "degree", e.target.value)}
                  className={input} placeholder="الدرجة العلمية (مثال: بكالوريوس القانون)" />
                <input value={entry.institution} onChange={(e) => setEducationField(i, "institution", e.target.value)}
                  className={input} placeholder="الجهة (مثال: جامعة الملك سعود)" />
                <input type="number" value={entry.year ?? ""}
                  onChange={(e) => setEducationField(i, "year", e.target.value ? Number(e.target.value) : null)}
                  className={input} placeholder="السنة" />
                <button type="button" onClick={() => removeEducation(i)}
                  className={`h-full min-h-[38px] px-2.5 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-zinc-800 text-red-400 hover:bg-zinc-700" : "bg-slate-100 text-red-500 hover:bg-slate-200"}`}>
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
          {eduErr && (
            <p className="text-[11px] font-bold text-red-500 mt-1.5 flex items-start gap-1">
              <Warning size={12} weight="fill" className="flex-shrink-0 mt-0.5" /> {eduErr}
            </p>
          )}
        </div>

        <div>
          <label className={label}>المحاكم</label>
          <div className="flex flex-wrap gap-2">
            {COURTS.map((c) => (
              <button key={c.code} type="button" onClick={() => toggleCourt(c.code)} className={chip(form.courts.includes(c.code))}>
                {c.ar}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label}>اللغات</label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" onClick={() => toggleLanguage(l.code)} className={chip(form.languages.includes(l.code))}>
                {l.ar}
              </button>
            ))}
          </div>
        </div>
        </>}

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
          <button onClick={handleSave} disabled={saving || !loaded || hasClientIssue}
            title={!loaded && blocked ? BLOCKED_COPY[blocked].title : hasClientIssue ? "أصلح الأخطاء الموضّحة أعلاه أولاً" : undefined}
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
