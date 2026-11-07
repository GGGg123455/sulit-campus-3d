// Offline revisit support. Large gzip resources have a separate bounded
// application cache; this worker caches the small page shell and modules.
const CACHE='sulit-shell-v16';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sulit-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();try{const cache=await caches.open(CACHE);await cache.add(self.registration.scope);}catch{}})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope)||url.pathname.endsWith('.gz'))return;
 if(req.mode==='navigate'){event.respondWith((async()=>{const cache=await caches.open(CACHE),control=new AbortController(),timer=setTimeout(()=>control.abort(),5500);try{const r=await fetch(req,{signal:control.signal});if(r.ok)await cache.put(req,r.clone());return r;}catch{return await cache.match(req)||await cache.match(self.registration.scope)||Response.error();}finally{clearTimeout(timer);}})());return;}
 if(!/\.(js|mjs|css|png|jpg|svg)$/.test(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(req);if(saved)return saved;const r=await fetch(req);if(r.ok)await cache.put(req,r.clone());return r;})());
});
