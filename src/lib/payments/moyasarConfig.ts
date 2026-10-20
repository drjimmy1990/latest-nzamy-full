/**
 * moyasarConfig.ts — the Moyasar mode guard (plan "Mode guard"), and the
 * shape checks for the two platform settings it depends on.
 *
 * platform_settings.payments_gateway = {status: "disabled"|"test"|"live", provider: "moyasar"}
 *   - "test" needs sk_test_ / pk_test_ keys;
 *   - "live" needs sk_live_ / pk_live_ keys AND a complete billing_company;
 *   - every mode needs the webhook secret;
 *   - anything else — a mismatch, a missing key, another status — is disabled.
 *
 * platform_settings.billing_company =
 *   {"legal_name_ar", "cr_number", "vat_number", "address_ar": string | null}
 * is "complete" when all four are non-empty strings and vat_number is a Saudi
 * VAT number (15 digits, first and last digit 3).
 *
 * Keys come from the environment only (MOYASAR_SECRET_KEY,
 * NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY, MOYASAR_WEBHOOK_SECRET); the caller
 * passes them in. A disabled `reason` names what is wrong, never the value.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

/** User-facing copy whenever online payment is off. */
export const MOYASAR_DISABLED_MESSAGE_AR = "الدفع الإلكتروني غير متاح حالياً";

export type MoyasarMode = "test" | "live";

export interface MoyasarEnv {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
}

export interface MoyasarConfig {
  enabled: true;
  mode: MoyasarMode;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

export type MoyasarConfigResult = { enabled: false; reason: string } | MoyasarConfig;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function resolveMoyasarConfig(
  setting: unknown,
  env: MoyasarEnv,
  billingCompanyComplete: boolean,
): MoyasarConfigResult {
  if (!isPlainObject(setting)) return { enabled: false, reason: "payments_gateway setting is missing or malformed" };
  if (setting.provider !== "moyasar") return { enabled: false, reason: "payments_gateway provider is not moyasar" };
  const mode = setting.status;
  if (mode !== "test" && mode !== "live") return { enabled: false, reason: "payments_gateway status is not test or live" };

  const secretKey = clean(env.secretKey);
  const publishableKey = clean(env.publishableKey);
  const webhookSecret = clean(env.webhookSecret);

  if (!secretKey) return { enabled: false, reason: "secret key is not set" };
  if (!publishableKey) return { enabled: false, reason: "publishable key is not set" };
  if (!webhookSecret) return { enabled: false, reason: "webhook secret is not set" };
  if (!secretKey.startsWith(`sk_${mode}_`)) {
    return { enabled: false, reason: `secret key does not belong to ${mode} mode` };
  }
  if (!publishableKey.startsWith(`pk_${mode}_`)) {
    return { enabled: false, reason: `publishable key does not belong to ${mode} mode` };
  }
  if (mode === "live" && !billingCompanyComplete) {
    return { enabled: false, reason: "live mode needs a complete billing_company setting" };
  }

  return { enabled: true, mode, secretKey, publishableKey, webhookSecret };
}

// ─── billing_company ──────────────────────────────────────────────────────────

const BILLING_COMPANY_KEYS = ["legal_name_ar", "cr_number", "vat_number", "address_ar"] as const;

/** Saudi VAT registration number: 15 digits, starting and ending with 3. */
const SAUDI_VAT_NUMBER = /^3\d{13}3$/;

export function isBillingCompanyComplete(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (!BILLING_COMPANY_KEYS.every((k) => clean(value[k]).length > 0)) return false;
  return SAUDI_VAT_NUMBER.test(clean(value.vat_number));
}

/** Admin write check for billing_company; null when acceptable. */
export function billingCompanySettingIssue(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'قيمة billing_company يجب أن تكون كائناً بالشكل: {"legal_name_ar":string|null,"cr_number":string|null,"vat_number":string|null,"address_ar":string|null}';
  }
  const allowed = new Set<string>(BILLING_COMPANY_KEYS);
  const unknownKeys = Object.keys(value).filter((k) => !allowed.has(k));
  if (unknownKeys.length > 0) {
    return `مفاتيح غير معروفة في billing_company: ${unknownKeys.join("، ")} — المسموح: ${BILLING_COMPANY_KEYS.join(" و ")}`;
  }
  for (const key of BILLING_COMPANY_KEYS) {
    if (!(key in value)) return `الحقل ${key} مطلوب — نص أو null`;
    const v = value[key];
    if (v !== null && typeof v !== "string") return `الحقل ${key} يجب أن يكون نصاً أو null`;
  }
  const vat = value.vat_number;
  if (typeof vat === "string" && vat.trim() !== "" && !SAUDI_VAT_NUMBER.test(vat.trim())) {
    return "الرقم الضريبي (vat_number) غير صالح — 15 رقماً يبدأ بـ 3 وينتهي بـ 3";
  }
  return null;
}

// ─── payments_gateway (admin write check) ────────────────────────────────────

export interface PaymentsGatewayWriteContext {
  /** NZAMY_ALLOW_STUB_PAYMENTS=true on a local/staging deployment. */
  stubAllowed: boolean;
  /** isBillingCompanyComplete() of the stored billing_company. */
  billingCompanyComplete: boolean;
}

/**
 * Admin write check for payments_gateway; null when acceptable.
 * - {status:"disabled", provider: null | absent | "moyasar"} — always;
 * - {status:"test", provider:"stub"} — only where the stub is allowed (unchanged);
 * - {status:"test", provider:"moyasar"} — always (the keys gate it at runtime);
 * - {status:"live", provider:"moyasar"} — only with a complete billing_company.
 */
export function paymentsGatewaySettingIssue(
  value: unknown,
  ctx: PaymentsGatewayWriteContext,
): string | null {
  if (!isPlainObject(value)) {
    return 'قيمة payments_gateway يجب أن تكون كائناً بالشكل: {"status":"disabled"|"test"|"live","provider":"moyasar"|null}';
  }
  const { status, provider } = value;

  if (status === "disabled" && (provider === null || provider === undefined || provider === "moyasar")) {
    return null;
  }
  if (provider === "stub") {
    if (status === "test" && ctx.stubAllowed) return null;
    return "test/stub يتطلب بيئة local أو staging وإذناً خادمياً صريحاً، ولا يعمل stub في وضع live";
  }
  if (provider === "moyasar") {
    if (status === "test") return null;
    if (status === "live") {
      return ctx.billingCompanyComplete
        ? null
        : "لا يمكن تفعيل الدفع الحقيقي (live) قبل اكتمال بيانات المنشأة في billing_company: الاسم النظامي، السجل التجاري، الرقم الضريبي، العنوان";
    }
  }
  return 'قيمة payments_gateway غير صالحة — المسموح: status = "disabled" أو "test" أو "live" مع provider = "moyasar"';
}
