// Textos da interface em inglês (padrão) e português do Brasil.
//
// Usa uma tabela própria em vez de chrome.i18n porque chrome.i18n segue o
// idioma do navegador e não pode ser trocado pelo usuário em tempo de
// execução. O idioma escolhido fica em chrome.storage.local (ou localStorage,
// quando a página roda fora da extensão).
"use strict";

const I18N_STORAGE_KEY = "uiLanguage";
const DEFAULT_LANGUAGE = "en";

const LANGUAGES = [
  { code: "en", label: "English", dateLocale: "en-US", crLocale: "en-US" },
  { code: "pt-BR", label: "Português (Brasil)", dateLocale: "pt-BR", crLocale: "pt-BR" }
];

const STRINGS = {
  en: {
    "app.name": "Anime calendar",
    "app.tagline": "A stand-in for Crunchyroll's retired calendar",
    "action.refresh": "Refresh",
    "action.syncQueue": "Sync queue",
    "action.season": "Season on Crunchyroll ↗",
    "language.label": "Language",

    "intro.eyebrow": "WEEKLY SCHEDULE",
    "intro.heading": "What's out today?",
    "intro.note": "Times are converted to your browser's time zone from the exact instant the source reports.",
    "week.previous": "Previous week",
    "week.next": "Next week",
    "week.current": "This week",
    "week.thisWeek": "This week",
    "week.past.one": "1 week ago",
    "week.past.other": "{count} weeks ago",
    "week.rangeLabel": "{start} – {end}",
    "week.navUnavailable": "Week navigation needs the main source, which is unavailable right now.",

    "source.preparing": "Preparing source…",
    "source.querying": "Querying source…",
    "source.anilist": "AniList (current week)",
    "source.fallback": "Backup source",
    "source.unavailable": "Source unavailable",

    "status.loading": "Loading releases…",
    "status.fetching": "Fetching the weekly schedule…",
    "status.found.one": "{count} release found.",
    "status.found.other": "{count} releases found.",
    "status.error": "Failed to load: {message}",

    "note.anilistTime": " Times shown are the Japanese premiere, in your time zone.",
    "note.fallback": " The main source failed ({message}); this data comes from the backup schedule.",
    "note.stale": " Heads up: the newest release from this source is from {date}, so the source is behind — episode numbers may not match the current week.",

    "error.noneThisWeek": "No Crunchyroll releases this week.",
    "error.fallbackHttp": "The backup source responded HTTP {status}",
    "error.fallbackEmpty": "The backup source loaded, but no release could be recognized.",
    "error.detailsTitle": "Error details",
    "error.openFallback": "Open backup source ↗",

    "day.today": "TODAY",
    "day.empty": "No releases found.",
    "day.emptyFiltered": "Nothing from this filter on this day.",

    "episode.label": "Episode {number}",
    "episode.linkTitle": "Open the episode on Crunchyroll",

    "queue.flag": "✓ In queue",
    "queue.flagTitle": "This series is in your Crunchyroll queue",
    "queue.idle": "Crunchyroll queue: not synced.",
    "queue.checking": "Checking your Crunchyroll session…",
    "queue.searching": "Looking for your Crunchyroll session…",
    "queue.noRuntime": "Queue unavailable: open the calendar through the extension to sync.",
    "queue.empty": "Your Crunchyroll queue is empty — nothing to mark.",
    "queue.synced": "Queue synced: {total} {totalWord}, {marked} {markedWord} with ✓.",
    "queue.record.one": "record",
    "queue.record.other": "records",
    "queue.marked.one": "release marked",
    "queue.marked.other": "releases marked",
    "queue.noSessionInteractive": "Could not reach your queue: sign in to Crunchyroll in this browser and try again.",
    "queue.noSession": "Queue not synced. Sign in to Crunchyroll and use “Sync queue”.",
    "queue.failed": "Could not sync the queue: {message}. The calendar keeps working without marks.",
    "queue.unknownError": "unknown error",

    "filter.label": "Show",
    "filter.all": "All releases",
    "filter.queue": "My queue ({count})",
    "filter.queueLocked": "My queue — sync first",
    "filter.hintLocked": "Sync the queue to filter by queue or by a Crunchylist.",
    "filter.hintAll.one": "{count} release this week.",
    "filter.hintAll.other": "{count} releases this week.",
    "filter.hintUnavailable": "Filter unavailable: sync your Crunchyroll queue.",
    "filter.hintFiltered": "{visible} of {total} releases in {label}.",
    "filter.labelQueue": "your queue",
    "filter.labelGeneric": "the filter",
    "filter.listLoading": "Loading the Crunchylist…",
    "filter.listUnnamed": "Unnamed Crunchylist",
    "filter.listNoSession": "Could not read the Crunchylist: sign in to Crunchyroll and sync again.",
    "filter.listFailed": "Could not read the Crunchylist: {message}.",

    "footer.dataTitle": "About the data:",
    "footer.data": "the schedule comes from AniList's public API, filtered to titles that link to Crunchyroll, always for the current week. The time shown is the Japanese premiere converted to your time zone; the Crunchyroll unlock usually follows from a few minutes to about two hours later. Neither source is affiliated with Crunchyroll.",
    "footer.structure": "If a source changes its structure, reading it may fail. Use Refresh to try again.",
    "footer.linksTitle": "About the links:",
    "footer.links": "the source usually reports the series address on Crunchyroll, already carrying the internal identifier. The exact episode address is resolved on click, using your session. Without a session the link opens the series page; when not even the series can be identified confidently, it falls back to search — instead of opening the wrong anime.",
    "footer.queueTitle": "About the queue:",
    "footer.queue": "the ✓ In queue mark reuses the session you already have open on Crunchyroll, with the same authorization the site itself uses. The extension never asks for or stores a password, cookie or token on disk. The mark means the series is in your queue — not that the episode was watched. The filter accepts the whole queue or one of your Crunchylists. Crunchyroll may return translated titles while the source uses English names, so matching relies on the series slug (identical in every language) and queries the queue in two languages. Without a confident match, the release stays unmarked.",

    "popup.tagline": "Crunchyroll Calendar Revival",
    "popup.body": "The Calendar entry is added to Crunchyroll's menu automatically when you open the site.",
    "popup.open": "Open calendar",

    "api.accountHttp": "Crunchyroll responded HTTP {status} while identifying the account.",
    "api.accountJson": "The account identification response is not valid JSON.",
    "api.accountMissing": "Could not find the account id in the response.",
    "api.accountFailed": "Failed to identify the account.",
    "api.network": "Network error while contacting Crunchyroll.",
    "api.queueNetwork": "Network error while reading the queue.",
    "api.queueHttp": "Crunchyroll responded HTTP {status} while reading the queue.",
    "api.queueJson": "The queue response is not valid JSON.",
    "api.queueShape": "The queue response is not in the expected format.",
    "api.queueFailed": "Failed to read the queue.",
    "api.http": "Crunchyroll responded HTTP {status}.",
    "api.json": "Crunchyroll returned invalid JSON.",
    "api.listsShape": "The Crunchylists response is not in the expected format.",
    "api.listShape": "The Crunchylist response is not in the expected format.",
    "api.listInvalid": "Invalid Crunchylist.",
    "api.requestFailed": "Failed to contact Crunchyroll.",
    "api.openTabFailed": "Could not open Crunchyroll in a background tab.",
    "api.sessionUnavailable": "Crunchyroll session unavailable.",
    "anilist.http": "AniList responded HTTP {status}",
    "anilist.json": "AniList returned invalid JSON",
    "anilist.rejected": "AniList rejected the query: {message}",
    "anilist.shape": "The AniList response is not in the expected format",

    "nav.home": "Go to Crunchyroll",
    "nav.calendar": "Calendar",
    "nav.calendarAria": "Open the anime release calendar",
    "nav.calendarTitle": "Release calendar"
  },

  "pt-BR": {
    "app.name": "Calendário de animes",
    "app.tagline": "Uma alternativa ao antigo calendário da Crunchyroll",
    "action.refresh": "Atualizar",
    "action.syncQueue": "Sincronizar fila",
    "action.season": "Temporada na Crunchyroll ↗",
    "language.label": "Idioma",

    "intro.eyebrow": "AGENDA SEMANAL",
    "intro.heading": "O que sai hoje?",
    "intro.note": "Horários convertidos para o fuso do seu navegador a partir do instante exato informado pela fonte.",
    "week.previous": "Semana anterior",
    "week.next": "Semana seguinte",
    "week.current": "Semana atual",
    "week.thisWeek": "Esta semana",
    "week.past.one": "1 semana atrás",
    "week.past.other": "{count} semanas atrás",
    "week.rangeLabel": "{start} – {end}",
    "week.navUnavailable": "A navegação entre semanas depende da fonte principal, que está indisponível agora.",

    "source.preparing": "Preparando fonte…",
    "source.querying": "Consultando fonte…",
    "source.anilist": "AniList (semana atual)",
    "source.fallback": "Fonte de reserva",
    "source.unavailable": "Fonte indisponível",

    "status.loading": "Carregando lançamentos…",
    "status.fetching": "Buscando a programação semanal…",
    "status.found.one": "{count} lançamento encontrado.",
    "status.found.other": "{count} lançamentos encontrados.",
    "status.error": "Erro ao carregar: {message}",

    "note.anilistTime": " Horários são da estreia no Japão, no fuso do seu navegador.",
    "note.fallback": " A fonte principal falhou ({message}); estes dados vêm da programação de reserva.",
    "note.stale": " Atenção: o último lançamento desta fonte é de {date}, ou seja, a fonte está atrasada — os números de episódio podem não ser os da semana atual.",

    "error.noneThisWeek": "Nenhum lançamento da Crunchyroll nesta semana.",
    "error.fallbackHttp": "A fonte de reserva respondeu HTTP {status}",
    "error.fallbackEmpty": "A fonte de reserva carregou, mas nenhum lançamento foi reconhecido.",
    "error.detailsTitle": "Detalhes do erro",
    "error.openFallback": "Abrir fonte de reserva ↗",

    "day.today": "HOJE",
    "day.empty": "Nenhum lançamento encontrado.",
    "day.emptyFiltered": "Nada deste filtro neste dia.",

    "episode.label": "Episódio {number}",
    "episode.linkTitle": "Abrir o episódio na Crunchyroll",

    "queue.flag": "✓ Na fila",
    "queue.flagTitle": "Esta série está na sua fila da Crunchyroll",
    "queue.idle": "Fila da Crunchyroll: não sincronizada.",
    "queue.checking": "Verificando sua sessão da Crunchyroll…",
    "queue.searching": "Procurando sua sessão da Crunchyroll…",
    "queue.noRuntime": "Fila indisponível: abra o calendário pela extensão para sincronizar.",
    "queue.empty": "Sua fila da Crunchyroll está vazia — nada a marcar.",
    "queue.synced": "Fila sincronizada: {total} {totalWord}, {marked} {markedWord} com ✓.",
    "queue.record.one": "registro",
    "queue.record.other": "registros",
    "queue.marked.one": "lançamento marcado",
    "queue.marked.other": "lançamentos marcados",
    "queue.noSessionInteractive": "Não foi possível acessar sua fila: entre na Crunchyroll neste navegador e tente novamente.",
    "queue.noSession": "Fila não sincronizada. Entre na Crunchyroll e use “Sincronizar fila”.",
    "queue.failed": "Não foi possível sincronizar a fila: {message}. O calendário continua funcionando sem marcações.",
    "queue.unknownError": "erro desconhecido",

    "filter.label": "Mostrar",
    "filter.all": "Todos os lançamentos",
    "filter.queue": "Minha fila ({count})",
    "filter.queueLocked": "Minha fila — sincronize primeiro",
    "filter.hintLocked": "Sincronize a fila para filtrar pela fila ou por uma Crunchylist.",
    "filter.hintAll.one": "{count} lançamento nesta semana.",
    "filter.hintAll.other": "{count} lançamentos nesta semana.",
    "filter.hintUnavailable": "Filtro indisponível: sincronize a fila da Crunchyroll.",
    "filter.hintFiltered": "{visible} de {total} lançamentos em {label}.",
    "filter.labelQueue": "sua fila",
    "filter.labelGeneric": "o filtro",
    "filter.listLoading": "Carregando a Crunchylist…",
    "filter.listUnnamed": "Crunchylist sem nome",
    "filter.listNoSession": "Não foi possível ler a Crunchylist: entre na Crunchyroll e sincronize novamente.",
    "filter.listFailed": "Não foi possível ler a Crunchylist: {message}.",

    "footer.dataTitle": "Sobre os dados:",
    "footer.data": "a programação vem da API pública do AniList, filtrada para os títulos com link da Crunchyroll, sempre na semana corrente. O horário mostrado é o da estreia no Japão convertido para o seu fuso; o desbloqueio na Crunchyroll costuma vir de alguns minutos a cerca de duas horas depois. Nenhuma das fontes é afiliada à Crunchyroll.",
    "footer.structure": "Se uma fonte mudar sua estrutura, a leitura pode falhar. Use Atualizar para tentar novamente.",
    "footer.linksTitle": "Sobre os links:",
    "footer.links": "a fonte costuma informar o endereço da série na Crunchyroll, já com o identificador interno. O endereço do episódio exato é descoberto no clique, usando sua sessão. Sem sessão, o link abre a página da série; quando nem a série pode ser identificada com segurança, cai na busca — em vez de abrir o anime errado.",
    "footer.queueTitle": "Sobre a fila:",
    "footer.queue": "a marcação ✓ Na fila reaproveita a sessão que você já tem aberta na Crunchyroll, usando a mesma autorização que o próprio site utiliza. A extensão não pede nem guarda senha, cookie ou token em disco. A marcação indica que a série está na sua fila — não que o episódio já foi assistido. O filtro aceita a fila inteira ou uma das suas Crunchylists. A Crunchyroll pode devolver títulos traduzidos enquanto a fonte usa os nomes em inglês; por isso a comparação usa o slug da série (igual em todos os idiomas) e consulta a fila nos dois idiomas. Sem correspondência confiável, o lançamento fica sem marcação.",

    "popup.tagline": "Crunchyroll Calendar Revival",
    "popup.body": "O item Calendário é adicionado automaticamente ao menu da Crunchyroll quando você abre o site.",
    "popup.open": "Abrir calendário",

    "api.accountHttp": "A Crunchyroll respondeu HTTP {status} ao identificar a conta.",
    "api.accountJson": "A resposta de identificação da conta não é um JSON válido.",
    "api.accountMissing": "Não foi possível identificar o id da conta na resposta.",
    "api.accountFailed": "Falha ao identificar a conta.",
    "api.network": "Falha de rede ao consultar a Crunchyroll.",
    "api.queueNetwork": "Falha de rede ao consultar a fila.",
    "api.queueHttp": "A Crunchyroll respondeu HTTP {status} ao consultar a fila.",
    "api.queueJson": "A resposta da fila não é um JSON válido.",
    "api.queueShape": "A resposta da fila não tem o formato esperado.",
    "api.queueFailed": "Falha ao consultar a fila.",
    "api.http": "A Crunchyroll respondeu HTTP {status}.",
    "api.json": "A Crunchyroll devolveu um JSON inválido.",
    "api.listsShape": "A resposta das Crunchylists não tem o formato esperado.",
    "api.listShape": "A resposta da Crunchylist não tem o formato esperado.",
    "api.listInvalid": "Crunchylist inválida.",
    "api.requestFailed": "Falha ao consultar a Crunchyroll.",
    "api.openTabFailed": "Não foi possível abrir a Crunchyroll em segundo plano.",
    "api.sessionUnavailable": "Sessão da Crunchyroll indisponível.",
    "anilist.http": "O AniList respondeu HTTP {status}",
    "anilist.json": "O AniList devolveu um JSON inválido",
    "anilist.rejected": "O AniList recusou a consulta: {message}",
    "anilist.shape": "A resposta do AniList não tem o formato esperado",

    "nav.home": "Ir para a Crunchyroll",
    "nav.calendar": "Calendário",
    "nav.calendarAria": "Abrir o calendário de lançamentos de animes",
    "nav.calendarTitle": "Calendário de lançamentos"
  }
};

