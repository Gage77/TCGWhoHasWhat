import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NO_DATABASE_MESSAGE,
  NO_PASSWORD_MESSAGE,
  configProblem,
  persistentStorageConfigured,
} from "../src/lib/config.ts";

const KEYS = ["NODE_ENV", "GROUP_PASSWORD", "ALLOW_PUBLIC", "TURSO_DATABASE_URL", "ALLOW_LOCAL_DB"];

/** Run `body` with exactly the given environment, then put things back. */
function withEnv(env: Record<string, string | undefined>, body: () => void) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    body();
  } finally {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const DEPLOYED = { NODE_ENV: "production", GROUP_PASSWORD: "four words", TURSO_DATABASE_URL: "libsql://x" };

test("a fully configured deploy has nothing to complain about", () => {
  withEnv(DEPLOYED, () => assert.equal(configProblem(), null));
});

test("development is never a misconfiguration", () => {
  // No passphrase and no database is exactly what `npm run dev` looks like.
  withEnv({ NODE_ENV: "development" }, () => assert.equal(configProblem(), null));
});

test("a production deploy with no passphrase is refused", () => {
  withEnv({ ...DEPLOYED, GROUP_PASSWORD: undefined }, () =>
    assert.equal(configProblem(), NO_PASSWORD_MESSAGE),
  );
});

test("an empty passphrase counts as no passphrase", () => {
  withEnv({ ...DEPLOYED, GROUP_PASSWORD: "" }, () =>
    assert.equal(configProblem(), NO_PASSWORD_MESSAGE),
  );
});

test("ALLOW_PUBLIC is how a deploy says it meant to be open", () => {
  withEnv({ ...DEPLOYED, GROUP_PASSWORD: undefined, ALLOW_PUBLIC: "1" }, () =>
    assert.equal(configProblem(), null),
  );
});

test("a production deploy with nowhere durable to write is refused", () => {
  withEnv({ ...DEPLOYED, TURSO_DATABASE_URL: undefined }, () =>
    assert.equal(configProblem(), NO_DATABASE_MESSAGE),
  );
});

test("an empty database URL counts as none", () => {
  withEnv({ ...DEPLOYED, TURSO_DATABASE_URL: "" }, () =>
    assert.equal(configProblem(), NO_DATABASE_MESSAGE),
  );
});

test("ALLOW_LOCAL_DB is how a host with a real disk says so", () => {
  withEnv({ ...DEPLOYED, TURSO_DATABASE_URL: undefined, ALLOW_LOCAL_DB: "1" }, () => {
    assert.equal(persistentStorageConfigured(), true);
    assert.equal(configProblem(), null);
  });
});

test("the missing passphrase is reported before the missing database", () => {
  // Both are wrong; naming the one that leaks data first is the useful order.
  withEnv({ NODE_ENV: "production" }, () =>
    assert.equal(configProblem(), NO_PASSWORD_MESSAGE),
  );
});
