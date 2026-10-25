"use client";

/**
 * BrandedQr — the platform's smart QR as inline SVG (owner ٢٥٦): level H,
 * royal green on white, the gold «نظامي» wordmark in a gold-ringed disc.
 * Geometry and the proof that it still scans: src/lib/qr/brandedQr.ts(+test).
 * `qrcode` is loaded only when a code is on screen.
 */
import { useEffect, useState } from "react";
import { QR_GOLD, QR_GREEN, QR_WORDMARK_SRC, brandedQrModel, type BrandedQrModel, type QrMatrix } from "@/lib/qr/brandedQr";

type QrState = { url: string; model: BrandedQrModel | null };

export default function BrandedQr({ url, size = "24mm", label }: { url: string; size?: string; label?: string }) {
  const [state, setState] = useState<QrState | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((mod) => {
        // CommonJS: the functions arrive as named exports or under `default`.
        const create = typeof mod.create === "function" ? mod.create : mod.default.create;
        const symbol = create(url, { errorCorrectionLevel: "H" });
        if (!cancelled) setState({ url, model: brandedQrModel(symbol.modules as unknown as QrMatrix) });
      })
      .catch(() => { if (!cancelled) setState({ url, model: null }); });
    return () => { cancelled = true; };
  }, [url]);

  const model = state && state.url === url ? state.model : null;
  const box = { width: size, height: size, display: "block" } as const;
  if (!model) {
    return <div style={{ ...box, border: `0.5pt dashed ${QR_GOLD}` }} aria-hidden="true" />;
  }
  const { badge, logo } = model;
  return (
    <svg
      viewBox={`0 0 ${model.viewBox} ${model.viewBox}`}
      style={box}
      role="img"
      aria-label={label ?? `رمز QR: ${url}`}
      shapeRendering="crispEdges"
    >
      <rect width={model.viewBox} height={model.viewBox} fill="#FFFFFF" />
      <path d={model.path} fill={QR_GREEN} />
      <circle
        cx={badge.cx}
        cy={badge.cy}
        r={badge.r - badge.ring / 2}
        fill="#FFFFFF"
        stroke={QR_GOLD}
        strokeWidth={badge.ring}
        shapeRendering="geometricPrecision"
      />
      <image href={QR_WORDMARK_SRC} x={logo.x} y={logo.y} width={logo.width} height={logo.height} preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}
