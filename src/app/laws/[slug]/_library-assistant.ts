/**
 * The library assistant's one call (plan §5 L5): the chat in the law page
 * (LibraryAI) and its «اشرح لي» window (ArticleExplainModal) both POST
 * /api/v1/ai/runs with tool `library-assistant`. The server checks the library
 * gate and the tier, charges 5 points, searches the library, and answers only
 * from what it found, with the citations resolved to titles and links.
 *
 * The answer to show is always the server's: its reply and citations, or the
 * refusal it gave. Nothing here invents a reply.
 *
 * The law page's slug goes with every question, so the server searches the
 * law the reader is on before the whole library (owner's live test 29 Oct:
 * two different laws got the same labour-law answer).
 */
import { libraryAiRefusal, type LibraryAiAction } from "./_ai-reply.ts";

export interface LibraryAnswer {
  text: string;
  /** The server's citations (CitedAnswer.asCitations reads them). */
  citations: unknown[];
  action?: LibraryAiAction;
  /** Set on every answer that is not the assistant's reply (a refusal, a closed tool, an error). */
  refused?: true;
  /**
   * Owner Q458 / L3: the conversation the server filed this question under.
   * The page sends it with the next question, and the server reads that
   * conversation's last six turns from its own records (never from here).
   */
  conversationId?: string;
}

const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The server's conversation id in a reply body, or undefined. */
function conversationOf(json: Record<string, unknown>): string | undefined {
  return typeof json.conversationId === "string" && CONVERSATION_ID.test(json.conversationId) ? json.conversationId : undefined;
}

export const LIBRARY_AI_SOON =
  "الذكاء الاصطناعي قيد التفعيل وقريباً سيتوفر.\nحالياً يمكنك تصفح المواد والاستعانة بالفهرس والمبادئ والسوابق.";
const FALLBACK = "تعذّر الاتصال بالخادم — حاول مرة أخرى";
/** readQuota.LIBRARY_LOCK_SUPPORT_PATH; not imported, so this client file stays free of the proxy's modules. */
const LOCK_SUPPORT = "/contact";
/** Point top-ups and plans are on /pricing (PaywallGate's CreditsBanner links there too). */
const TOP_UP = { label: "شحن النقاط", href: "/pricing" } as const;
/**
 * draftingRequest.DRAFTER_HREF / CONTRACTS_HREF / CLIENT_CONTRACT_DRAFTING_HREF /
 * CONTRACT_SERVICES_HREF: the only links a drafting refusal may carry (owner ٢٦
 * added drafting through a lawyer for an individual or a business).
 */
const DRAFTER_HREF = "/ai/draft";
const CONTRACTS_HREF = "/ai/contracts";
const CLIENT_CONTRACT_DRAFTING_HREF = "/dashboard/client/requests/new?type=general";
const CONTRACT_SERVICES_HREF = "/services/contracts";
const REFUSAL_LINKS: ReadonlySet<string> = new Set([DRAFTER_HREF, CONTRACTS_HREF, CLIENT_CONTRACT_DRAFTING_HREF, CONTRACT_SERVICES_HREF]);

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** The same shape the server accepts (tools.ts LAW_SLUG); anything else is not sent. */
const LAW_SLUG = /^[\p{L}\p{N}_.\-]{1,200}$/u;

