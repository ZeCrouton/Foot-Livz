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
        om: "marseille", psg: "paris saint", "paris sg": "paris saint", ol: "lyon", asm: "monaco", losc: "lille", ogcn: "nice",
        rcl: "lens", srfc: "rennes", fcn: "nantes", asse: "etienne", rcsa: "strasbourg", hac: "havre",
        barca: "barcelona", "man city": "manchester city", "man utd": "manchester united",
        "man united": "manchester united", juve: "juventus", bvb: "dortmund", spurs: "tottenham",
        gunners: "arsenal", bleus: "france", atletico: "atletico", real: "real"
    };

    // Noms français -> noms utilisés par ESPN (anglais ou langue locale). Clés sans accents ni ponctuation.
    // Expressions de plusieurs mots (traitées avant les mots seuls)
    var PHRASES = {
        "olympique lyonnais": "lyon", "olympique de marseille": "marseille", "stade rennais": "rennes", "stade brestois": "brest",
        "stade de reims": "reims", "equipe de france": "france", "les bleus": "france",
        "pays de galles": "wales", "pays bas": "netherlands", "irlande du nord": "northern ireland", "cote d ivoire": "ivory coast",
        "etats unis": "united states", "arabie saoudite": "saudi arabia", "afrique du sud": "south africa",
        "nouvelle zelande": "new zealand", "coree du sud": "south korea", "coree du nord": "north korea",
        "republique tcheque": "czech", "macedoine du nord": "north macedonia", "guinee equatoriale": "equatorial guinea",
        "cap vert": "cape verde", "rd congo": "dr congo", "la haye": "den haag", "etoile rouge": "red star",
        "saint gall": "st gallen", "bois le duc": "den bosch"
    };
    // Mots isolés
    var WORDS = {
        // Clubs : villes
        barcelone: "barcelona", seville: "sevilla", valence: "valencia", saragosse: "zaragoza", majorque: "mallorca", cadix: "cadiz",
        grenade: "granada", naples: "napoli", turin: "torino", rome: "roma", florence: "fiorentina", genes: "genoa",
        venise: "venezia", bologne: "bologna", parme: "parma", plaisance: "piacenza",
        cologne: "koln", francfort: "frankfurt", breme: "bremen", hanovre: "hannover", nuremberg: "nurnberg", munchen: "munich",
        bale: "basel", mayence: "mainz", fribourg: "freiburg", brunswick: "braunschweig", ratisbonne: "regensburg",
        lisbonne: "lisbon", anvers: "antwerp", bruges: "brugge", gand: "gent", louvain: "leuven", malines: "mechelen",
        bruxelles: "brussels", edimbourg: "edinburgh", copenhague: "copenhagen", athenes: "athens", moscou: "moscow",
        varsovie: "warsaw", cracovie: "krakow", bucarest: "bucharest", salzbourg: "salzburg", vienne: "vienna",
        geneve: "geneva", berne: "bern", kiev: "kyiv", belgrade: "belgrade",
        // Sélections nationales
        allemagne: "germany", espagne: "spain", angleterre: "england", italie: "italy", belgique: "belgium", suisse: "switzerland",
        ecosse: "scotland", irlande: "ireland", croatie: "croatia", pologne: "poland", autriche: "austria", danemark: "denmark",
        suede: "sweden", norvege: "norway", turquie: "turkey", grece: "greece", roumanie: "romania", hongrie: "hungary",
        tchequie: "czech", slovaquie: "slovakia", slovenie: "slovenia", serbie: "serbia", albanie: "albania", bulgarie: "bulgaria",
        islande: "iceland", finlande: "finland", lettonie: "latvia", lituanie: "lithuania", estonie: "estonia", russie: "russia",
        georgie: "georgia", armenie: "armenia", azerbaidjan: "azerbaijan", bosnie: "bosnia", hollande: "netherlands",
        maroc: "morocco", algerie: "algeria", tunisie: "tunisia", egypte: "egypt", cameroun: "cameroon", comores: "comoros",
        mauritanie: "mauritania", zambie: "zambia", ethiopie: "ethiopia", guinee: "guinea",
        bresil: "brazil", argentine: "argentina", colombie: "colombia", perou: "peru", chili: "chile", equateur: "ecuador",
        mexique: "mexico", bolivie: "bolivia", jamaique: "jamaica", japon: "japan", coree: "korea", australie: "australia",
        jordanie: "jordan", irak: "iraq", chine: "china", inde: "india", malte: "malta", chypre: "cyprus", andorre: "andorra"
    };
    // Mots sans valeur discriminante dans un nom de club (FC, AC, « de »…) : on les ignore dans une variante de la recherche
    var STOP = {};
    "fc cf ac as sc afc ssc us og ogc rc rcl ca club de du des la le les el al the of et d olympique stade sv vfb vfl tsg fsv bsc rb equipe selection 1"
        .split(" ").forEach(function (w) { STOP[w] = true; });

    // Normalise : minuscules, sans accents, ponctuation -> espaces (« Saint-Étienne » = « saint etienne »)
    function clean(s) { return FL.norm(s).replace(/[\-\.'’_,]+/g, " ").replace(/\s+/g, " ").trim(); }

    function translate(c) {
        var t = " " + c + " ";
        Object.keys(PHRASES).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
            t = t.split(" " + k + " ").join(" " + PHRASES[k] + " ");
        });
        return t.trim().split(" ").map(function (w) { return WORDS[w] || w; }).join(" ");
    }
    function strip(c) {
        var kept = c.split(" ").filter(function (w) { return w && !STOP[w]; });
        return kept.join(" ");
    }
    function stVariants(c) {
        var out = [];
        if (/\bsaint\b/.test(c)) out.push(c.replace(/\bsaint\b/g, "st"));
        if (/\bst\b/.test(c)) out.push(c.replace(/\bst\b/g, "saint"));
        return out;
    }
    // Toutes les formes de la requête à essayer (la meilleure note gagne)
    function variants(q) {
        var c = clean(q), list = [c];
        if (ALIASES[c]) list.push(ALIASES[c]);
        var t = translate(c);
        list.push(t);
        list.slice().forEach(function (v) { stVariants(v).forEach(function (x) { list.push(x); }); });
        list.slice().forEach(function (v) { var st = strip(v); if (st.length >= 2) list.push(st); });
        var seen = {};
        return list.filter(function (v) { if (!v || seen[v]) return false; seen[v] = true; return true; });
    }

    // Distance d'édition (pour tolérer « Barcelone » / « Barcelona », fautes de frappe…)
    function lev(a, b) {
        var prev = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            var cur = [i];
            for (j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
            }
            prev = cur;
        }
        return prev[b.length];
    }
    function fuzzyWord(term, w) {
        if (term.length < 4) return w.indexOf(term) === 0;
        var max = term.length >= 8 ? 2 : 1;
        return w.indexOf(term) === 0 || lev(term, w) <= max || lev(term, w.slice(0, term.length)) <= max;
    }

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
            nname: FL.norm(t.name), nshort: FL.norm(t.short || t.name), nabbr: FL.norm(t.abbr),
            cname: clean(t.name), cshort: clean(t.short || t.name)
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

    function words(h) { return (h.cname + " " + h.cshort).split(" ").filter(Boolean); }
    function score(h, n, terms) {
        if (h.nabbr && h.nabbr === n) return 100;
        if (h.cname === n || h.cshort === n) return 95;
        if (h.cname.indexOf(n) === 0 || h.cshort.indexOf(n) === 0) return 80;
        var w = words(h);
        var ok = terms.every(function (t) { return w.some(function (x) { return x.indexOf(t) === 0; }); });
        if (ok) return 60;
        if ((h.cname + " " + h.cshort).indexOf(n) >= 0) return 40;
        return 0;
    }
    // Dernier recours (aucun résultat) : tolère les fautes et les différences d'orthographe
    function fuzzyScore(h, terms) {
        var w = words(h);
        return terms.every(function (t) { return w.some(function (x) { return fuzzyWord(t, x); }); }) ? 25 : 0;
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
            var vs = variants(q);
            var res = [];
            function run(fn) {
                items.forEach(function (h) {
                    var s = fn(h);
                    if (s > 0) res.push({ h: h, s: s * 1000 - leagueRank(h.league) * 10 - (h.national ? 5 : 0) });
                });
            }
            run(function (h) {
                var best = 0;
                vs.forEach(function (v) { best = Math.max(best, score(h, v, v.split(" ").filter(Boolean))); });
                return best;
            });
            if (!res.length) {
                run(function (h) {
                    var best = 0;
                    vs.forEach(function (v) { best = Math.max(best, fuzzyScore(h, v.split(" ").filter(Boolean))); });
                    return best;
                });
            }
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
