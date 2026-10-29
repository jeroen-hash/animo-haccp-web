/* ANIMO HACCP - fix voor knop Rijen importeren */
(() => {
  'use strict';

  const titleToSection = {
    'Kuisplan plakken': 'cleaning_plan',
    'Temperatuurpunten plakken': 'temperature_points',
    'Gerechten plakken': 'dishes',
    'Voorraad plakken': 'stock',
    'Gebruikers plakken': 'users'
  };

  function splitLine(line) {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) return line.split('|');
    if (line.includes(';')) return line.split(';');
    return [line];
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#bulkImport');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const errorBox = document.getElementById('bulkError');
    const text = document.getElementById('bulkText')?.value.trim() || '';
    const title = document.getElementById('bulkImportTitle')?.textContent.trim() || '';
    const section = titleToSection[title];

    try {
      if (errorBox) errorBox.style.display = 'none';
      if (!text) throw new Error('Plak eerst minstens één regel.');
      if (!section) throw new Error('Het gekozen onderdeel kon niet worden herkend.');

      const definitions = (0, eval)('DEF');
      const addRow = (0, eval)('add');
      if (!definitions?.[section] || typeof addRow !== 'function') {
        throw new Error('Open eerst een onboarding en daarna het tabblad Voorbereiden.');
      }

      button.disabled = true;
      button.textContent = 'Importeren...';

      const fields = definitions[section].map(([key]) => key);
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      let imported = 0;

      for (const line of lines) {
        const values = splitLine(line).map(value => value.trim());
        const first = (values[0] || '').toLowerCase();
        if (['taak', 'meetpunt', 'gerecht', 'product', 'naam'].includes(first)) continue;

        const row = {};
        fields.forEach((key, index) => row[key] = values[index] || '');
        if (Object.values(row).some(Boolean)) {
          addRow(section, row);
          imported++;
        }
      }

      if (!imported) throw new Error('Geen bruikbare regels gevonden. Scheid kolommen met |, puntkomma’s of tabs.');

      document.getElementById('bulkImportOverlay')?.classList.add('hidden');
      alert(`${imported} rij(en) toegevoegd. Controleer de rijen en kies daarna Voorbereiding opslaan.`);
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = error?.message || String(error);
        errorBox.style.display = 'block';
      } else {
        alert(error?.message || String(error));
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Rijen importeren';
    }
  }, true);
})();
