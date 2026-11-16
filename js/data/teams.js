/* Index de toutes les équipes (clubs + sélections) pour la recherche.
   Chargement progressif : on peut chercher dès que les premières compétitions sont arrivées. */
(function () {
    var FL = window.FL = window.FL || {};
    var KEY = "fl:teams-v3";
    var FULL_TTL = 7 * 86400 * 1000, PARTIAL_TTL = 30 * 60 * 1000;
    var CONCURRENCY = 5;

    var items = [], byKey = {}, listeners = [], promise = null;
    var state = { loading: false, ready: false, done: 0, total: 0, failed: [] };

    // Abréviations courantes -> mots présents dans le nom officiel
    var ALIASES = {
        om: "marseille", psg: "paris saint", ol: "lyon", asm: "monaco", losc: "lille", ogcn: "nice",
        rcl: "lens", srfc: "rennes", fcn: "nantes", asse: "etienne", rcsa: "strasbourg", hac: "havre",
        barca: "barcelona", "man city": "manchester city", "man utd": "manchester united",
        "man united": "manchester united", juve: "juventus", bvb: "dortmund", spurs: "tottenham",
        gunners: "arsenal", bleus: "france", atletico: "atletico", real: "real"
    };

    function isCup(slug) { return /^(uefa|fifa)\./.test(slug); }
    function leagueRank(slug) {
        var i = FL.leagues.findIndex(function (l) { return l.slug === slug; });
        return i < 0 ? 99 : i;
    }

    function notify() { listeners.slice().forEach(function (fn) { try { fn(state); } catch (e) { /* ignore */ } }); }

    function add(t, league, national) {
        if (!t || !t.id || !t.name) return;
        var key = t.id + (national ? "n" : "c");
        var ex = byKey[key];
        if (ex) {
            if (isCup(ex.league) && !isCup(league)) ex.league = league;      // la ligue nationale prime
            if (!ex.team.color && t.color) { ex.team.color = t.color; ex.team.alt = t.alt || null; }
            return;
        }
        var h = {
            team: { id: String(t.id), name: t.name, short: t.short || t.name, abbr: t.abbr || "", logo: t.logo || null, color: t.color || null, alt: t.alt || null },
            league: league, national: !!national,
            nname: FL.norm(t.name), nshort: FL.norm(t.short || t.name), nabbr: FL.norm(t.abbr)
        };
        byKey[key] = h;
        items.push(h);
    }

    function addPrefs() {
        FL.prefs.teams().forEach(function (t) {
            add({ id: t.id, name: t.name, short: t.name, logo: t.logo, color: t.color, alt: t.alt }, t.league, t.national);
        });
    }

    function save(complete) {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                t: Date.now(), complete: complete,
                v: items.map(function (h) {
                    return [h.team.id, h.team.name, h.team.short, h.team.abbr, h.team.logo, h.team.color, h.team.alt, h.league, h.national ? 1 : 0];
                })
            }));
        } catch (e) { /* quota */ }
    }

    function hydrate() {
        try {
            var c = JSON.parse(localStorage.getItem(KEY));
            if (!c || !c.v || c.v.length < 30) return false;
            var age = Date.now() - c.t;
            if (age > (c.complete ? FULL_TTL : PARTIAL_TTL)) return false;
            c.v.forEach(function (r) {
                add({ id: r[0], name: r[1], short: r[2], abbr: r[3], logo: r[4], color: r[5], alt: r[6] }, r[7], !!r[8]);
            });
            return true;
        } catch (e) { return false; }
    }

    async function fetchLeague(lg) {
        try { return await FL.espn.teams(lg.slug); }
        catch (e) { return await FL.espn.teamsFromStandings(lg.slug); }   // plan B
    }

    async function run() {
        state.loading = true; state.ready = false; state.failed = []; state.done = 0;
        addPrefs();
        if (hydrate()) { state.loading = false; state.ready = true; state.total = state.done = 1; notify(); return items; }

        var comps = FL.leagues.filter(function (l) { return l.slug !== "fifa.friendly" && l.slug !== "fra.coupe_de_france"; });
        state.total = comps.length;
        notify();
        var queue = comps.slice();
        async function worker() {
            while (queue.length) {
                var lg = queue.shift();
                try {
                    var teams = await fetchLeague(lg);
                    teams.forEach(function (t) { add(t, lg.slug, !!lg.national); });
                } catch (e) {
                    state.failed.push(lg.slug);
                }
                state.done++;
                notify();
            }
        }
        var workers = [];
        for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
        await Promise.all(workers);

        state.loading = false;
        state.ready = items.length > 0;
        if (items.length > 50) save(state.failed.length === 0);
        notify();
        return items;
    }

    function score(h, n, terms) {
        if (h.nabbr && h.nabbr === n) return 100;
        if (h.nname === n || h.nshort === n) return 95;
        if (h.nname.indexOf(n) === 0 || h.nshort.indexOf(n) === 0) return 80;
        var words = (h.nname + " " + h.nshort).split(/[\s\-\.'’]+/).filter(Boolean);
        var ok = terms.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); });
        if (ok) return 60;
        if ((h.nname + " " + h.nshort).indexOf(n) >= 0) return 40;
        return 0;
    }

    FL.teamIndex = {
        state: state,
        all: function () { return items; },
        onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
        load: function () {
            if (!promise) promise = run();
            return promise;
        },
        retry: function () { items = []; byKey = {}; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } promise = null; return this.load(); },

        search: function (q) {
            var n = FL.norm(q);
            if (n.length < 2) return [];
            var target = ALIASES[n] || n;
            var terms = target.split(/\s+/).filter(Boolean);
            var res = [];
            items.forEach(function (h) {
                var s = Math.max(score(h, n, n.split(/\s+/).filter(Boolean)), target !== n ? score(h, target, terms) : 0);
                if (s > 0) res.push({ h: h, s: s * 1000 - leagueRank(h.league) * 10 - (h.national ? 5 : 0) });
            });
            res.sort(function (a, b) { return b.s - a.s || a.h.team.name.localeCompare(b.h.team.name); });
            return res.slice(0, 30).map(function (r) { return r.h; });
        },

        searchLeagues: function (q) {
            var n = FL.norm(q);
            if (n.length < 2) return [];
            return FL.leagues.filter(function (l) { return FL.norm(l.name).indexOf(n) >= 0 || FL.norm(l.group).indexOf(n) >= 0; }).slice(0, 8);
        }
    };
})();
