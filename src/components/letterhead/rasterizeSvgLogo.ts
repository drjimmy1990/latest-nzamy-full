/**
 * rasterizeSvgLogo — q346, browser only: an uploaded SVG logo becomes the PNG
 * that is actually sent. Vetted first (svgLogoRejectReason), then drawn from a
 * blob: URL through an <img>, which runs no script and fetches nothing. Every
 * refusal is an Error whose message is the Arabic line to show.
 */
import { BRANDING_LOGO_MAX_BYTES } from "@/lib/branding/brandingVault";
import { rasterSize, svgForRaster, svgIntrinsicSize, svgLogoRejectReason, SVG_LOGO_MAX_BYTES } from "@/lib/branding/svgLogo";

const DRAW_FAILED = "تعذّر تحويل الشعار؛ ارفعه بصيغة PNG";
const STILL_TOO_BIG = "الشعار أكبر من ١ ميجابايت بعد التحويل";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(DRAW_FAILED));
    img.src = url;
  });
}

async function draw(text: string, maxSide: number): Promise<Blob> {
  const intrinsic = svgIntrinsicSize(text);
  const target = intrinsic ? rasterSize(intrinsic.width, intrinsic.height, maxSide) : null;
  const source = intrinsic && target ? svgForRaster(text, target, intrinsic) : text;
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const size = target ?? rasterSize(img.naturalWidth, img.naturalHeight, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(DRAW_FAILED);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    // toBlob throws a SecurityError on a tainted canvas.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(DRAW_FAILED);
    return blob;
  } catch {
    throw new Error(DRAW_FAILED);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function rasterizeSvgLogo(file: File): Promise<Blob> {
  if (file.size > SVG_LOGO_MAX_BYTES) throw new Error("حجم ملف SVG أكبر من ٥٠٠ ك.ب");
  const text = await file.text();
  const reason = svgLogoRejectReason(text);
  if (reason) throw new Error(reason);
  const first = await draw(text, 1600);
  if (first.size <= BRANDING_LOGO_MAX_BYTES) return first;
  const second = await draw(text, 1000);
  if (second.size <= BRANDING_LOGO_MAX_BYTES) return second;
  throw new Error(STILL_TOO_BIG);
}
