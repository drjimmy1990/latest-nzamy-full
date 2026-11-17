"use client";

import { windowLineAr } from "@/lib/founder/founderWindow";
import { FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE, FOUNDER_FALLBACK_STARTS_AT } from "@/lib/founder/landingCopy";
import { useFounderWindow } from "./FounderWindowProvider";

/** «النافذة: من … حتى … (شهر واحد فقط) أو اكتمال المقاعد.» — the server's dates when it sent them. */
export function WindowLine({ className }: { className?: string }) {
  const { read } = useFounderWindow();
  // No campaign configured: no dates to promise (the button says so).
  if (read?.kind === "unconfigured") return null;
  const line =
    read?.kind === "window"
      ? windowLineAr(read.startsAtMs, read.endsAtMs)
      : windowLineAr(Date.parse(FOUNDER_FALLBACK_STARTS_AT), Date.parse(FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE));
  // Intl output may differ by a bidi mark between the server and the browser.
  return (
    <p className={className} suppressHydrationWarning>
      {line}
    </p>
  );
}
