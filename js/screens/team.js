(async function () {
    var FL = window.FL, app = document.getElementById("app");
    var params = FL.params();

    if (!params.id || !params.league) {
        var list = FL.prefs.followed();
        app.innerHTML = '<h3 class="day-title">Équipes suivies</h3><div class="card">' + list.map(function (t) {
            return '<div class="list-row"><a class="list-main" href="' + FL.teamUrl(t.league, t.id) + '">' + FL.logo(t.logo) +
                "<span>" + FL.esc(t.name) + "</span></a></div>";
        }).join("") + "</div>" + '<p><a class="btn primary" href="explorer.html">Chercher une équipe</a></p>';
        return;
    }

    app.innerHTML = '<p class="loading">Chargement de l\'équipe…</p>';
    var league = params.league, id = params.id;

    // Retrouve la fiche de l'équipe en essayant plusieurs sources, de la plus fiable à la plus lente.
    // (Avant : une seule source, /teams ; si elle échouait — fréquent en 4G/5G — la page affichait « introuvable ».)
    function pickById(list) {
        return (list || []).find(function (t) { return String(t.id) === String(id); }) || null;
    }
    async function attempt(fn) { try { return await fn(); } catch (e) { return null; } }
    function fromIndexCache() {
        try {
            var c = JSON.parse(localStorage.getItem("fl:teams-v3"));
            var r = c && c.v && c.v.find(function (x) { return String(x[0]) === String(id) && x[7] === league; })
                || (c && c.v && c.v.find(function (x) { return String(x[0]) === String(id); }));
            return r ? { id: String(r[0]), name: r[1], short: r[2], abbr: r[3], logo: r[4], color: r[5], alt: r[6] } : null;
        } catch (e) { return null; }
    }
    var followedRef = FL.prefs.followed().find(function (t) { return String(t.id) === String(id); });
    var teamRef =
        pickById(await attempt(function () { return FL.espn.teams(league, false); })) ||
        pickById(await attempt(function () { return FL.espn.teamsFromStandings(league, false); })) ||
        await attempt(function () { return FL.espn.team(league, id, false); }) ||
        fromIndexCache() ||
        (followedRef ? { id: id, name: followedRef.name, short: followedRef.name, logo: followedRef.logo, color: followedRef.color, alt: followedRef.alt } : null);
    var team = teamRef;
    if (!team) {
        app.innerHTML = FL.notice("Équipe introuvable dans cette compétition.", "error");
        return;
    }
    var teamObj = { id: id, name: team.name, league: league, national: league.indexOf("fifa.") === 0 || league.indexOf("uefa.nations") === 0, logo: team.logo, color: team.color || null, alt: team.alt || null };
    document.title = team.name + " - FootLivz";

    var settled = await Promise.allSettled([
        FL.espn.schedule(league, id, false, false),
        FL.espn.teamFixtures(teamObj, false),
        FL.hasTable(league) ? FL.espn.standings(league, false) : Promise.resolve(null),
        FL.espn.roster(league, id, false)
    ]);
    var past = settled[0].status === "fulfilled" ? settled[0].value : [];
    var next = settled[1].status === "fulfilled" ? settled[1].value : [];
    var table = settled[2].status === "fulfilled" && settled[2].value ? settled[2].value.data : null;
    var roster = settled[3].status === "fulfilled" ? settled[3].value : [];

    var now = Date.now();
    var upcoming = next.filter(function (m) { return m.state !== "POST" && m.date > now - 3 * 3600 * 1000; });
    var results = past.filter(function (m) { return m.state === "POST"; }).slice(-5).reverse();

    var rank = "";
    if (table) {
        table.forEach(function (g) {
            var r = g.rows.find(function (x) { return x.teamId === id; });
            if (r) rank = r.pos + "e · " + r.pts + " pts";
        });
    }

    var following = FL.prefs.isFollowed(id);
    var header = '<div class="card team-header">' + FL.logo(team.logo) +
        '<div><h2>' + FL.esc(team.name) + "</h2><p class=\"muted\">" + FL.esc(FL.leagueName(league)) + (rank ? " · " + FL.esc(rank) : "") + "</p></div>" +
        '<div class="team-actions"><button type="button" id="follow" class="btn">' + (following ? "Ne plus suivre" : "Suivre") + "</button>" +
        (FL.prefs.hasClub() && FL.prefs.club().id === id ? "" : '<button type="button" id="make-club" class="btn primary">Mon club de cœur</button>') + "</div></div>";

    var up = upcoming.length ? '<h3 class="day-title">Prochains matchs</h3><div class="card">' +
        upcoming.slice(0, 8).map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>" : "";
    var res = results.length ? '<h3 class="day-title">Derniers résultats</h3><div class="card">' +
        results.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>" : "";

    var squad = "";
    if (roster.length) {
        var groups = {};
        roster.forEach(function (p) { (groups[p.posGroup] = groups[p.posGroup] || []).push(p); });
        squad = '<h3 class="day-title">Effectif</h3>' + Object.keys(groups).sort().map(function (g) {
            return '<div class="card"><h4>' + FL.esc(FL.espn.posLabel(+g)) + "</h4>" + groups[g].map(function (p) {
                return '<div class="list-row"><span class="rank">' + FL.esc(p.jersey) + "</span><span class=\"list-main\">" + FL.esc(p.name) +
                    "</span><small>" + FL.esc(p.pos) + (p.injury ? " · " + FL.esc(p.injury) : "") + "</small></div>";
            }).join("") + "</div>";
        }).join("");
    }

    app.innerHTML = header + up + res + squad;

    var mk = document.getElementById("make-club");
    if (mk) mk.addEventListener("click", function () {
        FL.prefs.setClub(teamObj);
        FL.prefs.setTheme({ off: FL.prefs.theme().off, color: "" });
        window.location.reload();
    });

    document.getElementById("follow").addEventListener("click", function () {
        if (FL.prefs.isFollowed(id)) FL.prefs.unfollow(id);
        else FL.prefs.follow(teamObj);
        this.textContent = FL.prefs.isFollowed(id) ? "Ne plus suivre" : "Suivre";
    });
})();
