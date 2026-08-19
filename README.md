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
2. Tell it who you are with the **I am** picker in the top right. It is
   remembered, so you only do this once per browser.
3. Paste the cards you're looking for, one per line.
4. Hit **Find these cards**.

To try it before collecting exports from anyone, upload the three files in `samples/`
as `alex`, `jordan` and `sam`.

## Getting collections in

Two ways: a **CSV export** from any tracker, or a **link** to a public Deckbox collection.

### CSV upload (works with every tracker)

**Exporting from Moxfield:** open your collection → the **⋯ / Export** button above the
card list → choose CSV → download.

ManaBox, Deckbox, Archidekt and Helvault exports work too. Columns are matched by header
name rather than position, so any export with a card name column will load; set code,
collector number, quantity, tradelist count, foil and condition are picked up when present.

Re-uploading under the same name replaces that person's collection.

### Deckbox link (self-updating)

Paste a public Deckbox inventory URL — `https://deckbox.org/sets/123456` — and the app
reads the collection directly. Linked collections get a **Refresh** button, so they can be
re-pulled later without anyone exporting anything.

- The collection must be public.
- Add `?s=t` to import only the cards marked for trade.
- The owner's name is taken from Deckbox if you leave the name field blank.
- Deckbox labels printings with set *names*, which are mapped to Scryfall set codes so
  copies are still priced as exact printings (~99% of rows resolve in practice).

Deckbox paginates at a fixed 30 rows and ignores page-size parameters, so a large
collection is genuinely hundreds of requests — a 19,853-card collection takes about 26
seconds. Requests run four at a time to stay a polite client, and only `deckbox.org` URLs
are accepted since the app fetches them server-side.

### Why other sites are CSV-only

Deckbox is the only major collection site that serves collections publicly, and its
robots.txt permits crawling.

**Moxfield can't be imported by link, even from a public binder.** Its robots.txt
disallows exactly the two paths that would matter:

```
Disallow: /collection/*
Disallow: /binders/*
```

and `api2.moxfield.com/robots.txt` is `Disallow: /` outright. On the wire, public binder
pages and every API endpoint return a Cloudflare WAF block to anything that isn't a
browser. There is no published API, approval process or contact route for third-party
access. So this is a policy answer rather than a technical one: the paths are off-limits
to automated clients whatever the response code says.

Archidekt's collection API exchanges an account password for a long-lived token, which is
not a reasonable thing to ask a playgroup for.

CSV export needs no credentials at all and carries exact set codes — and in Moxfield's
case a **Tradelist Count**, which almost nothing else exports and which the whole "only
copies marked for trade" feature depends on. It stays the primary path.

### Keeping collections fresh

A CSV collection is only as good as its last export, and a stale one quietly turns into
bad trade advice — you offer someone a card you traded away in June. So age is shown
wherever it costs something, not just on the collections list:

- **Collections** — the age turns amber after a fortnight and red after six weeks.
- **Search results** — a line above the table naming which columns may be out of date.
- **Trades** — on each offer, for both your collection and theirs.

A fortnight is roughly a play cycle; six weeks means it predates at least one set release.

Re-uploading reports what actually changed rather than just how big the file was —
`14 new cards, 3 gone, 6 newly up for trade` — because a re-export you can't see the
result of is one nobody does twice.

**Update** on a CSV collection sets the form up to replace it, and says where that
tracker keeps its export button. Which tracker an export came from is worked out from its
column headers, so the instructions are specific: Moxfield gets "⋯ → Export → CSV".
Exports we can't attribute stay unattributed rather than getting a guess, since wrong
instructions are worse than none. Deckbox-linked collections keep their **Refresh**
button and skip all of this.

## What the want list accepts

Anything people actually paste:

```
// commander upgrades
Deck
4x Lightning Bolt
2 Sol Ring (C21) 263
!Rhystic Study
SB: 1 Pithing Needle
```

Quantities, decklist section headers, comments, MTGO `SB:` prefixes and `*F*` foil markers
are all handled. A leading `!` marks a card as a priority — those lead the trade lists and
carry a `!` badge, so the card you actually want out of a list is not buried in it. Names are matched loosely — accents, apostrophes and punctuation don't
matter (`aangs iceberg` finds `Aang's Iceberg`), and searching one face of a split or
double-faced card finds the full printing.

