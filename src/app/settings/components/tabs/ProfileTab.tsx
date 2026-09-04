"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Sun,
  Moon,
  Calendar as CalendarIcon,
  UserSwitch,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, setDemoSession } from "@/hooks/useUser";
import { DEMO_ACCOUNTS } from "@/constants/demoAccountsData";
import { isDemoUiEnabled } from "@/lib/runtimeMode";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { profileFieldsFor, splitProfileForm, type ProfileFieldSpec } from "@/lib/services/profileSettingsFields";
import {
  buildProfileSubmitValues,
  readProfileFieldValue,
  isReadOnlyProfileField,
} from "@/lib/services/profileFormTransform";
import { LocalActionStatus, SectionTitle } from "./_shared";

// ── The server envelope (GET/PATCH /api/v1/profile) — only the fields this tab reads ──
interface ProfileServerRow {
  profile: Record<string, unknown> | null;
  roleProfile: Record<string, unknown> | null;
  entitySettings: Record<string, unknown> | null;
  // `true` when the route's `lawyer_profiles`/entity-table sub-read failed —
  // the request still answered 200 because `profiles` itself was read fine
  // (route.ts's GET docstring). Optional so an older deploy of the route
  // (which did not send the key) reads as `undefined` → `!== true` → "did not
  // fail", the same conclusion this tab drew before the marker existed.
  roleProfileReadFailed?: boolean;
}

/**
 * Which of `profile` / `roleProfile` / `entitySettings` a field's raw value
 * comes from, matching `splitProfileForm`'s own routing
 * (profileSettingsFields.ts) one-to-one.
 */
function sourceFor(field: ProfileFieldSpec, row: ProfileServerRow): Record<string, unknown> | null {
  if (field.target === "profile") return row.profile;
  if (field.target === "lawyer") return row.roleProfile;
  return row.entitySettings;
}

/**
 * The Arabic message for a failed request, or a generic fallback.
 *
 * A deliberate duplicate of `arabicSettingsError` in NotificationsTab.tsx —
 * same reason that one duplicates onboarding/page.tsx's version: `apiMutate`
 * falls back to `API error: 500` when a response carries no JSON `error`,
 * and that string must never reach an Arabic screen.
 */
function arabicProfileError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] profile request failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : "تعذّر حفظ التعديلات. تحقق من اتصالك وحاول مرة أخرى.";
}

