// Programação semanal a partir da API pública do AniList.
//
// Por que trocar de fonte: a página de programação que a extensão usava antes
// publica uma semana estática e ficou defasada (servia 19–25/out com o dia
// corrente já em 26/out), o que fazia todo episódio aparecer um número atrás.
// O AniList devolve a janela de datas que pedirmos, com o número do episódio,
// o instante exato da estreia e, na maioria dos casos, o link da Crunchyroll
// já com o id interno da série.
//
// Limite conhecido: `airingAt` é a estreia no Japão, que antecede o
// desbloqueio na Crunchyroll de 1 a ~150 minutos (medido contra a outra fonte).
// Por isso o horário é rotulado como estreia, não como desbloqueio.
"use strict";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const ANILIST_PAGE_SIZE = 50;
const ANILIST_MAX_PAGES = 8;

const ANILIST_QUERY = `query ($start: Int, $end: Int, $page: Int) {
  Page(page: $page, perPage: ${ANILIST_PAGE_SIZE}) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      episode
      airingAt
      media {
        title { romaji english }
        coverImage { large medium color }
        externalLinks { site url }
      }
    }
  }
}`;

// Janela de uma semana no fuso do navegador, de domingo 00:00 ao domingo
// seguinte — alinhada às sete colunas do calendário. `offset` desloca em
// semanas: 0 é a atual, -1 a anterior, +1 a seguinte.
function currentWeekWindow(now, offset) {
  const reference = now instanceof Date ? now : new Date();
  const weeks = Number.isFinite(offset) ? Math.trunc(offset) : 0;

  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() + weeks * 7);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return {
    start,
    end,
    startUnix: Math.floor(start.getTime() / 1000),
    endUnix: Math.floor(end.getTime() / 1000)
  };
}

function crunchyrollLink(media) {
  const links = (media && media.externalLinks) || [];
  for (const link of links) {
    if (link && typeof link.url === "string" && /crunchyroll/i.test(link.site || "")) {
      return link.url;
    }
  }
  return "";
}

// A URL da Crunchyroll vem em dois formatos: o atual, com id e slug
// (/series/GT00384006/reborn-as-a-space-mercenary), e um legado só com o slug
// (/aoashi). Só o primeiro dá o id interno.
function parseCrunchyrollUrl(url) {
  const withId = /crunchyroll\.com\/(?:[a-z]{2}-[a-z]{2}\/)?series\/([A-Z0-9]+)\/([^/?#]+)/i.exec(url || "");
  if (withId) return { seriesId: withId[1], slug: withId[2] };

  const legacy = /crunchyroll\.com\/(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9][a-z0-9-]{2,})\/?$/i.exec(url || "");
  if (legacy) return { seriesId: "", slug: legacy[1] };

  return { seriesId: "", slug: "" };
}

function scheduleItem(entry, range) {
  const media = entry && entry.media;
  if (!media || !Number.isFinite(entry.airingAt)) return null;

  const url = crunchyrollLink(media);
  if (!url) return null; // só lançamentos que existem na Crunchyroll

  const title = (media.title && (media.title.english || media.title.romaji)) || "";
  if (!title) return null;

  const airsAt = new Date(entry.airingAt * 1000);
  if (airsAt < range.start || airsAt >= range.end) return null;

  const { seriesId, slug } = parseCrunchyrollUrl(url);
  const episodeNumber = Number.isFinite(entry.episode) ? entry.episode : null;

  // A capa vem na mesma consulta, então não custa requisição extra. Prefere a
  // versão grande porque ela ocupa a largura inteira do cartão; a pequena
  // (100x144) ficaria borrada nesse tamanho.
  const cover = media.coverImage || {};
  const image =
    (typeof cover.large === "string" && cover.large) ||
    (typeof cover.medium === "string" && cover.medium) ||
    "";

  return {
    day: airsAt.getDay(),
    date: airsAt,
    time: airsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    sortKey: airsAt.getTime(),
    title,
    image,
    accent: typeof cover.color === "string" ? cover.color : "",
    episode: episodeNumber === null ? "" : t("episode.label", { number: episodeNumber }),
    episodeNumber,
    seriesId,
    // Mesma convenção da outra fonte, para reaproveitar a correspondência por slug.
    id: slug ? `show-${slug}` : "",
    url,
    source: "anilist"
  };
}

async function requestAniListPage(start, end, page) {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { start, end, page } })
  });

  if (!response.ok) {
    throw new Error(t("anilist.http", { status: response.status }));
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new Error(t("anilist.json"));
  }

  if (payload && Array.isArray(payload.errors) && payload.errors.length) {
    const first = payload.errors[0];
    throw new Error(t("anilist.rejected", { message: (first && first.message) || "?" }));
  }

  const pageData = payload && payload.data && payload.data.Page;
  if (!pageData || !Array.isArray(pageData.airingSchedules)) {
    throw new Error(t("anilist.shape"));
  }

  return {
    entries: pageData.airingSchedules,
    hasNextPage: !!(pageData.pageInfo && pageData.pageInfo.hasNextPage)
  };
}

// Semanas já consultadas, para a navegação ir e voltar sem refazer a rede.
// Semanas passadas não mudam; a atual expira rápido porque novos episódios
// entram ao longo do dia.
const scheduleCache = new Map();
const CURRENT_WEEK_TTL = 5 * 60 * 1000;
const PAST_WEEK_TTL = 6 * 60 * 60 * 1000;

function cacheTtl(offset) {
  return offset === 0 ? CURRENT_WEEK_TTL : PAST_WEEK_TTL;
}

function clearScheduleCache() {
  scheduleCache.clear();
}

// Devolve { items, range }. Lança se a fonte falhar.
// `offset` em semanas a partir da atual (0 = atual, -1 = anterior).
async function fetchAniListSchedule(offset, now) {
  const weeks = Number.isFinite(offset) ? Math.trunc(offset) : 0;
  const cached = scheduleCache.get(weeks);
  if (cached && Date.now() - cached.at < cacheTtl(weeks)) {
    return { items: cached.items, range: cached.range };
  }

  const range = currentWeekWindow(now, offset);
  const items = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= ANILIST_MAX_PAGES) {
    const result = await requestAniListPage(range.startUnix, range.endUnix, page);

    for (const entry of result.entries) {
      const item = scheduleItem(entry, range);
      if (item) items.push(item);
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  // Uma série pode ter mais de um registro para o mesmo episódio.
  const seen = new Set();
  const unique = items.filter((item) => {
    const key = `${item.id || item.title}|${item.episodeNumber}|${item.sortKey}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  scheduleCache.set(weeks, { items: unique, range, at: Date.now() });
  return { items: unique, range };
}
