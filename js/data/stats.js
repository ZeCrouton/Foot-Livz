/* xG estimé (position des tirs), vrais xG d'après-match (serveur Highlightly) et notes maison des joueurs.
 * Port de Stats.kt / Backup.kt de l'application Android. */
(function () {
    var FL = window.FL = window.FL || {};
    var WORKER = "https://footlivz.nvz-photos.workers.dev";

    function posGroup(p) {
        var u = String(p || "").toUpperCase(), c = u.charAt(0);
        if (c === "G") return 0;
        if (c === "D") return 1;
        if (c === "M") return 2;
        if (c === "F" || c === "A" || c === "S") return 3;
        if (u.indexOf("CB") >= 0 || u.indexOf("B") >= 0) return 1;
        if (u.indexOf("W") >= 0) return 3;
        return 2;
    }

    function shotXg(s) {
        if (s.isPenalty) return 0.76;
        var dx = (100 - s.x) * 1.05, dy = (s.y - 50) * 0.68;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var angle = Math.atan2(7.32 * dx, dx * dx + dy * dy - 3.66 * 3.66);
        if (angle < 0) angle += Math.PI;
        var xg = 1 / (1 + Math.exp(-(-0.107 + 0.501 * angle - 0.1407 * dist)));
        if (s.isHeader) xg *= 0.6;
        return Math.min(0.95, Math.max(0.01, xg));
    }

    /** xG par équipe { teamId: valeur }, ou null si ESPN n'a pas fourni de positions. */
    function teamXg(d) {
        if (!d.shots || !d.shots.length) return null;
        var m = {}, any = false;
        // ESPN ne donne pas toujours l'identifiant de l'équipe sur un tir : on retombe sur son nom
        function idOf(s) {
            if (s.teamId) return s.teamId;
            var n = FL.norm(s.teamName || "");
            if (!n || !d.match) return null;
            var h = d.match.home, a = d.match.away;
            function is(t) { return FL.norm(t.name) === n || FL.norm(t.short || "") === n; }
            return is(h) ? h.id : is(a) ? a.id : null;
        }
        d.shots.forEach(function (s) {
            var id = idOf(s);
            if (!id) return;
            m[id] = (m[id] || 0) + shotXg(s); any = true;
        });
        return any ? m : null;
    }

    function stat(p, a, b) {
        var v = p.stats && p.stats[a];
        if (!v) v = p.stats && p.stats[b];
        return v || 0;
    }

    function rate(p) {
        var n = 6.0;
        var g = stat(p, "G", "totalGoals"), a = stat(p, "A", "goalAssists");
        var sog = stat(p, "SOG", "shotsOnTarget"), shots = stat(p, "SHOT", "totalShots");
        n += g + 0.7 * a + 0.15 * sog + 0.05 * Math.max(0, shots - sog);
        var group = posGroup(p.pos), ga = stat(p, "GA", "goalsConceded");
        if (group === 0) n += 0.3 * stat(p, "SV", "saves") - 0.5 * ga;
        else if (group === 1) n -= 0.3 * ga;
        n -= 0.4 * stat(p, "YC", "yellowCards");
        n -= 1.5 * stat(p, "RC", "redCards");
        n -= 1.0 * stat(p, "OG", "ownGoals");
        return Math.round(Math.min(10, Math.max(3, n)) * 2) / 2;
    }

    /** [{ player, teamId, note, goals }] pour tous les joueurs ayant joué. */
    function ratings(d) {
        var out = [];
        d.lineups.forEach(function (lu) {
            lu.players.forEach(function (p) {
                var played = p.starter || (p.subIn && p.stats && Object.keys(p.stats).length);
                if (!played) return;
                out.push({ player: p, teamId: lu.teamId, note: rate(p), goals: stat(p, "G", "totalGoals") });
            });
        });
        return out;
    }

    function manOfTheMatch(d) {
        var best = null;
        ratings(d).forEach(function (r) {
            if (!best || r.note > best.note || (r.note === best.note && r.goals > best.goals)) best = r;
        });
        return best;
    }

    function fmt(n) { return Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(1).replace(".", ","); }
    function fmtXg(v) { return (v || 0).toFixed(2).replace(".", ","); }

    function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
    function cacheSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }

    /** Vrai xG (Highlightly via le serveur) d'un match terminé : { home, away } ou null. Lecture instantanée du cache. */
    function realXgCached(m) {
        var c = cacheGet("fl:xg:" + m.id);
        return c && c.home != null ? c : null;
    }

    async function realXg(m) {
        var hit = realXgCached(m);
        if (hit) return hit;
        var miss = cacheGet("fl:xgmiss:" + m.id);
        if (miss && Date.now() - miss < 3600000) return null;       // on ne harcèle pas le serveur
        try {
            var q = "league=" + encodeURIComponent(m.league) + "&date=" + FL.espn.dayKey(m.date) +
                "&home=" + encodeURIComponent(m.home.name) + "&away=" + encodeURIComponent(m.away.name);
            var r = await fetch(WORKER + "/xg?" + q);
            if (!r.ok) throw new Error(String(r.status));
            var o = await r.json();
            if (typeof o.home !== "number" || typeof o.away !== "number") throw new Error("vide");
            var v = { home: o.home, away: o.away };
            cacheSet("fl:xg:" + m.id, v);
            return v;
        } catch (e) {
            cacheSet("fl:xgmiss:" + m.id, Date.now());
            return null;
        }
    }

    FL.stats = { shotXg: shotXg, teamXg: teamXg, rate: rate, ratings: ratings, manOfTheMatch: manOfTheMatch, fmt: fmt, fmtXg: fmtXg, realXg: realXg, realXgCached: realXgCached };
})();
