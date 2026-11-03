"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useUser } from "@/hooks/useUser";
import { formatPrintStamp, printFingerprintLines } from "./printFingerprint";

/**
 * The printed page's watermark (owner q371): the platform, the subscriber's
 * name, a short account number (the first 8 characters of the account id)
 * and the date and time of printing in Riyadh, so a leaked print can be
 * traced to its account and moment. It used to print a phone number guessed
 * from the NAME (a fixed list of family names, "0501234567" for everyone
 * else) — a real stranger's number on someone else's print. A guest gets the
 * neutral mark: the platform and the print time only.
 *
 * The time is set in the browser's `beforeprint` handler, synchronously
 * (flushSync) so the printed snapshot carries it — never during render, which
 * nginx would cache with a stale date. Lines: printFingerprint.ts.
 */
export function PrintWatermark({ isRTL }: { isRTL?: boolean }) {
  const user = useUser();
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    const takeStamp = () => flushSync(() => setStamp(formatPrintStamp(new Date())));
    window.addEventListener("beforeprint", takeStamp);
    // Browsers without beforeprint still switch the print media query.
    const printQuery = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onPrintQuery = (e: MediaQueryListEvent) => { if (e.matches) takeStamp(); };
    printQuery?.addEventListener?.("change", onPrintQuery);
    return () => {
      window.removeEventListener("beforeprint", takeStamp);
      printQuery?.removeEventListener?.("change", onPrintQuery);
    };
  }, []);

  const lines = printFingerprintLines(
    { isLoggedIn: user.isLoggedIn, fullName: user.fullName, name: user.name, userId: user.userId },
    stamp,
    !!isRTL,
  );

  return (
    <div style={{ display: 'none' }} className="print-watermark">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="print-watermark-item">
          <div>{lines.platform}</div>
          {lines.subscriber && (
            <div style={{ fontSize: '9px', marginTop: '2px' }}>{lines.subscriber}</div>
          )}
          {lines.account && (
            <div style={{ fontSize: '9px' }} dir="ltr">{lines.account}</div>
          )}
          {lines.printedAt && (
            <div style={{ fontSize: '9px' }}>{lines.printedAt}</div>
          )}
        </div>
      ))}
    </div>
  );
}
