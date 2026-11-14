import { buildDishSalesSummary, dishEconomics } from "./menurendabiliteit-core.mjs";

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const number = (value, digits = 1) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: digits }).format(Number(value || 0));
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
let initialized = false;
let cache = null;

function supabase() { return window.FAVVGetSupabaseClient?.() || null; }
function business() { return window.FAVVCloudBusiness || null; }
function role() { return window.FAVVCloudRole || business()?.role || window.FAVVGetCurrentUser?.()?.role || ""; }
function allowed() { return ["owner", "manager"].includes(role()); }

function ensureUi() {
  const nav = document.querySelector(".nav");
  const mobile = document.querySelector(".mobile-nav");
  const main = document.querySelector(".main");
  if (!nav || !main) return false;

  if (!$("businessInsightsNav")) {
    const button = document.createElement("button");
    button.id = "businessInsightsNav";
    button.className = "nav-btn manager-only";
    button.dataset.page = "business-insights";
    button.innerHTML = '<span aria-hidden="true">◉</span> Bedrijfsinzichten';
    const reports = nav.querySelector('[data-page="reports"]');
    nav.insertBefore(button, reports?.nextSibling || null);
  }
  if (mobile && !$("businessInsightsMobileNav")) {
    const button = document.createElement("button");
    button.id = "businessInsightsMobileNav";
    button.className = "manager-only";
    button.dataset.page = "business-insights";
    button.innerHTML = "<b>◉</b>Inzichten";
    const reports = mobile.querySelector('[data-page="reports"]');
    mobile.insertBefore(button, reports?.nextSibling || null);
  }
  if (!$("business-insights")) {
    const section = document.createElement("section");
    section.id = "business-insights";
    section.className = "page";
    section.innerHTML = `
      <div class="page-head"><div><h1>Bedrijfsinzichten</h1><p>Ontdek waar je zaak voedsel en geld verliest en hoe je prestaties evolueren</p></div><button class="btn secondary" id="biRefresh" type="button">Vernieuwen</button></div>
      <div class="bi-notice" id="biNotice">De rapporten gebruiken geregistreerde gegevens. Onbekende kostprijzen worden nooit als € 0 voorgesteld.</div>
      <div class="bi-filters card"><label for="biPeriod">Periode</label><select id="biPeriod"><option value="30">Afgelopen 30 dagen</option><option value="90" selected>Afgelopen 90 dagen</option><option value="365">Afgelopen 12 maanden</option><option value="all">Alle beschikbare gegevens</option></select></div>
      <div class="bi-stats" id="biStats"><div class="bi-stat">Gegevens laden…</div></div>
      <div class="bi-grid">
        <section class="card"><h2>Waar gaat het meeste verloren?</h2><div id="biProducts"></div></section>
        <section class="card"><h2>Waarom wordt er verspild?</h2><div id="biReasons"></div></section>
        <section class="card"><h2>Verspilling per medewerker</h2><div id="biEmployees"></div></section>
        <section class="card bi-wide"><h2>Verspilling doorheen de tijd</h2><div id="biTrend"></div></section>
        <section class="card bi-wide"><h2>Menurendabiliteit</h2><p class="bi-muted">Gebaseerd op geïmporteerde kassaregels en de bestaande receptkostmomentopnames. Dit is brutowinst op ingrediëntenbasis, geen nettowinst.</p><div id="biMenu"></div></section>
      </div>
      <p class="bi-footnote" id="biFootnote"></p>`;
    main.appendChild(section);
  }
  return true;
}

function localDateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
}
function isWithinPeriod(value) {
  const period = $("biPeriod")?.value || "90";
  const key = String(value || "").slice(0,10);
  if (!key) return false;
  if (period === "all") return true;
  const days = Number(period);
  const from = new Date();
  from.setHours(0,0,0,0);
  from.setDate(from.getDate() - days + 1);
  return key >= localDateKey(from) && key <= localDateKey(new Date());
}
function periodRows(rows) {
  return rows.filter(row => isWithinPeriod(row.client_created_at || row.created_at));
}
function aggregate(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row[key] || "Niet opgegeven");
    const item = map.get(label) || { label, count: 0, cost: 0, knownCost: 0, quantity: 0 };
    item.count++;
    item.quantity += Number(row.quantity || 0);
    if (row.cost_status === "calculated" && Number.isFinite(Number(row.cost_value_snapshot))) {
      item.cost += Number(row.cost_value_snapshot);
      item.knownCost++;
    }
    map.set(label, item);
  }
  return [...map.values()].sort((a,b) => b.cost-a.cost || b.count-a.count);
}
function renderBars(node, rows, emptyText) {
  if (!rows.length) { node.innerHTML = '<div class="bi-empty">' + emptyText + '</div>'; return; }
  const max = Math.max(1, ...rows.map(row => row.cost));
  node.innerHTML = '<div class="bi-bars">' + rows.slice(0,8).map(row => `
    <div class="bi-bar-row"><div class="bi-bar-label"><strong>${esc(row.label)}</strong><span>${row.knownCost ? money(row.cost) : "Kost onbekend"} · ${row.count} registraties</span></div>
    <div class="bi-bar-track"><div class="bi-bar-fill" style="width:${row.knownCost ? Math.max(2, row.cost/max*100) : 0}%"></div></div></div>`).join("") + "</div>";
}
function renderTrend(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const date = new Date(row.client_created_at || row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
    const bucket = buckets.get(key) || { label: key, count: 0, cost: 0, known: 0 };
    bucket.count++;
    if (row.cost_status === "calculated" && Number.isFinite(Number(row.cost_value_snapshot))) { bucket.cost += Number(row.cost_value_snapshot); bucket.known++; }
    buckets.set(key,bucket);
  }
  const list = [...buckets.values()].sort((a,b)=>a.label.localeCompare(b.label)).slice(-12);
  if (!list.length) { $("biTrend").innerHTML='<div class="bi-empty">Nog geen verspilling geregistreerd in deze periode.</div>'; return; }
  const max = Math.max(1,...list.map(x=>x.cost));
  $("biTrend").innerHTML='<div class="bi-trend">'+list.map(x=>`<div class="bi-month"><div class="bi-month-value">${x.known?money(x.cost):"—"}</div><div class="bi-month-track"><div style="height:${x.known?Math.max(2,x.cost/max*100):0}%"></div></div><strong>${esc(x.label)}</strong><small>${x.count} registraties</small></div>`).join("")+'</div>';
}
function renderMenu(data) {
  const node = $("biMenu");
  if (!data) { node.innerHTML='<div class="bi-empty">Menurendabiliteit kon niet worden geladen.</div>'; return; }
  const allRows = Array.isArray(data.settings?.salesRows) ? data.settings.salesRows : [];
  const rows = allRows.filter(row => isWithinPeriod(row.date));
  const imports = Array.isArray(data.settings?.salesImports) ? data.settings.salesImports : [];
  if (!rows.length) { node.innerHTML='<div class="bi-empty">Nog geen kassaverkoop geïmporteerd. Importeer een kassabestand in Menurendabiliteit om verkoop en brutowinst hier te zien.</div>'; return; }
  const recipes = data.recipes || [];
  const economics = {};
  for (const recipe of recipes) {
    const price = data.settings?.pricesByRecipe?.[recipe.id] || {};
    economics[recipe.id] = dishEconomics({ recipe, ingredientCost: recipe.ingredientCost, sellingPriceInclusive: price.sellingPriceInclusive, vatRate: price.vatRate });
  }
  const summary = buildDishSalesSummary(rows, data.settings?.mappings || {}, economics);
  const mapped = summary.dishes;
  const totalPortions = mapped.reduce((sum,row)=>sum+row.portions,0);
  const profitRows = mapped.filter(row=>row.grossProfit!=null);
  const totalProfit = profitRows.length===mapped.length && mapped.length ? profitRows.reduce((sum,row)=>sum+row.grossProfit,0) : null;
  const revenueRows = mapped.filter(row=>row.revenueExclusive!=null);
  const totalRevenue = revenueRows.length===mapped.length && mapped.length ? revenueRows.reduce((sum,row)=>sum+row.revenueExclusive,0) : null;
  node.innerHTML = `<div class="bi-menu-stats">
    <div><small>Verkochte porties</small><strong>${number(totalPortions,0)}</strong></div>
    <div><small>Omzet excl. btw</small><strong>${totalRevenue==null?"Onvolledig":money(totalRevenue)}</strong></div>
    <div><small>Brutowinst ingrediënten</small><strong>${totalProfit==null?"Onvolledig":money(totalProfit)}</strong></div>
    <div><small>Niet gekoppelde regels</small><strong>${number(summary.unmapped.length,0)}</strong></div>
  </div><p class="bi-muted">${rows.length} kassaregels · ${imports.length} imports. Alleen volledig gekoppelde en berekenbare regels leveren betrouwbare totalen op.</p>`;
}
async function loadData() {
  const biz = business();
  const client = supabase();
  if (!biz?.id || !client) throw new Error("Meld aan bij je horecazaak om bedrijfsinzichten te bekijken.");
  const { data, error } = await client.from("food_waste_entries")
    .select("id,client_created_at,created_at,employee_name,product_name,quantity,input_unit,reason,cost_value_snapshot,cost_status,voided_at")
    .eq("business_id", biz.id)
    .order("client_created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  let menu = null;
  try { menu = await window.FAVVGetMenuProfitabilityData?.(); } catch (error) { console.warn("Menurendabiliteit niet beschikbaar voor bedrijfsinzichten", error); }
  return { waste: (data || []).filter(row => !row.voided_at), menu };
}
async function render() {
  if (!ensureUi()) return;
  $("businessInsightsNav").style.display = allowed() ? "" : "none";
  if ($("businessInsightsMobileNav")) $("businessInsightsMobileNav").style.display = allowed() ? "" : "none";
  if (!allowed()) { $("biStats").innerHTML='<div class="bi-empty">Alleen eigenaar en manager hebben toegang tot bedrijfsinzichten.</div>'; return; }
  $("biStats").innerHTML='<div class="bi-stat">Gegevens laden…</div>';
  try {
    cache = await loadData();
    const rows = periodRows(cache.waste);
    const known = rows.filter(row => row.cost_status === "calculated" && Number.isFinite(Number(row.cost_value_snapshot)));
    const totalCost = known.reduce((sum,row)=>sum+Number(row.cost_value_snapshot||0),0);
    const avg = known.length ? totalCost/known.length : null;
    const count = rows.length;
    const products = aggregate(rows,"product_name");
    const reasons = aggregate(rows,"reason");
    const employees = aggregate(rows,"employee_name");
    const quantities = { kg:0, g:0, l:0, ml:0, cl:0, stuk:0 };
    for (const row of rows) {
      const unit = String(row.input_unit || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(quantities,unit)) quantities[unit] += Number(row.quantity || 0);
    }
    const volume = [];
    const kg = quantities.kg + quantities.g/1000;
    const litres = quantities.l + quantities.cl/100 + quantities.ml/1000;
    if (kg) volume.push(number(kg,2)+" kg");
    if (litres) volume.push(number(litres,2)+" l");
    if (quantities.stuk) volume.push(number(quantities.stuk,0)+" stuks");
    $("biStats").innerHTML = [
      ["Registraties",number(count,0)],
      ["Gekende verspilde waarde",known.length?money(totalCost):"Geen kostprijzen"],
      ["Hoeveelheid",volume.join(" · ") || "Niet beschikbaar"],
      ["Gemiddelde kost / registratie",avg==null?"Onbekend":money(avg)],
      ["Kostprijs ontbreekt",number(count-known.length,0)]
    ].map(([label,value])=>`<div class="bi-stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
    renderBars($("biProducts"),products,"Nog geen registraties in deze periode.");
    renderBars($("biReasons"),reasons,"Nog geen registraties in deze periode.");
    renderBars($("biEmployees"),employees,"Nog geen registraties in deze periode.");
    renderTrend(rows);
    renderMenu(cache.menu);
    $("biFootnote").textContent = cache.waste.length >= 1000
      ? "Let op: maximaal 1.000 recente registraties geladen. Kies een kortere periode voor een nauwkeuriger overzicht."
      : "Ongeldig verklaarde registraties zijn uitgesloten. Bedragen zijn historische kostprijsmomentopnames en geen berekening van nettowinst.";
    $("biNotice").textContent = "Rapportperiode: " + $("biPeriod").selectedOptions[0].text + ". De rapporten gebruiken uitsluitend gegevens van deze horecazaak.";
  } catch (error) {
    $("biStats").innerHTML='<div class="bi-empty">'+esc(error?.message || "De rapportgegevens konden niet worden geladen.")+'</div>';
  }
}
function init() {
  if (initialized || !ensureUi()) return;
  initialized = true;
  $("biPeriod").addEventListener("change", () => { if (cache) renderCached(); else render(); });
  $("biRefresh").addEventListener("click", render);
  document.addEventListener("click", event => {
    if (event.target.closest('[data-page="business-insights"]')) render();
  });
  window.addEventListener("online", () => {
    if ($("business-insights")?.classList.contains("active")) render();
  });
  window.FAVVRenderBusinessInsights = render;
  window.FAVVSetBusinessInsightsAccess = roleValue => {
    const canSee = ["owner","manager"].includes(roleValue);
    $("businessInsightsNav").style.display = canSee ? "" : "none";
    if ($("businessInsightsMobileNav")) $("businessInsightsMobileNav").style.display = canSee ? "" : "none";
    if (canSee) render();
  };
  const currentRole = role();
  window.FAVVSetBusinessInsightsAccess(currentRole);
}
function renderCached() {
  if (!cache) return render();
  const rows = periodRows(cache.waste);
  const known = rows.filter(row => row.cost_status === "calculated" && Number.isFinite(Number(row.cost_value_snapshot)));
  const totalCost = known.reduce((sum,row)=>sum+Number(row.cost_value_snapshot||0),0);
  const avg = known.length ? totalCost/known.length : null;
  $("biStats").innerHTML = [
    ["Registraties",number(rows.length,0)],
    ["Gekende verspilde waarde",known.length?money(totalCost):"Geen kostprijzen"],
    ["Gemiddelde kost / registratie",avg==null?"Onbekend":money(avg)],
    ["Kostprijs ontbreekt",number(rows.length-known.length,0)]
  ].map(([label,value])=>`<div class="bi-stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
  const employees = aggregate(rows,"employee_name");
  const quantities = { kg:0, g:0, l:0, ml:0, cl:0, stuk:0 };
  for (const row of rows) {
    const unit = String(row.input_unit || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(quantities,unit)) quantities[unit] += Number(row.quantity || 0);
  }
  const volume = [];
  const kg = quantities.kg + quantities.g/1000;
  const litres = quantities.l + quantities.cl/100 + quantities.ml/1000;
  if (kg) volume.push(number(kg,2)+" kg");
  if (litres) volume.push(number(litres,2)+" l");
  if (quantities.stuk) volume.push(number(quantities.stuk,0)+" stuks");
  $("biStats").innerHTML = [
    ["Registraties",number(rows.length,0)],
    ["Gekende verspilde waarde",known.length?money(totalCost):"Geen kostprijzen"],
    ["Hoeveelheid",volume.join(" · ") || "Niet beschikbaar"],
    ["Gemiddelde kost / registratie",avg==null?"Onbekend":money(avg)],
    ["Kostprijs ontbreekt",number(rows.length-known.length,0)]
  ].map(([label,value])=>`<div class="bi-stat"><small>${label}</small><strong>${value}</strong></div>`).join("");
  renderBars($("biProducts"),aggregate(rows,"product_name"),"Nog geen registraties in deze periode.");
  renderBars($("biReasons"),aggregate(rows,"reason"),"Nog geen registraties in deze periode.");
  renderBars($("biEmployees"),employees,"Nog geen registraties in deze periode.");
  renderTrend(rows);
  renderMenu(cache.menu);
}
document.addEventListener("DOMContentLoaded",init,{once:true});
if (document.readyState==="interactive" || document.readyState==="complete") init();

const style = document.createElement("style");
style.textContent = `
#business-insights .bi-notice{padding:12px 15px;background:#edf7f1;border-left:4px solid #147a46;border-radius:9px;margin-bottom:15px;color:#355443;font-size:13px}
#business-insights .bi-filters{display:flex;align-items:center;gap:12px;margin-bottom:15px}
#business-insights .bi-filters label{font-weight:800}#business-insights .bi-filters select{padding:10px;border:1px solid #c8d5cc;border-radius:9px;background:#fff;min-width:210px}
#business-insights .bi-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}
#business-insights .bi-stat{background:#fff;border:1px solid #dce5df;border-radius:13px;padding:15px;min-width:0}
#business-insights .bi-stat small{display:block;color:#65736a;font-size:12px}#business-insights .bi-stat strong{display:block;color:#174d34;font-size:clamp(19px,2.4vw,27px);margin-top:7px;overflow-wrap:anywhere}
#business-insights .bi-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}#business-insights .bi-grid>.card{min-width:0;margin:0}#business-insights .bi-grid h2{font-size:18px;margin:0 0 13px}#business-insights .bi-wide{grid-column:1/-1}
#business-insights .bi-muted,#business-insights .bi-footnote{font-size:12px;color:#65736a;line-height:1.5}
#business-insights .bi-empty{padding:20px;text-align:center;border:1px dashed #cbd8cf;border-radius:10px;color:#65736a;font-size:13px}
#business-insights .bi-bar-row{margin:13px 0}.bi-bar-label{display:flex;justify-content:space-between;gap:10px;font-size:13px}.bi-bar-label span{color:#65736a;text-align:right}.bi-bar-track{height:9px;background:#edf2ee;border-radius:20px;overflow:hidden;margin-top:7px}.bi-bar-fill{height:100%;background:#299b5c;border-radius:20px}
#business-insights .bi-trend{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:end;min-height:180px}
#business-insights .bi-month{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;font-size:11px;color:#65736a}#business-insights .bi-month-value{font-size:11px;color:#174d34;font-weight:800;text-align:center}#business-insights .bi-month-track{height:100px;width:100%;display:flex;align-items:end;background:#f0f4f1;border-radius:8px;overflow:hidden}#business-insights .bi-month-track>div{width:100%;background:#299b5c;border-radius:8px 8px 0 0}#business-insights .bi-month strong{color:#34463b}#business-insights .bi-month small{text-align:center}
#business-insights .bi-menu-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}#business-insights .bi-menu-stats>div{padding:12px;background:#f7faf8;border:1px solid #e0e8e2;border-radius:10px;min-width:0}#business-insights .bi-menu-stats small{display:block;color:#65736a;font-size:11px}#business-insights .bi-menu-stats strong{display:block;margin-top:5px;color:#174d34;font-size:18px;overflow-wrap:anywhere}
@media(max-width:800px){#business-insights .bi-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#business-insights .bi-grid{grid-template-columns:1fr}#business-insights .bi-wide{grid-column:auto}#business-insights .bi-menu-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#business-insights .bi-bar-label{display:block}#business-insights .bi-bar-label span{display:block;text-align:left;margin-top:3px}#business-insights .bi-trend{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

/* Responsive correcties: voorkom dat teksten en kaarten buiten beeld vallen */
style.textContent += `
#business-insights,
#business-insights * { box-sizing:border-box; }
#business-insights { width:100%; max-width:100%; min-width:0; overflow-x:clip; }
#business-insights .page-head { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px; min-width:0; }
#business-insights .page-head>div { flex:1 1 240px; min-width:0; }
#business-insights .page-head h1,
#business-insights .page-head p,
#business-insights h2,
#business-insights .bi-notice,
#business-insights .bi-muted,
#business-insights .bi-footnote { overflow-wrap:anywhere; word-break:normal; }
#business-insights .page-head button { flex:0 0 auto; max-width:100%; white-space:normal; }
#business-insights .bi-filters { display:flex; flex-wrap:wrap; align-items:center; min-width:0; }
#business-insights .bi-filters select { flex:1 1 220px; width:100%; max-width:100%; min-width:0; }
#business-insights .bi-stats,
#business-insights .bi-grid,
#business-insights .bi-menu-stats { width:100%; min-width:0; }
#business-insights .bi-stat,
#business-insights .bi-grid>.card,
#business-insights .bi-menu-stats>div { min-width:0; max-width:100%; }
#business-insights .bi-stat small { line-height:1.4; overflow-wrap:anywhere; }
#business-insights .bi-stat strong { line-height:1.2; overflow-wrap:anywhere; word-break:break-word; }
#business-insights .bi-bar-label { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:4px 10px; min-width:0; }
#business-insights .bi-bar-label strong,
#business-insights .bi-bar-label span { min-width:0; max-width:100%; overflow-wrap:anywhere; text-align:left; }
#business-insights .bi-bar-track { width:100%; }
#business-insights .bi-trend { min-width:0; }
#business-insights .bi-month { overflow-wrap:anywhere; }
#business-insights .bi-month-value { max-width:100%; overflow-wrap:anywhere; }
@media(max-width:600px) {
  #business-insights .bi-stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  #business-insights .bi-stat { padding:11px; }
  #business-insights .bi-stat strong { font-size:clamp(16px,5vw,22px); }
  #business-insights .bi-grid { grid-template-columns:minmax(0,1fr); gap:12px; }
  #business-insights .bi-wide { grid-column:auto; }
  #business-insights .bi-grid>.card { padding:14px; }
  #business-insights .bi-grid h2 { font-size:17px; line-height:1.3; }
  #business-insights .bi-filters { align-items:stretch; flex-direction:column; gap:7px; }
  #business-insights .bi-filters select { min-width:0; }
  #business-insights .bi-bar-label { display:block; }
  #business-insights .bi-bar-label span { display:block; margin-top:3px; }
  #business-insights .bi-menu-stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  #business-insights .bi-menu-stats>div { padding:10px; }
  #business-insights .bi-menu-stats strong { font-size:16px; }
  #business-insights .bi-trend { grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
}
@media(max-width:360px) {
  #business-insights .bi-stats,
  #business-insights .bi-menu-stats { grid-template-columns:minmax(0,1fr); }
  #business-insights .bi-trend { grid-template-columns:repeat(2,minmax(0,1fr)); }
  #business-insights .page-head button { width:100%; }
}`;
document.head.appendChild(style);

/* Navigatiebeveiliging: toon exact één hoofdmodule tegelijk. */
style.textContent += `\n.page:not(.active){display:none!important;visibility:hidden!important;pointer-events:none!important}\n.page.active{display:block!important;visibility:visible!important;pointer-events:auto!important}\n`;


/* Zorg dat Bedrijfsinzichten nooit visueel onder een andere hoofdmodule terechtkomt. */
style.textContent += `
.layout > .main { position:relative; isolation:isolate; }
.layout > .main > .page { position:relative; }
.layout > .main > .page:not(.active) {
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
  z-index:-1!important;
}
.layout > .main > #business-insights.active {
  display:block!important;
  visibility:visible!important;
  position:relative!important;
  z-index:2!important;
  isolation:isolate;
}
.layout > .main > #menu-profitability:not(.active) {
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
`;
