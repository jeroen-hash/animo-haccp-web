/* ANIMO HACCP - volledige activering naar klantaccount */
(() => {
  'use strict';
  function addButton(){
    const actions=document.querySelector('#detail .actions');
    if(!actions||document.getElementById('activateEnvironmentCompleteBtn'))return;
    document.getElementById('activateEnvironmentBtn')?.remove();
    const button=document.createElement('button');
    button.id='activateEnvironmentCompleteBtn';
    button.type='button';
    button.className='btn amber';
    button.textContent='Omgeving volledig activeren';
    button.onclick=activate;
    actions.appendChild(button);
  }
  async function activate(){
    if(typeof selected==='undefined'||!selected?.id)return alert('Selecteer eerst een onboarding.');
    if(typeof dirty!=='undefined'&&dirty)return alert('Sla eerst de voorbereiding op.');
    if(!confirm('Kuisplan, temperatuurpunten, gerechten, voorraad en voorbereide gebruikers nu naar het klantaccount schrijven? Bestaande klantgegevens blijven behouden.'))return;
    const button=document.getElementById('activateEnvironmentCompleteBtn');
    button.disabled=true;button.textContent='Activeren...';
    try{
      const {data,error}=await sb.rpc('activate_platform_onboarding_complete',{p_intake_id:selected.id});
      if(error)throw error;
      alert(`Klantomgeving bijgewerkt.\n\nKuistaken: ${data.cleaning}\nTemperatuurpunten: ${data.temperature_points}\nGerechten: ${data.dishes}\nVoorraadproducten: ${data.stock}\nGebruikers klaar voor uitnodiging: ${data.pending_users}\n\nLaat de klant de app vernieuwen.`);
      if(typeof load==='function')await load();
    }catch(error){alert('Activeren mislukt: '+(error?.message||error));}
    finally{button.disabled=false;button.textContent='Omgeving volledig activeren';}
  }
  new MutationObserver(addButton).observe(document.documentElement,{childList:true,subtree:true});
  addButton();
})();