/** The law slug in a /laws/<slug> path (query and hash ignored, decoded once), or null. */
export function lawSlugFromPath(path: string): string | null {
  const m = /^\/laws\/([^/?#]+)/.exec(String(path ?? ""));
  if (!m) return null;
  let slug = m[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // A malformed escape: keep it as typed; the shape check below decides.
  }
  return LAW_SLUG.test(slug) ? slug : null;
}

export async function askLibrary(
  input: { message: string; articleId?: string | null; conversationId?: string | null },
  currentPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryAnswer> {
  const conversationId =
    typeof input.conversationId === "string" && CONVERSATION_ID.test(input.conversationId) ? input.conversationId : null;
  const send = (cid: string | null) =>
    fetchImpl("/api/v1/ai/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "library-assistant",
        input: { message: input.message, article_id: input.articleId ?? null, law_slug: lawSlugFromPath(currentPath) },
        ...(cid ? { conversationId: cid } : {}),
        idempotencyKey: newKey(),
      }),
    });
  let res: Response;
  let json: Record<string, unknown>;
  try {
    res = await send(conversationId);
    json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // A conversation holds thirty questions (refused before any charge): the
    // question starts a new conversation instead, once.
    if (conversationId && res.status === 409 && json.code === "conversation_full") {
      res = await send(null);
      json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    }
  } catch {
    return { text: FALLBACK, citations: [], refused: true };
  }
  const output = (json.output ?? null) as Record<string, unknown> | null;

  if (res.ok && typeof output?.reply === "string" && output.reply.trim()) {
    const cid = conversationOf(json);
    return { text: output.reply, citations: Array.isArray(json.citations) ? json.citations : [], ...(cid ? { conversationId: cid } : {}) };
  }
  // Owner Q485: a request to write a memo or a pleading (runCore, before any
  // charge): the server's polite refusal, and the drafter only when it offers it.
  // Owner ٢٢: a contract's refusal offers «محترف العقود» the same way.
  if (json.code === "drafting_refused" && typeof json.error === "string" && json.error) {
    const a = json.action as Record<string, unknown> | null | undefined;
    const href = a && typeof a.href === "string" && REFUSAL_LINKS.has(a.href) ? a.href : null;
    const action = a && href && typeof a.label === "string" && a.label ? { label: a.label, href } : undefined;
    return { text: json.error, citations: [], ...(action ? { action } : {}), refused: true };
  }
  // Signed out, or a tier below Pro: say what to do (the assistant's own wording).
  if (res.status === 401 || (res.status === 403 && json.code === "library_tier")) {
    const refusal = libraryAiRefusal(res.status, currentPath);
    if (refusal) return { text: refusal.text, citations: [], action: refusal.action, refused: true };
  }
  // A library lock is a 423 too, but not «قيد التفعيل»: the server's own lock
  // message (readQuota.libraryLockMessageAr) and the way to support.
  if (json.code === "library_security_lock" && typeof json.error === "string" && json.error) {
    return { text: json.error, citations: [], action: { label: "تواصل معنا", href: LOCK_SUPPORT }, refused: true };
  }
  // Not enough points (runCore AI_COPY.points): the server's sentence and the way to top up.
  if (res.status === 402 && json.code === "insufficient_points") {
    const text = typeof json.error === "string" && json.error ? json.error : "رصيدك من النقاط لا يكفي لهذه الأداة";
    return { text, citations: [], action: { ...TOP_UP }, refused: true };
  }
  // Switched off or not wired yet: the page's existing «قيد التفعيل».
  if (res.status === 423 || json.code === "not_ready") return { text: LIBRARY_AI_SOON, citations: [], refused: true };
  if (typeof json.error === "string" && json.error) return { text: json.error, citations: [], refused: true };
  const refusal = libraryAiRefusal(res.status, currentPath);
  return { text: refusal?.text ?? FALLBACK, citations: [], action: refusal?.action, refused: true };
}

/** One saved conversation as the panel lists it (GET /api/v1/ai/library-history). */
export interface LibraryHistoryConversation {
  conversationId: string | null;
  turns: Array<{ question: string; answer: string; citations: unknown[]; createdAt: string }>;
  updatedAt: string;
}

/**
 * Owner L3: the signed-in user's last conversations on this law, from the
 * server (so a second device sees them too). null when there is nothing to
 * show: signed out, no law page, or a failed read — the panel then stays hidden.
 */
export async function loadLibraryHistory(
  currentPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryHistoryConversation[] | null> {
  const slug = lawSlugFromPath(currentPath);
  if (!slug) return null;
  try {
    const res = await fetchImpl(`/api/v1/ai/library-history?law=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { conversations?: unknown } | null;
    if (!json || !Array.isArray(json.conversations)) return null;
    return json.conversations.filter(
      (c): c is LibraryHistoryConversation =>
        typeof c === "object" && c !== null && Array.isArray((c as LibraryHistoryConversation).turns) &&
        (c as LibraryHistoryConversation).turns.every((t) => typeof t?.question === "string" && typeof t?.answer === "string"),
    );
  } catch {
    return null;
  }
}
