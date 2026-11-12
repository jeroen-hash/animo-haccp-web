import {
  FOOD_WASTE_REASONS,
  createFoodWasteEntry,
  enqueueFoodWasteEntry,
  listFoodWasteQueue
} from "./voedselverspilling-core.mjs";
import {
  deductFoodWasteStock,
  reverseFoodWasteStock
} from "./voedselverspilling-stock.mjs";
import { syncFoodWasteQueue } from "./voedselverspilling-sync.mjs";

const TABLE = "food_waste_entries";
const BUCKET = "food-waste-photos";
const COLUMNS = "id,business_id,client_id,created_by,employee_name,product_name,stock_item_id,quantity,input_unit,reason,note,photo_path,cost_unit,currency,unit_cost_snapshot,cost_value_snapshot,cost_status,client_created_at,voided_at,void_reason";
let initialized = false;
let busy = false;

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const money = (value) => new Intl.NumberFormat("nl-BE", {
  style: "currency", currency: "EUR"
}).format(Number(value || 0));
const dateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Onbekend" : date.toLocaleString("nl-BE", { timeZone: "Europe/Brussels" });
};
function client() { return window.FAVVGetSupabaseClient?.() || null; }
function business() { return window.FAVVCloudBusiness || null; }
function user() {
  return window.FAVVCloudUser || window.FAVVGetCurrentUser?.() || null;
}
function stockItems() {
  const state = window.FAVVGetLocalState?.() || {};
  return Array.isArray(state.stock) ? state.stock : [];
}

function applyWasteStockLocally(entry) {
  if (!entry?.stockItemId) return { status: "not_linked" };
  const state = window.FAVVGetLocalState?.() || {};
  const stockItem = (state.stock || []).find((item) => String(item.id) === String(entry.stockItemId));
  if (!stockItem) return { status: "stock_item_missing" };
  const result = deductFoodWasteStock({
    stockItem,
    quantity: entry.quantity,
    inputUnit: entry.inputUnit,
    sourceId: entry.clientId,
    stockMovements: state.stockMovements || [],
    userId: entry.userId,
    userName: entry.employeeName
  });
  if (result.status === "deducted") {
    const applied = window.FAVVApplyFoodWasteStockChange?.({
      stockItem: result.stockItem,
      movement: result.movement
    });
    if (!applied || !["applied", "already_applied"].includes(applied.status)) {
      throw new Error("De verspilling is bewaard, maar de voorraadboeking kon niet lokaal worden bevestigd.");
    }
  }
  return result;
}

async function syncStockBeforeWasteRow(entry) {
  const result = applyWasteStockLocally(entry);
  if (!["deducted", "already_applied"].includes(result.status)) return result;
  const currentState = window.FAVVGetLocalState?.() || {};
  const saved = await window.FAVVCloudSync?.saveNow?.(currentState);
  if (saved !== true) {
    throw new Error("De voorraadwijziging is nog niet veilig naar de cloud opgeslagen. De verspilling blijft wachten en wordt later opnieuw geprobeerd.");
  }
  return result;
}