## Building a deck: what am I missing?

Paste a decklist, then pick yourself under **Subtract a collection first**. Cards you
already have enough of drop out, and what remains is the gap list with who can fill it.

```
ALREADY OWN 1   STILL NEED 3   COPIES TO FIND 6   NOBODY HAS 1   COST TO FILL GAPS $16.81

Lightning Bolt    need 1                    $0.80 ref     ·        ·
Aang and Katara   need 2                    $6.68         2        ·
Aang, Air Nomad   need 3 of 4 — own 1       $1.15         ·        4
```

Partial holdings are handled: four-of a card you own one of shows as needing three, and
the value shown is the cost of the copies you still need rather than the whole playset.
Your own column is dropped from the table, since those copies have already been counted.

### Sending the gaps to a want list

Above the results is **Add to want list** — pick one of your lists (or name a new one) and
the cards you are still missing go straight onto it, quantities, priorities and printing
hints included. That is the whole point: a gap list you have typed out once is exactly
what trade matching runs on, and retyping it by hand was the only way to get it there.

Adding merges rather than appends. A card already on the list keeps the larger of the two
asks, so sending the same deck over twice does not turn one Sol Ring into two.

## Trades

The **Find cards** tab answers "who has this?". The **Trades** tab answers the question a
trade actually turns on: between you and each other person, what do they hold that you
want, and what do you hold that they want?

1. Set **I am** in the top right, if you have not already.
2. Save a want list for yourself (paste it, same format as a search).
3. Hit **Find trades**.

Each person you could trade with gets a card showing both directions side by side, with
each pile's value and the difference between them — "you'd receive $20.57 more" — so a
trade can be evened up before anyone drives anywhere. Matches only appear once *both*
people have saved want lists, since the matching runs off them.

### Want lists are named, and there can be several

A want is really "for my Atraxa deck" rather than an undifferentiated pile, so lists have
names and you can keep as many as you like. Each card in a trade shows which lists asked
for it — `for Atraxa upgrades, Cube staples` — which is the difference between "they want
this" and knowing why.

A card on two lists is still one card to find: the largest single ask wins rather than the
asks being added together, so listing Sol Ring in every deck does not ask the group for
six of them.

Naming a printing on a want line — `Dockside Extortionist (C19) 86` — records which
version you are after. Copies matching it lead the trade list and are called out; if
nobody has that exact printing, the line says so before anyone agrees to anything.

### Evening a trade up

A balance figure on its own leaves both people squinting at two columns working out which
card to pull. Under the header is the answer:

```
To even it up: Alex keeps 2× Smothering Tithe — that closes the gap from $116.46 to $19.52.
```

Only the heavier side is ever asked to drop cards, since you cannot conjure cards the
other person does not have. The pick is an exact closest-subset search over the individual
copies rather than a biggest-first grab — two small cards routinely close a gap that one
big card overshoots — and it stays quiet unless it can close at least half of the gap,
because "give up a card and the trade is 1% fairer" is not advice.

Quantities are respected in both directions: wanting 4 of a card someone has 2 of matches
2. Value counts the cheapest copies that would actually change hands, on the assumption
that whoever hands a card over parts with their least valuable printing — which also keeps
the balance figure conservative. Cards with no known price count as $0 rather than
blocking the match, so a pile's value is a floor, not a guarantee.

The **only copies marked for trade** toggle applies here too, so cards someone owns but
isn't parting with stay out of the maths.

## Card previews

Hovering a card name shows the card. In an expanded row, hovering a printing's set code
(the dotted-underlined `TLA #304`) shows *that* printing specifically — which is how you
tell a showcase or promo version from the regular one before agreeing to a trade. Previews
appear on the Trades tab too.

Images come from Scryfall's CDN and are loaded only on hover.

## The tour

The compass in the top right walks through the whole site: a dark surround with a hole cut
around whatever is being explained, and a card next to it saying what that part does. It
switches tabs as it goes, and leaves via Escape, the X, or **Skip tour** at any point.

Steps that have nothing to point at are dropped before the tour starts rather than skipped
as it runs — with no search results on screen there is no point explaining the results
table, and a counter that jumps from 7 to 11 looks broken.

### Keeping it honest

