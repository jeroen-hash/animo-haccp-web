/**
 * ANIMO HACCP — Menurendabiliteit core
 * Pure calculations and import validation. No DOM, network or persistence side effects.
 */

export function parseEuroAmount(value) {
  const raw = String(value ?? "").trim().replace(/€|\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) normalized = normalized.replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

export function parseCsv(text, delimiter) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  if (!source.trim()) return [];
  const candidates = delimiter ? [delimiter] : [",", ";", "\t"];
  const count = (character) => {
    let quoted = false, total = 0;
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '"') {
        if (quoted && source[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && source[i] === character) total++;
      if (!quoted && source[i] === "\n") break;
    }
    return total;
  };
  const sep = candidates.sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === sep) {
      row.push(cell.trim()); cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  date: ["datum", "date", "verkoopdatum", "tijdstip"],
  product: ["product", "gerecht", "artikel", "omschrijving", "naam"],
  quantity: ["aantal", "quantity", "qty", "verkochte porties", "stuks"],
  unitPrice: ["prijs", "eenheidsprijs", "unit price", "verkoopprijs"],
  total: ["totaal", "bedrag", "omzet", "total", "line total"],
  vatRate: ["btw", "btw %", "vat", "vat rate", "btw-tarief"],
  transactionId: ["transactie", "transactie-id", "ticket", "bonnummer", "transaction id", "referentie"]
};

function headerIndex(headers, aliases) {
  return headers.findIndex(header => aliases.includes(String(header).trim().toLowerCase()));
}

function normalizeSalesDate(value) {
  const raw = String(value ?? "").trim();
  let year, month, day;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) [, year, month, day] = match;
  else {
    match = raw.match(/^(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return [String(y).padStart(4,"0"),String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}

export function normalizeSalesCsv(text, options = {}) {
  const rows = parseCsv(text, options.delimiter);
  if (rows.length < 2) return { rows: [], errors: ["Het bestand bevat geen verkoopregels."] };
  const headers = rows[0].map(value => value.toLowerCase().trim());
  const indexes = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, headerIndex(headers, aliases)]));
  const errors = [];
  for (const required of ["date", "product", "quantity"]) {
    if (indexes[required] < 0) errors.push("Kolom ontbreekt: " + required);
  }
  if (indexes.total < 0 && indexes.unitPrice < 0) errors.push("Voeg een kolom 'totaal' of 'eenheidsprijs' toe.");
  if (errors.length) return { rows: [], errors };
  const normalized = [];
  rows.slice(1).forEach((cells, index) => {
    const read = key => indexes[key] < 0 ? "" : (cells[indexes[key]] ?? "");
    const quantity = Number(String(read("quantity")).replace(",", "."));
    const total = indexes.total >= 0 ? parseEuroAmount(read("total")) : null;
    const unitPrice = indexes.unitPrice >= 0 ? parseEuroAmount(read("unitPrice")) : null;
    const lineTotal = total ?? (unitPrice == null ? null : Math.round(unitPrice * quantity * 100) / 100);
    const date = normalizeSalesDate(read("date"));
    const product = read("product").trim();
    if (!date || !product || !Number.isFinite(quantity) || quantity <= 0 || lineTotal == null || lineTotal < 0) {
      errors.push("Regel " + (index + 2) + ": datum, product, aantal of bedrag is ongeldig.");
      return;
    }
    const vatRaw = String(read("vatRate")).replace("%", "").replace(",", ".").trim();
    const vatRate = vatRaw === "" ? null : Number(vatRaw);
    if (vatRate != null && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)) {
      errors.push("Regel " + (index + 2) + ": ongeldig btw-tarief.");
      return;
    }
    normalized.push({
      sourceRow: index + 2,
      date,
      product,
      quantity,
      totalInclusive: lineTotal,
      unitPriceInclusive: lineTotal / quantity,
      vatRate,
      transactionId: read("transactionId").trim() || null
    });
  });
  return { rows: normalized, errors };
}

export function salesTotalExcludingVat(totalInclusive, vatRate) {
  if (totalInclusive == null || vatRate == null || String(vatRate).trim() === "") return null;
  const total = Number(totalInclusive);
  const rate = Number(vatRate);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return Math.round((total / (1 + rate / 100)) * 100) / 100;
}

export function dishEconomics({ recipe, ingredientCost, sellingPriceInclusive, vatRate }) {
  const yieldCount = Number(recipe?.yield);
  const cost = Number(ingredientCost);
  const price = Number(sellingPriceInclusive);
  const vat = Number(vatRate);
  if (!recipe || !Number.isFinite(yieldCount) || yieldCount <= 0) return { status: "invalid_recipe" };
  if (recipe.ingredientCostComplete === false || !Number.isFinite(cost) || cost < 0) return { status: "missing_cost" };
  if (sellingPriceInclusive == null || String(sellingPriceInclusive).trim() === "" || !Number.isFinite(price) || price < 0) return { status: "missing_selling_price" };
  if (vatRate == null || String(vatRate).trim() === "") return { status: "missing_vat_rate" };
  const priceExVat = salesTotalExcludingVat(price, vat);
  if (priceExVat == null) return { status: "missing_vat_rate" };
  const costPerPortion = cost / yieldCount;
  const grossProfit = priceExVat - costPerPortion;
  return {
    status: "ok",
    recipeId: recipe.id ?? null,
    recipeVersion: Number(recipe.version) || 1,
    sellingPriceInclusive: Math.round(price * 100) / 100,
    sellingPriceExclusive: priceExVat,
    vatRate: vat,
    ingredientCostPerPortion: costPerPortion,
    grossProfitPerPortion: grossProfit,
    grossMarginPercent: priceExVat > 0 ? (grossProfit / priceExVat) * 100 : null
  };
}

