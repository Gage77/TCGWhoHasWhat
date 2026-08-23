import { test } from "node:test";
import assert from "node:assert/strict";

import { extensionOf, matchOwnerName, pickDroppedFile } from "../src/lib/fileDrop.ts";

function named(...names: string[]) {
  return names.map((name) => ({ name }));
}

test("one export is taken as it is", () => {
  const result = pickDroppedFile(named("hunter.csv"));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.file.name, "hunter.csv");
});

test("the other collection formats are accepted too", () => {
  for (const name of ["list.tsv", "moxfield.txt", "LOUD.CSV"]) {
    assert.equal(pickDroppedFile(named(name)).ok, true, name);
  }
});

/** Dragging an image out of another tab, or a bookmark, or a selection. */
test("a drop carrying no file says so rather than doing nothing", () => {
  const result = pickDroppedFile([]);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /no file/i);
});

test("a folder's worth of files is refused rather than guessed at", () => {
  const result = pickDroppedFile(named("hunter.csv", "alex.csv"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /one collection at a time/i);
});

test("a file that is not an export is named in the complaint", () => {
  const result = pickDroppedFile(named("deck-photo.png"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /deck-photo\.png/);
});

test("a file with no extension at all is not an export", () => {
  assert.equal(pickDroppedFile(named("collection")).ok, false);
  assert.equal(extensionOf("collection"), "");
});

/**
 * The extension is what gets checked, and it is only the last one: a file
 * saved as `hunter.csv.txt` is still a text file to everyone involved.
 */
test("only the final extension counts", () => {
  assert.equal(extensionOf("hunter.csv.txt"), ".txt");
  assert.equal(extensionOf("Collection.CSV"), ".csv");
});

test("an export named after someone is matched to them", () => {
  assert.equal(matchOwnerName("hunter.csv", ["Hunter", "Alex"]), "Hunter");
  assert.equal(matchOwnerName("moxfield_hunter_2026-08.csv", ["Hunter"]), "Hunter");
  assert.equal(matchOwnerName("HUNTER-collection.csv", ["hunter"]), "hunter");
});

/** Every word of the name has to be there, so near-misses stay unmatched. */
test("a name that only half appears is not a match", () => {
  assert.equal(matchOwnerName("alex.csv", ["Alexandra"]), null);
  assert.equal(matchOwnerName("alex.csv", ["Alex Kim"]), null);
  assert.equal(matchOwnerName("alex-kim.csv", ["Alex Kim"]), "Alex Kim");
});

test("nothing recognisable in the filename matches nobody", () => {
  assert.equal(matchOwnerName("collection-export-2026.csv", ["Hunter", "Alex"]), null);
  assert.equal(matchOwnerName("hunter.csv", []), null);
});

/** A file naming two people belongs to the more specific of them. */
test("the longest matching name wins", () => {
  assert.equal(matchOwnerName("alex-kim-trades.csv", ["Alex", "Alex Kim"]), "Alex Kim");
  assert.equal(matchOwnerName("alex-trades.csv", ["Alex", "Alex Kim"]), "Alex");
});
