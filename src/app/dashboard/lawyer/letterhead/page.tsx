/**
 * /dashboard/lawyer/letterhead — moved INTO the legal vault (owner note 09 §٤,
 * package 2026-10-30, NOTE-09-C06: «تحويل الرابط القديم تلقائياً إلى
 * /dashboard/<النطاق>/vault?tab=branding حتى لا ينكسر أي رابط سابق»). A permanent
 * (308) page-level redirect, so next.config.ts stays untouched.
 */
import { permanentRedirect } from "next/navigation";
import { LETTERHEAD_REDIRECT } from "@/components/letterhead/legalVaultTabs";

export default function LawyerLetterheadRedirect(): never {
  permanentRedirect(LETTERHEAD_REDIRECT.lawyer);
}
