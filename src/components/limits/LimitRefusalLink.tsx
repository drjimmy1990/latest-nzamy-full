import Link from "next/link";
import { limitLinkForMessage } from "@/lib/api/dbErrorCore";

/**
 * S9 / firm seat cap (20261126_50): beside an error message, the real link
 * the refusal points at — «ترقية الباقة» (/pricing) for a free solo lawyer's
 * limit, «لزيادة المقاعد تواصل معنا» (/contact?type=firm-seats) for a full
 * firm. Renders nothing for any other message.
 */
export default function LimitRefusalLink({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  const link = limitLinkForMessage(message);
  if (!link) return null;
  return (
    <Link href={link.href} className={`inline-block font-bold underline underline-offset-2 ${className}`}>
      {link.label}
    </Link>
  );
}
