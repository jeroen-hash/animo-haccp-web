import test from "node:test";
import assert from "node:assert/strict";
import {
  syncFoodWasteEntry,
  syncFoodWasteQueue,
  FOOD_WASTE_BUCKET,
  FOOD_WASTE_TABLE
} from "../voedselverspilling-sync.mjs";

const businessId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const serverId = "44444444-4444-4444-8444-444444444444";

function makeEntry(overrides = {}) {
  return {
    businessId,
    userId,
    clientId,
    employeeName: "Testmedewerker",
    productName: "Kipfilet",
    stockItemId: "stock-123",
    recipeId: null,
    quantity: 750,
    inputUnit: "g",
    reason: "Product bedorven",
    note: "",
    costSnapshot: {
      value: 9,
      unitCost: 12,
      stockQuantity: 0.75,
      stockUnit: "kg",
      currency: "EUR",
      status: "Berekend"
    },
    photo: new Blob(["fake-image"], { type: "image/jpeg" }),
    clientCreatedAt: "2026-11-11T20:00:00.000Z",
    ...overrides
  };
}

function makeSupabase({
  authenticatedUserId = userId,
  uploadError = null,
  insertError = null,
  existingRow = null,
  lookupError = null
} = {}) {
  const calls = { uploads: [], inserts: [], selects: [] };
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: authenticatedUserId } },
        error: null
      })
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, FOOD_WASTE_BUCKET);
        return {
          upload: async (path, photo, options) => {
            calls.uploads.push({ path, photo, options });
            return uploadError
              ? { data: null, error: uploadError }
              : { data: { path }, error: null };
          }
        };
      }
    },
    from(table) {
      assert.equal(table, FOOD_WASTE_TABLE);
      return {
        insert(row) {
          calls.inserts.push(row);
          return {
            select() {
              return {
                single: async () => insertError
                  ? { data: null, error: insertError }
                  : { data: { id: serverId }, error: null }
              };
            }
          };
        },
        select(columns) {
          calls.selects.push(columns);
          return {
            eq(column, value) {
              return {
                eq: (secondColumn, secondValue) => ({
                  maybeSingle: async () => ({
                    data: existingRow,
                    error: lookupError,
                    filter: [column, value, secondColumn, secondValue]
                  })
                })
              };
            }
          };
        }
      };
    }
  };
  return { supabase, calls };
}

test("successful sync uploads the private photo, inserts a snapshot and clears the queue", async () => {
  const { supabase, calls } = makeSupabase();
  const removed = [];
  let stockSnapshotSaved = false;
  const result = await syncFoodWasteEntry(makeEntry(), supabase, {
    removeQueueEntry: async id => removed.push(id),
    beforeServerInsert: async () => {
      assert.equal(calls.inserts.length, 1);
      stockSnapshotSaved = true;
      return { status: "already_applied" };
    }
  });

  assert.equal(result.status, "synced");
  assert.equal(result.id, serverId);
  assert.equal(result.photoPath, businessId + "/" + userId + "/" + clientId + ".jpg");
  assert.equal(result.alreadySynced, false);
  assert.equal(stockSnapshotSaved, true);
  assert.equal(result.stockSync.status, "already_applied");
  assert.deepEqual(removed, [clientId]);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].options.contentType, "image/jpeg");
  assert.equal(calls.uploads[0].options.upsert, true);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].cost_unit, "kg");
  assert.equal(calls.inserts[0].cost_status, "calculated");
  assert.equal(calls.inserts[0].cost_value_snapshot, 9);
});


test("a failed stock snapshot save keeps the waste entry queued for a safe retry", async () => {
  const { supabase, calls } = makeSupabase();
  let removed = false;
  await assert.rejects(
    syncFoodWasteEntry(makeEntry(), supabase, {
      removeQueueEntry: async () => { removed = true; },
      beforeServerInsert: async () => { throw new Error("Voorraadcloud niet opgeslagen"); }
    }),
    /Voorraadcloud niet opgeslagen/
  );
  assert.equal(calls.inserts.length, 1);
  assert.equal(removed, false);
});