async function reverseVoidedStockRows(rows) {
  for (const row of rows || []) {
    if (!row?.voided_at || !row.stock_item_id || !row.client_id) continue;
    const state = window.FAVVGetLocalState?.() || {};
    const movements = state.stockMovements || [];
    const existingReversal = movements.find((movement) =>
      movement?.sourceType === "food_waste_reversal" && movement?.sourceId === "void:" + row.client_id
    );
    if (existingReversal) {
      // The reversal may exist only in the local snapshot if its previous cloud
      // save failed. Retry the idempotent snapshot save before treating it as done.
      const saved = await window.FAVVCloudSync?.saveNow?.(state);
      if (saved !== true) {
        status("De voorraadterugboeking staat lokaal klaar, maar is nog niet door de cloud bevestigd. De synchronisatie wordt opnieuw geprobeerd.", true);
      }
      continue;
    }
    const original = movements.find((movement) =>
      movement?.sourceType === "food_waste" && movement?.sourceId === row.client_id
    );
    if (!original) continue;
    const stockItem = (state.stock || []).find((item) => String(item.id) === String(row.stock_item_id));
    if (!stockItem) {
      status("Een ongeldig verklaarde verspilling is gekoppeld aan een verwijderd stockproduct. Controleer de voorraadbeweging handmatig.", true);
      continue;
    }
    const result = reverseFoodWasteStock({
      stockItem,
      sourceId: row.client_id,
      stockMovements: movements,
      userId: user()?.id || null,
      userName: window.FAVVGetCurrentUser?.()?.name || user()?.email || ""
    });
    if (result.status !== "reversed") continue;
    const applied = window.FAVVApplyFoodWasteStockChange?.({
      stockItem: result.stockItem,
      movement: result.movement
    });
    if (!applied || !["applied", "already_applied"].includes(applied.status)) {
      status("De verspilling is ongeldig, maar de voorraadterugboeking kon niet worden toegepast.", true);
      continue;
    }
    const saved = await window.FAVVCloudSync?.saveNow?.(window.FAVVGetLocalState?.() || {});
    if (saved !== true) {
      status("De verspilling is ongeldig verklaard. De voorraadterugboeking staat lokaal klaar en wacht op veilige cloudsynchronisatie.", true);
    }
  }
}
function role() { return window.FAVVCloudRole || business()?.role || user()?.cloudRole || user()?.role || "employee"; }
function canManage() { return role() === "owner" || role() === "manager"; }
function status(message, error = false) {
  const node = $("foodWasteStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", error);
}

