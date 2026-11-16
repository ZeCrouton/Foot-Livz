/* Actualités mercato : flux RSS Google Actualités (en français), lus via des relais CORS
   car un navigateur ne peut pas lire directement un flux RSS d'un autre site. */
(function () {
    var FL = window.FL = window.FL || {};
    var TTL = 15 * 60 * 1000;
    var PREFIX = "fl:n:";

    var PROXIES = [
        { name: "rss2json", json: true, build: function (u) { return "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(u); } },
        { name: "allorigins", build: function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); } },
        { name: "corsproxy", build: function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); } },
        { name: "codetabs", build: function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); } }
    ];

    function feedUrl(q) {
        return "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=fr&gl=FR&ceid=FR:fr";
    }

    function timeout(url, ms) {
        var c = new AbortController();
        var id = setTimeout(function () { c.abort(); }, ms);
        return fetch(url, { signal: c.signal }).finally(function () { clearTimeout(id); });
    }

    // "Titre - Source" -> { title, source }
    function splitTitle(raw, source) {
        var t = String(raw || "").trim();
        var i = t.lastIndexOf(" - ");
        if (i > 10) { source = source || t.slice(i + 3).trim(); t = t.slice(0, i).trim(); }
        return { title: t, source: source || "" };
    }

    function safeLink(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }

    function parseDate(s) {
        if (!s) return 0;
        var d = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(" ", "T") + "Z" : s);
        return isNaN(d) ? 0 : d;
    }

    function parseRss(xml) {
        var doc = new DOMParser().parseFromString(xml, "text/xml");
        if (doc.querySelector("parsererror")) throw new Error("RSS illisible");
        return Array.prototype.map.call(doc.querySelectorAll("item"), function (it) {
            function txt(tag) { var e = it.querySelector(tag); return e ? e.textContent : ""; }
            var st = splitTitle(txt("title"), txt("source"));
            return { title: st.title, source: st.source, link: safeLink(txt("link").trim()), date: parseDate(txt("pubDate")) };
        });
    }

    async function viaProxy(p, feed) {
        var r = await timeout(p.build(feed), 9000);
        if (!r.ok) throw new Error(p.name + " HTTP " + r.status);
        var items;
        if (p.json) {
            var j = await r.json();
            if (j.status !== "ok") throw new Error(p.name + " refus");
            items = (j.items || []).map(function (x) {
                var st = splitTitle(x.title, "");
                return { title: st.title, source: st.source, link: safeLink(x.link), date: parseDate(x.pubDate) };
            });
        } else {
            items = parseRss(await r.text());
        }
        items = items.filter(function (x) { return x.title && x.link; });
        if (!items.length) throw new Error(p.name + " vide");
        return items;
    }

    function fetchFeed(feed) {
        // Les relais sont interrogés en parallèle : le premier qui répond gagne
        return Promise.any(PROXIES.map(function (p) { return viaProxy(p, feed); }));
    }

    function cacheGet(k) {
        try { return JSON.parse(localStorage.getItem(PREFIX + k)); } catch (e) { return null; }
    }
    function cacheSet(k, v) {
        var item = JSON.stringify({ t: Date.now(), v: v });
        try { localStorage.setItem(PREFIX + k, item); } catch (e) {
            try {   // quota : on supprime les actualités mises en cache
                Object.keys(localStorage).forEach(function (x) { if (x.indexOf(PREFIX) === 0) localStorage.removeItem(x); });
                localStorage.setItem(PREFIX + k, item);
            } catch (e2) { /* abandon */ }
        }
    }

    function dedupe(list) {
        var seen = {};
        return list.filter(function (a) {
            var k = FL.norm(a.title).slice(0, 60);
            if (seen[k]) return false;
            seen[k] = true;
            return true;
        });
    }

    FL.news = {
        feedUrl: feedUrl,
        searchUrl: function (q) { return "https://news.google.com/search?q=" + encodeURIComponent(q) + "&hl=fr&gl=FR&ceid=FR:fr"; },

        // Thèmes proposés : club de cœur, équipes suivies, grands championnats
        topics: function () {
            var club = FL.prefs.club(), list = [];
            var mercatoWords = '(mercato OR transfert OR recrue OR "prêt" OR prolongation OR "officialise")';
            list.push({
                id: "club", label: club.name, logo: club.logo,
                query: club.national ? club.name + " football sélection" : '"' + club.name + '" football ' + mercatoWords + " when:30d"
            });
            FL.prefs.followed().filter(function (t) { return t.id !== club.id && !t.national; }).slice(0, 4).forEach(function (t) {
                list.push({ id: "t" + t.id, label: t.name, logo: t.logo, query: '"' + t.name + '" football ' + mercatoWords + " when:30d" });
            });
            list.push(
                { id: "une", label: "À la une", query: "mercato football when:3d" },
                { id: "officiel", label: "Officiel", query: "transfert officiel football officialise when:7d" },
                { id: "l1", label: "Ligue 1", query: "mercato Ligue 1 when:14d" },
                { id: "pl", label: "Premier League", query: "mercato Premier League when:14d" },
                { id: "liga", label: "Liga", query: "mercato Liga Real Barça when:14d" },
                { id: "seriea", label: "Serie A", query: "mercato Serie A when:14d" },
                { id: "bundes", label: "Bundesliga", query: "mercato Bundesliga when:14d" }
            );
            return list;
        },

        // { data: [{title, source, link, date}], stale, fetchedAt }
        load: async function (query, force) {
            var c = cacheGet(query);
            if (!force && c && Date.now() - c.t < TTL) return { data: c.v, stale: false, fetchedAt: c.t };
            try {
                var items = dedupe(await fetchFeed(feedUrl(query)));
                items.sort(function (a, b) { return b.date - a.date; });
                items = items.slice(0, 40);
                cacheSet(query, items);
                return { data: items, stale: false, fetchedAt: Date.now() };
            } catch (e) {
                if (c) return { data: c.v, stale: true, fetchedAt: c.t };
                throw e;
            }
        }
    };
})();