export function buildDishSalesSummary(salesRows, mappings, economicsByDish = {}) {
  const totals = new Map();
  const unmapped = [];
  for (const row of salesRows || []) {
    const dishId = row.dishId || (!row.importId ? mappings?.[String(row.product).trim().toLowerCase()] : null);
    if (!dishId) { unmapped.push(row); continue; }
    const economics = economicsByDish?.[dishId];
    const snapshotCost = row.ingredientCostPerPortionSnapshot != null && Number.isFinite(Number(row.ingredientCostPerPortionSnapshot))
      ? Number(row.ingredientCostPerPortionSnapshot)
      : economics?.status === "ok" ? economics.ingredientCostPerPortion : null;
    const revenueExclusive = row.vatRate == null ? null : salesTotalExcludingVat(row.totalInclusive, row.vatRate);
    const current = totals.get(dishId) || {
      dishId, portions: 0, revenueInclusive: 0, revenueExclusive: 0,
      ingredientCost: 0, grossProfit: 0, lines: 0,
      linesWithVat: 0, linesWithCost: 0, linesWithProfit: 0
    };
    current.portions += Number(row.quantity);
    current.revenueInclusive += Number(row.totalInclusive);
    if (revenueExclusive != null) {
      current.revenueExclusive += revenueExclusive;
      current.linesWithVat++;
    }
    if (snapshotCost != null && Number.isFinite(snapshotCost) && snapshotCost >= 0) {
      const lineCost = Number(row.quantity) * snapshotCost;
      current.ingredientCost += lineCost;
      current.linesWithCost++;
      if (revenueExclusive != null) {
        current.grossProfit += revenueExclusive - lineCost;
        current.linesWithProfit++;
      }
    }
    current.lines++;
    totals.set(dishId, current);
  }
  return {
    dishes: [...totals.values()].map(row => {
      const completeRevenue = row.linesWithVat === row.lines;
      const completeCost = row.linesWithCost === row.lines;
      const completeProfit = row.linesWithProfit === row.lines;
      const revenueExclusive = completeRevenue ? round2(row.revenueExclusive) : null;
      const grossProfit = completeProfit ? round2(row.grossProfit) : null;
      return {
        ...row,
        revenueInclusive: round2(row.revenueInclusive),
        revenueExclusive,
        ingredientCost: completeCost ? round2(row.ingredientCost) : null,
        grossProfit,
        grossProfitPerPortion: grossProfit == null || row.portions <= 0 ? null : grossProfit / row.portions,
        grossMarginPercent: grossProfit == null || revenueExclusive == null || revenueExclusive <= 0 ? null : (grossProfit / revenueExclusive) * 100,
        missingVatRows: row.lines - row.linesWithVat,
        missingCostRows: row.lines - row.linesWithCost
      };
    }),
    unmapped
  };
}

function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

export function classifyMenuItems(items) {
  const valid = (items || []).filter(item => Number.isFinite(Number(item.portions)) && Number(item.portions) >= 0 && Number.isFinite(Number(item.grossProfitPerPortion)));
  if (!valid.length) return [];
  const popularityThreshold = median(valid.map(item => Number(item.portions)));
  const profitThreshold = median(valid.map(item => Number(item.grossProfitPerPortion)));
  return valid.map(item => {
    const popular = Number(item.portions) >= popularityThreshold;
    const profitable = Number(item.grossProfitPerPortion) >= profitThreshold;
    const classification = popular ? (profitable ? "star" : "workhorse") : (profitable ? "puzzle" : "dog");
    return { ...item, classification, popularityThreshold, profitThreshold };
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}


/**
 * Build an all-or-nothing stock plan for mapped POS sales.
 * Recipe ingredient quantities use the same stock units as manual production.
 */
export function buildSalesStockDeductionPlan(salesRows, recipes, stock) {
  const recipeById = new Map((recipes || []).map(recipe => [String(recipe.id), recipe]));
  const stockById = new Map((stock || []).map(item => [String(item.id), item]));
  const requirements = new Map();
  const errors = [];
  let mappedRows = 0;
  let unmappedRows = 0;

  for (const row of salesRows || []) {
    if (!row?.dishId) { unmappedRows++; continue; }
    mappedRows++;
    const recipe = recipeById.get(String(row.dishId));
    const portions = Number(row.quantity);
    const yieldCount = Number(recipe?.yield);
    if (!recipe || !Number.isFinite(portions) || portions <= 0 ||
        !Number.isFinite(yieldCount) || yieldCount <= 0 ||
        !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      errors.push({ product: row.product || "", reason: "missing_or_invalid_recipe" });
      continue;
    }
    for (const ingredient of recipe.ingredients) {
      const stockId = String(ingredient.stockId || "");
      const product = stockById.get(stockId);
      const quantity = Number(ingredient.quantity);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ product: row.product || recipe.name, stockId, reason: "missing_stock_item_or_quantity" });
        continue;
      }
      const need = quantity * portions / yieldCount;
      const current = requirements.get(stockId) || { stockId, name: product.name, unit: product.unit || "", required: 0, available: 0 };
      current.required += need;
      requirements.set(stockId, current);
    }
  }

  const result = [...requirements.values()].map(item => {
    const product = stockById.get(item.stockId);
    const batches = Array.isArray(product?.batches) ? product.batches.filter(batch => Number(batch.quantity) > 0) : [];
    const available = batches.length
      ? batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0)
      : Math.max(0, Number(product?.quantity) || 0);
    return { ...item, available, shortage: Math.max(0, item.required - available) };
  });
  const shortages = result.filter(item => item.shortage > 0.000001);
  return {
    status: errors.length ? "invalid_recipe" : !mappedRows ? "no_mapped_sales" : shortages.length ? "insufficient_stock" : "ready",
    mappedRows, unmappedRows, errors, shortages, requirements: result
  };
}

