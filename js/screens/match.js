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

    var lastSig = "";
    function sigOf(g) {
        var mm = g.data.match;
        return JSON.stringify([mm.state, mm.homeScore, mm.awayScore, mm.clock, g.data.events.length, g.data.teamStats]);
    }

    function render(f) {
    var d = f.data, m = d.match;
    lastSig = sigOf(f);
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

    // ── Faits de match en français (même logique que l'APK) ──────────────
    var REPLACES = /(.+?) replaces (.+?)(?:\.|,| because|$)/i;
    function afterLast(str, sep) { var i = str.lastIndexOf(sep); return i >= 0 ? str.slice(i + sep.length) : str; }
    function eventLabel(e) {
        var p = e.players || [], r = (e.rawType || "").toLowerCase();
        switch (e.type) {
            case "GOAL": return ["⚽", "But — " + (p[0] || "") + (p[1] ? " (passe de " + p[1] + ")" : "")];
            case "PENALTY_GOAL": return ["⚽", "But sur penalty — " + (p[0] || "")];
            case "OWN_GOAL": return ["⚽", "But contre son camp — " + (p[0] || "")];
            case "YELLOW": return ["🟨", p[0] || "Carton jaune"];
            case "RED": return ["🟥", (p[0] || "Carton rouge") + (r.indexOf("yellow") >= 0 ? " (2e jaune)" : "")];
            case "SUB": {
                var t = e.text || "", i = t.indexOf(". ");
                var mt = REPLACES.exec(i >= 0 ? t.slice(i + 2) : t);
                var inP = mt ? afterLast(mt[1].trim(), ". ") : (p[0] || "?");
                var outP = mt ? mt[2].trim() : (p[1] || "?");
                return ["🔁", inP + " remplace " + outP];
            }
            case "PERIOD":
                if (r.indexOf("kickoff") >= 0 || r.indexOf("kick off") >= 0) return ["⏱", "Coup d'envoi"];
                if (r.indexOf("halftime") >= 0 || r.indexOf("half time") >= 0) return ["⏱", "Mi-temps"];
                if (r.indexOf("start 2nd") >= 0 || r.indexOf("second half") >= 0 || r.indexOf("start second") >= 0) return ["⏱", "Reprise"];
                if (r.indexOf("extra") >= 0) return ["⏱", "Prolongation"];
                if (r.indexOf("end") >= 0 || r.indexOf("full") >= 0) return ["⏱", "Fin du match"];
                return null;
            default:
                if (r.indexOf("penalty") >= 0 && r.indexOf("saved") >= 0) return ["🧤", "Penalty arrêté — " + (p[0] || "")];
                if (r.indexOf("penalty") >= 0 && r.indexOf("missed") >= 0) return ["❌", "Penalty manqué — " + (p[0] || "")];
                if (r.indexOf("var") >= 0 || r.indexOf("disallowed") >= 0) return ["📺", "But refusé (VAR)"];
                return null;
        }
    }

    // Les faits les plus récents en premier (comme sur l'APK)
    var events = d.events.map(function (e) { return { e: e, l: eventLabel(e) }; })
        .filter(function (x) { return x.l; }).reverse();
    var eventsHtml = events.length
        ? '<h3 class="day-title">Faits marquants</h3><div class="card">' + events.map(function (x) {
            return '<div class="list-row"><span class="rank">' + FL.esc(x.e.minute) + "</span><span>" + x.l[0] + " " +
                FL.esc(x.l[1]) + '</span><small>' + FL.esc(nameOf[x.e.teamId] || "") + "</small></div>";
        }).join("") + "</div>"
        : "";

    var STAT_ROWS = [
        ["possessionPct", "Possession"], ["totalShots", "Tirs"], ["shotsOnTarget", "Tirs cadrés"],
        ["wonCorners", "Corners"], ["offsides", "Hors-jeu"], ["foulsCommitted", "Fautes"],
        ["accuratePasses", "Passes réussies"], ["saves", "Arrêts"],
        ["yellowCards", "Cartons jaunes"], ["redCards", "Cartons rouges"]
    ];
    var statsHtml = "";
    var tids = [m.home.id, m.away.id];
    var hs = d.teamStats[tids[0]] || {}, as = d.teamStats[tids[1]] || {};
    var statRowsHtml = STAT_ROWS.filter(function (r) { return hs[r[0]] != null && as[r[0]] != null; }).map(function (r) {
        var pct = r[0] === "possessionPct";
        function fmt(v) { return pct ? Math.round(parseFloat(String(v).replace(",", "."))) + " %" : v; }
        return "<tr><td>" + FL.esc(fmt(hs[r[0]])) + "</td><td class=\"stat-name\">" + FL.esc(r[1]) + "</td><td>" + FL.esc(fmt(as[r[0]])) + "</td></tr>";
    }).join("");
    if (statRowsHtml) {
        statsHtml = '<h3 class="day-title">Statistiques</h3><div class="card table-wrap"><table class="table"><tbody>' + statRowsHtml + "</tbody></table></div>";
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
    }

    render(f);

    // Mise à jour automatique : pendant le match (et dans l'heure qui précède le coup d'envoi), toutes les 20 s.
    // Seul ce qui a changé déclenche un nouvel affichage ; rien ne bouge si la page est en arrière-plan.
    var m0 = f.data.match;
    if (m0.state === "LIVE" || (m0.state === "PRE" && m0.date - Date.now() < 3600000)) {
        var stop = FL.every(20000, async function () {
            if (document.hidden) return;
            try {
                var g = await FL.espn.summary(params.league, params.id, true);
                if (sigOf(g) !== lastSig) {
                    var y = window.scrollY;
                    render(g);
                    window.scrollTo(0, y);
                }
                if (g.data.match.state === "POST") stop();   // match terminé : dernier affichage fait
            } catch (e) { /* on garde l'affichage précédent */ }
        });
    }
})();
