/**
 * How this app identifies itself to the sites it fetches from.
 *
 * Scryfall and Deckbox both ask callers to say who they are and where to
 * complain. A placeholder URL is worse than no effort at all: it is the one
 * thing an operator has to go on if this ever misbehaves, and a dead link
 * means the only remaining option is to block the traffic. A fork can point
 * it somewhere else with APP_CONTACT_URL rather than editing code.
 */

const HOME = "https://github.com/Gage77/TCGWhoHasWhat";

/** Kept in step with `version` in package.json. */
const VERSION = "0.1.0";

export function userAgent(): string {
  const contact = process.env.APP_CONTACT_URL?.trim();
  return `TCGWhoHasWhat/${VERSION} (collection comparison for a private playgroup; +${
    contact && contact.length > 0 ? contact : HOME
  })`;
}
