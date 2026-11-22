(async function () {
    var FL = window.FL, app = document.getElementById("app");
    app.innerHTML = '<p class="loading">Chargement des matchs…</p>';

    var teams  = FL.prefs.teams();
    var mode   = "my";   // "my" | "all"
    var view   = "next"; // "next" (à venir) | "results" (résultats)
    var filter = "";     // id équipe (mode "my" uniquement)

    // ── Données ────────────────────────────────────────────────────────────

    // Équipes suivies
    var myMatches = [];
    var myFailed  = false;
    (function () {
        var res = null;
        return { load: async function (force) {
            var r = await Promise.allSettled(teams.map(function (t) { return FL.espn.teamFixtures(t, force); }));
            myFailed = r.every(function (x) { return x.status === "rejected"; });
            var now = Date.now();
            var all = [];
            r.forEach(function (x) { if (x.status === "fulfilled") all = all.concat(x.value); });
            myMatches = FL.uniqueMatches(all)
                .filter(function (m) { return m.date > now - 3 * 3600 * 1000 && m.state !== "POST"; })
                .sort(function (a, b) { return a.date - b.date; });
        }};
    })();

    // Tous les matchs (7 jours)
    var allMatches  = [];
    var allLoaded   = false;   // true une fois le chargement terminé (même si vide)
    var allLoading  = false;   // évite les doubles requêtes
    async function loadAllMatches(force) {
        if (allLoading) return;
        allLoading = true;
        try {
            var now  = Date.now();
            var days = Array.from({length: 7}, function (_, i) { return now + i * 86400000; });
            var res  = await Promise.allSettled(days.map(function (d) { return FL.espn.dayMatches(d, force); }));
            var flat = [];
            res.forEach(function (r) { if (r.status === "fulfilled") flat = flat.concat(r.value.matches); });
            allMatches = FL.uniqueMatches(flat)
                .filter(function (m) { return m.date > now - 2 * 3600 * 1000 && m.state !== "POST"; })
                .sort(function (a, b) { return a.date - b.date; });
        } finally {
            allLoaded  = true;
            allLoading = false;
        }
    }

    // Résultats : 7 jours pour mes équipes (1 appel par équipe), 3 jours pour tous les matchs
    var resMy = [], resMyLoaded = false, resMyLoading = false;
    var resAll = [], resAllLoaded = false, resAllLoading = false;
    var byDateDesc = function (a, b) { return b.date - a.date; };

    async function loadResultsMy() {
        if (resMyLoading) return;
        resMyLoading = true;
        try {
            var since = Date.now() - 7 * 86400000;
            // force : le calendrier mis en cache avant la fin d'un match ne le montrerait pas comme terminé
            var r = await Promise.allSettled(teams.map(function (t) { return FL.espn.schedule(t.league, t.id, false, true); }));
            var all = [];
            r.forEach(function (x) { if (x.status === "fulfilled") all = all.concat(x.value); });
            resMy = FL.uniqueMatches(all)
                .filter(function (m) { return m.state === "POST" && m.date > since; })
                .sort(byDateDesc);
        } finally { resMyLoaded = true; resMyLoading = false; }
    }

    async function loadResultsAll() {
        if (resAllLoading) return;
        resAllLoading = true;
        try {
            var now = Date.now();
            var days = [0, 1, 2].map(function (i) { return now - i * 86400000; });
            var r = await Promise.allSettled(days.map(function (d) { return FL.espn.dayMatches(d, true); }));
            var flat = [];
            r.forEach(function (x) { if (x.status === "fulfilled") flat = flat.concat(x.value.matches); });
            resAll = FL.uniqueMatches(flat)
                .filter(function (m) { return m.state === "POST"; })
                .sort(byDateDesc);
        } finally { resAllLoaded = true; resAllLoading = false; }
    }

    function loadResults() {
        return mode === "my" ? loadResultsMy() : loadResultsAll();
    }

    // Chargement initial des équipes suivies
    var now = Date.now();
    var r = await Promise.allSettled(teams.map(function (t) { return FL.espn.teamFixtures(t, false); }));
    myFailed = r.every(function (x) { return x.status === "rejected"; });
    var flat = [];
    r.forEach(function (x) { if (x.status === "fulfilled") flat = flat.concat(x.value); });
    myMatches = FL.uniqueMatches(flat)
        .filter(function (m) { return m.date > now - 3 * 3600 * 1000 && m.state !== "POST"; })
        .sort(function (a, b) { return a.date - b.date; });

    if (myFailed && mode === "my") {
        app.innerHTML = FL.notice("Impossible de charger les matchs. Vérifiez votre connexion.", "error");
        return;
    }

    // ── Rendu ──────────────────────────────────────────────────────────────

    function render() {
        var results = view === "results";
        var source = results ? (mode === "my" ? resMy : resAll) : (mode === "my" ? myMatches : allMatches);
        var shown  = source.filter(function (m) {
            return !filter || m.home.id === filter || m.away.id === filter;
        });

        // Chips de mode
        var modeChips =
            '<button class="chip mode-chip' + (mode === "my"  ? " active" : "") + '" data-mode="my">Mes équipes</button>' +
            '<button class="chip mode-chip' + (mode === "all" ? " active" : "") + '" data-mode="all">Tous les matchs</button>';

        // Chips À venir / Résultats
        var viewChips =
            '<button class="chip view-chip' + (!results ? " active" : "") + '" data-view="next">À venir</button>' +
            '<button class="chip view-chip' + (results ? " active" : "") + '" data-view="results">Résultats</button>';

        // Chips équipes (seulement en mode "my")
        var teamChips = "";
        if (mode === "my" && teams.length > 0) {
            teamChips = '<span class="chips-sep"></span>' +
                FL.chip("Toutes", "", filter === "") +
                teams.map(function (t) { return FL.chip(t.name, t.id, filter === t.id); }).join("");
        }

        // Corps
        var body;
        var loaded = results ? (mode === "my" ? resMyLoaded : resAllLoaded) : (mode === "my" || allLoaded);
        if (!loaded) {
            body = '<p class="loading">Chargement des matchs…</p>';
        } else if (!shown.length) {
            var msg = results
                ? (mode === "my" ? "Aucun résultat récent pour tes équipes." : "Aucun résultat dans les 3 derniers jours.")
                : (mode === "my" ? "Aucun match programmé pour tes équipes." : "Aucun match programmé dans les 7 prochains jours.");
            body = FL.notice(msg);
        } else {
            body = FL.groupByDay(shown).map(function (g) {
                return '<h3 class="day-title">' + FL.esc(FL.fmtDay(g.day)) + "</h3>" +
                    '<div class="card">' + g.matches.map(function (m) {
                        return FL.matchRow(m, { showLeague: true });
                    }).join("") + "</div>";
            }).join("");
        }

        app.innerHTML =
            '<div class="chips agenda-chips">' + viewChips + '<span class="chips-sep"></span>' + modeChips + teamChips + "</div>" +
            body;
    }

    // ── Événements ─────────────────────────────────────────────────────────

    app.addEventListener("click", function (e) {
        // À venir / Résultats
        var vb = e.target.closest("button.view-chip");
        if (vb) {
            var newView = vb.getAttribute("data-view");
            if (newView === view) return;
            view = newView;
            render();
            if (view === "results") loadResults().then(render);
            else if (mode === "all" && !allLoaded) loadAllMatches(false).then(render);
            return;
        }
        // Changement de mode
        var mb = e.target.closest("button.mode-chip");
        if (mb) {
            var newMode = mb.getAttribute("data-mode");
            if (newMode === mode) return;
            mode   = newMode;
            filter = "";
            render();
            if (view === "results") {
                if (!(mode === "my" ? resMyLoaded : resAllLoaded)) loadResults().then(render);
            } else if (mode === "all" && !allLoaded) {
                loadAllMatches(false).then(render);
            }
            return;
        }
        // Filtre par équipe
        var cb = e.target.closest("button.chip");
        if (!cb || cb.classList.contains("view-chip") || cb.classList.contains("mode-chip")) return;
        filter = cb.getAttribute("data-value");
        render();
    });

    render();
})();
