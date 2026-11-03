/**
 * /dashboard/lawyer/vault — «الخزنة القانونية» of the individual licensed
 * lawyer (owner note 09 §٤, package 2026-10-30: LIVE-F08, NOTE-09-C06).
 * A server component so the tab (?tab=documents|branding) is read here and no
 * useSearchParams needs a Suspense boundary. See
 * src/components/letterhead/LegalVaultWorkspace.tsx.
 */
import LegalVaultWorkspace from "@/components/letterhead/LegalVaultWorkspace";
import { parseVaultTab } from "@/components/letterhead/legalVaultTabs";

export const metadata = { title: "الخزنة القانونية | نظامي", robots: { index: false, follow: false } };

export default async function LawyerVaultPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  // key: a same-route visit with another ?tab (the sidebar link has none)
  // remounts the workspace, so the shown tab always follows the URL.
  return <LegalVaultWorkspace key={parseVaultTab(tab)} scope="lawyer" initialTab={tab ?? null} />;
}
