// Nomes dos dias vêm de i18n.js (Intl), conforme o idioma escolhido.
const SOURCE_URL = "https://www.anidachi.app/tools/crunchyroll-schedule";

const statusEl = document.getElementById("status");
const queueStatusEl = document.getElementById("queueStatus");
const daysEl = document.getElementById("days");
const sourceLabel = document.getElementById("sourceLabel");

function setStatus(message, error=false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", error);
}

// Índice da fila da Crunchyroll. null = desconhecida (nunca marcar nada).
let queueIndex = null;
// Último conjunto de lançamentos lidos, para re-renderizar após a sincronização.
let lastItems = [];
let syncing = false;
// Filtro ativo: "all", "queue" ou o id de uma Crunchylist.
let filterSource = "all";
// Índice usado para filtrar (independente do índice da fila, que marca o ✓).
let filterIndex = null;
// Crunchylists do usuário e seus índices já montados.
let customLists = [];
const listIndexes = new Map();
// Janela da semana vinda da fonte, para rotular as colunas com a data real.
let weekWindow = null;
// Semana exibida em relação à atual: 0 = atual, -1 = anterior.
let weekOffset = 0;
// Lançamentos que ainda não saíram ficam ocultos por padrão.
let showUpcoming = false;
const UPCOMING_STORAGE_KEY = "showUpcoming";
// Marcadores de Crunchylist custam uma requisição por lista, então são
// opcionais e vêm desligados.
let showListMarks = false;
const MARKS_STORAGE_KEY = "showListMarks";

function setQueueStatus(message, tone) {
  if (!queueStatusEl) return;
  queueStatusEl.textContent = message;
  queueStatusEl.classList.toggle("error", tone === "error");
  queueStatusEl.classList.toggle("warn", tone === "warn");
  queueStatusEl.classList.toggle("ok", tone === "ok");
}

// A normalização e a correspondência de títulos vivem em match.js, compartilhado
// com o service worker.
function isInQueue(item) {
  return indexHas(queueIndex, item);
}

// Preferência booleana, no mesmo lugar onde o idioma é guardado.
async function readFlag(key) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get(key);
      return !!(stored && stored[key]);
    }
    return localStorage.getItem(key) === "1";
  } catch (err) {
    return false;
  }
}

function writeFlag(key, value) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: !!value });
      return;
    }
    localStorage.setItem(key, value ? "1" : "0");
  } catch (err) {
    /* preferência não persistida; vale para a sessão atual */
  }
}

// Um lançamento é futuro quando seu instante ainda não chegou.
function isUpcoming(item, now) {
  return (item.sortKey || 0) > now;
}

function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").replace(/^[#\s]+|[\s]+$/g, "");
}

function dayIndexFromText(text) {
  const t = text.toLowerCase();
  const map = [
    ["sunday",0],["domingo",0],["monday",1],["segunda",1],
    ["tuesday",2],["terça",2],["wednesday",3],["quarta",3],
    ["thursday",4],["quinta",4],["friday",5],["sexta",5],
    ["saturday",6],["sábado",6],["sabado",6]
  ];
  for (const [name, idx] of map) if (t.includes(name)) return idx;
  return -1;
}


// O elemento do título varia entre lançamentos: normalmente é um
// <span class="font-medium">, mas alguns itens usam um <a class="font-medium">
// (quando a fonte tem página própria do anime). Tenta as marcas conhecidas e,
// se nenhuma servir, cai para a estrutura: o primeiro filho do bloco de
// conteúdo que não seja o horário nem uma anotação secundária.
function pickTitleEl(li) {
  const known =
    li.querySelector(".font-medium") ||
    li.querySelector("[class*='ani-text']");
  if (known) return known;

  const blocks = [...li.children].filter((el) => el.tagName !== "TIME");
  for (const block of blocks) {
    for (const child of block.children) {
      if (child.tagName === "TIME") continue;
      if (child.classList && child.classList.contains("ml-2")) continue;
      if (cleanText(child.textContent || "")) return child;
    }
  }
  return null;
}

