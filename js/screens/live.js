(async function () {
    var FL = window.FL, app = document.getElementById("app");
    var params = FL.params();
    var offset = parseInt(params.day || "0", 10) || 0;

    var club = FL.prefs.club();
    var day = FL.startOfDay(Date.now()) + offset * 86400000 + 12 * 3600 * 1000;
    var isToday = offset === 0;

    function leagues() {
        var set = FL.prefs.competitions().concat(FL.prefs.followed().filter(function (t) { return !t.national; }).map(function (t) { return t.league; }));
        set.push(club.league);
        return set.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    }

    async function load(force) {
        var res = await Promise.allSettled(leagues().map(function (lg) { return FL.espn.scoreboard(lg, day, force); }));
        if (res.every(function (r) { return r.status === "rejected"; })) throw new Error("offline");
        var stale = res.some(function (r) { return r.status === "rejected" || r.value.stale; });
        var list = [];
        res.forEach(function (r) { if (r.status === "fulfilled") list = list.concat(r.value.data); });
        return { matches: FL.uniqueMatches(list), stale: stale };
    }

    function render(d) {
        var list = d.matches.slice().sort(function (a, b) {
            var la = a.state === "LIVE" ? 0 : 1, lb = b.state === "LIVE" ? 0 : 1;
            return la - lb || a.date - b.date;
        });
        var clubMatches = list.filter(function (m) { return m.home.id === club.id || m.away.id === club.id; });
        var nav = '<div class="day-nav">' +
            '<a class="btn" href="live.html?day=' + (offset - 1) + '">← Veille</a>' +
            '<strong>' + FL.esc(FL.fmtDay(day)) + "</strong>" +
            (offset < 0 ? '<a class="btn" href="live.html?day=' + (offset + 1) + '">Lendemain →</a>' : '<span></span>') +
            "</div>";
        var clubHtml = clubMatches.length
            ? '<h3 class="day-title">Ton club</h3><div class="card">' + clubMatches.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>"
            : "";
        var body = list.length
            ? '<h3 class="day-title">Tous les matchs</h3><div class="card">' + list.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>"
            : FL.notice("Aucun match ce jour-là dans tes compétitions.");
        app.innerHTML = nav + FL.staleBanner({ stale: d.stale, fetchedAt: Date.now() }) + clubHtml + body;
        return list.some(function (m) { return m.state === "LIVE"; });
    }

    app.innerHTML = '<p class="loading">Chargement des matchs…</p>';
    var current;
    try {
        current = await load(false);
    } catch (e) {
        app.innerHTML = FL.notice("Impossible de charger les matchs. Vérifiez votre connexion.", "error");
        return;
    }
    var hasLive = render(current);

    // Rafraîchissement automatique tant qu'un match est en cours
    if (isToday) {
        FL.every(30000, async function () {
            try {
                var d = await load(hasLive);   // réseau direct seulement si un match est en cours
                hasLive = render(d);
            } catch (e) { /* on garde l'affichage précédent */ }
        });
    }
})();
