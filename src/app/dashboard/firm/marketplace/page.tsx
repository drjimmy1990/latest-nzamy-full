import MyMarketplaceDashboard from "@/components/marketplace/MyMarketplaceDashboard";
import OpenRequestsList from "@/components/marketplace/OpenRequestsList";

/**
 * The firm's marketplace. Owner answer ٢٣٨ (27 Nov 2026, batch l18): the
 * market is open and in every role's menu, so the firm's page shows the open
 * requests first, as the lawyer's does (OpenRequestsList). l18 review: the
 * owner of a VERIFIED firm reads the list (20261208_90); «اطلب القبول» stays
 * a verified lawyer's own act, so the firm reads it without the button and
 * is told so; an unverified firm reads «بعد اعتماد توثيق مكتبك». Nezamy's priority window stays in the
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