function parseSchedule(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sections = [...doc.querySelectorAll("section[aria-label]")];
  const items = [];

  for (const section of sections) {
    const day = dayIndexFromText(
      section.getAttribute("aria-label") || ""
    );

    if (day < 0) continue;

    const cards = section.querySelectorAll("li[id^='show-']");

    for (const li of cards) {
      const timeEl = li.querySelector("time");
      if (!timeEl) continue;

      const titleEl = pickTitleEl(li);

      const title = cleanText(titleEl?.textContent || "");
      const episode = cleanText(
        li.querySelector("span.ml-2")?.textContent || ""
      );

      const dateTime = timeEl.getAttribute("dateTime") || "";
      const rawTime = cleanText(timeEl.textContent || "");

      if (!title || !dateTime || !rawTime) continue;

      // O texto do horário vem no fuso de quem gerou a página (medido: ET), e
      // não no de quem lê. O instante do atributo é a única fonte confiável.
      const airsAt = new Date(dateTime);
      if (Number.isNaN(airsAt.getTime())) continue;

      // Converte "Ep 3" para "Episódio 3".
      const epMatch = episode.match(
        /^(?:Ep\.?|Episode)\s*(\d+(?:-\d+)?)$/i
      );

      items.push({
        // O dia vem do instante real, não do rótulo da seção.
        day: airsAt.getDay(),
        date: airsAt,
        time: airsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sortKey: airsAt.getTime(),
        title,
        episode: epMatch
          ? t("episode.label", { number: epMatch[1] })
          : episode,
        // Primeiro número do episódio ("3" em "Ep 3-4"), usado para resolver o
        // link direto do episódio na Crunchyroll.
        episodeNumber: epMatch ? parseInt(epMatch[1], 10) : null,
        seriesId: "",
        url: "",
        dateTime,
        id: li.id,
        source: "anidachi"
      });
    }
  }

  // Remove apenas duplicatas exatas.
  const seen = new Set();

  return items.filter(item => {
    const key = [
      item.dateTime,
      item.title,
      item.episode
    ].join("|").toLowerCase();

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function render(items) {
  daysEl.replaceChildren();

  const all = items || [];
  // O filtro só vale quando a fila é conhecida; sem ela, mostra tudo.
  const filtering = filterSource !== "all" && !!filterIndex;
  const selected = filtering ? all.filter((item) => indexHas(filterIndex, item)) : all;

  // Lançamentos futuros entram só quando pedidos.
  const now = Date.now();
  const hiddenUpcoming = showUpcoming
    ? 0
    : selected.filter((item) => isUpcoming(item, now)).length;
  const visible = showUpcoming
    ? selected
    : selected.filter((item) => !isUpcoming(item, now));

  const today = new Date();
  const dayNames = weekdayNames();
  // Domingo da semana exibida, para rotular cada coluna com a data real.
  const weekStart = weekWindow ? weekWindow.start : (() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  })();

  for (let d = 0; d < 7; d++) {
    const dayItems = visible.filter((x) => x.day === d);
    const col = document.createElement("section");

    const columnDate = new Date(weekStart);
    columnDate.setDate(columnDate.getDate() + d);

    col.className = "day";
    const isToday = columnDate.toDateString() === today.toDateString();
    if (isToday) col.classList.add("today");

    const head = document.createElement("div");
    head.className = "dayhead";

    const heading = document.createElement("div");
    heading.className = "dayheading";

    const h = document.createElement("h2");
    h.textContent = dayNames[d];
    if (isToday) {
      const badge = document.createElement("span");
      badge.className = "todaybadge";
      badge.textContent = t("day.today");
      h.append(badge);
    }

    const dateLabel = document.createElement("span");
    dateLabel.className = "daydate";
    dateLabel.textContent = columnDate.toLocaleDateString(dateLocale(), { day: "2-digit", month: "2-digit" });

    heading.append(h, dateLabel);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = dayItems.length;

    head.append(heading, count);
    col.append(head);

    const list = document.createElement("div");
    list.className = "items";

    if (!dayItems.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      // Distingue "nada neste dia" de "só tem coisa que ainda não saiu".
      const soFuturos =
        !showUpcoming &&
        selected.some((item) => item.day === d && isUpcoming(item, now));
      empty.textContent = t(
        soFuturos ? "day.emptyUpcoming" : filtering ? "day.emptyFiltered" : "day.empty"
      );
      list.append(empty);
    } else {
      dayItems.sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0));

      for (const item of dayItems) {
        // O cartão envolve o link e a linha de ações: botões dentro de uma
        // âncora seriam markup inválido e atrapalhariam o teclado.
        const card = document.createElement("div");
        card.className = "card";

        const a = document.createElement("a");
        a.className = "episode";
        // A fonte já pode trazer o endereço da série na Crunchyroll; se não,
        // sobra a busca, que nunca quebra.
        a.href = item.url || searchUrl(item.title);
        a.target = "_blank";
        a.rel = "noreferrer";
        a.title = t("episode.linkTitle");
        a.addEventListener("click", (event) => {
          // Clique do meio, Ctrl/Cmd/Shift e afins seguem o comportamento do navegador.
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          if (!hasExtensionRuntime()) return;
          event.preventDefault();
          openEpisode(item, a);
        });

        const time = document.createElement("div");
        time.className = "time";
        time.textContent = item.time;

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = item.title;

        const texto = document.createElement("div");
        texto.className = "epinfo";
        // Nome primeiro, logo abaixo da capa; horário e episódio vêm depois.
        texto.append(title);

        const meta = document.createElement("div");
        meta.className = "epmeta";
        meta.append(time);
        texto.append(meta);

        if (item.image) {
          const thumb = document.createElement("img");
          thumb.className = "thumb";
          thumb.src = item.image;
          thumb.loading = "lazy";
          thumb.decoding = "async";
          // O título já está ao lado; repetir só atrapalharia o leitor de tela.
          thumb.alt = "";
          // Capa indisponível não deve deixar ícone quebrado no cartão.
          thumb.addEventListener("error", () => thumb.remove());
          a.classList.add("has-thumb");
          a.append(thumb);
        }

        a.append(texto);

        if (item.episode) {
          const ep = document.createElement("span");
          ep.className = "epnum";
          ep.textContent = item.episode;
          meta.append(ep);
        }

        // Marcação discreta: a série está na fila da Crunchyroll.
        if (isInQueue(item)) {
          card.classList.add("in-queue");
          const flag = document.createElement("div");
          flag.className = "queue-flag";
          flag.textContent = t("queue.flag");
          flag.title = t("queue.flagTitle");
          texto.append(flag);
        }

        card.append(a);

        const marcas = buildListMarks(item);
        if (marcas) card.append(marcas);

        if (canEditLists(item)) card.append(buildCardActions(item));

        list.append(card);
      }
    }

    col.append(list);
    daysEl.append(col);
  }

  updateFilterUi(all.length, visible.length, hiddenUpcoming);
}


