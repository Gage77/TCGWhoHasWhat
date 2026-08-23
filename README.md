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

On a touchscreen there is no hover, so **tapping** a card name or set code shows the same
card in the middle of the screen; tapping again, scrolling, or pressing Escape dismisses it.
A mouse click is left alone, because a mouse has already seen the card on its way to
clicking — in the results table that click belongs to the row underneath, which expands.
Which of the two you get is decided by the `pointerType` of the click rather than guessed
from the screen width, so a touchscreen laptop behaves correctly either way.

Images come from Scryfall's CDN and are loaded only when a preview opens.

## The tour

The compass in the top right walks through the whole site: a dark surround with a hole cut
around whatever is being explained, and a card next to it saying what that part does. It
switches tabs as it goes, and leaves via Escape, the X, or **Skip** at any point.

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
popup has to go beside it rather than off the top of the window. Its width and its assumed
height are arguments rather than constants, so on a narrow screen the popup shrinks to fit
instead of hanging off the side.

## On a phone

Most of this gets used at a table with a phone in one hand, so the phone layout is not the
desktop one with smaller margins.

**The results table becomes a list.** A column per person only works while the columns fit;
past three or four people a 640px-wide table in a horizontal scroller means swiping sideways
to find out whether anybody has a card. Under `md` the same rows render as a list instead,
with each holder as a chip — `alex 2`, `jordan 7` — under the card name, and "Nobody has
this" spelled out where there would otherwise be a row of dots. Rows expand in place exactly
as they do in the table, and both layouts are built from the same components, so there is
one place to change what a row says.

**The search comes first.** Stacked, the collections panel would sit between you and the box
you came to paste into. Once there is at least one collection to search, the order flips on
small screens and collections drop below the results, which is where you go when you want
them. With no collections yet the panel leads, because adding one is the only useful thing
to do.

**Adding a collection is behind a toggle.** It is a once-per-person job and the longest form
on the page. **Update** on a collection opens it with that person's name already filled in.

**Fields are 16px on small screens.** iOS Safari zooms in on any field it focuses whose text
is smaller than that, and does not zoom back out — so one tap on the card list would leave
the whole page magnified. A single unlayered rule in `globals.css` covers every control at
once; the `text-sm` sizing takes over from `sm` up.

Beyond that: full-width primary buttons and checkbox rows that can be tapped anywhere along,
a two-column stat block instead of a five-item wrap, a tour popup sized to the screen, and
each collection's Update/Refresh/Remove buttons on a line of their own rather than squeezed
in beside a truncated name.

## Prices

