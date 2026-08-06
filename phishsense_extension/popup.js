// ===============================================
// POPUP SCRIPT
// Menampilkan hasil deteksi phishing
// ===============================================

document.addEventListener("DOMContentLoaded", initPopup);

/**
 * Fungsi utama ketika popup dibuka
 */
function initPopup() {

  // Ambil elemen UI
  const urlField = document.getElementById("urlField");
  const labelEl = document.getElementById("label");
  const probEl = document.getElementById("prob");
  const bodyHtml = document.getElementById("bodyHtml");
 
  // Ambil tab aktif saat ini
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {

    if (!tabs || !tabs[0]) {
      showNoTabState(urlField, labelEl, probEl);
      return;
    }

    const tab = tabs[0];
    urlField.value = tab.url || "";

    // Ambil hasil dari storage
    const resultKey = "result_" + tab.id;
    const kv = await chrome.storage.local.get(resultKey);
    const stored = kv[resultKey];

    console.log("Stored data:", stored);

    if (!stored) {
      showWaitingState(labelEl, probEl);
    } else {

      if (stored.error) {
        showErrorState(labelEl, probEl, stored.error);
      } else {
        showPrediction(stored, labelEl, probEl);
      }

      // SELALU tampilkan HTML kalau ada
      if (stored.body_html) {
        bodyHtml.textContent = stored.body_html.slice(0, 2000); // limit 2000 karakter
      } else {
        bodyHtml.textContent = "Tidak ada body HTML.";
      }
    }

  });
}


/**
 * Jika tidak ada tab aktif
 */
function showNoTabState(urlField, labelEl, probEl) {
  urlField.value = "No active tab";
  labelEl.textContent = "-";
  probEl.textContent = "-";
}


/**
 * Jika masih menunggu hasil dari background
 */
function showWaitingState(labelEl, probEl) {
  labelEl.textContent = "Menunggu hasil...";
  labelEl.className = "label";
  probEl.textContent = "";
}


/**
 * Jika terjadi error dari API
 */
function showErrorState(labelEl, probEl, errorMsg) {
  labelEl.textContent = "Error: " + errorMsg;
  labelEl.className = "label";
  probEl.textContent = "";
}


/**
 * Tampilkan hasil prediksi phishing
 */
function showPrediction(stored, labelEl, probEl) {

  const labelText = stored.label || "Unknown";
  const probability = stored.probability_phishing;

  labelEl.textContent = labelText;
  labelEl.className = "label " + (labelText === "Phishing" ? "phish" : "legit");

  if (probability === null || probability === undefined) {
    probEl.textContent = "";
  } else {
    probEl.textContent = "Phish Prob: " + (probability * 100).toFixed(2) + "%";
  }
}