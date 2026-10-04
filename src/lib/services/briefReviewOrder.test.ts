import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_REVIEW_SERVICE,
  BRIEF_REVIEW_TITLE_AR,
  BRIEF_CLIENT_ROLES,
  BRIEF_REVIEW_SCOPES,
  MAX_NOTES_LENGTH,
  briefReviewSubmitErrorAr,
  buildBriefReviewOrderBody,
  isBriefReviewOrder,
  memoFileRejection,
  validateBriefReviewForm,
  type BriefReviewForm,
} from "./briefReviewOrder.ts";
// The two server-side checks POST /api/v1/service-requests runs before it
// inserts (route.ts:275 and :334). Running the built body through them here is
// the proof the route accepts it — not an argument that it should.
import { validateServiceRequestCreate } from "./serviceRequestIntake.ts";
import { checkOrderIntake } from "./intakeGuard.ts";

const MEMO = { documentId: "4521", name: "مذكرة الرد.docx", size: 48_000 };

function form(overrides: Partial<BriefReviewForm> = {}): BriefReviewForm {
  return {
    memo: MEMO,
    clientRole: "appellant",
    clientRoleOther: "",
    reviewScope: "gaps_report",
    courtType: "",
    caseType: "",
    notes: "",
    ...overrides,
  };
}

function okValue(f: BriefReviewForm) {
  const check = validateBriefReviewForm(f);
  assert.equal(check.ok, true, check.ok ? "" : check.errors.join(" | "));
  if (!check.ok) throw new Error("unreachable");
  return check.value;
}

// ─── validation ──────────────────────────────────────────────────────────────

test("a complete form validates and stores Arabic values, never machine ids", () => {
  const v = okValue(form({ courtType: "محكمة الاستئناف بالرياض", caseType: "تجاري", notes: "ركّزوا على الدفع الثالث" }));
  assert.deepEqual(v.intake, {
    schemaVersion: 1,
    service: "brief_review",
    clientRole: "مستأنِف",
    reviewScope: "تقرير بالثغرات في الأسانيد والتسلسل والدفوع والطلبات والوقائع",
    courtType: "محكمة الاستئناف بالرياض",
    caseType: "تجاري",
    notes: "ركّزوا على الدفع الثالث",
  });
  assert.deepEqual(v.memo, MEMO);
  assert.equal(v.scopeId, "gaps_report");
});

test("empty optional fields are left out of the intake, not stored as empty strings", () => {
  const v = okValue(form({ courtType: "   ", notes: "" }));
  assert.equal("courtType" in v.intake, false);
  assert.equal("caseType" in v.intake, false);
  assert.equal("notes" in v.intake, false);
});

test("every client role resolves to its Arabic label", () => {
  for (const r of BRIEF_CLIENT_ROLES) {
    if (r.id === "other") continue;
    assert.equal(okValue(form({ clientRole: r.id })).intake.clientRole, r.label);
  }
});

test("«أخرى» folds the typed capacity into the one stored value", () => {
  assert.equal(
    okValue(form({ clientRole: "other", clientRoleOther: "  وكيل تفليسة " })).intake.clientRole,
    "أخرى — وكيل تفليسة",
  );
  const blank = validateBriefReviewForm(form({ clientRole: "other", clientRoleOther: " " }));
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.ok(blank.errors.includes("اكتب صفة الموكل"));
});

test("both review scopes are accepted and stored as their full Arabic wording", () => {
  for (const s of BRIEF_REVIEW_SCOPES) {
    const v = okValue(form({ reviewScope: s.id }));
    assert.equal(v.intake.reviewScope, s.label);
    assert.equal(v.scopeId, s.id);
  }
});

test("missing memo, role and scope are each reported in Arabic", () => {
  const check = validateBriefReviewForm(form({ memo: null, clientRole: "", reviewScope: "" }));
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.deepEqual(check.errors, [
    "ارفع المذكرة المراد مراجعتها",
    "حدّد صفة الموكل",
    "اختر المطلوب: تقرير بالثغرات أو تنقيح كامل",
  ]);
});

test("a memo without a server-side id (upload never finished) is refused", () => {
  const check = validateBriefReviewForm(form({ memo: { documentId: "", name: "a.pdf", size: 1 } }));
  assert.equal(check.ok, false);
});

test("a numeric documentId (bigserial via PostgREST) is accepted and coerced to a string", () => {
  const memo = { documentId: 77 as unknown as string, name: "a.pdf", size: 10 };
  assert.equal(okValue(form({ memo })).memo.documentId, "77");
});

test("only PDF and Word files count as a memo", () => {
  assert.equal(memoFileRejection("مذكرة.PDF"), null);
  assert.equal(memoFileRejection("x.docx"), null);
  assert.equal(memoFileRejection("x.doc"), null);
  assert.notEqual(memoFileRejection("صورة.jpg"), null);
  assert.notEqual(memoFileRejection("noext"), null);
  const check = validateBriefReviewForm(form({ memo: { documentId: "9", name: "scan.png", size: 5 } }));
  assert.equal(check.ok, false);
});

