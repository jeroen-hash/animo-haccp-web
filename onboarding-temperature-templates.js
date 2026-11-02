/* ==========================================
   ANIMO HACCP
   DEFAULT ONBOARDING TEMPLATES
========================================== */

(function () {

  const DEFAULT_TEMPLATES = {

    restaurant: {

      temperature_points: [
        {
          name: "Koeling 1",
          type: "Koeling",
          min: "0",
          max: "4",
          frequency: "Dagelijks"
        },
        {
          name: "Koeling 2",
          type: "Koeling",
          min: "0",
          max: "4",
          frequency: "Dagelijks"
        },
        {
          name: "Diepvries 1",
          type: "Diepvries",
          min: "-25",
          max: "-18",
          frequency: "Dagelijks"
        }
      ],

      cleaning_plan: [
        {
          task: "Werkbladen reinigen",
          zone: "Keuken",
          frequency: "Dagelijks"
        },
        {
          task: "Koelkasten reinigen",
          zone: "Keuken",
          frequency: "Dagelijks"
        },
        {
          task: "Vloeren reinigen",
          zone: "Keuken",
          frequency: "Dagelijks"
        },
        {
          task: "Afvalbakken reinigen",
          zone: "Keuken",
          frequency: "Dagelijks"
        },
        {
          task: "Dieptereiniging keuken",
          zone: "Keuken",
          frequency: "Wekelijks"
        }
      ]
    },

    frituur: {

      temperature_points: [
        {
          name: "Koeling",
          type: "Koeling",
          min: "0",
          max: "4",
          frequency: "Dagelijks"
        },
        {
          name: "Diepvries",
          type: "Diepvries",
          min: "-25",
          max: "-18",
          frequency: "Dagelijks"
        },
        {
          name: "Warme houdkast",
          type: "Warmhouden",
          min: "60",
          max: "90",
          frequency: "Dagelijks"
        }
      ],

      cleaning_plan: [
        {
          task: "Frituur reinigen",
          zone: "Baklijn",
          frequency: "Dagelijks"
        },
        {
          task: "Werkbladen reinigen",
          zone: "Baklijn",
          frequency: "Dagelijks"
        },
        {
          task: "Oliecontrole",
          zone: "Baklijn",
          frequency: "Dagelijks"
        }
      ]
    },

    broodjeszaak: {

      temperature_points: [
        {
          name: "Koeling beleg",
          type: "Koeling",
          min: "0",
          max: "4",
          frequency: "Dagelijks"
        },
        {
          name: "Koeling dranken",
          type: "Koeling",
          min: "0",
          max: "7",
          frequency: "Dagelijks"
        }
      ],

      cleaning_plan: [
        {
          task: "Toog reinigen",
          zone: "Verkoop",
          frequency: "Dagelijks"
        },
        {
          task: "Koeling reinigen",
          zone: "Verkoop",
          frequency: "Dagelijks"
        }
      ]
    },

    cafe: {

      temperature_points: [
        {
          name: "Koeling dranken",
          type: "Koeling",
          min: "0",
          max: "7",
          frequency: "Dagelijks"
        }
      ],

      cleaning_plan: [
        {
          task: "Toog reinigen",
          zone: "Bar",
          frequency: "Dagelijks"
        },
        {
          task: "Glazen spoelen",
          zone: "Bar",
          frequency: "Dagelijks"
        }
      ]
    }

  };

  function applyTemplate(type) {

    if (
      typeof selected === "undefined" ||
      !selected
    ) {
      alert("Selecteer eerst een onboarding.");
      return;
    }

    const tpl = DEFAULT_TEMPLATES[type];

    if (!tpl) {
      return;
    }

    if (
      !confirm(
        "Standaard temperatuurpunten en kuisplan toevoegen?"
      )
    ) {
      return;
    }

    if (!selected.payload) {
      selected.payload = {};
    }

    if (!selected.payload.prepared_setup) {
      selected.payload.prepared_setup = {};
    }

    selected.payload.prepared_setup.temperature_points =
      structuredClone(
        tpl.temperature_points
      );

    selected.payload.prepared_setup.cleaning_plan =
      structuredClone(
        tpl.cleaning_plan
      );

    if (typeof dirty !== "undefined") {
      dirty = true;
    }

    if (typeof renderPrepare === "function") {
      renderPrepare();
    }

    alert(
      `Template geladen:
${tpl.temperature_points.length} temperatuurpunten
${tpl.cleaning_plan.length} kuistaken`
    );
  }

  window.applyDefaultTemplate =
    applyTemplate;

  function insertButtons() {

    const preparePanel =
      document.getElementById("p-prepare");

    if (!preparePanel) {
      return;
    }

    if (
      document.getElementById(
        "default-template-buttons"
      )
    ) {
      return;
    }

    const wrapper =
      document.createElement("div");

    wrapper.id =
      "default-template-buttons";

    wrapper.style.display = "flex";
    wrapper.style.flexWrap = "wrap";
    wrapper.style.gap = "10px";
    wrapper.style.marginBottom = "15px";

    wrapper.innerHTML = `
      <button class="btn secondary"
        type="button"
        onclick="applyDefaultTemplate('restaurant')">
        🍽️ Restaurant
      </button>

      <button class="btn secondary"
        type="button"
        onclick="applyDefaultTemplate('frituur')">
        🍟 Frituur
      </button>

      <button class="btn secondary"
        type="button"
        onclick="applyDefaultTemplate('broodjeszaak')">
        🥪 Broodjeszaak
      </button>

      <button class="btn secondary"
        type="button"
        onclick="applyDefaultTemplate('cafe')">
        ☕ Café
      </button>
    `;

    const toolbar =
      preparePanel.querySelector(
        ".prep-toolbar"
      );

    if (toolbar) {
      toolbar.after(wrapper);
    } else {
      preparePanel.prepend(wrapper);
    }
  }

  new MutationObserver(
    insertButtons
  ).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  insertButtons();

})();
