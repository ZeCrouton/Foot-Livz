/* Actualités mercato : flux RSS Google Actualités + flux RSS Foot Mercato (en français), lus via
   des relais CORS car un navigateur ne peut pas lire directement un flux RSS d'un autre site. */
(function () {
    var FL = window.FL = window.FL || {};
    var TTL = 15 * 60 * 1000;
    var PREFIX = "fl:n:";

    var WORKER = "https://footlivz.nvz-photos.workers.dev";
    var PROXIES = [
        { name: "worker", build: function (u) { return WORKER + "/rss?q=" + encodeURIComponent(new URL(u).searchParams.get("q") || ""); } },
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


    // ---------------------------------------------------------------- Foot Mercato
    // Flux unique (toute l'actu de footmercato.net), filtré ensuite par thème grâce aux mots-clés <category>.
    var FM_FEED = "https://www.footmercato.net/flux-rss";
    var FM_TTL = 10 * 60 * 1000;
    // 1) notre Worker /fm (frais à 2 min près) ; 2) relais publics en secours (rss2json garde souvent le flux en cache plusieurs heures)
    var FM_WORKER = { name: "worker-fm", build: function () { return WORKER + "/fm"; } };
    var FM_PROXIES = PROXIES.filter(function (p) { return p.name !== "worker"; });
    // Mots du mercato, testés sur le titre seulement
    var MERCATO_RE = /mercato|transfert|recrue|recrut|\bpret\b|prolong|\bofficiel(le)?\b|\bsigne|s'engage|contrat|depart|partir|quitter|rejoindre|rejoint|\boffre\b|piste|cible|interet|interesse|negoci|accord|clause|vente|achat|arrivee|libre|resili|courtis|reve de|fonce sur|vers un|blinde|ecarte/;
    // « Officiel » = signatures/transferts actés (pas les « compositions officielles »)
    var OFFICIEL_RE = /^(?!.*composition).*(\bofficiel(le)?\b|officialis|s'engage|\bsigne\b|\brejoint\b|c'est fait)/;

    function fmItem(title, link, date, cats) {
        var tags = FL.norm(Array.isArray(cats) ? cats.join(", ") : cats || "").slice(0, 300);
        return { title: String(title || "").trim(), source: "Foot Mercato", link: safeLink(String(link || "").trim()), date: parseDate(date), tags: tags };
    }

    async function fmViaProxy(p) {
        var r = await timeout(p.build(FM_FEED), 9000);
        if (!r.ok) throw new Error(p.name + " HTTP " + r.status);
        var items;
        if (p.json) {
            var j = await r.json();
            if (j.status !== "ok") throw new Error(p.name + " refus");
            items = (j.items || []).map(function (x) { return fmItem(x.title, x.link, x.pubDate, x.categories); });
        } else {
            var doc = new DOMParser().parseFromString(await r.text(), "text/xml");
            if (doc.querySelector("parsererror")) throw new Error("RSS illisible");
            items = Array.prototype.map.call(doc.querySelectorAll("item"), function (it) {
                function txt(tag) { var e = it.querySelector(tag); return e ? e.textContent : ""; }
                var cats = Array.prototype.map.call(it.querySelectorAll("category"), function (c) { return c.textContent; });
                return fmItem(txt("title"), txt("link"), txt("pubDate"), cats);
            });
        }
        items = items.filter(function (x) { return x.title && x.link; });
        if (!items.length) throw new Error(p.name + " vide");
        return items;
    }

    async function fmLoad(force) {
        var c = cacheGet("__fm2");
        if (!force && c && Date.now() - c.t < FM_TTL) return c.v;
        try {
            var items;
            try { items = await fmViaProxy(FM_WORKER); }
            catch (e1) { items = await Promise.any(FM_PROXIES.map(fmViaProxy)); }
            cacheSet("__fm2", items);
            return items;
        } catch (e) {
            if (c) return c.v;
            throw e;
        }
    }

    // Noms ESPN -> mots employés par Foot Mercato (clés sans accents)
    var FM_KEYS = {
        "marseille": ["marseille", "om"], "paris saint-germain": ["psg", "paris saint-germain", "paris sg"],
        "lyon": ["lyon", "ol"], "monaco": ["monaco", "asm"], "lille": ["lille", "losc"], "nice": ["ogc nice", "nice"],
        "lens": ["lens", "rcl"], "rennes": ["rennes", "stade rennais"], "saint-etienne": ["saint-etienne", "asse"],
        "le havre": ["le havre", "hac"], "toulouse": ["toulouse", "tfc"], "strasbourg": ["strasbourg", "rcsa"],
        "barcelona": ["barcelone", "barca"], "atletico madrid": ["atletico"], "bayern munich": ["bayern"],
        "borussia dortmund": ["dortmund", "bvb"], "manchester united": ["manchester united", "man united"],
        "manchester city": ["manchester city", "man city"], "tottenham hotspur": ["tottenham", "spurs"],
        "juventus": ["juventus", "juve"], "internazionale": ["inter milan", "inter"], "inter milan": ["inter milan", "inter"],
        "ac milan": ["ac milan", "milan ac"], "napoli": ["naples", "napoli"], "as roma": ["as roma", "roma"],
        "bayer leverkusen": ["leverkusen"], "rb leipzig": ["leipzig"], "sevilla": ["seville"], "real betis": ["betis"],
        "athletic club": ["athletic bilbao"], "lazio": ["lazio"], "fiorentina": ["fiorentina"]
    };
    var GENERIC = { fc: 1, club: 1, united: 1, city: 1, real: 1, sporting: 1, athletic: 1, olympique: 1, stade: 1, racing: 1, association: 1, sport: 1, sc: 1, ac: 1, as: 1, us: 1, de: 1, du: 1, la: 1, le: 1 };

    function clubKeys(name) {
        var n = FL.norm(name);
        if (FM_KEYS[n]) return FM_KEYS[n];
        var keys = [n];
        n.split(/[^a-z0-9-]+/).forEach(function (w) { if (w.length >= 5 && !GENERIC[w]) keys.push(w); });
        return keys;
    }

    function hasWord(text, key) {
        var k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp("(^|[^a-z0-9])" + k + "([^a-z0-9]|$)").test(text);
    }

    function fmFilter(items, fm) {
        return items.filter(function (a) {
            var title = FL.norm(a.title), all = title + " | " + (a.tags || "");
            if (fm.keys && !fm.keys.some(function (k) { return hasWord(all, k); })) return false;
            if (fm.re && !fm.re.test(title)) return false;
            return true;
        }).map(function (a) { return { title: a.title, source: a.source, link: a.link, date: a.date }; });
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
                query: club.national ? club.name + " football sélection" : '"' + club.name + '" football ' + mercatoWords + " when:30d",
                fm: { keys: clubKeys(club.name) }
            });
            FL.prefs.followed().filter(function (t) { return t.id !== club.id && !t.national; }).slice(0, 4).forEach(function (t) {
                list.push({ id: "t" + t.id, label: t.name, logo: t.logo, query: '"' + t.name + '" football ' + mercatoWords + " when:30d", fm: { keys: clubKeys(t.name) } });
            });
            list.push(
                { id: "tous", label: "Tous", query: "football (mercato OR transfert OR Ligue 1 OR blessure) when:2d", fm: {}, fast: true },
                { id: "une", label: "À la une", query: "mercato football when:3d", fm: { re: MERCATO_RE } },
                { id: "officiel", label: "Officiel", query: "transfert officiel football officialise when:7d", fm: { re: OFFICIEL_RE } },
                { id: "l1", label: "Ligue 1", query: "mercato Ligue 1 when:14d", fm: { keys: ["ligue 1"] } },
                { id: "pl", label: "Premier League", query: "mercato Premier League when:14d", fm: { keys: ["premier league"] } },
                { id: "liga", label: "Liga", query: "mercato Liga Real Barça when:14d", fm: { keys: ["liga", "laliga"] } },
                { id: "seriea", label: "Serie A", query: "mercato Serie A when:14d", fm: { keys: ["serie a"] } },
                { id: "bundes", label: "Bundesliga", query: "mercato Bundesliga when:14d", fm: { keys: ["bundesliga"] } }
            );
            return list;
        },

        // Thème complet : Google Actualités + Foot Mercato, fusionnés, dédoublonnés, triés par date
        loadTopic: async function (topic, force) {
            var gp = this.load(topic.query, force);
            // Thème « rapide » : on n'attend pas Google plus de 2,5 s (sa réponse reste mise en cache pour la fois suivante)
            if (topic.fast) gp = Promise.race([gp, new Promise(function (_, rej) { setTimeout(function () { rej(new Error("Google lent")); }, 2500); })]);
            var res = await Promise.allSettled([gp, topic.fm ? fmLoad(force) : Promise.resolve([])]);
            var g = res[0].status === "fulfilled" ? res[0].value : null;
            var fmItems = res[1].status === "fulfilled" ? fmFilter(res[1].value, topic.fm || {}) : [];
            if (!g && !fmItems.length) throw (res[0].reason || new Error("Actualités indisponibles"));
            var items = dedupe(fmItems.concat(g ? g.data : []));
            items.sort(function (a, b) { return b.date - a.date; });
            return {
                data: items.slice(0, 50), stale: g ? g.stale : false, fetchedAt: g ? g.fetchedAt : Date.now(),
                fm: fmItems.length, google: g ? g.data.length : 0
            };
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