let currentLanguage = DEFAULT_LANGUAGE;

function isSupportedLanguage(code) {
  return LANGUAGES.some((language) => language.code === code);
}

function languageInfo(code) {
  return LANGUAGES.find((language) => language.code === (code || currentLanguage)) || LANGUAGES[0];
}

function dateLocale() {
  return languageInfo().dateLocale;
}

function crunchyrollLocale(code) {
  return languageInfo(code).crLocale;
}

// Substitui {chaves} pelos valores informados. Valores são inseridos como
// texto pelo chamador (nunca via innerHTML), então não há interpolação de HTML.
function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

function t(key, params) {
  const table = STRINGS[currentLanguage] || STRINGS[DEFAULT_LANGUAGE];
  let text = table[key];
  if (text === undefined) text = STRINGS[DEFAULT_LANGUAGE][key];
  if (text === undefined) return key;
  return interpolate(text, params);
}

// Plural simples: procura "<chave>.one" ou "<chave>.other".
function tn(key, count, params) {
  const suffix = count === 1 ? ".one" : ".other";
  return t(key + suffix, Object.assign({ count }, params || {}));
}

// Nomes dos dias gerados pelo próprio Intl, para não manter listas por idioma.
function weekdayNames() {
  const formatter = new Intl.DateTimeFormat(dateLocale(), { weekday: "long" });
  const names = [];
  // 2023-01-01 foi um domingo: base estável para percorrer a semana.
  for (let day = 0; day < 7; day++) {
    const date = new Date(2023, 0, 1 + day);
    const name = formatter.format(date);
    names.push(name.charAt(0).toUpperCase() + name.slice(1));
  }
  return names;
}

