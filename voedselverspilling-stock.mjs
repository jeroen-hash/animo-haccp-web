import { convertWasteQuantity } from "./voedselverspilling-core.mjs";

const EPSILON = 0.000001;

function sortBatches(batches) {
  return [...batches].filter((batch) => Number(batch.quantity) > 0).sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0);
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    const expiryOrder = String(a.expiryDate).localeCompare(String(b.expiryDate));
    return expiryOrder || new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0);
  });
}

function withNormalisedBatches(stockItem) {
  let batches = Array.isArray(stockItem.batches) ? stockItem.batches.map((batch) => ({ ...batch })) : [];
  if (!batches.length && Number(stockItem.quantity) > 0) {
    batches = [{
      id: "legacy-" + String(stockItem.id || "stock"),
      quantity: Number(stockItem.quantity),
      expiryDate: stockItem.expiryDate || "",
      receivedAt: new Date(0).toISOString()
    }];
  }
  return batches;
}

function stockTotals(stockItem, batches) {
  const ordered = sortBatches(batches);
  return {
    ...stockItem,
    batches: ordered,
    quantity: ordered.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0),
    expiryDate: ordered[0]?.expiryDate || ""
  };
}

/**
 * Pure stock mutation for one food-waste registration.
 * The caller must persist the returned stock item and movement together.
 * sourceId is the stable food-waste client UUID and makes retries idempotent.
 */
export function deductFoodWasteStock({
  stockItem,
  quantity,
  inputUnit,
  sourceId,
  stockMovements = [],
  now = new Date().toISOString(),
  userId = null,
  userName = ""
}) {
  if (!stockItem?.id || !sourceId) return { status: "invalid", reason: "missing_identity" };
  const previous = stockMovements.find((movement) =>
    movement?.sourceType === "food_waste" && movement?.sourceId === sourceId
  );
  if (previous) return { status: "already_applied", stockItem, movement: previous };

  let stockQuantity;
  try {
    stockQuantity = convertWasteQuantity(quantity, inputUnit, stockItem.unit);
  } catch {
    return { status: "unit_mismatch", stockItem };
  }
  if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) {
    return { status: "invalid", reason: "invalid_quantity" };
  }

  const batches = withNormalisedBatches(stockItem);
  const ordered = sortBatches(batches);
  const available = ordered.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
  if (available + EPSILON < stockQuantity) {
    return { status: "insufficient_stock", stockItem: stockTotals(stockItem, batches), available, requested: stockQuantity };
  }

  let remaining = stockQuantity;
  const allocations = [];
  const updatedBatches = batches.map((batch) => ({ ...batch }));
  for (const orderedBatch of ordered) {
    if (remaining <= EPSILON) break;
    const batch = updatedBatches.find((candidate) => candidate.id === orderedBatch.id);
    if (!batch) continue;
    const used = Math.min(Number(batch.quantity), remaining);
    batch.quantity = Number(batch.quantity) - used;
    remaining -= used;
    allocations.push({
      batchId: batch.id,
      quantity: used,
      expiryDate: batch.expiryDate || "",
      receivedAt: batch.receivedAt || new Date(0).toISOString()
    });
  }
  if (remaining > EPSILON) return { status: "insufficient_stock", stockItem, available, requested: stockQuantity };

  const updatedStockItem = stockTotals(stockItem, updatedBatches);
  const movement = {
    id: "food-waste:" + sourceId,
    productId: stockItem.id,
    productName: stockItem.name || "",
    unit: stockItem.unit || "",
    delta: -stockQuantity,
    reason: "Voedselverspilling",
    createdAt: now,
    userId,
    userName,
    sourceType: "food_waste",
    sourceId,
    stockAllocations: allocations
  };
  return { status: "deducted", stockItem: updatedStockItem, movement, stockQuantity, allocations };
}

/**
 * Restore the exact original batches when a linked waste entry is voided.
 * The caller must persist the returned stock item and reversal movement together.
 */
export function reverseFoodWasteStock({
  stockItem,
  sourceId,
  stockMovements = [],
  now = new Date().toISOString(),
  userId = null,
  userName = ""
}) {
  if (!stockItem?.id || !sourceId) return { status: "invalid", reason: "missing_identity" };
  const reversalSourceId = "void:" + sourceId;
  const existingReversal = stockMovements.find((movement) =>
    movement?.sourceType === "food_waste_reversal" && movement?.sourceId === reversalSourceId
  );
  if (existingReversal) return { status: "already_reversed", stockItem, movement: existingReversal };

  const original = stockMovements.find((movement) =>
    movement?.sourceType === "food_waste" && movement?.sourceId === sourceId
  );
  if (!original || !Array.isArray(original.stockAllocations) || !original.stockAllocations.length) {
    return { status: "deduction_not_found", stockItem };
  }
  if (String(original.productId) !== String(stockItem.id)) return { status: "stock_item_mismatch", stockItem };

  const batches = withNormalisedBatches(stockItem);
  for (const allocation of original.stockAllocations) {
    const amount = Number(allocation.quantity);
    if (!Number.isFinite(amount) || amount <= 0) return { status: "invalid_allocation", stockItem };
    let batch = batches.find((candidate) => candidate.id === allocation.batchId);
    if (!batch) {
      batch = {
        id: allocation.batchId,
        quantity: 0,
        expiryDate: allocation.expiryDate || "",
        receivedAt: allocation.receivedAt || new Date(0).toISOString()
      };
      batches.push(batch);
    }
    batch.quantity = Number(batch.quantity || 0) + amount;
  }

  const restored = stockTotals(stockItem, batches);
  const restoredQuantity = original.stockAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
  const movement = {
    id: "food-waste-reversal:" + sourceId,
    productId: stockItem.id,
    productName: stockItem.name || "",
    unit: stockItem.unit || "",
    delta: restoredQuantity,
    reason: "Terugboeking voedselverspilling",
    createdAt: now,
    userId,
    userName,
    sourceType: "food_waste_reversal",
    sourceId: reversalSourceId,
    reversalOf: sourceId
  };
  return { status: "reversed", stockItem: restored, movement, restoredQuantity };
}