/* --------------------------- Filtro --------------------------- */

const FILTER_ALL = "all";
const FILTER_QUEUE = "queue";

function filterLabel() {
  if (filterSource === FILTER_QUEUE) return t("filter.labelQueue");
  const list = customLists.find((item) => item.id === filterSource);
  return list ? `“${list.title || t("filter.listUnnamed")}”` : t("filter.labelGeneric");
}

function listOptionText(list) {
  const name = list.title || t("filter.listUnnamed");
  return Number.isFinite(list.total) ? `${name} (${list.total})` : name;
}

// Reconstrói as opções preservando a escolha atual quando ela ainda existir.
function rebuildFilterOptions() {
  const select = document.getElementById("filterSource");
  if (!select) return;

  // Reconstruir o select a cada render tiraria o foco e fecharia a lista
  // aberta; so refaz quando as opcoes realmente mudaram.
  const signature = [
    // O idioma entra na assinatura: os rótulos das opções são traduzidos.
    getLanguage(),
    queueIndex ? queueIndex.size : "none",
    customLists.map((list) => list.id + ":" + list.title + ":" + list.total).join("|")
  ].join("/");
  if (select.dataset.signature === signature && select.value === filterSource) return;
  select.dataset.signature = signature;

  const wanted = filterSource;
  select.replaceChildren();

  const add = (value, text, disabled) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    if (disabled) option.disabled = true;
    select.append(option);
  };

  add(FILTER_ALL, t("filter.all"), false);
  add(
    FILTER_QUEUE,
    queueIndex ? t("filter.queue", { count: queueIndex.size }) : t("filter.queueLocked"),
    !queueIndex
  );

  if (customLists.length) {
    for (const list of customLists) add(list.id, listOptionText(list), false);
  }

  select.value = wanted;
  // A escolha anterior pode ter desaparecido (sessão perdida, lista removida).
  if (select.value !== wanted) {
    filterSource = FILTER_ALL;
    filterIndex = null;
    select.value = FILTER_ALL;
  }
}

