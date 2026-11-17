/**
 * aiInstructions.ts — «التعليمات الشخصية» of /ai/settings (N06-24): the
 * user's writing style, legal specialisation, free instructions and favourite
 * templates. Stored server-side in user_settings.preferences.aiInstructions
 * (PATCH /api/v1/settings/preferences); the browser keeps only a cache.
 *
 * Shared by the page (the choices it offers) and by the route's validator
 * (src/lib/services/preferencesMerge.ts), so the two cannot drift. No imports:
 * `node --test` and the client bundle both load it as-is.
 */

export const AI_STYLES = ["رسمي جداً", "رسمي", "احترافي واضح", "مبسّط"] as const;
export const AI_SPECIALIZATIONS = [
  "قانون العمل",
  "قانون الأحوال الشخصية",
  "قانون تجاري",
  "قانون عقاري",
  "قانون إداري",
  "تحكيم",
  "عام",
] as const;

export type AiStyle = (typeof AI_STYLES)[number];
export type AiSpecialization = (typeof AI_SPECIALIZATIONS)[number];

export const AI_INSTRUCTIONS_MAX = 500;
export const AI_TEMPLATES_MAX = 20;
export const AI_TEMPLATE_MAX = 80;

export interface AiInstructions {
  style: AiStyle;
  specialization: AiSpecialization;
  /** free text, ≤ AI_INSTRUCTIONS_MAX characters; may be empty */
  instructions: string;
  /** unique names, each 1..AI_TEMPLATE_MAX characters, at most AI_TEMPLATES_MAX */
  templates: string[];
}

/** What a user who never saved sees: neutral choices, nothing written for him. */
export const AI_INSTRUCTIONS_DEFAULT: AiInstructions = {
  style: "رسمي",
  specialization: "عام",
  instructions: "",
  templates: [],
};

const KEYS = ["style", "specialization", "instructions", "templates"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const chars = (s: string) => [...s].length;

/** The validated (trimmed) settings, or an Arabic error message. */
export function validateAiInstructions(value: unknown): AiInstructions | string {
  if (!isPlainObject(value)) return "التعليمات الشخصية يجب أن تكون كائناً صالحاً.";
  for (const key of Object.keys(value)) {
    if (!(KEYS as readonly string[]).includes(key)) return `حقل غير معروف في التعليمات الشخصية: ${key}`;
  }
  const { style, specialization, instructions, templates } = value;
  if (!(AI_STYLES as readonly unknown[]).includes(style)) return "أسلوب الكتابة غير صالح.";
  if (!(AI_SPECIALIZATIONS as readonly unknown[]).includes(specialization)) return "التخصص القانوني غير صالح.";
  if (typeof instructions !== "string") return "التعليمات الخاصة يجب أن تكون نصاً.";
  const text = instructions.trim();
  if (chars(text) > AI_INSTRUCTIONS_MAX) return `التعليمات الخاصة أطول من ${AI_INSTRUCTIONS_MAX} حرف.`;
  if (!Array.isArray(templates)) return "القوالب المفضلة يجب أن تكون قائمة.";
  if (templates.length > AI_TEMPLATES_MAX) return `لا تتسع القوالب المفضلة لأكثر من ${AI_TEMPLATES_MAX} قالباً.`;
  const out: string[] = [];
  for (const t of templates) {
    if (typeof t !== "string") return "اسم القالب يجب أن يكون نصاً.";
    const name = t.trim();
    if (!name) return "اسم القالب فارغ.";
    if (chars(name) > AI_TEMPLATE_MAX) return `اسم القالب أطول من ${AI_TEMPLATE_MAX} حرف.`;
    if (out.includes(name)) return "القالب مكرر في المفضلة.";
    out.push(name);
  }
  return {
    style: style as AiStyle,
    specialization: specialization as AiSpecialization,
    instructions: text,
    templates: out,
  };
}

/** A stored or cached value as settings, or null when it is not a valid one. */
export function readAiInstructions(value: unknown): AiInstructions | null {
  const v = validateAiInstructions(value);
  return typeof v === "string" ? null : v;
}
