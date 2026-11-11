import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261111220217_create_food_waste_entries.sql", import.meta.url),
  "utf8"
);

test("food waste migration is transactional and creates only its own table", () => {
  assert.match(migration, /^-- ANIMO HACCP:[\s\S]*begin;/i);
  assert.match(migration, /create table public\.food_waste_entries/i);
  assert.match(migration, /commit;\s*$/i);
  assert.doesNotMatch(migration, /\b(drop\s+(table|schema)|truncate\s+|delete\s+from\s+public\.(businesses|business_members|app_data)|alter\s+table\s+public\.(businesses|business_members|app_data))\b/i);
  assert.doesNotMatch(migration, /zimzsovvtdmrthrflkgm/i);
});

test("food waste data is tenant-scoped and protected by RLS", () => {
  assert.match(migration, /alter table public\.food_waste_entries enable row level security/i);
  assert.match(migration, /private\.can_access_business\(bm\.business_id\)/i);
  assert.match(migration, /bm\.active is true/i);
  assert.match(migration, /bm\.role in \('owner', 'manager'\)/i);
  assert.match(migration, /food_waste_entries\.created_by = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /unique \(business_id, client_id\)/i);
});

test("employees can only create their own photo-linked records", () => {
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /photo_path like/i);
  assert.match(migration, /lower\(photo_path\) ~ '\\\.\(jpg\|jpeg\|png\|webp\)\$'/i);
});

test("photo bucket is private and constrained to image uploads up to 5 MB", () => {
  assert.match(migration, /'food-waste-photos',[\s\S]*?false,[\s\S]*?5242880/i);
  assert.match(migration, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/i);
  assert.match(migration, /create policy "food waste photos read permitted business photos"/i);
  assert.match(migration, /create policy "food waste photos insert own business photo"/i);
  assert.match(migration, /create policy "food waste photos update own uploaded photo"/i);
});

test("employees cannot directly delete or rewrite historical waste details", () => {
  assert.match(migration, /revoke all on table public\.food_waste_entries from public, anon, authenticated/i);
  assert.match(migration, /grant update \(voided_at, void_reason\)/i);
  assert.match(migration, /revoke all on function private\.prevent_food_waste_unvoid\(\) from public, anon/i);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,200}for delete/i);
  assert.match(migration, /create policy "food waste owners managers void entries"/i);
});
test("voiding is a one-way audit action and cannot be silently reversed", () => {
  assert.match(migration, /create or replace function private\.prevent_food_waste_unvoid\(\)/i);
  assert.match(migration, /new\.voided_at is null or nullif\(btrim\(new\.void_reason\), ''\) is null/i);
  assert.match(migration, /old\.voided_at is not null[\s\S]*?new\.voided_at is distinct from old\.voided_at/i);
  assert.match(migration, /create trigger food_waste_entries_prevent_unvoid/i);
});
