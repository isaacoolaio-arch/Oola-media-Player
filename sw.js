/* Oola Play service worker
   Caches the app shell so the player opens with no connection.
   Your media is stored in IndexedDB (not here), so it is always available
   offline without any network cache.
   The on-device video editor (ffmpeg.wasm, ~30MB) is cached separately the
   first time you use Edit — it's NOT downloaded automatically on install, so
   installing/updating the app stays light on data. After that first use it
   works fully offline. */
const CACHE='oola-play-v20';
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

  if(url.pathname.includes('/ffmpeg/')){
    // cache-first, store-on-first-use — keeps the ~30MB engine off the initial install
    e.respondWith(caches.open(FFMPEG_CACHE).then(async cache=>{
      const hit=await cache.match(e.request);
      if(hit) return hit;
      const res=await fetch(e.request);
      if(res && res.ok) cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit=>hit||fetch(e.request)));
});
