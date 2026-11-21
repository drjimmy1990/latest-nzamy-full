                                                                                                                                   

/**
 * Minimal fetch client for /api/v1/ext. Same wire contract as nezamy-client (the shared SDK);
 * kept dependency-free here so the add-in bundle stays small. When the SDK is published,
 * replace the run methods with it (see STATUS.md).
 */
export class ApiError extends Error {
  status        ; code        ; arabic        ; requestId         ;
  constructor(status        , code        , arabic        , requestId         ) {
    super(`${code} (HTTP ${status})`);
    this.status = status; this.code = code; this.arabic = arabic; this.requestId = requestId;
  }
}

const AR                         = {
  unauthorized: "انتهت جلستك. سجّل الدخول من جديد.",
  insufficient_points: "رصيد النقاط غير كافٍ.",
  rate_limited: "طلبات كثيرة. انتظر قليلًا.",
  forbidden: "هذه الأداة غير متاحة لحسابك حاليًا.",
  not_found: "العنصر غير موجود.",
  run_failed: "فشلت العملية وتم رد النقاط.",
  timeout: "استغرقت العملية وقتًا أطول من المسموح.",
  network: "تعذر الاتصال بنظامي.",
  unknown: "حدث خطأ غير متوقع.",
};
function codeOf(status        , c         )         {
  if (c && AR[c]) return c;
  if (status === 401) return "unauthorized";
  if (status === 402) return "insufficient_points";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unknown";
}

                             
                  
                                                                
                                           
                       
                                        
                     
 

export class WordClient {
          base        ;
          o            ;
  constructor(o            ) {
    this.o = o;
    const u = new URL(o.baseUrl);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !local) throw new Error("baseUrl must be https");
    this.base = `${u.origin}/api/v1/ext`;
  }

  standing() { return this.req          ("GET", "/account/standing"); }
  quote(b           ) { return this.req       ("POST", "/ai/runs/quote", b); }
  startRun(b              ) { return this.req               ("POST", "/ai/runs", b); }
  getRun(id        ) { return this.req          ("GET", `/ai/runs/${encodeURIComponent(id)}`); }

  async waitForRun(id        , deadlineMs = 15 * 60_000)                    {
    const sleep = this.o.sleep ?? ((ms) => new Promise      ((r) => setTimeout(r, ms)));
    const now = this.o.now ?? Date.now;
    const end = now() + deadlineMs;
    let delay = 1000;
    for (;;) {
      const r = await this.getRun(id);
      if (r.status !== "running") return r;
      if (now() + delay > end) throw new ApiError(0, "timeout", AR.timeout );
      await sleep(delay);
      delay = Math.min(5000, Math.round(delay * 1.5));
    }
  }

  /** Start, wait, and throw run_failed (with the server's Arabic reason) on failure. */
  async runAndWait(b              )                    {
    const s = await this.startRun(b);
    const r = s.status === "running" ? await this.waitForRun(s.run_id) : await this.getRun(s.run_id);
    if (r.status === "failed") throw new ApiError(200, "run_failed", r.error_message || AR.run_failed , r.request_id);
    return r;
  }

  /* ---- case file sync. ASSUMPTION: these endpoints do not exist yet; paths are a proposal for the platform side. ---- */
  logActivity(a                ) { return this.req                ("POST", `/cases/${encodeURIComponent(a.case_id)}/activity`, a); }
  addToVault(caseId        , b                                                          ) { return this.req                ("POST", `/cases/${encodeURIComponent(caseId)}/vault`, b); }
  uploadCaseFile(caseId        , b                                              ) { return this.req                ("POST", `/cases/${encodeURIComponent(caseId)}/files`, b); }
  shareWithClient(caseId        , b                                                   ) { return this.req                                     ("POST", `/cases/${encodeURIComponent(caseId)}/share`, b); }
  clientComments(caseId        , documentId        ) { return this.req                               ("GET", `/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/comments`); }
  postComment(caseId        , documentId        , b                                                                   ) { return this.req                ("POST", `/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/comments`, b); }

          async req   (method                , path        , body          )             {
    const f = this.o.fetch ?? fetch;
    let res          ;
    try {
      res = await f(`${this.base}${path}`, {
        method, redirect: "error",
        headers: { Authorization: `Bearer ${await this.o.getToken()}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch { throw new ApiError(0, "network", AR.network ); }
    const text = await res.text();
    let j     ; try { j = text ? JSON.parse(text) : undefined; } catch { j = undefined; }
    if (!res.ok) {
      const code = codeOf(res.status, j?.code ?? j?.error?.code);
      const msg = typeof (j?.error?.message ?? j?.error) === "string" ? (j.error?.message ?? j.error) : "";
      throw new ApiError(res.status, code, /[؀-ۿ]/.test(msg) ? msg : AR[code] , j?.request_id ?? j?.error?.request_id);
    }
    return j     ;
  }
}