async function readStoredLanguage() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const stored = await chrome.storage.local.get(I18N_STORAGE_KEY);
      const code = stored && stored[I18N_STORAGE_KEY];
      if (isSupportedLanguage(code)) return code;
      return "";
    }
    const code = localStorage.getItem(I18N_STORAGE_KEY);
    return isSupportedLanguage(code) ? code : "";
  } catch (err) {
    return "";
  }
}

async function storeLanguage(code) {
  if (!isSupportedLanguage(code)) return;
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [I18N_STORAGE_KEY]: code });
      return;
    }
    localStorage.setItem(I18N_STORAGE_KEY, code);
  } catch (err) {
    /* preferência não persistida; a sessão atual continua no idioma escolhido */
  }
}

// Idioma salvo, senão o padrão (inglês). O idioma do navegador não é adotado
// automaticamente para que o padrão público seja previsível.
async function initLanguage() {
  const stored = await readStoredLanguage();
  currentLanguage = stored || DEFAULT_LANGUAGE;
  return currentLanguage;
}

// Define o idioma sem gravar a preferência. Usada pelo service worker, que
// só reflete a escolha feita na página.
function applyLanguage(code) {
  if (!isSupportedLanguage(code)) return currentLanguage;
  currentLanguage = code;
  return currentLanguage;
}

function setLanguage(code) {
  if (!isSupportedLanguage(code)) return currentLanguage;
  currentLanguage = code;
  storeLanguage(code);
  return currentLanguage;
}

function getLanguage() {
  return currentLanguage;
}

// Aplica os textos marcados no HTML. Só usa textContent e atributos —
// nenhuma string passa por innerHTML.
function applyStaticTranslations(root) {
  const scope = root || document;

  for (const el of scope.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.getAttribute("data-i18n"));
  }
  for (const el of scope.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.getAttribute("data-i18n-title"));
  }
  for (const el of scope.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  }
  if (scope === document) {
    document.documentElement.lang = currentLanguage;
    const title = document.querySelector("title[data-i18n-doc]");
    if (title) document.title = t(title.getAttribute("data-i18n-doc"));
  }
}
