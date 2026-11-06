'use strict';
const CACHE='animo-haccp-shell-v1';
const SUPABASE_SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const SHELL=['./','./index.html',SUPABASE_SDK];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(async cache=>{await cache.addAll(['./','./index.html']);try{await cache.add(SUPABASE_SDK)}catch(error){console.warn('Supabase SDK kon nog niet lokaal worden gecachet',error)}}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin&&url.href!==SUPABASE_SDK)return;
  if(url.href===SUPABASE_SDK){event.respondWith(caches.match(SUPABASE_SDK).then(cached=>cached||fetch(request)));return;}
  if(url.pathname.includes('/rest/v1/')||url.pathname.includes('/auth/v1/')||url.pathname.includes('/functions/v1/')||url.pathname.includes('/storage/v1/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy))}return response}).catch(()=>caches.match('./index.html').then(response=>response||caches.match('./'))));
    return;
  }
  if(/\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response})));
  }
});