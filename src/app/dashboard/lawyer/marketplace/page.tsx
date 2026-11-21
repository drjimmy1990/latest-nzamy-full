import MyMarketplaceDashboard from "@/components/marketplace/MyMarketplaceDashboard";
import OpenRequestsList from "@/components/marketplace/OpenRequestsList";

/**
 * The lawyer's marketplace.
 *
 * l12 Q130a (owner answers of 20 Nov): the clients' market is open — the
 * open requests come FIRST, with «اطلب القبول», his asks and the requests
 * assigned to him (OpenRequestsList). Below it, the lawyer-to-lawyer
 * «سوق الإسناد» panel (shared with firm and company, MyMarketplaceDashboard)
 * stays «not available yet»: that market (offers between lawyers, payment
 * through the platform) is still parked by BETA_MONOPOLY_MODE.
 */
export default function LawyerMarketplacePage() {
  return (
    <>
      <div className="pt-6" />
      <OpenRequestsList />
      <MyMarketplaceDashboard userType="lawyer" />
    </>
  );
}
