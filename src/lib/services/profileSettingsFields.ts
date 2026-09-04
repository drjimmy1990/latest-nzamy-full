/**
 * profileSettingsFields.ts — what the settings «الملف الشخصي» tab collects,
 * per account type, and WHERE each value lives (Phase 6, items 46 · 156 · 188).
 * ─────────────────────────────────────────────────────────
 * Until 2026-09-04 the tab saved everything to localStorage. Now every field
 * has a real column or a named slot in the entity profile's metadata.settings
 * jsonb. Two fields are gone on purpose: «رقم الهوية الوطنية» (Phase 2 rule:
 * a national id is stored ONLY as a hash, and only on a client card) and
 * «تاريخ الميلاد» (nothing on the platform needs it).
 *
 * `target` tells the API route which table the value belongs to:
 *   profile        → public.profiles.<column>
 *   lawyer         → public.lawyer_profiles.<column>
 *   entitySettings → <type>_profiles.metadata.settings.<key>  (firm/business/…)
 */

export type ProfileFieldTarget = "profile" | "lawyer" | "entitySettings";

export interface ProfileFieldSpec {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "tel" | "email" | "date" | "number" | "textarea";
  span?: 1 | 2;
  target: ProfileFieldTarget;
  /** column name when it differs from `key` */
  column?: string;
  maxLength?: number;
}

/** Common to every account type — all real columns on public.profiles. */
export const COMMON_PROFILE_FIELDS: ProfileFieldSpec[] = [
  { key: "displayName", column: "display_name", label: "الاسم الكامل", placeholder: "الاسم كما يظهر على المنصّة", type: "text", target: "profile", maxLength: 120 },
  { key: "phone",       label: "رقم الجوال",       placeholder: "05xxxxxxxx",  type: "tel",   target: "profile" },
  { key: "email",       label: "البريد الإلكتروني", placeholder: "name@example.com", type: "email", target: "profile" },
  { key: "city",        label: "المدينة",           placeholder: "الرياض",     type: "text",  target: "profile", maxLength: 80 },
];

