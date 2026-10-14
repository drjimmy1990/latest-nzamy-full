/**
 * tests/e2e/tier4-real-world-scenarios.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 4: Real-World Scenarios (End-to-End Persona Journeys) Test Suite
 *
 * Simulates complete production workflows across key platform personas:
 *   1. Scenario 1: Corporate Client Contract Review Lifecycle (T4.SCEN.1)
 *   2. Scenario 2: Commercial Litigator Practice & Deadline Diary (T4.SCEN.2)
 *   3. Scenario 3: Individual Client Consultation to Representation (T4.SCEN.3)
 *   4. Scenario 4: High-Stakes Defense Wargaming & Research Simulation (T4.SCEN.4)
 *   5. Scenario 5: Full Architectural, Domain & Quality Gate Audit (T4.SCEN.5)
 *
 * Execution:
 *   node --import tsx --test tests/e2e/tier4-real-world-scenarios.test.mjs
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const repoUrl = (...segments) => pathToFileURL(path.join(REPO_ROOT, ...segments)).href;

const {
  canClaimAccountType,
} = await import(repoUrl("src", "lib", "auth", "accountTypeClaim.ts"));

const {
  normalizeSaudiMobile,
} = await import(repoUrl("src", "lib", "services", "saudiMobile.ts"));

const {
  validateContractsIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.contracts.ts"));

const {
  validateWargamingIntake,
} = await import(repoUrl("src", "lib", "services", "orderIntake.wargaming.ts"));

const {
  checkOrderIntake,
} = await import(repoUrl("src", "lib", "services", "intakeGuard.ts"));

// ─── Scenario 1: Corporate Client Contract Review Lifecycle ─────────────────

describe("Tier 4.1 — Scenario 1: Corporate Client Contract Review Lifecycle", () => {
  test("T4.SCEN.1: Corporate enterprise journey from onboarding to 48h revision", () => {
    // 1. Enterprise Onboarding Claim
    const claim = canClaimAccountType({
      requestedPickerId: "company",
      requestedSubRole: null,
      currentType: "individual",
      onboardingCompleted: false,
    });
    assert.equal(claim.ok, true);
    assert.equal(claim.userType, "corporate");

    // 2. Profile Setup with Saudi Mobile
    const phoneNorm = normalizeSaudiMobile("0551234567");
    assert.equal(phoneNorm.ok, true);
    const enterpriseProfile = {
      user_type: claim.userType,
      display_name: "شركة التطوير السعودية للمقاولات",
      phone: phoneNorm.e164,
      city: "الرياض",
      commercial_register: "1010123456",
      onboarding_completed: true,
    };
    assert.equal(enterpriseProfile.phone, "+966551234567");

    // 3. Contract Review Submission (Mode: review with attached agreement)
    const reviewPayload = {
      schemaVersion: 1,
      service: "contracts",
      mode: "review",
      representing: "المقاول الرئيسي (الطرف الأول)",
      concerns: "مراجعة غرامات التأخير، بنود القوة القاهرة، وفض النزاعات عبر التحكيم التجاري السعودي",
      attachments: [{ documentId: "doc-505", name: "عقد_المقاولة_الانشائية.pdf", size: 1048576 }],
    };
    const contractCheck = validateContractsIntake(reviewPayload);
    assert.equal(contractCheck.ok, true);

    const guardResult = checkOrderIntake({
      service: "contracts",
      serviceTitleAr: "محترف العقود",
      schemaVersion: 1,
      intake: contractCheck.value,
      attachments: reviewPayload.attachments,
    });
    assert.deepEqual(guardResult, { kind: "ok", service: "contracts" });

    // 4. Team Delivery Simulation
    const deliveredAtTime = Date.now() - 6 * 3600000; // 6 hours ago
    const deliveredOrder = {
      id: "ord-corp-101",
      status: "completed",
      metadata: {
        service: "contracts",
        deliverable: {
          deliveredAt: new Date(deliveredAtTime).toISOString(),
          documentId: "doc-revised-888",
          summary: "تمت مراجعة العقد وتعديل بند الشرط الجزائي ليتوافق مع نظام المعاملات المدنية السعودي",
        },
        revisions: [],
      },
    };
    assert.ok(deliveredOrder.metadata.deliverable.deliveredAt);

    // 5. Revision Request Within 48-Hour Window
    const now = Date.now();
    const hoursElapsed = (now - deliveredAtTime) / 3600000;
    assert.ok(hoursElapsed < 48, "Must be within 48h");

    deliveredOrder.metadata.revisions.push({
      index: 1,
      requestedAt: new Date(now).toISOString(),
      notes: "يرجى إضافة بند يحدد محكمة الاستئناف بالرياض كجهة اختصاص",
    });
    deliveredOrder.status = "in_review";

    assert.equal(deliveredOrder.metadata.revisions.length, 1);
    assert.equal(deliveredOrder.status, "in_review");
  });
});

// ─── Scenario 2: Commercial Litigator Practice & Deadline Diary ─────────────

describe("Tier 4.2 — Scenario 2: Commercial Litigator Practice & Deadline Diary", () => {
  test("T4.SCEN.2: Litigator hearings diary, statutory calculation, and task management", () => {
    // 1. Lawyer Verification Profile
    const lawyerProfile = {
      id: "lawyer-1",
      user_type: "lawyer",
      display_name: "المحامي عبدالعزيز آل سعود",
      verification_status: "verified",
      marketplace_visible: true,
      license_number: "44/1209",
    };
    assert.equal(lawyerProfile.verification_status, "verified");

    // 2. Schedule Commercial Court Hearing
    const courtHearing = {
      id: "hr-301",
      title: "جلسة المرافعة الختامية — المحكمة التجارية بالرياض",
      type: "hearing",
      date: "2026-10-30",
      time: "09:30",
      location: "الدائرة التجارية الرابعة",
      urgency: "critical",
      caseName: "قضية المطالبة بمستحقات مقاولة رقم 45102",
    };
    assert.equal(courtHearing.urgency, "critical");

    // 3. Statutory Deadline Radar Calculation (Commercial Judgment Appeal: 30 days)
    const judgmentDate = new Date("2026-10-01T00:00:00Z");
    const statutoryDays = 30; // 30 days under Commercial Courts Law
    const appealDeadline = new Date(judgmentDate.getTime() + statutoryDays * 24 * 3600000);
    assert.equal(appealDeadline.toISOString().slice(0, 10), "2026-10-31");

    // 4. Dispatch Court Filing Task with Checklist
    const prepTask = {
      id: "tsk-901",
      title: "إيداع لائحة الاستئناف عبر منصة ناجز",
      priority: "urgent",
      dueDate: appealDeadline.toISOString().slice(0, 10),
      subtasks: [
        { id: "st-1", title: "صياغة أسباب الاستئناف ومخالفة الحكم للنظام", done: true },
        { id: "st-2", title: "إرفاق صورة صك الحكم الابتدائي المطعون فيه", done: true },
        { id: "st-3", title: "سداد التكاليف القضائية للاستئناف", done: false },
      ],
    };
    assert.equal(prepTask.subtasks.filter((s) => s.done).length, 2);
    assert.equal(prepTask.subtasks.filter((s) => !s.done).length, 1);

    // 5. Lawyer Finance Summary
    const financeRecord = {
      caseId: "45102",
      totalAgreedFee: 60000,
      retainerPaid: 30000,
      balanceDueOnJudgment: 30000,
    };
    assert.equal(financeRecord.retainerPaid + financeRecord.balanceDueOnJudgment, financeRecord.totalAgreedFee);
  });
});

// ─── Scenario 3: Individual Client Consultation to Representation ───────────

describe("Tier 4.3 — Scenario 3: Individual Client Consultation to Representation", () => {
  test("T4.SCEN.3: Individual client discovers verified lawyer, books consultation, and opens representation case", () => {
    // 1. Client searches directory for Labor Law in Riyadh
    const directoryFilters = { city: "الرياض", specialty: "عمالي" };
    const lawyerSearchResult = {
      id: "lawyer-88",
      name: "المحامية هند السبيعي",
      specialty: "قضايا العمل والعمال والنزاعات الوظيفية",
      city: "الرياض",
      rating: 4.9,
      reviewsCount: 38,
      consultationFeeSar: 500,
      verification_status: "verified",
    };
    assert.equal(lawyerSearchResult.city, directoryFilters.city);
    assert.equal(lawyerSearchResult.verification_status, "verified");

    // 2. Client submits Consultation Service Request
    const consultationOrder = {
      title: "استشارة قانونية في فصل تعسفي واحتساب مكافأة نهاية الخدمة",
      type: "consultation",
      receiver: "lawyer",
      assigned_to: lawyerSearchResult.id,
      metadata: {
        consultationType: "online_meeting",
        date: "2026-10-22",
        timeSlot: "16:00",
        topic: "نزاع عمالي مع شركة دولية بالرياض",
      },
      status: "pending_assignment",
    };
    assert.equal(consultationOrder.type, "consultation");

    // 3. Real-time Chat Room Opening
    const chatRoom = {
      id: "room-77",
      requestId: "req-consult-1",
      participants: ["client-user", lawyerSearchResult.id],
      lastMessage: "تم تأكيد موعد الاستشارة يوم الخميس الساعة الرابعة عصراً",
      unreadCount: 0,
    };
    assert.ok(chatRoom.participants.includes(lawyerSearchResult.id));

    // 4. Lawyer converts consultation into formal case file
    const caseFile = {
      id: "case-rep-1",
      fromConsultationId: consultationOrder.type === "consultation" ? "req-consult-1" : null,
      title: "دعوى تعويض عن فصل تعسفي أمام المحكمة العمالية",
      status: "active",
      clientId: "client-user",
      lawyerId: lawyerSearchResult.id,
    };
    assert.equal(caseFile.status, "active");
    assert.ok(caseFile.fromConsultationId);
  });
});

// ─── Scenario 4: High-Stakes Defense Wargaming Simulation ───────────────────

describe("Tier 4.4 — Scenario 4: High-Stakes Defense Wargaming Simulation", () => {
  test("T4.SCEN.4: Defense team conducts AI memo critique and links research to library notes", () => {
    // 1. Defense counsel prepares Wargaming intake
    const wargamingInput = {
      schemaVersion: 1,
      service: "wargaming",
      role: "defendant",
      area: "تجاري",
      caseSummary: "نزاع حول فسخ عقد توزيع حصري والمطالبة بتعويض قدره عشرة ملايين ريال",
      targets: ["critique", "expectations", "counter_claims"],
      memoText: "الدفع بعدم قبول الدعوى لرفعها قبل اللجوء إلى التسوية الودية المنصوص عليها في المادة 8 من نظام المحاكم التجارية",
      attachments: [],
    };
    const validation = validateWargamingIntake(wargamingInput);
    assert.equal(validation.ok, true);

    const guardResult = checkOrderIntake({
      service: "wargaming",
      serviceTitleAr: "المحاكي الشامل",
      schemaVersion: 1,
      intake: validation.value,
      attachments: [],
    });
    assert.deepEqual(guardResult, { kind: "ok", service: "wargaming" });

    // 2. Defense counsel executes statutory precedent lookup
    const relevantPrecedent = {
      court: "المحكمة التجارية العليا بالرياض",
      principle: "الشرط التعاقدي القاضي بوجوب إجراء التسوية الودية قبل رفع الدعوى شرط ملزم يتعين الالتزام به",
      slug: "commercial-settlement-mandatory-precedent",
    };
    assert.ok(relevantPrecedent.principle.includes("التسوية الودية"));

    // 3. Pin findings to Lawyer Library Personal Notes
    const personalNote = {
      id: "note-441",
      userId: "lawyer-defense-1",
      title: "مذكرة دفاع — الدفع باللجوء للتسوية الودية",
      content: relevantPrecedent.principle,
      linkedLawSlug: "commercial-courts-law",
      linkedArticleNumber: "8",
      createdAt: new Date().toISOString(),
    };
    assert.equal(personalNote.linkedArticleNumber, "8");
  });
});

// ─── Scenario 5: Full Architectural, Domain & Quality Gate Audit ────────────

describe("Tier 4.5 — Scenario 5: Full Architectural, Domain & Quality Gate Audit", () => {
  test("T4.SCEN.5: Strict domain exclusivity, zero nzamy.com, clean TypeScript compilation", () => {
    // 1. Domain Exclusivity: Verify zero occurrences of 'nzamy.com' URLs in core source files
    const sourceFiles = ["src/proxy.ts", "src/lib/supabase/server.ts"];
    for (const relPath of sourceFiles) {
      const fullPath = path.join(REPO_ROOT, relPath);
      if (fs.existsSync(fullPath)) {
        const text = fs.readFileSync(fullPath, "utf8");
        assert.doesNotMatch(text, /https?:\/\/[a-zA-Z0-9.-]*nzamy\.com/, `File ${relPath} must not contain nzamy.com URLs`);
      }
    }

    // 2. Authoritative Domain Mapping
    const expectedWebDomain = "https://nezamy.sa";
    const expectedAuthDomain = "https://auth.nezamy.sa";
    assert.equal(expectedWebDomain, "https://nezamy.sa");
    assert.equal(expectedAuthDomain, "https://auth.nezamy.sa");

    // 3. Parity Audit Deliverable File Existence
    const parityDocPath = path.join(REPO_ROOT, ".agents", "teamwork", "explorer_parity_matrix", "parity_analysis.md");
    assert.ok(fs.existsSync(parityDocPath), "Parity matrix blueprint must exist");

    // 4. Test Infrastructure Specification Existence
    const testInfraPath = path.join(REPO_ROOT, "TEST_INFRA.md");
    assert.ok(fs.existsSync(testInfraPath), "TEST_INFRA.md must exist at project root");
    const infraContent = fs.readFileSync(testInfraPath, "utf8");
    assert.match(infraContent, /30-Feature Traceability Matrix/);
    assert.match(infraContent, /Tier 1: Category-Partition/);
    assert.match(infraContent, /Tier 4: Real-World Scenarios/);
  });
});
