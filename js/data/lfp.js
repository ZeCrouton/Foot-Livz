/* Ligue 3 Betclic : données de la LFP (celles de ligue1.com, statistiques Opta). ESPN ne couvre pas cette compétition.
   Port de Lfp.kt de l'APK Foot Livz :
     - la LFP est lue via le serveur Foot Livz (cache partagé ; un navigateur ne peut pas l'appeler
       directement : elle exige un Referer ligue1.com),
     - sinon base officielle de la FFF, via le même serveur (scores, calendrier, classement seulement).
   Les équipes ont un identifiant « L3-<n° LFP> » pour ne jamais se mélanger avec celles d'ESPN.
   Les fonctions renvoient les mêmes formes que FL.espn (voir espn.js). */
(function () {
    var FL = window.FL = window.FL || {};

    var SLUG = "fra.3", CHAMP = 11, ID_PREFIX = "L3-";
    var WORKER = "https://footlivz.nvz-photos.workers.dev";
    var DAY = 86400000;

    // ------------------------------------------------------------ utilitaires

    // Saison en cours : 2026 pour 2026-2027 (changement automatique en juillet)
    function season(now) {
        var d = new Date(now || Date.now());
        return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    }

    function teamId(clubId) {
        var s = String(clubId || "");
        return ID_PREFIX + s.slice(s.lastIndexOf("_") + 1);
    }

    function parseDate(s) {
        if (!s) return 0;
        var t = String(s);
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t)) t = t.replace(" ", "T");
        if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) t += "Z";     // sans fuseau : UTC
        var d = Date.parse(t);
        return isNaN(d) ? 0 : d;
    }

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function ymd(ms) { var d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function nextDay(d0) { return FL.startOfDay(d0 + 36 * 3600 * 1000); }   // minuit suivant, même les jours de changement d'heure

    function friendly(msg) { var e = new Error(msg); e.friendly = true; return e; }

    async function getJson(url) {
        var c = new AbortController(), id = setTimeout(function () { c.abort(); }, 12000);
        try {
            var r = await fetch(url, { signal: c.signal });
            if (!r.ok) throw new Error("HTTP " + r.status);
            var t = (await r.text()).trim();
            if (t.charAt(0) !== "{" && t.charAt(0) !== "[") throw new Error("Réponse inattendue");
            return JSON.parse(t);
        } finally { clearTimeout(id); }
    }
    function lfpGet(path) { return getJson(WORKER + "/lfp/" + path); }

    var cached = function (key, maxAge, force, fn) { return FL.espn.cached(key, maxAge, force, fn); };

    // ------------------------------------------------------------ lecture des réponses LFP

    function strip(c) { c = String(c || "").replace(/^#/, ""); return c || null; }

    function parseTeam(c, clubId, logoOverride) {
        c = c || {};
        var lg = c.assets && c.assets.logo;
        var logo = logoOverride || (lg && (lg.medium || lg.small)) || null;
        var name = c.displayName || c.name || "";
        return {
            id: teamId(clubId || c.id),
            name: c.officialName || name,
            short: c.shortName || name,
            abbr: c.trigram || c.acronym || name.slice(0, 3).toUpperCase(),
            logo: logo,
            color: strip(c.primaryColor),
            alt: strip(c.secondaryColor)
        };
    }

    function stateOf(o) {
        var p = String(o.period || "").toLowerCase();
        var time = String(o.matchTime || "").replace(/\s/g, "");
        function has(x) { return p.indexOf(x) >= 0; }
        if (has("postpon") || has("report")) return { state: "OTHER", clock: "", text: "Reporté" };
        if (has("cancel") || has("annul")) return { state: "OTHER", clock: "", text: "Annulé" };
        if (has("abandon") || has("suspend")) return { state: "OTHER", clock: "", text: "Arrêté" };
        if (has("full") || p === "ended" || p === "end" || has("postmatch")) return { state: "POST", clock: "", text: "Terminé" };
        if (has("half") && (has("time") || has("break")) && !has("first") && !has("second")) return { state: "LIVE", clock: "MT", text: "Mi-temps" };
        if (o.isLive === true || has("first") || has("second") || has("extra") || has("penalt")) {
            if (has("penalt")) return { state: "LIVE", clock: "TAB", text: "Tirs au but" };
            return { state: "LIVE", clock: time, text: time };
        }
        return { state: "PRE", clock: "", text: "" };
    }

    function parseListMatch(o) {
        if (!o || o.unknownMatch) return null;
        var h = o.home, a = o.away;
        if (!h || !a) return null;
        var st = stateOf(o);
        function score(s) { return st.state === "PRE" || s.score === null || s.score === undefined ? "" : String(s.score); }
        return {
            id: String(o.matchId || ""), league: SLUG, leagueName: FL.leagueName(SLUG),
            date: parseDate(o.date), state: st.state, clock: st.clock, statusText: st.text,
            home: parseTeam(h.clubIdentity, h.clubId), away: parseTeam(a.clubIdentity, a.clubId),
            homeScore: score(h), awayScore: score(a), venue: null, lastScorer: null, details: [], source: "LFP"
        };
    }

    function posCode(p) { return p === 1 ? "G" : p === 2 ? "D" : p === 3 ? "M" : p === 4 ? "F" : "M"; }

    // « 45' +4' » -> « 45'+4' »
    function minute(t) {
        var s = String(t || "").replace(/\s/g, "").replace(/''/g, "'");
        return s.indexOf("+") >= 0 && s.charAt(s.length - 1) !== "'" ? s + "'" : s;
    }
    function minuteNum(m) {
        var base = parseInt(String(m).split("'")[0].split("+")[0], 10) || 0;
        var i = String(m).indexOf("+");
        var extra = i >= 0 ? parseInt(String(m).slice(i + 1).replace(/\D/g, ""), 10) || 0 : 0;
        return base * 100 + extra;
    }

    function ageOf(birth) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || ""));
        if (!m) return null;
        var now = new Date(), age = now.getFullYear() - +m[1];
        if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) age--;
        return age;
    }

    function jerseyOf(p, idt) {
        var n = parseInt(p.shirtNumber, 10);
        if (!(n > 0)) n = parseInt(idt.jerseyNumber, 10);
        return n > 0 ? String(n) : "";
    }

    function fullName(idt) { return ((idt.firstName || "") + " " + (idt.lastName || "")).trim(); }

    function num(o, k) {
        if (!o || o[k] === undefined || o[k] === null) return null;
        var v = Number(o[k]);
        if (isNaN(v)) return null;
        return v % 1 === 0 ? String(v) : v.toFixed(1);
    }

    function parseDetail(o) {
        var h = o.home || {}, a = o.away || {};
        var home = parseTeam(h.clubIdentity, h.clubId), away = parseTeam(a.clubIdentity, a.clubId);
        var sideId = { home: home.id, away: away.id };
        var st = stateOf(o);
        var sides = [["home", h], ["away", a]];

        // noms des joueurs des deux équipes
        var names = {};
        sides.forEach(function (pair) {
            var ps = pair[1].players || {};
            Object.keys(ps).forEach(function (k) {
                var idt = ps[k] && ps[k].playerIdentity;
                if (!idt) return;
                names[k] = (idt.firstName ? String(idt.firstName).charAt(0) + ". " : "") + (idt.lastName || "");
            });
        });
        function nm(id) { return id ? (names[id] || null) : null; }

        // faits de match, dans l'ordre chronologique
        var evs = [];
        function push(ts, ev, key) { evs.push({ ts: Number(ts) || 0, ev: ev, key: key !== undefined ? key : minuteNum(ev.minute) }); }
        function ev(min, type, raw, tid, players) {
            return { minute: min, type: type, rawType: raw, text: "", teamId: tid, players: players.filter(Boolean) };
        }

        sides.forEach(function (pair) {
            var tid = sideId[pair[0]], s = pair[1];
            (s.goals || []).forEach(function (g) {
                var t = String(g.type || "").toLowerCase();
                var type = t.indexOf("own") >= 0 ? "OWN_GOAL" : t.indexOf("pen") >= 0 ? "PENALTY_GOAL" : "GOAL";
                push(g.timestamp, ev(minute(g.time), type, "Goal", tid, [nm(g.scorerId), type === "GOAL" ? nm(g.assistProviderId) : null]));
            });
            (s.bookings || []).forEach(function (b) {
                var t = String(b.type || "").toLowerCase();
                var second = t.indexOf("second") >= 0;
                var type = t.indexOf("red") >= 0 || second ? "RED" : "YELLOW";
                var raw = second ? "Second yellow card" : type === "RED" ? "Red card" : "Yellow card";
                push(b.timestamp, ev(minute(b.time), type, raw, tid, [nm(b.playerId)]));
            });
            (s.substitutions || []).forEach(function (b) {
                push(b.timestamp, ev(minute(b.time), "SUB", "Substitution", tid, [nm(b.subOnId) || "?", nm(b.subOffId) || "?"]));
            });
            (s.missedPenalties || []).forEach(function (b) {
                push(b.timestamp, ev(minute(b.time), "OTHER", "Penalty missed", tid, [nm(b.playerId || b.scorerId)]));
            });
            (s.canceledGoals || []).forEach(function (b) {
                push(b.timestamp, ev(minute(b.time), "OTHER", "Goal disallowed VAR", tid, []));
            });
        });
        // repères de période
        var pd = o.periodsDates;
        if (pd) {
            [["firstHalfStartedAt", "Kickoff", "0'", -1], ["firstHalfEndedAt", "Halftime", "45'", 4599],
             ["secondHalfStartedAt", "Start 2nd Half", "46'", 4600], ["secondHalfEndedAt", "End Regular Time", "90'", 99999]
            ].forEach(function (x) {
                var t = parseDate(pd[x[0]]);
                if (t > 0) push(t, ev(x[2], "PERIOD", x[1], null, []), x[3]);
            });
        }
        evs.sort(function (x, y) { return x.key - y.key || x.ts - y.ts; });
        var events = evs.map(function (e) { return e.ev; });

        // compositions
        var lineups = sides.map(function (pair) {
            var s = pair[1], ps = s.players || {};
            var players = Object.keys(ps).map(function (k) {
                var p = ps[k];
                if (!p) return null;
                var idt = p.playerIdentity || {};
                var started = !!p.startedMatch;
                var place = parseInt(p.formationPlace, 10);
                return {
                    id: k, name: fullName(idt), shortName: names[k] || idt.lastName || "",
                    jersey: jerseyOf(p, idt), pos: posCode(p.position),
                    starter: started, subIn: !started && !!p.playedMatch, subOut: started && p.sub === 1,
                    _place: place > 0 ? place : 99
                };
            }).filter(Boolean);
            players.sort(function (x, y) { return (x.starter === y.starter ? 0 : x.starter ? -1 : 1) || x._place - y._place; });
            players.forEach(function (p) { delete p._place; });
            return {
                teamId: sideId[pair[0]],
                formation: s.formation ? String(s.formation).split("").join("-") : null,
                players: players
            };
        });

        // statistiques d'équipe (mêmes noms qu'ESPN pour réutiliser l'écran)
        var teamStats = {}, order = [];
        sides.forEach(function (pair) {
            var st2 = pair[1].stats;
            if (!st2) return;
            var tot = st2.total || {}, bk = st2.bookingsData || {};
            var m = {};
            function set(k, v) { if (v !== null && v !== undefined) m[k] = v; }
            set("possessionPct", num(st2, "possessionPercentage"));
            set("totalShots", num(st2, "scoringAttempts"));
            set("shotsOnTarget", num(st2, "ontargetScoringAttempts"));
            set("wonCorners", num(st2, "corners") || num(tot, "won_corners"));
            set("offsides", num(st2, "offsides"));
            set("foulsCommitted", num(st2, "fouls") || num(tot, "fouls"));
            set("accuratePasses", num(tot, "accurate_pass"));
            set("saves", num(tot, "saves"));
            m.yellowCards = num(bk, "yellow") || "0";
            m.redCards = num(bk, "red") || "0";
            teamStats[sideId[pair[0]]] = m;
        });
        ["possessionPct", "totalShots", "shotsOnTarget", "wonCorners", "offsides", "foulsCommitted", "accuratePasses", "saves", "yellowCards", "redCards"]
            .forEach(function (k) {
                if (Object.keys(teamStats).some(function (t) { return teamStats[t][k] !== undefined; })) order.push(k);
            });

        var goals = events.filter(function (e) { return e.type === "GOAL" || e.type === "PENALTY_GOAL" || e.type === "OWN_GOAL"; });
        var last = goals[goals.length - 1];
        function sc(s) { return st.state === "PRE" || s.score === null || s.score === undefined ? "" : String(s.score); }
        var match = {
            id: String(o.id || o.matchId || ""), league: SLUG, leagueName: FL.leagueName(SLUG),
            date: parseDate(o.date), state: st.state, clock: st.clock, statusText: st.text,
            home: home, away: away, homeScore: sc(h), awayScore: sc(a),
            venue: (o.stadium && o.stadium.name) || null,
            lastScorer: last ? [last.players[0], last.minute].filter(Boolean).join(" ") : null,
            details: events.filter(function (e) { return e.type !== "SUB" && e.type !== "PERIOD"; }),
            source: "LFP"
        };
        return { match: match, events: events, lineups: lineups, teamStats: teamStats, statOrder: order };
    }

    // ------------------------------------------------------------ calendrier

    function weeks(force) {
        return cached("lfp:weeks:" + season(), 6 * 3600, force, async function () {
            var o = await lfpGet("championship-calendar/" + CHAMP);
            var gw = o.gameWeeks || {};
            var list = Object.keys(gw).map(function (k) {
                var w = gw[k] || {};
                var n = parseInt(w.gameWeekNumber !== undefined ? w.gameWeekNumber : k, 10);
                if (isNaN(n)) return null;
                var s = parseDate(w.startDate);
                return { n: n, start: s, end: Math.max(parseDate(w.endDate), parseDate(w.lastRegularMatchDate), s) };
            }).filter(Boolean).sort(function (x, y) { return x.n - y.n; });
            if (!list.length) throw new Error("Calendrier vide");
            return list;
        }).then(function (f) { return f.data; });
    }

    function weekMatches(n, force, all) {
        var now = Date.now();
        var ws = (all || []).filter(function (w) { return w.n === n; })[0];
        var maxAge = !ws ? 60
            : ws.end < now - DAY ? 6 * 3600          // journée terminée
            : ws.start > now + DAY ? 3 * 3600        // journée à venir
            : 20;                                    // journée en cours : quasi direct
        return cached("lfp:week:" + season() + ":" + n, maxAge, force, async function () {
            var o = await lfpGet("championship-matches/championship/" + CHAMP + "/game-week/" + n + "?season=" + season());
            return (o.matches || []).map(parseListMatch).filter(Boolean);
        });
    }

    async function manyWeeks(ns, force, all) {
        var res = await Promise.all(ns.map(function (n) {
            return weekMatches(n, force, all).then(function (f) { return f.data; }).catch(function () { return []; });
        }));
        return FL.uniqueMatches([].concat.apply([], res)).sort(function (a, b) { return a.date - b.date; });
    }

    // Journée la plus proche d'aujourd'hui (en cours ou prochaine)
    function currentWeek(ws) {
        var now = Date.now();
        for (var i = 0; i < ws.length; i++) if (ws[i].end + DAY >= now) return ws[i].n;
        return ws.length ? ws[ws.length - 1].n : 1;
    }

    // ------------------------------------------------------------ appels (mêmes formes qu'ESPN)

    // Détails bruts d'un match, gardés en mémoire seulement (réponses volumineuses)
    var rawMemo = {};
    async function rawDetail(id) {
        var m = rawMemo[id];
        if (m && Date.now() - m.t < 6 * 3600 * 1000) return m.v;
        var v = await lfpGet("championship-match/" + id);
        rawMemo[id] = { t: Date.now(), v: v };
        return v;
    }

    async function summary(id, force) {
        if (String(id).indexOf("fff-") === 0) {
            throw friendly("La LFP ne répond pas pour le moment : seul le score officiel de la FFF est disponible. Réessaie dans quelques minutes.");
        }
        return cached("lfp:match:" + id, 15, force, async function () {
            var v = await lfpGet("championship-match/" + id);
            rawMemo[id] = { t: Date.now(), v: v };
            return parseDetail(v);
        });
    }

    async function scoreboard(dayMs, force) {
        var d0 = FL.startOfDay(dayMs), d1 = nextDay(d0);
        try {
            var all = await weeks(false);
            var ws = all.filter(function (w) { return w.start - DAY < d1 && w.end + DAY > d0; });
            if (!ws.length) return { data: [], stale: false, fetchedAt: Date.now() };
            var res = await Promise.all(ws.map(function (w) { return weekMatches(w.n, force, all); }));
            var list = FL.uniqueMatches([].concat.apply([], res.map(function (r) { return r.data; })))
                .filter(function (m) { return m.date >= d0 && m.date < d1; });
            // matchs en cours ou récents : on ajoute buteurs et cartons (dernier buteur, faits marquants)
            var now = Date.now();
            var recent = function (m) { return m.state === "LIVE" || (m.state === "POST" && now - m.date < 6 * 3600 * 1000); };
            if (list.some(recent)) {
                list = await Promise.all(list.map(function (m) {
                    if (!recent(m)) return m;
                    return summary(m.id, force).then(function (f) { return f.data.match; }).catch(function () { return m; });
                }));
            }
            list.sort(function (a, b) { return a.date - b.date; });
            return {
                data: list,
                stale: res.some(function (r) { return r.stale; }),
                fetchedAt: Math.min.apply(null, res.map(function (r) { return r.fetchedAt; }))
            };
        } catch (e) {
            return { data: await fffScoreboard(d0, d1, force), stale: true, fetchedAt: Date.now() };
        }
    }

    async function standings(force) {
        try {
            var f = await cached("lfp:standings:" + season(), 120, force, async function () {
                var o = await lfpGet("championship-standings/" + CHAMP + "/general?season=" + season());
                var st = o.standings || {};
                var rows = Object.keys(st).map(function (k) {
                    var r = st[k];
                    if (!r) return null;
                    var t = parseTeam(r.clubIdentity, r.clubId);
                    return {
                        pos: r.rank | 0, teamId: t.id, team: t.short, teamName: t.name, abbr: t.abbr, color: t.color, alt: t.alt, logo: t.logo,
                        played: r.played | 0, won: r.wins | 0, drawn: r.draws | 0, lost: r.losses | 0,
                        gf: r.forGoals | 0, ga: r.againstGoals | 0, diff: r.goalsDifference | 0, pts: r.points | 0,
                        note: null, noteColor: null
                    };
                }).filter(Boolean).sort(function (x, y) { return x.pos - y.pos; });
                if (!rows.length) throw new Error("Classement vide");
                return rows;
            });
            return { data: [{ name: "", rows: f.data }], stale: f.stale, fetchedAt: f.fetchedAt };
        } catch (e) {
            return { data: [{ name: "", rows: await fffStandings(force) }], stale: true, fetchedAt: Date.now() };
        }
    }

    function teams(force) {
        return cached("lfp:teams:" + season(), 7 * 86400, force, async function () {
            var o = await lfpGet("championship-clubs?championshipId=" + CHAMP + "&season=" + season());
            var all = o.championshipsClubs || {};
            var list = Object.keys(all).map(function (k) {
                var c = all[k];
                if (!c) return null;
                var chs = c.championships || {};
                function logoOf(key) {
                    var l = chs[key] && chs[key].assets && chs[key].assets.logo;
                    return (l && l.medium) || null;
                }
                var logo = logoOf(String(CHAMP));
                if (!logo) Object.keys(chs).some(function (key) { logo = logoOf(key); return !!logo; });
                return parseTeam(c, c.id, logo);
            }).filter(Boolean).sort(function (x, y) { return x.name.localeCompare(y.name, "fr"); });
            if (!list.length) throw new Error("Liste d'équipes vide");
            return list;
        }).then(function (f) { return f.data; });
    }

    async function team(id, force) {
        var t = (await teams(force)).filter(function (x) { return x.id === id; })[0];
        if (!t) throw new Error("Équipe introuvable");
        return t;
    }

    // Matchs d'une équipe : passés (6 dernières journées) ou à venir (5 prochaines)
    async function schedule(id, fixture, force) {
        var ws = await weeks(false);
        if (!ws.length) return [];
        var cur = currentWeek(ws);
        var from = fixture ? cur : Math.max(1, cur - 6), to = fixture ? cur + 4 : cur, ns = [];
        for (var n = from; n <= to; n++) if (ws.some(function (w) { return w.n === n; })) ns.push(n);
        var list = await manyWeeks(ns, force, ws);
        return list.filter(function (m) { return m.home.id === id || m.away.id === id; });
    }

    // Effectif : joueurs utilisés lors des derniers matchs du club
    function roster(id, force) {
        return cached("lfp:roster:" + id, 6 * 3600, force, async function () {
            var past = (await schedule(id, false, force)).filter(function (m) { return m.state === "POST"; }).slice(-3);
            var details = await Promise.all(past.map(function (m) { return rawDetail(m.id).catch(function () { return null; }); }));
            var seen = {}, out = [];
            details.filter(Boolean).reverse().forEach(function (o) {      // le match le plus récent d'abord
                ["home", "away"].forEach(function (side) {
                    var s = o[side];
                    if (!s || teamId(s.clubId) !== id) return;
                    var ps = s.players || {};
                    Object.keys(ps).forEach(function (k) {
                        var p = ps[k];
                        if (!p || seen[k]) return;
                        seen[k] = true;
                        var idt = p.playerIdentity || {}, pos = posCode(p.position);
                        out.push({
                            id: k, name: fullName(idt), jersey: jerseyOf(p, idt), age: ageOf(idt.birthDate),
                            pos: pos, posGroup: FL.espn.posGroup(pos), injury: null
                        });
                    });
                });
            });
            if (!out.length) throw new Error("Effectif indisponible");
            return out.sort(function (a, b) {
                return a.posGroup - b.posGroup || (parseInt(a.jersey, 10) || 99) - (parseInt(b.jersey, 10) || 99);
            });
        }).then(function (f) { return f.data; });
    }

    // Diagnostic : la LFP répond-elle (sans cache ni secours) ?
    async function ping() {
        var o = await lfpGet("championship-standings/" + CHAMP + "/general?season=" + season());
        var n = Object.keys(o.standings || {}).length;
        if (!n) throw new Error("Réponse vide");
        return n + " équipes";
    }

    // ------------------------------------------------------------ secours : base officielle de la FFF

    var fffNo = null;
    function members(j) {
        if (j && typeof j === "object" && !Array.isArray(j) && j.error) throw new Error("FFF indisponible (" + j.error + ")");
        return Array.isArray(j) ? j : ((j && j["hydra:member"]) || []);
    }

    // Numéro FFF de la Ligue 3 (452039 en 2026-2027), retrouvé chaque saison
    async function fffCompet() {
        if (fffNo) return fffNo;
        if (season() === 2026) return (fffNo = 452039);
        var f = await cached("fff:l3:" + season(), 30 * 86400, false, async function () {
            var arr = members(await getJson(WORKER + "/fff/compets?season=" + season() + "&cp_niv=03&type=CH"));
            var c = arr.filter(function (x) { return String(x.name || "").indexOf("L3") >= 0 || String(x.shortname || "").indexOf("LIGUE 3") >= 0; })[0];
            if (!c || !c.cp_no) throw new Error("Ligue 3 introuvable à la FFF");
            return c.cp_no;
        });
        return (fffNo = f.data);
    }

    function fffTeam(o) {
        var n = String((o && o.short_name) || "");
        var nice = n.toLowerCase().split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
        var cl = (o && o.club) || null;
        return { id: "FFF-" + (cl ? cl.cl_no : ""), name: nice, short: nice, abbr: n.slice(0, 3), logo: (cl && cl.logo) || null, color: null, alt: null };
    }

    async function fffScoreboard(d0, d1, force) {
        var path = (await fffCompet()) + "/phases/1/poules/1/matchs?ma_dat[after]=" + ymd(d0 - DAY) + "&ma_dat[before]=" + ymd(d1);
        var f = await cached("fff:" + path, 120, force, async function () {
            return members(await getJson(WORKER + "/fff/compets/" + path)).map(function (m) {
                var day = parseDate(m.date);
                var hm = String(m.time || "").split(/[Hh]/).map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); });
                var date = FL.startOfDay(day + 12 * 3600 * 1000) + (hm[0] || 0) * 3600 * 1000 + (hm[1] || 0) * 60 * 1000;
                var played = m.home_score !== null && m.home_score !== undefined;
                return {
                    id: "fff-" + m.ma_no, league: SLUG, leagueName: FL.leagueName(SLUG), date: date,
                    state: played ? "POST" : "PRE", clock: "", statusText: played ? "Terminé" : "",
                    home: fffTeam(m.home), away: fffTeam(m.away),
                    homeScore: played ? String(m.home_score) : "", awayScore: played ? String(m.away_score) : "",
                    venue: null, lastScorer: null, details: [], source: "FFF"
                };
            });
        });
        return f.data.filter(function (m) { return m.date >= d0 && m.date < d1; }).sort(function (a, b) { return a.date - b.date; });
    }

    async function fffStandings(force) {
        var path = (await fffCompet()) + "/phases/1/poules/1/classement_journees";
        var f = await cached("fff:" + path, 600, force, async function () {
            return members(await getJson(WORKER + "/fff/compets/" + path)).map(function (r) {
                var t = fffTeam(r.equipe);
                return {
                    pos: r.rank | 0, teamId: t.id, team: t.short, teamName: t.name, abbr: t.abbr, color: null, alt: null, logo: t.logo,
                    played: r.total_games_count | 0, won: r.won_games_count | 0, drawn: r.draw_games_count | 0, lost: r.lost_games_count | 0,
                    gf: r.goals_for_count | 0, ga: r.goals_against_count | 0, diff: r.goals_diff | 0, pts: r.point_count | 0,
                    note: null, noteColor: null
                };
            }).sort(function (x, y) { return x.pos - y.pos; });
        });
        if (!f.data.length) throw new Error("Classement vide");
        return f.data;
    }

    FL.lfp = {
        SLUG: SLUG, season: season, ping: ping,
        isL3Team: function (id) { return String(id || "").indexOf(ID_PREFIX) === 0; },
        scoreboard: scoreboard, summary: summary, standings: standings,
        teams: teams, team: team, roster: roster, schedule: schedule
    };
})();