Steps live in one place, `src/lib/tour.ts`, and point at `data-tour` attributes in the
components. Two tests in `tests/tour.test.ts` keep the two in step, so a tour that has
quietly stopped describing the app fails the build rather than misleading someone:

- every step must point at a `data-tour` attribute that still exists, and
- every `data-tour` attribute must have a step explaining it.

So **adding a feature means adding a `data-tour` attribute and a step** — the second test
fails until you do. A third checks that steps pointing into tab-specific components declare
which tab they need, since otherwise the tour looks for an element that is not on screen.

Placement is a pure function in `src/lib/tourPlacement.ts` with its own tests. It is fussier
than it looks: the collections panel is taller than the space above and below it, so the
popup has to go beside it rather than off the top of the window.

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
| `src/lib/deckbox-parse.ts` | Deckbox HTML parsing (pure, no network) |
| `src/lib/deckbox.ts` | Deckbox fetching, pagination, set-code resolution |
| `src/lib/normalize.ts` | Card-name folding and split/DFC face keys |
| `src/lib/parseList.ts` | Want-list parsing |
| `src/lib/scryfall.ts` | Batched, throttled Scryfall lookups and pricing |
| `src/lib/search.ts` | The who-has-what query |
| `src/lib/deckNeed.ts` | Deck-mode subtraction rules (pure) |
| `src/lib/tradeMath.ts` | Trade quantity, value and even-up rules (pure) |
| `src/lib/collectionDiff.ts` | What changed between two uploads of a collection (pure) |
| `src/lib/trades.ts` | Two-way trade matching between people |
| `src/lib/db.ts` | libSQL storage, want lists and their migrations |
| `src/lib/auth.ts` | Session cookie signing and constant-time comparison |
| `src/lib/config.ts` | What a deploy needs set, and what is wrong when it isn't |
| `src/lib/rateLimit.ts` | Attempt limiting for the passphrase (pure) |
| `src/lib/userAgent.ts` | How this app identifies itself to Scryfall and Deckbox |
| `src/lib/tour.ts` | The guided tour's steps, and the targets they point at |
| `src/lib/tourPlacement.ts` | Where the tour popup goes (pure) |
| `src/proxy.ts` | The gate every request passes through |

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

Self-hosting on a box with a real disk instead? Set `ALLOW_LOCAL_DB=1` and it keeps using
`data/collections.db`.

**A production build with neither refuses to serve**, the same way it does with no
passphrase, and says which variable is missing. The alternative is worse than an error
page: uploads succeed, get written to a container's temporary disk, and are gone by the
time anyone looks for them.

Schema changes are applied on the first connection, so an existing database upgrades in
place — want lists saved before lists were named end up in a list called "Want list".
Which schema was last applied is recorded in the database, so only the connection that
finds it out of date does the work: an up-to-date database costs two round trips to open
rather than thirty, which is what a cold start on a serverless host is paying for.

### The group passphrase

Set `GROUP_PASSWORD` to whatever you want to tell your group, and every page and API route
sits behind it. There are no per-person accounts on purpose: a playgroup already trusts
each other, and the thing worth keeping out is the rest of the internet.

```bash
GROUP_PASSWORD="four words you can say down the phone"
```

Signing in sets a signed, httpOnly cookie that lasts 30 days. The passphrase is the
signing key, so changing it signs everybody out — which is what you want the day someone
leaves the group.

Eight wrong guesses from one address inside ten minutes and that address waits. The
counters are held in memory, so on a serverless host each instance keeps its own and a
determined guesser gets a few more tries than the number suggests — the alternative is a
database write on every attempt, which is its own way to knock the site over. It stops
the casual case; a passphrase long enough to be worth guessing at is what stops the rest.
Make it long rather than clever.

`npm run dev` has no gate, so local work is unaffected. A **production build with no
`GROUP_PASSWORD` refuses to serve**, on the grounds that an unset variable there is much
more likely to be a forgotten deploy step than a decision to publish everyone's
collection. Set `ALLOW_PUBLIC=1` if you genuinely mean it.

Copy `.env.example` to `.env.local` to fill these in locally.

## Other TCGs

MTG only for now. The storage and matching layers are game-agnostic; adding another game
means a card/price source to sit alongside `src/lib/scryfall.ts`.
