"use client";

import { useUser } from "@/hooks/useUser";

/**
 * The printed page's watermark: the platform, the subscriber's name and a
 * short account number (the first 8 characters of the account id), so a
 * leaked print can be traced to its account. It used to print a phone number
 * guessed from the NAME (a fixed list of family names, "0501234567" for
 * everyone else) — a real stranger's number on someone else's print. What the
 * mark should carry beyond this is owner question ١١ of the library fortress.
 */
export function watermarkAccountRef(userId: string | undefined): string | null {
  if (!userId) return null;
  const ref = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return ref.length === 8 ? ref : null;
}

export function PrintWatermark({ isRTL }: { isRTL?: boolean }) {
  const user = useUser();
  const accountRef = watermarkAccountRef(user.userId);
  const displayName = user.name || (isRTL ? "عضو نظامي" : "Nezamy Member");

  return (
    <div style={{ display: 'none' }} className="print-watermark">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="print-watermark-item">
          <div>نظامي - Nezamy</div>
          <div style={{ fontSize: '9px', marginTop: '2px' }}>
            {isRTL ? `المشترك: ${displayName}` : `Subscriber: ${displayName}`}
          </div>
          {accountRef && (
            <div style={{ fontSize: '9px' }} dir="ltr">
              {isRTL ? `حساب ${accountRef}` : `Account ${accountRef}`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