function updateFilterUi(total, visible, hiddenUpcoming) {
  rebuildFilterOptions();

  const toggle = document.getElementById("showUpcoming");
  if (toggle) toggle.checked = showUpcoming;

  const marcas = document.getElementById("showListMarks");
  if (marcas) {
    marcas.checked = showListMarks;
    // Sem fila sincronizada não há Crunchylists para marcar.
    marcas.disabled = !queueIndex;
  }

  const hint = document.getElementById("filterHint");
  if (!hint) return;

  const ocultos = hiddenUpcoming || 0;
  const sufixo = ocultos ? tn("upcoming.hidden", ocultos) : "";

  // Semana inteira no futuro ficaria vazia sem explicação.
  if (!showUpcoming && ocultos && visible === 0) {
    hint.textContent = t("upcoming.allHidden");
    return;
  }

  if (filterSource === FILTER_ALL) {
    hint.textContent = tn("filter.hintAll", total) + sufixo;
  } else if (!filterIndex) {
    hint.textContent = t("filter.hintUnavailable");
  } else {
    hint.textContent = t("filter.hintFiltered", { visible, total, label: filterLabel() }) + sufixo;
  }
}

function setShowUpcoming(enabled) {
  showUpcoming = !!enabled;
  writeFlag(UPCOMING_STORAGE_KEY, showUpcoming);
  render(lastItems);
}

async function setFilterSource(value) {
  filterSource = value || FILTER_ALL;

  if (filterSource === FILTER_ALL) {
    filterIndex = null;
    render(lastItems);
    return;
  }

  if (filterSource === FILTER_QUEUE) {
    filterIndex = queueIndex;
    render(lastItems);
    return;
  }

  // Crunchylist: busca uma vez e reaproveita.
  const cached = listIndexes.get(filterSource);
  if (cached) {
    filterIndex = cached;
    render(lastItems);
    return;
  }

  const hint = document.getElementById("filterHint");
  if (hint) hint.textContent = t("filter.listLoading");

  const result = await askBackground({ type: "GET_CUSTOM_LIST", listId: filterSource });

  if (result.state === "ok") {
    const index = buildQueueIndex(result.entries || []);
    listIndexes.set(filterSource, index);
    filterIndex = index;
    render(lastItems);
    return;
  }

  // Falhou: volta para "todos" em vez de esconder lançamentos sem explicação.
  filterIndex = null;
  filterSource = FILTER_ALL;
  render(lastItems);

  setQueueStatus(
    result.state === "no-session"
      ? t("filter.listNoSession")
      : t("filter.listFailed", { message: result.message || t("queue.unknownError") }),
    result.state === "no-session" ? "warn" : "error"
  );
}

// As Crunchylists só existem com sessão; a falha é silenciosa porque o filtro
// da fila e o calendário continuam funcionando sem elas.
async function loadCustomLists() {
  if (!hasExtensionRuntime()) return;

  const result = await askBackground({ type: "GET_CUSTOM_LISTS" });
  customLists = result.state === "ok" && Array.isArray(result.lists) ? result.lists : [];

  if (!customLists.length) listIndexes.clear();
  rebuildFilterOptions();
}


/* ------------------------------ Carga ------------------------------ */

