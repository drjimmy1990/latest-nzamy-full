import MyMarketplaceDashboard from "@/components/marketplace/MyMarketplaceDashboard";
import OpenRequestsList from "@/components/marketplace/OpenRequestsList";

/**
 * The firm's marketplace. Owner answer ٢٣٨ (27 Nov 2026, batch l18): the
 * market is open and in every role's menu, so the firm's page shows the open
 * requests first, as the lawyer's does (OpenRequestsList — the list and «اطلب
 * القبول» are for a verified lawyer's own account; anyone else reads the
 * honest «للمحامين الموثَّقين فقط» line). Nezamy's priority window stays in the
 * database (20261206_40). The lawyer-to-lawyer «سوق الإسناد» panel below is
 * still not available.
 */
export default function FirmMarketplacePage() {
  return (
    <>
      <div className="pt-6" />
      <OpenRequestsList />
      <MyMarketplaceDashboard userType="firm" />
    </>
  );
}
