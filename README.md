# Who Has What

Compare your playgroup's Magic: The Gathering collections. Paste a list of cards, see who
has each one, how many copies they'd trade, and what those copies are currently worth.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, then:

1. Add a collection — enter a name and upload that person's collection CSV.
2. Paste the cards you're looking for, one per line.
3. Hit **Find these cards**.

To try it before collecting exports from anyone, upload the three files in `samples/`
as `alex`, `jordan` and `sam`.

## Getting collections in

Collections are uploaded as **CSV exports**, not links.

Moxfield has no public collection API — collections are private by default and their
endpoints sit behind Cloudflare, which returns 403 to anything that isn't a browser.
Archidekt's collection API requires authentication. Working around either would be
fragile and against their terms, so the app takes the export file instead. The export
is actually *better* data: it carries exact set codes and collector numbers, so each
copy gets priced as the specific printing it is rather than as a generic card name.

**Exporting from Moxfield:** open your collection → the **⋯ / Export** button above the
card list → choose CSV → download.

ManaBox, Deckbox, Archidekt and Helvault exports work too. Columns are matched by header
name rather than position, so any export with a card name column will load; set code,
collector number, quantity, tradelist count, foil and condition are picked up when present.

Re-uploading under the same name replaces that person's collection.

## What the want list accepts

Anything people actually paste:

```
// commander upgrades
Deck
4x Lightning Bolt
2 Sol Ring (C21) 263
Rhystic Study
SB: 1 Pithing Needle
```

Quantities, decklist section headers, comments, MTGO `SB:` prefixes and `*F*` foil markers
are all handled. Names are matched loosely — accents, apostrophes and punctuation don't
matter (`aangs iceberg` finds `Aang's Iceberg`), and searching one face of a split or
double-faced card finds the full printing.

## Prices

Prices come from [Scryfall](https://scryfall.com), which aggregates TCGplayer (USD) and
Cardmarket (EUR) and refreshes daily. Results are cached locally for 12 hours.

The **Price** column shows the value of the copies your group actually has, as a range
when they hold different printings. When nobody has a copy it falls back to the default
printing's price, marked `ref`. A `~` prefix means that exact finish has no listed price
(common for foil-only promos) and the price shown is another finish of the same printing.

Tick **Only count copies marked for trade** to count just the copies flagged in each
person's tradelist rather than everything they own.

## Development

```bash
npm test          # parsing and normalization tests
npm run build     # production build
npm run lint
```

Layout:

| Path | Purpose |
| --- | --- |
| `src/lib/csv.ts` | Collection export parsing, header alias matching |
| `src/lib/normalize.ts` | Card-name folding and split/DFC face keys |
| `src/lib/parseList.ts` | Want-list parsing |
| `src/lib/scryfall.ts` | Batched, throttled Scryfall lookups and pricing |
| `src/lib/search.ts` | The who-has-what query |
| `src/lib/db.ts` | libSQL storage |

Collections are stored in `data/collections.db` (gitignored).

## Deploying for the group

Storage uses libSQL, so pointing at a hosted [Turso](https://turso.tech) database is the
only change needed — a local SQLite file won't survive on serverless hosts:

```bash
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=...
```

With those set, deploy to Vercel as a normal Next.js app and everyone can upload their
own collection.

Note there's no authentication — anyone with the URL can view or replace collections.
That's fine for a private link shared with friends; put it behind auth before making it
public.

## Other TCGs

MTG only for now. The storage and matching layers are game-agnostic; adding another game
means a card/price source to sit alongside `src/lib/scryfall.ts`.
