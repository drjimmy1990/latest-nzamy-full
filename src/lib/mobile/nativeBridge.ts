/**
 * Zero-dependency Capacitor Native Bridge for `nzamy-website`.
 * ─────────────────────────────────────────────────────────────────────────────
 * Because the native iOS & Android projects live in the standalone
 * `nzamy-mobile` repository (`sa.nezamy.app`) and load the production web app,
 * `window.Capacitor` is injected automatically at runtime by the native shell.
 *
 * This module lets any component in `nzamy-website` detect when it is running
 * inside the iOS/Android app and invoke native capabilities (StatusBar theme
 * sync, Haptics, Native Share Sheet, In-App Browser) without bundling heavy
 * `@capacitor/*` packages into the web server build.
 */

interface CapacitorPluginRegistry {
  StatusBar?: {
    setStyle: (opts: { style: "DARK" | "LIGHT" | "DEFAULT" }) => Promise<void>;
    setBackgroundColor: (opts: { color: string }) => Promise<void>;
  };
  Haptics?: {
    impact: (opts?: { style?: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void>;
    notification: (opts?: { type?: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  };
  Share?: {
    share: (opts: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<void>;
  };
  SplashScreen?: {
    hide: () => Promise<void>;
  };
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => "ios" | "android" | "web";
  Plugins?: CapacitorPluginRegistry;
}

function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

/** Returns true when the site is running inside the native iOS or Android Capacitor shell. */
export function isNativeMobileApp(): boolean {
  const cap = getCapacitor();
  return Boolean(cap?.isNativePlatform?.());
}

/** Returns `"ios" | "android" | "web"`. */
export function getMobilePlatform(): "ios" | "android" | "web" {
  const cap = getCapacitor();
  return cap?.getPlatform?.() ?? "web";
}

/** Syncs the native phone status bar with the web app's Light / Dark theme. */
export async function syncNativeStatusBar(theme: "dark" | "light"): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.() || !cap.Plugins?.StatusBar) return;
  try {
    await cap.Plugins.StatusBar.setStyle({
      style: theme === "dark" ? "DARK" : "LIGHT",
    });
    await cap.Plugins.StatusBar.setBackgroundColor({
      color: theme === "dark" ? "#0c0f12" : "#f9fafb",
    });
  } catch {
    // Ignore on platforms where setBackgroundColor is unsupported (e.g. iOS)
  }
}

/** Triggers a subtle native haptic tap when running inside the mobile app. */
export async function triggerNativeHaptic(
  style: "LIGHT" | "MEDIUM" | "HEAVY" = "LIGHT",
): Promise<void> {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.() || !cap.Plugins?.Haptics) return;
  try {
    await cap.Plugins.Haptics.impact({ style });
  } catch {
    // Ignore if device does not support haptics
  }
}

/** Opens the native iOS/Android share sheet (falls back to Web Share API). */
export async function shareNativeOrWeb(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  const cap = getCapacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.Share) {
    try {
      await cap.Plugins.Share.share(opts);
      return true;
    } catch {
      return false;
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(opts);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
