/* ANIMO HACCP - volledige activering naar klantaccount */
(() => {
  'use strict';

  function addButton() {
    const actions = document.querySelector('#detail .actions');

    if (
      !actions ||
      document.getElementById('activateEnvironmentCompleteBtn')
    ) {
      return;
    }

    document
      .getElementById('activateEnvironmentBtn')
      ?.remove();

    const button = document.createElement('button');

    button.id = 'activateEnvironmentCompleteBtn';
    button.type = 'button';
    button.className = 'btn amber';
    button.textContent =
      'Omgeving volledig activeren';

    button.onclick = activate;

    actions.appendChild(button);
  }

  async function activate() {

    if (
      typeof selected === 'undefined' ||
      !selected?.id
    ) {
      return alert(
        'Selecteer eerst een onboarding.'
      );
    }

    if (
      typeof dirty !== 'undefined' &&
      dirty
    ) {
      return alert(
        'Sla eerst de voorbereiding op.'
      );
    }

    if (
      !confirm(
        'Kuisplan, temperatuurpunten, gerechten, voorraad en voorbereide gebruikers nu naar het klantaccount schrijven? Bestaande klantgegevens blijven behouden.'
      )
    ) {
      return;
    }

    const button =
      document.getElementById(
        'activateEnvironmentCompleteBtn'
      );

    button.disabled = true;
    button.textContent = 'Activeren...';

    try {

      let data;
      let error;

      if (selected.source === 'lead') {

        const result =
          await sb.functions.invoke(
            'activate-onboarding-lead',
            {
              body: {
                lead_id: selected.id
              }
            }
          );

        data = result.data;
        error = result.error;

        if (
          !error &&
          data &&
          data.error
        ) {
          error = new Error(data.error);
        }

      } else {

        const result =
          await sb.rpc(
            'activate_platform_onboarding_complete',
            {
              p_intake_id: selected.id
            }
          );

        data = result.data;
        error = result.error;
      }

      if (error) {
        throw error;
      }

      const result =
        data.activation ||
        data ||
        {};

      alert(
`Klantomgeving bijgewerkt.

✅ Kuistaken: ${result.cleaning ?? 0}
✅ Temperatuurpunten: ${result.temperature_points ?? result.temperature_points_pending ?? 0}
✅ Gerechten: ${result.dishes ?? 0}
✅ Voorraadproducten: ${result.stock ?? 0}
✅ Gebruikers klaar voor uitnodiging: ${result.pending_users ?? result.users_pending ?? 0}

Laat de klant de app vernieuwen.`
      );

      if (
        typeof load === 'function'
      ) {
        await load();
      }

    } catch (error) {

      alert(
        'Activeren mislukt: ' +
        (
          error?.message ||
          error
        )
      );

    } finally {

      button.disabled = false;

      button.textContent =
        'Omgeving volledig activeren';
    }
  }

  new MutationObserver(addButton)
    .observe(
      document.documentElement,
      {
        childList: true,
        subtree: true
      }
    );

  addButton();

})();
