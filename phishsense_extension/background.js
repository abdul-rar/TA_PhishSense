// ===============================================
// BACKGROUND SERVICE WORKER
// Auto Phishing Checker
// ===============================================

console.log("Background worker started — Auto Phishing Checker");

// ==============================
// CONFIGURATION
// ==============================

const PREDICT_ENDPOINT = "http://127.0.0.1:5000/predict";
const RESPONSE_TIME_ENDPOINT = "http://127.0.0.1:5000/response-time";
const THROTTLE_MS = 30 * 1000; // 30 detik per full URL
const lastChecked = {};

// ==============================
// HELPER FUNCTIONS
// ==============================

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function getBodyHTML(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return document.body ? document.body.innerHTML : null;
      }
    });

    return results?.[0]?.result || null;

  } catch (err) {
    console.warn("Gagal mengambil body HTML:", err);
    return null;
  }
}

function shouldSkipUrl(url) {
  console.log("CHECK URL:", url);

  if (!url) return true;

  // Harus http / https
  if (!url.startsWith("http")) return true;

  try {
    // =========================
    // Skip internal browser pages
    // =========================
    if (
      url.startsWith("chrome://") ||
      url.startsWith("edge://") ||
      url.startsWith("brave://")
    ) return true;

    // =========================
    // Skip Google search
    // =========================
    if (
      url.startsWith("https://www.google.com/search?") ||
      url.startsWith("https://www.google.co.id/search?")
    ) return true;

    return false;

  } catch {
    return true;
  }
}

function cleanupThrottle(maxEntries = 500) {
  const entries = Object.entries(lastChecked);

  if (entries.length <= maxEntries) return;

  // Urutkan berdasarkan timestamp
  entries.sort((a, b) => a[1] - b[1]);

  const toDelete = entries.slice(0, entries.length - maxEntries);

  for (const [key] of toDelete) {
    delete lastChecked[key];
  }
}

async function enforceStorageLimit(maxItems = 10) {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all);

  if (entries.length <= maxItems) return;

  // Urutkan berdasarkan timestamp yang disimpan di setiap object
  entries.sort((a, b) => {
    const tsA = a[1]?.timestamp ?? 0;
    const tsB = b[1]?.timestamp ?? 0;
    return tsA - tsB;
  });

  const toDelete = entries
    .slice(0, entries.length - maxItems)
    .map(([key]) => key);

  await chrome.storage.local.remove(toDelete);

  console.log("Old storage cleaned:", toDelete.length);
}

// ==============================
// CORE LOGIC
// ==============================

async function callApiAndStore(tabId, url) {

  if (shouldSkipUrl(url)) return null;

  // Mulai timer
  const startTime = performance.now();

  const urlKey = url.length > 500 ? url.slice(0, 500) : url;

  const now = Date.now();

  // Throttle per domain
  if (lastChecked[urlKey] && (now - lastChecked[urlKey] < THROTTLE_MS)) {
    return null;
  }

  // Generate request id
  const requestId = now + "_" + tabId;

  lastChecked[urlKey] = now;
  cleanupThrottle();

  // Ambil HTML
  const bodyHTML = await getBodyHTML(tabId);

  let storedResult = {
    timestamp: now,
    request_id: requestId,
    url: url,
    body_html: bodyHTML ? bodyHTML.slice(0, 10000) : null // max 10KB (yang akan ditampilkan di UI, bukan yang dikirim ke server)
  };

  try {

    const response = await fetch(PREDICT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        url,
      })
    });

    if (!response.ok) {
      storedResult.error = `Server ${response.status}`;
    } else {
      // Ambil data JSON dari response
      const data = await response.json();

      // Langsung ambil label dari response API
      // Jika karena suatu hal data.label kosong, gunakan "Unknown" sebagai fallback
      storedResult.label = data.label || "Unknown";

      // Simpan probabilitas untuk keperluan tampilan/UI 
      storedResult.probability_phishing = data.probability_phishing ?? null;
      
      // Optional: Simpan threshold jika ingin ditampilkan di debug info
      storedResult.threshold = data.threshold;
    }

  } catch (err) {
    storedResult.error = err.message || "network";
  }

  // Simpan dulu ke storage
  await chrome.storage.local.set({
    ["result_" + tabId]: storedResult
  });

  // Enforce storage limit
  await enforceStorageLimit(20);

  // --- Mengirim sinyal ke halaman web untuk menampilkan warning ---
  if (storedResult) {
    chrome.tabs.sendMessage(tabId, {
      action: "SHOW_DETECTION_RESULT",
      data: storedResult
    }).catch(err => console.error("Halaman tidak mendukung injeksi UI.", err));
  }

  // Update badge (UI)
  updateBadgeForTab(tabId, storedResult);

  // // tunggu frame render berikutnya
  // await new Promise(resolve => requestAnimationFrame(resolve));

  // STOP timer setelah UI update
  const endTime = performance.now();
  const totalTime = (endTime - startTime).toFixed(2);

  console.log("Total Full Pipeline Response Time (ms):", totalTime);

  // Kirim ke API kedua setelah semuanya selesai
  try {
    await fetch(RESPONSE_TIME_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        total_response_time_ms: parseFloat(totalTime)
      })
    });
  } catch (err) {
    console.warn("Failed to send response time:", err);
  }

  return storedResult;
}

// ==============================
// BADGE
// ==============================

function updateBadgeForTab(tabId, stored) {

  if (!stored) {
    chrome.action.setBadgeText({ text: "", tabId });
    return;
  }

  if (stored.error) {
    chrome.action.setBadgeText({ text: "!", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#888" });
    return;
  }

  const isPhishing = stored.label === "Phishing";

  chrome.action.setBadgeText({
    text: isPhishing ? "PH" : "OK",
    tabId
  });

  chrome.action.setBadgeBackgroundColor({
    color: isPhishing ? "#d9534f" : "#5cb85c"
  });

  chrome.action.setTitle({
    title: `${stored.label} — ${
      stored.probability_phishing != null
        ? (stored.probability_phishing * 100).toFixed(1) + "%"
        : ""
    }`
  });
}

// ==============================
// TAB EVENTS
// ==============================

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);

    if (tab?.url?.startsWith("http")) {
      await callApiAndStore(tab.id, tab.url);
    }

  } catch (err) {
    console.warn("onActivated error:", err);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

  if (changeInfo.status === "complete" &&
      tab?.url?.startsWith("http")) {

    await callApiAndStore(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove("result_" + tabId).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CLOSE_CURRENT_TAB") {
    // sender.tab.id adalah ID tab tempat tombol tersebut diklik
    chrome.tabs.remove(sender.tab.id);
  }
});