/* Oola Play service worker
   Caches the app shell so the player opens with no connection.
   Your media is stored in IndexedDB (not here), so it is always available
   offline without any network cache.
   The on-device video editor (ffmpeg.wasm, ~30MB) is cached separately the
   first time you use Edit — it's NOT downloaded automatically on install, so
   installing/updating the app stays light on data. After that first use it
   works fully offline.
   HARDENED: every request falls back to cache when the network fails, so a
   connection blip (even during a hard-refresh) never shows "site can't be
   reached" once the app has loaded once. */
const CACHE='oola-play-v37';
const FFMPEG_CACHE='oola-play-ffmpeg-v2';
const SHELL=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(
    ks.filter(k=>k!==CACHE && k!==FFMPEG_CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);

  // ffmpeg engine: cache-first, store-on-first-use
  if(url.pathname.includes('/ffmpeg/')){
    e.respondWith(caches.open(FFMPEG_CACHE).then(async cache=>{
      const hit=await cache.match(e.request);
      if(hit) return hit;
      try{
        const res=await fetch(e.request);
        if(res && res.ok) cache.put(e.request, res.clone());
        return res;
      }catch(err){
        // no cache + offline: return a clear error response instead of throwing
        return new Response('Offline — ffmpeg engine not cached yet.',{status:503});
      }
    }));
    return;
  }

  // Navigations (opening/refreshing the page): network-first so you get updates
  // when online, but ALWAYS fall back to the cached shell when the network fails.
  if(e.request.mode==='navigate' || (e.request.destination==='document')){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(e.request);
        if(fresh && fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      }catch(err){
        // network failed — serve the cached app shell so it opens offline
        return (await cache.match(e.request, {ignoreSearch:true}))
            || (await cache.match('./index.html'))
            || (await cache.match('./'))
            || new Response('You appear to be offline and the app hasn\'t been saved yet. Reconnect once to install it.',{status:503,headers:{'Content-Type':'text/html'}});
      }
    })());
    return;
  }

  // Everything else (css/js are inline, but icons/manifest etc):
  // cache-first, then network, then whatever cache we have — never throw.
  e.respondWith((async()=>{
    const cached=await caches.match(e.request, {ignoreSearch:true});
    if(cached) return cached;
    try{
      const res=await fetch(e.request);
      if(res && res.ok){ const c=await caches.open(CACHE); c.put(e.request, res.clone()); }
      return res;
    }catch(err){
      // last resort: try the shell, else a benign empty response
      return (await caches.match('./index.html')) || new Response('',{status:503});
    }
  })());
});
