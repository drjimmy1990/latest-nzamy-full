/**
 * /dashboard/firm/vault — «الخزنة القانونية» of the law firm (owner note 09
 * §٤, package 2026-10-30: LIVE-F08, NOTE-09-C06). The route rule
 * (entityRouteAccess.ts) admits the owner, the managing partner and the office
 * manager; the APIs behind it ask for the explicit permissions of
 * src/lib/branding/firmLetterheadPermissions.ts (owner ٣١٥).
 * A server component so the tab (?tab=documents|branding) is read here and no
 * useSearchParams needs a Suspense boundary.
 */
import LegalVaultWorkspace from "@/components/letterhead/LegalVaultWorkspace";

export const metadata = { title: "الخزنة القانونية | نظامي", robots: { index: false, follow: false } };

export default async function FirmVaultPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  return <LegalVaultWorkspace scope="firm" initialTab={tab ?? null} />;
}
