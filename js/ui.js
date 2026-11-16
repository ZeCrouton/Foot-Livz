(function () {
    var FL = window.FL = window.FL || {};

    FL.esc = function (s) {
        return String(s === undefined || s === null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };

    FL.norm = function (s) {
        return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    FL.params = function () {
        var out = {};
        new URLSearchParams(window.location.search).forEach(function (v, k) { out[k] = v; });
        return out;
    };

    FL.startOfDay = function (ms) {
        var d = new Date(ms);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };

    FL.fmtDay = function (ms) {
        var s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(ms);
        return s.charAt(0).toUpperCase() + s.slice(1);
    };

    FL.fmtTime = function (ms) {
        var d = new Date(ms);
        return (d.getHours() < 10 ? "0" : "") + d.getHours() + "h" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    };

    FL.logo = function (url) {
        return url ? '<img class="logo" src="' + FL.esc(url) + '" alt="" loading="lazy">' : '<span class="logo logo-empty"></span>';
    };

    FL.matchUrl = function (m) {
        return (FL.base || "") + "match.html?league=" + encodeURIComponent(m.league) + "&id=" + encodeURIComponent(m.id);
    };

    FL.teamUrl = function (league, id) {
        return (FL.base || "") + "team.html?league=" + encodeURIComponent(league) + "&id=" + encodeURIComponent(id);
    };

    FL.stateLabel = function (m) {
        if (m.state === "PRE") return FL.fmtTime(m.date);
        if (m.state === "LIVE") return '<span class="live-dot"></span>' + FL.esc(m.clock || "En direct");
        if (m.state === "POST") return "Terminé";
        return FL.esc(m.statusText || "");
    };

    // Une ligne de match cliquable
    FL.matchRow = function (m, opts) {
        opts = opts || {};
        var score = m.state === "PRE" ? "–" : FL.esc(m.homeScore) + " – " + FL.esc(m.awayScore);
        var league = opts.showLeague ? '<span class="match-league">' + FL.esc(m.leagueName) + "</span>" : "";
        return '<a class="match match-' + m.state.toLowerCase() + '" href="' + FL.matchUrl(m) + '">' +
            '<span class="match-time">' + FL.stateLabel(m) + "</span>" +
            '<span class="match-team home">' + FL.esc(m.home.short) + FL.logo(m.home.logo) + "</span>" +
            '<span class="match-score">' + score + "</span>" +
            '<span class="match-team away">' + FL.logo(m.away.logo) + FL.esc(m.away.short) + "</span>" +
            league + "</a>";
    };

    // Date relative : « il y a 3 h »
    FL.ago = function (ms) {
        if (!ms) return "";
        var s = Math.max(0, (Date.now() - ms) / 1000);
        if (s < 90) return "à l'instant";
        if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
        if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
        if (s < 7 * 86400) { var d = Math.round(s / 86400); return "il y a " + d + (d > 1 ? " jours" : " jour"); }
        return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(ms);
    };

    // « Aujourd'hui 21h00 », « Demain 20h45 », « Samedi 14 mars 17h00 »
    FL.fmtWhen = function (ms) {
        var diff = Math.round((FL.startOfDay(ms) - FL.startOfDay(Date.now())) / 86400000);
        var day = diff === 0 ? "Aujourd'hui" : diff === 1 ? "Demain" : FL.fmtDay(ms);
        return day + " · " + FL.fmtTime(ms);
    };

    FL.countdown = function (ms) {
        var s = Math.floor((ms - Date.now()) / 1000);
        if (s <= 0) return "";
        var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        if (d > 0) return "dans " + d + " j " + h + " h";
        if (h > 0) return "dans " + h + " h " + (m < 10 ? "0" : "") + m;
        return "dans " + m + " min";
    };

    // Résultat d'une équipe sur un match terminé : V / N / D
    FL.outcome = function (m, teamId) {
        var h = parseInt(m.homeScore, 10), a = parseInt(m.awayScore, 10);
        if (isNaN(h) || isNaN(a)) return null;
        var mine = m.home.id === teamId ? h : a, theirs = m.home.id === teamId ? a : h;
        return mine > theirs ? "V" : mine < theirs ? "D" : "N";
    };

    FL.skeleton = function (rows) {
        var out = "";
        for (var i = 0; i < (rows || 3); i++) out += '<div class="skeleton"></div>';
        return out;
    };

    // Sélecteur de club réutilisé par l'accueil et les réglages
    FL.clubPicker = function (box, onPick) {
        var SUGGEST = ["OM", "PSG", "OL", "Monaco", "Lille", "Lens", "Real Madrid", "Barça", "Liverpool", "Bayern"];
        box.innerHTML = '<input type="search" class="search" placeholder="Rechercher ton club (ex. OM, PSG, Real Madrid…)" autocomplete="off">' +
            '<div class="chips picker-suggest">' + SUGGEST.map(function (x) { return FL.chip(x, x, false, "q"); }).join("") + "</div>" +
            '<div class="picker-status"></div><div class="picker-results"></div>';
        var input = box.querySelector("input"), res = box.querySelector(".picker-results"), status = box.querySelector(".picker-status");
        var hits = [];

        function render() {
            var st = FL.teamIndex.state;
            var q = input.value;
            status.innerHTML = st.loading && st.total > 1
                ? '<p class="muted small">Chargement des équipes… ' + st.done + "/" + st.total + "</p>"
                : (!st.loading && !FL.teamIndex.all().length
                    ? FL.notice("Liste des équipes indisponible pour le moment.", "error") + '<p><button type="button" class="btn small" data-retry>Réessayer</button></p>'
                    : "");
            if (FL.norm(q).length < 2) { res.innerHTML = ""; hits = []; return; }
            hits = FL.teamIndex.search(q).slice(0, 8);
            res.innerHTML = hits.length
                ? '<div class="card">' + hits.map(function (h, i) {
                    return '<div class="list-row"><span class="list-main">' + FL.logo(h.team.logo) + "<span>" + FL.esc(h.team.name) +
                        "</span><small>" + FL.esc(FL.leagueName(h.league)) + '</small></span><button type="button" class="btn small primary" data-pick="' + i + '">Choisir</button></div>';
                }).join("") + "</div>"
                : (st.loading ? "" : FL.notice("Aucune équipe trouvée."));
        }

        input.addEventListener("input", render);
        box.addEventListener("click", function (e) {
            var chip = e.target.closest("button.chip");
            if (chip) { input.value = chip.getAttribute("data-q"); render(); input.focus(); return; }
            var retry = e.target.closest("[data-retry]");
            if (retry) { FL.teamIndex.retry(); return; }
            var b = e.target.closest("button[data-pick]");
            if (!b) return;
            var h = hits[+b.getAttribute("data-pick")];
            if (h) onPick({ id: h.team.id, name: h.team.name, league: h.league, national: h.national, logo: h.team.logo, color: h.team.color, alt: h.team.alt });
        });
        FL.teamIndex.onChange(render);
        FL.teamIndex.load();
        render();
    };

    FL.notice = function (text, kind) {
        return '<p class="notice ' + (kind || "") + '">' + FL.esc(text) + "</p>";
    };

    FL.staleBanner = function (f) {
        return f && f.stale ? FL.notice("Connexion impossible : dernières données enregistrées (" +
            new Date(f.fetchedAt).toLocaleString("fr-FR") + ").", "warn") : "";
    };

    FL.chip = function (label, value, selected, attrName) {
        return '<button type="button" class="chip' + (selected ? " selected" : "") + '" data-' + (attrName || "value") +
            '="' + FL.esc(value) + '">' + FL.esc(label) + "</button>";
    };

    // Regroupe une liste de matchs par jour
    FL.groupByDay = function (list) {
        var groups = [], map = {};
        list.forEach(function (m) {
            var d = FL.startOfDay(m.date);
            if (!map[d]) { map[d] = { day: d, matches: [] }; groups.push(map[d]); }
            map[d].matches.push(m);
        });
        return groups;
    };

    FL.uniqueMatches = function (list) {
        var seen = {};
        return list.filter(function (m) {
            if (seen[m.id]) return false;
            seen[m.id] = true;
            return true;
        });
    };

    // Rafraîchit une fonction à intervalle régulier (scores en direct)
    FL.every = function (ms, fn) {
        var id = setInterval(fn, ms);
        return function () { clearInterval(id); };
    };
})();
