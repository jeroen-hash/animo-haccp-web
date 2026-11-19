const ROOT_ID='inspectionRecordsApp';
const CATEGORIES=[
{id:'preparation',name:'Bereidingscontroles',hint:'Kerntemperatuur, afkoelen, ontdooien, heropwarmen en warmhouden'},
{id:'maintenance',name:'Onderhoud en kalibratie',hint:'Onderhoud, defecten, thermometercontrole en kalibratie'},
{id:'staff',name:'Persoonlijke hygiëne en opleiding',hint:'Hygiëne-instructies, opleiding en werkafspraken'},
{id:'water-waste',name:'Water en afvalbeheer',hint:'Watercontroles, afvalverwijdering en afvalopslag'},
{id:'complaints-recall',name:'Klachten en terugroepingen',hint:'Klachten, productblokkering, terugroepacties en meldingen'},
{id:'traceability',name:'Traceerbaarheid en lotnummers',hint:'Leverancier, factuur, lotnummer en inkomende of uitgaande producten'},
{id:'product-management',name:'Productbeheer en etikettering',hint:'Houdbaarheid, geopende verpakkingen, bewaartermijnen en etiketten'}
];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>window.FAVVGetLocalState?.()||{};
const records=()=>Array.isArray(state().inspectionRecords)?state().inspectionRecords:[];
const categoryName=id=>CATEGORIES.find(x=>x.id===id)?.name||id||'Overig';
const statusName=s=>({ok:'In orde / uitgevoerd',open:'Opvolging nodig',closed:'Opvolging afgerond',na:'Niet van toepassing',blocked:'Product geblokkeerd'})[s]||'Niet beoordeeld';
function render(){
 const root=$(ROOT_ID);if(!root)return;const list=records();
 root.innerHTML='<div class="grid"><div class="card c12"><h3>Nieuwe inspectieregistratie</h3><p class="muted">Eén registratie per controle, vaststelling, opleiding, productlot of opvolgactie. Vul in wat relevant is.</p><form id="inspectionRecordForm"><div class="form-grid">'+
 '<div class="field"><label for="irCategory">Onderdeel</label><select id="irCategory" required>'+CATEGORIES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label for="irDate">Datum en tijd</label><input id="irDate" type="datetime-local" required value="'+new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)+'"></div>'+
 '<div class="field"><label for="irSubject">Product, toestel, medewerker of onderwerp</label><input id="irSubject" maxlength="160" required placeholder="Bijvoorbeeld kipfilet, koelcel of opleiding"></div>'+
 '<div class="field"><label for="irStatus">Beoordeling</label><select id="irStatus"><option value="ok">In orde / uitgevoerd</option><option value="open">Opvolging nodig</option><option value="closed">Opvolging afgerond</option><option value="na">Niet van toepassing</option><option value="blocked">Product geblokkeerd</option></select></div>'+
 '<div class="field"><label for="irSupplier">Leverancier / verantwoordelijke</label><input id="irSupplier" maxlength="160"></div>'+
 '<div class="field"><label for="irLot">Lotnummer / referentie</label><input id="irLot" maxlength="120" placeholder="Lotnummer, factuurnummer of toestel-ID"></div>'+
 '<div class="field"><label for="irQuantity">Hoeveelheid</label><input id="irQuantity" maxlength="60" placeholder="Bijvoorbeeld 8 kg of 12 stuks"></div>'+
 '<div class="field"><label for="irTemperature">Temperatuur (°C)</label><input id="irTemperature" inputmode="decimal" maxlength="20" placeholder="Bijvoorbeeld 3,2"></div>'+
 '<div class="field"><label for="irExpiry">Vervaldatum / TGT / THT</label><input id="irExpiry" type="date"></div>'+
 '<div class="field"><label for="irOpened">Datum geopend / bereid</label><input id="irOpened" type="date"></div>'+
 '<div class="field"><label for="irNextDue">Volgende controle / opvolgdatum</label><input id="irNextDue" type="date"></div>'+
 '<div class="field"><label for="irEvidence">Bewijsstuk / documentreferentie</label><input id="irEvidence" maxlength="200" placeholder="Bijvoorbeeld factuur of opleidingsattest"></div></div>'+
 '<div class="field"><label for="irAction">Uitgevoerde actie / resultaat</label><textarea id="irAction" rows="2" maxlength="1200"></textarea></div>'+
 '<div class="field"><label for="irNotes">Opmerking / reden niet van toepassing</label><textarea id="irNotes" rows="2" maxlength="1200"></textarea></div>'+
 '<div class="modal-actions"><button class="btn" type="submit">Registratie bewaren</button></div></form></div>'+
 '<div class="card c12"><h3>Overzicht inspectieregistraties</h3><p class="muted">'+list.length+' registratie(s) bewaard in deze testzaak.</p><div class="field"><label for="irFilter">Filter op onderdeel</label><select id="irFilter"><option value="">Alle onderdelen</option>'+CATEGORIES.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'</select></div><div id="inspectionRecordList" class="items"></div></div></div>';
 $('inspectionRecordForm').addEventListener('submit',save);$('irFilter').addEventListener('change',renderList);renderList();
}
function save(e){
 e.preventDefault();const category=$('irCategory').value,subject=$('irSubject').value.trim(),status=$('irStatus').value,temp=$('irTemperature').value.trim();
 if(!subject){alert('Vul een onderwerp in.');return}if(temp&&!Number.isFinite(Number(temp.replace(',','.')))){alert('Vul een geldige temperatuur in.');return}if(status==='na'&&!$('irNotes').value.trim()){alert('Noteer waarom dit onderdeel niet van toepassing is.');return}
 const record={category,categoryName:categoryName(category),date:new Date($('irDate').value).toISOString(),subject,status,supplier:$('irSupplier').value.trim(),lotNumber:$('irLot').value.trim(),quantity:$('irQuantity').value.trim(),temperature:temp?Number(temp.replace(',','.')):null,expiryDate:$('irExpiry').value,openedDate:$('irOpened').value,nextDueDate:$('irNextDue').value,evidence:$('irEvidence').value.trim(),action:$('irAction').value.trim(),notes:$('irNotes').value.trim()};
 try{window.FAVVAddInspectionRecord(record);render();alert('Inspectieregistratie bewaard.')}catch(err){alert(err?.message||'De registratie kon niet worden bewaard.')}
}
function renderList(){
 const box=$('inspectionRecordList');if(!box)return;const filter=$('irFilter')?.value||'',list=records().filter(r=>!filter||r.category===filter);
 if(!list.length){box.innerHTML='<div class="empty-state">Nog geen registraties voor dit onderdeel.</div>';return}
 box.innerHTML=list.map(r=>'<div class="item" style="align-items:flex-start"><div style="min-width:0;flex:1"><div class="item-title">'+esc(r.subject)+'</div><div class="item-sub">'+esc(categoryName(r.category))+' · '+esc(new Date(r.date||r.createdAt).toLocaleString('nl-BE'))+' · '+esc(statusName(r.status))+'</div><div class="item-sub">'+[r.supplier&&'Verantwoordelijke/leverancier: '+r.supplier,r.lotNumber&&'Lot/referentie: '+r.lotNumber,r.temperature!==null&&r.temperature!==undefined&&'Temperatuur: '+r.temperature+' °C',r.expiryDate&&'Vervaldatum: '+r.expiryDate,r.evidence&&'Bewijs: '+r.evidence].filter(Boolean).map(esc).join(' · ')+'</div>'+(r.action?'<p class="muted">'+esc(r.action)+'</p>':'')+(r.notes?'<p class="muted">'+esc(r.notes)+'</p>':'')+'</div>'+((!window.FAVVCloudRole||window.FAVVCloudRole!=='employee')?'<button class="btn secondary small" type="button" data-ir-delete="'+esc(r.id)+'">Verwijderen</button>':'')+'</div>').join('');
 box.querySelectorAll('[data-ir-delete]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('Deze inspectieregistratie verwijderen?'))return;try{window.FAVVDeleteInspectionRecord(b.dataset.irDelete);render()}catch(err){alert(err.message)}}));
}
window.FAVVInspectionReportHtml=function(months){
 const end=new Date(),start=months==='all'?null:new Date(end.getFullYear(),end.getMonth()-Number(months),end.getDate(),0,0,0,0),all=records().filter(r=>!start||new Date(r.date||r.createdAt)>=start).sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));
 return CATEGORIES.map(c=>{const rows=all.filter(r=>r.category===c.id);let html='<section class="section"><h2 class="section-title">'+esc(c.name)+'</h2><p class="section-note">'+esc(c.hint)+'</p>';
 if(!rows.length)html+='<p>Geen registraties beschikbaar binnen deze periode.</p>';else{html+='<table><thead><tr><th>Datum</th><th>Onderwerp</th><th>Verantwoordelijke / leverancier</th><th>Lot / referentie</th><th>Details</th><th>Status</th></tr></thead><tbody>';
 rows.forEach(r=>{const details=[r.quantity&&'Hoeveelheid: '+r.quantity,r.temperature!==null&&r.temperature!==undefined&&'Temperatuur: '+r.temperature+' °C',r.expiryDate&&'Vervaldatum: '+r.expiryDate,r.openedDate&&'Geopend/bereid: '+r.openedDate,r.nextDueDate&&'Volgende controle: '+r.nextDueDate,r.evidence&&'Bewijs: '+r.evidence,r.action&&'Actie: '+r.action,r.notes&&'Opmerking: '+r.notes].filter(Boolean).join(' · ');html+='<tr><td>'+esc(new Date(r.date||r.createdAt).toLocaleString('nl-BE'))+'</td><td><strong>'+esc(r.subject)+'</strong></td><td>'+esc(r.supplier||'Niet ingevuld')+'</td><td>'+esc(r.lotNumber||'Niet ingevuld')+'</td><td>'+esc(details||'Geen details')+'</td><td>'+esc(statusName(r.status))+'</td></tr>'});html+='</tbody></table>'}return html+'</section>'}).join('');
};
document.addEventListener('click',e=>{if(e.target.closest('[data-page="inspection-records"],[data-goto="inspection-records"]'))setTimeout(render,0)});
document.addEventListener('DOMContentLoaded',render);if(document.readyState!=='loading')render();