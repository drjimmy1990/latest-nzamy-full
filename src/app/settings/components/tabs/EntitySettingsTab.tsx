"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Buildings, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { entityProfileTableFor } from "@/lib/services/profileSettingsFields";
import { LEGAL_REP_CAPACITIES } from "@/app/register/client/components/_corporateIdentity";
import { EmptyPanel, LocalActionStatus, SectionTitle } from "./_shared";

import {
  entitySettingsFieldsFor,
  identityFieldsFor,
  splitEntityTabValues,
  type FieldDef,
} from "./_entitySettingsFields";
import { normalizeSaudiMobile, saudiMobileMessage } from "@/lib/services/saudiMobile";

// ── Field definitions per entity type ──────────────────────────────────
//
// Moved to ./_entitySettingsFields.ts (WP-6 B-1) so the two-arm split can be
// unit-tested without importing this React component. Read that file's header
// for which key goes to which PATCH target, and why corporate now renders
// BOTH arms instead of only the real-column one.

const ENTITY_LABEL: Record<string, string> = {
  firm: "بيانات المكتب",
  corporate: "بيانات الشركة",
  micro: "بيانات المنشأة",
  government: "بيانات الجهة",
  ngo: "بيانات الجمعية",
};

// ── The server envelope (GET/PATCH /api/v1/profile) — only what this tab reads ──
type BusinessProfileScope = "owner" | "member" | "none";

interface ProfileServerRow {
  entitySettings: Record<string, unknown> | null;
  businessProfile: Record<string, unknown> | null;
  /**
   * Corporate only (WP-6 B-3). «you may not edit this» and «nothing is saved
   * yet» used to arrive here as the same value — a null businessProfile — so
   * a member was shown four blank inputs with Save enabled over a PATCH that
   * could only ever fail. An older deploy of the route omits the key; that
   * reads as `undefined` and is treated as "owner", which is exactly the
   * behaviour this tab had before the key existed.
   */
  businessProfileScope?: BusinessProfileScope;
  // `true` when the route's entity-table sub-read failed — the request still
  // answered 200 because `profiles` itself was read fine (route.ts's GET
  // docstring). Optional so an older deploy of the route (which did not send
  // the key) reads as `undefined` → `!== true` → "did not fail".
  roleProfileReadFailed?: boolean;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/** A deliberate duplicate of ProfileTab's — see that file's copy for why. */
function arabicEntityError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] entity settings request failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : "تعذّر حفظ بيانات الكيان. تحقق من اتصالك وحاول مرة أخرى.";
}

