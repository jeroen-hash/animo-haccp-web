/* ==========================================
   ANIMO HACCP
   Automatische temperatuurtemplates
   VEILIGE UITBREIDING
========================================== */

(function () {

  const TEMPLATES = {

    restaurant: [
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

    frituur: [
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

    broodjeszaak: [
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

    cafe: [
      {
        name: "Koeling dranken",
        type: "Koeling",
        min: "0",
        max: "7",
        frequency: "Dagelijks"
      }
    ]
  };

  function applyTemplate(type) {

    if (
      typeof selected === "undefined" ||
      !selected
    ) {
      alert("Selecteer eerst een onboarding.");
      return;
    }

    const current =
      selected?.payload?.prepared_setup?.temperature_points || [];

    if (
      current.length > 0 &&
      !confirm(
        "Bestaande temperatuurpunten vervangen?"
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
        TEMPLATES[type] || []
      );

    if (typeof dirty !== "undefined") {
      dirty = true;
    }

    alert(
      `${selected.payload.prepared_setup.temperature_points.length} temperatuurpunten toegevoegd.`
    );

    if (typeof renderPrepare === "function") {
      renderPrepare();
    }
  }

  window.applyTemperatureTemplate =
    applyTemplate;

  function injectButtons() {

    const preparePanel =
      document.getElementById("p-prepare");

    if (!preparePanel) {
      return;
    }

    if (
      document.getElementById(
        "temperature-template-buttons"
      )
    ) {
      return;
    }

    const wrapper =
      document.createElement("div");

    wrapper.id =
      "temperature-template-buttons";

    wrapper.style.display = "flex";
    wrapper.style.flexWrap = "wrap";
    wrapper.style.gap = "8px";
    wrapper.style.marginBottom = "15px";

    wrapper.innerHTML = `
      <button class="btn secondary" type="button" onclick="applyTemperatureTemplate('restaurant')">
        🍽️ Restaurant
      </button>

      <button class="btn secondary" type="button" onclick="applyTemperatureTemplate('frituur')">
        🍟 Frituur
      </button>

      <button class="btn secondary" type="button" onclick="applyTemperatureTemplate('broodjeszaak')">
        🥪 Broodjeszaak
      </button>

      <button class="btn secondary" type="button" onclick="applyTemperatureTemplate('cafe')">
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
    injectButtons
  ).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  injectButtons();

})();
