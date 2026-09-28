// 인터넷이 없어도 앱 화면이 열리게 하는 서비스 워커.
// 화면 파일(index.html)은 인터넷 먼저 → 안 되면 저장본, 그림·스크립트(이름에 해시가 붙음)는 저장본 먼저.
// 데이터는 원래 기기 안(IndexedDB)에 있으므로 여기서 다루지 않는다. 다른 주소(클라우드)는 건드리지 않는다.
const CACHE = "church-finance-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 같은 주소의 http(s) 만. blob:(파일 내려받기)·다른 주소(클라우드)는 건드리지 않음 — blob 을 가로채면 파일 이름이 'download' 로 바뀜
  if (req.method !== "GET" || !/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isPage) {
      try { const res = await fetch(req); cache.put(req, res.clone()); return res; }
      catch { return (await cache.match(req)) ?? (await cache.match("./")) ?? Response.error(); }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
