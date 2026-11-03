/**
 * legalVaultTabs.ts — the legal vault's two tabs and their URLs (owner note 09
 * §٤, package 2026-10-30, NOTE-09-C06). Pure, so legalVault.test.ts pins the
 * redirect target of the old letterhead pages and the default tab.
 */
export type VaultTab = "documents" | "branding";
export const VAULT_TABS: readonly VaultTab[] = ["documents", "branding"];

/** Anything but a known tab opens «المستندات», the first tab in the owner's order. */
export function parseVaultTab(value: string | string[] | null | undefined): VaultTab {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "branding" ? "branding" : "documents";
}

export function vaultHref(scope: "lawyer" | "firm", tab: VaultTab): string {
  return `/dashboard/${scope}/vault?tab=${tab}`;
}

/** Where /dashboard/{lawyer,firm}/letterhead now goes (permanent). */
export const LETTERHEAD_REDIRECT = {
  lawyer: vaultHref("lawyer", "branding"),
  firm: vaultHref("firm", "branding"),
} as const;
