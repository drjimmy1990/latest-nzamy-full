/**
 * sync-client.js — طرف الإضافة من عقد POST /api/v1/ext/cases/sync
 * (docs/plans/2026-11-21-ext-cases-sync-contract.md). وحدة صرفة (بلا chrome.*) تُستورد من background.js.
 * ملف جديد عمدًا: لا يلمس background.js الذي عليه تعديلات المالك غير الملتزمة على owner-edits.
 * خطوات الربط في background.js مشروحة في docs/plans/2026-11-21-ext-cases-sync-wiring.md.
 */

export const SYNC_PATH = "/api/v1/ext/cases/sync";
export const QUEUE_TTL_MS = 7 * 24 * 3600 * 1000; // مقترح: ٧ أيام (قرار مفتوح للمالك)

// مفاتيح بوابات الإضافة ← منصات العقد. ما ليس هنا (مثل moeen) لا يُرسل ويُبلَّغ عنه.
const PLATFORM_MAP = {
  najiz: "najiz",
  taradhi: "taradhi",
  tanfeeth: "enforcement",
  enforcement: "enforcement",
  khibrah: "khebra",
  khebra: "khebra",
  infath: "infath",
  ifa: "ifa",
};

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** هويات: آخر ٤ أرقام فقط (الخادم يقنّع أيضًا). */
export function maskId(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `••••${d.slice(-4)}` : "••••";
}

/**
 * حزمة الإضافة (صف واحد من content.js) ← جسم العقد. ترجع null إن لم تُدعم المنصة أو غاب رقم القضية.
 * المفتاح حتمي: نفس الحزمة المحتوى ⇒ نفس المفتاح، فإعادة الإرسال من الطابور آمنة.
 */
export async function bundleToSyncRequest(bundle, { extensionVersion = null, now = () => new Date() } = {}) {
  const platform = PLATFORM_MAP[String(bundle?.portal ?? "").toLowerCase()];
  const number = String(bundle?.caseCode ?? bundle?.recordNumber ?? "").trim();
  if (!platform || !number) return null;

  const parties = [];
  if (bundle.prosecutorName) parties.push({ role: "plaintiff", name: String(bundle.prosecutorName).slice(0, 300) });
  if (bundle.defendantName) parties.push({ role: "defendant", name: String(bundle.defendantName).slice(0, 300) });

  const sessions = bundle.hijriCaseDate && /^\d{4}-\d{2}-\d{2}/.test(String(bundle.hijriCaseDate)) ? [{ date: String(bundle.hijriCaseDate), kind: bundle.caseTypeName ?? undefined }] : [];

  const body = {
    source: { platform, captured_at: now().toISOString(), extension_version: extensionVersion },
    case: {
      number,
      court: bundle.courtName || undefined,
      type: bundle.caseTypeName || undefined,
      status: bundle.caseStatusName || undefined,
    },
    parties,
    sessions,
    attachments: [],
    records: [],
  };
  // المفتاح من هوية السحبة + محتواها (بلا captured_at حتى يثبت عند إعادة الإرسال)
  const { source: _s, ...stable } = body;
  body.idempotency_key = `ext-${platform}-${(await sha256Hex(JSON.stringify({ platform, ...stable }))).slice(0, 40)}`;
  return body;
}

/** done: احذف من الطابور · retry: أعد لاحقًا بتراجع أسّي · rejected: ضع وسم «مرفوضة» ولا تُعد تلقائيًا. 404 ليس حالة عادية. */
export function classifyResponse(status) {
  if (status === 200 || status === 201) return "done";
  if (status === 429 || status >= 500 || status === 0) return "retry";
  return "rejected"; // 401/403/413/422/404 وغيرها
}

export function backoffMs(attempt, retryAfterSec) {
  if (retryAfterSec > 0) return retryAfterSec * 1000;
  return Math.min(30 * 60_000, 2 ** Math.max(0, attempt) * 5_000);
}

/** يُسقط من الطابور ما تجاوز المدة، ويُبقي المرفوض ظاهرًا للمستخدم حتى ينتهي أجله. */
export function pruneQueue(queue, nowMs = Date.now(), ttl = QUEUE_TTL_MS) {
  return queue.filter((e) => nowMs - Date.parse(e.queuedAt) < ttl);
}

/**
 * إرسال سحبة واحدة. fetchImpl قابل للحقن للاختبار. لا يُسجَّل نص الحزمة — الحالة والأعداد فقط.
 * @returns {{outcome:'done'|'retry'|'rejected'|'skipped', status?:number, caseId?:string, retryAfterMs?:number}}
 */
export async function sendSync(body, { serverUrl, token, fetchImpl = fetch }) {
  if (!body) return { outcome: "skipped" };
  if (!token) return { outcome: "rejected", status: 401 }; // PAT مطلوب؛ لا كوكيز بعد اليوم
  let res;
  try {
    res = await fetchImpl(`${serverUrl}${SYNC_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "omit",
      body: JSON.stringify(body),
    });
  } catch {
    return { outcome: "retry", status: 0, retryAfterMs: backoffMs(0) };
  }
  const outcome = classifyResponse(res.status);
  const out = { outcome, status: res.status };
  if (outcome === "done") {
    const j = await res.json().catch(() => null);
    if (j?.case_id) out.caseId = j.case_id;
  } else if (outcome === "retry") {
    out.retryAfterMs = backoffMs(0, Number(res.headers?.get?.("Retry-After")) || 0);
  }
  return out;
}
