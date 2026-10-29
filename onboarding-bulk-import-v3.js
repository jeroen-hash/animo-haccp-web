/* ANIMO HACCP - Bulk Import V3 (zelfstandig, geen toegang tot interne const DEF/add nodig) */
(() => {
  'use strict';

  const CONFIG = {
    cleaning_plan: {
      title: 'Kuisplan plakken',
      labels: [['task','Taak'],['zone','Zone'],['frequency','Frequentie'],['responsible','Verantwoordelijke']],
      gridClass: '',
      example: 'Werkbanken reinigen | Warme keuken | Dagelijks | Medewerker'
    },
    temperature_points: {
      title: 'Temperatuurpunten plakken',
      labels: [['name','Meetpunt'],['type','Type'],['min','Min °C'],['max','Max °C'],['frequency','Frequentie']],
      gridClass: 'five',
      example: 'Koelcel vlees | Koelcel | 0 | 7 | 2x per dag'
    },
    dishes: {
      title: 'Gerechten plakken',
      labels: [['name','Gerecht'],['ingredients','Ingrediënten'],['allergens','Allergenen'],['status','Status']],
      gridClass: '',
      example: 'Vol-au-vent | Kip, bloem, melk, ei | Gluten, melk, ei | Te controleren'
    },
    stock: {
      title: 'Voorraad plakken',
      labels: [['name','Product'],['category','Categorie'],['unit','Eenheid'],['minimum','Minimum'],['supplier','Leverancier']],
      gridClass: 'five',
      example: 'Bloem | Droge voeding | kg | 5 | Leverancier A'
    },
    users: {
      title: 'Gebruikers plakken',
      labels: [['name','Naam'],['email','E-mail'],['role','Rol']],
      gridClass: 'three',
      example: 'Jan Peeters | jan@example.com | manager'
    }
  };

  let activeSection = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectStyles() {
    if (document.getElementById('bulk-v3-style')) return;
    const style = document.createElement('style');
    style.id = 'bulk-v3-style';
    style.textContent = `
      .bulk-v3-overlay{position:fixed;inset:0;z-index:100000;background:rgba(5,35,24,.64);display:grid;place-items:center;padding:14px}
      .bulk-v3-overlay.hidden{display:none!important}.bulk-v3-modal{width:min(780px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.30)}
      .bulk-v3-head{display:flex;justify-content:space-between;gap:12px}.bulk-v3-head h2{margin:0;color:#103e2a}.bulk-v3-close{border:0;background:#feecec;color:#9d2d2d;border-radius:10px;padding:9px 12px;font-weight:800;cursor:pointer}
      .bulk-v3-note{color:#667a71;font-size:13px}.bulk-v3-example{white-space:pre-wrap;background:#eef7f2;border:1px solid #cfe4d8;border-radius:11px;padding:10px;font-size:12px}
      .bulk-v3-area{width:100%;min-height:250px;border:1px solid #b8cbc1;border-radius:12px;padding:12px;font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
      .bulk-v3-error{display:none;margin-top:10px;padding:10px;border-radius:10px;background:#feecec;color:#9d2d2d}.bulk-v3-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
      .prep-head-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      @media(max-width:600px){.bulk-v3-modal{padding:14px}.bulk-v3-actions{display:grid;grid-template-columns:1fr}.bulk-v3-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('bulkV3Overlay')) return;
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'bulkV3Overlay';
    overlay.className = 'bulk-v3-overlay hidden';
    overlay.innerHTML = `
      <section class="bulk-v3-modal" role="dialog" aria-modal="true">
        <div class="bulk-v3-head"><div><h2 id="bulkV3Title">Lijst plakken</h2><p id="bulkV3Columns" class="bulk-v3-note"></p></div><button id="bulkV3Close" class="bulk-v3-close" type="button">Sluiten</button></div>
        <p class="bulk-v3-note">Eén item per regel. Scheid kolommen met een tab, puntkomma of |. Kopiëren uit Excel werkt ook.</p>
        <div id="bulkV3Example" class="bulk-v3-example"></div>
        <label for="bulkV3Text" style="display:block;font-weight:800;margin:12px 0 6px">Plak hier de hele lijst</label>
        <textarea id="bulkV3Text" class="bulk-v3-area"></textarea>
        <div id="bulkV3Error" class="bulk-v3-error"></div>
        <div class="bulk-v3-actions"><button id="bulkV3Clear" class="btn ghost" type="button">Leegmaken</button><button id="bulkV3Import" class="btn green" type="button">Rijen importeren</button></div>
      </section>`;
    document.body.appendChild(overlay);
    document.getElementById('bulkV3Close').onclick = close;
    document.getElementById('bulkV3Clear').onclick = () => document.getElementById('bulkV3Text').value = '';
    document.getElementById('bulkV3Import').onclick = importRows;
    overlay.onclick = event => { if (event.target === overlay) close(); };
  }

  function open(section) {
    ensureModal();
    activeSection = section;
    const config = CONFIG[section];
    document.getElementById('bulkV3Title').textContent = config.title;
    document.getElementById('bulkV3Columns').textContent = 'Kolomvolgorde: ' + config.labels.map(([,label]) => label).join(' • ');
    document.getElementById('bulkV3Example').textContent = 'Voorbeeld:\n' + config.example;
    document.getElementById('bulkV3Text').value = '';
    document.getElementById('bulkV3Error').style.display = 'none';
    document.getElementById('bulkV3Overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('bulkV3Text').focus(), 50);
  }

  function close() {
    document.getElementById('bulkV3Overlay')?.classList.add('hidden');
    activeSection = null;
  }

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (line.includes(';')) return line.split(';');
    return [line];
  }

  function makeRow(section, values) {
    const config = CONFIG[section];
    const row = document.createElement('div');
    row.className = `editrow ${config.gridClass}`.trim();
    row.innerHTML = config.labels.map(([key,label], index) => `
      <div class="field"><label>${esc(label)}</label><input class="control" data-k="${esc(key)}" value="${esc(values[index] || '')}"></div>
    `).join('') + '<button class="btn danger" type="button">×</button>';
    row.querySelector('button').onclick = () => row.remove();
    return row;
  }

  function importRows(event) {
    event.preventDefault();
    const error = document.getElementById('bulkV3Error');
    const button = document.getElementById('bulkV3Import');
    try {
      error.style.display = 'none';
      const text = document.getElementById('bulkV3Text').value.trim();
      if (!text) throw new Error('Plak eerst minstens één regel.');
      const container = document.getElementById(`rows-${activeSection}`);
      if (!container) throw new Error('Open eerst een onboarding en het tabblad Voorbereiden.');
      button.disabled = true;
      button.textContent = 'Importeren...';
      let count = 0;
      for (const line of text.split(/\r?\n/).map(v => v.trim()).filter(Boolean)) {
        const values = splitLine(line).map(v => v.trim());
        const first = (values[0] || '').toLowerCase();
        if (['taak','meetpunt','gerecht','product','naam'].includes(first)) continue;
        if (values.some(Boolean)) { container.appendChild(makeRow(activeSection, values)); count++; }
      }
      if (!count) throw new Error('Geen bruikbare regels gevonden. Gebruik |, puntkomma’s of tabs tussen kolommen.');
      close();
      alert(`${count} rij(en) toegevoegd. Controleer de gegevens en kies Voorbereiding opslaan.`);
    } catch (err) {
      error.textContent = err?.message || String(err);
      error.style.display = 'block';
    } finally {
      button.disabled = false;
      button.textContent = 'Rijen importeren';
    }
  }

  function enhance() {
    ensureModal();
    document.querySelectorAll('[data-add]').forEach(addButton => {
      const section = addButton.dataset.add;
      if (!CONFIG[section]) return;
      const head = addButton.closest('.prep-head');
      if (!head || head.querySelector(`[data-bulk-v3="${section}"]`)) return;
      let actions = head.querySelector('.prep-head-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'prep-head-actions';
        addButton.before(actions);
        actions.appendChild(addButton);
      }
      const bulk = document.createElement('button');
      bulk.type = 'button';
      bulk.className = 'btn secondary';
      bulk.dataset.bulkV3 = section;
      bulk.textContent = 'Lijst plakken';
      bulk.onclick = () => open(section);
      actions.insertBefore(bulk, addButton);
    });
  }

  new MutationObserver(enhance).observe(document.body, {childList:true, subtree:true});
  enhance();
})();
