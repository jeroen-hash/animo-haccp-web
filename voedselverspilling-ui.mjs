import {
  FOOD_WASTE_REASONS,
  createFoodWasteEntry,
  enqueueFoodWasteEntry,
  listFoodWasteQueue
} from "./voedselverspilling-core.mjs";
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
          <div class="fw-legend">Kostprijs wordt vastgelegd op het moment van registratie. Voedselverspilling vermindert de stock niet automatisch.</div>
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
  const result = await syncFoodWasteQueue(supabase);
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
  const { data, error } = await supabase.from(TABLE).select(COLUMNS)
    .eq("business_id", biz.id).order("client_created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = data || [];
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
  $("foodWasteEntries").innerHTML = rows.length ? rows.map((row) => `
    <article class="fw-entry ${row.voided_at ? "fw-voided" : ""}">
      <div>
        <strong>${esc(row.product_name)} · ${esc(row.quantity)} ${esc(row.input_unit)}</strong>
        <small>${esc(row.reason)} · ${dateTime(row.client_created_at)} · Door ${esc(row.employee_name || "medewerker")}</small>
        <small>${row.cost_status === "calculated" ? "Geraamde kost: " + money(row.cost_value_snapshot) : "Kost nog niet bepaald"} · ${row.voided_at ? "Ongeldig verklaard: " + esc(row.void_reason || "") : "Actief"}</small>
        <small><a class="fw-photo" href="#" data-fw-photo="${esc(row.photo_path)}">Foto bekijken</a></small>
      </div>
      <div class="fw-actions">
        ${canVoid && !row.voided_at ? `<button class="btn secondary small" type="button" data-fw-void="${esc(row.id)}">Ongeldig verklaren</button>` : ""}
      </div>
    </article>`).join("") : '<div class="empty">Nog geen registraties gevonden.</div>';
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
    const entry = createFoodWasteEntry({
      businessId: biz.id,
      userId: signedInUser.id,
      employeeName: window.FAVVGetCurrentUser?.()?.name || signedInUser.user_metadata?.full_name || signedInUser.email || "Medewerker",
      productName: $("foodWasteProduct").value,
      quantity: $("foodWasteQuantity").value,
      unit: $("foodWasteUnit").value,
      reason: $("foodWasteReason").value,
      note: $("foodWasteNote").value,
      photo,
      stockItem: selectedStock
    });
    await enqueueFoodWasteEntry(entry);
    $("foodWasteForm").reset();
    refreshStockOptions();
    status("Registratie lokaal bewaard. Foto en gegevens blijven behouden tot synchronisatie.");
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
  const path = link.dataset.fwPhoto;
  try {
    const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("De foto kon niet worden geopend.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
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

export function initFoodWasteUi() {
  if (initialized || !ensureUi()) return;
  initialized = true;
  $("foodWasteForm").addEventListener("submit", saveRegistration);
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