function ensureUi() {
  const nav = document.querySelector(".nav");
  const main = document.querySelector(".main");
  if (!nav || !main) return false;

  if (!$("foodWasteNav")) {
    const button = document.createElement("button");
    button.id = "foodWasteNav";
    button.className = "nav-btn";
    button.dataset.page = "food-waste";
    button.innerHTML = '<span aria-hidden="true">♻</span> Voedselverspilling <span id="foodWastePendingBadge" class="fw-badge" hidden>0</span>';
    const reports = nav.querySelector('[data-page="reports"]');
    nav.insertBefore(button, reports || null);
  }

  // The sidebar is hidden on phones, so expose the same page in the fixed mobile menu.
  const mobileNav = document.querySelector(".mobile-nav");
  if (mobileNav && !$("foodWasteMobileNav")) {
    const button = document.createElement("button");
    button.id = "foodWasteMobileNav";
    button.dataset.page = "food-waste";
    button.setAttribute("aria-label", "Voedselverspilling");
    button.innerHTML = "<b>♻</b>Verspilling";
    mobileNav.insertBefore(button, mobileNav.querySelector('[data-page="reports"]') || null);
  }

  if (!$("food-waste")) {
    const section = document.createElement("section");
    section.id = "food-waste";
    section.className = "page";
    section.innerHTML = `
      <div class="page-head"><div><h1>Voedselverspilling</h1><p>Registreer verspilling met foto en volg de kost op</p></div></div>
      <div class="fw-status" id="foodWasteStatus" role="status">Registraties worden veilig voorbereid.</div>
      <div class="fw-grid">
        <section class="card fw-form-card">
          <h2>Nieuwe registratie</h2>
          <form id="foodWasteForm">
            <label>Product</label>
            <select id="foodWasteStock" class="fw-control"><option value="">Koppel aan stock (optioneel)</option></select>
            <label>Productnaam</label>
            <input id="foodWasteProduct" class="fw-control" required maxlength="120" placeholder="Bijvoorbeeld kipfilet">
            <div class="fw-row">
              <div><label for="foodWasteQuantity">Hoeveelheid</label><input id="foodWasteQuantity" class="fw-control" type="number" min="0.001" step="0.001" required placeholder="0"></div>
              <div><label for="foodWasteUnit">Eenheid</label><select id="foodWasteUnit" class="fw-control"><option value="g">Gram (g)</option><option value="kg">Kilogram (kg)</option><option value="ml">Milliliter (ml)</option><option value="cl">Centiliter (cl)</option><option value="l">Liter (l)</option><option value="stuk">Stuks</option></select></div>
            </div>
            <label for="foodWasteReason">Reden</label>
            <select id="foodWasteReason" class="fw-control" required>${FOOD_WASTE_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("")}</select>
            <label for="foodWasteNote">Toelichting (verplicht bij 'Andere reden')</label>
            <textarea id="foodWasteNote" class="fw-control" rows="2" maxlength="500" placeholder="Korte toelichting"></textarea>
            <label for="foodWastePhoto">Foto (verplicht, max. 5 MB)</label>
            <input id="foodWastePhoto" class="fw-control" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
            <p class="fw-hint">De foto en registratie worden apart bewaard. Bij geen internet blijven ze op dit toestel wachten op synchronisatie.</p>
            <button id="foodWasteSave" class="btn" type="submit">Registratie bewaren</button>
          </form>
        </section>
        <section class="card fw-summary-card">
          <h2>Overzicht</h2>
          <div class="fw-metrics">
            <div><strong id="foodWasteCount">0</strong><span>Registraties</span></div>
            <div><strong id="foodWasteWeight">0</strong><span>Hoeveelheid (kg/l/stuk apart)</span></div>
            <div><strong id="foodWasteCost">€ 0,00</strong><span>Gekende kost</span></div>
          </div>
          <div class="fw-legend">Kostprijs wordt vastgelegd op het moment van registratie. Als je een stockproduct koppelt, wordt de voorraad automatisch verminderd. Bij onvoldoende voorraad of een afwijkende eenheid wordt niets afgeboekt.</div><button id="foodWasteRetry" class="btn secondary" type="button">Synchroniseer wachtende registraties</button>
          <h2 class="fw-list-title">Recente registraties</h2>
          <div id="foodWasteEntries"><div class="empty">Nog geen registraties geladen.</div></div>
        </section>
      </div>`;
    main.appendChild(section);
  }

  if (!$("foodWasteStyles")) {
    const style = document.createElement("style");
    style.id = "foodWasteStyles";
    style.textContent = `
      #food-waste .fw-grid{display:grid;grid-template-columns:minmax(280px,0.9fr) minmax(320px,1.1fr);gap:18px;align-items:start}
      #food-waste .fw-form-card,#food-waste .fw-summary-card{padding:20px}
      #food-waste h2{font-size:18px;margin:0 0 16px}
      #food-waste label{display:block;font-weight:600;margin:12px 0 6px}
      #food-waste .fw-control{box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #d7dee8;border-radius:10px;background:#fff;color:#172b4d;font:inherit}
      #food-waste .fw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      #food-waste .fw-hint,#food-waste .fw-legend{font-size:13px;color:#667085;line-height:1.5;margin:10px 0 16px}
      #food-waste .fw-status{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#eef6f2;color:#216e4e;font-size:14px}
      #food-waste .fw-status.is-error{background:#fff1f0;color:#b42318}
      #food-waste .fw-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #food-waste .fw-metrics>div{background:#f6f8fa;border-radius:12px;padding:12px;min-width:0}
      #food-waste .fw-metrics strong{display:block;font-size:22px;overflow-wrap:anywhere}
      #food-waste .fw-metrics span{font-size:12px;color:#667085}
      #food-waste .fw-list-title{margin-top:24px!important}
      #food-waste .fw-entry{border-top:1px solid #e7ebf0;padding:14px 0;display:flex;gap:12px;justify-content:space-between;align-items:flex-start}
      #food-waste .fw-entry strong{display:block}
      #food-waste .fw-entry small{display:block;color:#667085;margin-top:4px;line-height:1.45}
      #food-waste .fw-entry .fw-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      #food-waste .fw-badge{display:inline-block;border-radius:20px;background:#fef0c7;color:#93370d;padding:1px 7px;font-size:11px;margin-left:5px}
      #food-waste .fw-badge[hidden]{display:none}
      #food-waste .fw-photo{font-size:12px}
      #food-waste .fw-voided{opacity:.65}
      @media(max-width:850px){#food-waste .fw-grid{grid-template-columns:1fr}#food-waste .fw-metrics strong{font-size:18px}}
    `;
    document.head.appendChild(style);
  }
  return true;
}

