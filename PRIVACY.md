# Privacy Policy — Anime Release Calendar

_Last updated: 2026-10-26_

This extension shows a weekly anime release calendar and links each episode on
Crunchyroll. This policy describes exactly what it touches.

## Summary

The extension sends **no data to the developer or to any third-party server**.
There is no analytics, no tracking, no advertising, and no account of any kind.
Everything it reads stays inside your own browser.

## What the extension accesses

**Your Crunchyroll session (authentication token).**
To show which series are in your queue or in a Crunchylist, the extension needs
to talk to Crunchyroll as you. It never asks for your password and never reads
your cookies. Instead, while you are on crunchyroll.com, it observes the
authorization header that the Crunchyroll page itself already sends with its own
requests, and reuses it.

- The token is kept in `chrome.storage.session`, which lives in memory only and
  is erased when the browser closes.
- It is **never written to disk** and **never sent anywhere except
  crunchyroll.com**, which issued it.
- It is discarded immediately if Crunchyroll rejects it.

**Your Crunchyroll queue and Crunchylists.**
Read only to mark and filter releases in the calendar. The titles are held in
memory for the open page and are not stored or transmitted.

**Your language preference.**
Stored locally (`chrome.storage.local`) so the interface opens in the language
you chose.

**A cache of public series identifiers.**
Stored locally to avoid repeating lookups. These identifiers are public catalog
data, not personal information.

## Network requests

The extension contacts only these hosts, and only for the stated purpose:

| Host | Purpose |
|---|---|
| `graphql.anilist.co` | Fetch the weekly release schedule (public API, no account) |
| `www.crunchyroll.com` | Read your queue/Crunchylists and resolve episode links, using your existing session |
| `www.anidachi.app` | Backup schedule source, used only if AniList fails |

No request carries any identifier created by the extension.

## What the extension does not do

- Does not collect or transmit personal information.
- Does not sell or share data with anyone.
- Does not use data for advertising, credit, or lending purposes.
- Does not read pages other than crunchyroll.com.
- Does not load or execute remote code; all code ships inside the package.

## Permissions

- `storage` — language preference, public identifier cache, and the in-memory
  session token.
- Access to `crunchyroll.com` — add the calendar entry to the menu and read your
  queue and Crunchylists.
- Access to `graphql.anilist.co` and `www.anidachi.app` — fetch the schedule.

## Removing your data

Uninstalling the extension removes everything it stored. Closing the browser
already clears the session token.

## Affiliation

This extension is not affiliated with, endorsed by, or sponsored by Crunchyroll,
AniList, or AniDachi.

## Contact

Questions or problems: open an issue at
<https://github.com/Adriano-w/anime-release-calendar/issues>.
