"use client";

/**
 * /dashboard/lawyer/letterhead — the individual licensed lawyer's official
 * letterhead (owner decision ٢٥٦). See src/components/letterhead/.
 */
import LetterheadWorkspace from "@/components/letterhead/LetterheadWorkspace";

export default function LawyerLetterheadPage() {
  return <LetterheadWorkspace scope="lawyer" />;
}
