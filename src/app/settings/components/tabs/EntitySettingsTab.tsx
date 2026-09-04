"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Buildings, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { entityProfileTableFor } from "@/lib/services/profileSettingsFields";
import { LEGAL_REP_CAPACITIES } from "@/app/register/client/components/_corporateIdentity";
import { EmptyPanel, LocalActionStatus, SectionTitle } from "./_shared";

// ── Field definitions per entity type ──────────────────────────────────
//
// Two different storage targets, per task S1:
//   • corporate  → the four REAL business_profiles columns added by
//     20260826_corporate_identity_persisted.sql (company_name_ar, cr_number,
//     legal_rep_name, legal_rep_capacity). No other field is added here —
//     that IS the whole real column set, and a fifth invented field would be
//     exactly the "placeholder-only trick" this tab is being fixed to drop.
//   • firm / micro / government / ngo → `entitySettings`
//     (<table>.metadata.settings), a generic jsonb bag any well-formed key
//     may live in. Every key below was chosen to NAME NOTHING that already
//     has a real column on that entity's table (firm_profiles.name_ar /
//     license_number / license_expiry; government_profiles.entity_name_ar;
//     ngo_profiles.org_name_ar; micro_profiles.business_name) — editing one
//     of THOSE through a jsonb key would silently diverge from the value
//     every other screen reads, which is a worse lie than the placeholder
//     inputs it replaces. So this tab does not offer an "official name" or
//     "license number" field for those four types at all; only contact/
//     registration data with no column anywhere.
interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  span?: 2;
}

const CORPORATE_FIELDS: FieldDef[] = [
  { key: "companyName", label: "اسم الشركة الرسمي", placeholder: "شركة البناء المتقدمة المحدودة" },
  { key: "crNumber", label: "رقم السجل التجاري", placeholder: "1010XXXXXX" },
  { key: "legalRepName", label: "اسم الممثل النظامي", placeholder: "عبدالعزيز محمد القرني" },
  // legalRepCapacity renders as a <select>, not this generic input list —
  // see the dedicated block in the corporate branch below.
];