test("a duplicate client ID is accepted only when the existing row matches", async () => {
  const entry = makeEntry();
  const row = {
    business_id: businessId,
    client_id: clientId,
    created_by: userId,
    employee_name: "Testmedewerker",
    product_name: "Kipfilet",
    stock_item_id: "stock-123",
    recipe_id: null,
    quantity: 750,
    input_unit: "g",
    reason: "Product bedorven",
    note: "",
    photo_path: businessId + "/" + userId + "/" + clientId + ".jpg",
    cost_unit: "kg",
    currency: "EUR",
    unit_cost_snapshot: 12,
    cost_value_snapshot: 9,
    cost_status: "calculated",
    client_created_at: entry.clientCreatedAt,
    id: serverId
  };
  const { supabase } = makeSupabase({
    insertError: { code: "23505", message: "duplicate key" },
    existingRow: row
  });
  const removed = [];
  const result = await syncFoodWasteEntry(entry, supabase, {
    removeQueueEntry: async id => removed.push(id)
  });

  assert.equal(result.alreadySynced, true);
  assert.deepEqual(removed, [clientId]);
});

test("a duplicate client ID with different content remains queued", async () => {
  const { supabase } = makeSupabase({
    insertError: { code: "23505", message: "duplicate key" },
    existingRow: {
      business_id: businessId,
      client_id: clientId,
      created_by: userId,
      product_name: "Ander product",
      quantity: 750,
      input_unit: "g",
      reason: "Product bedorven",
      note: "",
      photo_path: businessId + "/" + userId + "/" + clientId + ".jpg",
      id: serverId
    }
  });
  let removed = false;
  await assert.rejects(
    syncFoodWasteEntry(makeEntry(), supabase, {
      removeQueueEntry: async () => { removed = true; }
    }),
    /andere registratie/
  );
  assert.equal(removed, false);
});

test("upload failure leaves the offline entry untouched and skips the database insert", async () => {
  const { supabase, calls } = makeSupabase({ uploadError: new Error("Storage offline") });
  let removed = false;
  await assert.rejects(
    syncFoodWasteEntry(makeEntry(), supabase, {
      removeQueueEntry: async () => { removed = true; }
    }),
    /Storage offline/
  );
  assert.equal(calls.inserts.length, 0);
  assert.equal(removed, false);
});

test("a different signed-in employee cannot sync another employee's queued entry", async () => {
  const otherUser = "55555555-5555-4555-8555-555555555555";
  const { supabase, calls } = makeSupabase({ authenticatedUserId: otherUser });
  await assert.rejects(
    syncFoodWasteEntry(makeEntry(), supabase, { removeQueueEntry: async () => {} }),
    /komt niet overeen/
  );
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.inserts.length, 0);
});

test("unsupported and oversized photos are rejected before upload", async () => {
  const { supabase, calls } = makeSupabase();
  await assert.rejects(
    syncFoodWasteEntry(makeEntry({ photo: new Blob(["x"], { type: "image/gif" }) }), supabase),
    /JPEG-, PNG- of WebP/
  );
  await assert.rejects(
    syncFoodWasteEntry(makeEntry({ photo: { type: "image/jpeg", size: 5 * 1024 * 1024 + 1 } }), supabase),
    /maximaal 5 MB/
  );
  assert.equal(calls.uploads.length, 0);
});

test("queue sync continues after one entry fails and preserves its pending status", async () => {
  const first = makeEntry();
  const second = makeEntry({
    clientId: "66666666-6666-4666-8666-666666666666",
    photo: new Blob(["x"], { type: "image/gif" })
  });
  const { supabase } = makeSupabase();
  const removed = [];
  const result = await syncFoodWasteQueue(supabase, {
    listQueue: async () => [first, second],
    removeQueueEntry: async id => removed.push(id)
  });

  assert.equal(result.total, 2);
  assert.equal(result.synced, 1);
  assert.equal(result.pending, 1);
  assert.deepEqual(removed, [clientId]);
  assert.equal(result.results[1].status, "pending");
});
