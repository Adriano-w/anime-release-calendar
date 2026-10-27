// Service worker: consulta a fila da Crunchyroll reaproveitando o cabeçalho
// Authorization que a própria página já usa (capturado por cr-auth-capture.js).
//
// Nada é gravado em disco: as credenciais ficam em chrome.storage.session, que
// vive só na memória da sessão do navegador, e o token é descartado assim que a
// Crunchyroll responde 401/403.
"use strict";

// Regras de correspondencia e tabela de idiomas, compartilhadas com a pagina.
importScripts("match.js", "i18n.js");

const SESSION_KEY = "crAuth";
const WATCHLIST_SIZE = 100;
const CR_ORIGIN = "https://www.crunchyroll.com";
const ACCOUNT_ENDPOINT = `${CR_ORIGIN}/accounts/v1/me`;

// O locale das consultas à Crunchyroll acompanha o idioma escolhido na
// página do calendário (padrão: inglês).
let uiLanguage = DEFAULT_LANGUAGE;
let languageReady = null;

async function refreshLanguage() {
  try {
    const stored = await chrome.storage.local.get(I18N_STORAGE_KEY);
    const code = stored && stored[I18N_STORAGE_KEY];
    uiLanguage = isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
    applyLanguage(uiLanguage);
  } catch (err) {
    uiLanguage = DEFAULT_LANGUAGE;
    applyLanguage(uiLanguage);
  }
  return uiLanguage;
}

// Lê uma única vez por ciclo de vida do service worker; invalidado quando a
// preferência muda.
function ensureLanguage() {
  if (!languageReady) languageReady = refreshLanguage();
  return languageReady;
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes && changes[I18N_STORAGE_KEY]) {
      languageReady = refreshLanguage();
    }
  });
} catch (err) {
  /* sem onChanged: o idioma é relido no próximo ciclo do worker */
}

function locale() {
  return crunchyrollLocale(uiLanguage);
}

async function getAuth() {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const auth = stored && stored[SESSION_KEY];
    return auth && typeof auth === "object" ? auth : null;
  } catch (err) {
    return null;
  }
}

async function setAuth(auth) {
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: auth });
  } catch (err) {
    /* storage indisponível: a sincronização apenas falha de forma limpa */
  }
}

// Mantém o id da conta (estável) e descarta apenas o token expirado/revogado.
async function dropToken() {
  const current = await getAuth();
  if (!current) return;
  const next = Object.assign({}, current);
  delete next.token;
  delete next.capturedAt;
  await setAuth(next);
}

function authHeaders(auth) {
  return { Authorization: auth.token, Accept: "application/json" };
}

function unauthorized() {
  const err = new Error(t("api.sessionUnavailable"));
  err.unauthorized = true;
  return err;
}

async function resolveAccountId(auth) {
  if (typeof auth.accountId === "string" && auth.accountId) return auth.accountId;

  // Endpoint observado no próprio fluxo da página da Crunchyroll.
  const response = await fetch(ACCOUNT_ENDPOINT, {
    headers: authHeaders(auth),
    cache: "no-store"
  });

  if (response.status === 401 || response.status === 403) throw unauthorized();
  if (!response.ok) throw new Error(t("api.accountHttp", { status: response.status }));

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new Error(t("api.accountJson"));
  }

  const accountId = payload && (payload.account_id || payload.accountId || payload.external_id);
  if (typeof accountId !== "string" || !accountId) {
    throw new Error(t("api.accountMissing"));
  }

  await setAuth(Object.assign({}, auth, { accountId }));
  return accountId;
}

