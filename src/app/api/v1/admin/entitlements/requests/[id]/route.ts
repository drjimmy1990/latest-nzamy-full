import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff, type ServerTier } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { grantEntitlement, type GrantAction } from "@/lib/entitlements";
import { libraryEndsAtAr, resolveLibraryRequestGrant } from "@/lib/libraryAccess";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { libraryPurchaseEligibility } from "@/lib/library/libraryPurchaseEligibility";
import { recordNotification } from "@/lib/notify";

/**
 * PATCH /api/v1/admin/entitlements/requests/[id] — admin decides a request.
 * Body: { action: 'approve' | 'reject', grantAction?, tier?, amount?, durationDays? }
 * On approve: applies grantEntitlement (media requests → the plan tier the
 * admin picks), then marks the request approved and notifies the requester.
 *
 * A `library` request is the exception (owner answers ٢٠١–٢٠٣, 2026-10-18):
 * it grants the library only, never a plan. approveLibraryRequest (below)
 * inserts a library_access_grants row — the requested plan (lib-q1 / lib-q2 /
 * lib-annual, else lib-admin) for the admin's `durationDays` or the plan's
 * real length (90/180/365, else 90) — and writes no `subscriptions` row. A
 * library grant is its own row and cancels nothing, so the no-downgrade
 * discussion below does not apply to it. A new grant EXTENDS the requester's
 * current access, so the arm CLAIMS the request first (pending → approved,
 * conditionally): two concurrent approvals of one request cannot both add
 * the full length. If the grant then fails (for instance 20261019_10 has not
 * run yet) the claim is undone and the answer is a 400 in Arabic; it never
 * falls back to granting a plan.
 *
 * This route deliberately does NOT pass `replaceActive` (review 2026-09-21
 * A3/C01 follow-up). POST /api/v1/admin/entitlements/grant does, because
 * granting `free` there is the only revoke an admin has — but nobody submits a
 * REQUEST asking to be moved down, so here the override would buy nothing and
 * cost something concrete: src/app/dashboard/admin/entitlements/requests/page.tsx
 * sends `tier: tierFor[row.id] ?? "pro"` for plan and media rows, and its
 * selector shows "pro" until the admin touches it, so approving a max/corp
 * holder's media request without changing the dropdown would cancel that
 * subscription and insert a 30-day pro.
 *
 * Without the override grantEntitlement declines that write and reports
 * `alreadyEntitled`, and the approve arm below tells the two outcomes apart:
 * the request is still marked approved (the admin decided, and the account
 * already holds what was asked for or better, so there is nothing left to do),
 * but the requester is told exactly that instead of «تم تفعيل ما طلبته على
 * حسابك», and the response carries `alreadyEntitled` so the console can say so
 * too once its page reads the body. The admin's own toast already reads «تمت
 * الموافقة» — the approval, not an activation — so it stays true either way.
 *
 * Owner answer ٢١٠: deciding a request needs a staff role with
 * entitlements.decide, and each decision is audited once, after its write.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireStaff("entitlements.decide");
  if (!gate.ok) return gate.response;

  let body: {
    action?: "approve" | "reject";
    grantAction?: GrantAction;
    tier?: string;
    amount?: number;
    durationDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const admin = await createServiceClient();
  const { data: reqRow, error: fetchErr } = await admin
    .from("entitlement_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!reqRow) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  const requesterId = reqRow.user_id as string;
  const nowIso = new Date().toISOString();

  // ── Reject ─────────────────────────────────────────────────────────────────
  if (body.action === "reject") {
    const { error } = await admin
      .from("entitlement_requests")
      .update({ status: "rejected", decided_by: gate.userId, decided_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAction({
      actorId: gate.userId,
      action: "entitlement_request_rejected",
      targetType: "entitlement_request",
      targetId: id,
      before: { status: "pending" },
      after: { status: "rejected" },
      metadata: { kind: reqRow.kind ?? null, user_id: requesterId },
    });
    await recordNotification({
      userId: requesterId,
      title: "تم رفض طلبك",
      body: "نعتذر، لم تتم الموافقة على طلبك في الوقت الحالي.",
      href: "/dashboard",
    });
    return NextResponse.json({ success: true, data: { status: "rejected" } });
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  if (body.action === "approve") {
    const kind = reqRow.kind as string;

    // A library request grants the library only, through its own arm — it
    // must never reach grantEntitlement, which writes `subscriptions`.
    if (kind === "library") {
      return approveLibraryRequest({
        admin,
        id,
        requestedRef: reqRow.requested_ref,
        requesterId,
        adminId: gate.userId,
        durationDays: body.durationDays,
        nowIso,
      });
    }

    // Map the request kind → a concrete grant action. media → plan.
    const grantAction: GrantAction =
      body.grantAction ??
      (kind === "credits" ? "credits" : kind === "wallet" ? "wallet" : "plan");

    const reqAmount =
      reqRow.amount == null ? undefined : Number(reqRow.amount);

    const result = await grantEntitlement({
      userId: requesterId,
      action: grantAction,
      tier: body.tier as ServerTier | undefined,
      amount: typeof body.amount === "number" ? body.amount : reqAmount,
      durationDays: body.durationDays,
      actorId: gate.userId,
      // No `replaceActive` — see the header. An approval must never move a
      // requester DOWN; grantEntitlement declines instead and says so.
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    const { error } = await admin
      .from("entitlement_requests")
      .update({ status: "approved", decided_by: gate.userId, decided_at: nowIso })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction({
      actorId: gate.userId,
      action: "entitlement_request_approved",
      targetType: "entitlement_request",
      targetId: id,
      before: { status: "pending" },
      after: { status: "approved", grantAction, tier: body.tier ?? null, alreadyEntitled: result.alreadyEntitled === true },
      metadata: { kind, user_id: requesterId },
    });

    // Nothing was written when the account already holds an equal-or-better
    // plan: the approval stands, but the requester must NOT be told a
    // subscription was activated.
    const alreadyEntitled = result.alreadyEntitled === true;
    const noticeBody = alreadyEntitled
      ? "حسابك يحمل بالفعل هذه الباقة أو أعلى منها، فلم نغيّر اشتراكك الحالي."
      : "تم تفعيل ما طلبته على حسابك.";

    await recordNotification({
      userId: requesterId,
      title: "تمت الموافقة على طلبك",
      body: noticeBody,
      href: "/dashboard",
    });

    return NextResponse.json({
      success: true,
      data: { status: "approved", alreadyEntitled, grant: result },
    });
  }

  return NextResponse.json(
    { error: "action يجب أن يكون approve أو reject" },
    { status: 400 },
  );
}

/**
 * Approves a `library` request (owner ٢٠١–٢٠٣): one library_access_grants row,
 * source 'request', granted by the deciding admin. The order is validate →
 * claim → grant → notify:
 *   - the claim is a conditional update (pending → approved) that reports the
 *     rows it took, so of two concurrent approvals only one reaches the grant
 *     — grants extend each other, and a second one would add the full length
 *     again;
 *   - a failed grant undoes the claim (back to pending, decider cleared), so
 *     the request returns to the queue;
 *   - the requester is notified only after a successful grant.
 */
