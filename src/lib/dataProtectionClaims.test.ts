/**
 * Owner decision Q2 (2026-10-06): «يُصاغ في سياسة الخصوصية نص متوافق مع نظام حماية
 * البيانات الشخصية السعودي دون ادعاء غير متحقق».
 *
 * No page claims a PDPL certification or «full compliance», a hosting region,
 * encryption at rest, a security certificate, penetration tests or audits —
 * none of it has been verified. The privacy policy keeps a rights section and
 * says how to use it, and names encryption in transit (TLS) only.
 *
 * Source text is read with readFileSync (the pages are .tsx); comments are
 * stripped first, because the comments that explain each removal quote it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function code(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
}

const CLAIM_SURFACES = [
  "app/privacy/page.tsx",
  "app/security/page.tsx",
  "app/erp/page.tsx",
  "app/faq/page.tsx",
  "components/FAQ.tsx",
  "app/ai-disclaimer/page.tsx",
  "app/ai/disclaimer/page.tsx",
  "app/services/consultations/page.tsx",
];

const UNVERIFIED = [
  /متوافق(?:ة)?\s+(?:بالكامل\s+)?مع\s+(?:نظام\s+حماية\s+البيانات|PDPL)/,
  /PDPL\s+(?:متوافق|Compliant)|Compliant with Personal Data/i,
  /مطابقة لأنظمة حماية البيانات/,
  /سدايا.{0,20}(?:معتمد|اعتماد)|SDAIA[- ]approved/i,
  /ISO\s?27001|SOC\s?2|ZATCA Ready/i,
  /KSA Hosted|السيرفرات في المملكة|خوادم موجودة داخل المملكة|تخزين بيانات المستخدمين السعوديين داخل المملكة/,
  /تشفير(?:اً)? على مستوى (?:القرص|الأقراص)|disk-level encryption|encrypts the underlying disks|at rest/i,
  /اختبارات اختراق|penetration test|Bug Bounty/i,
];

test("Q2: no page makes an unverified data-protection claim", () => {
  for (const path of CLAIM_SURFACES) {
    const text = code(path);
    for (const re of UNVERIFIED) {
      assert.doesNotMatch(text, re, `${path}: unverified claim ${re}`);
    }
  }
});

test("Q2: the privacy policy states the data subject's rights and how to use them", () => {
  const text = code("app/privacy/page.tsx");
  for (const right of ["حق الاطلاع", "حق التصحيح", "حق الحذف", "حق الاعتراض", "حق الرجوع عن الموافقة", "كيف تقدّم طلبك"]) {
    assert.match(text, new RegExp(right), `privacy: «${right}» is missing`);
  }
  assert.match(text, /privacy@nezamy\.sa/);
  // Encryption in transit is the one encryption the policy names.
  assert.match(text, /اتصال مشفّر \(TLS\)/);
});