// Prefere o nome da série; o título do episódio só entra quando o registro
// claramente não é um episódio (série ou filme na fila).
function seriesTitleOf(entry) {
  const panel = entry && entry.panel;
  if (!panel || typeof panel !== "object") return "";

  const episodeMeta =
    panel.episode_metadata ||
    (panel.episode && panel.episode.episode_metadata) ||
    null;

  const candidates = [
    episodeMeta && episodeMeta.series_title,
    panel.series_metadata && panel.series_metadata.series_title,
    panel.movie_listing_metadata && panel.movie_listing_metadata.title,
    panel.type !== "episode" ? panel.title : ""
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

// O slug da série não muda com o locale, então é a chave de comparação mais
// confiável: a fila em pt-BR pode trazer "Yomi no Tsugai - Daemons do Reino
// das Sombras" enquanto a fonte do calendário usa "Daemons of the Shadow
// Realm" — os dois têm slug daemons-of-the-shadow-realm.
function seriesSlugOf(entry) {
  const panel = entry && entry.panel;
  if (!panel || typeof panel !== "object") return "";

  const episodeMeta =
    panel.episode_metadata ||
    (panel.episode && panel.episode.episode_metadata) ||
    null;

  const candidates = [
    episodeMeta && episodeMeta.series_slug_title,
    panel.series_metadata && panel.series_metadata.series_slug_title,
    panel.type !== "episode" ? panel.slug_title : "",
    panel.type !== "episode" ? panel.slug : ""
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

// A própria resposta da fila já traz o id da série, então as séries que o
// usuário acompanha dispensam a busca ao resolver o link do episódio.
function seriesIdOf(entry) {
  const panel = entry && entry.panel;
  if (!panel || typeof panel !== "object") return "";

  const episodeMeta =
    panel.episode_metadata ||
    (panel.episode && panel.episode.episode_metadata) ||
    null;

  const candidates = [
    episodeMeta && episodeMeta.series_id,
    panel.series_metadata && panel.series_metadata.series_id,
    panel.type === "series" ? panel.id : ""
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function watchlistUrl(accountId, localeTag) {
  return (
    `${CR_ORIGIN}/content/v2/discover/${encodeURIComponent(accountId)}/watchlist` +
    `?order=desc&sort_by=date_updated&n=${WATCHLIST_SIZE}&locale=${encodeURIComponent(localeTag)}`
  );
}

// Consulta a fila em um locale. Devolve { total, entries } ou lança.
async function fetchWatchlistPage(auth, accountId, localeTag) {
  let response;
  try {
    response = await fetch(watchlistUrl(accountId, localeTag), {
      headers: authHeaders(auth),
      cache: "no-store"
    });
  } catch (err) {
    throw new Error(t("api.queueNetwork"));
  }

  if (response.status === 401 || response.status === 403) throw unauthorized();
  if (!response.ok) {
    throw new Error(t("api.queueHttp", { status: response.status }));
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new Error(t("api.queueJson"));
  }

  // Fila vazia é um resultado válido; resposta sem `data` é formato inesperado.
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error(t("api.queueShape"));
  }

  const entries = [];
  for (const item of payload.data) {
    const title = seriesTitleOf(item);
    const slug = seriesSlugOf(item);
    if (title || slug) entries.push({ title, slug, seriesId: seriesIdOf(item) });
  }

  return {
    total: Number.isFinite(payload.total) ? payload.total : payload.data.length,
    entries
  };
}

async function fetchWatchlist() {
  await ensureLanguage();

  const auth = await getAuth();
  if (!auth || typeof auth.token !== "string" || !auth.token) {
    return { state: "no-session" };
  }

  let accountId;
  try {
    accountId = await resolveAccountId(auth);
  } catch (err) {
    if (err && err.unauthorized) {
      await dropToken();
      return { state: "no-session" };
    }
    return { state: "error", message: (err && err.message) || t("api.accountFailed") };
  }

  const primary = locale();
  let result;
  try {
    result = await fetchWatchlistPage(auth, accountId, primary);
  } catch (err) {
    if (err && err.unauthorized) {
      await dropToken();
      return { state: "no-session" };
    }
    return { state: "error", message: (err && err.message) || t("api.queueFailed") };
  }

  const entries = result.entries.slice();

  // A Crunchyroll traduz parte dos títulos conforme o locale, enquanto a fonte
  // do calendário usa os títulos em inglês. Consultar também em en-US dá os dois
  // nomes da mesma série. É um reforço: se falhar, a sincronização continua
  // valendo com o locale principal (e com os slugs, que não variam).
  const secondary = /^en-/i.test(primary) ? "" : "en-US";
  if (secondary) {
    try {
      const alternate = await fetchWatchlistPage(auth, accountId, secondary);
      entries.push(...alternate.entries);
    } catch (err) {
      if (err && err.unauthorized) await dropToken();
    }
  }

  // Remove entradas repetidas (mesmo título + slug).
  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    const key = `${entry.title}\u0000${entry.slug}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  // Aproveita os ids que vieram de graça na fila.
  await warmSeriesCache(unique);

  return { state: "ok", total: result.total, entries: unique };
}

async function warmSeriesCache(entries) {
  try {
    const cache = await getSeriesCache();
    let changed = false;

    for (const entry of entries) {
      if (!entry.seriesId || !entry.slug) continue;
      const key = compactKey(entry.slug);
      if (!key || (cache[key] && cache[key].id === entry.seriesId)) continue;
      cache[key] = { id: entry.seriesId, slug: entry.slug };
      changed = true;
    }

    if (changed) await chrome.storage.local.set({ [SERIES_CACHE_KEY]: cache });
  } catch (err) {
    /* cache é otimização; seguir sem ele */
  }
}

async function waitForToken(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const auth = await getAuth();
    if (auth && auth.token && (auth.capturedAt || 0) >= start - 2000) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const auth = await getAuth();
  return !!(auth && auth.token);
}

// Abre a Crunchyroll numa aba em segundo plano só o tempo necessário para que a
// própria página faça sua troca de token; depois fecha a aba.
async function connectCrunchyroll() {
  const existing = await getAuth();
  if (existing && existing.token) return { state: "connected" };

  let tab;
  try {
    tab = await chrome.tabs.create({ url: `${CR_ORIGIN}/`, active: false });
  } catch (err) {
    return { state: "error", message: t("api.openTabFailed") };
  }

  let connected = false;
  try {
    connected = await waitForToken(20000);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch (err) {
      /* a aba pode já ter sido fechada pelo usuário */
    }
  }

  return connected ? { state: "connected" } : { state: "no-session" };
}


/* ------------------- Resolução do link do episódio -------------------
 *
 * A fonte do calendário fornece apenas título e slug, mas a URL da Crunchyroll
 * exige os ids internos. A cadeia abaixo é exatamente a que a própria página da
 * Crunchyroll usa (observada no tráfego dela):
 *
 *   /content/v2/discover/search            -> id da série
 *   /content/v2/cms/series/<id>/seasons    -> ids das temporadas
 *   /content/v2/cms/seasons/<id>/episodes  -> id e slug do episódio
 *   => /<locale>/watch/<id do episódio>/<slug do episódio>
 *
 * Os ids de série são públicos e estáveis, então ficam em cache em
 * chrome.storage.local; o resto é resolvido sob demanda, no clique.
 */

const SERIES_CACHE_KEY = "crSeriesBySlug";
const PREFERRED_AUDIO = "ja-JP";
const MAX_SEASONS_SCANNED = 4;

async function getSeriesCache() {
  try {
    const stored = await chrome.storage.local.get(SERIES_CACHE_KEY);
    const cache = stored && stored[SERIES_CACHE_KEY];
    return cache && typeof cache === "object" ? cache : {};
  } catch (err) {
    return {};
  }
}

async function rememberSeries(slugKey, series) {
  if (!slugKey || !series || !series.id) return;
  try {
    const cache = await getSeriesCache();
    cache[slugKey] = { id: series.id, slug: series.slug || "" };
    await chrome.storage.local.set({ [SERIES_CACHE_KEY]: cache });
  } catch (err) {
    /* cache é otimização; seguir sem ele */
  }
}

async function apiGet(auth, url) {
  let response;
  try {
    response = await fetch(url, { headers: authHeaders(auth), cache: "no-store" });
  } catch (err) {
    throw new Error(t("api.network"));
  }
  if (response.status === 401 || response.status === 403) throw unauthorized();
  if (!response.ok) throw new Error(t("api.http", { status: response.status }));
  try {
    return await response.json();
  } catch (err) {
    throw new Error(t("api.json"));
  }
}

// A busca agrupa resultados por tipo; aceita as duas formas (agrupada e plana).
function searchCandidates(payload) {
  const groups = payload && Array.isArray(payload.data) ? payload.data : [];
  const out = [];
  for (const group of groups) {
    if (Array.isArray(group && group.items)) {
      for (const candidate of group.items) out.push(candidate);
    } else if (group && group.id) {
      out.push(group);
    }
  }
  return out;
}

// Só aceita um resultado se ele descrever a mesma série — as mesmas regras da
// marcação da fila. Resultado duvidoso é descartado em vez de abrir o anime errado.
async function findSeries(auth, item, localeTag) {
  const slug = String(item.slug || "").replace(/^show-/, "");

  // A fonte principal já traz o id da série na URL da Crunchyroll: nesse caso
  // não há busca nenhuma, nem risco de casar com a série errada.
  if (typeof item.seriesId === "string" && item.seriesId) {
    const known = { id: item.seriesId, slug: slug };
    if (slug) await rememberSeries(compactKey(slug), known);
    return known;
  }
  const cacheKey = compactKey(slug || item.title);

  const cache = await getSeriesCache();
  if (cache[cacheKey] && cache[cacheKey].id) return cache[cacheKey];

  const term = item.title || slug.replace(/-/g, " ");
  if (!term) return null;

  const url =
    `${CR_ORIGIN}/content/v2/discover/search` +
    `?q=${encodeURIComponent(term)}&n=6&type=series&ratings=true&locale=${encodeURIComponent(localeTag)}`;

  const payload = await apiGet(auth, url);

  for (const candidate of searchCandidates(payload)) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id) continue;
    const found = { title: candidate.title, slug: candidate.slug_title || candidate.slug || "" };
    if (!sameSeries(item, found)) continue;
    const series = { id: candidate.id, slug: found.slug };
    await rememberSeries(cacheKey, series);
    return series;
  }
  return null;
}

// Temporadas da mais recente para a mais antiga: o episódio do calendário está
// no ar agora, então quase sempre é a última.
async function seasonsOf(auth, seriesId, localeTag) {
  const url =
    `${CR_ORIGIN}/content/v2/cms/series/${encodeURIComponent(seriesId)}/seasons` +
    `?force_locale=&preferred_audio_language=${PREFERRED_AUDIO}&locale=${encodeURIComponent(localeTag)}`;

  const payload = await apiGet(auth, url);
  const seasons = payload && Array.isArray(payload.data) ? payload.data : [];

  return seasons
    .filter((season) => season && typeof season.id === "string")
    .sort((a, b) => (Number(b.season_number) || 0) - (Number(a.season_number) || 0));
}

async function episodesOf(auth, seasonId, localeTag) {
  const url =
    `${CR_ORIGIN}/content/v2/cms/seasons/${encodeURIComponent(seasonId)}/episodes` +
    `?preferred_audio_language=${PREFERRED_AUDIO}&locale=${encodeURIComponent(localeTag)}`;

  const payload = await apiGet(auth, url);
  return payload && Array.isArray(payload.data) ? payload.data : [];
}

function episodeMatches(episode, wanted) {
  if (!episode || typeof episode.id !== "string" || !episode.id) return false;
  const candidates = [episode.episode_number, episode.sequence_number, Number(episode.episode)];
  return candidates.some((value) => Number.isFinite(Number(value)) && Number(value) === wanted);
}

// Sem prefixo de locale no caminho: a Crunchyroll insere o idioma da conta
// sozinha. Prefixar aqui gera caminho duplicado (/pt-br/en-us/...) e 404.
function seriesUrl(series) {
  const path = series.slug ? `${series.id}/${series.slug}` : series.id;
  return `${CR_ORIGIN}/series/${path}`;
}

function episodeUrl(episode) {
  const slug = episode.slug_title || episode.slug || "";
  const path = slug ? `${episode.id}/${slug}` : episode.id;
  return `${CR_ORIGIN}/watch/${path}`;
}

// Devolve { state, url }:
//   "episode" link exato | "series" página da série | "fallback" busca.
async function resolveEpisode(item, fallbackUrl) {
  await ensureLanguage();

  const auth = await getAuth();
  if (!auth || typeof auth.token !== "string" || !auth.token) {
    return { state: "fallback", url: fallbackUrl, reason: "no-session" };
  }

  const localeTag = locale();

  try {
    const series = await findSeries(auth, item, localeTag);
    if (!series) return { state: "fallback", url: fallbackUrl, reason: "no-match" };

    // Atenção: Number(null) e Number("") valem 0, então a ausência do número
    // precisa ser testada antes da conversão.
    const raw = item.episodeNumber;
    const wanted =
      raw === null || raw === undefined || raw === "" ? NaN : Number(raw);

    if (!Number.isFinite(wanted)) {
      return { state: "series", url: seriesUrl(series) };
    }

    const seasons = await seasonsOf(auth, series.id, localeTag);
    for (const season of seasons.slice(0, MAX_SEASONS_SCANNED)) {
      const episodes = await episodesOf(auth, season.id, localeTag);
      const episode = episodes.find((candidate) => episodeMatches(candidate, wanted));
      if (episode) return { state: "episode", url: episodeUrl(episode) };
    }

    // Série certa, episódio não localizado: a página da série já é melhor que a busca.
    return { state: "series", url: seriesUrl(series) };
  } catch (err) {
    if (err && err.unauthorized) await dropToken();
    return { state: "fallback", url: fallbackUrl, reason: (err && err.message) || "erro" };
  }
}

async function openEpisodeTab(item, fallbackUrl) {
  const safeFallback =
    typeof fallbackUrl === "string" && fallbackUrl.startsWith(`${CR_ORIGIN}/`)
      ? fallbackUrl
      : `${CR_ORIGIN}/`;

  const resolved = await resolveEpisode(item || {}, safeFallback);
  const url = resolved.url || safeFallback;

  try {
    await chrome.tabs.create({ url, active: true });
  } catch (err) {
    return { state: resolved.state, url, opened: false };
  }
  return { state: resolved.state, url, opened: true };
}



/* -------------------------- Crunchylists --------------------------
 *
 * Endpoints observados no próprio fluxo do site:
 *   /content/v2/<conta>/custom-lists            -> as listas do usuário
 *   /content/v2/<conta>/custom-lists/<listaId>  -> os itens de uma lista
 *
 * Os itens de uma Crunchylist são painéis de série (com id e slug), o que é
 * mais direto que a fila, cujos registros são episódios.
 */

// A resposta pode trazer o painel embrulhado ({ panel: … }) ou direto.
// Os extratores de série esperam o formato embrulhado.
function asPanelEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return entry.panel && typeof entry.panel === "object" ? entry : { panel: entry };
}

function customListsUrl(accountId, localeTag) {
  return (
    `${CR_ORIGIN}/content/v2/${encodeURIComponent(accountId)}/custom-lists` +
    `?locale=${encodeURIComponent(localeTag)}`
  );
}

function customListUrl(accountId, listId, localeTag) {
  return (
    `${CR_ORIGIN}/content/v2/${encodeURIComponent(accountId)}/custom-lists/${encodeURIComponent(listId)}` +
    `?ratings=true&locale=${encodeURIComponent(localeTag)}`
  );
}

// Abre uma chamada autenticada resolvendo a conta e tratando sessão expirada.
// handler recebe (auth, accountId, localeTag) e pode lançar.
async function withAccount(handler) {
  await ensureLanguage();

  const auth = await getAuth();
  if (!auth || typeof auth.token !== "string" || !auth.token) {
    return { state: "no-session" };
  }

  let accountId;
  try {
    accountId = await resolveAccountId(auth);
  } catch (err) {
    if (err && err.unauthorized) {
      await dropToken();
      return { state: "no-session" };
    }
    return { state: "error", message: (err && err.message) || t("api.accountFailed") };
  }

  try {
    return await handler(auth, accountId, locale());
  } catch (err) {
    if (err && err.unauthorized) {
      await dropToken();
      return { state: "no-session" };
    }
    return { state: "error", message: (err && err.message) || t("api.requestFailed") };
  }
}

function normalizeList(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = raw.list_id || raw.listId || raw.id;
  if (typeof id !== "string" || !id) return null;

  // Título em branco fica vazio: o rótulo de fallback é da interface.
  const title = typeof raw.title === "string" ? raw.title.trim() : "";

  return {
    id,
    title,
    total: Number.isFinite(raw.total) ? raw.total : null
  };
}

async function fetchCustomLists() {
  return withAccount(async (auth, accountId, localeTag) => {
    const payload = await apiGet(auth, customListsUrl(accountId, localeTag));

    // Lista vazia é resultado válido; resposta sem `data` é formato inesperado.
    if (!payload || !Array.isArray(payload.data)) {
      return { state: "error", message: t("api.listsShape") };
    }

    const lists = [];
    for (const raw of payload.data) {
      const list = normalizeList(raw);
      if (list) lists.push(list);
    }

    return { state: "ok", lists };
  });
}

async function fetchCustomList(listId) {
  if (typeof listId !== "string" || !listId) {
    return { state: "error", message: t("api.listInvalid") };
  }

  return withAccount(async (auth, accountId, localeTag) => {
    const payload = await apiGet(auth, customListUrl(accountId, listId, localeTag));

    if (!payload) {
      return { state: "error", message: t("api.listShape") };
    }

    // Os itens podem vir em `data` ou aninhados num único objeto com `items`.
    let rawItems = null;
    if (Array.isArray(payload.data)) {
      rawItems = payload.data.length === 1 && Array.isArray(payload.data[0] && payload.data[0].items)
        ? payload.data[0].items
        : payload.data;
    } else if (Array.isArray(payload.items)) {
      rawItems = payload.items;
    }

    if (!Array.isArray(rawItems)) {
      return { state: "error", message: t("api.listShape") };
    }

    const entries = [];
    for (const raw of rawItems) {
      const wrapped = asPanelEntry(raw);
      if (!wrapped) continue;
      const title = seriesTitleOf(wrapped);
      const slug = seriesSlugOf(wrapped);
      if (title || slug) entries.push({ title, slug, seriesId: seriesIdOf(wrapped) });
    }

    // Os ids vindos daqui também servem para abrir o episódio sem busca.
    await warmSeriesCache(entries);

    return { state: "ok", total: entries.length, entries };
  });
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "CR_AUTH_CAPTURED") {
    // Só aceita captura vinda de um frame da Crunchyroll.
    if (!sender || !sender.url || !sender.url.startsWith(`${CR_ORIGIN}/`)) return undefined;
    const patch = message.patch;
    if (!patch || typeof patch !== "object") return undefined;
    (async () => {
      const current = (await getAuth()) || {};
      await setAuth(Object.assign({}, current, patch));
    })();
    return undefined;
  }

  if (message.type === "GET_WATCHLIST") {
    fetchWatchlist()
      .then(sendResponse)
      .catch((err) => sendResponse({ state: "error", message: String((err && err.message) || err) }));
    return true;
  }

  if (message.type === "GET_CUSTOM_LISTS") {
    fetchCustomLists()
      .then(sendResponse)
      .catch((err) => sendResponse({ state: "error", message: String((err && err.message) || err) }));
    return true;
  }

  if (message.type === "GET_CUSTOM_LIST") {
    fetchCustomList(message.listId)
      .then(sendResponse)
      .catch((err) => sendResponse({ state: "error", message: String((err && err.message) || err) }));
    return true;
  }

  if (message.type === "OPEN_EPISODE") {
    openEpisodeTab(message.item, message.fallbackUrl)
      .then(sendResponse)
      .catch((err) => sendResponse({ state: "fallback", url: message.fallbackUrl, reason: String((err && err.message) || err) }));
    return true;
  }

  if (message.type === "CONNECT_CRUNCHYROLL") {
    connectCrunchyroll()
      .then(sendResponse)
      .catch((err) => sendResponse({ state: "error", message: String((err && err.message) || err) }));
    return true;
  }

  return undefined;
});
