/* ANIMO HACCP - gebruikers uit onboarding uitnodigen */
(() => {
  'use strict';

  function activeIntakeId() {
    return document.querySelector('.item.active[data-id]')?.dataset.id || '';
  }

  async function invitePreparedUsers(button) {
    const intakeId = activeIntakeId();
    if (!intakeId) return alert('Selecteer eerst een onboarding.');
    if (!confirm('Alle voorbereide gebruikers uitnodigen en aan deze zaak koppelen?')) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Uitnodigingen versturen...';
    try {
      const { data, error } = await sb.functions.invoke('onboarding-invite-users', {
        body: { intake_id: intakeId }
      });
      if (error) {
        let message = error.message || 'Uitnodigen mislukt.';
        try {
          const context = await error.context?.json();
          if (context?.error) message = context.error;
        } catch (_) {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      const invited = Number(data?.invited || 0);
      const linked = Number(data?.linked || 0);
      const failed = Array.isArray(data?.failed) ? data.failed : [];
      alert(`${invited} uitnodiging(en) verstuurd en ${linked} gebruiker(s) gekoppeld.${failed.length ? `\n\nNiet gelukt:\n${failed.map(x => `${x.email}: ${x.error}`).join('\n')}` : ''}`);
    } catch (error) {
      alert(error.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function installButton() {
    const actions = document.querySelector('#detail .detail-head .actions');
    if (!actions || document.getElementById('inviteOnboardingUsersBtn')) return;
    const button = document.createElement('button');
    button.id = 'inviteOnboardingUsersBtn';
    button.type = 'button';
    button.className = 'btn secondary';
    button.textContent = 'Gebruikers uitnodigen';
    button.addEventListener('click', () => invitePreparedUsers(button));
    actions.appendChild(button);
  }

  new MutationObserver(installButton).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  installButton();
})();
