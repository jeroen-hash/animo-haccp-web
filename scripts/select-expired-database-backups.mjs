#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BACKUP_PATTERN = /^animo-database-(\d{8}T\d{6}Z)\.dump\.gpg$/;

export function selectExpiredDatabaseBackups(listing, cutoffEpochSeconds) {
  if (!Number.isSafeInteger(cutoffEpochSeconds) || cutoffEpochSeconds < 0) {
    throw new TypeError("cutoff must be a non-negative Unix timestamp in seconds");
  }

  const expired = new Set();
  for (const rawLine of String(listing).split(/\r?\n/)) {
    const name = rawLine.trim();
    if (!name || name.includes("/") || name.includes("\\")) continue;
    const match = BACKUP_PATTERN.exec(name);
    if (!match) continue;

    const stamp = match[1];
    const year = Number(stamp.slice(0, 4));
    const month = Number(stamp.slice(4, 6));
    const day = Number(stamp.slice(6, 8));
    const hour = Number(stamp.slice(9, 11));
    const minute = Number(stamp.slice(11, 13));
    const second = Number(stamp.slice(13, 15));
    const epochMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const date = new Date(epochMs);

    // Date.UTC normalizes invalid dates, so compare every component back.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute ||
      date.getUTCSeconds() !== second
    ) continue;

    if (Math.floor(epochMs / 1000) < cutoffEpochSeconds) expired.add(name);
  }
  return [...expired].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [listingPath, cutoffText] = process.argv.slice(2);
  if (!listingPath || !cutoffText || !/^\d+$/.test(cutoffText)) {
    console.error("Usage: node scripts/select-expired-database-backups.mjs <listing-file> <cutoff-epoch-seconds>");
    process.exit(2);
  }
  const listing = readFileSync(listingPath, "utf8");
  for (const name of selectExpiredDatabaseBackups(listing, Number(cutoffText))) {
    process.stdout.write(name + "\n");
  }
}
