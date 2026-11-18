"use client";

/**
 * AnalyticsConsent — the cookie banner and the ONLY place GA4 / Clarity are
 * loaded (rules in src/lib/analytics/analytics.ts). Mounted once, in
 * src/app/layout.tsx.
 *
 *   - No env id → renders nothing and does nothing.
 *   - The choice is read from the cookie in the browser only (never rendered
 *     on the server: a cached page must not carry someone else's state).
 *   - The banner shows on the public analytics routes only, and only until
 *     the visitor answers; «أوافق» and «لا أوافق» are the same button.
 *   - Scripts load after «أوافق», on an analytics route. Leaving the routes:
 *       · a link click to any other page becomes a full page load, so the
 *         scripts are gone before that page exists;
 *       · a programmatic navigation flips GA's own off switch
 *         (window['ga-disable-<id>']) inside history.pushState, before GA
 *         can count it, and the effect below reloads the page when Clarity
 *         had been loaded.
 *   - Clarity: every input/textarea/select/contenteditable gets
 *     data-clarity-mask, and on FULL_MASK_ROUTES the whole <body> does.
 *   - Events: page_view on each analytics-route path (sent here, not by GA's
 *     automatic history tracking), and a click on any element carrying
 *     data-analytics-event="<name>" (e.g. the founder page's «احجز مقعدك»).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ANALYTICS_EVENTS,
  analyticsIds,
  cleanPageLocation,
  consentCookieString,
  consentFromCookieHeader,
  isAnalyticsCookieName,
  isAnalyticsRoute,
  isFullMaskRoute,
  type ConsentChoice,
} from "@/lib/analytics/analytics";
import { trackEvent } from "@/lib/analytics/track";

// Literal references: Next inlines NEXT_PUBLIC_* at build time only this way.
export const ANALYTICS = analyticsIds(process.env.NEXT_PUBLIC_GA4_ID, process.env.NEXT_PUBLIC_CLARITY_ID);

/** Fired on window when a choice is saved (the banner, or the privacy page control). */
export const CONSENT_CHANGE_EVENT = "nz-consent-change";

type W = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  __nzAnalyticsLoaded?: { ga4Id: string | null; clarity: boolean };
  __nzHistoryPatched?: boolean;
} & Record<string, unknown>;

const MASK_ATTR = "data-clarity-mask";
const MASK_SELECTOR = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Save a choice, clear the analytics cookies on «لا أوافق», and tell the page. */
export function saveConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = consentCookieString(choice, window.location.protocol === "https:");
    if (choice === "denied") clearAnalyticsCookies();
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: choice }));
  } catch {
    // a blocked cookie jar: the banner simply shows again next time
  }
}

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  try {
    return consentFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

function clearAnalyticsCookies(): void {
  const host = window.location.hostname;
  const labels = host.split(".");
  // GA writes on the registrable domain (.nezamy.sa); try the host and each parent.
  const domains = [""];
  for (let i = 0; i < labels.length - 1; i++) domains.push(`; Domain=.${labels.slice(i).join(".")}`);
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !isAnalyticsCookieName(name)) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d}`;
  }
}

function injectScript(src: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadScripts(w: W): void {
  if (w.__nzAnalyticsLoaded) return;
  const { ga4Id, clarityId } = ANALYTICS;
  if (ga4Id) {
    w[`ga-disable-${ga4Id}`] = false;
    w.dataLayer = w.dataLayer || [];
    // gtag.js reads the Arguments object, not an array.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      (w.dataLayer as unknown[]).push(arguments);
    };
    w.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    w.gtag("js", new Date());
    w.gtag("config", ga4Id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`);
  }
  if (clarityId) {
    const q: ((...args: unknown[]) => void) & { q?: unknown[] } = function clarity() {
      // eslint-disable-next-line prefer-rest-params
      (q.q = q.q || []).push(arguments);
    };
    w.clarity = w.clarity || q;
    injectScript(`https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`);
    w.clarity("consent");
  }
  w.__nzAnalyticsLoaded = { ga4Id, clarity: Boolean(clarityId) };
}

/** GA's off switch, flipped synchronously inside pushState/replaceState for a non-analytics URL. */
function patchHistory(w: W): void {
  if (w.__nzHistoryPatched || !ANALYTICS.ga4Id) return;
  w.__nzHistoryPatched = true;
  const flag = `ga-disable-${ANALYTICS.ga4Id}`;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      try {
        if (url != null) {
          const next = new URL(String(url), window.location.href);
          w[flag] = !isAnalyticsRoute(next.pathname);
        }
      } catch {
        // never break navigation
      }
      return original(data, unused, url);
    };
  }
}

