// Executa no mundo MAIN das páginas da Crunchyroll, em document_start.
//
// A extensão NÃO emite tokens nem lê cookies: o access token da Crunchyroll
// existe apenas na memória da própria página (o cookie `etp_rt` é httpOnly e
// `/content/v2/...` responde 401 se chamado só com cookies). Este script
// observa as requisições que a página já faz com a sessão do usuário e repassa
// apenas o cabeçalho Authorization — e, quando aparece, o id da conta — para o
// mundo isolado da extensão.
(() => {
  "use strict";

  const CHANNEL = "cr-calendar-revival/auth";
  // Somente as APIs autenticadas da Crunchyroll.
  const API_URL = /^(?:https:)?\/\/www\.crunchyroll\.com\/(?:content|accounts|subs)\//;
  // .../content/v2/discover/<id da conta>/...
  const ACCOUNT_IN_PATH = /\/content\/v2\/discover\/([0-9a-fA-F-]{16,})\//;

  let lastToken = null;
  let lastAccountId = null;

  function post(patch) {
    try {
      window.postMessage(Object.assign({ channel: CHANNEL }, patch), window.location.origin);
    } catch (err) {
      /* a página pode ser descarregada no meio do caminho */
    }
  }

  function noteToken(value) {
    const token = typeof value === "string" ? value.trim() : "";
    if (!/^Bearer\s+\S+$/i.test(token) || token === lastToken) return;
    lastToken = token;
    post({ token, capturedAt: Date.now() });
  }

  function noteUrl(url) {
    const match = ACCOUNT_IN_PATH.exec(String(url || ""));
    if (!match || match[1] === lastAccountId) return;
    lastAccountId = match[1];
    post({ accountId: match[1] });
  }

  function absolute(url) {
    try {
      return new URL(String(url), window.location.href).href;
    } catch (err) {
      return String(url || "");
    }
  }

  function headerFrom(source, key) {
    if (!source) return "";
    try {
      if (typeof source.get === "function") return source.get(key) || "";
      return new Headers(source).get(key) || "";
    } catch (err) {
      return "";
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      try {
        const url = absolute(typeof input === "string" ? input : (input && input.url) || "");
        if (API_URL.test(url)) {
          noteUrl(url);
          let auth = headerFrom(init && init.headers, "authorization");
          if (!auth && input && typeof input !== "string") {
            auth = headerFrom(input.headers, "authorization");
          }
          noteToken(auth);
        }
      } catch (err) {
        /* observação nunca deve quebrar a página */
      }
      return nativeFetch.apply(this, arguments);
    };
  }

  const xhr = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (xhr && typeof xhr.open === "function" && typeof xhr.setRequestHeader === "function") {
    const nativeOpen = xhr.open;
    const nativeSetHeader = xhr.setRequestHeader;

    xhr.open = function (method, url) {
      try {
        const full = absolute(url);
        this.__crCalendarUrl = API_URL.test(full) ? full : "";
        if (this.__crCalendarUrl) noteUrl(full);
      } catch (err) {
        this.__crCalendarUrl = "";
      }
      return nativeOpen.apply(this, arguments);
    };

    xhr.setRequestHeader = function (name, value) {
      try {
        if (this.__crCalendarUrl && String(name).toLowerCase() === "authorization") {
          noteToken(value);
        }
      } catch (err) {
        /* idem */
      }
      return nativeSetHeader.apply(this, arguments);
    };
  }
})();
