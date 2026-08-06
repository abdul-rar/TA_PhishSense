chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SHOW_DETECTION_RESULT") {
    renderWarningUI(request.data);
  }
});

function renderWarningUI(data) {
  const existing = document.getElementById("phish-guard-root");
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = "phish-guard-root";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const isPhishing = data.label === "Phishing";
  const isLegit = data.label === "Legitimate";
  const appName = "PhishSense Extension"; // <-- Nama Brand Ekstensi Kamu

  const style = `
    <style>
      .brand-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 1px;
        // text-transform: uppercase;
        margin-bottom: 8px;
        display: block;
        color: #888;
      }
      
      /* MODAL PHISHING */
      .overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        display: flex; justify-content: center; align-items: center;
        z-index: 2147483647;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .modal {
        background: #fff; padding: 30px; border-radius: 16px;
        text-align: center; max-width: 400px; color: #333;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        border: 2px solid #d9534f;
      }
      .modal .brand-label { color: #d9534f; }
      .modal h1 { color: #d9534f; margin: 10px 0; font-size: 24px; }
      .btn-close-tab {
        background: #d9534f; 
        color: #fff; 
        border: None;
        padding: 12px 25px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin-top: 10px;
        width: 100%;
        }
      .btn-proceed {
        background: #fff;
        color: #d9534f;
        border: 2px solid #d9534f;
        padding: 12px 25px; border-radius: 8px; cursor: pointer;
        font-weight: bold; margin-top: 20px; width: 100%;
      }
      

      /* TOAST LEGITIMATE */
      .toast {
        position: fixed;
        top: 20px; right: 20px;
        background: #fff; color: #333;
        padding: 12px 20px; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        z-index: 2147483647;
        font-family: 'Segoe UI', sans-serif;
        border-left: 5px solid #5cb85c;
        animation: slideIn 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      }
      .toast-content { display: flex; flex-direction: column; }
      .toast .brand-label { margin-bottom: 2px; color: #5cb85c; }
      .status-text { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 5px; }

      @keyframes slideIn {
        from { transform: translateX(120%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    </style>
  `;

  if (isPhishing) {
    shadow.innerHTML = style + `
      <div class="overlay">
        <div class="modal">
          <span class="brand-label">🛡️ ${appName}</span>
          <h1>BAHAYA PHISHING!</h1>
          <p>Situs ini terdeteksi phishing dengan probabilitas <b>${(data.probability_phishing * 100).toFixed(2)}%</b>.</p>
          <p>Lanjutkan browsing dapat membahayakan data pribadi Anda. Disarankan untuk menutup situs ini.</p>
          <button class="btn-close-tab" id="exitBtn">KELUAR DARI SITUS INI</button>
          <button class="btn-proceed" id="closeBtn">SAYA MENGERTI RESIKONYA, TETAP LANJUT</button>
        </div>
      </div>
    `;
    shadow.getElementById("closeBtn").addEventListener("click", () => host.remove());
    shadow.getElementById("exitBtn").addEventListener("click", () => {
    // Kirim pesan ke background script untuk menutup tab ini
    chrome.runtime.sendMessage({ action: "CLOSE_CURRENT_TAB" });
    });
  } 
  else if (isLegit) {
    shadow.innerHTML = style + `
      <div class="toast">
        <div class="toast-content">
          <span class="brand-label">${appName}</span>
          <div class="status-text">Halaman situs ini terpantau Aman ✅</div>
        </div>
      </div>
    `;
    setTimeout(() => {
        // Tambahkan animasi keluar sebelum remove (opsional)
        host.style.opacity = '0';
        host.style.transition = 'opacity 0.5s';
        setTimeout(() => host.remove(), 500);
    }, 4000);
  }
  else {
    // Jika label tidak dikenali, jangan tampilkan apa-apa
    host.remove();
  }
}