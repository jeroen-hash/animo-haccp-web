import {
  listFoodWasteQueue,
  removeFoodWasteQueueEntry
} from "./voedselverspilling-core.mjs";

const FOOD_WASTE_BUCKET = "food-waste-photos";
const FOOD_WASTE_TABLE = "food_waste_entries";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PHOTO_TYPES = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});

const ENTRY_COLUMNS = [
  "id",
  "business_id",
  "client_id",
  "created_by",
  "employee_name",
  "product_name",
  "stock_item_id",
  "recipe_id",
  "quantity",
  "input_unit",
  "reason",
  "note",
  "photo_path",
  "cost_unit",
  "currency",
  "unit_cost_snapshot",
  "cost_value_snapshot",
  "cost_status",
  "client_created_at"
].join(",");

function requireUuid(value, label) {
  const uuid = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error(label + " ontbreekt of is ongeldig.");
  }
  return uuid;
}

function photoExtension(photo) {
  const mimeType = String(photo?.type || "").toLowerCase();
  const extension = PHOTO_TYPES[mimeType];
  if (!extension) throw new Error("Gebruik een foto in JPEG-, PNG- of WebP-formaat.");
  if (!Number.isFinite(photo.size) || photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
    throw new Error("De foto moet groter zijn dan 0 en maximaal 5 MB zijn.");
  }
  return { mimeType, extension };
}

function toDatabaseRow(entry, photoPath, userId) {
  const snapshot = entry.costSnapshot || {};
  const calculated = snapshot.status === "Berekend" || snapshot.status === "calculated";
  const value = calculated ? Number(snapshot.value) : null;
  const unitCost = calculated ? Number(snapshot.unitCost) : null;

  if (calculated && (!Number.isFinite(value) || value < 0 || !Number.isFinite(unitCost) || unitCost < 0)) {
    throw new Error("De berekende kostprijsmomentopname is ongeldig.");
  }

  return {
    business_id: entry.businessId,
    client_id: entry.clientId,
    created_by: userId,
    employee_name: String(entry.employeeName || "").trim(),
    product_name: String(entry.productName || "").trim(),
    stock_item_id: entry.stockItemId || null,
    recipe_id: entry.recipeId || null,
    quantity: Number(entry.quantity),
    input_unit: String(entry.inputUnit || ""),
    reason: String(entry.reason || ""),
    note: String(entry.note || ""),
    photo_path: photoPath,
    cost_unit: calculated ? (snapshot.stockUnit || null) : null,
    currency: String(snapshot.currency || "EUR").toUpperCase(),
    unit_cost_snapshot: unitCost,
    cost_value_snapshot: value,
    cost_status: calculated ? "calculated" : "unknown",
    client_created_at: entry.clientCreatedAt
  };
}

function matchesExistingEntry(existing, row) {
  return Boolean(existing)
    && existing.business_id === row.business_id
    && existing.client_id === row.client_id
    && existing.created_by === row.created_by
    && existing.product_name === row.product_name
    && Number(existing.quantity) === Number(row.quantity)
    && existing.input_unit === row.input_unit
    && existing.reason === row.reason
    && existing.note === row.note
    && existing.photo_path === row.photo_path;
}

/**
 * Upload one queued registration.
 * The queue item is removed only after the photo and database row are confirmed.
 * A duplicate client ID is treated as a successful retry only if the existing
 * row matches the original registration.
 */
export async function syncFoodWasteEntry(entry, supabase, {
  removeQueueEntry = removeFoodWasteQueueEntry
} = {}) {
  if (!supabase?.auth?.getUser || typeof supabase?.storage?.from !== "function" || typeof supabase?.from !== "function") {
    throw new Error("De beveiligde ANIMO-verbinding is niet beschikbaar.");
  }
  if (!entry || !entry.photo) throw new Error("De registratie of foto ontbreekt.");

  const businessId = requireUuid(entry.businessId, "Horecazaak");
  const clientId = requireUuid(entry.clientId, "Registratiecode");
  const requestedUserId = requireUuid(entry.userId, "Medewerker");
  const { mimeType, extension } = photoExtension(entry.photo);

  if (!String(entry.productName || "").trim()) throw new Error("De productnaam ontbreekt.");
  if (!Number.isFinite(Number(entry.quantity)) || Number(entry.quantity) <= 0) {
    throw new Error("De hoeveelheid moet groter zijn dan nul.");
  }
  if (!entry.clientCreatedAt || !Number.isFinite(Date.parse(entry.clientCreatedAt))) {
    throw new Error("Het tijdstip van de registratie ontbreekt of is ongeldig.");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const authenticatedUserId = authData?.user?.id;
  if (!authenticatedUserId || authenticatedUserId !== requestedUserId) {
    throw new Error("De ingelogde medewerker komt niet overeen met de offline registratie. Meld opnieuw aan om te synchroniseren.");
  }

  const photoPath = businessId + "/" + authenticatedUserId + "/" + clientId + "." + extension;
  const row = toDatabaseRow({ ...entry, businessId, clientId }, photoPath, authenticatedUserId);

  const upload = await supabase.storage
    .from(FOOD_WASTE_BUCKET)
    .upload(photoPath, entry.photo, {
      contentType: mimeType,
      upsert: true
    });
  if (upload?.error) throw upload.error;

  const insert = await supabase
    .from(FOOD_WASTE_TABLE)
    .insert(row)
    .select("id")
    .single();

  let serverId = insert?.data?.id || null;
  let alreadySynced = false;

  if (insert?.error?.code === "23505") {
    const lookup = await supabase
      .from(FOOD_WASTE_TABLE)
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (lookup?.error) throw lookup.error;
    if (!matchesExistingEntry(lookup?.data, row)) {
      throw new Error("Er bestaat al een andere registratie met deze offline code. De lokale registratie blijft bewaard voor controle.");
    }
    serverId = lookup.data.id;
    alreadySynced = true;
  } else if (insert?.error) {
    throw insert.error;
  }

  if (!serverId) throw new Error("De server heeft geen bevestiging van de registratie teruggegeven.");

  await removeQueueEntry(clientId);
  return {
    status: "synced",
    id: serverId,
    clientId,
    photoPath,
    alreadySynced
  };
}

/**
 * Try every locally queued registration. A failure leaves that entry and its
 * photo in IndexedDB so the next online attempt can retry it.
 */
export async function syncFoodWasteQueue(supabase, {
  listQueue = listFoodWasteQueue,
  removeQueueEntry = removeFoodWasteQueueEntry
} = {}) {
  const entries = await listQueue();
  const results = [];

  for (const entry of entries) {
    try {
      results.push(await syncFoodWasteEntry(entry, supabase, { removeQueueEntry }));
    } catch (error) {
      results.push({
        status: "pending",
        clientId: entry?.clientId || null,
        error: String(error?.message || error || "Onbekende synchronisatiefout")
      });
    }
  }

  return {
    total: entries.length,
    synced: results.filter(result => result.status === "synced").length,
    pending: results.filter(result => result.status === "pending").length,
    results
  };
}

export {
  FOOD_WASTE_BUCKET,
  FOOD_WASTE_TABLE,
  MAX_PHOTO_BYTES,
  matchesExistingEntry
};
