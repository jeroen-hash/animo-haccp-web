import {
  dishEconomics,
  normalizeSalesCsv,
  salesImportFingerprint,
  findDuplicateSalesLines,
  buildDishSalesSummary,
  classifyMenuItems
} from "./menurendabiliteit-core.mjs";

let pendingImport = null;
let initialized = false;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const money = value => value == null ? "—" : new Intl.NumberFormat("nl-BE",{style:"currency",currency:"EUR"}).format(Number(value));
const number = value => new Intl.NumberFormat("nl-BE",{maximumFractionDigits:2}).format(Number(value||0));
const normalizedName = value => String(value||"").trim().toLocaleLowerCase("nl-BE");
const emptySettings = () => ({pricesByRecipe:{},salesImports:[],salesRows:[],mappings:{}});

function appData() {
  const data = window.FAVVGetMenuProfitabilityData?.();
  if (!data) return {recipes:[],settings:emptySettings()};
  const settings = {...emptySettings(),...(data.settings||{})};
  settings.pricesByRecipe = settings.pricesByRecipe || {};
  settings.salesImports = Array.isArray(settings.salesImports) ? settings.salesImports : [];
  settings.salesRows = Array.isArray(settings.salesRows) ? settings.salesRows : [];
  settings.mappings = settings.mappings || {};
  return {...data,settings};
}
function saveSettings(settings) {
  if (window.FAVVSaveMenuProfitability?.(settings) !== true) throw new Error("Instellingen konden niet worden bewaard.");
}
function ensureUi() {
  const nav = document.querySelector(".nav");
  const main = document.querySelector(".main");
  if (!nav || !main) return false;
  if (!$("menuProfitabilityNav")) {
    const button = document.createElement("button");
    button.id = "menuProfitabilityNav";
    button.className = "nav-btn manager-only";
    button.dataset.page = "menu-profitability";
    button.innerHTML = '<span aria-hidden="true">◈</span> Menurendabiliteit';
    const recipes = nav.querySelector('[data-page="recipes"]');
    nav.insertBefore(button, recipes?.nextSibling || null);
  }
  if (!$("menu-profitability")) {
    const section = document.createElement("section");
    section.id = "menu-profitability";
    section.className = "page";
    section.innerHTML = `
      <div class="page-head"><div><h1>Menurendabiliteit</h1><p>Zie wat je gerechten kosten, opleveren en hoe ze presteren</p></div></div>
      <div class="mr-notice">De berekening gebruikt de bestaande receptkost van ANIMO. Verkoopcijfers verschijnen pas na import van een kassarapport. Brutowinst is hier op basis van ingrediënten, geen nettowinst.</div>
      <div class="mr-filters card">
        <div class="field"><label for="mrDateFrom">Van</label><input id="mrDateFrom" type="date"></div>
        <div class="field"><label for="mrDateTo">Tot en met</label><input id="mrDateTo" type="date"></div>
        <button class="btn secondary" type="button" data-mr-action="refresh">Toepassen</button>
      </div>
      <div id="mrSummary" class="mr-summary"></div>
      <div class="card mr-card">
        <div class="mr-section-head"><div><h2>Verkoopprijs en ingrediëntmarge</h2><p>Stel per gerecht de verkoopprijs inclusief btw en het btw-tarief in.</p></div></div>
        <div id="mrDishPrices"></div>
      </div>
      <div class="card mr-card">
        <div class="mr-section-head"><div><h2>Kassaverkoop importeren</h2><p>Importeer een CSV-export. Je koppelt kassaproducten zelf aan je ANIMO-recepten.</p></div></div>
        <div class="mr-import-guide"><strong>Benodigde kolommen:</strong> Datum, Product, Aantal en Totaal of Eenheidsprijs. Optioneel: BTW % en Transactie-ID. Gebruik CSV met komma of puntkomma als scheidingsteken.</div>
        <div class="mr-import-row"><input id="mrSalesFile" type="file" accept=".csv,text/csv"><button class="btn" type="button" data-mr-action="preview-import">Bestand controleren</button></div>
        <div id="mrImportStatus" class="mr-status" role="status"></div>
        <div id="mrImportPreview"></div>
      </div>
      <div class="card mr-card">
        <div class="mr-section-head"><div><h2>Verkoopresultaten</h2><p>Alleen gekoppelde verkoopregels met een geldig btw-tarief tellen mee voor omzet exclusief btw en brutowinst.</p></div></div>
        <div id="mrSalesResults"></div>
      </div>
      <div class="card mr-card">
        <div class="mr-section-head"><div><h2>Menu-matrix</h2><p>Populariteit en brutowinst per portie worden vergeleken met de mediaan van de geselecteerde periode.</p></div></div>
        <div id="mrMenuMatrix"></div>
      </div>
      <div id="mrHistory" class="mr-history"></div>`;
    main.appendChild(section);
  }
  const role = window.FAVVCloudRole || window.FAVVGetCurrentUser?.()?.cloudRole || window.FAVVGetCurrentUser?.()?.role;
  const allowed = role === "owner" || role === "manager";
  const button = $("menuProfitabilityNav");
  button.style.display = allowed ? "" : "none";
  return true;
}
function getRange(rows) {
  const from = $("mrDateFrom")?.value || "";
  const to = $("mrDateTo")?.value || "";
  return rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
}
function economicsByRecipe(data) {
  const result = {};
  for (const recipe of data.recipes || []) {
    const price = data.settings.pricesByRecipe[recipe.id] || {};
    result[recipe.id] = dishEconomics({
      recipe,
      ingredientCost: recipe.ingredientCost,
      sellingPriceInclusive: price.sellingPriceInclusive,
      vatRate: price.vatRate
    });
  }
  return result;
}
function renderPrices(data) {
  const rows = (data.recipes||[]).map(recipe => {
    const setting = data.settings.pricesByRecipe[recipe.id] || {};
    const economics = dishEconomics({
      recipe, ingredientCost:recipe.ingredientCost,
      sellingPriceInclusive:setting.sellingPriceInclusive, vatRate:setting.vatRate
    });
    const cost = Number(recipe.ingredientCost) / Math.max(1,Number(recipe.yield)||1);
    return `<div class="mr-price-row">
      <div class="mr-dish-name"><strong>${esc(recipe.name)}</strong><small>Receptversie ${Number(recipe.version)||1} · ${number(recipe.yield)} porties</small></div>
      <div class="mr-price-field"><label>Verkoopprijs incl. btw (€)</label><input type="number" min="0" step="0.01" inputmode="decimal" data-mr-price="${esc(recipe.id)}" value="${setting.sellingPriceInclusive ?? ""}" placeholder="0,00"></div>
      <div class="mr-price-field"><label>Btw-tarief</label><select data-mr-vat="${esc(recipe.id)}"><option value="">Kies btw</option>${[6,12,21].map(v=>`<option value="${v}" ${Number(setting.vatRate)===v?"selected":""}>${v}%</option>`).join("")}</select></div>
      <div class="mr-cost"><small>Kost per portie</small><strong>${money(cost)}</strong></div>
      <div class="mr-cost"><small>Brutowinst per portie</small><strong>${economics.status==="ok"?money(economics.grossProfitPerPortion):"Nog in te stellen"}</strong><small>${economics.status==="ok"?"Marge "+number(economics.grossMarginPercent)+"%":"Prijs en btw nodig"}</small></div>
      <button class="btn secondary small" type="button" data-mr-action="save-price" data-id="${esc(recipe.id)}">Bewaren</button>
    </div>`;
  }).join("");
  $("mrDishPrices").innerHTML = rows || '<div class="mr-empty">Maak eerst recepten aan in de module Recepten.</div>';
}
function renderSales(data) {
  const allRows = getRange(data.settings.salesRows);
  const economics = economicsByRecipe(data);
  const summary = buildDishSalesSummary(allRows,data.settings.mappings,economics);
  const totalPortions = summary.dishes.reduce((sum,row)=>sum+row.portions,0);
  const complete = summary.dishes.length>0 && summary.unmapped.length===0 && summary.dishes.every(row=>row.grossProfit!=null && row.revenueExclusive!=null);
  const revenue = complete ? summary.dishes.reduce((sum,row)=>sum+row.revenueExclusive,0) : null;
  const profit = complete ? summary.dishes.reduce((sum,row)=>sum+row.grossProfit,0) : null;
  $("mrSummary").innerHTML = [
    ["Verkochte porties",allRows.length?number(totalPortions):"—"],
    ["Omzet excl. btw",revenue!=null?money(revenue):"—"],
    ["Brutowinst op ingrediënten",profit!=null?money(profit):"—"],
    ["Niet gekoppelde regels",summary.unmapped.length?number(summary.unmapped.length):"0"]
  ].map(([label,value])=>`<div class="mr-stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
  $("mrSalesResults").innerHTML = summary.dishes.length ? `
    <div class="mr-table-wrap"><table class="mr-table"><thead><tr><th>Gerecht</th><th>Porties</th><th>Omzet incl. btw</th><th>Omzet excl. btw</th><th>Ingrediëntkost</th><th>Brutowinst</th><th>Marge</th></tr></thead><tbody>
    ${summary.dishes.map(row=>{const recipe=data.recipes.find(item=>item.id===row.dishId);return `<tr><td>${esc(recipe?.name||"Onbekend gerecht")}</td><td>${number(row.portions)}</td><td>${money(row.revenueInclusive)}</td><td>${money(row.revenueExclusive)}</td><td>${money(row.ingredientCost)}</td><td>${money(row.grossProfit)}</td><td>${row.grossMarginPercent==null?"—":number(row.grossMarginPercent)+"%"}</td></tr>`}).join("")}
    </tbody></table></div>${summary.unmapped.length?`<p class="mr-warning">${summary.unmapped.length} verkoopregel(s) zijn nog niet gekoppeld of missen een geldige receptkost. Ze zijn niet opgenomen in de rendabiliteit.</p>`:""}`
    : '<div class="mr-empty">Nog geen verkoopregels voor deze periode. Importeer eerst een kassarapport.</div>';
  const menuItems = summary.dishes.map(row=>{
    const recipe=data.recipes.find(item=>item.id===row.dishId);
    const econ=economics[row.dishId];
    return {dishId:row.dishId,name:recipe?.name||"Onbekend",portions:row.portions,grossProfitPerPortion:row.grossProfitPerPortion};
  }).filter(item=>Number.isFinite(item.grossProfitPerPortion));
  const classified=classifyMenuItems(menuItems);
  const labels={star:"Ster",workhorse:"Werkpaard",puzzle:"Uitdaging",dog:"Aandachtspunt"};
  $("mrMenuMatrix").innerHTML = classified.length ? `
    <div class="mr-matrix-grid">${classified.map(item=>`<div class="mr-matrix-item ${item.classification}"><strong>${esc(item.name)}</strong><span>${labels[item.classification]}</span><small>${number(item.portions)} verkocht · ${money(item.grossProfitPerPortion)} brutowinst/portie</small></div>`).join("")}</div>
    <p class="mr-footnote">Drempels zijn de mediaan van de getoonde gerechten: populariteit ${number(classified[0].popularityThreshold)} porties en brutowinst ${money(classified[0].profitThreshold)} per portie.</p>`
    : '<div class="mr-empty">De menu-matrix verschijnt zodra er gekoppelde verkoopregels en geldige prijzen beschikbaar zijn.</div>';
  $("mrHistory").innerHTML = data.settings.salesImports.length ? `
    <div class="card mr-card"><h2>Geïmporteerde kassabestanden</h2>${data.settings.salesImports.slice().reverse().map(item=>`<div class="mr-history-row"><span><strong>${esc(item.fileName)}</strong><small>${number(item.rowCount)} regels · ${new Date(item.importedAt).toLocaleString("nl-BE")}</small></span><span class="mr-tag">Geïmporteerd</span></div>`).join("")}</div>` : "";
}
function render() {
  if (!ensureUi()) return;
  const data=appData();
  renderPrices(data);
  renderSales(data);
}
async function previewImport() {
  const file=$("mrSalesFile")?.files?.[0];
  if(!file){$("mrImportStatus").textContent="Kies eerst een CSV-bestand.";return;}
  if(file.size>1024*1024){$("mrImportStatus").textContent="Het CSV-bestand is groter dan 1 MB. Exporteer een kortere periode of splits het kassabestand.";return;}
  const parsed=normalizeSalesCsv(await file.text());
  if(parsed.errors.length){$("mrImportStatus").textContent=parsed.errors.join(" ");$("mrImportPreview").innerHTML="";pendingImport=null;return;}
  if(parsed.rows.length>10000){$("mrImportStatus").textContent="Dit bestand bevat meer dan 10.000 verkoopregels. Splits het bestand in kleinere periodes.";return;}
  const data=appData();
  if(data.settings.salesRows.length+parsed.rows.length>25000){$("mrImportStatus").textContent="De lokale verkoopgeschiedenis bereikt de veilige limiet van 25.000 regels. Exporteer of archiveer eerst oudere gegevens.";return;}
  const fingerprint=salesImportFingerprint(file.name,parsed.rows);
  if(data.settings.salesImports.some(item=>item.fingerprint===fingerprint)){
    $("mrImportStatus").textContent="Dit bestand lijkt al geïmporteerd. Er zijn geen regels toegevoegd.";
    $("mrImportPreview").innerHTML="";pendingImport=null;return;
  }
  const uniqueCheck=findDuplicateSalesLines(data.settings.salesRows,parsed.rows);
  const rows=uniqueCheck.unique;
  if(!rows.length){$("mrImportStatus").textContent="Alle verkoopregels uit dit bestand zijn al aanwezig.";pendingImport=null;return;}
  const products=[...new Set(rows.map(row=>row.product))];
  pendingImport={fileName:file.name,fingerprint,rows,duplicateCount:uniqueCheck.duplicates.length};
  $("mrImportStatus").textContent=`${rows.length} regels klaar om te importeren; ${uniqueCheck.duplicates.length} herkenbare dubbele regels worden overgeslagen.`;
  $("mrImportPreview").innerHTML=`
    <div class="mr-mapping"><h3>Koppel kassaproducten aan ANIMO-recepten</h3>
    ${products.map(product=>`<label class="mr-map-row"><span>${esc(product)}</span><select data-mr-map="${esc(normalizedName(product))}"><option value="">Niet koppelen</option>${data.recipes.map(recipe=>`<option value="${esc(recipe.id)}" ${data.settings.mappings[normalizedName(product)]===recipe.id?"selected":""}>${esc(recipe.name)}</option>`).join("")}</select></label>`).join("")}
    <button class="btn" type="button" data-mr-action="commit-import">Import bevestigen</button></div>`;
}
function commitImport() {
  if(!pendingImport)return;
  const data=appData();
  const mappings={...data.settings.mappings};
  document.querySelectorAll("[data-mr-map]").forEach(select=>{
    if(select.value)mappings[select.dataset.mrMap]=select.value;
    else delete mappings[select.dataset.mrMap];
  });
  const importedAt=new Date().toISOString();
  const importId="sales-"+importedAt+"-"+pendingImport.fingerprint.length;
  const recipesById=new Map(data.recipes.map(recipe=>[recipe.id,recipe]));
  const newRows=pendingImport.rows.map(row=>{
    const dishId=mappings[normalizedName(row.product)]||null;
    const recipe=dishId?recipesById.get(dishId):null;
    return {
      ...row,importId,dishId,
      recipeVersion:recipe?(Number(recipe.version)||1):null,
      ingredientCostPerPortionSnapshot:recipe
        ? Number(recipe.ingredientCost)/Math.max(1,Number(recipe.yield)||1)
        : null
    };
  });
  const next={
    ...data.settings,mappings,
    salesRows:[...data.settings.salesRows,...newRows],
    salesImports:[...data.settings.salesImports,{fingerprint:pendingImport.fingerprint,fileName:pendingImport.fileName,rowCount:newRows.length,importedAt,importId}]
  };
  saveSettings(next);
  $("mrImportStatus").textContent=`${newRows.length} verkoopregels geïmporteerd. Niet gekoppelde regels blijven zichtbaar als niet gekoppeld.`;
  $("mrImportPreview").innerHTML="";
  $("mrSalesFile").value="";
  pendingImport=null;
  render();
}
function savePrice(recipeId) {
  const data=appData();
  const priceInput=document.querySelector(`[data-mr-price="${CSS.escape(recipeId)}"]`);
  const vatInput=document.querySelector(`[data-mr-vat="${CSS.escape(recipeId)}"]`);
  const price=priceInput?.value===""?null:Number(priceInput?.value);
  const vat=vatInput?.value===""?null:Number(vatInput?.value);
  if(price==null||!Number.isFinite(price)||price<0||![6,12,21].includes(vat)){
    $("mrImportStatus").textContent="Vul een geldige verkoopprijs en een btw-tarief van 6%, 12% of 21% in.";
    return;
  }
  const pricesByRecipe={...data.settings.pricesByRecipe,[recipeId]:{sellingPriceInclusive:price,vatRate:vat,updatedAt:new Date().toISOString()}};
  saveSettings({...data.settings,pricesByRecipe});
  render();
}
function clickHandler(event) {
  const button=event.target.closest("[data-mr-action]");
  if(!button)return;
  try {
    if(button.dataset.mrAction==="save-price")savePrice(button.dataset.id);
    if(button.dataset.mrAction==="preview-import")previewImport().catch(error=>$("mrImportStatus").textContent=error.message||"CSV kon niet worden gelezen.");
    if(button.dataset.mrAction==="commit-import")commitImport();
    if(button.dataset.mrAction==="refresh")render();
  } catch(error) {
    $("mrImportStatus").textContent=error.message||"De actie is mislukt.";
  }
}
function init() {
  if(initialized||!ensureUi())return;
  initialized=true;
  document.addEventListener("click",clickHandler);
  window.FAVVRenderMenuProfitability=render;
  window.FAVVSetMenuProfitabilityAccess=role=>{ $("menuProfitabilityNav").style.display=(role==="owner"||role==="manager")?"":"none"; };
  const role=window.FAVVCloudRole||window.FAVVGetCurrentUser?.()?.cloudRole||window.FAVVGetCurrentUser?.()?.role||"";
  window.FAVVSetMenuProfitabilityAccess(role);
  render();
}
document.addEventListener("DOMContentLoaded",init,{once:true});
if(document.readyState==="interactive"||document.readyState==="complete")init();

const style=document.createElement("style");
style.textContent=`
.mr-notice{padding:13px 16px;margin:0 0 16px;border-left:4px solid #147a46;background:#f1f8f3;border-radius:0 10px 10px 0;color:#355443;line-height:1.5}
.mr-filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin-bottom:16px}.mr-filters .field{margin:0;min-width:150px}
.mr-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px}
.mr-stat{background:#fff;border:1px solid #dce5df;border-radius:13px;padding:16px;min-width:0}.mr-stat small,.mr-cost small,.mr-dish-name small{display:block;color:#65736a;font-size:12px}.mr-stat strong{display:block;font-size:clamp(19px,2.4vw,27px);margin-top:6px;color:#174d34}
.mr-card{margin-bottom:16px;min-width:0}.mr-section-head{margin-bottom:14px}.mr-section-head h2{margin:0 0 4px}.mr-section-head p{margin:0;color:#65736a;font-size:13px}
.mr-price-row{display:grid;grid-template-columns:minmax(150px,1.5fr) minmax(130px,1fr) minmax(110px,.7fr) minmax(110px,.8fr) minmax(140px,1fr) auto;gap:10px;align-items:end;padding:13px 0;border-top:1px solid #edf1ed}
.mr-dish-name{align-self:center}.mr-dish-name strong{display:block}.mr-price-field label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}.mr-price-field input,.mr-price-field select,.mr-map-row select{width:100%;min-height:40px;border:1px solid #cfd9d1;border-radius:8px;padding:7px;background:#fff;color:#203128}
.mr-cost{min-width:0}.mr-cost strong{display:block;margin-top:5px}.mr-import-guide{padding:12px;border-radius:9px;background:#f6f8f6;color:#4c5d52;font-size:13px;line-height:1.5}.mr-import-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:13px}.mr-import-row input{min-width:220px;max-width:100%}.mr-status{margin:10px 0;color:#355443;font-size:13px}
.mr-mapping{border-top:1px solid #e3eae4;margin-top:14px;padding-top:14px}.mr-mapping h3{margin:0 0 10px}.mr-map-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,1.5fr);gap:12px;align-items:center;padding:6px 0}
.mr-table-wrap{overflow-x:auto}.mr-table{width:100%;border-collapse:collapse;min-width:720px}.mr-table th,.mr-table td{text-align:left;padding:10px 9px;border-bottom:1px solid #e6ece7;font-size:13px;white-space:nowrap}.mr-table th{color:#536258;background:#f7faf7}.mr-empty{padding:22px;text-align:center;color:#718078;background:#f8faf8;border-radius:10px}.mr-warning{padding:10px 12px;background:#fff7e6;color:#805b18;border-radius:8px;font-size:13px}
.mr-matrix-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mr-matrix-item{border:1px solid #dce5df;border-left:4px solid #789b83;border-radius:10px;padding:12px;min-width:0}.mr-matrix-item strong,.mr-matrix-item span,.mr-matrix-item small{display:block}.mr-matrix-item span{font-weight:800;margin:4px 0}.mr-matrix-item small{color:#65736a}.mr-matrix-item.star{border-left-color:#198754}.mr-matrix-item.workhorse{border-left-color:#d69e24}.mr-matrix-item.puzzle{border-left-color:#3683bd}.mr-matrix-item.dog{border-left-color:#a65d5d}.mr-footnote{font-size:12px;color:#65736a;margin:12px 0 0}.mr-history{margin-top:16px}.mr-history-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #edf1ed}.mr-history-row small{display:block;color:#65736a}.mr-tag{font-size:12px;color:#28633e}
@media(max-width:900px){.mr-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-price-row{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-dish-name{grid-column:1/-1}.mr-price-row>button{grid-column:1/-1;width:100%;min-height:44px}}
@media(max-width:520px){.mr-summary{gap:8px}.mr-stat{padding:12px}.mr-map-row{grid-template-columns:1fr;gap:5px}.mr-matrix-grid{grid-template-columns:1fr}.mr-filters .field{flex:1 1 130px}.mr-filters button{width:100%}}
`;
document.head.appendChild(style);
