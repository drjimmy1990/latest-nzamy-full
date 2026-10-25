"use client";

/**
 * useLetterhead(scope) — the issuer identity for any printout that adopts the
 * letterhead (LetterheadSheet). Reads GET /api/v1/branding once; the origin
 * for the QR is resolved in the effect (never during SSR — the page may be
 * cached, see letterheadOrigin).
 */
import { useCallback, useEffect, useState } from "react";
import type { BrandingFields, BrandingScope } from "@/lib/branding/brandingVault";
import { buildLetterheadIdentity, letterheadOrigin, type BrandingResponse, type LetterheadIdentity } from "@/lib/branding/letterheadIdentity";

export interface LetterheadData extends BrandingResponse {
  message?: string;
  saved: boolean;
  hasLogo?: boolean;
  defaults: BrandingFields;
  role: string | null;
}

export type LetterheadState =
  | { status: "loading" }
  | { status: "error"; message: string; httpStatus: number }
  | { status: "ready"; data: LetterheadData; origin: string };

export function useLetterhead(scope: BrandingScope) {
  const [state, setState] = useState<LetterheadState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/branding?scope=${scope}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", message: (body as { error?: string }).error ?? "تعذّر تحميل بيانات الهوية", httpStatus: res.status });
        return;
      }
      const origin = letterheadOrigin(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin);
      setState({ status: "ready", data: body as LetterheadData, origin });
    } catch {
      setState({ status: "error", message: "تعذّر الاتصال بالخادم", httpStatus: 0 });
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const identityFor = useCallback(
    (fields?: BrandingFields, logoUrl?: string | null): LetterheadIdentity | null => {
      if (state.status !== "ready") return null;
      return buildLetterheadIdentity(
        { ...state.data, fields: fields ?? state.data.fields, logoUrl: logoUrl === undefined ? state.data.logoUrl : logoUrl },
        state.origin,
      );
    },
    [state],
  );

  return { state, reload: load, identityFor };
}
