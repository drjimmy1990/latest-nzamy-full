/**
 * Nezamy Najiz Bridge - Service Worker (Manifest V3)
 * ─────────────────────────────────────────────────────────────
 * محرك الخدمة الخلفي لإضافة نظامي. يتضمن:
 * 1. حيلة الحفاظ على حياة الـ Service Worker (Keep-Alive Heartbeat).
 * 2. التهدئة البشرية والتأخير العشوائي (Human Pacing & Jitter) لتفادي الحظر.
 * 3. التعافي التلقائي من تجمد التبويبات (Stale Tab Auto-Recovery).
 * 4. محرك حصد تفاصيل القضايا والجلسات والضبوط والوكالات من ناجز.
 * 5. رفع الحزم المستخرجة مباشرة إلى منصة نظامي (/api/v1/najiz/sync).
 * ─────────────────────────────────────────────────────────────
 */

const NAJIZ_ORIGIN = "https://najiz.sa";
const BASE_LAWSUIT = "/applications/lawsuit//lawsuit";
const PACE_FLOOR_MS = 800;
const PACE_JITTER_MS = 700;
const KEEP_ALIVE_INTERVAL_MS = 20000;
const DEFAULT_SERVER_URL = "http://localhost:3000";

let keepAliveInterval = null;
let isSyncInProgress = false;

// ═════════════════════════════════════════════════════════════════
// 1. إدارة نشاط السيرفس وركر (Keep-Alive)
// ═════════════════════════════════════════════════════════════════

function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.set({ "nezamy.heartbeat": Date.now() });
  }, KEEP_ALIVE_INTERVAL_MS);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// تشغيل النبض تلقائياً عند إقلاع السيرفس وركر
startKeepAlive();

// ═════════════════════════════════════════════════════════════════
// 2. التهدئة البشرية لمحاكاة التصفح الطبيعي (Pacing & Jitter)
// ═════════════════════════════════════════════════════════════════

function humanDelay() {
  const ms = PACE_FLOOR_MS + Math.floor(Math.random() * PACE_JITTER_MS);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═════════════════════════════════════════════════════════════════
// 3. إدارة التبويبات والتعافي التلقائي
// ═════════════════════════════════════════════════════════════════

async function getActiveNajizTab() {
  const tabs = await chrome.tabs.query({ url: `${NAJIZ_ORIGIN}/*` });
  if (!tabs || tabs.length === 0) {
    throw new Error("لم يتم العثور على تبويب مفتوح لبوابة ناجز (najiz.sa). يرجى فتح الموقع وتسجيل الدخول أولاً.");
  }

  // ترتيب التبويبات للأفضل: غير المعلقة أولاً، المكتملة، ثم الأحدث استخداماً
  const sorted = tabs.filter((t) => t.id !== undefined).sort((a, b) => {
    if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
    if (a.status !== b.status) return b.status === "complete" ? 1 : -1;
    if (a.active !== b.active) return b.active ? 1 : -1;
    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });

  return sorted[0].id;
}

/**
 * إرسال طلب استعلام إلى سياق ناجز عبر content.js
 */
async function callNajizApi(path, body, wantsText = false, retryCount = 0) {
  const tabId = await getActiveNajizTab();
  await humanDelay();

  try {
    const res = await Promise.race([
      chrome.tabs.sendMessage(tabId, {
        type: "nezamy:fetch",
        path,
        body,
        wantsText
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("relay-timeout")), 90000)
      )
    ]);

    if (!res || !res.ok) {
      if (res?.status === 401 || res?.status === 403) {
        throw new Error("انتهت جلسة تسجيل الدخول في ناجز. يرجى إعادة تسجيل الدخول في المتصفح.");
      }
      throw new Error(res?.error || `فشل استدعاء ناجز: كود ${res?.status}`);
    }

    return wantsText ? res.text : res.json;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg === "relay-timeout" && retryCount < 1) {
      // تعافي تلقائي: إعادة تحميل التبويب المتجمد وإعادة المحاولة لمرة واحدة
      console.warn("تبويب ناجز تجمد، جاري إعادة التحميل والتعافي تلقائياً...");
      await chrome.tabs.reload(tabId);
      await new Promise((r) => setTimeout(r, 6000));
      return callNajizApi(path, body, wantsText, retryCount + 1);
    }
    throw err;
  }
}

// ═════════════════════════════════════════════════════════════════
// 4. محرك حصد بيانات القضايا والضبوط (Harvesting Engine)
// ═════════════════════════════════════════════════════════════════

/**
 * سحب حزمة القضية الكاملة (التفاصيل، الجلسات، الضبوط، الأطراف، الأحكام، القرارات)
 */
