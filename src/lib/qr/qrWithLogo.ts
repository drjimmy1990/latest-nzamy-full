/**
 * The Nezamy QR: the code with the brand's Arabic calligraphic logo at its
 * centre (owner answer ١٩٥, 2026-10-16) — «الشعار العربي الأصيل لنظامي بالخط
 * العربي الفاخر» in the identity colours (royal green and gold), never the ⚖️
 * emoji.
 *
 * The logo is public/logo.png (the gold «نظامي» wordmark the site header
 * shows), drawn on a royal-green tile with a white quiet ring. The tile covers
 * LOGO_FRACTION of the width — about 5% of the area — and callers draw the
 * code at error-correction level H (≈30% recoverable), so it still scans.
 * If the logo cannot load, the plain code is returned: still a valid code.
 *
 * Browser only (Image + canvas). The geometry is a pure function, tested in
 * qrWithLogo.test.ts.
 */

export const QR_LOGO_SRC = "/logo.png";
export const QR_ROYAL_GREEN = "#0B3D2E";
/** Share of the code's width the logo tile covers. */
export const LOGO_FRACTION = 0.22;

export interface LogoBox {
  /** The white ring around the tile. */
  ring: { x: number; y: number; size: number; radius: number };
  /** The royal-green tile. */
  tile: { x: number; y: number; size: number; radius: number };
  /** The logo, fitted inside the tile at its own aspect ratio. */
  logo: { x: number; y: number; width: number; height: number };
}

/** Where the ring, the tile and the logo go on a `size`×`size` code. */
export function logoBox(size: number, logoWidth: number, logoHeight: number): LogoBox {
  const tileSize = Math.round(size * LOGO_FRACTION);
  const ringPad = Math.max(2, Math.round(size * 0.012));
  const tileX = Math.round((size - tileSize) / 2);
  const inner = tileSize * 0.72;
  const ratio = logoWidth > 0 && logoHeight > 0 ? logoWidth / logoHeight : 1;
  const width = ratio >= 1 ? inner : inner * ratio;
  const height = ratio >= 1 ? inner / ratio : inner;
  return {
    ring: { x: tileX - ringPad, y: tileX - ringPad, size: tileSize + ringPad * 2, radius: Math.round(tileSize * 0.2) },
    tile: { x: tileX, y: tileX, size: tileSize, radius: Math.round(tileSize * 0.16) },
    logo: { x: (size - width) / 2, y: (size - height) / 2, width, height },
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 40)}`));
    img.src = src;
  });
}

function roundedRect(g: CanvasRenderingContext2D, x: number, y: number, size: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + size, y, x + size, y + size, r);
  g.arcTo(x + size, y + size, x, y + size, r);
  g.arcTo(x, y + size, x, y, r);
  g.arcTo(x, y, x + size, y, r);
  g.closePath();
}

/** The code (a data URL drawn at level H) with the logo at its centre, as a PNG data URL. */
export async function qrWithLogo(qrDataUrl: string, logoSrc: string = QR_LOGO_SRC): Promise<string> {
  try {
    const [qr, logo] = await Promise.all([loadImage(qrDataUrl), loadImage(logoSrc)]);
    const canvas = document.createElement("canvas");
    canvas.width = qr.width;
    canvas.height = qr.height;
    const g = canvas.getContext("2d");
    if (!g) return qrDataUrl;
    g.drawImage(qr, 0, 0);
    const box = logoBox(qr.width, logo.naturalWidth || logo.width, logo.naturalHeight || logo.height);
    g.fillStyle = "#FFFFFF";
    roundedRect(g, box.ring.x, box.ring.y, box.ring.size, box.ring.radius);
    g.fill();
    g.fillStyle = QR_ROYAL_GREEN;
    roundedRect(g, box.tile.x, box.tile.y, box.tile.size, box.tile.radius);
    g.fill();
    g.drawImage(logo, box.logo.x, box.logo.y, box.logo.width, box.logo.height);
    return canvas.toDataURL("image/png");
  } catch {
    return qrDataUrl;
  }
}
