/**
 * Nezamy Najiz Bridge - Popup Controller
 * ─────────────────────────────────────────────────────────────
 * إدارة واجهة إضافة نظامي وربطها مع محرك الخلفية background.js
 * ─────────────────────────────────────────────────────────────
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const statusBadge = document.getElementById("najizStatusBadge");
  const statusText = document.getElementById("najizStatusText");
  const btnSyncCurrent = document.getElementById("btnSyncCurrentCase");
  const btnSyncAll = document.getElementById("btnSyncAllCases");
  const btnSyncWekalat = document.getElementById("btnSyncWekalat");
  const manualCaseKeyInput = document.getElementById("manualCaseKey");

  const btnSettings = document.getElementById("btnSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const settingsDrawer = document.getElementById("settingsDrawer");
  const btnSaveSettings = document.getElementById("btnSaveSettings");
  const serverUrlInput = document.getElementById("serverUrl");
  const apiKeyInput = document.getElementById("apiKey");

  const logSection = document.getElementById("logSection");
  const logContent = document.getElementById("logContent");
  const lastSyncTime = document.getElementById("lastSyncTime");
  const jsonPreview = document.getElementById("jsonPreview");
  const exportActions = document.getElementById("exportActions");
  const btnDownloadJson = document.getElementById("btnDownloadJson");
  const btnCopyJson = document.getElementById("btnCopyJson");

  let isWorking = false;
  let latestHarvestData = null;

  function renderHarvestPreview(data) {
    if (!data) return;
    latestHarvestData = data;
    if (jsonPreview) {
      jsonPreview.classList.remove("hidden");
      jsonPreview.textContent = JSON.stringify(data, null, 2);
    }
    if (exportActions) {
      exportActions.classList.remove("hidden");
    }
  }

  // 1. فحص وتحديث الحالة
  function refreshStatus() {
    chrome.runtime.sendMessage({ type: "CHECK_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        setNajizStatus(false, "تعذر الاتصال بمحرك الإضافة الخلفي");
        return;
      }

      if (response.hasNajizTab) {
        if (response.tabLoggedIn) {
          setNajizStatus(true, "متصل بناجز (الجلسة نشطة ومصادقة)");
        } else {
          setNajizStatus(true, "تم العثور على تبويب ناجز (جاهز للسحب)");
        }
      } else {
        setNajizStatus(false, "لم يتم فتح بوابة ناجز (najiz.sa)");
      }

      // ضبط الإعدادات الحالية
      if (response.serverUrl) serverUrlInput.value = response.serverUrl;
      if (response.lastSync) {
        lastSyncTime.innerText = "آخر سحب: " + new Date(response.lastSync).toLocaleTimeString("ar-SA");
      }
      if (response.lastHarvest && !latestHarvestData) {
        latestHarvestData = response.lastHarvest;
      }
    });
  }

  function setNajizStatus(connected, text) {
    statusBadge.className = `status-card ${connected ? "connected" : "disconnected"}`;
    statusText.innerText = text;
  }

  function showLog(message, type = "normal", previewData = null) {
    logSection.classList.remove("hidden");
    logContent.className = `log-content ${type}`;
    logContent.innerText = message;
    if (previewData) {
      renderHarvestPreview(previewData);
    }
  }

  function setBusy(busy, targetBtn = null) {
    isWorking = busy;
    btnSyncCurrent.disabled = busy;
    btnSyncAll.disabled = busy;
    btnSyncWekalat.disabled = busy;

    if (targetBtn) {
      const spinner = targetBtn.querySelector(".btn-spinner");
      const btnText = targetBtn.querySelector(".btn-text");
      if (spinner) spinner.classList.toggle("hidden", !busy);
      if (btnText && busy) {
        btnText.dataset.original = btnText.innerText;
        btnText.innerText = "جاري السحب من ناجز...";
      } else if (btnText && btnText.dataset.original) {
        btnText.innerText = btnText.dataset.original;
      }
    }
  }

  // 2. سحب القضية المعروضة من ناجز
  btnSyncCurrent.addEventListener("click", () => {
    if (isWorking) return;
    const manualKey = (manualCaseKeyInput.value || "").trim();
    setBusy(true, btnSyncCurrent);
    showLog("جاري استخراج بيانات القضية وجلساتها من ناجز...", "normal");

    chrome.runtime.sendMessage({ type: "SYNC_CASE", objectKey: manualKey || undefined }, (res) => {
      setBusy(false, btnSyncCurrent);
      if (chrome.runtime.lastError || !res || !res.ok) {
        const err = res?.error || chrome.runtime.lastError?.message || "فشل السحب من ناجز";
        showLog("❌ خطأ: " + err, "error");
      } else {
        const summary = res.bundleSummary || {};
        const msg = `تم سحب القضية (${summary.objectKey}) من ناجز بنجاح! الأطراف: ${summary.partiesCount || 0} | الجلسات: ${summary.sessionsCount || 0} | الأحكام: ${summary.judgmentsCount || 0}`;
        showLog("✅ " + msg, "success", res.bundle);
        refreshStatus();
      }
    });
  });

  // 3. سحب جميع القضايا النشطة من ناجز
  btnSyncAll.addEventListener("click", () => {
    if (isWorking) return;
    setBusy(true);
    showLog("جاري حصد قائمة القضايا النشطة وتفاصيلها من ناجز...", "normal");

    chrome.runtime.sendMessage({ type: "SYNC_ALL_CASES" }, (res) => {
      setBusy(false);
      if (chrome.runtime.lastError || !res || !res.ok) {
        showLog("❌ خطأ: " + (res?.error || "فشل حصد القضايا من ناجز"), "error");
      } else {
        showLog(`✅ تم سحب ${res.syncedCount} من أصل ${res.total} قضية من ناجز بنجاح.`, "success", res.data);
        refreshStatus();
      }
    });
  });

  // 4. سحب الوكالات من ناجز
  btnSyncWekalat.addEventListener("click", () => {
    if (isWorking) return;
    setBusy(true);
    showLog("جاري سحب الوكالات الشرعية من ناجز (بصفتي وكيلاً وموكلاً)...", "normal");

    chrome.runtime.sendMessage({ type: "SYNC_WEKALAT" }, (res) => {
      setBusy(false);
      if (chrome.runtime.lastError || !res || !res.ok) {
        showLog("❌ خطأ: " + (res?.error || "فشل سحب الوكالات من ناجز"), "error");
      } else {
        showLog("✅ تم سحب الوكالات الشرعية من ناجز بنجاح.", "success", res.wekalat);
        refreshStatus();
      }
    });
  });

  // تحميل أو نسخ الـ JSON المستخرج
  if (btnDownloadJson) {
    btnDownloadJson.addEventListener("click", () => {
      if (!latestHarvestData) return;
      const blob = new Blob([JSON.stringify(latestHarvestData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `najiz-extract-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", async () => {
      if (!latestHarvestData) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(latestHarvestData, null, 2));
        btnCopyJson.innerText = "✅ تم النسخ!";
        setTimeout(() => {
          btnCopyJson.innerText = "📋 نسخ البيانات";
        }, 1500);
      } catch (_) {}
    });
  }

  // 5. إدارة الإعدادات
  btnSettings.addEventListener("click", () => {
    settingsDrawer.classList.toggle("hidden");
  });

  btnCloseSettings.addEventListener("click", () => {
    settingsDrawer.classList.add("hidden");
  });

  btnSaveSettings.addEventListener("click", () => {
    const serverUrl = serverUrlInput.value.trim() || "http://localhost:3000";
    const apiKey = apiKeyInput.value.trim();

    chrome.runtime.sendMessage({ type: "SAVE_CONFIG", serverUrl, apiKey }, (res) => {
      if (res && res.ok) {
        showLog("✅ تم حفظ الإعدادات بنجاح.", "success");
        settingsDrawer.classList.add("hidden");
      } else {
        showLog("❌ تعذر حفظ الإعدادات.", "error");
      }
    });
  });

  // الفحص الأولي عند الفتح
  refreshStatus();
});
