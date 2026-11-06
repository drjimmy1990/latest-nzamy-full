import type { Metadata } from "next";
import VerifyCardView from "./VerifyCardView";

/**
 * /verify/[token] — the short card a verified, unpublished lawyer's QR opens
 * (q343). Public and never indexed. The server renders no data: the card is
 * read in the browser from a no-store route, so a cached page holds nothing.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "التحقق من بيانات المحامي | نظامي",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default async function VerifyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VerifyCardView token={token} />;
}
