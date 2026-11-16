(async function () {
    var FL = window.FL, app = document.getElementById("app");
    var params = FL.params();
    if (!params.id || !params.league) {
        window.location.replace("live.html");
        return;
    }
    app.innerHTML = '<p class="loading">Chargement du match…</p>';

    var f;
    try { f = await FL.espn.summary(params.league, params.id, false); }
    catch (e) { app.innerHTML = FL.notice("Match indisponible. Vérifiez votre connexion.", "error"); return; }

    var d = f.data, m = d.match;
    var nameOf = {};
    nameOf[m.home.id] = m.home.short;
    nameOf[m.away.id] = m.away.short;
    var scoreLine = m.state === "PRE" ? "–" : FL.esc(m.homeScore) + " – " + FL.esc(m.awayScore);

    var header = '<div class="card match-header">' +
        '<div class="match-meta">' + FL.esc(m.leagueName) + " · " + FL.esc(FL.fmtDay(m.date)) + " " + FL.fmtTime(m.date) + "</div>" +
        '<div class="match-big"><span>' + FL.logo(m.home.logo) + FL.esc(m.home.name) + "</span>" +
        "<strong>" + scoreLine + "</strong>" +
        "<span>" + FL.esc(m.away.name) + FL.logo(m.away.logo) + "</span></div>" +
        '<div class="match-meta">' + (m.state === "LIVE" ? '<span class="live-dot"></span>' : "") +
        FL.esc(m.state === "PRE" ? "" : (m.state === "LIVE" ? (m.clock || "En direct") : m.statusText)) +
        (m.venue ? " · " + FL.esc(m.venue) : "") + "</div></div>";

    var events = d.events.filter(function (e) { return e.type !== "PERIOD" && e.type !== "OTHER"; });
    var eventsHtml = events.length
        ? '<h3 class="day-title">Faits marquants</h3><div class="card">' + events.map(function (e) {
            var icon = { GOAL: "⚽", PENALTY_GOAL: "⚽ (pen.)", OWN_GOAL: "⚽ (csc)", YELLOW: "🟨", RED: "🟥", SUB: "🔁" }[e.type] || "•";
            return '<div class="list-row"><span class="rank">' + FL.esc(e.minute) + "</span><span>" + icon + " " +
                FL.esc(e.players.join(", ") || e.rawType) + '</span><small>' + FL.esc(nameOf[e.teamId] || "") + "</small></div>";
        }).join("") + "</div>"
        : "";

    var statsHtml = "";
    var tids = [m.home.id, m.away.id];
    if (d.statOrder.length) {
        statsHtml = '<h3 class="day-title">Statistiques</h3><div class="card table-wrap"><table class="table"><tbody>' +
            d.statOrder.map(function (k) {
                var h = (d.teamStats[tids[0]] || {})[k] || "–", a = (d.teamStats[tids[1]] || {})[k] || "–";
                return "<tr><td>" + FL.esc(h) + "</td><td class=\"stat-name\">" + FL.esc(k) + "</td><td>" + FL.esc(a) + "</td></tr>";
            }).join("") + "</tbody></table></div>";
    }

    var lineupsHtml = d.lineups.length ? '<h3 class="day-title">Compositions</h3>' + d.lineups.map(function (lu) {
        var starters = lu.players.filter(function (p) { return p.starter; });
        var bench = lu.players.filter(function (p) { return !p.starter; });
        return '<div class="card"><h4>' + FL.esc(nameOf[lu.teamId] || "") + (lu.formation ? " · " + FL.esc(lu.formation) : "") + "</h4>" +
            starters.map(function (p) {
                return '<div class="list-row"><span class="rank">' + FL.esc(p.jersey) + "</span><span>" + FL.esc(p.name) + "</span><small>" + FL.esc(p.pos) + "</small></div>";
            }).join("") +
            (bench.length ? "<p class=\"muted\">Remplaçants : " + bench.map(function (p) { return FL.esc(p.name); }).join(", ") + "</p>" : "") +
            "</div>";
    }).join("") : "";

    app.innerHTML = FL.staleBanner(f) + header + eventsHtml + statsHtml + lineupsHtml;
    document.title = m.home.short + " - " + m.away.short + " - FootLivz";
})();
