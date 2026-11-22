export type ErrorCode =
  | "unauthorized" | "forbidden_scope" | "token_expired" | "frozen_account"
  | "rate_limited" | "quota_exceeded" | "library_locked" | "library_tier"
  | "insufficient_points" | "tool_off" | "role_refused" | "consultant_blocked"
  | "validation" | "not_found" | "upstream_unavailable" | "timeout" | "network"
  | "bad_response" | "run_failed" | "kill_switch" | "device_limit" | "staff_only" | "unknown";

/** Arabic, plain, safe to show to a lawyer. Never contains tokens or server internals. */
const AR: Record<ErrorCode, string> = {
  unauthorized: "تعذر تسجيل الدخول: التوكن غير صالح. أنشئ توكنًا جديدًا من حسابك في نظامي.",
  forbidden_scope: "هذا التوكن لا يملك صلاحية هذه العملية.",
  token_expired: "انتهت صلاحية التوكن. أنشئ توكنًا جديدًا من حسابك.",
  frozen_account: "الحساب موقوف حاليًا.",
  rate_limited: "طلبات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
  quota_exceeded: "تجاوزت حد القراءة المسموح به اليوم في المكتبة.",
  library_locked: "المكتبة مقفلة مؤقتًا على حسابك.",
  library_tier: "هذه الميزة تتطلب اشتراكًا في المكتبة أو الباقة الاحترافية.",
  insufficient_points: "رصيد النقاط غير كافٍ لهذه الأداة.",
  tool_off: "هذه الأداة غير مفتوحة حاليًا.",
  role_refused: "هذه الأداة غير متاحة لنوع حسابك.",
  consultant_blocked: "المستشار القانوني لا يترافع، فالأداة غير متاحة لحسابه (المادة ١٨).",
  validation: "البيانات المرسلة غير مكتملة أو غير صحيحة.",
  not_found: "لم يتم العثور على العنصر المطلوب.",
  upstream_unavailable: "الخدمة غير متاحة مؤقتًا. أعد المحاولة بعد قليل.",
  timeout: "استغرقت العملية وقتًا أطول من المسموح.",
  network: "تعذر الاتصال بنظامي. تحقق من الإنترنت.",
  bad_response: "ردّ غير متوقع من الخادم.",
  run_failed: "فشلت العملية وتم رد النقاط إن كانت قد خُصمت.",
  kill_switch: "وصول Claude إلى نظامي موقوف مؤقتًا من إدارة المنصة.",
  device_limit: "تجاوز الحساب حد الأجهزة أو التوكنات المسموح به.",
  staff_only: "هذه الأداة للمشرفين فقط في هذه المرحلة.",
  unknown: "حدث خطأ غير متوقع.",
};

export class NezamyApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly arabic: string;
  constructor(code: ErrorCode, status: number, opts: { requestId?: string; retryAfterSeconds?: number; serverMessage?: string } = {}) {
    super(`${code} (HTTP ${status})`);
    this.name = "NezamyApiError";
    this.code = code;
    this.status = status;
    this.requestId = opts.requestId;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    // The server's own Arabic message wins when it sent one (it knows the exact lock reason).
    this.arabic = opts.serverMessage && /[؀-ۿ]/.test(opts.serverMessage) ? opts.serverMessage : AR[code];
  }
}

export function codeFromHttp(status: number, serverCode?: string): ErrorCode {
  const known: Record<string, ErrorCode> = {
    token_expired: "token_expired", frozen_account: "frozen_account", rate_limited: "rate_limited",
    quota_exceeded: "quota_exceeded", library_closed: "library_locked", library_locked: "library_locked",
    library_tier: "library_tier", insufficient_points: "insufficient_points", tool_off: "tool_off",
    role_refused: "role_refused", kill_switch: "kill_switch", device_limit: "device_limit", staff_only: "staff_only", consultant_blocked: "consultant_blocked", forbidden_scope: "forbidden_scope",
  };
  if (serverCode && known[serverCode]) return known[serverCode]!;
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden_scope";
  if (status === 402) return "insufficient_points";
  if (status === 404) return "not_found";
  if (status === 423) return "library_locked";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "upstream_unavailable";
  return "unknown";
}