// ── Component ─────────────────────────────────────────────────────────
export function ProfileTab() {
  const { lang, theme, calendarType, setTheme, setLang, setCalendarType } = useTheme();
  const user = useUser();
  const { userType, loading, isLoggedIn } = user;

  const fields = profileFieldsFor(userType ?? "individual");

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  // The exact values as last loaded from (or saved to) the server — the
  // baseline `buildProfileSubmitValues` diffs `formValues` against so an
  // untouched field, blank-on-failed-load or not, is never resubmitted. See
  // that function's own docstring (profileFormTransform.ts) for why this
  // matters beyond a nice-to-have.
  const [loadedValues, setLoadedValues] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  // Developer switcher state — demo mode only; its JSX below is gated by
  // isDemoUiEnabled (a build-time constant, dead-code-eliminated from a
  // supabase build), and every localStorage touch it makes is INSIDE that
  // same guard so none of it executes in production either.
  const [activeDemoKey, setActiveDemoKey] = useState("");

  // ── Load ────────────────────────────────────────────────────────────
  //
  // Gated on `!loading` (userType is only meaningful once useUser has
  // resolved) and, in supabase mode, on `isLoggedIn` — Settings is a
  // signed-in-only surface, but a stale session must not throw here.
  useEffect(() => {
    if (loading) return;
    const currentFields = profileFieldsFor(userType ?? "individual");

    if (!isSupabaseMode) {
      // Demo mode: seed from localStorage exactly as before — but ONLY
      // here, never when isSupabaseMode is true (task S1's own rule).
      const seeded: Record<string, string> = {};
      for (const f of currentFields) seeded[f.key] = "";
      seeded.displayName = user.name ?? "";
      if (isDemoUiEnabled && typeof window !== "undefined") {
        setActiveDemoKey(localStorage.getItem("nzamy_demo_key") || "lawyer");
        const stored = localStorage.getItem(`nzamy_profile_fields_${user.userType}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as {
              phone?: string;
              email?: string;
              city?: string;
              additional?: Record<string, string>;
            };
            if (typeof parsed.phone === "string") seeded.phone = parsed.phone;
            if (typeof parsed.email === "string") seeded.email = parsed.email;
            if (typeof parsed.city === "string") seeded.city = parsed.city;
            if (parsed.additional && typeof parsed.additional === "object") {
              for (const [k, v] of Object.entries(parsed.additional)) {
                if (typeof v === "string" && k in seeded) seeded[k] = v;
              }
            }
          } catch {
            // Malformed local data — keep the blank seed above.
          }
        } else {
          seeded.email = user.userType === "admin" ? "admin@nezamy.sa" : `${user.userType || "user"}@nezamy.sa`;
        }
      }
      setFormValues(seeded);
      setReady(true);
      return;
    }

    if (!isLoggedIn) {
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<ProfileServerRow>("/api/v1/profile");
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const f of currentFields) next[f.key] = readProfileFieldValue(f, sourceFor(f, res));
        setFormValues(next);
        setLoadedValues(next);

        // A 200 response is not proof every table behind it was read. The
        // route reports a failed lawyer_profiles/entity-table sub-read as
        // `roleProfileReadFailed: true` on an otherwise-successful 200 (its
        // own GET docstring explains why: `profiles` itself was fine, so a
        // 500 would be wrong) — without this check that failure was
        // indistinguishable from "nothing saved yet", and every field sourced
        // from that table rendered blank with Save left fully enabled.
        if (res.roleProfileReadFailed === true) {
          setLoadFailed(true);
          setError(
            "تعذّر قراءة بعض بياناتك من الخادم، فبعض الحقول أدناه قد تظهر فارغة رغم أنها محفوظة فعلاً. الحفظ معطّل حتى تنجح القراءة — أعد تحميل الصفحة وحاول مرة أخرى.",
          );
        } else if (userType === "lawyer" && res.roleProfile === null) {
          // The read succeeded and there is genuinely no lawyer_profiles row
          // — a different fact than a failed read, but equally unsafe to
          // save through: the same precedent LawyerProfileEditPage sets for
          // ANY null roleProfile, not only a marked failure.
          setLoadFailed(true);
          setError(
            "لم نجد سجلك المهني، فحقول الترخيص والتخصصات والمكتب والنبذة فارغة لهذا السبب لا لتعذّر القراءة. الحفظ معطّل حتى يتوفر هذا السجل.",
          );
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        // A failed load leaves the form blank (never a fabricated value) and
        // blocks Save below — the same precedent LawyerProfileEditPage sets
        // for a null roleProfile: a blank form must never be allowed to
        // overwrite real stored data.
        setLoadFailed(true);
        setError(arabicProfileError(err));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userType, isLoggedIn, user.name, user.userType]);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (saving) return;
    setError(null);

    if (!isSupabaseMode) {
      // Demo mode: local-only, exactly as before — confined here so it can
      // never run when isSupabaseMode is true.
      setSaving(true);
      setTimeout(() => {
        const updatedSession = { ...user, name: formValues.displayName || user.name };
        delete (updatedSession as { isDemoBypass?: boolean }).isDemoBypass;
        if (isDemoUiEnabled && typeof window !== "undefined") {
          const currentDemoKey = localStorage.getItem("nzamy_demo_key") || "lawyer";
          setDemoSession(updatedSession, currentDemoKey);
          const { phone, email, city, ...rest } = formValues;
          const additional = { ...rest };
          delete additional.displayName;
          localStorage.setItem(
            `nzamy_profile_fields_${user.userType}`,
            JSON.stringify({ phone: phone ?? "", email: email ?? "", city: city ?? "", additional }),
          );
        }
        setSaving(false);
        setSaved(true);
        setLocalMessage("تم حفظ التغييرات وتحديث الحساب المفعّل في المتصفح بنجاح!");
        setTimeout(() => {
          setSaved(false);
          setLocalMessage(null);
        }, 2500);
      }, 850);
      return;
    }

    setSaving(true);
    (async () => {
      try {
        // Captured once, before the `await` — so an edit the user makes
        // WHILE this save is in flight can never be misattributed as part of
        // what this save actually sent.
        const sentValues = formValues;

        // Diffed against `loadedValues`: a field the caller never touched —
        // including one whose column doesn't exist on the current schema
        // yet, or one that rendered blank only because its load failed — is
        // never sent, so it can never 400 the whole PATCH or shallow-merge a
        // blank over a real stored value (profileFormTransform.ts).
        const submitValues = buildProfileSubmitValues(fields, sentValues, loadedValues);
        const { profile, lawyer, entitySettings } = splitProfileForm(userType ?? "individual", submitValues);
        const body: Record<string, unknown> = { ...profile, ...lawyer };
        if (Object.keys(entitySettings).length > 0) body.entitySettings = entitySettings;

        if (Object.keys(body).length > 0) {
          await apiMutate("/api/v1/profile", "PATCH", body);
          // The new baseline for the NEXT diff — but ONLY for the fields
          // actually part of THIS submit, not every current field. A field
          // that changed but shaped to "omit" (e.g. displayName cleared to
          // blank — OMIT_WHEN_EMPTY_KEYS) was never written, so it must not
          // be silently adopted as the new truth; it stays "changed" against
          // its real last-saved value until it either reverts or ships.
          setLoadedValues((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(submitValues)) {
              if (key in sentValues) next[key] = sentValues[key];
            }
            return next;
          });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError(arabicProfileError(err));
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleSwitchAccount = (key: string) => {
    if (!isDemoUiEnabled) return;
    const acc = DEMO_ACCOUNTS.find((a) => a.key === key);
    if (acc) {
      setDemoSession(acc.session, key);
      setActiveDemoKey(key);
      setLocalMessage(`جاري التحويل وتفعيل حساب: ${acc.label}...`);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  // Extract first letter for avatar
  const avatarLetter = formValues.displayName?.charAt(0) || "م";

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 flex items-center justify-center text-white text-3xl font-bold shadow-[0_8px_24px_-8px_rgba(11,61,46,0.4)]">
          {avatarLetter}
        </div>
        {/* No upload control — there is no Storage/API wiring behind one yet.
            A button whose only effect is admitting it isn't wired is worse
            than no button. */}
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">تغيير الصورة غير متاح بعد</p>
      </div>

      {/* Dynamic form fields */}
      <div>
        <SectionTitle>البيانات الشخصية</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-7 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fields.map((field) => {
              const val = formValues[field.key] ?? "";
              const readOnly = isReadOnlyProfileField(field);

              return (
                <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
                  <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      rows={3}
                      placeholder={field.placeholder}
                      value={val}
                      maxLength={field.maxLength}
                      disabled={readOnly}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all resize-none shadow-inner disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      value={val}
                      maxLength={field.maxLength}
                      disabled={readOnly}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-full px-5 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02] text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all shadow-inner disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  )}
                  {readOnly && (
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                      {field.key === "email" ? "البريد الإلكتروني مرتبط بحساب الدخول ولا يُعدَّل من هنا." : "يُعرض للاطلاع فقط ولا يُعدَّل من هذه الصفحة حالياً."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* How identity is actually verified on this platform.
              2026-09-02 — this replaces the «نفاذ / الهوية» settings tab,
              which simulated the whole integration: it accepted any national
              ID, showed a hard-coded «74» as the Nafath challenge code, and
              four seconds later declared «نفاذ مربوط بنجاح» over four invented
              rows (a name, a link date, a certificate expiry). None of it
              existed. There is no Nafath/SSO integration, no certificate, and
              nothing on this page is checked against a government register.
              What is true is stated instead: a human on the نظامي team reads
              the documents and marks the account verified — the same
              «بانتظار التحقق» → «نشط» step the admin console runs. It is
              deliberately worded as a description of a manual process and NOT
              as a feature to come; it makes no promise about timing and offers
              no button, because no upload flow has been built. */}
          <p className="mt-6 border-t border-slate-200/60 pt-5 text-xs leading-6 text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400">
            التحقق من الهوية في نظامي يتم يدوياً: يراجع فريق المنصة رقم الهوية
            والوثائق الرسمية التي ترسلها، ثم يعتمد الحساب. لا يوجد ربط آلي مع
            نفاذ أو أي جهة تحقق خارجية، وما تكتبه هنا لا يُطابَق مع أي سجل رسمي.
          </p>
        </div>
      </div>

      {/* Preferences — device-local by design (task S1's own rule): the
          theme, language and calendar type are NOT server fields; they live
          in ThemeProvider's own storage, same as the sidebar state. */}
      <div>
        <SectionTitle>التفضيلات</SectionTitle>
        <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/50 dark:border-white/[0.06] p-7 shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {/* Language */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                اللغة المفضلة
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {[
                  { l: "ar" as const, label: "العربية" },
                  { l: "en" as const, label: "English" },
                ].map((item) => (
                  <button
                    key={item.l}
                    onClick={() => setLang(item.l)}
                    className={`flex-1 py-3 text-[13.5px] font-semibold transition-colors ${
                      lang === item.l
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                المظهر
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13.5px] font-semibold transition-colors ${
                      theme === t
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {t === "light" ? <Sun size={16} /> : <Moon size={16} />}
                    {t === "light" ? "فاتح" : "داكن"}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar Type */}
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CalendarIcon size={16} />
                  نظام التاريخ
                </span>
              </label>
              <div className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]">
                {(["hijri", "miladi", "both"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCalendarType(c)}
                    className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                      calendarType === c
                        ? "bg-[#0B3D2E] text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {c === "hijri" ? "هجري" : c === "miladi" ? "ميلادي" : "مزدوج"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Demo Console — DEMO MODE ONLY. Dead-code-eliminated from a
          supabase (production) build so it never ships to real users. */}
      {isDemoUiEnabled && (
      <div className="bg-amber-500/[0.03] dark:bg-amber-500/[0.02] rounded-[2rem] border border-amber-500/20 p-7 shadow-[0_20px_40px_-15px_rgba(245,158,11,0.02)] space-y-5">
        <div className="flex items-center gap-3 border-b border-amber-500/10 pb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400">
            <UserSwitch size={20} weight="fill" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">منطقة ديمو التطوير — مخصص للاختبار</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">تبديل فوري بين كافة مستخدمي ومستويات المنصة لمعاينة الإعدادات والواجهات</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          <div>
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2">
              اختر الحساب والفرع المراد تفعيله
            </label>
            <select
              value={activeDemoKey}
              onChange={(e) => handleSwitchAccount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200/60 dark:border-white/[0.08] bg-white dark:bg-[#161b22] text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 transition-all shadow-sm"
            >
              {DEMO_ACCOUNTS.map((acc) => (
                <option key={acc.key} value={acc.key}>
                  {acc.label} ({acc.labelEn}) {acc.badge ? `[${acc.badge}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Active account info card */}
          {(() => {
            const activeAcc = DEMO_ACCOUNTS.find(a => a.key === activeDemoKey) || DEMO_ACCOUNTS[0];
            return (
              <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/[0.01] p-4 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${activeAcc?.color || "from-[#0B3D2E] to-emerald-700"} flex items-center justify-center text-white text-xs font-bold shadow-sm`}>
                    {activeAcc?.session?.name?.charAt(0) ?? "ن"}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{activeAcc?.session?.name}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">الدور: {activeAcc?.label} | الباقة: {activeAcc?.session?.tier.toUpperCase()}</p>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-amber-500/5 mt-3 pt-3 flex items-center justify-between">
                  <span>البلد: {activeAcc?.session?.country || "SA"}</span>
                  <span>الرصيد: {activeAcc?.session?.credits} / {activeAcc?.session?.creditsMax}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* Server errors, action alerts and the Save button */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <WarningCircle size={15} weight="fill" />
          {error}
        </div>
      )}
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        // `isSupabaseMode && !isLoggedIn`: a stale session on this
        // signed-in-only surface leaves `formValues`/`loadedValues` both
        // `{}` — every field diffs as "unchanged" against itself, so an
        // enabled Save would build an empty body, skip the PATCH entirely,
        // and still show «تم الحفظ», a fake success. Scoped to supabase mode
        // only — demo mode's own `isLoggedIn` has no bearing on its
        // local-only save path.
        disabled={saving || !ready || loadFailed || (isSupabaseMode && !isLoggedIn)}
        className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] hover:bg-[#0a3328] text-white rounded-2xl font-bold text-[13.5px] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98] disabled:opacity-70"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ التغييرات"}
      </motion.button>
    </div>
  );
}