// Reserva: a programação pública que a extensão usava antes. Fica só como
// alternativa porque publica uma semana estática que pode estar defasada.
async function loadFromAnidachi() {
  const response = await fetch(SOURCE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(t("error.fallbackHttp", { status: response.status }));

  const html = await response.text();
  const items = parseSchedule(html);
  if (!items.length) {
    throw new Error(t("error.fallbackEmpty"));
  }
  return items;
}

// Avisa quando os dados não são da semana corrente — foi exatamente isso que
// fazia os episódios aparecerem um número atrás.
function staleWeekWarning(items) {
  const now = Date.now();
  const newest = items.reduce((max, item) => Math.max(max, item.sortKey || 0), 0);
  if (!newest) return "";

  const daysBehind = Math.floor((now - newest) / 86400000);
  if (daysBehind < 1) return "";

  const last = new Date(newest).toLocaleDateString(dateLocale(), { day: "2-digit", month: "2-digit" });
  return t("note.stale", { date: last });
}

async function load() {
  setStatus(t("status.fetching"));
  sourceLabel.textContent = t("source.querying");
  document.getElementById("refresh").disabled = true;

  try {
    let items;
    let label;
    let note = "";

    try {
      const schedule = await fetchAniListSchedule(weekOffset);
      if (!schedule.items.length) throw new Error(t("error.noneThisWeek"));
      items = schedule.items;
      weekWindow = schedule.range;
      label = t("source.anilist");
      note = t("note.anilistTime");
    } catch (anilistError) {
      console.warn("[Calendário] AniList falhou, tentando a fonte de reserva:", anilistError);
      // A reserva só conhece uma semana: não serve para navegar no tempo.
      if (weekOffset !== 0) throw new Error(t("week.navUnavailable"));
      items = await loadFromAnidachi();
      weekWindow = null;
      label = t("source.fallback");
      note =
        t("note.fallback", { message: anilistError.message }) +
        staleWeekWarning(items);
    }

    lastItems = items;
    render(items);

    setStatus(tn("status.found", items.length) + note);

    sourceLabel.textContent = label;
    sourceLabel.parentElement.classList.remove("offline");
    sourceLabel.parentElement.classList.add("online");

  } catch (err) {
    console.error("[Calendário] Falha ao carregar:", err);

    daysEl.replaceChildren();
    lastItems = [];

    const errorMessage = err?.message || String(err);

    setStatus(t("status.error", { message: errorMessage }), true);

    sourceLabel.textContent = t("source.unavailable");
    sourceLabel.parentElement.classList.remove("online");
    sourceLabel.parentElement.classList.add("offline");

    const box = document.createElement("section");
    box.className = "day";

    const h = document.createElement("div");
    h.className = "dayhead";

    const title = document.createElement("h2");
    title.textContent = t("error.detailsTitle");
    h.append(title);
    box.append(h);

    const content = document.createElement("div");
    content.className = "items";

    const details = document.createElement("div");
    details.className = "episode";

    const message = document.createElement("div");
    message.className = "title";
    message.textContent = errorMessage;

    const link = document.createElement("a");
    link.href = SOURCE_URL;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.className = "epnum";
    link.textContent = t("error.openFallback");

    details.append(message, link);
    content.append(details);
    box.append(content);
    daysEl.append(box);

  } finally {
    document.getElementById("refresh").disabled = false;
  }

  updateWeekUi();

  // O calendário nunca espera pela fila: a marcação chega depois, se chegar.
  syncQueue({ interactive: false });
}


/* ------------------------- Fila da Crunchyroll ------------------------- */

function hasExtensionRuntime() {
  return typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.sendMessage);
}

function askBackground(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ state: "error", message: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { state: "error", message: t("queue.noRuntime") });
      });
    } catch (err) {
      resolve({ state: "error", message: (err && err.message) || String(err) });
    }
  });
}

function markedCount() {
  if (!queueIndex) return 0;
  const titles = new Set();
  for (const item of lastItems) if (isInQueue(item)) titles.add(item.title);
  return titles.size;
}

