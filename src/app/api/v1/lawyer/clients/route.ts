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
 * The one definition of a money figure this route accepts: a finite number that
 * is not negative.
 *
 * Hoisted so the write guard in POST and the read guard below are literally the
 * same rule. They were two different rules until this pass, and the gap was
 * writable: POST stored anything satisfying `typeof v === "number"`, so a -100
 * went into metadata that this reader then refused — a figure sitting in the
 * database and on no screen, which is the defect this whole pass exists to
 * close. Whatever passes here is storable AND readable; nothing else is either.
 */
function isMoneyFigure(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** The rating scale the card renders: whole stars, 1 to 5. Same contract as above. */
function isRatingFigure(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * The star value AddClientModal sent when the lawyer never touched the widget.
 *
 * `useState<1|2|3|4|5>(3)` with `rating` in the request body unconditionally,
 * and a star widget with no unset state — that is what the modal did from the
 * initial commit until this pass, and git shows no other default has ever
 * existed. This POST is also the only writer of `metadata.rating` on a manual
 * client row (this route has one insert and no update; there is no edit path in
 * the product).
 *
 * Both facts together are what make the read below decidable: a stored 1, 2, 4
 * or 5 could not have got into the row without the lawyer clicking a star,
 * while a stored 3 is two different events collapsed onto one byte-identical
 * value — a deliberate three, and a form step nobody visited. Nothing in the
 * row separates those two.
 */
const LEGACY_UNTOUCHED_RATING = 3;

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
  /**
   * A rating is reported only when it is provably something the lawyer did.
   *
   * The rule here used to be `isRatingFigure(meta.rating) ? meta.rating : null`,
   * which accepts the modal's old untouched default (see
   * LEGACY_UNTOUCHED_RATING) as a real figure. So every manually-added client
   * came back rated, and three gold stars were drawn on four live screens — the
   * directory card, the detail page header, its «تقييم التعامل» row and the
   * drawer — for a lawyer who had never rated anyone. The rows are already in
   * the table, so tightening only the modal repairs nothing: this read is what
   * repairs them, and it does it without a migration.
   *
   * Three cases, one question — is this value an act?
   *
   *   • `ratingChosen === true`: the caller stated, alongside the number, that
   *     it is a choice rather than a widget default — which only a caller with
   *     a real unset state can say. Trust the value, 3 included.
   *   • No marker, value ≠ 3: the old modal could not produce it without a
   *     click, and nothing else writes this key. It is a real rating a real
   *     lawyer gave, and discarding it because a sibling case is ambiguous
   *     would destroy true data to fix invented data.
   *   • No marker, value 3: unknowable. Report nothing.
   *
   * COST, stated plainly: a lawyer who deliberately gave three stars before
   * today loses that rating from every screen, and with no edit path anywhere
   * in the product cannot restore it except by re-adding the client. That is
   * the price of the alternative being worse — keeping an invented three on
   * every client who was never rated at all.
   *
   * The marker fails closed. If it is ever lost — a future writer replacing the
   * whole metadata object rather than merging into it — the rating reads as
   * absent. It can silence a real rating; it can never manufacture one.
   */
  const storedRating = isRatingFigure(meta.rating) ? meta.rating : null;
  const rating =
    storedRating === null ? null
    : meta.ratingChosen === true ? storedRating
    : storedRating === LEGACY_UNTOUCHED_RATING ? null
    : storedRating;

  /**
   * A fee agreement is a POSITIVE total. A stored 0 is not one.
   *
   * AddClientModal's fee step is optional, but it used to send
   * `Number(total) || 0` — so every lawyer who clicked past that step without
   * typing anything wrote a hard `0` into metadata.totalFees/paidFees. The
   * guard above accepts it (`0 >= 0`), so it came back as a real figure, both
   * client screens saw two non-null numbers, and the detail page printed
   * «إجمالي الأتعاب ٠ ﷼» under the subtitle «مسدّدة بالكامل» — a settled
   * account, invented out of a skipped form step.
   *
   * That 0 is a sentinel, not a measurement, and no marker in the row
   * separates it from a deliberately-typed 0. So the whole fee agreement is
   * reported as absent whenever the total is not positive. This is the rule
   * the render sites already apply one layer up (clients/page.tsx:409,:487 and
   * ClientDrawer.tsx:286 each re-check `totalFees > 0`); enforcing it at the
   * source repairs the rows already in the table — tightening only the modal
   * would leave every client added before today still reading «مسدّدة بالكامل».
   *
   * COST, stated plainly: a genuinely pro-bono client — total 0 on purpose —
   * is indistinguishable from a skipped step and reads as "no fee agreement on
   * record" too. Representing that honestly needs a per-client fee record with
   * an explicit zero-agreement flag, which does not exist.
   *
   * `paidFees` falls back to 0 UNDER an agreement and ONLY when no advance is
   * on record at all. With a total of 5,000 and no advance typed, "nothing has
   * been paid" is the fact, and the row says so; nulling it would drop the
   * entire fee panel (every reader requires both keys) for a client whose fees
   * are perfectly well known.
   *
   * An advance that IS on record but is unreadable — a legacy -100, which the
   * old modal could write, or any non-number — is a different statement and
   * gets a different answer: null, not 0. Those two were collapsed until now
   * (`rawPaid ?? 0`), so such a row rendered «مسدّد ٠ ﷼ / متبقٍ ٥٬٠٠٠ ﷼»: a
   * claim that this client has paid nothing, assembled out of the one figure
   * the guard had just refused to read. This function's own header promises the
   * opposite — null means "not on record" — and a rejection is not a
   * measurement of zero. A refusal that renders as a number is not a refusal.
   *
   * COST, stated plainly: such a row loses its whole fee panel, the real total
   * included, because all three fee surfaces require both keys
   * (clients/page.tsx:487, ClientDrawer.tsx:269, clients/[id]/page.tsx:329).
   * `totalFees` is still returned truthfully for any reader wanting only the
   * total. Showing a real total beside a blank advance needs a third state —
   * "agreed, amount paid unknown" — that no screen has. Going forward the case
   * cannot be created: POST now refuses to store what this guard would refuse
   * to read, so only rows written before today can reach it.
   */
  const rawTotal = isMoneyFigure(meta.totalFees) ? meta.totalFees : null;
  const agreed = rawTotal !== null && rawTotal > 0;

  // undefined/null means the key was never written — POST omits it entirely
  // when the lawyer typed nothing. Anything else present is a stored value, and
  // if it is not a money figure then what was paid is unknown, not zero.
  const storedPaid = meta.paidFees;
  const paidOnRecord = storedPaid !== undefined && storedPaid !== null;
  const paidFees =
    !agreed ? null
    : !paidOnRecord ? 0
    : isMoneyFigure(storedPaid) ? storedPaid
    : null;

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
    totalFees: agreed ? rawTotal : null,
    paidFees,
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
 *
 * The fee figures and the rating are validated against the very predicates the
 * GET reads them back with, and a figure that fails one is answered with a 400
 * in Arabic rather than dropped on the floor. Errors from this route are screen
 * copy: apiMutate throws `body.error` and AddClientModal renders it.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { name, phone, email, type, flags, rating, ratingChosen, totalFees, paidFees } = body as {
      name?: string;
      phone?: string;
      email?: string;
      type?: string;
      flags?: string[];
      rating?: number;
      ratingChosen?: boolean;
      totalFees?: number;
      paidFees?: number;
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "اسم الموكّل مطلوب." }, { status: 400 });
    }

    /**
     * Refuse the figures this route could not read back, instead of storing
     * them and letting readClientClassification drop them on the way out.
     *
     * Rejecting rather than quietly dropping is the whole point: a number the
     * caller sent that is silently discarded ends up in the database, on no
     * screen, with nothing said about it — the exact defect this pass closes.
     * A 400 says so. AddClientModal validates the same three rules at the point
     * of entry so the lawyer hears it there first; this is the boundary guard
     * for every other caller, since a signed-in lawyer can POST here directly.
     *
     * `flags` and `clientType` are deliberately NOT rejected: an unrecognised
     * flag is filtered on read by design (see KNOWN_FLAGS above) as defence
     * against strings from any source, and dropping one entry from a list is
     * not the same as a figure vanishing whole.
     *
     * These messages reach the lawyer's screen verbatim — apiMutate throws
     * `body.error`, and AddClientModal renders it in its red banner. Arabic.
     */
    const sent = (v: unknown) => v !== undefined && v !== null;
    if (sent(totalFees) && !isMoneyFigure(totalFees)) {
      return NextResponse.json({ error: "إجمالي الأتعاب يجب أن يكون رقمًا غير سالب." }, { status: 400 });
    }
    if (sent(paidFees) && !isMoneyFigure(paidFees)) {
      return NextResponse.json({ error: "المبلغ المقدّم يجب أن يكون رقمًا غير سالب." }, { status: 400 });
    }
    // An advance is only readable under a positive total (see `agreed` above),
    // so storing one without a total would put the lawyer's number beyond the
    // reach of every screen.
    if (sent(paidFees) && !(isMoneyFigure(totalFees) && totalFees > 0)) {
      return NextResponse.json(
        { error: "لا يمكن حفظ مبلغ مقدّم دون إجمالي أتعاب أكبر من صفر." },
        { status: 400 },
      );
    }
    if (sent(rating) && !isRatingFigure(rating)) {
      return NextResponse.json({ error: "التقييم يجب أن يكون رقمًا صحيحًا من ١ إلى ٥." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const metadata: Record<string, unknown> = { client: true };
    if (type) metadata.clientType = type;
    if (Array.isArray(flags)) metadata.flags = flags;
    /**
     * Guarded by the same predicates the reader uses, checked just above — and
     * stored only in the forms the reader can actually read back, which is this
     * route's standing rule (see the fee guard's «POST refuses to store what
     * this guard would refuse to read»).
     *
     * `ratingChosen` is CORROBORATION, not an anti-forgery token: it is a
     * caller stating that this number is a choice and not a widget default. A
     * caller that sends it is asserting exactly what the marker means, so there
     * is nothing to forge — its absence is what carries information, and the
     * absence is read as "this could be the old default".
     *
     * That distinction is not academic, because the marker must survive a
     * deploy. Six lawyers work these screens live and a tab opened before the
     * deploy keeps the old chunk — the modal opens from page state, so nothing
     * forces a fresh one. That stale modal still sends `rating: 3`
     * unconditionally. Marking every rating this route receives would stamp
     * "the lawyer chose this" onto those fabricated threes, and unlike the rows
     * this pass repairs they would be permanently unrepairable, because the
     * read guard would believe them.
     *
     * So the three cases mirror readClientClassification exactly:
     *   • corroborated → store the rating and the marker.
     *   • uncorroborated, not 3 → store the rating alone. The old modal could
     *     not produce it without a click, so the reader honours it on
     *     provenance and nothing is lost.
     *   • uncorroborated 3 → store NOTHING. It is the one value this route
     *     cannot tell apart from a default, so the reader will refuse it; also
     *     writing it would put a figure in the database that no screen can ever
     *     show, which is the defect this whole pass exists to close. The caller
     *     is not left guessing: the response below echoes what was persisted,
     *     so it comes back with `rating: null` and the saved card renders
     *     starless — the same thing the next page load will say.
     *
     * The marker goes into the same object that is inserted, so the
     * `.select(...)` below round-trips it and a genuinely rated client shows
     * their stars on the card's very first render.
     */
    if (isRatingFigure(rating)) {
      if (ratingChosen === true) {
        metadata.rating = rating;
        metadata.ratingChosen = true;
      } else if (rating !== LEGACY_UNTOUCHED_RATING) {
        metadata.rating = rating;
      }
    }
    if (isMoneyFigure(totalFees)) metadata.totalFees = totalFees;
    if (isMoneyFigure(paidFees)) metadata.paidFees = paidFees;

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
      // The message goes straight into AddClientModal's error banner, so it
      // cannot be the raw Postgres string this used to forward: that put English
      // — and the schema's internals — in front of the lawyer. Detail is logged
      // where it is useful, the same split the GET above already makes.
      console.error("[lawyer/clients POST] insert error:", error?.message, error?.details, error?.code);
      return NextResponse.json({ error: "تعذّر حفظ الموكّل." }, { status: 500 });
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
      // Echo what was actually persisted, not what was sent. Nothing the write
      // guard refuses can reach this line any more — it is a 400 above — but a
      // figure can still be stored and legitimately unreadable: a typed total
      // of 0 is kept on record and is not a fee agreement, so it must not show
      // on the new card for one render and vanish on the next page load.
      ...readClientClassification(savedMeta),
    };
    return NextResponse.json({ data: payload });
  } catch (err) {
    console.error("[lawyer/clients POST] Unexpected error:", err);
    // Also screen copy — it lands in the modal's banner like every other error
    // from this route.
    return NextResponse.json({ error: "تعذّر حفظ الموكّل." }, { status: 500 });
  }
}