async function harvestCaseBundle(objectKey) {
  if (!objectKey) throw new Error("معرف القضية (objectKey) مطلوب.");

  console.log(`[Nezamy Bridge] جاري سحب بيانات القضية: ${objectKey}`);

  // 1. التفاصيل الأساسية للقضية
  const detail = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}`).catch((e) => {
    console.error("فشل سحب تفاصيل القضية:", e);
    return null;
  });

  // 2. أطراف الدعوى والوكلاء
  const parties = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}/parties-details`).catch(() => []);

  // 3. الجلسات ومحاضر الضبوط
  let sessions = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}/sessions`).catch(() => []);

  // إذا كانت الجلسات تحتوي على معرف جلسة، نحاول جلب نص محضر الضبط إذا لم يتوفر كـ text
  if (Array.isArray(sessions)) {
    for (const session of sessions) {
      if (!session.sessionMinutesText && session.sessionId) {
        try {
          // محاولة جلب المضبطة إذا كانت متاحة كنص أو استدعاء تفاصيل الجلسة
          const sessionDetail = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}/sessions/${session.sessionId}`).catch(() => null);
          if (sessionDetail?.sessionMinutes) {
            session.sessionMinutesText = sessionDetail.sessionMinutes;
          }
        } catch (_) {}
      }
    }
  }

  // 4. الأحكام والقرارات والطلبات القضائية
  const judgments = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}/judgments`).catch(() => []);
  const decisions = await callNajizApi(`${BASE_LAWSUIT}/icms/api/cases/${objectKey}/decisions`).catch(() => []);
  const requests = await callNajizApi(`${BASE_LAWSUIT}/CasesRequests/api/icms-cases/${objectKey}/related-requests`).catch(() => []);

  return {
    objectKey,
    harvestedAt: new Date().toISOString(),
    detail,
    parties,
    sessions,
    judgments,
    decisions,
    requests
  };
}

/**
 * سحب قائمة القضايا النشطة للمحامي
 */
async function harvestCasesList(pageIndex = 0, pageSize = 20) {
  const path = `${BASE_LAWSUIT}/ocelot/api/my-cases?pageSize=${pageSize}&pageIndex=${pageIndex}`;
  return callNajizApi(path);
}

/**
 * سحب الوكالات الشرعية (وكيلاً أو موكلاً)
 */
async function harvestWekalat() {
  const path = "/applications/wekalat/api/Procuration/search";
  // صفة 1332: بصفته وكيلاً، صفة 1331: بصفته موكلاً
  const asAgent = await callNajizApi(path, { roleId: 1332, pageIndex: 0, pageSize: 50 }).catch(() => []);
  const asPrincipal = await callNajizApi(path, { roleId: 1331, pageIndex: 0, pageSize: 50 }).catch(() => []);
  return { asAgent, asPrincipal, harvestedAt: new Date().toISOString() };
}

// ═════════════════════════════════════════════════════════════════
// 5. حفظ الحزم محلياً ورفعها اختيارياً لمنصة نظامي
// ═════════════════════════════════════════════════════════════════

async function getConfig() {
  const data = await chrome.storage.local.get(["nezamy_server_url", "nezamy_api_key", "nezamy_sync_enabled"]);
  return {
    serverUrl: (data.nezamy_server_url || "").replace(/\/$/, ""),
    apiKey: data.nezamy_api_key || "",
    syncEnabled: Boolean(data.nezamy_sync_enabled)
  };
}

async function saveHarvestLocally(type, data) {
  const now = Date.now();
  const record = {
    type,
    harvestedAt: new Date(now).toISOString(),
    timestamp: now,
    data
  };
  await chrome.storage.local.set({
    "nezamy.last_sync": now,
    "nezamy.last_harvest": record
  });
  return record;
}

async function pushBundleToNezamy(bundle) {
  const { serverUrl, apiKey, syncEnabled } = await getConfig();
  if (!syncEnabled || !serverUrl) {
    return { skipped: true, reason: "standalone-najiz-mode" };
  }

  const endpoint = `${serverUrl}/api/v1/najiz/sync`;

  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(bundle)
    });

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: (json && json.error) || `فشل الحفظ في منصة نظامي (${response.status})`
      };
    }

    return json || { ok: true, status: response.status };
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

// ═════════════════════════════════════════════════════════════════
// 6. الاستماع لرسائل الـ Popup ولوحة التحكم
// ═════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  // 1. فحص الحالة العامة
  if (message.type === "CHECK_STATUS") {
    (async () => {
      try {
        const tabId = await getActiveNajizTab().catch(() => null);
        let tabInfo = null;
        if (tabId) {
          tabInfo = await chrome.tabs.sendMessage(tabId, { type: "nezamy:probe" }).catch(() => null);
        }
        const config = await getConfig();
        const storage = await chrome.storage.local.get(["nezamy.last_sync", "nezamy.last_harvest"]);

        sendResponse({
          ok: true,
          hasNajizTab: tabId !== null,
          tabLoggedIn: tabInfo?.loggedIn === true,
          tabUrl: tabInfo?.url || null,
          serverUrl: config.serverUrl,
          hasApiKey: Boolean(config.apiKey),
          syncEnabled: config.syncEnabled,
          lastSync: storage["nezamy.last_sync"] || null,
          lastHarvest: storage["nezamy.last_harvest"] || null,
          isSyncing: isSyncInProgress
        });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  // 2. سحب قضية محددة من ناجز
  if (message.type === "SYNC_CASE") {
    if (isSyncInProgress) {
      sendResponse({ ok: false, error: "توجد عملية سحب أخرى جارية حالياً." });
      return false;
    }

    isSyncInProgress = true;
    (async () => {
      try {
        let objectKey = message.objectKey;
        // إذا لم يُمرر المعرف، نحاول استخلاصه من عنوان التبويب الحالي
        if (!objectKey) {
          const tabId = await getActiveNajizTab();
          const tab = await chrome.tabs.get(tabId);
          const url = new URL(tab.url);
          // عادة ناجز يضع المعرف في الباث أو الكويري
          const match =
            url.pathname.match(/\/cases\/([a-zA-Z0-9_-]+)/) ||
            url.pathname.match(/\/lawsuit\/([a-zA-Z0-9_-]+)/) ||
            url.search.match(/(?:caseId|objectKey|id)=([a-zA-Z0-9_-]+)/i);
          if (match) objectKey = match[1];
        }

        if (!objectKey) {
          throw new Error("لم يتم العثور على معرف القضية في الرابط. يرجى فتح صفحة تفاصيل القضية في ناجز أو إدخال المعرف (ObjectKey) يدوياً.");
        }

        const bundle = await harvestCaseBundle(objectKey);
        await saveHarvestLocally("case_bundle", bundle);
        const pushResult = await pushBundleToNezamy(bundle);

        sendResponse({
          ok: true,
          bundle,
          result: pushResult,
          bundleSummary: {
            objectKey,
            partiesCount: Array.isArray(bundle.parties) ? bundle.parties.length : 0,
            sessionsCount: Array.isArray(bundle.sessions) ? bundle.sessions.length : 0,
            judgmentsCount: Array.isArray(bundle.judgments) ? bundle.judgments.length : 0,
            decisionsCount: Array.isArray(bundle.decisions) ? bundle.decisions.length : 0
          }
        });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        isSyncInProgress = false;
      }
    })();
    return true;
  }

  // 3. سحب قائمة القضايا النشطة وتفاصيلها من ناجز
  if (message.type === "SYNC_ALL_CASES") {
    if (isSyncInProgress) {
      sendResponse({ ok: false, error: "توجد عملية سحب أخرى جارية." });
      return false;
    }

    isSyncInProgress = true;
    (async () => {
      try {
        const listRes = await harvestCasesList(0, 10);
        const cases = listRes?.data || listRes?.items || listRes?.result || (Array.isArray(listRes) ? listRes : []);

        const harvestedBundles = [];
        const results = [];
        for (const item of cases) {
          const key = item.objectKey || item.caseId || item.id;
          if (key) {
            try {
              const b = await harvestCaseBundle(key);
              harvestedBundles.push(b);
              await pushBundleToNezamy(b);
              results.push({ key, success: true });
            } catch (caseErr) {
              results.push({ key, success: false, error: String(caseErr) });
            }
          }
        }

        const payload = {
          rawListResponse: listRes,
          casesCount: cases.length,
          bundles: harvestedBundles,
          results
        };
        await saveHarvestLocally("all_cases", payload);

        sendResponse({
          ok: true,
          data: payload,
          syncedCount: results.filter((r) => r.success).length,
          total: cases.length,
          details: results
        });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        isSyncInProgress = false;
      }
    })();
    return true;
  }

  // 4. سحب الوكالات من ناجز
  if (message.type === "SYNC_WEKALAT") {
    (async () => {
      try {
        const wekalat = await harvestWekalat();
        await saveHarvestLocally("wekalat", wekalat);
        const result = await pushBundleToNezamy({ type: "wekalat_bundle", wekalat });
        sendResponse({ ok: true, wekalat, result });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  // 5. حفظ الإعدادات
  if (message.type === "SAVE_CONFIG") {
    chrome.storage.local.set({
      nezamy_server_url: message.serverUrl || "",
      nezamy_api_key: message.apiKey || "",
      nezamy_sync_enabled: Boolean(message.syncEnabled)
    }).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  return false;
});

// الاستماع لأوامر المزامنة من موقع نظامي على الويب مباشرة (External Messaging)
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "nezamy:sync-case" && message.objectKey) {
    harvestCaseBundle(message.objectKey)
      .then((bundle) => pushBundleToNezamy(bundle))
      .then((res) => sendResponse({ ok: true, res }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message && message.type === "nezamy:ping") {
    sendResponse({ ok: true, version: "1.0.0", name: "Nezamy Najiz Bridge" });
    return false;
  }

  return false;
});
