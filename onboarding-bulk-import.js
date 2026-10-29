/* ANIMO HACCP - bulk plakken voor de onboarding-inrichtingsmodule */
(() => {
  'use strict';

  const SECTION_INFO = {
    cleaning_plan: {
      title: 'Kuisplan plakken',
      columns: ['Taak', 'Zone', 'Frequentie', 'Verantwoordelijke'],
      example: 'Werkbanken reinigen\tWarme keuken\tDagelijks\tMedewerker\nDampkap ontvetten\tWarme keuken\tOm de 14 dagen\tManager'
    },
    temperature_points: {
      title: 'Temperatuurpunten plakken',
      columns: ['Meetpunt', 'Type', 'Min °C', 'Max °C', 'Frequentie'],
      example: 'Koelcel vlees\tKoeling\t0\t7\t2x per dag\nDiepvries 1\tDiepvries\t-24\t-18\tDagelijks'
    },
    dishes: {
      title: 'Gerechten plakken',
      columns: ['Gerecht', 'Ingrediënten', 'Allergenen', 'Status'],
      example: 'Vol-au-vent\tKip, bloem, boter, melk, ei\tGluten, melk, ei\tTe controleren\nKaaskroketten\tKaas, melk, bloem, ei\tMelk, gluten, ei\tTe controleren'
    },
    stock: {
      title: 'Voorraad plakken',
      columns: ['Product', 'Categorie', 'Eenheid', 'Minimum', 'Leverancier'],
      example: 'Bloem\tDroge voeding\tkg\t5\tLeverancier A\nMelk\tZuivel\tliter\t10\tLeverancier B'
    },
    users: {
      title: 'Gebruikers plakken',
      columns: ['Naam', 'E-mail', 'Rol'],
      example: 'Jan Peeters\tjan@example.com\tmanager\nEls Janssens\tels@example.com\temployee'
    }
  };

  let currentSection = null;

  function ensureStyles() {
    if (document.getElementById('bulk-import-styles')) return;
    const style = document.createElement('style');
    style.id = 'bulk-import-styles';
    style.textContent = `
      .bulk-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,35,24,.62);display:grid;place-items:center;padding:14px}
      .bulk-modal{width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.3)}
      .bulk-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      .bulk-head h2{margin:0;color:#103e2a}.bulk-close{border:0;background:#feecec;color:#9d2d2d;border-radius:10px;padding:8px 11px;font-weight:800;cursor:pointer}
      .bulk-example{white-space:pre-wrap;background:#eef7f2;border:1px solid #cfe4d8;border-radius:11px;padding:10px;font-size:12px;overflow:auto}
      .bulk-area{width:100%;min-height:230px;border:1px solid #b8cbc1;border-radius:12px;padding:12px;font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
      .bulk-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}
      .bulk-note{color:#667a71;font-size:13px}.bulk-error{display:none;margin-top:10px;padding:10px;border-radius:10px;background:#feecec;color:#9d2d2d}
      @media(max-width:600px){.bulk-modal{padding:14px}.bulk-actions{display:grid;grid-template-columns:1fr}.bulk-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('bulkImportOverlay')) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = 'bulkImportOverlay';
    overlay.className = 'bulk-overlay hidden';
    overlay.innerHTML = `
      <section class="bulk-modal" role="dialog" aria-modal="true" aria-labelledby="bulkImportTitle">
        <div class="bulk-head">
          <div><h2 id="bulkImportTitle">Lijst plakken</h2><p id="bulkColumns" class="bulk-note"></p></div>
          <button id="bulkClose" class="bulk-close" type="button">Sluiten</button>
        </div>
        <p class="bulk-note">Kopieer bij voorkeur rechtstreeks uit Excel. Eén regel wordt één item. Kolommen mogen gescheiden zijn door tabs, puntkomma’s of een verticale streep.</p>
        <div id="bulkExample" class="bulk-example"></div>
        <label for="bulkText" style="display:block;font-weight:800;margin:12px 0 6px">Plak hier de volledige lijst</label>
        <textarea id="bulkText" class="bulk-area" placeholder="Plak hier meerdere regels tegelijk..."></textarea>
        <div id="bulkError" class="bulk-error"></div>
        <div class="bulk-actions">
          <button id="bulkClear" class="btn ghost" type="button">Leegmaken</button>
          <button id="bulkImport" class="btn green" type="button">Rijen importeren</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    document.getElementById('bulkClose').onclick = closeModal;
    document.getElementById('bulkClear').onclick = () => document.getElementById('bulkText').value = '';
    document.getElementById('bulkImport').onclick = importRows;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }

  function openModal(section) {
    ensureModal();
    currentSection = section;
    const info = SECTION_INFO[section];
    document.getElementById('bulkImportTitle').textContent = info.title;
    document.getElementById('bulkColumns').textContent = 'Kolomvolgorde: ' + info.columns.join(' • ');
    document.getElementById('bulkExample').textContent = 'Voorbeeld:\n' + info.example;
    document.getElementById('bulkText').value = '';
    document.getElementById('bulkError').style.display = 'none';
    document.getElementById('bulkImportOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('bulkText').focus(), 50);
  }

  function closeModal() {
    document.getElementById('bulkImportOverlay')?.classList.add('hidden');
    currentSection = null;
  }

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (line.includes(';')) return line.split(';');
    return [line];
  }

  function importRows() {
    const error = document.getElementById('bulkError');
    const text = document.getElementById('bulkText').value.trim();
    if (!text) {
      error.textContent = 'Plak eerst minstens één regel.';
      error.style.display = 'block';
      return;
    }
    if (!currentSection || typeof add !== 'function' || typeof DEF === 'undefined') {
      error.textContent = 'De inrichtingsmodule is nog niet klaar. Open eerst een onboarding en het tabblad Voorbereiden.';
      error.style.display = 'block';
      return;
    }
    const fields = DEF[currentSection].map(([key]) => key);
    const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let imported = 0;
    for (const line of lines) {
      const values = splitLine(line).map(x => x.trim());
      // Negeer een herkenbare kopregel.
      const first = values[0]?.toLowerCase() || '';
      if (['taak','meetpunt','gerecht','product','naam'].includes(first)) continue;
      const row = {};
      fields.forEach((key, index) => row[key] = values[index] || '');
      if (Object.values(row).some(Boolean)) {
        add(currentSection, row);
        imported++;
      }
    }
    if (!imported) {
      error.textContent = 'Geen bruikbare regels gevonden. Gebruik één item per regel en scheid kolommen met tabs, puntkomma’s of |.';
      error.style.display = 'block';
      return;
    }
    if (typeof dirty !== 'undefined') dirty = true;
    closeModal();
    alert(`${imported} rij(en) toegevoegd. Controleer de gegevens en kies daarna Voorbereiding opslaan.`);
  }

  function addButtons() {
    ensureModal();
    document.querySelectorAll('[data-add]').forEach(button => {
      const section = button.dataset.add;
      if (!SECTION_INFO[section]) return;
      const head = button.closest('.prep-head');
      if (!head || head.querySelector(`[data-bulk="${section}"]`)) return;
      const bulk = document.createElement('button');
      bulk.type = 'button';
      bulk.className = 'btn secondary';
      bulk.dataset.bulk = section;
      bulk.textContent = 'Lijst plakken';
      bulk.onclick = () => openModal(section);
      button.before(bulk);
    });
  }

  const observer = new MutationObserver(addButtons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addButtons();
})();
