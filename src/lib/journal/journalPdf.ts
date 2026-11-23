/**
 * journalPdf.ts — the issue as a PDF, made on the server (owner Q193 أ,
 * batch l13). SERVER ONLY.
 *
 * Headless Chromium through `puppeteer-core` 25.16.0 (no browser download: the server
 * provides the binary). The path is env CHROMIUM_PATH (e.g. the distro's
 * chromium package). Unset → `null`: the callers then use the print page
 * link, and the admin page says the PDF component is not installed.
 *
 * The page is loaded with setContent() from renderIssueHtml() — escaped
 * HTML, no script — JavaScript is disabled and every network request is
 * refused (an entry carries an admin-typed link; it is printed, never
 * fetched). One browser per call, always closed; the whole render is cut at
 * PDF_TIMEOUT_MS.
 */
import "server-only";
import { pdfConfigured } from "./journal";

export const PDF_TIMEOUT_MS = 30_000;

interface PuppeteerPage {
  setJavaScriptEnabled(enabled: boolean): Promise<void>;
  setRequestInterception(on: boolean): Promise<void>;
  on(event: "request", cb: (req: { url(): string; abort(): Promise<void>; continue(): Promise<void> }) => void): void;
  setContent(html: string, opts: { waitUntil: "load"; timeout: number }): Promise<void>;
  pdf(opts: Record<string, unknown>): Promise<Uint8Array>;
}
interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}
interface PuppeteerLike {
  launch(opts: Record<string, unknown>): Promise<PuppeteerBrowser>;
}

async function loadPuppeteer(): Promise<PuppeteerLike | null> {
  try {
    // Loaded only when a PDF is asked for. puppeteer-core is on Next's
    // built-in server-external list, so Node loads it at run time.
    const mod = (await import("puppeteer-core")) as unknown as { default?: PuppeteerLike } & PuppeteerLike;
    return (mod.default ?? mod) as PuppeteerLike;
  } catch (err) {
    console.error("[journal/pdf] puppeteer-core could not be loaded:", err instanceof Error ? err.name : "error");
    return null;
  }
}

/** The PDF bytes, or null (not configured, or the render failed — logged). */
export async function renderIssuePdf(html: string): Promise<Uint8Array | null> {
  if (!pdfConfigured()) return null;
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) return null;
  let browser: PuppeteerBrowser | null = null;
  const work = (async () => {
    browser = await puppeteer.launch({
      executablePath: (process.env.CHROMIUM_PATH ?? "").trim(),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") void req.continue();
      else void req.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });
    return page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PDF_TIMEOUT_MS);
    });
    const out = await Promise.race([work, timeout]);
    if (!out) console.error("[journal/pdf] render timed out");
    return out;
  } catch (err) {
    console.error("[journal/pdf] render failed:", err instanceof Error ? err.message.slice(0, 200) : "error");
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    const b = browser as PuppeteerBrowser | null;
    if (b) await b.close().catch(() => undefined);
    else void work.then(() => (browser as PuppeteerBrowser | null)?.close().catch(() => undefined), () => undefined);
  }
}

// ── one render at a time, and a short cache ─────────────────────────────────
// Each render starts a browser, so a burst of requests must not start many:
// while one render runs, another request gets null (the caller sends the
// print page instead). A finished PDF is kept for CACHE_MS per (issue,
// viewer kind, content hash) — the key holds no user id, and two viewers of
// the same kind see the same issue the same way.

const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 24;
const cache = new Map<string, { at: number; pdf: Uint8Array }>();
let busy = false;

/** renderIssuePdf behind a one-at-a-time gate and a 10-minute cache. */
export async function renderIssuePdfCached(key: string, html: string, now: () => number = Date.now): Promise<Uint8Array | null> {
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return hit.pdf;
  if (busy) return null;
  busy = true;
  try {
    const pdf = await renderIssuePdf(html);
    if (pdf) {
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { at: now(), pdf });
    }
    return pdf;
  } finally {
    busy = false;
  }
}