export const PROFILE_FIELDS_BY_TYPE: Record<string, ProfileFieldSpec[]> = {
  individual: [
    { key: "nationality", label: "الجنسية", placeholder: "سعودي", type: "text", target: "profile", maxLength: 60 },
  ],
  lawyer: [
    { key: "licenseNumber",   column: "license_number",    label: "رقم ترخيص المحاماة",   placeholder: "44/XXXXX", type: "text", target: "lawyer", maxLength: 40 },
    { key: "licenseIssuedOn", column: "license_issued_on", label: "تاريخ إصدار الترخيص",  placeholder: "", type: "date", target: "lawyer" },
    { key: "licenseExpiry",   column: "license_expiry",    label: "تاريخ انتهاء الترخيص", placeholder: "", type: "date", target: "lawyer" },
    { key: "specialties",     column: "specialties",       label: "التخصصات",             placeholder: "قانون تجاري، ملكية فكرية، عقود", type: "text", span: 2, target: "lawyer" },
    { key: "yearsExperience", column: "years_experience",  label: "سنوات الخبرة",         placeholder: "12", type: "number", target: "lawyer" },
    { key: "officeAddress",   column: "office_address",    label: "عنوان المكتب",         placeholder: "حي الملقا، طريق الأمير محمد بن سلمان", type: "text", span: 2, target: "lawyer", maxLength: 200 },
    { key: "bio",             column: "bio_ar",            label: "نبذة مهنية",           placeholder: "محامٍ متخصص في…", type: "textarea", span: 2, target: "lawyer", maxLength: 2000 },
  ],
  firm: [
    { key: "roleTitle",  label: "الدور في المكتب", placeholder: "شريك مدير",       type: "text", target: "entitySettings", maxLength: 80 },
    { key: "department", label: "القسم / الفرع",    placeholder: "القضايا التجارية", type: "text", target: "entitySettings", maxLength: 80 },
  ],
  corporate: [
    { key: "jobTitle",     label: "المسمّى الوظيفي", placeholder: "المستشار القانوني", type: "text", target: "entitySettings", maxLength: 80 },
    { key: "platformRole", label: "الدور على المنصّة", placeholder: "مدير الحساب",     type: "text", target: "entitySettings", maxLength: 80 },
    { key: "department",   label: "الإدارة",          placeholder: "الشؤون القانونية",  type: "text", target: "entitySettings", maxLength: 80 },
  ],
  micro: [
    { key: "businessName",  label: "اسم المنشأة",   placeholder: "مؤسسة …",     type: "text",   target: "entitySettings", maxLength: 120 },
    { key: "activityType",  label: "النشاط",         placeholder: "تجارة تجزئة",  type: "text",   target: "entitySettings", maxLength: 80 },
    { key: "employeeCount", label: "عدد الموظفين",   placeholder: "5",            type: "number", target: "entitySettings" },
  ],
  government: [
    { key: "employeeId", label: "الرقم الوظيفي", placeholder: "",          type: "text", target: "entitySettings", maxLength: 40 },
    { key: "govRole",    label: "الدور",          placeholder: "مراجع قانوني", type: "text", target: "entitySettings", maxLength: 80 },
    { key: "entityName", label: "الجهة",          placeholder: "",          type: "text", target: "entitySettings", maxLength: 120 },
    { key: "department", label: "الإدارة",        placeholder: "",          type: "text", target: "entitySettings", maxLength: 80 },
  ],
  ngo: [
    { key: "roleTitle", label: "المسمّى",     placeholder: "مدير البرامج", type: "text", target: "entitySettings", maxLength: 80 },
    { key: "ngoName",   label: "اسم الجمعية", placeholder: "",             type: "text", target: "entitySettings", maxLength: 120 },
  ],
  provider: [
    { key: "serviceType",    label: "نوع الخدمة",           placeholder: "ترجمة معتمدة", type: "text", target: "entitySettings", maxLength: 80 },
    { key: "licenseNumber",  label: "رقم الترخيص",          placeholder: "",             type: "text", target: "entitySettings", maxLength: 40 },
    { key: "licenseExpiry",  label: "تاريخ انتهاء الترخيص", placeholder: "",             type: "date", target: "entitySettings" },
    { key: "yearsExperience",label: "سنوات الخبرة",         placeholder: "",             type: "number", target: "entitySettings" },
    { key: "bio",            label: "نبذة",                 placeholder: "",             type: "textarea", span: 2, target: "entitySettings", maxLength: 2000 },
  ],
  admin: [],
};

export function profileFieldsFor(userType: string): ProfileFieldSpec[] {
  return [...COMMON_PROFILE_FIELDS, ...(PROFILE_FIELDS_BY_TYPE[userType] ?? [])];
}

/** The entity-profile table whose metadata.settings holds `entitySettings` for a role, or null. */
export function entityProfileTableFor(userType: string): string | null {
  switch (userType) {
    case "firm": return "firm_profiles";
    case "corporate": return "business_profiles";
    case "micro": return "micro_profiles";
    case "provider": return "provider_profiles";
    case "government": return "government_profiles";
    case "ngo": return "ngo_profiles";
    default: return null;
  }
}

/** Splits a flat form value map into the three write targets. */
export function splitProfileForm(userType: string, values: Record<string, unknown>): {
  profile: Record<string, unknown>;
  lawyer: Record<string, unknown>;
  entitySettings: Record<string, unknown>;
} {
  const out = { profile: {} as Record<string, unknown>, lawyer: {} as Record<string, unknown>, entitySettings: {} as Record<string, unknown> };
  for (const f of profileFieldsFor(userType)) {
    if (!(f.key in values)) continue;
    const v = values[f.key];
    if (f.target === "entitySettings") out.entitySettings[f.key] = v;
    else out[f.target][f.column ?? f.key] = v;
  }
  return out;
}
