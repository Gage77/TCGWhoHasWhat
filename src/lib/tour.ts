/**
 * The guided tour, as data.
 *
 * Every step points at a `data-tour` attribute in the UI. Keeping the steps
 * here rather than scattered through the components means there is one place
 * to edit when a feature lands — and `tests/tour.test.ts` fails the build if a
 * step points at an attribute that no longer exists, or if an attribute exists
 * with no step explaining it. A tour that silently rots is worse than none.
 */

export type TourTab = "search" | "trades";

export interface TourStep {
  /**
   * The `data-tour` attribute this step highlights. Null pins the step to the
   * middle of the screen with no spotlight, for steps that are about the app
   * rather than about one control.
   */
  target: string | null;
  title: string;
  body: string;
  /** Tab that has to be showing for the target to exist. */
  tab?: TourTab;
  /**
   * Drop the step when its target is not on screen. For the parts that only
   * appear once there is something to show — results, trade offers — where
   * explaining an empty space would just be confusing.
   */
  skipIfMissing?: boolean;
}

/** The selector a step's target resolves to. */
export function selectorFor(target: string): string {
  return `[data-tour="${target}"]`;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: "Who has what?",
    body: "This is your playgroup's collections in one place. It answers three questions: who has a card you need, what you're still missing from a deck, and what you and someone else could trade. Two minutes and you'll know your way around.",
  },
  {
    target: "collections",
    tab: "search",
    title: "Start with collections",
    body: "Everyone's cards live here. Upload a CSV export from Moxfield, ManaBox, Archidekt or Helvault — or paste a public Deckbox link, which adds a Refresh button so you never have to ask for an export again. Re-uploading under the same name replaces that person's collection.",
  },
  {
    target: "identity",
    title: "Tell it who you are",
    body: "Both halves of the app need to know whose side you're on: the search tab to subtract cards you already own, the trades tab to know what you'd be giving up. Set it once — it's remembered in this browser.",
  },
  {
    target: "tabs",
    title: "Two questions, two tabs",
    body: "Find cards answers \"who has this?\". Trades answers \"what could you and I swap?\". You'll usually start on the left and end up on the right.",
  },
  {
    target: "search-input",
    tab: "search",
    title: "Paste whatever you've got",
    body: "Bare names, 4x Sol Ring, a whole decklist with its section headers, MTGO sideboard prefixes — it all parses. Naming a printing like Sol Ring (C21) 263 records which version you want, and starting a line with ! marks it a priority.",
  },
  {
    target: "deck-mode",
    tab: "search",
    title: "Building a deck?",
    body: "Tick this and your own collection is subtracted first, so a decklist turns into just the gaps. A four-of you own one of shows as needing three, and the total is the cost of the copies you still need — not the whole playset.",
  },
  {
    target: "tradeable-only",
    tab: "search",
    title: "Only what's actually on offer",
    body: "Trackers let people flag which copies they'd part with. Tick this to count only those, so cards someone owns but isn't giving up stay out of the numbers.",
  },
  {
    target: "results-summary",
    tab: "search",
    skipIfMissing: true,
    title: "The shape of the answer",
    body: "How many you already own, how many you still need, and what filling the gaps would cost. If something reads Nobody has, that's a card the group can't cover — you're buying that one.",
  },
  {
    target: "add-to-want-list",
    tab: "search",
    skipIfMissing: true,
    title: "Send the gaps somewhere useful",
    body: "This is the join between the two tabs. The cards you're missing go straight onto a want list, which is what trade matching runs on — no retyping. It merges rather than appends, so sending the same deck twice won't ask for two of everything.",
  },
  {
    target: "results-table",
    tab: "search",
    skipIfMissing: true,
    title: "Who has each one",
    body: "A column per person, with a count of what they hold. Click any row to expand it and see the exact printings, conditions and prices. Hover a card name to see the card; hover a set code to see that specific printing, which is how you spot a showcase version before agreeing to anything.",
  },
  {
    target: "want-lists",
    tab: "trades",
    title: "Want lists, plural",
    body: "A want is really \"for my Atraxa deck\", so lists have names and you can keep as many as you like. Trades show which list asked for a card, so the other person knows why you want it. A card on two lists still counts once — the biggest single ask wins.",
  },
  {
    target: "find-trades",
    tab: "trades",
    title: "Find the overlap",
    body: "This pairs you with everyone else: what they hold that you want, and what you hold that they want. Both people need saved want lists, since that's what the matching runs on.",
  },
  {
    target: "trade-partner",
    tab: "trades",
    skipIfMissing: true,
    title: "Both directions, and the difference",
    body: "Each pile's value side by side, plus who'd be giving up more. When the two sides don't balance, a line at the top names the exact cards to leave out to close the gap — so you can even it up before anyone drives anywhere.",
  },
  {
    target: "sign-out",
    skipIfMissing: true,
    title: "Sharing the link",
    body: "This site sits behind one passphrase that the whole group knows, so there are no accounts to manage. Sign out if you are on someone else's machine — otherwise it remembers you for a month.",
  },
  {
    target: "tour-button",
    title: "That's the tour",
    body: "The compass is always here if you want to run through it again. Have fun, and may your trades be even.",
  },
];
