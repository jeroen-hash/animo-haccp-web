const FOOD_WASTE_REASONS = Object.freeze([
  "Houdbaarheid verstreken",
  "Product bedorven",
  "Te veel bereid",
  "Verkeerd bereid",
  "Beschadigd product",
  "Restjes van klanten",
  "Temperatuurprobleem",
  "Product gevallen/verontreinigd",
  "Andere reden"
]);

function normaliseWasteUnit(value) {
  const unit = String(value || "").trim().toLocaleLowerCase("nl-BE");
  const aliases = {
    "kilogram": "kg", "kilo": "kg", "kg": "kg",
    "gram": "g", "gr": "g", "g": "g",
    "liter": "l", "litre": "l", "l": "l",
    "milliliter": "ml", "millilitre": "ml", "ml": "ml",
    "centiliter": "cl", "cl": "cl",
    "stuk": "stuk", "stuks": "stuk", "pcs": "stuk", "piece": "stuk"
  };
  return aliases[unit] || unit;
}

function convertWasteQuantity(quantity, fromUnit, toUnit) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Het gewicht of aantal moet groter zijn dan nul.");
  const from = normaliseWasteUnit(fromUnit);
  const to = normaliseWasteUnit(toUnit);
  if (from === to) return amount;
  const massToGrams = { g: 1, kg: 1000 };
  const volumeToMillilitres = { ml: 1, cl: 10, l: 1000 };
  if (massToGrams[from] && massToGrams[to]) return amount * massToGrams[from] / massToGrams[to];
  if (volumeToMillilitres[from] && volumeToMillilitres[to]) return amount * volumeToMillilitres[from] / volumeToMillilitres[to];
  throw new Error("De ingevoerde eenheid past niet bij de voorraadeenheid.");
}

function calculateWasteCost({ quantity, inputUnit, stockUnit, purchasePrice, purchaseQuantity }) {
  const price = Number(purchasePrice);
  const packQuantity = Number(purchaseQuantity);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(packQuantity) || packQuantity <= 0) {
    return { value: null, unitCost: null, stockQuantity: null, status: "Nog te bepalen" };
  }
  const stockQuantity = convertWasteQuantity(quantity, inputUnit, stockUnit);
  const unitCost = price / packQuantity;
  return {
    value: Math.round(stockQuantity * unitCost * 100) / 100,
    unitCost: Math.round(unitCost * 10000) / 10000,
    stockQuantity,
    status: "Berekend"
  };
}

function createFoodWasteEntry(input) {
  const productName = String(input.productName || "").trim();
  const reason = String(input.reason || "").trim();
  if (!input.businessId || !input.userId) throw new Error("De horecazaak en medewerker ontbreken.");
  if (!productName) throw new Error("Vul een productnaam in.");
  if (!FOOD_WASTE_REASONS.includes(reason)) throw new Error("Kies een geldige reden.");
  const note = String(input.note || "").trim();
  if (reason === "Andere reden" && !note) throw new Error("Geef bij 'Andere reden' een korte toelichting.");
  const photo = input.photo;
  if (!photo || typeof photo.size !== "number" || photo.size <= 0) throw new Error("Voeg minstens één foto toe.");
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Het gewicht of aantal moet groter zijn dan nul.");
  const inputUnit = normaliseWasteUnit(input.unit);
  if (!["g", "kg", "ml", "cl", "l", "stuk"].includes(inputUnit)) throw new Error("Kies gram, kilogram, milliliter, centiliter, liter of stuks.");

  const stockItem = input.stockItem || null;
  let cost = { value: null, unitCost: null, stockQuantity: null, status: "Nog te bepalen" };
  if (stockItem && stockItem.unit) {
    try {
      cost = calculateWasteCost({
        quantity,
        inputUnit,
        stockUnit: stockItem.unit,
        purchasePrice: stockItem.purchasePrice,
        purchaseQuantity: stockItem.purchaseQuantity
      });
    } catch (error) {
      // A mismatched or custom stock unit must not block a valid waste report.
      cost = { value: null, unitCost: null, stockQuantity: null, status: "Nog te bepalen" };
    }
  }

  const clientId = input.clientId || globalThis.crypto?.randomUUID?.();
  if (!clientId) throw new Error("Er kon geen unieke offline registratiecode worden aangemaakt.");
  return {
    clientId,
    businessId: input.businessId,
    userId: input.userId,
    employeeName: String(input.employeeName || "").trim(),
    productName,
    stockItemId: stockItem?.id || null,
    quantity,
    inputUnit,
    reason,
    note,
    recipeId: input.recipeId || null,
    costSnapshot: cost,
    photo,
    clientCreatedAt: input.clientCreatedAt || new Date().toISOString(),
    syncStatus: "Wacht op synchronisatie"
  };
}

function openFoodWasteQueue(indexedDBApi = globalThis.indexedDB) {
  if (!indexedDBApi) return Promise.reject(new Error("Offline foto-opslag is niet beschikbaar op dit toestel."));
  return new Promise((resolve, reject) => {
    const request = indexedDBApi.open("animo-haccp-food-waste-v1", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "clientId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("De offline wachtrij kon niet worden geopend."));
    request.onblocked = () => reject(new Error("Sluit een oudere ANIMO HACCP-testtab en probeer opnieuw."));
  });
}

async function enqueueFoodWasteEntry(entry, indexedDBApi = globalThis.indexedDB) {
  if (!entry?.clientId || !entry?.photo) throw new Error("De registratie of foto ontbreekt.");
  const db = await openFoodWasteQueue(indexedDBApi);
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("entries", "readwrite");
    transaction.objectStore("entries").put(entry);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("De registratie kon niet offline worden bewaard."));
    transaction.onabort = () => reject(transaction.error || new Error("De offline opslag werd onderbroken."));
  });
  return entry.clientId;
}

async function listFoodWasteQueue(indexedDBApi = globalThis.indexedDB) {
  const db = await openFoodWasteQueue(indexedDBApi);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("entries", "readonly");
    const request = transaction.objectStore("entries").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("De offline wachtrij kon niet worden gelezen."));
  });
}

async function removeFoodWasteQueueEntry(clientId, indexedDBApi = globalThis.indexedDB) {
  const db = await openFoodWasteQueue(indexedDBApi);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("entries", "readwrite");
    transaction.objectStore("entries").delete(clientId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("De offline registratie kon niet worden verwijderd."));
  });
}

export {
  FOOD_WASTE_REASONS,
  normaliseWasteUnit,
  convertWasteQuantity,
  calculateWasteCost,
  createFoodWasteEntry,
  openFoodWasteQueue,
  enqueueFoodWasteEntry,
  listFoodWasteQueue,
  removeFoodWasteQueueEntry
};