const ENTITY_SETTINGS_FIELDS: Record<string, FieldDef[]> = {
  firm: [
    { key: "crNumber", label: "رقم السجل التجاري", placeholder: "4030XXXXXX" },
    { key: "vatNumber", label: "الرقم الضريبي (VAT)", placeholder: "3XXXXXXXXXXXXXXX" },
    { key: "address", label: "العنوان الرسمي", placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", span: 2 },
    { key: "city", label: "المدينة", placeholder: "الرياض" },
    { key: "phone", label: "الرقم الموحد", placeholder: "920XXXXXXX" },
    { key: "email", label: "البريد الإلكتروني الرسمي", placeholder: "info@nezamy.sa" },
    { key: "website", label: "الموقع الإلكتروني", placeholder: "https://nezamy.sa" },
    { key: "specialties", label: "التخصصات الرئيسية", placeholder: "قانون تجاري، منازعات، ملكية فكرية", span: 2 },
    { key: "description", label: "نبذة عن المكتب", placeholder: "مكتب محاماة متخصص في القضايا التجارية والملكية الفكرية", span: 2 },
  ],
  micro: [
    { key: "crNumber", label: "رقم السجل التجاري", placeholder: "4650XXXXXX" },
    { key: "address", label: "العنوان", placeholder: "حي النسيم، الرياض", span: 2 },
    { key: "phone", label: "رقم التواصل", placeholder: "05X XXX XXXX" },
    { key: "email", label: "البريد الإلكتروني", placeholder: "khaled@mybiz.sa" },
  ],
  government: [
    { key: "address", label: "العنوان الرسمي", placeholder: "حي المعذر، الرياض", span: 2 },
    { key: "phone", label: "رقم التواصل", placeholder: "1950" },
    { key: "email", label: "البريد الإلكتروني الرسمي", placeholder: "info@moj.gov.sa" },
  ],
  ngo: [
    { key: "address", label: "العنوان", placeholder: "حي الورود، الرياض", span: 2 },
    { key: "phone", label: "الرقم الموحد", placeholder: "920XXXXXXX" },
    { key: "email", label: "البريد الإلكتروني", placeholder: "info@huquq.org.sa" },
    { key: "website", label: "الموقع الإلكتروني", placeholder: "https://huquq.org.sa" },
  ],
};

// A stable (module-level, never-recreated) empty array — so `fields` below
// keeps one identity across renders even for an unmapped userType, and a
// `useEffect` depending on it never sees a "changed" reference it did not
// actually change (react-hooks/exhaustive-deps flags a fresh `?? []` here).
const EMPTY_FIELDS: FieldDef[] = [];

const ENTITY_LABEL: Record<string, string> = {
  firm: "بيانات المكتب",
  corporate: "بيانات الشركة",
  micro: "بيانات المنشأة",
  government: "بيانات الجهة",
  ngo: "بيانات الجمعية",
};

// ── The server envelope (GET/PATCH /api/v1/profile) — only what this tab reads ──
interface ProfileServerRow {
  entitySettings: Record<string, unknown> | null;
  businessProfile: Record<string, unknown> | null;
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
  const fields = isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[userType ?? ""] ?? EMPTY_FIELDS;
  const hasEntity = isCorporate || Boolean(entityProfileTableFor(userType ?? ""));

  const [values, setValues] = useState<Record<string, string>>({});
  const [legalRepCapacity, setLegalRepCapacity] = useState("");
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (isCorporate) {
          const bp = res.businessProfile ?? {};
          setValues({
            companyName: toText(bp.company_name_ar),
            crNumber: toText(bp.cr_number),
            legalRepName: toText(bp.legal_rep_name),
          });
          setLegalRepCapacity(toText(bp.legal_rep_capacity));
        } else {
          const es = res.entitySettings ?? {};
          const next: Record<string, string> = {};
          for (const f of fields) next[f.key] = toText(es[f.key]);
          setValues(next);
        }

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
  }, [loading, isLoggedIn, userType, isCorporate, hasEntity, fields]);

  const handleChange = (key: string, value: string) => {
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

    setSaving(true);
    try {
      if (isCorporate) {
        const businessProfile: Record<string, unknown> = {};
        const name = (values.companyName ?? "").trim();
        // company_name_ar is NOT NULL — omit rather than send a blank that
        // would 400, matching ProfileTab's displayName/phone omission rule.
        if (name) businessProfile.company_name_ar = name;
        const cr = (values.crNumber ?? "").trim();
        businessProfile.cr_number = cr === "" ? null : cr;
        const repName = (values.legalRepName ?? "").trim();
        businessProfile.legal_rep_name = repName === "" ? null : repName;
        businessProfile.legal_rep_capacity = legalRepCapacity === "" ? null : legalRepCapacity;

        if (Object.keys(businessProfile).length > 0) {
          await apiMutate("/api/v1/profile", "PATCH", { businessProfile });
        }
      } else {
        const entitySettings: Record<string, string | null> = {};
        for (const f of fields) {
          const trimmed = (values[f.key] ?? "").trim();
          entitySettings[f.key] = trimmed === "" ? null : trimmed;
        }
        if (Object.keys(entitySettings).length > 0) {
          await apiMutate("/api/v1/profile", "PATCH", { entitySettings });
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(arabicEntityError(err));
    } finally {
      setSaving(false);
    }
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

          {/* Fields grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fields.map((field) => (
              <div key={field.key} className={field.span === 2 ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  {field.label}
                </label>
                <input
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors"
                />
              </div>
            ))}

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
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-dark-card text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal dark:focus:border-[#C8A762] transition-colors"
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
          </div>
        </div>
      </div>

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

      {/* Save */}
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
    </div>
  );
}