// interactive = true quando o usuário clicou em "Sincronizar fila": só nesse
// caso a extensão abre a Crunchyroll em segundo plano para recuperar a
// autorização da sessão.
async function syncQueue({ interactive = false } = {}) {
  if (syncing) return;

  const button = document.getElementById("syncQueue");

  if (!hasExtensionRuntime()) {
    queueIndex = null;
    setQueueStatus(t("queue.noRuntime"), "warn");
    return;
  }

  syncing = true;
  if (button) button.disabled = true;
  setQueueStatus(t("queue.checking"));

  try {
    let result = await askBackground({ type: "GET_WATCHLIST" });

    if (result.state === "no-session" && interactive) {
      setQueueStatus(t("queue.searching"));
      const connection = await askBackground({ type: "CONNECT_CRUNCHYROLL" });
      if (connection.state === "connected") {
        result = await askBackground({ type: "GET_WATCHLIST" });
      } else if (connection.state === "error") {
        result = connection;
      }
    }

    if (result.state === "ok") {
      queueIndex = buildQueueIndex(result.entries || []);
      if (filterSource === FILTER_QUEUE) filterIndex = queueIndex;
      render(lastItems);

      // Com sessão válida, as Crunchylists também ficam disponíveis no filtro.
      loadCustomLists().then(() => {
        if (showListMarks) setShowListMarks(true);
      });

      if (!result.total) {
        // Fila vazia é resultado legítimo, não falha de autenticação.
        setQueueStatus(t("queue.empty"), "ok");
      } else {
        const marked = markedCount();
        setQueueStatus(
          t("queue.synced", {
            total: result.total,
            totalWord: tn("queue.record", result.total),
            marked,
            markedWord: tn("queue.marked", marked)
          }),
          "ok"
        );
      }
      return;
    }

    // Em qualquer falha o calendário segue sem marcações, nunca com marcações falsas.
    queueIndex = null;
    if (filterSource === FILTER_QUEUE) {
      filterIndex = null;
      filterSource = FILTER_ALL;
    }
    render(lastItems);

    if (result.state === "no-session") {
      setQueueStatus(
        interactive
          ? t("queue.noSessionInteractive")
          : t("queue.noSession"),
        "warn"
      );
      return;
    }

    setQueueStatus(
      t("queue.failed", { message: result.message || t("queue.unknownError") }),
      "error"
    );
  } catch (err) {
    queueIndex = null;
    render(lastItems);
    setQueueStatus(
      t("queue.failed", { message: (err && err.message) || err }),
      "error"
    );
  } finally {
    syncing = false;
    if (button) button.disabled = false;
  }
}



/* ---------------------- Link direto do episódio ---------------------- */

// A fonte do calendário só dá título e slug; a URL do episódio na Crunchyroll
// exige os ids internos (série e episódio). Eles são resolvidos pelo service
// worker, sob demanda no clique, e o href é atualizado depois do primeiro
// acerto. Sem sessão ou sem correspondência confiável, continua valendo o link
// de busca — que nunca quebra.
function searchUrl(title) {
  return "https://www.crunchyroll.com/search?q=" + encodeURIComponent(title);
}

async function openEpisode(item, anchor) {
  if (anchor.classList.contains("resolving")) return;
  anchor.classList.add("resolving");

  try {
    const response = await askBackground({
      type: "OPEN_EPISODE",
      item: {
        title: item.title,
        slug: item.id,
        episodeNumber: item.episodeNumber,
        seriesId: item.seriesId || ""
      },
      fallbackUrl: anchor.href
    });

    if (response && response.url) {
      // Guarda o endereço resolvido: o próximo clique (ou copiar o link) já vai direto.
      anchor.href = response.url;
      if (response.state === "episode") anchor.dataset.resolved = "episode";
      else if (response.state === "series") anchor.dataset.resolved = "series";
      return;
    }

    // Último recurso: abre o que já estava no href.
    window.open(anchor.href, "_blank", "noreferrer");
  } catch (err) {
    window.open(anchor.href, "_blank", "noreferrer");
  } finally {
    anchor.classList.remove("resolving");
  }
}



/* ------------------- Alterar fila e Crunchylists ------------------- */

// Só dá para alterar o que tem id interno da Crunchyroll e sessão válida.
function canEditLists(item) {
  return hasExtensionRuntime() && !!(item && item.seriesId) && !!queueIndex;
}

// Em quais Crunchylists a série está. Vazio quando os marcadores estão
// desligados — aí o painel só oferece adicionar.
function listsContaining(item) {
  if (!showListMarks) return [];
  return customLists.filter((list) => indexHas(listIndexes.get(list.id), item));
}

