import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

// Valid DB service_requests.status values that count as "active" for a client.
const ACTIVE_STATUSES = ["pending_assignment", "assigned", "in_review"];
// ...and the terminal ones. Anything outside both lists (e.g. "pending_payment")
// is deliberately counted in neither: it is in flight but not yet closed, and
// inventing a bucket for it would put a number under a label it does not belong to.
const CLOSED_STATUSES = ["completed", "cancelled"];

/**
 * The eight classification flags a lawyer can tick in AddClientModal.
 * Mirrors `ClientFlag` in src/constants/lawyerClientsData.ts. Duplicated
 * deliberately: that module is a client-side constants file (it also carries
 * MOCK_CLIENTS and Tailwind class strings), and a route handler importing it
 * would drag mock data into the server bundle. The cost of the duplication is
 * that adding a ninth flag means editing two files; the benefit is that an
 * arbitrary string sitting in metadata.flags — written by an older client, by
 * hand, or by some future caller — can never reach the UI, where
 * FLAG_CONFIG[flag] would be undefined and crash the card on `fc.bg`.
 */
const KNOWN_FLAGS = new Set([
  "vip", "late_pay", "bad", "new", "loyal", "urgent", "corporate", "inactive",
]);

/**
 * Read back the classification a lawyer typed into AddClientModal.
 *
 * These five keys are written by the POST below into service_requests.metadata
 * and, until this pass, were read by nothing at all: the GET returned no fee,
 * rating, flag or entity-type key, so the clients list filled the gaps with
 * literals — every client rendered a green «✓» under «متبقي» and a 3-of-5 star
 * rating nobody had given.
 *
 * `null` here means "no such value is on record", NOT zero. Callers must omit
 * the whole label rather than render a 0: «0 ﷼ outstanding» and «we do not know
 * what this client owes» are different statements, and only one of them is true.
 */
function readClientClassification(meta: Record<string, unknown>) {
  const rawRating = meta.rating;
  const rating =
    typeof rawRating === "number" && Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5
      ? rawRating
      : null;

  const money = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

  const rawFlags = meta.flags;
  const flags = Array.isArray(rawFlags)
    ? rawFlags.filter((f): f is string => typeof f === "string" && KNOWN_FLAGS.has(f))
    : null;

  const rawType = meta.clientType;
  const clientType: "individual" | "company" | null =
    rawType === "company" ? "company" : rawType === "individual" ? "individual" : null;

  return {
    clientType,
    flags,
    rating,
    totalFees: money(meta.totalFees),
    paidFees: money(meta.paidFees),
  };
}

/**
 * The exact shape both lawyer client screens read. Every classification field is
 * `null` when the platform has no source for it — never a filled-in default.
 */
type LawyerClientPayload = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  userType: string;
  /**
   * Where this row came from. The two kinds are not interchangeable and the UI
   * has to tell them apart: a "profile" client is a real platform account whose
   * `id` is a user id, so their other requests can be looked up by
   * requester_user_id; a "manual" client is a card the lawyer typed into
   * AddClientModal, whose `id` is a service_requests row id that nothing else
   * in the schema references. Asking for a manual client's linked requests can
   * only ever return nothing, and rendering that as «no linked cases» would
   * read as a fact about the client rather than about the platform.
   */
  source: "profile" | "manual";
  /** Service requests in flight. NOT a case count — the UI must label it as requests. */
  requestCount: number;
  activeCount: number;
  closedCount: number;
  lastActivity: string;
  clientType: "individual" | "company" | null;
  flags: string[] | null;
  rating: number | null;
  totalFees: number | null;
  paidFees: number | null;
};