Prices come from [Scryfall](https://scryfall.com), which aggregates TCGplayer (USD) and
Cardmarket (EUR) and refreshes daily. Results are cached locally for 12 hours.

## What a card *is*, as opposed to what it costs

Prices only ever needed a card's identity, so that is all the price cache keeps. Filtering
a collection needs the other half — colour, mana value, type line, oracle text, keywords,
legalities — and that half behaves completely differently: a type line has never changed
overnight, while a price is stale by tomorrow.

So they are stored apart. Prices expire after 12 hours in `card_cache`. Facts live in
`card_facts`, keyed by printing and shared between owners, and do not expire at all — three
people owning Sol Ring is three collection rows and one card to look up, and a reprint is a
new printing with its own id rather than an edit to an existing one.

### When it happens

An import stores names and set codes and says what changed, exactly as before. Working out
what those cards *are* runs afterwards, in `after()`, so nobody watches a progress bar for
cards they just uploaded. It never has to finish: whatever it misses is picked up the next
time someone opens the collection, and a collection with no facts yet still searches, prices
and trades exactly as it always did.

A refresh re-imports mostly the same printings, so the first thing enrichment does is match
rows against facts already stored — no requests at all for the ones it recognises. Only what
is left goes to Scryfall, in passes of 750, writing each pass as it lands so a run that runs
out of time leaves progress behind rather than nothing.

### Two id columns, on purpose

`collection_cards` has both `scryfall_id` and `facts_id`, and the difference is how confident
we are:

- A row naming a set **and** a collector number identifies its printing exactly. Both columns
  are filled — and as a side effect every later price lookup for that row becomes an exact id
  hit instead of a name guess, which makes search and trades more accurate than they were.
- A row carrying only a name does not. Scryfall answers with *a* printing, whose colours and
  type line are right but whose price and art may belong to a version this person does not
  own. Those rows get `facts_id` so they can be filtered, and keep an empty `scryfall_id` so
  pricing goes on being honest about not knowing.

### Double-faced cards

Scryfall gives a transforming or modal card no top-level colours, mana cost, oracle text or
power — only faces that have them. Read naively, every flip card in a collection becomes a
colourless zero-drop with no text to search. The projection in `src/lib/cardFacts.ts` reads
those off the faces instead, and `tests/cardFacts.test.ts` pins the behaviour against real
Scryfall responses in `tests/fixtures/scryfall-cards.json` — a transform card, a modal one, a
split card whose colours come back out of WUBRG order, and a dual land that is two colours
while being none.

Colours are stored as sorted `WUBRG` letters, so "contains blue" is `LIKE '%U%'` and
"mono-blue" is `= 'U'`, with no join table and no extra rows per card.

The **Price** column shows the value of the copies your group actually has, as a range
when they hold different printings. When nobody has a copy it falls back to the default
printing's price, marked `ref`. A `~` prefix means that exact finish has no listed price
(common for foil-only promos) and the price shown is another finish of the same printing.

Tick **Only count copies marked for trade** to count just the copies flagged in each
person's tradelist rather than everything they own.

## Browsing a collection

**Browse** on any collection opens it at `/collections/<id>`: every card as art or as a
list, with what each copy is and what it is worth. Two printings of the same card are two
tiles, because that is what the person actually has.

The filter lives in the address bar. A filtered collection is therefore a link — "here is
everything I have that fits your deck" is a thing people want to send each other — and the
back button undoes a filter rather than leaving the page. Changing a filter re-renders on
the server; only paging appends on the client, since nobody wants `offset=180` in their
history.

On a phone the filters are a sheet from the bottom rather than a sidebar, and it stays open
while you use it — the count on its button updates as you tick things, so you can see a
filter working before committing to it. Card art is unreadable at grid size on a phone, so
tapping a card shows the full-size image, the same preview the search results use.

A collection that has not been identified yet still lists, still searches by name, and says
so in a line at the top with the number of cards still being worked out.

### Sending cards from here to a want list

This is where browsing joins back up with trading. Pick a want list once, at the top, and
then either tap **+ Want** on a card or take the whole filtered set with **Add all N
matching** — "everything blue they have under $5" in one press. Cards already on that list
say **✓ Wanted** rather than offering to add them again.

Wants belong to the person browsing, not to whoever owns the cards, so this needs you to
have said who you are on the dashboard — and it is hidden entirely when you are looking at
your own collection, where there is nothing to want.

Two rules about what gets saved:

- **One of each.** How many copies somebody else has says nothing about how many you want,
  so a card is added as a single want and you can change the number in the want list editor.
- **A tapped card keeps its printing; a bulk add does not.** You picked that tile, so the
  version goes with it and the trades tab can tell you whether the copy on offer is the one
  you asked for. "All their blue creatures" is a request for cards, not for particular
  copies, so pinning printings there would only make the matcher fussier than you are.

A bulk add is capped, and says how many it left out rather than quietly saving a fraction of
what was asked for. The filter is re-run on the server rather than the browser sending up
the cards it happens to be showing — it is only showing the first sixty.

## Filtering a collection

Two things build a filter: the controls, and a text box that accepts a subset of the syntax
people already know from Scryfall. Both parse to the same tree (`src/lib/cardQuery.ts`) and
compile to the same SQL (`src/lib/cardQuerySql.ts`), so the controls are a discoverable way
to write a query rather than a second, subtly different filtering system.

```
c:u t:instant mv<=3          blue instants costing three or less
id<=wu                       fits in an Azorius deck
r>=rare usd>10               the expensive half of the rares
t:creature (c:u or c:w)      creatures of either colour
-t:land is:tradeable         everything but lands, and only what is on offer
o:"draw a card" kw:flying    oracle text and keywords
```

Supported: `c`/`color`, `id`/`ci` for colour identity, `t`/`type`, `o`/`oracle`, `kw`, `r`/`rarity`,
`s`/`e`/`set`, `a`/`artist`, `f`/`format`, `cmc`/`mv`, `pow`, `tou`, `loy`, `usd`/`price`, `year`,
`qty`, `cond`, and `is:` for `foil`, `nonfoil`, `etched`, `tradeable`, `reserved`, `promo`,
`identified` and `unidentified`. Comparators are `:` `=` `!=` `<` `<=` `>` `>=`; terms can be
negated with `-`, grouped with brackets, combined with `or`, and quoted to keep spaces. Guild,
shard and wedge names work as colours, because nobody asks what "WU" cards you have.

Deliberately a subset. The long tail Scryfall supports — devotion comparisons, `is:split`,
arbitrary set-theoretic nesting — is not worth the surface. A query using one of those says
so in words and drops that term, keeping the rest: one typo in a long filter should not blank
the screen or force a retype.

### Why the colours are a string

`card_facts.colors` holds sorted `WUBRG` letters, so `c:u` is `LIKE '%U%'`, `c=u` is `= 'U'`,
and `id<=wu` — the Commander question — is the absence of every letter that is not W or U.
That is the whole of colour filtering in a few comparisons, with no join table and no extra
rows per card.

Colour and colour *identity* are separate columns because they answer different questions. A
dual land is colourless and still does not fit in a mono-red deck; filtering a Commander
collection by colour rather than identity makes every land disappear.

### Two things worth knowing

**Filtering runs in the database.** A 20,000-card collection is a normal size here, and
shipping one to a phone so the browser can hide most of it is not a plan. Every value is a
bound parameter.

**A negated filter keeps cards nobody has identified yet.** `NOT NULL` is `NULL` in SQL, so a
naive negation drops unidentified rows out of both a filter and its opposite — cards vanish
with nothing to explain it. Asking "is this a creature?" of a card we have not looked up
yet is answered by "we do not know", which is not a yes. `tests/cardQuerySql.test.ts` pins
that, along with everything else, by running the generated SQL against a real database of
cards chosen to disagree with each other — a land that is two colours while being none, a
foil worth ten times its ordinary printing, and a row nothing has identified.

Prices filter and sort on the finish someone actually owns, so a foil Sol Ring is found by
`usd>10` and not by `usd<2`.

The controls do not filter anything themselves — they write a query in the same syntax the
box takes, and that one query is what runs. Ticking "Creature" and typing `t:creature` do
exactly the same thing, the two compose, and there is a single parser and a single compiler
to be right. Groups are OR-ed inside and AND-ed between, so three rarities widens and a
rarity plus a colour narrows.

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