test("over-long notes are refused rather than truncated", () => {
  const check = validateBriefReviewForm(form({ notes: "ن".repeat(MAX_NOTES_LENGTH + 1) }));
  assert.equal(check.ok, false);
});

// ─── the POST body, and the route's own checks on it ─────────────────────────

test("the body is a team order in the ai_workspace queue, free, pending assignment", () => {
  const body = buildBriefReviewOrderBody(okValue(form({ reviewScope: "full_revision" })), {
    name: "أ. سارة", phone: "0500000000", email: undefined,
  });
  assert.equal(body.type, "ai_draft");
  assert.equal(body.receiver, "ai_workspace");
  assert.equal(body.status, "pending_assignment");
  assert.equal(body.sourcePath, "/ai/brief-check");
  assert.deepEqual(body.payment, { amount: 0, status: "not_required" });
  assert.deepEqual(body.requester, { name: "أ. سارة", phone: "0500000000" });
  // The service name is NOT repeated in the title — orderPrompt.ts heads the
  // brief with `${serviceTitleAr} — ${title}`.
  assert.equal(body.title, "تنقيح المذكرة كاملة");
  assert.ok(!body.title.includes(BRIEF_REVIEW_TITLE_AR));
  assert.equal(
    buildBriefReviewOrderBody(okValue(form({ caseType: "عمالي" })), {}).title,
    "تقرير بثغرات المذكرة — عمالي",
  );
  assert.equal(body.metadata.service, BRIEF_REVIEW_SERVICE);
  assert.equal(body.metadata.serviceTitleAr, "مراجعة وتدقيق مذكرة");
  assert.deepEqual(body.metadata.attachments, [MEMO]);
  assert.match(body.description, /^المطلوب: مراجعة المذكرة وتنقيحها كاملة\nصفة الموكل: مستأنِف$/);
});

test("the route's shape contract accepts the body (serviceRequestIntake.ts)", () => {
  const body = buildBriefReviewOrderBody(
    okValue(form({ notes: "ن".repeat(MAX_NOTES_LENGTH), courtType: "م".repeat(150), caseType: "ق".repeat(150), clientRole: "other", clientRoleOther: "ص".repeat(100) })),
    {},
  );
  const shape = validateServiceRequestCreate(body);
  assert.equal(shape.ok, true, shape.ok ? "" : shape.error);
  if (!shape.ok) return;
  assert.equal(shape.value.type, "ai_draft");
  assert.equal(shape.value.receiver, "ai_workspace");
  assert.ok(shape.value.title.length >= 1 && shape.value.title.length <= 200);
});

test("the route's intake guard checks the body and accepts it (brief_review has its own server check)", () => {
  const body = buildBriefReviewOrderBody(okValue(form()), {});
  assert.deepEqual(checkOrderIntake(body.metadata), { kind: "ok", service: "brief_review" });
});

// ─── reading orders back ─────────────────────────────────────────────────────

test("isBriefReviewOrder reads metadata.service and nothing else", () => {
  assert.equal(isBriefReviewOrder({ service: "brief_review" }), true);
  assert.equal(isBriefReviewOrder({ service: "draft" }), false);
  assert.equal(isBriefReviewOrder(undefined), false);
  assert.equal(isBriefReviewOrder(null), false);
  assert.equal(isBriefReviewOrder("brief_review"), false);
});

test("submit errors: Arabic passes through, English never reaches the screen", () => {
  assert.equal(briefReviewSubmitErrorAr("عنوان الطلب مطلوب."), "عنوان الطلب مطلوب.");
  assert.match(briefReviewSubmitErrorAr("Unauthorized"), /انتهت جلستك/);
  assert.equal(
    briefReviewSubmitErrorAr('new row violates check constraint "service_requests_type_check"'),
    "تعذّر إرسال الطلب — حاول مجدداً",
  );
});

// ─── server-side check (intakeGuard → validateBriefReviewMetadata) ─────────

test("the guard accepts the body the page builds, and refuses a direct POST without a memo, a scope or an intake", () => {
  const body = buildBriefReviewOrderBody(okValue(form()), {});
  assert.deepEqual(checkOrderIntake(body.metadata), { kind: "ok", service: BRIEF_REVIEW_SERVICE });

  const noMemo = { ...body.metadata, attachments: [] };
  const r1 = checkOrderIntake(noMemo);
  assert.equal(r1.kind, "invalid");
  assert.ok(r1.kind === "invalid" && r1.errors.includes("ارفع المذكرة المراد مراجعتها"));

  const badScope = { ...body.metadata, intake: { ...body.metadata.intake, reviewScope: "أي شيء" } };
  assert.equal(checkOrderIntake(badScope).kind, "invalid");

  const noRole = { ...body.metadata, intake: { ...body.metadata.intake, clientRole: "  " } };
  assert.equal(checkOrderIntake(noRole).kind, "invalid");

  // Naming the service without any intake is not a pass-through for this order.
  assert.equal(checkOrderIntake({ service: "brief_review" }).kind, "invalid");
  // Orders that are not memo reviews still pass untouched.
  assert.deepEqual(checkOrderIntake({ service: "something_else", intake: { service: "something_else" } }), { kind: "pass" });
});
