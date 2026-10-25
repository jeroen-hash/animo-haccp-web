/* ANIMO onboarding activering. Voeg dit bestand toe na de eigen dashboardscript. */
(()=>{'use strict';
  function button(){
    const actions=document.querySelector('#detail .actions');
    if(!actions||document.getElementById('activateEnvironmentBtn'))return;
    const b=document.createElement('button');
    b.id='activateEnvironmentBtn'; b.type='button'; b.className='btn amber'; b.textContent='Omgeving activeren';
    b.addEventListener('click',activate); actions.appendChild(b);
  }
  async function activate(){
    if(typeof selected==='undefined'||!selected?.id)return alert('Selecteer eerst een onboarding.');
    if(typeof dirty!=='undefined'&&dirty)return alert('Sla eerst de voorbereiding op.');
    if(!confirm('De voorbereide kuistaken, gerechten en stockproducten nu naar het klantaccount schrijven? Bestaande klantgegevens blijven behouden.'))return;
    const b=document.getElementById('activateEnvironmentBtn'); b.disabled=true; b.textContent='Activeren...';
    try{
      const {data,error}=await sb.rpc('activate_platform_onboarding',{p_intake_id:selected.id});
      if(error)throw error;
      alert(`Omgeving geactiveerd.\nKuistaken: ${data.cleaning}\nGerechten: ${data.dishes}\nStockproducten: ${data.stock}\n\nTemperatuurpunten en gebruikers staan klaar voor een vervolgstap, omdat de huidige klantapp hiervoor geen veilige directe importstructuur heeft.`);
      if(typeof load==='function')await load();
    }catch(e){alert('Activeren mislukt: '+(e.message||e));}
    finally{b.disabled=false;b.textContent='Omgeving activeren';}
  }
  const observer=new MutationObserver(button); observer.observe(document.documentElement,{childList:true,subtree:true}); button();
})();
