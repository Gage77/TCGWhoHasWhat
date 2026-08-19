/**
 * Deployment configuration checks.
 *
 * A hosted deploy has two settings that are easy to forget and expensive to
 * get wrong: the passphrase keeping the group's collections off the open
 * internet, and the database URL without which every upload is written to a
 * disk that is about to vanish. Both are checked before a request is served
 * rather than at the point they would have failed, so a misconfigured deploy
 * says what is missing instead of returning a stack trace on someone's first
 * upload — or, worse, quietly accepting one and losing it.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The configured passphrase, or null when the gate is switched off. */
export function groupPassword(): string | null {
  const value = process.env.GROUP_PASSWORD;
  return value !== undefined && value.length > 0 ? value : null;
}

/**
 * Whether running without a passphrase is deliberate.
 *
 * Development has no gate so `npm run dev` still just works. A production
 * build refuses to serve instead, since an unset variable there is far more
 * likely to be a forgotten deploy step than a decision to publish everyone's
 * collection.
 */
export function publicAccessAllowed(): boolean {
  return !isProduction() || process.env.ALLOW_PUBLIC === "1";
}

/**
 * Whether writes will land somewhere that still exists tomorrow.
 *
 * A local SQLite file is right for development and for a box with a real
 * disk; on a serverless host it is a file in a container that is thrown away
 * between requests, and on a read-only filesystem it does not even get that
 * far. `ALLOW_LOCAL_DB=1` is how a self-hosted deploy says it has the disk.
 */
export function persistentStorageConfigured(): boolean {
  const url = process.env.TURSO_DATABASE_URL;
  return (url !== undefined && url.length > 0) || process.env.ALLOW_LOCAL_DB === "1";
}

export const NO_PASSWORD_MESSAGE =
  "GROUP_PASSWORD is not set. Set it to the passphrase you want to share with your " +
  "group, or set ALLOW_PUBLIC=1 if this really is meant to be open to anyone.";

export const NO_DATABASE_MESSAGE =
  "TURSO_DATABASE_URL is not set. Point it at a hosted libSQL database, or set " +
  "ALLOW_LOCAL_DB=1 if this host has a disk that survives restarts. Without one of " +
  "those, uploaded collections are written to a file that will not be there later.";

/**
 * What is wrong with this deploy, or null when nothing is.
 *
 * Only meaningful in production: `npm run dev` deliberately runs with no
 * passphrase and a local file, and neither is a mistake there.
 */
export function configProblem(): string | null {
  if (!isProduction()) return null;
  if (!groupPassword() && !publicAccessAllowed()) return NO_PASSWORD_MESSAGE;
  if (!persistentStorageConfigured()) return NO_DATABASE_MESSAGE;
  return null;
}
