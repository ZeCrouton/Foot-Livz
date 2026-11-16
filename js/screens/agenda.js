(async function () {
    var FL = window.FL, app = document.getElementById("app");
    app.innerHTML = '<p class="loading">Chargement des matchs…</p>';

    var teams = FL.prefs.teams();
    var filter = "";

    var res = await Promise.allSettled(teams.map(function (t) { return FL.espn.teamFixtures(t, false); }));
    var failed = res.every(function (r) { return r.status === "rejected"; });
    var now = Date.now();
    var all = [];
    res.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
    all = FL.uniqueMatches(all).filter(function (m) {
        return m.date > now - 3 * 3600 * 1000 && m.state !== "POST";
    }).sort(function (a, b) { return a.date - b.date; });

    if (failed) {
        app.innerHTML = FL.notice("Impossible de charger les matchs. Vérifiez votre connexion.", "error");
        return;
    }

    function render() {
        var shown = all.filter(function (m) {
            return !filter || m.home.id === filter || m.away.id === filter;
        });
        var chips = FL.chip("Toutes", "", filter === "") + teams.map(function (t) {
            return FL.chip(t.name, t.id, filter === t.id);
        }).join("");

        var body;
        if (!shown.length) {
            body = FL.notice("Aucun match programmé pour tes équipes.");
        } else {
            body = FL.groupByDay(shown).map(function (g) {
                return '<h3 class="day-title">' + FL.esc(FL.fmtDay(g.day)) + "</h3>" +
                    '<div class="card">' + g.matches.map(function (m) {
                        return FL.matchRow(m, { showLeague: true });
                    }).join("") + "</div>";
            }).join("");
        }
        app.innerHTML = '<div class="chips">' + chips + "</div>" + body;
    }

    app.addEventListener("click", function (e) {
        var b = e.target.closest("button.chip");
        if (!b) return;
        filter = b.getAttribute("data-value");
        render();
    });

    render();
})();
