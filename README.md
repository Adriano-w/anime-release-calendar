# Anime Release Calendar

A browser extension that brings back a weekly anime release calendar and puts it
one click away inside Crunchyroll's own menu.

Not affiliated with, endorsed by, or sponsored by Crunchyroll, AniList or
AniDachi.

## What it does

- **Weekly grid**, seven columns, with the current day highlighted and the real
  date on every column header.
- **Cover art** on every release, so a title is recognisable at a glance.
- **Upcoming releases are hidden by default** — the week shows what has already
  aired. A toggle brings the rest of the week into view, and the choice sticks.
- **Week navigation** — step back to catch up on what you missed, or forward to
  see what is coming.
- **Direct episode links.** The schedule source usually carries Crunchyroll's
  internal series id; the exact episode address is resolved on click.
- **Queue marking.** Releases whose series is in your Crunchyroll queue get a
  discreet `✓`.
- **Filtering** by your whole queue or by a single Crunchylist.
- **Add or remove** a series from your queue or any Crunchylist, from the card.
- **Crunchylist marks** showing which lists a series is already in. Each list is
  read once per browser session and kept in memory, so reopening the calendar
  costs nothing; a write to a list drops just that list's copy.
- **English and Portuguese (Brazil)**, switchable in the page.

## Where the data comes from

The schedule comes from [AniList](https://anilist.co)'s public GraphQL API,
filtered to titles that link to Crunchyroll, for the week being displayed.

The time shown is the **Japanese premiere** converted to your browser's time
zone. Crunchyroll's unlock usually follows from a few minutes to about two
hours later — measured against a second source, the gap ranged from 1 to 150
minutes.

A static third-party schedule page is kept as a fallback and used only when
AniList fails. It is a weaker source: it publishes one fixed week and can lag
behind, so the extension warns when its data is not current.

## How the Crunchyroll session is used

Crunchyroll's content API rejects cookie-only requests (`401
invalid_auth_token`) and the access token lives only in the page's memory — the
`etp_rt` cookie is httpOnly.

So the extension never asks for a password and never reads cookies. A content
script running in the page's own world observes the `Authorization` header that
the Crunchyroll page already sends with its own requests, and reuses it.

The token is held in `chrome.storage.session` (memory only, cleared when the
browser closes), is never written to disk, is sent only back to crunchyroll.com,
and is discarded as soon as Crunchyroll rejects it.

See the [privacy policy](https://adriano-w.github.io/anime-release-calendar/privacy.html) for the full picture.

## Title matching

Crunchyroll may return titles translated to your locale while the schedule uses
English names — for example *Yomi no Tsugai - Daemons do Reino das Sombras*
versus *Daemons of the Shadow Realm*. Matching therefore relies on:

1. the series **slug**, which is identical in every language;
2. the title in **two locales**, queried together;
3. season-marker stripping (`Season 2`, `2nd Season`, `Temporada 2`, …).

Keys are compared in a compact form (letters and digits only), because the same
show can be spelled `so-whats-wrong-…` on one source and `so-what-s-wrong-…` on
another.

Partial matches are deliberately rejected: *Sword Art Online Alternative Gun
Gale Online* does not match *Sword Art Online*. Without a confident match, a
release stays unmarked.

## Install from source

1. Clone or download this repository.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. **Load unpacked** and select the repository folder.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Language preference, cache of public series ids, in-memory session token |
| `crunchyroll.com` | Add the menu entry; read your own queue and Crunchylists |
| `graphql.anilist.co` | Fetch the weekly schedule |
| `anidachi.app` | Fallback schedule source |

No analytics, no tracking, no remote code.

## License

MIT