async function approveLibraryRequest(input: {
  admin: Awaited<ReturnType<typeof createServiceClient>>;
  id: string;
  requestedRef: unknown;
  requesterId: string;
  adminId: string;
  durationDays: unknown;
  nowIso: string;
}) {
  const { admin, id, requestedRef, requesterId, adminId, durationDays, nowIso } = input;

  const plan = resolveLibraryRequestGrant(requestedRef, durationDays);
  if (!plan.ok) {
    return NextResponse.json(
      { error: "مدة الاشتراك يجب أن تكون عدداً صحيحاً من يوم واحد إلى ٣٦٦٠ يوماً" },
      { status: 400 },
    );
  }

  // LIVE-F05 (owner: the library is sold to legal professionals only). A
  // library request is the gateway-off way to BUY a plan (owner ٢٤٦), so the
  // server refuses to approve one from an ineligible account — hiding the
  // button on /laws/subscribe is not enough, a session can insert a request
  // directly. Fail closed: an unreadable profile is refused too. The admin
  // rejects the request instead; a deliberate exception is the direct grant
  // (POST /api/v1/admin/entitlements/grant, action library, reason required).
  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", requesterId)
    .maybeSingle();
  if (requesterError) {
    console.error("[admin/entitlements/requests] reading the requester's account type failed:", requesterError.code);
    return NextResponse.json({ error: "تعذّر التحقق من نوع حساب صاحب الطلب. حاول مرة أخرى." }, { status: 500 });
  }
  const eligibility = libraryPurchaseEligibility((requester as { user_type?: unknown } | null)?.user_type);
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error:
          "لا يمكن اعتماد هذا الطلب: اشتراك المكتبة يُباع للمحامين والمستشارين ومكاتب المحاماة والإدارات القانونية فقط، وصاحب الطلب ليس منهم. ارفض الطلب، أو امنحه منحة إدارية مسببة إن كان استثناءً مقصوداً.",
        code: "library_not_eligible",
        reason: eligibility.reason,
      },
      { status: 409 },
    );
  }

  const { data: claimed, error: claimError } = await admin
    .from("entitlement_requests")
    .update({ status: "approved", decided_by: adminId, decided_at: nowIso })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (claimError) {
    console.error("[admin/entitlements/requests] library request claim failed:", claimError.code, claimError.message);
    return NextResponse.json({ error: "تعذّر اعتماد الطلب. حاول مرة أخرى." }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    // Another approval (or a rejection) decided it after the pending check.
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  const grant = await grantLibraryAccess({
    userId: requesterId,
    planRef: plan.planRef,
    days: plan.days,
    source: "request",
    grantedBy: adminId,
  });
  if (!grant.ok) {
    // grant.error is English or raw Postgres: logged here, never sent.
    console.error("[admin/entitlements/requests] library grant failed:", grant.error);
    const { error: revertError } = await admin
      .from("entitlement_requests")
      .update({ status: "pending", decided_by: null, decided_at: null })
      .eq("id", id)
      .eq("status", "approved");
    if (revertError) {
      console.error(
        "[admin/entitlements/requests] library grant failed AND the request could not be put back to pending:",
        revertError.code,
        revertError.message,
      );
      return NextResponse.json(
        { error: "تعذّر تفعيل اشتراك المكتبة، وتعذّرت إعادة الطلب إلى قيد المراجعة. راجع حالته قبل أي إجراء." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "تعذّر تفعيل اشتراك المكتبة، وبقي الطلب قيد المراجعة. حاول مرة أخرى لاحقاً." },
      { status: 400 },
    );
  }

  await logAdminAction({
    actorId: adminId,
    action: "entitlement_request_approved",
    targetType: "entitlement_request",
    targetId: id,
    before: { status: "pending" },
    after: { status: "approved", planRef: plan.planRef, days: plan.days, endsAt: grant.endsAt },
    metadata: { kind: "library", user_id: requesterId },
  });

  const untilAr = libraryEndsAtAr(grant.endsAt);
  await recordNotification({
    userId: requesterId,
    title: "تمت الموافقة على طلبك",
    body: untilAr
      ? `تم تفعيل اشتراك المكتبة القانونية حتى ${untilAr}.`
      : "تم تفعيل اشتراك المكتبة القانونية.",
    href: "/laws",
  });

  return NextResponse.json({
    success: true,
    data: {
      status: "approved",
      alreadyEntitled: false,
      grant: { planRef: plan.planRef, days: plan.days, endsAt: grant.endsAt },
    },
  });
}