export function salesImportFingerprint(fileName, rows) {
  const dates = (rows || []).map(row => String(row.date)).sort();
  const period = dates.length ? dates[0] + "__" + dates[dates.length - 1] : "empty";
  const contentSignature = (rows || []).map(row => [
    row.date, String(row.product).trim().toLowerCase(), row.quantity,
    row.totalInclusive, row.vatRate ?? "", row.transactionId ?? ""
  ].join("~")).sort().join(";");
  // Store a compact deterministic signature, not the full contents of the imported file.
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  for (let index = 0; index < contentSignature.length; index++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(contentSignature.charCodeAt(index))) * prime);
  }
  return [period, (rows || []).length, hash.toString(16)].join("|");
}

export function findDuplicateSalesLines(existingRows, incomingRows) {
  const seen = new Set((existingRows || []).filter(row => row.transactionId).map(row =>
    [row.transactionId, row.product.toLowerCase(), row.quantity, row.totalInclusive].join("|")
  ));
  const duplicates = [], unique = [];
  for (const row of incomingRows || []) {
    const key = row.transactionId
      ? [row.transactionId, row.product.toLowerCase(), row.quantity, row.totalInclusive].join("|")
      : null;
    if (key && seen.has(key)) duplicates.push(row);
    else {
      unique.push(row);
      if (key) seen.add(key);
    }
  }
  return { unique, duplicates };
}

export function recipeCostSnapshotForDate(recipe, saleDate, currentIngredientCost, currentCostComplete = true) {
  const date = normalizeSalesDate(saleDate);
  if (!recipe || !date) return null;
  const createdDate = String(recipe.createdAt || "").slice(0, 10);
  const currentStartDate = String(recipe.updatedAt || recipe.createdAt || "").slice(0, 10);
  if (createdDate && date < createdDate) return null;

  const versions = Array.isArray(recipe.versions)
    ? recipe.versions.filter(version => version && version.savedAt)
      .slice().sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)))
    : [];

  if (currentStartDate && date > currentStartDate) {
    const yieldCount = Number(recipe.yield);
    const cost = Number(currentIngredientCost);
    if (!currentCostComplete || !Number.isFinite(yieldCount) || yieldCount <= 0 || !Number.isFinite(cost) || cost < 0) return null;
    return { recipeVersion: Number(recipe.version) || 1, ingredientCostPerPortion: cost / yieldCount, source: "current_recipe" };
  }

  if (currentStartDate && date === currentStartDate) return null;
  if (versions.some(version => String(version.savedAt).slice(0, 10) === date)) return null;

  const previousVersion = versions.find(version => String(version.savedAt).slice(0, 10) > date);
  if (!previousVersion) return null;
  const yieldCount = Number(previousVersion.yield);
  const cost = Number(previousVersion.cost);
  if (!Number.isFinite(yieldCount) || yieldCount <= 0 || !Number.isFinite(cost) || cost < 0) return null;
  return {
    recipeVersion: Number(previousVersion.version) || null,
    ingredientCostPerPortion: cost / yieldCount,
    source: "saved_recipe_version"
  };
}

export function createCostSnapshot({ recipe, ingredientCost, capturedAt = new Date().toISOString() }) {
  if (!recipe || !Number.isFinite(Number(ingredientCost)) || Number(ingredientCost) < 0) throw new Error("Ongeldige receptkostsnapshot.");
  return {
    recipeId: recipe.id ?? null,
    recipeName: String(recipe.name || ""),
    recipeVersion: Number(recipe.version) || 1,
    recipeYield: Number(recipe.yield),
    ingredientCost: round2(ingredientCost),
    ingredientCostPerPortion: round2(Number(ingredientCost) / Math.max(1, Number(recipe.yield))),
    capturedAt
  };
}
