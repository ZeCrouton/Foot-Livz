/* Notifications : buts, coup d'envoi, mi-temps et fin de match pour les équipes suivies.
 *  - Application fermée : Web Push (le serveur « footlivz » surveille les matchs et envoie).
 *  - Site ouvert : notifications locales (si le Web Push n'est pas actif, pour éviter les doublons). */
(function () {
    var FL = window.FL = window.FL || {};
    var WORKER = "https://footlivz.nvz-photos.workers.dev";
    var K_ON = "fl:notify", K_SIG = "fl:notify:sig", K_SEEN = "fl:notify:seen";
    var ICON = "/Foot-Livz/icons/icon-192.png";

    function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignoré */ } }

    function supported() { return "Notification" in window && "serviceWorker" in navigator; }
    function pushSupported() { return supported() && "PushManager" in window; }
    function enabled() { return supported() && Notification.permission === "granted" && get(K_ON) === "1"; }

    function b64uToBytes(s) {
        s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
        var r = atob(s), out = new Uint8Array(r.length);
        for (var i = 0; i < r.length; i++) out[i] = r.charCodeAt(i);
        return out;
    }

    async function getSub() {
        if (!pushSupported()) return null;
        try { var reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; }
    }

    function myTeams() {
        var list = FL.prefs.followed().slice();
        if (FL.prefs.hasClub() && !FL.prefs.isFollowed(FL.prefs.club().id)) list.push(FL.prefs.club());
        return list.map(function (t) { return { id: String(t.id), league: t.league }; });
    }

    async function post(path, body) {
        var r = await fetch(WORKER + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
    }

    async function subscribePush() {
        if (!pushSupported()) return false;
        try {
            var reg = await navigator.serviceWorker.ready;
            var sub = await reg.pushManager.getSubscription();
            if (!sub) {
                var k = await (await fetch(WORKER + "/push/key")).json();
                if (!k.key) return false;
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(k.key) });
            }
            await post("/push/sub", { sub: sub.toJSON(), teams: myTeams(), comps: FL.prefs.competitions() });
            set(K_SIG, signature());
            return true;
        } catch (e) {
            try { var s = await getSub(); if (s) await s.unsubscribe(); } catch (e2) { /* ignoré */ }
            return false;
        }
    }

    function signature() {
        return JSON.stringify([myTeams().map(function (t) { return t.id; }).sort(), FL.prefs.competitions().slice().sort()]);
    }

    function show(title, body, tag, url) {
        navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, { body: body, tag: tag, icon: ICON, badge: ICON, data: { url: url || "/Foot-Livz/" } });
        }).catch(function () { /* ignoré */ });
    }

    // ---- notifications locales (site ouvert, sans Web Push)
    function seen() { try { return JSON.parse(get(K_SEEN)) || {}; } catch (e) { return {}; } }
    function phase(m) { return m.state === "LIVE" ? (m.clock === "MT" ? "ht" : "in") : m.state === "POST" ? "post" : "pre"; }

    function check(matches) {
        if (!enabled()) return;
        getSub().then(function (sub) {
            if (sub) return;                                   // le Web Push s'en occupe
            var mine = {};
            myTeams().forEach(function (t) { mine[t.id] = true; });
            var db = seen(), now = Date.now(), changed = false;
            matches.forEach(function (m) {
                if (!mine[m.home.id] && !mine[m.away.id]) return;
                var hs = parseInt(m.homeScore, 10) || 0, as = parseInt(m.awayScore, 10) || 0, st = phase(m);
                var old = db[m.id];
                var line = m.home.short + " " + hs + "-" + as + " " + m.away.short;
                if (old) {
                    var tag = m.id + "-" + hs + "-" + as;
                    if (old.st === "pre" && st !== "pre") show("🟢 Coup d'envoi", m.home.short + " – " + m.away.short, m.id + "-ko", FL.matchUrl(m));
                    if (old.st === "in" && st === "ht") show("⏸ Mi-temps", line, m.id + "-ht", FL.matchUrl(m));
                    if (old.st !== "post" && st === "post") show("🏁 Fin du match", line, m.id + "-ft", FL.matchUrl(m));
                    if (hs + as > old.hs + old.as) show("⚽ But !", line, m.id + "-g-" + hs + "-" + as, FL.matchUrl(m));
                    else if (hs + as < old.hs + old.as) show("❌ But annulé", line, m.id + "-var-" + hs + "-" + as, FL.matchUrl(m));
                }
                if (!old || old.hs !== hs || old.as !== as || old.st !== st) { db[m.id] = { hs: hs, as: as, st: st, t: now }; changed = true; }
            });
            Object.keys(db).forEach(function (id) { if (now - db[id].t > 3 * 86400000) { delete db[id]; changed = true; } });
            if (changed) set(K_SEEN, JSON.stringify(db));
        });
    }

    var poller = null;
    function startPolling() {
        if (poller || !enabled()) return;
        var run = function () {
            if (document.hidden || !enabled()) return;
            FL.espn.dayMatches(FL.startOfDay(Date.now()) + 12 * 3600 * 1000, false).then(function (d) { check(d.matches); }).catch(function () { /* ignoré */ });
        };
        run();
        poller = FL.every(45000, run);
    }

    FL.notify = {
        supported: supported,
        pushSupported: pushSupported,
        enabled: enabled,
        permission: function () { return supported() ? Notification.permission : "unsupported"; },
        hasPush: async function () { return !!(await getSub()); },
        // À appeler depuis un clic (le navigateur exige un geste de l'utilisateur pour demander l'autorisation)
        enable: async function () {
            if (!supported()) return { ok: false, reason: "unsupported" };
            var perm = Notification.permission;
            if (perm !== "granted") perm = await Notification.requestPermission();
            if (perm !== "granted") return { ok: false, reason: "denied" };
            set(K_ON, "1");
            var push = await subscribePush();
            startPolling();
            return { ok: true, push: push };
        },
        disable: async function () {
            set(K_ON, null); set(K_SIG, null);
            var sub = await getSub();
            if (sub) { try { await post("/push/unsub", { endpoint: sub.endpoint }); } catch (e) { /* ignoré */ } try { await sub.unsubscribe(); } catch (e) { /* ignoré */ } }
        },
        test: function () { show("⚽ Foot Livz", "Les notifications fonctionnent.", "test-" + Date.now(), "/Foot-Livz/"); },
        // Met à jour le serveur quand les équipes ou compétitions suivies ont changé
        sync: async function () {
            if (!enabled()) return;
            var sub = await getSub();
            if (sub && get(K_SIG) !== signature()) {
                try { await post("/push/sub", { sub: sub.toJSON(), teams: myTeams(), comps: FL.prefs.competitions() }); set(K_SIG, signature()); } catch (e) { /* on réessaiera */ }
            }
        },
        check: check,
        start: function () { if (enabled()) { FL.notify.sync(); startPolling(); } }
    };
})();
