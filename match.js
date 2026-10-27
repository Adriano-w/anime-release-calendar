// Normalização e correspondência de títulos de anime.
//
// Compartilhado entre a página do calendário e o service worker (via
// importScripts), para que a marcação da fila e a validação do resultado de
// busca da Crunchyroll usem exatamente as mesmas regras.
"use strict";

function stripDiacritics(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Forma com espaços: serve para contar palavras e remover marcadores de
// temporada. Minúsculas, sem acentos, sem pontuação.
function normalizeTitle(value) {
  return stripDiacritics(String(value || "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Forma compacta (só letras e dígitos) — é a chave de comparação. É ela que faz
// "So What's Wrong with Getting Reborn as a Goblin?" casar tanto com o slug da
// Crunchyroll ("so-whats-wrong-...") quanto com o da fonte
// ("so-what-s-wrong-..."), que pontuam o apóstrofo de formas diferentes.
function compactKey(value) {
  return normalizeTitle(value).replace(/ /g, "");
}

// Marcadores de temporada/parte no fim do título (já normalizado).
const SEASON_TAIL =
  /\s(?:(?:the )?final season|season \d+|\d+(?:st|nd|rd|th) season|part \d+|cour \d+|temporada \d+|\d+ a? ?temporada|s\d{1,2})$/;

function stripSeason(normalized) {
  let out = normalized;
  let previous;
  do {
    previous = out;
    out = out.replace(SEASON_TAIL, "").trim();
  } while (out && out !== previous);
  return out || normalized;
}

// Base antes de um subtítulo: "Série: Subtítulo" -> "Série". Só divide em
// separadores estruturais (":", travessão, " - "), nunca em espaço simples —
// é isso que impede "Sword Art Online Alternative …" de casar com
// "Sword Art Online". Exige base com 2+ palavras e 10+ caracteres.
function baseTitle(raw) {
  const head = String(raw || "").split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0];
  const normalized = normalizeTitle(head);
  if (normalized.length < 10) return "";
  if (normalized.split(" ").filter(Boolean).length < 2) return "";
  return normalized;
}

const MIN_KEY_LENGTH = 4;

function addKey(set, value) {
  const key = compactKey(value);
  if (key.length >= MIN_KEY_LENGTH) set.add(key);
}

// Chaves de um título: completo, sem temporada, base do subtítulo e base sem
// temporada.
function titleKeys(raw) {
  const keys = new Set();
  const full = normalizeTitle(raw);
  if (!full) return keys;

  addKey(keys, full);
  addKey(keys, stripSeason(full));

  const base = baseTitle(raw);
  if (base) {
    addKey(keys, base);
    addKey(keys, stripSeason(base));
  }
  return keys;
}

// O slug é o mesmo em qualquer idioma: é a chave mais confiável quando o título
// da fila vem traduzido para pt-BR e o da fonte está em inglês (por exemplo
// "Yomi no Tsugai - Daemons do Reino das Sombras" x
// "Daemons of the Shadow Realm", ambos com slug daemons-of-the-shadow-realm).
// Na fonte o slug vem no id do item ("show-<slug>").
function slugKeys(slug) {
  const keys = new Set();
  const cleaned = String(slug || "").replace(/^show-/, "");
  if (!cleaned) return keys;

  addKey(keys, cleaned);
  // O slug também pode trazer a temporada ("...-season-2").
  const spaced = normalizeTitle(cleaned);
  if (spaced) addKey(keys, stripSeason(spaced));
  return keys;
}

// Aceita strings, { title, slug } (fila) e { title, id } (fonte do calendário).
function entryKeys(entry) {
  if (entry && typeof entry === "object") {
    const keys = titleKeys(entry.title);
    for (const key of slugKeys(entry.slug || entry.id)) keys.add(key);
    return keys;
  }
  return titleKeys(entry);
}

function buildQueueIndex(entries) {
  const keys = new Set();
  let counted = 0;

  for (const entry of entries || []) {
    const own = entryKeys(entry);
    if (!own.size) continue;
    counted += 1;
    for (const key of own) keys.add(key);
  }

  return { keys, size: counted };
}

// Índice nulo (fila desconhecida) ou vazio: nunca corresponde.
function indexHas(index, item) {
  if (!index || !index.keys || !index.keys.size) return false;
  for (const key of entryKeys(item)) {
    if (index.keys.has(key)) return true;
  }
  return false;
}

// Duas entradas descrevem a mesma série?
function sameSeries(a, b) {
  const keysA = entryKeys(a);
  if (!keysA.size) return false;
  for (const key of entryKeys(b)) {
    if (keysA.has(key)) return true;
  }
  return false;
}
