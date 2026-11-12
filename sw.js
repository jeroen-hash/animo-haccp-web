'use strict';
const CACHE='animo-haccp-shell-v6';
const SHELL=['./','./index.html'];
const SUPABASE_SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(SHELL);
    try{await cache.add(SUPABASE_SDK)}catch(error){console.warn('Supabase SDK kon niet vooraf worden gecachet',error)}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('animo-haccp-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  // Cache alleen de expliciete Supabase browser-SDK; nooit API- of gebruikersgegevens.
  if(url.origin==='https://cdn.jsdelivr.net'&&url.pathname==='/npm/@supabase/supabase-js@2'){
    event.respondWith(caches.match(SUPABASE_SDK).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(SUPABASE_SDK,copy))}
      return response;
    })));
    return;
  }
  if(url.origin!==self.location.origin)return;
  if(url.pathname.includes('/rest/v1/')||url.pathname.includes('/auth/v1/')||url.pathname.includes('/functions/v1/')||url.pathname.includes('/storage/v1/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy))}
      return response;
    }).catch(()=>caches.match('./index.html').then(response=>response||caches.match('./'))));
    return;
  }
  if(/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
      return response;
    })));
  }
});