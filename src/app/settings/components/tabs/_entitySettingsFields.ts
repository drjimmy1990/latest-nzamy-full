/**
 * _entitySettingsFields.ts — what «إعدادات الكيان» collects per account type,
 * and WHICH of the two PATCH /api/v1/profile keys each value travels under.
 * ─────────────────────────────────────────────────────────
 * Extracted out of EntitySettingsTab.tsx (WP-6 B-1) so the split itself can
 * be unit-tested: the tab is a React component `node --test` cannot import,
 * and the split — «does the company's address reach `entitySettings` or
 * `businessProfile`?» — is the part that was wrong.
 *
 * Two storage targets, unchanged from task S1 except that corporate now uses
 * BOTH instead of only the first:
 *   • identity  → the REAL business_profiles columns
 *     (20260603_phase1_002_entities.sql + 20260826_corporate_identity_
 *     persisted.sql): company_name_ar, cr_number, legal_rep_name,
 *     legal_rep_capacity, service_model, has_legal_dept. Sent under the
 *     `businessProfile` PATCH key. Corporate only — no other entity type has
 *     this table.
 *   • settings  → `<entityProfileTableFor(type)>.metadata.settings`, a
 *     generic jsonb bag. Sent under the `entitySettings` PATCH key.
 *
 * WHY corporate now reaches the bag (owner step ك‏٢). The tab used to read
 * `isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[type]` — an
 * either/or — so a company had no «العنوان» and no «رقم التواصل» anywhere on
 * the platform while firm/micro/government/ngo had both. The old header here
 * argued a fifth corporate field would be an invented placeholder; that was
 * true only while the value had nowhere real to go. `business_profiles.metadata`
 * is a real jsonb column with a real merge path (route.ts's entitySettings
 * arm), so these keys persist exactly as the firm's do — and `address`/`city`/
 * `phone`/`email`/`website` reuse the FIRM's key names on purpose, so the bag
 * stays one shape across every entity type.
 *
 * The rule the old header states still holds and is still why there is no
 * «اسم الشركة» in the settings list: a jsonb key must never shadow a real
 * column. companyName / crNumber / legalRepName live in `identity` for that
 * reason.
 *
 * ── `phone` IS A SAUDI MOBILE, FOR EVERY ENTITY TYPE ────────────────────────
 * PATCH /api/v1/profile now normalises the bag's `phone` key through
 * `normalizeSaudiMobile` and stores E.164 (`+9665XXXXXXXX`) — see
 * validateEntitySettingsPatch in src/lib/services/profileEntityFields.ts.
 * The firm and ngo entries used to label this key «الرقم الموحد» with a
 * `920XXXXXXX` placeholder and government used the `1950` short code; none of
 * those is a mobile, so the form would have been asking for a value the server
 * now refuses. They are aligned to «رقم التواصل» / `05XXXXXXXX` rather than
 * left contradicting the validator. A unified 920 number has no field and no
 * column anywhere on the platform — recording one needs its own key and an
 * owner decision, not a silently-rejected input.
 */

export interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  span?: 2;
  /** Defaults to a plain <input>. */
  control?: "text" | "select" | "toggle";
  /** `control: "select"` only. */
  options?: readonly { value: string; label: string }[];
  /** Rendered under the control — states a fact about the field, never a promise. */
  hint?: string;
}

/**
 * `business_profiles.service_model` is CHECK-constrained to exactly these
 * three (20260603_phase1_002_entities.sql:231-232), so the control is a
 * <select> and never free text — the same reasoning the tab already applies
 * to `legal_rep_capacity`.
 */
export const SERVICE_MODEL_OPTIONS = [
  { value: "internal", label: "إدارة قانونية داخلية" },
  { value: "external", label: "تفويض خارجي" },
  { value: "hybrid", label: "مختلط" },
] as const;

export const SERVICE_MODEL_VALUES: readonly string[] = SERVICE_MODEL_OPTIONS.map((o) => o.value);

/** The real `business_profiles` columns, written through the `businessProfile` PATCH key. */
export const CORPORATE_FIELDS: FieldDef[] = [
  { key: "companyName", label: "اسم الشركة الرسمي", placeholder: "شركة البناء المتقدمة المحدودة" },
  { key: "crNumber", label: "رقم السجل التجاري", placeholder: "1010XXXXXX" },
  { key: "legalRepName", label: "اسم الممثل النظامي", placeholder: "عبدالعزيز محمد القرني" },
  // legalRepCapacity renders as a <select> from LEGAL_REP_CAPACITIES — see the
  // dedicated block in the tab's corporate branch.
  //
  // WP-6 B-4 / UAT closing-map item 4 («الشركة بلا/بإدارة قانونية»).
  // `service_model` and `has_legal_dept` are REAL columns that existed since
  // 20260603 and were never read or written by anything: `grep has_legal_dept
  // src` returned one hit, a type declaration. What decided the
  // with/without-legal-department distinction in production was the
  // SUBSCRIPTION TIER (resolveFeatureAccess("team-legal-department")), and in
  // demo mode a localStorage flag — never the company's own row. These two
  // controls are the first place a company states it about itself.
  {
    key: "serviceModel",
    label: "نموذج العمل القانوني",
    placeholder: "",
    control: "select",
    options: SERVICE_MODEL_OPTIONS,
  },
  {
    key: "hasLegalDept",
    label: "لدى الشركة إدارة قانونية داخلية",
    placeholder: "",
    control: "toggle",
  },
];