async function applyMembership(item, target, action, listTitle) {
  const result = await askBackground({
    type: "CHANGE_MEMBERSHIP",
    contentId: item.seriesId,
    target,
    action
  });

  if (result.state !== "ok") {
    const motivo =
      result.state === "no-session" ? t("action.needSession") : result.message || t("queue.unknownError");
    setQueueStatus(t("write.failed", { message: motivo }), "error");
    return false;
  }

  // Mantém os índices locais coerentes sem refazer a rede.
  const chaves = entryKeys(item);
  const alvo =
    target.kind === "list" ? listIndexes.get(target.listId) : queueIndex;

  if (alvo && alvo.keys) {
    if (action === "add") {
      for (const chave of chaves) alvo.keys.add(chave);
      alvo.size += 1;
    } else {
      for (const chave of chaves) alvo.keys.delete(chave);
      alvo.size = Math.max(0, alvo.size - 1);
    }
  }

  const naLista = target.kind === "list";
  const chaveTexto =
    result.outcome === "already"
      ? naLista ? "write.alreadyList" : "write.alreadyQueue"
      : action === "add"
        ? naLista ? "write.addedList" : "write.addedQueue"
        : naLista ? "write.removedList" : "write.removedQueue";

  setQueueStatus(t(chaveTexto, { title: item.title, list: listTitle || "" }), "ok");

  // O filtro pode depender do que acabou de mudar.
  if (filterSource === FILTER_QUEUE) filterIndex = queueIndex;
  else if (naLista && filterSource === target.listId) filterIndex = listIndexes.get(target.listId);

  render(lastItems);
  return true;
}

function buildQueueButton(item) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "cardbtn";

  const dentro = isInQueue(item);
  botao.textContent = t(dentro ? "action.inQueue" : "action.addQueue");
  botao.title = t(dentro ? "action.queueRemoveTitle" : "action.queueAddTitle");
  botao.classList.toggle("on", dentro);

  botao.addEventListener("click", async () => {
    if (botao.disabled) return;
    botao.disabled = true;
    await applyMembership(item, { kind: "queue" }, dentro ? "remove" : "add");
    botao.disabled = false;
  });

  return botao;
}

function buildListsButton(item) {
  const envoltorio = document.createElement("div");
  envoltorio.className = "listwrap";

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "cardbtn";
  botao.textContent = t("action.lists");
  botao.title = t("action.listsTitle");

  const painel = document.createElement("div");
  painel.className = "listmenu";
  painel.hidden = true;

  botao.addEventListener("click", () => {
    // Um painel aberto por vez.
    for (const outro of document.querySelectorAll(".listmenu")) {
      if (outro !== painel) outro.hidden = true;
    }
    painel.hidden = !painel.hidden;
    if (!painel.hidden) preencherPainel(painel, item);
  });

  envoltorio.append(botao, painel);
  return envoltorio;
}

function preencherPainel(painel, item) {
  painel.replaceChildren();

  if (!customLists.length) {
    const vazio = document.createElement("div");
    vazio.className = "listmenu-empty";
    vazio.textContent = t("action.noLists");
    painel.append(vazio);
    return;
  }

  const dentroDe = new Set(listsContaining(item).map((list) => list.id));

  for (const list of customLists) {
    const linha = document.createElement("button");
    linha.type = "button";
    linha.className = "listmenu-item";

    const marcado = dentroDe.has(list.id);
    // Sem marcadores carregados não dá para saber o estado, então o painel
    // age como "adicionar"; a API responde 409 se já estiver lá.
    linha.classList.toggle("on", showListMarks && marcado);
    linha.textContent = (showListMarks ? (marcado ? "✓ " : "+ ") : "+ ") +
      (list.title || t("filter.listUnnamed"));

    linha.addEventListener("click", async () => {
      if (linha.disabled) return;
      linha.disabled = true;
      const acao = showListMarks && marcado ? "remove" : "add";
      const ok = await applyMembership(item, { kind: "list", listId: list.id }, acao, list.title);
      linha.disabled = false;
      if (ok) painel.hidden = true;
    });

    painel.append(linha);
  }
}

function buildCardActions(item) {
  const linha = document.createElement("div");
  linha.className = "cardactions";
  linha.append(buildQueueButton(item), buildListsButton(item));
  return linha;
}

// Chips com as Crunchylists que já contêm a série.
function buildListMarks(item) {
  const listas = listsContaining(item);
  if (!listas.length) return null;

  const caixa = document.createElement("div");
  caixa.className = "listmarks";
  for (const list of listas) {
    const chip = document.createElement("span");
    chip.className = "listmark";
    chip.textContent = list.title || t("filter.listUnnamed");
    caixa.append(chip);
  }
  return caixa;
}

