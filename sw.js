/* Service Worker FootLivz — cache shell statique */
var CACHE = "fl-v17";
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

/* Notifications Web Push (envoyées par le serveur footlivz) */
self.addEventListener("push", function (e) {
    var d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Foot Livz", body: e.data ? e.data.text() : "" }; }
    e.waitUntil(self.registration.showNotification(d.title || "Foot Livz", {
        body: d.body || "",
        tag: d.tag || undefined,
        icon: "/Foot-Livz/icons/icon-192.png",
        badge: "/Foot-Livz/icons/icon-192.png",
        data: { url: d.url || "/Foot-Livz/" }
    }));
});

self.addEventListener("notificationclick", function (e) {
    e.notification.close();
    var url = (e.notification.data && e.notification.data.url) || "/Foot-Livz/";
    e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].url.indexOf("/Foot-Livz/") !== -1 && "focus" in list[i]) {
                if ("navigate" in list[i]) list[i].navigate(url);
                return list[i].focus();
            }
        }
        return self.clients.openWindow(url);
    }));
});
