"use client";

/**
 * ZipDownloadButton — «تحميل الكل (ZIP)» (owner answer ٢٥٦, plan D3).
 *
 * A plain link to GET /api/v1/attachments/zip (zipHref): the browser saves the
 * streamed archive itself, so a 500 MB archive never passes through page
 * memory. Renders nothing below ZIP_MIN_FILES_FOR_BUTTON visible files. When
 * the listed sizes already break a cap it says so instead of offering a link
 * the server would refuse with 413 (the server checks again either way).
 *
 * `sizes` is one entry per file the screen lists — the SAME list the route
 * filters (live rows only), so the count here and the archive agree.
 *
 * RequestZipDownloadButton is for a screen that does not load the request's
 * attachments itself (both consultation pages): it reads them through
 * getServiceRequestDetail — the list rule the route reuses — and renders
 * nothing while loading or on any failure.
 */

import { useEffect, useState } from "react";
import { FileZip } from "@phosphor-icons/react";
import {
  checkZipCaps,
  zipHref,
  ZIP_MIN_FILES_FOR_BUTTON,
  type ZipScope,
} from "@/lib/attachmentsZipShared";
import { getServiceRequestDetail } from "@/lib/services/casesService";

export interface ZipDownloadButtonProps {
  scope: ZipScope;
  id: string;
  sizes: ReadonlyArray<number | null | undefined>;
  isDark: boolean;
  className?: string;
}

export const ZIP_BUTTON_LABEL = "تحميل الكل (ZIP)";

export default function ZipDownloadButton({ scope, id, sizes, isDark, className = "" }: ZipDownloadButtonProps) {
  if (!id || sizes.length < ZIP_MIN_FILES_FOR_BUTTON) return null;
  const caps = checkZipCaps(sizes);
  const tone = isDark
    ? "border-white/10 text-zinc-300 hover:bg-white/[0.05]"
    : "border-slate-200 text-slate-700 hover:bg-slate-50";

  if (!caps.ok) {
    return (
      <p className={`text-[11px] font-semibold ${isDark ? "text-amber-300" : "text-amber-700"} ${className}`} role="note">
        {caps.message}
      </p>
    );
  }

  return (
    <a
      href={zipHref(scope, id)}
      download
      rel="nofollow"
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${tone} ${className}`}
      title={`${sizes.length} ملفات في ملف مضغوط واحد`}
    >
      <FileZip size={14} />
      {ZIP_BUTTON_LABEL}
    </a>
  );
}

export function RequestZipDownloadButton({
  scope,
  requestId,
  isDark,
  className,
}: {
  scope: Extract<ZipScope, "case" | "request" | "consultation">;
  requestId: string | null | undefined;
  isDark: boolean;
  className?: string;
}) {
  // Keyed by the request it was read for, so a changed id shows nothing until
  // its own list arrives (never the previous request's count).
  const [loaded, setLoaded] = useState<{ requestId: string; sizes: Array<number | null> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!requestId) return;
    getServiceRequestDetail(requestId)
      .then((detail) => {
        if (!cancelled) {
          setLoaded({ requestId, sizes: (detail?.attachments ?? []).map((a) => a.file_size ?? null) });
        }
      })
      .catch(() => {
        // No button rather than a guess: the page itself reports its own read failures.
        if (!cancelled) setLoaded({ requestId, sizes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (!requestId || loaded?.requestId !== requestId) return null;
  return <ZipDownloadButton scope={scope} id={requestId} sizes={loaded.sizes} isDark={isDark} className={className} />;
}