// Carrega o conteúdo de todas as Crunchylists — uma requisição por lista,
// guardada em cache. É por isso que os marcadores são opcionais.
async function loadAllListIndexes() {
  if (!customLists.length) return;

  const faltando = customLists.filter((list) => !listIndexes.has(list.id));
  if (!faltando.length) return;

  setQueueStatus(t("marks.loading"));

  for (const list of faltando) {
    const result = await askBackground({ type: "GET_CUSTOM_LIST", listId: list.id });
    if (result.state === "ok") {
      listIndexes.set(list.id, buildQueueIndex(result.entries || []));
    } else if (result.state === "no-session") {
      setQueueStatus(t("action.needSession"), "warn");
      return;
    }
  }
}

async function setShowListMarks(enabled) {
  showListMarks = !!enabled;
  writeFlag(MARKS_STORAGE_KEY, showListMarks);

  if (showListMarks) await loadAllListIndexes();
  render(lastItems);
}


/* --------------------- Navegação entre semanas --------------------- */

// Domingo da semana exibida, mesmo quando a fonte não informou a janela.
function displayedWeekStart() {
  if (weekWindow) return weekWindow.start;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + weekOffset * 7);
  return start;
}

function updateWeekUi() {
  const start = displayedWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const format = (date) =>
    date.toLocaleDateString(dateLocale(), { day: "2-digit", month: "short" });

  const range = document.getElementById("weekRange");
  if (range) range.textContent = t("week.rangeLabel", { start: format(start), end: format(end) });

  const relative = document.getElementById("weekRelative");
  if (relative) {
    // Passado e futuro têm redações diferentes; usar a mesma fazia a semana
    // seguinte aparecer como "1 semana atrás".
    relative.textContent =
      weekOffset === 0
        ? t("week.thisWeek")
        : weekOffset < 0
          ? tn("week.past", -weekOffset)
          : tn("week.future", weekOffset);
  }

  const thisWeek = document.getElementById("thisWeek");
  if (thisWeek) thisWeek.hidden = weekOffset === 0;
}

function goToWeek(offset) {
  const next = Math.trunc(offset);
  if (next === weekOffset) return;
  weekOffset = next;
  updateWeekUi();
  load();
}


/* --------------------------- Idioma --------------------------- */

function buildLanguageOptions() {
  const select = document.getElementById("language");
  if (!select) return;

  select.replaceChildren();
  for (const language of LANGUAGES) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.label;
    select.append(option);
  }
  select.value = getLanguage();
}

// Troca o idioma sem recarregar a página: reaplica os textos estáticos e
// redesenha o que foi gerado em JavaScript.
function changeLanguage(code) {
  if (setLanguage(code) !== code) return;

  applyStaticTranslations();
  buildLanguageOptions();
  updateWeekUi();

  // Os rotulos de episodio foram montados no idioma anterior.
  clearScheduleCache();

  // Rótulos dos episódios foram montados no idioma anterior: recarrega os
  // dados para que fonte e textos fiquem coerentes.
  load();
}


/* --------------------------- Inicialização --------------------------- */

document.getElementById("refresh").addEventListener("click", () => load());
document.getElementById("syncQueue").addEventListener("click", () => syncQueue({ interactive: true }));
document.getElementById("filterSource").addEventListener("change", (event) => setFilterSource(event.target.value));
document.getElementById("showUpcoming").addEventListener("change", (event) => setShowUpcoming(event.target.checked));
document.getElementById("showListMarks").addEventListener("change", (event) => setShowListMarks(event.target.checked));
// Clique fora fecha o painel de listas aberto.
document.addEventListener("click", (event) => {
  if (event.target.closest && event.target.closest(".listwrap")) return;
  for (const painel of document.querySelectorAll(".listmenu")) painel.hidden = true;
});
document.getElementById("language").addEventListener("change", (event) => changeLanguage(event.target.value));
document.getElementById("prevWeek").addEventListener("click", () => goToWeek(weekOffset - 1));
document.getElementById("nextWeek").addEventListener("click", () => goToWeek(weekOffset + 1));
document.getElementById("thisWeek").addEventListener("click", () => goToWeek(0));

(async function start() {
  await initLanguage();
  showUpcoming = await readFlag(UPCOMING_STORAGE_KEY);
  showListMarks = await readFlag(MARKS_STORAGE_KEY);
  applyStaticTranslations();
  buildLanguageOptions();
  rebuildFilterOptions();
  updateWeekUi();
  load();
})();
