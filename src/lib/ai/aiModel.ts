/**
 * aiModel.ts — owner س٢١٩ (batch l16): the AI tools' model is chosen in the
 * admin settings, not in code. platform_settings 'ai_model' =
 * {"model": "models/gemini-3.5-flash-lite"} (the default, the model every
 * workflow ran on before this setting existed).
 *
 * The app reads it once per run (runCore readAiModel) and sends it as `model`
 * in the package to n8n — the tool's call and the library search writer's.
 * Every Gemini node takes it through an expression with a fallback to the
 * workflow's own model (n8n/ai/workflows.mjs MODEL_EXPR), and the parse step
 * reports the same name in `usage.model`, so the admin AI usage page prices
 * the run at the chosen model (modelPrices.ts).
 *
 * Allow-list = the models with a price row in modelPrices.ts: a model the
 * table cannot price cannot be chosen, so no run is ever left unpriced by the
 * setting. To offer another model, add its published price there first.
 *
 * A missing, malformed or unknown stored value reads as the default — a typo
 * can never send a name n8n would reject.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */
import { MODEL_PRICES } from "./modelPrices.ts";

export const AI_MODEL_SETTING = "ai_model";
export const AI_MODEL_DEFAULT = "models/gemini-3.5-flash-lite";

/** Every model the admin may choose ("models/<id>"), the default first. */
export const AI_MODEL_CHOICES: readonly string[] = Object.freeze([
  AI_MODEL_DEFAULT,
  ...Object.keys(MODEL_PRICES)
    .map((id) => `models/${id}`)
    .filter((m) => m !== AI_MODEL_DEFAULT),
]);

/** Arabic notes the admin page shows next to a choice (none = no note). */
export const AI_MODEL_NOTES_AR: Readonly<Record<string, string>> = Object.freeze({
  "models/gemini-3.1-flash-lite": "رفضته Google يومي ٢٣ و٢٤ نوفمبر ٢٠٢٦ — لا يُختار إلا بعد التأكد من عودته",
});

/** "models/gemini-3.5-flash-lite" → "gemini-3.5-flash-lite" (the id usage.model and the price table use). */
export const aiModelId = (model: string) => model.replace(/^models\//, "");

/** The stored setting → the model to send. Anything missing, malformed or not allow-listed → the default. */
export function parseAiModel(value: unknown): string {
  const m = value && typeof value === "object" && !Array.isArray(value) ? (value as { model?: unknown }).model : undefined;
  if (typeof m !== "string") return AI_MODEL_DEFAULT;
  const name = m.trim();
  return AI_MODEL_CHOICES.includes(name) ? name : AI_MODEL_DEFAULT;
}

/** The admin settings validator: exactly {"model": "<one of AI_MODEL_CHOICES>"}. */
export function aiModelSettingIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `قيمة ai_model يجب أن تكون كائناً بالشكل {"model":"${AI_MODEL_DEFAULT}"}`;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  const m = (value as { model?: unknown }).model;
  if (keys.length !== 1 || keys[0] !== "model" || typeof m !== "string") {
    return `قيمة ai_model يجب أن تكون {"model": "اسم النموذج"} فقط`;
  }
  if (!AI_MODEL_CHOICES.includes(m)) {
    return `النموذج غير مسموح به. المسموح: ${AI_MODEL_CHOICES.join("، ")} (كل نموذج يجب أن يكون له سعر في جدول الأسعار أولاً)`;
  }
  return null;
}