/** The jsonb bag, written through the `entitySettings` PATCH key. */
export const ENTITY_SETTINGS_FIELDS: Record<string, FieldDef[]> = {
  firm: [
    { key: "crNumber", label: "رقم السجل التجاري", placeholder: "4030XXXXXX" },
    { key: "vatNumber", label: "الرقم الضريبي (VAT)", placeholder: "3XXXXXXXXXXXXXXX" },
    { key: "address", label: "العنوان الرسمي", placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", span: 2 },
    { key: "city", label: "المدينة", placeholder: "الرياض" },
    { key: "phone", label: "رقم التواصل", placeholder: "05XXXXXXXX" },
    { key: "email", label: "البريد الإلكتروني الرسمي", placeholder: "info@nezamy.sa" },
    { key: "website", label: "الموقع الإلكتروني", placeholder: "https://nezamy.sa" },
    { key: "specialties", label: "التخصصات الرئيسية", placeholder: "قانون تجاري، منازعات، ملكية فكرية", span: 2 },
    { key: "description", label: "نبذة عن المكتب", placeholder: "مكتب محاماة متخصص في القضايا التجارية والملكية الفكرية", span: 2 },
  ],
  corporate: [
    { key: "address", label: "العنوان الرسمي", placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", span: 2 },
    { key: "city", label: "المدينة", placeholder: "الرياض" },
    { key: "phone", label: "رقم التواصل", placeholder: "05XXXXXXXX" },
    { key: "email", label: "البريد الإلكتروني الرسمي", placeholder: "info@nezamy.sa" },
    { key: "website", label: "الموقع الإلكتروني", placeholder: "https://nezamy.sa" },
  ],
  micro: [
    { key: "crNumber", label: "رقم السجل التجاري", placeholder: "4650XXXXXX" },
    { key: "address", label: "العنوان", placeholder: "حي النسيم، الرياض", span: 2 },
    { key: "phone", label: "رقم التواصل", placeholder: "05XXXXXXXX" },
    { key: "email", label: "البريد الإلكتروني", placeholder: "khaled@mybiz.sa" },
  ],
  government: [
    { key: "address", label: "العنوان الرسمي", placeholder: "حي المعذر، الرياض", span: 2 },
    { key: "phone", label: "رقم التواصل", placeholder: "05XXXXXXXX" },
    { key: "email", label: "البريد الإلكتروني الرسمي", placeholder: "info@moj.gov.sa" },
  ],
  ngo: [
    { key: "address", label: "العنوان", placeholder: "حي الورود، الرياض", span: 2 },
    { key: "phone", label: "رقم التواصل", placeholder: "05XXXXXXXX" },
    { key: "email", label: "البريد الإلكتروني", placeholder: "info@huquq.org.sa" },
    { key: "website", label: "الموقع الإلكتروني", placeholder: "https://huquq.org.sa" },
  ],
};

/**
 * A stable (module-level, never-recreated) empty array — so `fields` in the
 * tab keeps one identity across renders even for an unmapped userType, and a
 * `useEffect` depending on it never sees a "changed" reference it did not
 * actually change (react-hooks/exhaustive-deps flags a fresh `?? []`).
 */
export const EMPTY_FIELDS: FieldDef[] = [];

/** The real-column arm — corporate only; every other type has none. */
export function identityFieldsFor(userType: string): FieldDef[] {
  return userType === "corporate" ? CORPORATE_FIELDS : EMPTY_FIELDS;
}

/** The jsonb-bag arm. Corporate has one too since WP-6 B-1. */
export function entitySettingsFieldsFor(userType: string): FieldDef[] {
  return ENTITY_SETTINGS_FIELDS[userType] ?? EMPTY_FIELDS;
}

export interface EntityTabPatch {
  /** The `businessProfile` PATCH key, or null when this type writes no columns. */
  businessProfile: Record<string, unknown> | null;
  /** The `entitySettings` PATCH key, or null when this type has no bag fields. */
  entitySettings: Record<string, string | null> | null;
}

/**
 * Splits the tab's flat form state into the two PATCH keys.
 *
 * `company_name_ar` is NOT NULL with no default once the row exists, so a
 * blank one is OMITTED rather than sent — the server would 400 it and the
 * caller loses the rest of the save with it. The other columns send `null`
 * to clear, which is what the nullable columns accept.
 *
 * `service_model` and `has_legal_dept` are both NOT NULL with defaults
 * ('internal' / false), so neither is ever sent as null: an unrecognised
 * service model is omitted (the form can only produce the three CHECK values;
 * anything else means the state was never loaded) and the toggle is always a
 * real boolean.
 */
export function splitEntityTabValues(
  userType: string,
  values: Record<string, string>,
  legalRepCapacity: string,
): EntityTabPatch {
  const identity = identityFieldsFor(userType);
  const settings = entitySettingsFieldsFor(userType);

  let businessProfile: Record<string, unknown> | null = null;
  if (identity.length > 0) {
    const patch: Record<string, unknown> = {};
    const name = (values.companyName ?? "").trim();
    if (name) patch.company_name_ar = name;
    const cr = (values.crNumber ?? "").trim();
    patch.cr_number = cr === "" ? null : cr;
    const repName = (values.legalRepName ?? "").trim();
    patch.legal_rep_name = repName === "" ? null : repName;
    patch.legal_rep_capacity = legalRepCapacity === "" ? null : legalRepCapacity;
    const model = (values.serviceModel ?? "").trim();
    if (SERVICE_MODEL_VALUES.includes(model)) patch.service_model = model;
    patch.has_legal_dept = values.hasLegalDept === "true";
    businessProfile = patch;
  }

  let entitySettings: Record<string, string | null> | null = null;
  if (settings.length > 0) {
    const patch: Record<string, string | null> = {};
    for (const f of settings) {
      const trimmed = (values[f.key] ?? "").trim();
      patch[f.key] = trimmed === "" ? null : trimmed;
    }
    entitySettings = patch;
  }

  return { businessProfile, entitySettings };
}
