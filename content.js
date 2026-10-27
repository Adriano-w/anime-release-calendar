(() => {
  "use strict";

  const ITEM_ID = "cr-calendar-revival-nav-item";
  const LINK_ID = "cr-calendar-revival-nav-link";
  // Marca usada só quando não foi possível herdar o estilo do site.
  const FALLBACK_CLASS = "cr-calendar-revival-fallback";

  function calendarUrl() {
    return chrome.runtime.getURL("calendar.html");
  }

  // Rótulos em inglês por padrão; trocados pelo idioma salvo quando houver.
  // O content script não carrega a tabela de textos (ela é da página da
  // extensão), então mantém apenas estas três palavras.
  const LABELS = {
    en: { text: "Calendar", aria: "Open the anime release calendar", title: "Release calendar" },
    "pt-BR": { text: "Calendário", aria: "Abrir o calendário de lançamentos de animes", title: "Calendário de lançamentos" }
  };
  let labels = LABELS.en;

  function applyLabels() {
    const link = document.getElementById(LINK_ID);
    if (!link) return;
    link.textContent = labels.text;
    link.setAttribute("aria-label", labels.aria);
    link.title = labels.title;
  }

  try {
    chrome.storage.local.get("uiLanguage", (stored) => {
      if (chrome.runtime.lastError) return;
      const code = stored && stored.uiLanguage;
      if (LABELS[code]) {
        labels = LABELS[code];
        applyLabels();
      }
    });
  } catch (err) {
    /* sem storage: segue em inglês */
  }

  // Classes presentes em TODOS os itens vizinhos. A interseção pega o estilo
  // base do menu e descarta modificadores de um item só, como "simulcast-link"
  // ou "news-link", que trazem ícone/cor próprios.
  function sharedClasses(elements) {
    const sets = elements.map((el) => [...el.classList]);
    if (!sets.length) return [];
    return sets[0].filter((cls) => sets.every((set) => set.includes(cls)));
  }

  // Herda o visual do site; só cai no CSS próprio se não houver o que copiar.
  function decorate(link, siblings) {
    const shared = sharedClasses(siblings);
    if (shared.length) {
      link.classList.add(...shared);
      return true;
    }
    link.classList.add(FALLBACK_CLASS);
    return false;
  }

  function makeLink(siblings) {
    const a = document.createElement("a");
    a.id = LINK_ID;
    a.href = calendarUrl();
    a.textContent = labels.text;
    a.setAttribute("aria-label", labels.aria);
    a.title = labels.title;
    a.addEventListener("click", (event) => {
      // Abre o calendário da extensão na própria aba.
      event.preventDefault();
      window.location.href = calendarUrl();
    });
    decorate(a, siblings);
    return a;
  }

  // Layout atual da Crunchyroll: âncoras soltas dentro de um contêiner, sem
  // lista. Os itens vizinhos dão o estilo exato, inclusive estados de hover.
  function insertIntoHeaderLinks() {
    const box = document.querySelector("header .header-internal-links, .header-internal-links");
    if (!box) return false;

    const siblings = [...box.children].filter((el) => el.tagName === "A");
    if (!siblings.length) return false;

    const link = makeLink(siblings);
    link.setAttribute("data-t", "header-menu-calendar");
    box.appendChild(link);
    return true;
  }

  // Reserva para outros layouts (e para mudanças futuras do site): menus
  // montados como lista. Também copia as classes de um vizinho quando possível.
  function insertIntoList() {
    const candidates = [
      'nav[aria-label] ul',
      'header nav ul',
      '[role="navigation"] ul',
      'header [role="navigation"]',
      'nav'
    ];

    let nav = null;
    for (const selector of candidates) {
      const found = Array.from(document.querySelectorAll(selector))
        .find(el => {
          const r = el.getBoundingClientRect();
          const text = (el.innerText || "").toLowerCase();
          return r.width > 0 && r.height > 0 &&
            (text.includes("simulcast") || text.includes("manga") ||
             text.includes("games") || text.includes("browse") ||
             text.includes("explorar") || text.includes("notícias") ||
             el.closest("header") !== null);
        });
      if (found) { nav = found; break; }
    }

    if (!nav) {
      const header = document.querySelector("header");
      if (header) {
        nav = header.querySelector("nav ul, nav, [role='navigation'] ul, [role='navigation']");
      }
    }
    if (!nav) return false;

    const list = nav.tagName === "UL" || nav.tagName === "OL" ? nav : nav.querySelector("ul, ol");
    const host = list || nav;

    const siblingLinks = [...host.querySelectorAll("a")];
    const link = makeLink(siblingLinks);

    if (list) {
      const sampleItem = list.querySelector("li");
      const li = document.createElement("li");
      li.id = ITEM_ID;
      if (sampleItem && sampleItem.classList.length) {
        li.classList.add(...sampleItem.classList);
      } else {
        li.className = "cr-calendar-revival-item";
      }
      li.appendChild(link);
      list.appendChild(li);
    } else {
      host.appendChild(link);
    }
    return true;
  }

  function insertIntoNav() {
    if (document.getElementById(LINK_ID)) return true;
    return insertIntoHeaderLinks() || insertIntoList();
  }

  let scheduled = false;
  function scheduleInsert() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      insertIntoNav();
    });
  }

  // Inserção inicial e reinserção após a navegação SPA da Crunchyroll.
  insertIntoNav();
  const observer = new MutationObserver(scheduleInsert);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Reinsere se o SPA substituir o cabeçalho.
  const repairObserver = new MutationObserver(() => {
    if (!document.getElementById(LINK_ID)) scheduleInsert();
  });
  repairObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
