/**
 * Nezamy Najiz Bridge - Content Script Relay
 * ─────────────────────────────────────────────────────────────
 * سكريبت الحقن الخاص بإضافة نظامي للربط مع بوابة ناجز.
 * ينفذ الطلبات داخل سياق موقع ناجز (https://najiz.sa) مستفيداً
 * من كوكيز جلسة نفاذ/ناجز الرسمية المفتوحة (credentials: "same-origin")
 * دون الحاجة لأي كلمات مرور أو تخزين بيانات اعتماد.
 * ─────────────────────────────────────────────────────────────
 */

const NAJIZ_REPORT = "nezamy:report";
const NAJIZ_FETCH  = "nezamy:fetch";
const NAJIZ_PROBE  = "nezamy:probe";
const NAJIZ_ORIGIN = "https://najiz.sa";
const TIMEOUT_MS   = 90000;

/**
 * فحص ما إذا كان المستخدم مسجل دخوله في ناجز بنجاح
 */
function isUserSignedIn() {
  const path = window.location.pathname || "";
  // تخطي صفحات البداية العامة
  if (path === "/" || path.startsWith("/landing") || path.startsWith("/applications/landing")) {
    return false;
  }
  
  // التحقق من وجود اسم المستخدم أو وسم الترحيب أو قائمة الحساب
  const bodyText = document.body ? document.body.innerText || "" : "";
  const hasWelcome = bodyText.includes("مرحبا") || bodyText.includes("مرحباً") || bodyText.includes("أهلاً");
  const hasUserElement = document.querySelector(".user-name, .user-profile, [data-user-name], #userDropdown") !== null;
  const isAppPath = path.startsWith("/applications/");

  return isAppPath && (hasWelcome || hasUserElement);
}

/**
 * تنفيذ استدعاء آمن لبوابات ناجز الداخلية عبر Same-Origin Fetch
 */
async function executeProxyFetch(path, body, wantsText = false) {
  let url;
  try {
    url = new URL(path, NAJIZ_ORIGIN);
  } catch (err) {
    return { ok: false, status: 0, error: "invalid-path: " + String(err) };
  }

  // منع أي محاولة للتوجيه خارج نطاق ناجز
  if (url.origin !== NAJIZ_ORIGIN) {
    return { ok: false, status: 0, error: "foreign-origin-blocked" };
  }

  try {
    const isPost = body !== undefined && body !== null;
    const response = await fetch(url.toString(), {
      method: isPost ? "POST" : "GET",
      body: isPost ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      credentials: "same-origin", // تمرير جلسة نفاذ الرسمية
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(isPost && typeof body !== "string" ? { "Content-Type": "application/json" } : {})
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text().catch(() => "");
    let json = null;

    if (contentType.includes("json") && text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        // تجاهل أخطاء البارس إن لم يكن JSON صالحاً
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      bodyLength: text.length,
      json,
      ...(wantsText ? { text } : {})
    };
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    return {
      ok: false,
      status: 0,
      error: isTimeout ? "timeout" : (error instanceof Error ? error.message : "network-error")
    };
  }
}

// الاستماع لرسائل الـ Service Worker والـ Popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === NAJIZ_FETCH) {
    executeProxyFetch(message.path, message.body, message.wantsText).then(sendResponse);
    return true; // إبقاء القناة مفتوحة للإجابة غير المتزامنة
  }

  if (message.type === NAJIZ_PROBE) {
    sendResponse({
      loggedIn: isUserSignedIn(),
      url: window.location.href,
      pathname: window.location.pathname,
      observedAt: Date.now()
    });
    return false;
  }

  return false;
});

// إشعار فوري عند اكتمال تحميل الصفحة
try {
  chrome.runtime.sendMessage({
    type: NAJIZ_REPORT,
    payload: {
      loggedIn: isUserSignedIn(),
      url: window.location.href,
      pathname: window.location.pathname,
      observedAt: Date.now()
    }
  }).catch(() => {
    // تجاهل الخطأ في حال لم يكن الـ Service Worker نشطاً بعد
  });
} catch (_) {}
