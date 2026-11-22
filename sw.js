/* Service Worker FootLivz — cache shell statique */
var CACHE = "fl-v8";
var SHELL = [
    "/Foot-Livz/",
    "/Foot-Livz/index.html",
    "/Foot-Livz/css/styles.css",
    "/Foot-Livz/js/theme.js",
    "/Foot-Livz/js/data/leagues.js",
    "/Foot-Livz/js/data/store.js",
    "/Foot-Livz/js/data/espn.js",
    "/Foot-Livz/js/data/lfp.js",
    "/Foot-Livz/js/ui.js",
    "/Foot-Livz/js/data/teams.js",
    "/Foot-Livz/js/data/news.js",
    "/Foot-Livz/js/layout.js",
    "/Foot-Livz/js/screens/home.js"
];

self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
    self.skipWaiting();
});

self.addEventListener("activate", function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
        })
    );
    self.clients.claim();
});

/* Stratégie : network-first, fallback cache */
self.addEventListener("fetch", function (e) {
    if (e.request.method !== "GET") return;
    var url = e.request.url;
    /* Ne pas intercepter les appels API externes */
    if (url.indexOf("espn.com") !== -1 || url.indexOf("workers.dev") !== -1 || url.indexOf("bing.com") !== -1 ||
        url.indexOf("rss2json") !== -1 || url.indexOf("allorigins") !== -1 || url.indexOf("corsproxy") !== -1 || url.indexOf("codetabs") !== -1) return;
    e.respondWith(
        fetch(e.request).then(function (r) {
            var clone = r.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
            return r;
        }).catch(function () {
            return caches.match(e.request);
        })
    );
});