/**
 * GET /api/v1/lawyer/clients
 * Auth required. Returns clients who have service requests assigned to this lawyer.
 * Includes both auth-backed clients (via requester_user_id → profiles) and
 * manually-added clients (service_requests with metadata.client = true, no
 * requester_user_id).
 *
 * Failure is reported as a non-2xx, NOT as an empty array. This route used to
 * answer a Supabase error with HTTP 200 and `[]`, which the clients page
 * rendered as «لا توجد موكلون بعد» — the lawyer was told they have no clients
 * on top of a failed query. A lawyer has to be able to tell a broken read from
 * an empty address book.
 *
 * ── SHAPE WARNING FOR CALLERS: DO NOT USE listFromApi() ON THIS ─────────────
 *
 * The success body is a BARE ARRAY (`NextResponse.json(clients)`), not the
 * `{ data, total }` envelope the rest of the list endpoints use. Failure is a
 * non-2xx carrying `{ error }`. listFromApi() in src/lib/services/listRead.ts
 * looks for `body.data` and returns listFailed() when it is not an array — so
 * pointing it at this body turns a lawyer with a genuinely empty address book
 * (the honest `[]` a few lines below) into «تعذّرت القراءة». That is the same
 * false statement as the defect, inverted.
 *
 * Map it on the status instead:
 *     res.ok ? listOk(await res.json()) : listFailed()
 *
 * The envelope was NOT changed here to match the others, deliberately: three
 * call sites read the array directly (src/lib/services/lawyerClientsService.ts:33,
 * src/app/dashboard/lawyer/clients/page.tsx:93,
 * src/app/dashboard/lawyer/clients/[id]/page.tsx:118) and would each break on
 * an object. Route and callers have to move in one commit, and those files
 * belong to another group in this pass.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;

    // Get all service requests assigned to this lawyer
    const { data: requests, error: reqError } = await supabase
      .from("service_requests")
      .select("id, requester_user_id, status, type, created_at, metadata, requester")
      .eq("assigned_to", uid);

    if (reqError) {
      console.error("[lawyer/clients GET] Supabase error:", reqError.message, reqError.details, reqError.code);
      return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
    }

    if (!requests || requests.length === 0) {
      return NextResponse.json([]);
    }

    // Group by sender_id to get unique auth-backed clients with stats
    const clientMap = new Map<string, { requestCount: number; activeCount: number; closedCount: number; lastActivity: string }>();
    // Manually-added clients (metadata.client = true, no requester_user_id)
    const manualClients: LawyerClientPayload[] = [];

    for (const req of requests) {
      const meta = (req.metadata as Record<string, unknown> | null) ?? {};
      const requester = (req.requester as Record<string, unknown> | null) ?? {};

      if (!req.requester_user_id && meta.client === true) {
        // A manually-added client is exactly one row, so there is nothing to
        // aggregate here — the de-duplicating `find` this branch used to run
        // keyed on the row's own id and therefore could never match.
        manualClients.push({
          id: req.id,
          name: String(requester.name ?? "عميل جديد"),
          phone: typeof requester.phone === "string" ? requester.phone : null,
          email: typeof requester.email === "string" ? requester.email : null,
          avatar: null,
          userType: "client",
          source: "manual",
          requestCount: 1,
          activeCount: ACTIVE_STATUSES.includes(req.status) ? 1 : 0,
          closedCount: CLOSED_STATUSES.includes(req.status) ? 1 : 0,
          lastActivity: req.created_at,
          ...readClientClassification(meta),
        });
        continue;
      }

      if (!req.requester_user_id) continue;

      // The lawyer is not one of their own clients.
      //
      // Every row the lawyer's own workspace creates — AddCaseModal,
      // AddHearingModal, the tasks and contracts screens, and the consultation
      // booking — is written with `assigned_to` = the lawyer AND, because
      // POST /api/v1/service-requests sets `requester_user_id: user.id` from the
      // session, with the lawyer as requester too. Without this guard those rows
      // group under the lawyer's own uid, the profiles lookup below resolves it,
      // and the lawyer renders as a card in their own «دليل العملاء» with a live
      // «طلبات نشطة» count — an invented client whose drawer would then fetch
      // the lawyer's entire request history under their own name.
      if (req.requester_user_id === uid) continue;

      const existing = clientMap.get(req.requester_user_id) || { requestCount: 0, activeCount: 0, closedCount: 0, lastActivity: "" };
      existing.requestCount++;
      if (ACTIVE_STATUSES.includes(req.status)) {
        existing.activeCount++;
      }
      if (CLOSED_STATUSES.includes(req.status)) {
        existing.closedCount++;
      }
      if (!existing.lastActivity || req.created_at > existing.lastActivity) {
        existing.lastActivity = req.created_at;
      }
      clientMap.set(req.requester_user_id, existing);
    }

    // Fetch profiles for auth-backed client IDs
    const clientIds = Array.from(clientMap.keys());
    const { data: profiles, error: profileError } = clientIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, phone, avatar_url, user_type")
          .in("id", clientIds)
      : { data: [], error: null };

    if (profileError) {
      // Same reasoning as the requests error above: silently dropping the
      // auth-backed half of the directory would hand the lawyer a shorter
      // client list with nothing on screen saying anything was missing.
      console.error("[lawyer/clients GET] profiles error:", profileError.message, profileError.code);
      return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
    }

    const clients: LawyerClientPayload[] = [
      ...(profiles ?? []).map((profile) => {
        const stats = clientMap.get(profile.id) || { requestCount: 0, activeCount: 0, closedCount: 0, lastActivity: "" };
        return {
          id: profile.id,
          name: profile.display_name || "عميل نظامي",
          email: profile.email,
          phone: profile.phone,
          avatar: profile.avatar_url,
          userType: profile.user_type,
          source: "profile" as const,
          ...stats,
          // An auth-backed client never went through AddClientModal, so the
          // platform holds no fee agreement, rating, flags or entity type for
          // them. `null`, not 0 — the screens omit those labels entirely.
          clientType: null,
          flags: null,
          rating: null,
          totalFees: null,
          paidFees: null,
        };
      }),
      // Manually-added clients (no profile row)
      ...manualClients,
    ];

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[lawyer/clients GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل دليل الموكّلين." }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/clients
 * Auth required. Creates a manually-added client as a service_requests row
 * (receiver: "lawyer", assigned_to: the lawyer, metadata.client = true, status: "assigned").
 * Returns the same shape the GET returns, so the caller renders the saved client
 * from the server's answer rather than from its own form state — which is how
 * the fee figures used to appear on the new card for one render and then vanish
 * on the next page load.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { name, phone, email, type, flags, rating, totalFees, paidFees } = body as {
      name?: string;
      phone?: string;
      email?: string;
      type?: string;
      flags?: string[];
      rating?: number;
      totalFees?: number;
      paidFees?: number;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const metadata: Record<string, unknown> = { client: true };
    if (type) metadata.clientType = type;
    if (Array.isArray(flags)) metadata.flags = flags;
    if (typeof rating === "number") metadata.rating = rating;
    if (typeof totalFees === "number") metadata.totalFees = totalFees;
    if (typeof paidFees === "number") metadata.paidFees = paidFees;

    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        id,
        requester_user_id: null,
        type: "service",
        title: `موكّل: ${name.trim()}`,
        description: "",
        requester: {
          name: name.trim(),
          role: "client",
          tier: "free",
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        },
        receiver: "lawyer",
        assigned_to: user.id,
        status: "assigned",
        payment: { amount: 0, status: "not_required" },
        source_path: "",
        metadata,
      })
      .select("id, status, type, created_at, metadata, requester")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    const requester = (data.requester as Record<string, unknown> | null) ?? {};
    const savedMeta = (data.metadata as Record<string, unknown> | null) ?? {};
    const payload: LawyerClientPayload = {
      id: data.id,
      name: String(requester.name ?? name),
      email: typeof requester.email === "string" ? requester.email : null,
      phone: typeof requester.phone === "string" ? requester.phone : null,
      avatar: null,
      userType: "client",
      source: "manual",
      requestCount: 1,
      activeCount: ACTIVE_STATUSES.includes(data.status) ? 1 : 0,
      closedCount: CLOSED_STATUSES.includes(data.status) ? 1 : 0,
      lastActivity: data.created_at,
      // Echo what was actually persisted, not what was sent: a value the
      // validator rejects must not appear on the new card either.
      ...readClientClassification(savedMeta),
    };
    return NextResponse.json({ data: payload });
  } catch (err) {
    console.error("[lawyer/clients POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
