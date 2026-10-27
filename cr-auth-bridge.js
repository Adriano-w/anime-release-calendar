// Mundo isolado: recebe o que cr-auth-capture.js observou na página da
// Crunchyroll e repassa ao service worker. Só aceita mensagens da própria
// janela, da origem da Crunchyroll e no canal esperado.
(() => {
  "use strict";

  const CHANNEL = "cr-calendar-revival/auth";
  const ORIGIN = "https://www.crunchyroll.com";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== ORIGIN) return;

    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;

    const patch = {};
    if (typeof data.token === "string" && /^Bearer\s+\S+$/i.test(data.token)) {
      patch.token = data.token;
      patch.capturedAt = Number.isFinite(data.capturedAt) ? data.capturedAt : Date.now();
    }
    if (typeof data.accountId === "string" && /^[0-9a-fA-F-]{16,}$/.test(data.accountId)) {
      patch.accountId = data.accountId;
    }
    if (!Object.keys(patch).length) return;

    try {
      chrome.runtime.sendMessage({ type: "CR_AUTH_CAPTURED", patch }, () => {
        // Ignora ausência de receptor (service worker reiniciando).
        void chrome.runtime.lastError;
      });
    } catch (err) {
      /* contexto da extensão invalidado após atualização/reload */
    }
  });
})();