// ── Component ─────────────────────────────────────────────────────────
export function EntitySettingsTab() {
  const { userType, loading, isLoggedIn } = useUser();
  const isCorporate = userType === "corporate";
  // BOTH arms, not either/or (WP-6 B-1). `identityFields` are the real
  // business_profiles columns (corporate only); `settingsFields` are the jsonb
  // bag every mapped entity type — corporate included since B-1 — shares.
  const identityFields = identityFieldsFor(userType ?? "");
  const settingsFields = entitySettingsFieldsFor(userType ?? "");
  const hasEntity = isCorporate || Boolean(entityProfileTableFor(userType ?? ""));

  const [values, setValues] = useState<Record<string, string>>({});
  const [legalRepCapacity, setLegalRepCapacity] = useState("");
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [scope, setScope] = useState<BusinessProfileScope>("owner");

  // The bag's `phone` key is a Saudi mobile for every entity type — the server
  // normalises it to E.164 and 400s anything else (validateEntitySettingsPatch).
  // Checking it here too is what turns that 400 into a message beside the field
  // instead of a red banner after a round trip.
  const phoneInBag = settingsFields.some((f) => f.key === "phone");
  const phoneRaw = values.phone ?? "";
  const phoneResult = normalizeSaudiMobile(phoneRaw);
  const phoneInvalid = phoneInBag && phoneRaw.trim() !== "" && !phoneResult.ok;

  // WP-6 B-2 — owner-only writes (plan §5 Q2). A member reads the company's
  // real data and is TOLD who may change it, instead of being handed an
  // editable form whose Save can only ever 403.
  const readOnly = scope === "member";
  const noBusinessRow = isCorporate && scope === "none";

  useEffect(() => {
    if (loading || !hasEntity) return;

    if (!isSupabaseMode) {
      // Demo mode: nothing persists anywhere for this tab — there is no
      // account and no server to save it to — so the form simply starts
      // blank rather than reading a browser-only store this tab never wrote.
      setValues({});
      setLegalRepCapacity("");
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
        setScope(res.businessProfileScope ?? "owner");
        const next: Record<string, string> = {};
        if (identityFields.length > 0) {
          const bp = res.businessProfile ?? {};
          next.companyName = toText(bp.company_name_ar);
          next.crNumber = toText(bp.cr_number);
          next.legalRepName = toText(bp.legal_rep_name);
          // Both columns are NOT NULL with a default, so an absent value here
          // means the row was not read — not that the company answered "no".
          next.serviceModel = toText(bp.service_model);
          next.hasLegalDept = bp.has_legal_dept === true ? "true" : "false";
          setLegalRepCapacity(toText(bp.legal_rep_capacity));
        }
        const es = res.entitySettings ?? {};
        for (const f of settingsFields) next[f.key] = toText(es[f.key]);
        setValues(next);

        // A 200 response is not proof the entity-table read behind it
        // succeeded. The route reports a failed sub-read as
        // `roleProfileReadFailed: true` on an otherwise-successful 200 (its
        // own GET docstring) — without this check that failure was
        // indistinguishable from "nothing saved yet" (both leave
        // entitySettings/businessProfile at their empty default), and Save
        // stayed fully enabled over fields that only LOOK blank.
        if (res.roleProfileReadFailed === true) {
          setLoadFailed(true);
          setError(
            "تعذّر قراءة بعض بيانات الكيان من الخادم، فبعض الحقول أدناه قد تظهر فارغة رغم أنها محفوظة فعلاً. الحفظ معطّل حتى تنجح القراءة — أعد تحميل الصفحة وحاول مرة أخرى.",
          );
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        // Same rule as ProfileTab: a failed load blocks Save so a blank form
        // can never shallow-merge over real stored data.
        setLoadFailed(true);
        setError(arabicEntityError(err));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, isLoggedIn, userType, isCorporate, hasEntity, identityFields, settingsFields]);

  const handleChange = (key: string, value: string) => {
    if (key === "phone") setPhoneTouched(true);
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (saving) return;
    setError(null);

    if (!isSupabaseMode) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    // Refused before the request, not after: a 400 on the phone would abort
    // the WHOLE patch — including the address and the CR number the user also
    // just typed — so the field is fixed first.
    if (phoneInvalid) {
      setPhoneTouched(true);
      setError(saudiMobileMessage(phoneResult));
      return;
    }

    setSaving(true);
    try {
      // ONE PATCH carrying both keys. The route validates and applies them
      // independently (its `entitySettings` and `businessProfile` arms), so a
      // company's identity columns and its contact bag are saved by the same
      // «حفظ التغييرات» rather than by two requests that can half-succeed.
      const { businessProfile, entitySettings } = splitEntityTabValues(
        userType ?? "",
        values,
        legalRepCapacity,
      );
      const body: Record<string, unknown> = {};
      if (businessProfile && Object.keys(businessProfile).length > 0) body.businessProfile = businessProfile;
      if (entitySettings && Object.keys(entitySettings).length > 0) body.entitySettings = entitySettings;
      if (Object.keys(body).length > 0) {
        await apiMutate("/api/v1/profile", "PATCH", body);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(arabicEntityError(err));
    } finally {
      setSaving(false);
    }
  };

  const controlClass =
    "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors disabled:cursor-not-allowed disabled:bg-zinc-50 dark:disabled:bg-white/[0.02] disabled:text-zinc-500";

  const renderField = (field: FieldDef) => {
    if (field.control === "select") {
      return (
        <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {field.label}
          </label>
          <select
            value={values[field.key] ?? ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            disabled={readOnly}
            className={controlClass}
          >
            <option value="">— غير محدّد —</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.control === "toggle") {
      const on = values[field.key] === "true";
      return (
        <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{field.label}</span>
            <input
              type="checkbox"
              checked={on}
              disabled={readOnly}
              onChange={(e) => handleChange(field.key, e.target.checked ? "true" : "false")}
              className="h-4 w-4 accent-royal disabled:cursor-not-allowed"
            />
          </label>
        </div>
      );
    }

    const isPhone = field.key === "phone";
    const showPhoneError = isPhone && phoneTouched && phoneInvalid;
    return (
      <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
          {field.label}
        </label>
        <input
          type={field.type ?? (isPhone ? "tel" : "text")}
          {...(isPhone ? { inputMode: "numeric" as const, dir: "ltr" as const } : {})}
          placeholder={readOnly ? "" : field.placeholder}
          value={values[field.key] ?? ""}
          onChange={(e) => handleChange(field.key, e.target.value)}
          disabled={readOnly}
          aria-invalid={showPhoneError || undefined}
          className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors disabled:cursor-not-allowed disabled:bg-zinc-50 dark:disabled:bg-white/[0.02] disabled:text-zinc-500 ${
            showPhoneError
              ? "border-rose-400 dark:border-rose-500/60"
              : "border-gray-200 dark:border-white/[0.08]"
          }`}
        />
        {showPhoneError && (
          <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{saudiMobileMessage(phoneResult)}</p>
        )}
      </div>
    );
  };

  if (!hasEntity) {
    return (
      <EmptyPanel
        icon={<Buildings size={28} />}
        title="لا توجد بيانات كيان لهذا الحساب"
        description="هذه الصفحة مخصّصة لحسابات المكاتب والشركات والمنشآت والجهات — لا تنطبق على نوع حسابك الحالي."
      />
    );
  }

  // Corporate, but the server found neither an owned company row nor an active
  // membership. A blank editable form here would invite the user to fill in a
  // company that has no row to save it to.
  if (noBusinessRow && ready && !loadFailed) {
    return (
      <EmptyPanel
        icon={<Buildings size={28} />}
        title="لا توجد شركة مرتبطة بهذا الحساب"
        description="لم نجد شركة يملكها هذا الحساب ولا عضوية نشطة في شركة. تواصل مع مالك حساب الشركة لإضافتك عضواً، أو مع فريق نظامي إن كنت المالك."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle>{ENTITY_LABEL[userType ?? ""] ?? "بيانات الكيان"}</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6">
          <div className="flex items-center gap-5 mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 flex items-center justify-center shadow-[0_8px_24px_-8px_rgba(11,61,46,0.3)]">
              <Buildings size={32} weight="fill" className="text-white" />
            </div>
            {/* No logo upload control — there is no Storage/API wiring behind
                one yet (same rule as ProfileTab's avatar). */}
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">رفع شعار الكيان غير متاح بعد</p>
          </div>

          {/* Fields grid — the real-column arm first, then the jsonb bag.
              A corporate account renders BOTH (WP-6 B-1); every other entity
              type has an empty identity arm and only renders the bag. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {identityFields.map(renderField)}

            {/* legal_rep_capacity — a CHECK-constrained column, so a free-text
                input could send a value the database would reject; the
                select can only ever offer a value the column accepts. */}
            {isCorporate && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  صفة الممثل النظامي
                </label>
                <select
                  value={legalRepCapacity}
                  onChange={(e) => setLegalRepCapacity(e.target.value)}
                  disabled={readOnly}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors disabled:cursor-not-allowed disabled:bg-zinc-50 dark:disabled:bg-white/[0.02] disabled:text-zinc-500"
                >
                  <option value="">— غير محدّد —</option>
                  {LEGAL_REP_CAPACITIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.ar}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {settingsFields.map(renderField)}
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
          <Buildings size={15} weight="fill" />
          هذه البيانات يعدّلها مالك الحساب فقط
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <WarningCircle size={15} weight="fill" />
          {error}
        </div>
      )}
      <LocalActionStatus
        show={saved && !isSupabaseMode}
        message="تم تطبيق التغييرات في هذا المتصفح فقط — لا يوجد حساب محفوظ في وضع العرض."
      />

      {/* Save — not rendered at all for a member: a disabled button would
          still read as «you could save if you tried harder», and the PATCH
          behind it answers 403 «تعديل بيانات الشركة متاح لمالك الحساب فقط». */}
      {!readOnly && (
      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        disabled={saving || !ready || loadFailed}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all duration-200 shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)] disabled:opacity-60"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : saved ? (
          <CheckCircle size={18} weight="fill" />
        ) : null}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ التغييرات"}
      </motion.button>
      )}
    </div>
  );
}
