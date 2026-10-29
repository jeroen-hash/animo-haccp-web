/* ANIMO HACCP - zelfstandige bulkimport V3 */
(() => {
  'use strict';

  const CONFIG = {
    cleaning_plan: {
      title: 'Kuisplan plakken',
      container: 'rows-cleaning_plan',
      fields: [['task','Taak'],['zone','Zone'],['frequency','Frequentie'],['responsible','Verantwoordelijke']]
    },
    temperature_points: {
      title: 'Temperatuurpunten plakken',
      container: 'rows-temperature_points',
      fields: [['name','Meetpunt'],['type','Type'],['min','Min °C'],['max','Max °C'],['frequency','Frequentie']]
    },
    dishes: {
      title: 'Gerechten plakken',
      container: 'rows-dishes',
      fields: [['name','Gerecht'],['ingredients','Ingrediënten'],['allergens','Allergenen'],['status','Status']]
    },
    stock: {
      title: 'Voorraad plakken',
      container: 'rows-stock',
      fields: [['name','Product'],['category','Categorie'],['unit','Eenheid'],['minimum','Minimum'],['supplier','Leverancier']]
    },
    users: {
      title: 'Gebruikers plakken',
      container: 'rows-users',
      fields: [['name','Naam'],['email','E-mail'],['role','Rol']]
    }
  };

  const titleMap = Object.fromEntries(Object.entries(CONFIG).map(([key,value]) => [value.title,key]));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (line.includes(';')) return line.split(';');
    return [line];
  }

  function createRow(section, values) {
    const cfg = CONFIG[section];
    const container = document.getElementById(cfg.container);
    if (!container) throw new Error('De invoerlijst is niet beschikbaar. Open het tabblad Voorbereiden opnieuw.');

    const row = document.createElement('div');
    row.className = 'editrow ' + (cfg.fields.length === 3 ? 'three' : cfg.fields.length === 5 ? 'five' : '');
    row.innerHTML = cfg.fields.map(([key,label], index) => `
      <div class="field">
        <label>${escapeHtml(label)}</label>
        <input class="control" data-k="${escapeHtml(key)}" value="${escapeHtml(values[index] || '')}">
      </div>`).join('') + '<button class="btn danger" type="button" aria-label="Rij verwijderen">×</button>';

    row.querySelector('button').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function showError(message) {
    const box = document.getElementById('bulkError');
    if (box) {
      box.textContent = message;
      box.style.display = 'block';
    } else {
      alert(message);
    }
  }

  function importRows(button) {
    const text = document.getElementById('bulkText')?.value.trim() || '';
    const title = document.getElementById('bulkImportTitle')?.textContent.trim() || '';
    const section = titleMap[title];

    if (!text) return showError('Plak eerst minstens één regel.');
    if (!section) return showError('Het onderdeel kon niet worden herkend. Sluit het venster en kies opnieuw Lijst plakken.');

    const errorBox = document.getElementById('bulkError');
    if (errorBox) errorBox.style.display = 'none';

    button.disabled = true;
    button.textContent = 'Importeren...';

    try {
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      let count = 0;
      for (const line of lines) {
        const values = splitLine(line).map(value => value.trim());
        const first = (values[0] || '').toLowerCase();
        if (['taak','meetpunt','gerecht','product','naam'].includes(first)) continue;
        if (!values.some(Boolean)) continue;
        createRow(section, values);
        count++;
      }
      if (!count) throw new Error('Geen bruikbare regels gevonden. Gebruik één item per regel en scheid kolommen met |, puntkomma’s of tabs.');

      document.getElementById('bulkImportOverlay')?.classList.add('hidden');
      setTimeout(() => alert(`${count} rij(en) toegevoegd. Controleer de gegevens en kies daarna Voorbereiding opslaan.`), 25);
    } catch (error) {
      showError(error?.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = 'Rijen importeren';
    }
  }

  // Capture-fase: deze handler wint van de oudere defecte handlers.
  document.addEventListener('click', event => {
    const button = event.target.closest('#bulkImport');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    importRows(button);
  }, true);
})();