function refreshStockOptions() {
  const select = $("foodWasteStock");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Koppel aan stock (optioneel)</option>' + stockItems()
    .map((item) => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.unit || "eenheid")}</option>`)
    .join("");
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function updatePendingBadge(count) {
  const badge = $("foodWastePendingBadge");
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count < 1;
}

async function trySyncQueue() {
  const supabase = client();
  if (!supabase || !business()?.id || !user()?.id || !navigator.onLine || window.FAVVOfflineMode) return null;
  const result = await syncFoodWasteQueue(supabase, {
    beforeServerInsert: syncStockBeforeWasteRow
  });
  updatePendingBadge(result.pending);
  return result;
}

async function loadEntries() {
  const supabase = client();
  const biz = business();
  if (!supabase || !biz?.id) {
    $("foodWasteEntries").innerHTML = '<div class="empty">Meld aan bij je horecazaak om registraties te bekijken. Offline registraties blijven op dit toestel bewaard.</div>';
    return;
  }
  const queued = await listFoodWasteQueue().catch(() => []);
  const pendingForBusiness = queued.filter((entry) => entry.businessId === biz.id);
  const showOfflineQueue = (message) => {
    const pendingHtml = pendingForBusiness.map((entry) => `
      <article class="fw-entry">
        <div>
          <strong>${esc(entry.productName)} · ${esc(entry.quantity)} ${esc(entry.inputUnit)}</strong>
          <small>${esc(entry.reason)} · ${dateTime(entry.clientCreatedAt)} · Door ${esc(entry.employeeName || "medewerker")}</small>
          <small><span class="fw-badge">Wacht op synchronisatie</span> Deze registratie staat veilig op dit toestel.</small>
        </div>
      </article>`).join("");
    $("foodWasteEntries").innerHTML = pendingHtml || '<div class="empty">Offline: de bestaande serverregistraties worden opnieuw geladen zodra de verbinding hersteld is.</div>';
    status(message);
  };

  // Voer geen serveraanvraag uit wanneer het toestel offline is.
  if (!navigator.onLine || window.FAVVOfflineMode) {
    showOfflineQueue("Offline: registraties op dit toestel blijven bewaard en worden later gesynchroniseerd.");
    return;
  }

  let data;
  try {
    const response = await supabase.from(TABLE).select(COLUMNS)
      .eq("business_id", biz.id).order("client_created_at", { ascending: false }).limit(100);
    if (response.error) throw response.error;
    data = response.data;
  } catch (error) {
    const networkFailure = error instanceof TypeError
      || /load failed|failed to fetch|networkerror|network request failed/i.test(String(error?.message || error));
    if (!networkFailure) throw error;
    showOfflineQueue("Geen verbinding met de server. Lokale registraties zijn veilig bewaard; bestaande registraties laden opnieuw zodra internet terug is.");
    return;
  }
  const rows = data || [];
  // Herstel voorraad ook wanneer een void-actie eerder offline/conflictgevoelig was.
  await reverseVoidedStockRows(rows);
  // Toon lokale wachtende registraties expliciet; ze staan nog niet in de serverlijst.
  const pendingClientIds = new Set(pendingForBusiness.map((entry) => entry.clientId));
  const serverClientIds = new Set(rows.map((row) => row.client_id));
  const pendingHtml = pendingForBusiness.filter((entry) => !serverClientIds.has(entry.clientId)).map((entry) => `
    <article class="fw-entry">
      <div>
        <strong>${esc(entry.productName)} · ${esc(entry.quantity)} ${esc(entry.inputUnit)}</strong>
        <small>${esc(entry.reason)} · ${dateTime(entry.clientCreatedAt)} · Door ${esc(entry.employeeName || "medewerker")}</small>
        <small><span class="fw-badge">Wacht op synchronisatie</span> Deze registratie staat veilig op dit toestel.</small>
      </div>
    </article>`).join("");
  const active = rows.filter((row) => !row.voided_at);
  const knownCost = active.filter((row) => row.cost_status === "calculated" && Number.isFinite(Number(row.cost_value_snapshot)));
  const totalCost = knownCost.reduce((sum, row) => sum + Number(row.cost_value_snapshot || 0), 0);
  $("foodWasteCount").textContent = String(active.length);
  $("foodWasteCost").textContent = money(totalCost);
  const totals = { g: 0, kg: 0, ml: 0, cl: 0, l: 0, stuk: 0 };
  for (const row of active) {
    const unit = String(row.input_unit || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(totals, unit)) totals[unit] += Number(row.quantity || 0);
  }
  const kg = totals.kg + totals.g / 1000;
  const litres = totals.l + totals.cl / 100 + totals.ml / 1000;
  const parts = [];
  if (kg) parts.push(new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(kg) + " kg");
  if (litres) parts.push(new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 }).format(litres) + " l");
  if (totals.stuk) parts.push(new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(totals.stuk) + " stuks");
  $("foodWasteWeight").textContent = parts.join(" · ") || "0";

  const canVoid = canManage();
  $("foodWasteEntries").innerHTML = (pendingHtml ? pendingHtml : "") + (rows.length ? rows.map((row) => `
    <article class="fw-entry ${row.voided_at ? "fw-voided" : ""}">
      <div>
        <strong>${esc(row.product_name)} · ${esc(row.quantity)} ${esc(row.input_unit)}</strong>
        <small>${esc(row.reason)} · ${dateTime(row.client_created_at)} · Door ${esc(row.employee_name || "medewerker")}</small>
        <small>${row.cost_status === "calculated" ? "Geraamde kost: " + money(row.cost_value_snapshot) : "Kost nog niet bepaald"} · ${row.voided_at ? "Ongeldig verklaard: " + esc(row.void_reason || "") : "Actief"}</small>
        ${pendingClientIds.has(row.client_id) ? '<small><span class="fw-badge">Synchronisatie wacht</span> De voorraadboeking wordt nog veilig opgeslagen.</small>' : ""}
        <small><a class="fw-photo" href="#" data-fw-photo="${esc(row.photo_path)}">Foto bekijken</a></small>
      </div>
      <div class="fw-actions">
        ${canVoid && !row.voided_at ? `<button class="btn secondary small" type="button" data-fw-void="${esc(row.id)}">Ongeldig verklaren</button>` : ""}
      </div>
    </article>`).join("") : (pendingHtml ? "" : '<div class="empty">Nog geen registraties gevonden.</div>'));
}

async function render() {
  if (!ensureUi()) return;
  refreshStockOptions();
  const queued = await listFoodWasteQueue().catch(() => []);
  updatePendingBadge(queued.length);
  const biz = business();
  if (!biz?.id || !user()?.id) {
    status("Meld aan bij ANIMO HACCP om verspilling te registreren. Offline wachtrij blijft lokaal bewaard.", true);
    return;
  }
  try {
    const synced = await trySyncQueue();
    if (synced?.synced) status(synced.synced + " offline registratie(s) gesynchroniseerd.");
    else status(window.FAVVOfflineMode || !navigator.onLine ? "Offline: nieuwe registraties worden veilig op dit toestel bewaard." : "Verbonden met de testomgeving.");
    await loadEntries();
  } catch (error) {
    status("Registraties konden niet worden geladen: " + (error.message || "onbekende fout"), true);
  }
}

async function saveRegistration(event) {
  event.preventDefault();
  if (busy) return;
  const biz = business();
  const signedInUser = user();
  if (!biz?.id || !signedInUser?.id) {
    status("De actieve horecazaak of medewerker ontbreekt. Meld opnieuw aan.", true);
    return;
  }
  const photo = $("foodWastePhoto").files?.[0];
  const selectedStock = stockItems().find((item) => String(item.id) === $("foodWasteStock").value) || null;
  if (!photo || !["image/jpeg", "image/png", "image/webp"].includes(String(photo.type || "").toLowerCase()) || photo.size <= 0 || photo.size > 5 * 1024 * 1024) {
    status("Kies een geldige JPEG-, PNG- of WebP-foto van maximaal 5 MB.", true);
    return;
  }
  try {
    busy = true;
    $("foodWasteSave").disabled = true;
    // iOS Safari kan een File-object na IndexedDB-opslag teruggeven zonder bytes.
    // Lees de afbeeldingsbytes expliciet uit en bewaar een gewone Blob in de wachtrij.
    const photoData = new Blob([await photo.arrayBuffer()], { type: photo.type });
    if (!photoData.size) throw new Error("De foto kon niet correct worden ingelezen. Kies de foto opnieuw.");
    const entry = createFoodWasteEntry({
      businessId: biz.id,
      userId: signedInUser.id,
      employeeName: window.FAVVGetCurrentUser?.()?.name || signedInUser.user_metadata?.full_name || signedInUser.email || "Medewerker",
      productName: $("foodWasteProduct").value,
      quantity: $("foodWasteQuantity").value,
      unit: $("foodWasteUnit").value,
      reason: $("foodWasteReason").value,
      note: $("foodWasteNote").value,
      photo: photoData,
      stockItem: selectedStock
    });
    await enqueueFoodWasteEntry(entry);
    const stockResult = applyWasteStockLocally(entry);
    $("foodWasteForm").reset();
    refreshStockOptions();
    if (stockResult.status === "deducted") {
      status("Registratie bewaard. " + stockResult.stockQuantity + " " + (selectedStock?.unit || "") + " werd uit de voorraad afgeboekt; cloudsynchronisatie volgt.");
    } else if (stockResult.status === "insufficient_stock") {
      status("Registratie bewaard, maar niet afgeboekt: onvoldoende voorraad. Beschikbaar: " + stockResult.available + " " + (selectedStock?.unit || "") + ".");
    } else if (stockResult.status === "unit_mismatch") {
      status("Registratie bewaard, maar niet afgeboekt: de eenheid komt niet overeen met de stockeenheid.", true);
    } else if (stockResult.status === "stock_item_missing") {
      status("Registratie bewaard, maar het gekoppelde stockproduct bestaat niet meer. Controleer de koppeling.", true);
    } else {
      status("Registratie lokaal bewaard. Foto en gegevens blijven behouden tot synchronisatie.");
    }
    updatePendingBadge((await listFoodWasteQueue()).length);
    if (navigator.onLine && !window.FAVVOfflineMode) {
      const result = await trySyncQueue();
      if (result?.synced) status("Registratie veilig gesynchroniseerd met ANIMO HACCP.");
      if (result?.pending) status("Registratie bewaard; synchronisatie volgt zodra de verbinding beschikbaar is.");
    }
    await loadEntries().catch(() => {});
  } catch (error) {
    status(error.message || "De registratie kon niet worden bewaard.", true);
  } finally {
    busy = false;
    $("foodWasteSave").disabled = false;
  }
}

async function handlePhoto(event) {
  const link = event.target.closest("[data-fw-photo]");
  if (!link) return;
  event.preventDefault();
  const preview = window.open("about:blank", "_blank");
  if (preview) preview.opener = null;
  const path = link.dataset.fwPhoto;
  try {
    const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("De foto kon niet worden geopend.");
    if (preview) preview.location.replace(data.signedUrl);
    else status("Je browser blokkeerde het fotovenster. Sta pop-ups toe om de foto te bekijken.", true);
  } catch (error) {
    if (preview) preview.close();
    status(error.message || "De foto kon niet worden geopend.", true);
  }
}

async function voidEntry(event) {
  const button = event.target.closest("[data-fw-void]");
  if (!button) return;
  if (!canManage()) return;
  const reason = window.prompt("Waarom wordt deze registratie ongeldig verklaard?");
  if (!reason?.trim()) return;
  try {
    button.disabled = true;
    const { error } = await client().from(TABLE).update({
      voided_at: new Date().toISOString(),
      void_reason: reason.trim()
    }).eq("id", button.dataset.fwVoid).eq("business_id", business().id);
    if (error) throw error;
    status("Registratie ongeldig verklaard. De historiek blijft bewaard.");
    await loadEntries();
  } catch (error) {
    status(error.message || "De registratie kon niet ongeldig worden verklaard.", true);
    button.disabled = false;
  }
}

async function retryPending() {
  const button = $("foodWasteRetry");
  // Geef op mobiel onmiddellijk zichtbare feedback zodra de tik aankomt.
  status("Synchronisatie gestart…");
  if (button) {
    button.disabled = true;
    button.textContent = "Bezig met synchroniseren…";
  }
  try {
    if (!navigator.onLine || window.FAVVOfflineMode) throw new Error("Er is nog geen actieve online ANIMO-sessie. Probeer opnieuw zodra je verbinding hersteld is.");
    const result = await trySyncQueue();
    if (!result) throw new Error("De synchronisatie is nog niet beschikbaar.");
    const firstFailure = result.results?.find((item) => item.status === "pending" && item.error);
    status(result.pending
      ? result.synced + " gesynchroniseerd; " + result.pending + " wachten nog. Reden: " + (firstFailure?.error || "onbekende synchronisatiefout")
      : result.synced + " registratie(s) gesynchroniseerd.");
    await loadEntries();
  } catch (error) {
    status(error.message || "Synchronisatie mislukt.", true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Synchroniseer wachtende registraties";
    }
  }
}

export function initFoodWasteUi() {
  if (initialized || !ensureUi()) return;
  initialized = true;
  $("foodWasteForm").addEventListener("submit", saveRegistration);
  // Gebruik ook de directe onclick-koppeling; dit blijft betrouwbaar bij
  // opnieuw opgebouwde mobiele pagina-elementen.
  $("foodWasteRetry").onclick = retryPending;
  $("foodWasteStock").addEventListener("change", () => {
    const item = stockItems().find((entry) => String(entry.id) === $("foodWasteStock").value);
    if (!item) return;
    if (!$("foodWasteProduct").value.trim()) $("foodWasteProduct").value = item.name || "";
    const unit = String(item.unit || "").trim().toLowerCase();
    const aliases = { kilogram: "kg", kilo: "kg", gram: "g", liter: "l", litre: "l", milliliter: "ml", millilitre: "ml", centiliter: "cl", stuks: "stuk", st: "stuk", pcs: "stuk" };
    const optionValue = aliases[unit] || unit;
    if ([...$("foodWasteUnit").options].some((option) => option.value === optionValue)) $("foodWasteUnit").value = optionValue;
  });
  $("foodWasteEntries").addEventListener("click", handlePhoto);
  $("foodWasteEntries").addEventListener("click", voidEntry);
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-page="food-waste"]')) render();
  });
  window.addEventListener("online", () => {
    if (document.getElementById("food-waste")?.classList.contains("active")) render();
  });
  window.FAVVRenderFoodWaste = render;
  if (document.getElementById("food-waste")?.classList.contains("active")) render();
}


if (typeof document !== "undefined") initFoodWasteUi();
