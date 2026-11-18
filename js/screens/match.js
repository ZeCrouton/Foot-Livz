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
    catch (e) { app.innerHTML = FL.notice(e && e.friendly ? e.message : "Match indisponible. Vérifiez votre connexion.", "error"); return; }

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

    // Message contextuel selon l'état du match
    var contextHtml = "";
    if (m.state === "PRE") {
        var nowMs = Date.now(), matchMs = m.date;
        var diffH = (matchMs - nowMs) / 3600000;
        if (diffH > 0 && diffH < 2) {
            contextHtml = '<p class="muted" style="text-align:center;padding:8px 16px">Les compositions tomberont environ 1 h avant le coup d\'envoi.</p>';
        } else if (diffH <= 0) {
            contextHtml = '<p class="muted" style="text-align:center;padding:8px 16px">Les statistiques détaillées arrivent au coup d\'envoi.</p>';
        }
    }

    // Articles de presse pour les matchs terminés (compte rendu)
    var pressHtml = "";
    if (m.state === "POST") {
        var PRESS_PRE = ["chaine", "quelle heure", "streaming", "ou voir", "en direct", "direct video", "compo probable", "avant-match", "programme tv"];
        function teamKey(t) {
            var stop = new Set(["fc", "as", "ac", "sc", "rc", "us", "og", "ogc", "club", "de", "du", "des", "la", "le", "les", "olympique", "stade", "sporting", "athletic"]);
            var w = FL.norm(t.short || t.name).split(/[\s\-]+/).filter(function (x) { return x.length >= 3 && !stop.has(x); });
            return w[0] || FL.norm(t.name).split(/[\s\-]+/)[0] || FL.norm(t.name);
        }
        var kh = teamKey(m.home), ka = teamKey(m.away);
        // date du match en yyyy-mm-dd
        function ymd(ms) { var d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
        var after = ymd(m.date - 86400000), before2 = ymd(m.date + 4 * 86400000);
        var pressQuery = kh + " " + ka + " after:" + after + " before:" + before2;
        pressHtml = '<h3 class="day-title">Dans la presse</h3><div class="card" id="press-block"><p class="loading">Chargement…</p></div>';
    }

    app.innerHTML = FL.staleBanner(f) + header + contextHtml + eventsHtml + statsHtml + lineupsHtml + pressHtml;

    // Chargement des articles APRÈS mise à jour du DOM
    if (m.state === "POST") {
        (async function () {
            var block = document.getElementById("press-block");
            if (!block) return;
            try {
                var f2 = await FL.news.load(pressQuery, false);
                var items = f2.data.filter(function (a) {
                    var t = FL.norm(a.title);
                    if (PRESS_PRE.some(function (x) { return t.indexOf(x) >= 0; })) return false;
                    return t.indexOf(kh) >= 0 && t.indexOf(ka) >= 0;
                }).filter(function (a) { return !a.date || a.date >= m.date; }).slice(0, 6);
                if (!items.length) { block.innerHTML = '<p class="muted">Aucun article trouvé.</p>'; return; }
                block.innerHTML = items.map(function (a) {
                    return '<div class="list-row"><a href="' + FL.esc(a.link) + '" target="_blank" rel="noopener">' + FL.esc(a.title) + '</a><small>' + FL.esc(a.source) + '</small></div>';
                }).join("");
            } catch (e) {
                if (block) block.innerHTML = '<p class="muted">Articles indisponibles.</p>';
            }
        })();
    }
    document.title = m.home.short + " - " + m.away.short + " - FootLivz";
})();
