"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/firm/wallet — «محفظة المكتب».
 *
 * The page was four invented transactions (a 15,000 ر.س client payment, a
 * 25,000 ر.س bank withdrawal «معلق», a 50,000 ر.س top-up), balances computed
 * from them, and deposit/withdraw buttons wired to nothing. No firm wallet,
 * payout or bank-transfer table exists, and fees are paid outside the platform
 * (owner Q3/Q28), so there is nothing real to show yet (N7, fix plan
 * 2026-10-16). /api/v1/wallet is the personal rewards wallet («محفظتي»), not a
 * firm ledger.
 */
export default function FirmWalletPage() {
  return <DashboardComingSoon title="محفظة المكتب" backHref="/dashboard/firm" />;
}
