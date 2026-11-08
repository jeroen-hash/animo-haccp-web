import test from "node:test";
import assert from "node:assert/strict";
import { selectExpiredDatabaseBackups } from "../scripts/select-expired-database-backups.mjs";

const cutoff = Math.floor(Date.UTC(2026, 10, 8, 3, 0, 0) / 1000);

test("selects only valid encrypted database archives older than the cutoff", () => {
  const listing = [
    "animo-database-20260701T030000Z.dump.gpg",
    "animo-database-20261108T030000Z.dump.gpg",
    "animo-database-20261109T030000Z.dump.gpg",
    "animo-database-20260701T030000Z.dump.gpg.sha256",
    "animo-storage-20260701T030000Z.tar.gz.gpg",
    "notes.txt",
    "animo-database-20260230T030000Z.dump.gpg",
    "/backups/animo-haccp-database/animo-database-20260701T030000Z.dump.gpg",
    "animo-database-20260701T030000Z.dump.gpg"
  ].join("\n");

  assert.deepEqual(selectExpiredDatabaseBackups(listing, cutoff), [
    "animo-database-20260701T030000Z.dump.gpg"
  ]);
});

test("does not expire an archive exactly at the cutoff", () => {
  const exact = new Date(cutoff * 1000).toISOString()
    .replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const listing = \`animo-database-\${exact}.dump.gpg\`;
  assert.deepEqual(selectExpiredDatabaseBackups(listing, cutoff), []);
});

test("rejects an invalid cutoff rather than guessing", () => {
  assert.throws(() => selectExpiredDatabaseBackups("", NaN), /cutoff/);
  assert.throws(() => selectExpiredDatabaseBackups("", -1), /cutoff/);
});
