/**
 * gatewayDiagnostic.ts — what the admin settings page shows under «بوابة الدفع»:
 * the saved setting, whether Moyasar is really on (resolveMoyasarConfig), and
 * why not, in Arabic.
 *
 * The result carries derived labels only. A key is reduced to its mode
 * ('test' | 'live' | 'missing' | 'other'); no key material ever leaves here.
 *
 * NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY is inlined at build time, so the
 * publishable key judged here is the build's — the one the checkout embeds.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

import { keyShapeIssue, resolveMoyasarConfig, type MoyasarEnv, type MoyasarMode } from "./moyasarConfig.ts";

export type KeyMode = "test" | "live" | "missing" | "other";

/**
 * The mode a key belongs to, judged by its own prefix: sk_ for the secret
 * key, pk_ for the publishable one. A publishable key pasted into the secret
 * slot is 'other', not 'test' — the same verdict resolveMoyasarConfig reaches.
 * So is a key whose shape is wrong (masked with *, a space inside, a truncated
 * body — N1.1): it is not a usable test or live key, and the effective reason
 * names the problem.
 */
export function keyMode(value: unknown, kind: "sk" | "pk"): KeyMode {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return "missing";
  if (keyShapeIssue(v)) return "other";
  if (v.startsWith(`${kind}_test_`)) return "test";
  if (v.startsWith(`${kind}_live_`)) return "live";
  return "other";
}

/** Shown when a reason has no Arabic yet — never the raw English reason. */
export const GATEWAY_REASON_FALLBACK_AR = "تعذّر تفعيل الدفع لسبب غير معروف — راجع سجلات الخادم";

const MODE_AR: Record<MoyasarMode, string> = { test: "تجريبي", live: "مباشر" };

const FIXED_REASONS_AR: Record<string, string> = {
  "payments_gateway setting is missing or malformed": "إعداد بوابة الدفع غير محفوظ أو تالف",
  "payments_gateway provider is not moyasar": "مزوّد الدفع ليس ميسّر",
  "payments_gateway status is not test or live": "حالة البوابة معطّلة",
  "secret key is not set": "المفتاح السري غير مضبوط في الخادم",
  "publishable key is not set": "المفتاح العام غير مضبوط في الخادم",
  "webhook secret is not set": "سر Webhook غير مضبوط في الخادم",
  "live mode needs a complete billing_company setting": "الوضع المباشر يحتاج بيانات المنشأة كاملة",
  // N1.1 — the key's shape. Never the value, only what is wrong with it.
  "secret key is masked (contains *)":
    "المفتاح السري منسوخ من الشاشة المقنّعة (فيه نجوم *) — انسخه كاملاً بزر النسخ في لوحة ميسّر أو ولّد مفتاحاً جديداً",
  "secret key contains whitespace": "المفتاح السري فيه مسافة أو سطر جديد — أعد لصقه في الخادم دون فراغات",
  "secret key has an invalid length or characters":
    "طول المفتاح السري أو رموزه غير صحيحة (منسوخ ناقصاً على الأرجح) — انسخه كاملاً من لوحة ميسّر",
  "publishable key is masked (contains *)":
    "المفتاح العام منسوخ من الشاشة المقنّعة (فيه نجوم *) — انسخه كاملاً من لوحة ميسّر، ثم أعد النشر لأنه يُضمَّن عند البناء",
  "publishable key contains whitespace":
    "المفتاح العام فيه مسافة أو سطر جديد — أعد لصقه دون فراغات، ثم أعد النشر لأنه يُضمَّن عند البناء",
  "publishable key has an invalid length or characters":
    "طول المفتاح العام أو رموزه غير صحيحة (منسوخ ناقصاً على الأرجح) — انسخه كاملاً، ثم أعد النشر لأنه يُضمَّن عند البناء",
  "webhook secret is masked (contains *)":
    "سر Webhook منسوخ من الشاشة المقنّعة (فيه نجوم *) — انسخه كاملاً من إعدادات Webhook في لوحة ميسّر",
  "webhook secret contains whitespace": "سر Webhook فيه مسافة أو سطر جديد — أعد لصقه في الخادم دون فراغات",
};

const MODE_MISMATCH = /^(secret|publishable) key does not belong to (test|live) mode$/;

/** Arabic for a resolveMoyasarConfig disabled reason; null for no reason. */
export function gatewayReasonAr(reason: string | null | undefined): string | null {
  if (reason == null || reason === "") return null;
  const fixed = FIXED_REASONS_AR[reason];
  if (fixed) return fixed;
  const m = MODE_MISMATCH.exec(reason);
  if (m) {
    const mode = MODE_AR[m[2] as MoyasarMode];
    return m[1] === "secret"
      ? `المفتاح السري لا يطابق الوضع المختار (${mode})`
      : `المفتاح العام لا يطابق الوضع المختار (${mode}) — المفتاح العام يُضمَّن عند البناء، فأعد النشر بعد تعديله`;
  }
  return GATEWAY_REASON_FALLBACK_AR;
}

export interface GatewayDiagnostic {
  saved: { status: string | null; provider: string | null };
  effective: { enabled: boolean; mode: MoyasarMode | null; reasonAr: string | null };
  keys: { secretKeyMode: KeyMode; publishableKeyMode: KeyMode; webhookSecretSet: boolean };
}

const SAVED_STATUSES = new Set(["disabled", "test", "live"]);
const SAVED_PROVIDERS = new Set(["moyasar", "stub"]);

/**
 * Built field by field: the enabled config carries the keys, so it is never
 * spread into the result.
 */
export function buildGatewayDiagnostic(
  setting: unknown,
  env: MoyasarEnv,
  billingCompanyComplete: boolean,
): GatewayDiagnostic {
  const obj = typeof setting === "object" && setting !== null && !Array.isArray(setting)
    ? (setting as Record<string, unknown>)
    : null;
  const status = typeof obj?.status === "string" && SAVED_STATUSES.has(obj.status) ? obj.status : null;
  const provider = typeof obj?.provider === "string" && SAVED_PROVIDERS.has(obj.provider) ? obj.provider : null;

  const cfg = resolveMoyasarConfig(setting, env, billingCompanyComplete);
  const effective: GatewayDiagnostic["effective"] = cfg.enabled
    ? { enabled: true, mode: cfg.mode, reasonAr: null }
    : { enabled: false, mode: null, reasonAr: gatewayReasonAr(cfg.reason) };

  return {
    saved: { status, provider },
    effective,
    keys: {
      secretKeyMode: keyMode(env.secretKey, "sk"),
      publishableKeyMode: keyMode(env.publishableKey, "pk"),
      webhookSecretSet: typeof env.webhookSecret === "string" && env.webhookSecret.trim() !== "",
    },
  };
}
