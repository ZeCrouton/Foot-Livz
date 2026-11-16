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
        return "match.html?league=" + encodeURIComponent(m.league) + "&id=" + encodeURIComponent(m.id);
    };

    FL.teamUrl = function (league, id) {
        return "team.html?league=" + encodeURIComponent(league) + "&id=" + encodeURIComponent(id);
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
