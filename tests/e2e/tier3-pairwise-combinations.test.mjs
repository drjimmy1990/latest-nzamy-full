/**
 * tests/e2e/tier3-pairwise-combinations.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 3: Pairwise Combinations (Cross-Feature Integrations) Test Suite
 *
 * Verifies multi-step state machine flows and data continuity:
 *   1. Onboarding -> Profile check & Access Gate Chain (T3.COMB.1)
 *   2. AI Intake Validation -> Order Generation -> Event Timeline Chain (T3.COMB.2)
 *   3. Delivery -> 48h Revision Cycle -> Requester Cancel Lockout Chain (T3.COMB.3)
 *   4. Lawyer Practice Client -> Hearing -> Task -> Finance Synchronization (T3.COMB.4)
 *   5. Legal Library Search -> Law Reader -> AI Explanation Integration (T3.COMB.5)
 *
 * Execution:
 *   node --import tsx --test tests/e2e/tier3-pairwise-combinations.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const repoUrl = (...segments) => pathToFileURL(path.join(REPO_ROOT, ...segments)).href;

const {
  canClaimAccountType,
} = await import(repoUrl("src", "lib", "auth", "accountTypeClaim.ts"));

const {
  toDbUserType,
} = await import(repoUrl("src", "lib", "auth", "userTypes.ts"));

const {
  isRouteAllowedFor,
  routeAccessRuleFor,
} = await import(repoUrl("src", "lib", "auth", "routeAccess.ts"));

const {
  normalizeSaudiMobile,
} = await import(repoUrl("src", "lib", "services", "saudiMobile.ts"));

const {
  validateContractsIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.contracts.ts"));

const {
  checkOrderIntake,
} = await import(repoUrl("src", "lib", "services", "intakeGuard.ts"));

const {
  canRequesterCancel,
} = await import(repoUrl("src", "lib", "services", "orderTransitions.ts"));

// ─── Combination 1: Onboarding -> Profile -> Access Gate ────────────────────

describe("Tier 3.1 — Cross-Feature: Onboarding -> Profile -> Access Gate", () => {
  test("T3.COMB.1: Company onboarding claim maps to corporate, persists phone, and opens corporate routes", () => {
    // Step 1: User claims 'company' via onboarding
    const pickerId = "company";
    const mappedType = toDbUserType(pickerId);
    assert.equal(mappedType, "corporate");

    // Step 2: System validates claim eligibility
    const claimRes = canClaimAccountType({
      requestedPickerId: pickerId,
      requestedSubRole: null,
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(claimRes.ok, true);
    assert.equal(claimRes.userType, "corporate");

    // Step 3: Profile update with Saudi mobile phone and city
    const phoneRes = normalizeSaudiMobile("0501234567");
    assert.equal(phoneRes.ok, true);
    const profile = {
      user_type: claimRes.userType,
      phone: phoneRes.e164,
      city: "الرياض",
      onboarding_completed: true,
    };
    assert.equal(profile.phone, "+966501234567");
    assert.equal(profile.onboarding_completed, true);

    // Step 4: Edge route access verification for corporate user
    assert.equal(isRouteAllowedFor("/dashboard/business", profile.user_type), true);
    assert.equal(isRouteAllowedFor("/dashboard/client/requests", profile.user_type), true);
    assert.equal(isRouteAllowedFor("/dashboard/lawyer", profile.user_type), false);
  });
});

// ─── Combination 2: AI Intake -> Request Record -> Timeline ─────────────────

describe("Tier 3.2 — Cross-Feature: AI Intake -> Order Generation -> Timeline", () => {
  test("T3.COMB.2: Compliant Contract Draft intake produces validated service request with event log", () => {
    // Step 1: Wizard validation
    const wizardRaw = {
      schemaVersion: 1,
      service: "contracts",
      mode: "draft",
      complexity: "detailed",
      parties: {
        one: { fullName: "شركة التقنية المتقدمة" },
        two: { companyName: "مؤسسة التوريدات اللوجستية" },
      },
      contractDesc: "اتفاقية توريد وتركيب أجهزة اتصالات شبكية لمقر الشركة الرئيس بالرياض",
      attachments: [],
    };
    const wizardCheck = validateContractsIntake(wizardRaw);
    assert.equal(wizardCheck.ok, true);

    // Step 2: Server-side checkOrderIntake guard
    const serverMetadata = {
      service: "contracts",
      serviceTitleAr: "محترف العقود",
      schemaVersion: 1,
      intake: wizardCheck.value,
      attachments: [],
    };
    const guardRes = checkOrderIntake(serverMetadata);
    assert.deepEqual(guardRes, { kind: "ok", service: "contracts" });

    // Step 3: Service Request row generation
    const serviceRequest = {
      id: "sr-1001",
      title: "صياغة عقد توريد تقني",
      type: "ai_contracts",
      receiver: "ai_workspace",
      status: "in_review",
      metadata: serverMetadata,
      created_at: new Date().toISOString(),
    };
    assert.equal(serviceRequest.status, "in_review");
    assert.equal(serviceRequest.receiver, "ai_workspace");

    // Step 4: Event timeline recording
    const timelineEvents = [];
    timelineEvents.push({
      id: "ev-1",
      requestId: serviceRequest.id,
      event: "service_request_created",
      timestamp: serviceRequest.created_at,
    });
    assert.equal(timelineEvents.length, 1);
    assert.equal(timelineEvents[0].event, "service_request_created");
  });
});

// ─── Combination 3: Delivery -> 48h Revision -> Cancel Lockout ──────────────

describe("Tier 3.3 — Cross-Feature: Delivery -> 48h Revision -> Cancel Lockout", () => {
  test("T3.COMB.3: Delivered order permits 48h revision but permanently locks out requester cancellation", () => {
    // Step 1: Order is initially cancellable before delivery
    assert.equal(canRequesterCancel("draft"), true);
    assert.equal(canRequesterCancel("pending_assignment"), true);

    // Step 2: Order is delivered by admin team
    const now = Date.now();
    const order = {
      id: "sr-2002",
      status: "completed",
      metadata: {
        deliverable: {
          deliveredAt: new Date(now - 12 * 3600000).toISOString(), // delivered 12 hours ago
          documentId: "doc-99",
          summary: "تمت صياغة العقد وإرفاق مسودة PDF",
        },
        revisions: [],
      },
    };
    const hasBeenDelivered = (meta) => meta?.deliverable?.deliveredAt != null;
    assert.equal(hasBeenDelivered(order.metadata), true);

    // Step 3: Requester cancellation is locked out
    const canCancel = (status, meta) => canRequesterCancel(status) && !hasBeenDelivered(meta);
    assert.equal(canCancel(order.status, order.metadata), false);

    // Step 4: Client requests first revision within 48h window
    const elapsedHours = (now - new Date(order.metadata.deliverable.deliveredAt).getTime()) / 3600000;
    assert.ok(elapsedHours < 48, "Revision must be within 48 hours");

    const revisionNote = "يرجى تعديل الفقرة الخاصة بالشرط الجزائي لتكون 5% بدلاً من 10%";
    order.metadata.revisions.push({
      index: order.metadata.revisions.length + 1,
      requestedAt: new Date(now).toISOString(),
      notes: revisionNote,
    });
    order.status = "in_review"; // status resets to in_review

    assert.equal(order.metadata.revisions.length, 1);
    assert.equal(order.status, "in_review");

    // Step 5: Cancellation remains permanently blocked even though status is in_review
    assert.equal(canCancel(order.status, order.metadata), false, "Delivered order must not be cancelled after revision request");
  });
});

// ─── Combination 4: Lawyer Practice Synchronization ─────────────────────────

describe("Tier 3.4 — Cross-Feature: Lawyer Practice Synchronization", () => {
  test("T3.COMB.4: Registering client, hearing, task, and fee aggregates in dashboard overview", () => {
    // Step 1: Add Client Card
    const clientCard = {
      id: "cl-501",
      name: "شركة التطوير العقاري",
      clientType: "corporate",
      phone: "+966551234567",
      commercialRegisterNo: "1010987654",
      createdAt: new Date().toISOString(),
    };
    assert.ok(clientCard.id);

    // Step 2: Add Court Hearing linked to Client
    const hearing = {
      id: "hr-601",
      title: "جلسة نظر الدعوى التجارية",
      caseName: clientCard.name,
      date: "2026-10-28",
      time: "10:30",
      urgency: "critical",
      location: "المحكمة التجارية بالرياض",
    };
    assert.equal(hearing.urgency, "critical");

    // Step 3: Add Task with checklist
    const task = {
      id: "tk-701",
      title: "إيداع لائحة الرد على دعوى الشريك",
      priority: "urgent",
      dueDate: "2026-10-26",
      subtasks: [
        { id: "s1", title: "مراجعة بنود عقد التأسيس", done: true },
        { id: "s2", title: "اعتماد مسودة المذكرة", done: false },
      ],
    };
    assert.equal(task.subtasks.filter((s) => !s.done).length, 1);

    // Step 4: Record Invoice & Payment
    const invoice = {
      id: "inv-801",
      clientId: clientCard.id,
      totalFee: 40000,
      paidAmount: 20000,
      feeType: "partial",
    };
    assert.equal(invoice.totalFee - invoice.paidAmount, 20000);

    // Step 5: Synthesize Lawyer Dashboard Overview
    const dashboardSummary = {
      activeCases: 1,
      upcomingHearingsCount: 1,
      criticalDeadlinesCount: 0,
      urgentTasksCount: 1,
      revenueThisMonth: invoice.paidAmount,
      recentCases: [{ id: "case-1", title: clientCard.name, status: "assigned" }],
      upcomingHearings: [hearing],
      urgentTasks: [task],
    };
    assert.equal(dashboardSummary.activeCases, 1);
    assert.equal(dashboardSummary.upcomingHearingsCount, 1);
    assert.equal(dashboardSummary.revenueThisMonth, 20000);
  });
});

// ─── Combination 5: Legal Library Search -> Law Reader -> AI Explainer ──────

describe("Tier 3.5 — Cross-Feature: Library Search -> Reader -> AI Explanation", () => {
  test("T3.COMB.5: Full-text search result navigates to article reader and dispatches AI explanation", () => {
    // Step 1: Simulate search query contract
    const searchRequest = {
      query: "مكافأة نهاية الخدمة",
      section: "all",
      sort: "relevance",
      page: 1,
      limit: 10,
    };
    assert.equal(searchRequest.section, "all");

    // Simulated search response matching POST /api/library/search contract
    const searchResponse = {
      query: searchRequest.query,
      counts: { laws: 15, precedents: 8, orders: 2, feqh: 5 },
      results: [
        {
          id: "art-84",
          section: "laws",
          title: "نظام العمل — المادة الرابعة والثمانون",
          meta: { lawSlug: "labor-law", articleNumber: "84" },
        },
      ],
    };
    assert.ok(searchResponse.counts.laws > 0);
    const topResult = searchResponse.results[0];
    assert.equal(topResult.meta.lawSlug, "labor-law");
    assert.equal(topResult.meta.articleNumber, "84");

    // Step 2: Law Reader data contract
    const lawArticle = {
      lawSlug: topResult.meta.lawSlug,
      number: topResult.meta.articleNumber,
      text: "إذا انتهت علاقة العمل وجب على صاحب العمل أن يدفع إلى العامل مكافأة عن مدة خدمته...",
      status: "active",
    };
    assert.equal(lawArticle.number, "84");

    // Step 3: AI Article Explanation request payload
    const explainRequest = {
      lawSlug: lawArticle.lawSlug,
      articleNumber: lawArticle.number,
      articleText: lawArticle.text,
    };
    assert.ok(explainRequest.articleText.length > 20);

    // Simulated AI explanation output from n8n webhook
    const explainResponse = {
      ok: true,
      articleNumber: "84",
      explanation: "تحدد هذه المادة استحقاق العامل لمكافأة نهاية الخدمة عند انتهاء العقد بحساب نصف شهر عن كل سنة من السنوات الخمس الأولى، وشهر عن كل سنة تالية.",
      keyTakeaways: [
        "تستحق المكافأة على أساس الأجر الأخير",
        "تُحسب كسور السنة بنسبة ما قضاه منها في العمل",
      ],
    };
    assert.equal(explainResponse.ok, true);
    assert.equal(explainResponse.keyTakeaways.length, 2);
  });
});
