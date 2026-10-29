/* ANIMO HACCP - zelfstandige bulkinvoer voor onboarding */
(() => {
  'use strict';

  const SECTIONS = {
    cleaning_plan: {
      title: 'Kuisplan plakken',
      columns: ['Taak', 'Zone', 'Frequentie', 'Verantwoordelijke'],
      example: 'Werkbanken reinigen | Warme keuken | Dagelijks | Medewerker\nDampkap ontvetten | Warme keuken | Om de 14 dagen | Manager'
    },
    temperature_points: {
      title: 'Temperatuurpunten plakken',
      columns: ['Meetpunt', 'Type', 'Min °C', 'Max °C', 'Frequentie'],
      example: 'Koelcel vlees | Koelcel | 0 | 7 | 2x per dag\nDiepvries voorraad | Diepvries | -24 | -18 | Dagelijks'
    },
    dishes: {
      title: 'Gerechten plakken',
      columns: ['Gerecht', 'Ingrediënten', 'Allergenen', 'Status'],
      example: 'Vol-au-vent | Kip, bloem, boter, melk, ei | Gluten, melk, ei | Te controleren'
    },
    stock: {
      title: 'Voorraad plakken',
      columns: ['Product', 'Categorie', 'Eenheid', 'Minimum', 'Leverancier'],
      example: 'Bloem | Droge voeding | kg | 5 | Leverancier A\nMelk | Zuivel | liter | 10 | Leverancier B'
    },
    users: {
      title: 'Gebruikers plakken',
      columns: ['Naam', 'E-mail', 'Rol'],
      example: 'Jan Peeters | jan@example.com | manager\nEls Janssens | els@example.com | employee'
    }
  };

  let currentSection = '';

  function addStyles() {
    if (document.getElementById('animoBulkStyles')) return;
    const style = document.createElement('style');
    style.id = 'animoBulkStyles';
    style.textContent = `
      .bulk-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5,35,24,.65);display:grid;place-items:center;padding:14px}
      .bulk-overlay.hidden{display:none!important}
      .bulk-modal{width:min(760px,100%);max-height:calc(100dvh - 28px);overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.3)}
      .bulk-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.bulk-head h2{margin:0;color:#173228}
      .bulk-close{border:0;background:#feecec;color:#a42d2d;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer}
      .bulk-note{color:#667a71;font-size:13px}.bulk-example{white-space:pre-wrap;background:#eef7f2;border:1px solid #cfe4d8;border-radius:11px;padding:10px;font-size:12px}
      .bulk-area{width:100%;min-height:235px;border:1px solid #b8cbc1;border-radius:12px;padding:12px;font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical}
      .bulk-error{display:none;margin-top:10px;padding:10px;border-radius:10px;background:#feecec;color:#9d2d2d;font-weight:700}
      .bulk-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}
      .bulk-button{background:#dff2e9!important;color:#075f3f!important}
      @media(max-width:600px){.bulk-modal{padding:14px}.bulk-actions{display:grid;grid-template-columns:1fr}.bulk-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function createModal() {
    if (document.getElementById('bulkImportOverlay')) return;
    addStyles();
    const overlay = document.createElement('div');
    overlay.id = 'bulkImportOverlay';
    overlay.className = 'bulk-overlay hidden';
    overlay.innerHTML = `
      <section class="bulk-modal" role="dialog" aria-modal="true">
        <div class="bulk-head">
          <div><h2 id="bulkImportTitle">Lijst plakken</h2><p id="bulkColumns" class="bulk-note"></p></div>
          <button id="bulkClose" class="bulk-close" type="button">Sluiten</button>
        </div>
        <p class="bulk-note">Eén item per regel. Scheid kolommen met een tab, puntkomma of |. Kopiëren uit Excel werkt ook.</p>
        <div id="bulkExample" class="bulk-example"></div>
        <label for="bulkText" style="display:block;font-weight:800;margin:12px 0 6px">Plak hier de volledige lijst</label>
        <textarea id="bulkText" class="bulk-area"></textarea>
        <div id="bulkError" class="bulk-error"></div>
        <div class="bulk-actions">
          <button id="bulkClear" class="btn ghost" type="button">Leegmaken</button>
          <button id="bulkImport" class="btn green" type="button">Rijen importeren</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    document.getElementById('bulkClose').addEventListener('click', closeModal);
    document.getElementById('bulkClear').addEventListener('click', () => {
      document.getElementById('bulkText').value = '';
      document.getElementById('bulkText').focus();
    });
    document.getElementById('bulkImport').addEventListener('click', importRows);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  }

  function openModal(section) {
    createModal();
    currentSection = section;
    const info = SECTIONS[section];
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
  }

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (line.includes(';')) return line.split(';');
    return [line];
  }

  function showError(message) {
    const box = document.getElementById('bulkError');
    box.textContent = message;
    box.style.display = 'block';
  }

  function importRows(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = document.getElementById('bulkImport');
    const text = document.getElementById('bulkText').value.trim();
    const container = document.getElementById(`rows-${currentSection}`);
    const addButton = document.querySelector(`[data-add="${currentSection}"]`);

    try {
      document.getElementById('bulkError').style.display = 'none';
      if (!text) throw new Error('Plak eerst minstens één regel.');
      if (!currentSection || !container || !addButton) {
        throw new Error('Open eerst een onboarding en het tabblad Voorbereiden. Kies daarna opnieuw Lijst plakken.');
      }

      button.disabled = true;
      button.textContent = 'Importeren...';

      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      let imported = 0;

      for (const line of lines) {
        const values = splitLine(line).map(value => value.trim());
        const first = (values[0] || '').toLowerCase();
        if (['taak','meetpunt','gerecht','product','naam'].includes(first)) continue;

        const before = container.children.length;
        addButton.click();
        const row = container.lastElementChild;
        if (!row || container.children.length <= before) continue;

        const inputs = [...row.querySelectorAll('[data-k]')];
        inputs.forEach((input, index) => {
          input.value = values[index] || '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        imported++;
      }

      if (!imported) throw new Error('Geen regels konden worden toegevoegd. Controleer de kolomscheiding.');

      closeModal();
      alert(`${imported} rij(en) toegevoegd. Controleer de gegevens en kies Voorbereiding opslaan.`);
    } catch (error) {
      showError(error?.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = 'Rijen importeren';
    }
  }

  function installButtons() {
    createModal();
    document.querySelectorAll('[data-add]').forEach(addButton => {
      const section = addButton.dataset.add;
      if (!SECTIONS[section]) return;
      const parent = addButton.parentElement;
      if (!parent || parent.querySelector(`[data-bulk-section="${section}"]`)) return;

      const bulk = document.createElement('button');
      bulk.type = 'button';
      bulk.className = 'btn secondary bulk-button';
      bulk.dataset.bulkSection = section;
      bulk.textContent = 'Lijst plakken';
      bulk.addEventListener('click', () => openModal(section));
      parent.insertBefore(bulk, addButton);
    });
  }

  new MutationObserver(installButtons).observe(document.documentElement, { childList: true, subtree: true });
  installButtons();
})();
