"use client";

/**
 * /dashboard/firm/letterhead — the law firm's official letterhead (owner
 * decision ٢٥٦), managed by the owner, the managing partner or the office
 * admin (FIRM_ROUTE_RULES, and the same rule in the API and the database).
 */
import LetterheadWorkspace from "@/components/letterhead/LetterheadWorkspace";

export default function FirmLetterheadPage() {
  return <LetterheadWorkspace scope="firm" />;
}
