/**
 * /dashboard/firm/fees — «الأتعاب» of the firm (file 15 row 49, batch l9;
 * O23, batch l11).
 *
 * It was a static page (invented statements, totals and payment methods under
 * an «unfinished» note). The fee statements are built for lawyers — VAT 15% for
 * a VAT-registered issuer and 0% with a notice otherwise, print on the
 * letterhead (PDF), send and void (/api/v1/lawyer/finance/*, assertRole lawyer
 * + firm) — so the firm gets that same page for the statements the signed-in
 * account issued itself.
 *
 * O23 (batch l11): above it, «كشوف أتعاب أعضاء المكتب» — every statement a
 * member of this firm issued (payments.firm_id), read-only, for the firm owner,
 * the managing partner and the finance manager (20261201_40). Anyone else gets
 * no panel (the route answers 403) and keeps his own statements below.
 * The previous static page is preserved in git history.
 */
"use client";

import LawyerFinancePage from "../../lawyer/finance/page";
import FirmMemberStatements from "./_components/FirmMemberStatements";

export default function FirmFeesPage() {
  return (
    <>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8">
        <FirmMemberStatements />
      </div>
      <LawyerFinancePage />
    </>
  );
}