function maskInputs(root: ParentNode): void {
  root.querySelectorAll?.(MASK_SELECTOR).forEach((el) => el.setAttribute(MASK_ATTR, "true"));
}

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<ConsentChoice | null | "unknown">("unknown");
  const lastPageView = useRef<string | null>(null);
  const allowed = isAnalyticsRoute(pathname);

  // Read the stored choice in the browser only; follow later changes.
  useEffect(() => {
    if (!ANALYTICS.enabled) return;
    setChoice(readConsent());
    const onChange = (e: Event) => setChoice(parseDetail((e as CustomEvent).detail));
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  // Load / switch off per route.
  useEffect(() => {
    if (!ANALYTICS.enabled || choice === "unknown") return;
    const w = window as unknown as W;
    const loaded = w.__nzAnalyticsLoaded;

    if (!allowed || choice !== "granted") {
      if (loaded) {
        if (loaded.ga4Id) w[`ga-disable-${loaded.ga4Id}`] = true;
        // Clarity has no documented pause: a fresh load of this page drops it.
        if (loaded.clarity) window.location.reload();
      }
      document.body.removeAttribute(MASK_ATTR);
      return;
    }

    if (isFullMaskRoute(pathname)) document.body.setAttribute(MASK_ATTR, "true");
    else document.body.removeAttribute(MASK_ATTR);
    maskInputs(document);
    patchHistory(w);
    loadScripts(w);
    if (ANALYTICS.ga4Id) w[`ga-disable-${ANALYTICS.ga4Id}`] = false;

    const location = cleanPageLocation(window.location.origin, window.location.pathname, window.location.search);
    if (lastPageView.current !== location) {
      lastPageView.current = location;
      // every later hit (GA's own scroll / click events too) carries the clean URL
      if (ANALYTICS.ga4Id && typeof w.gtag === "function") w.gtag("set", { page_location: location });
      trackEvent(ANALYTICS_EVENTS.pageView, { page_location: location, page_title: document.title.slice(0, 100) });
    }
  }, [allowed, choice, pathname]);

  // While loaded: mask new inputs, record tagged clicks, full-load links that leave the routes.
  const onClick = useCallback((e: MouseEvent) => {
    const w = window as unknown as W;
    if (!w.__nzAnalyticsLoaded) return;
    const target = e.target instanceof Element ? e.target : null;
    const tagged = target?.closest<HTMLElement>("[data-analytics-event]");
    if (tagged) {
      const name = tagged.dataset.analyticsEvent;
      if (name === ANALYTICS_EVENTS.reserveClick) {
        trackEvent(name, tagged.dataset.analyticsPlacement ? { placement: tagged.dataset.analyticsPlacement } : {});
      }
    }
    const a = target?.closest<HTMLAnchorElement>("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    try {
      const next = new URL(a.href, window.location.href);
      if (next.origin !== window.location.origin || isAnalyticsRoute(next.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(next.href);
    } catch {
      // leave the click alone
    }
  }, []);

  useEffect(() => {
    if (!ANALYTICS.enabled || choice !== "granted" || !allowed) return;
    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          if (n.matches(MASK_SELECTOR)) n.setAttribute(MASK_ATTR, "true");
          maskInputs(n);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, [allowed, choice, onClick]);

  if (!ANALYTICS.enabled || choice !== null || !allowed) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="ملفات تعريف الارتباط"
      dir="rtl"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-2xl border border-[#E6CD8E]/40 bg-[#06201A] p-4 text-sm leading-7 text-[#E8F1EC] shadow-2xl sm:inset-x-6 sm:p-5"
    >
      <p>
        نستخدم أداتي قياس الزيارات Google Analytics وMicrosoft Clarity في هذه الصفحة وصفحات الأسعار والتسجيل والدفع
        فقط، لنعرف كيف تُستخدم ونحسّنها. لا تعملان إلا بموافقتك، ولا تعملان داخل لوحات الحسابات، وتُخفى كل حقول
        الإدخال (البطاقة والرخصة والبريد).{" "}
        <Link href="/privacy#cookies" className="font-bold text-[#E6CD8E] underline underline-offset-2">
          التفاصيل في سياسة الخصوصية
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => saveConsent("granted")} className={BUTTON}>
          أوافق
        </button>
        <button type="button" onClick={() => saveConsent("denied")} className={BUTTON}>
          لا أوافق
        </button>
      </div>
    </div>
  );
}

// «أوافق» and «لا أوافق» share one class: refusing is exactly as easy as accepting.
const BUTTON =
  "min-h-[44px] rounded-full border border-[#E6CD8E] px-4 font-bold text-[#E6CD8E] motion-safe:transition hover:bg-[#E6CD8E]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E6CD8E]";

function parseDetail(detail: unknown): ConsentChoice | null {
  return detail === "granted" || detail === "denied" ? detail : null;
}

/**
 * The control on /privacy (section 6): shows the stored choice and changes it.
 * With no env id it says plainly that no analytics tool runs.
 */
export function AnalyticsChoiceControl({ isAr }: { isAr: boolean }) {
  const [choice, setChoice] = useState<ConsentChoice | null | "unknown">("unknown");

  useEffect(() => {
    setChoice(readConsent());
    const onChange = (e: Event) => setChoice(parseDetail((e as CustomEvent).detail));
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (!ANALYTICS.enabled) {
    return (
      <p className="text-sm leading-relaxed">
        {isAr ? "أدوات قياس الزيارات غير مفعّلة حالياً، فلا يُحمَّل أيٌّ منها." : "No visitor analytics tool is switched on at the moment, so none is loaded."}
      </p>
    );
  }
  if (choice === "unknown") return null;

  const state =
    choice === "granted"
      ? isAr ? "اخترت: أوافق على أدوات القياس." : "Your choice: analytics allowed."
      : choice === "denied"
        ? isAr ? "اخترت: لا أوافق على أدوات القياس." : "Your choice: analytics refused."
        : isAr ? "لم تختر بعد؛ لا يُحمَّل شيء قبل موافقتك." : "No choice yet; nothing loads before you agree.";

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <p role="status">{state}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => saveConsent("granted")} className={CONTROL}>
          {isAr ? "أوافق" : "Allow"}
        </button>
        <button type="button" onClick={() => saveConsent("denied")} className={CONTROL}>
          {isAr ? "لا أوافق" : "Refuse"}
        </button>
      </div>
    </div>
  );
}

const CONTROL =
  "min-h-[40px] rounded-xl border border-royal/40 px-5 text-sm font-semibold text-royal motion-safe:transition hover:bg-royal/10";
