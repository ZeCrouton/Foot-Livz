(function () {
    var FL = window.FL = window.FL || {};
    var HOSTS = ["https://site.api.espn.com", "https://site.web.api.espn.com"];
    var CACHE_PREFIX = "fl:c:";

    // ------------------------------------------------------------ cache & réseau

    function cacheRead(key) {
        try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key)); } catch (e) { return null; }
    }
    function cacheWrite(key, value) {
        try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* quota */ }
    }

    async function fetchAny(path) {
        var last = null;
        for (var i = 0; i < HOSTS.length; i++) {
            try {
                var r = await fetch(HOSTS[i] + path, { headers: { Accept: "application/json" } });
                if (!r.ok) {
                    var err = new Error("HTTP " + r.status);
                    err.status = r.status;
                    throw err;
                }
                return await r.json();
            } catch (e) {
                last = e;
                if (e.status === 400 || e.status === 404) break; // inutile d'insister
            }
        }
        throw last || new Error("ESPN injoignable");
    }

    // Renvoie la donnée fraîche, ou la dernière version connue (stale = true)
    async function get(path, maxAgeSec, force) {
        var c = cacheRead(path);
        if (!force && c && (Date.now() - c.t) / 1000 <= maxAgeSec) {
            return { data: c.v, stale: false, fetchedAt: c.t };
        }
        try {
            var v = await fetchAny(path);
            cacheWrite(path, v);
            return { data: v, stale: false, fetchedAt: Date.now() };
        } catch (e) {
            if (c) return { data: c.v, stale: true, fetchedAt: c.t };
            throw e;
        }
    }

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function dayKey(ms) {
        var d = new Date(ms);
        return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    }

    // ------------------------------------------------------------ parsing

    function parseDate(s) {
        if (!s) return 0;
        var t = Date.parse(s);
        return isNaN(t) ? 0 : t;
    }

    function parseTeam(t) {
        t = t || {};
        var logo = t.logo || (t.logos && t.logos[0] && t.logos[0].href) || null;
        return {
            id: String(t.id || ""),
            name: t.displayName || t.name || "",
            short: t.shortDisplayName || t.displayName || t.name || "",
            abbr: t.abbreviation || "",
            logo: logo,
            color: t.color || null
        };
    }

    function scoreOf(c) {
        var s = c.score;
        if (s === undefined || s === null) return "";
        if (typeof s === "object") {
            if (s.displayValue) return String(s.displayValue);
            return isNaN(s.value) ? "" : String(Math.trunc(s.value));
        }
        return String(s);
    }

    function stateOf(status) {
        var type = (status && status.type) || {};
        var st = type.state || "";
        var name = type.name || "";
        var detail = ((type.shortDetail || "") + " " + (type.detail || "")).toLowerCase();
        var clock = (status && status.displayClock) || "";
        if (name.indexOf("POSTPONED") >= 0) return { state: "OTHER", clock: "", text: "Reporté" };
        if (name.indexOf("CANCEL") >= 0) return { state: "OTHER", clock: "", text: "Annulé" };
        if (name.indexOf("ABANDONED") >= 0) return { state: "OTHER", clock: "", text: "Arrêté" };
        if (name.indexOf("SUSPENDED") >= 0 || name.indexOf("DELAYED") >= 0) return { state: "LIVE", clock: clock, text: "Interrompu" };
        if (st === "in") {
            if (name.indexOf("HALFTIME") >= 0) return { state: "LIVE", clock: "MT", text: "Mi-temps" };
            if (name.indexOf("SHOOTOUT") >= 0 || detail.indexOf("pen") >= 0) return { state: "LIVE", clock: "TAB", text: "Tirs au but" };
            if (name.indexOf("END_OF_REGULATION") >= 0 || name.indexOf("END_OF_EXTRATIME") >= 0) return { state: "LIVE", clock: clock, text: "Pause" };
            return { state: "LIVE", clock: clock, text: clock };
        }
        if (st === "post") {
            var s = "Terminé";
            if (detail.indexOf("pen") >= 0) s = "Terminé (t.a.b.)";
            else if (detail.indexOf("aet") >= 0 || detail.indexOf("extra") >= 0) s = "Terminé (a.p.)";
            return { state: "POST", clock: "", text: s };
        }
        if (st === "pre") return { state: "PRE", clock: "", text: "" };
        return { state: "OTHER", clock: "", text: type.description || "" };
    }

    function evType(raw) {
        var r = (raw || "").toLowerCase();
        if (r.indexOf("own goal") >= 0) return "OWN_GOAL";
        if (r.indexOf("penalty") >= 0 && (r.indexOf("scored") >= 0 || r.indexOf("goal") >= 0)) return "PENALTY_GOAL";
        if (r.indexOf("goal") === 0 || r === "goal" || (r.indexOf("goal") >= 0 && r.indexOf("kick") < 0 && r.indexOf("disallowed") < 0)) return "GOAL";
        if (/\bred\b/.test(r) || r.indexOf("second yellow") >= 0) return "RED";
        if (r.indexOf("yellow") >= 0) return "YELLOW";
        if (r.indexOf("substitution") >= 0) return "SUB";
        if (/half|kickoff|end|start/.test(r)) return "PERIOD";
        return "OTHER";
    }

    function parseCompetition(id, comp, dateStr, evStatus, league, leagueName) {
        var cs = comp.competitors || [];
        var home = null, away = null;
        cs.forEach(function (c) { if (c.homeAway === "home") home = c; else away = c; });
        if (!home || !away) return null;
        var st = stateOf(comp.status || evStatus);
        var details = (comp.details || []).map(function (x) {
            var raw = (x.type && x.type.text) || "";
            var type = x.ownGoal ? "OWN_GOAL"
                : (x.scoringPlay && x.penaltyKick) ? "PENALTY_GOAL"
                : x.scoringPlay ? "GOAL"
                : x.redCard ? "RED"
                : x.yellowCard ? "YELLOW"
                : evType(raw);
            return {
                minute: (x.clock && x.clock.displayValue) || "",
                type: type,
                rawType: raw,
                teamId: (x.team && x.team.id) ? String(x.team.id) : null,
                players: (x.athletesInvolved || []).map(function (a) { return a.displayName; }).filter(Boolean)
            };
        });
        var goals = details.filter(function (d) { return d.type === "GOAL" || d.type === "PENALTY_GOAL" || d.type === "OWN_GOAL"; });
        var lastGoal = goals[goals.length - 1];
        var lastScorer = lastGoal ? [lastGoal.players[0], lastGoal.minute].filter(Boolean).join(" ") : null;
        return {
            id: String(id),
            league: league,
            leagueName: leagueName,
            date: parseDate((comp.date) || dateStr),
            state: st.state,
            clock: st.clock,
            statusText: st.text,
            home: parseTeam(home.team),
            away: parseTeam(away.team),
            homeScore: scoreOf(home),
            awayScore: scoreOf(away),
            venue: (comp.venue && comp.venue.fullName) || null,
            lastScorer: lastScorer,
            details: details
        };
    }

    function parseEvent(e, league, leagueName) {
        var comp = e.competitions && e.competitions[0];
        if (!comp) return null;
        return parseCompetition(e.id, comp, e.date, e.status, league, leagueName);
    }

    function posGroup(p) {
        var u = (p || "").toUpperCase();
        var c = u.charAt(0);
        if (c === "G") return 0;
        if (c === "D") return 1;
        if (c === "M") return 2;
        if (c === "F" || c === "A" || c === "S") return 3;
        if (u.indexOf("CB") >= 0 || u.indexOf("B") >= 0) return 1;
        if (u.indexOf("W") >= 0) return 3;
        return 2;
    }
    var POS_LABELS = ["Gardiens", "Défenseurs", "Milieux", "Attaquants"];

    function translateInjury(s) {
        var l = (s || "").toLowerCase();
        if (l === "out") return "Absent";
        if (l === "day-to-day" || l === "questionable") return "Incertain";
        if (l === "suspension" || l === "suspended") return "Suspendu";
        return s;
    }

    function translateNote(n) {
        var l = n.toLowerCase();
        if (l.indexOf("champions league") >= 0 && l.indexOf("qualif") >= 0) return "Qualifs Ligue des champions";
        if (l.indexOf("champions league") >= 0) return "Ligue des champions";
        if (l.indexOf("conference") >= 0) return "Ligue Conférence";
        if (l.indexOf("europa") >= 0 && l.indexOf("qualif") >= 0) return "Qualifs Ligue Europa";
        if (l.indexOf("europa") >= 0) return "Ligue Europa";
        if (l.indexOf("relegation") >= 0 && l.indexOf("playoff") >= 0) return "Barrage de relégation";
        if (l.indexOf("relegation") >= 0) return "Relégation";
        if (l.indexOf("promotion") >= 0 && l.indexOf("playoff") >= 0) return "Barrage de promotion";
        if (l.indexOf("promotion") >= 0) return "Promotion";
        if (l.indexOf("knockout") >= 0 || l.indexOf("round of 16") >= 0) return "Huitièmes de finale";
        if (l.indexOf("playoff") >= 0) return "Barrages";
        if (l.indexOf("eliminated") >= 0) return "Éliminé";
        return n;
    }

    function parseEntries(entries) {
        var rows = entries.map(function (e, i) {
            var t = parseTeam(e.team);
            var st = {};
            (e.stats || []).forEach(function (s) {
                if (typeof s.value === "number") st[s.name] = s.value;
            });
            function g(n) { return st[n] !== undefined ? Math.trunc(st[n]) : 0; }
            var note = e.note || null;
            var pos = g("rank") > 0 ? g("rank") : i + 1;
            return {
                pos: pos,
                teamId: t.id,
                team: t.short,
                logo: t.logo,
                played: g("gamesPlayed"),
                won: g("wins"),
                drawn: g("ties"),
                lost: g("losses"),
                gf: g("pointsFor"),
                ga: g("pointsAgainst"),
                diff: st.pointDifferential !== undefined ? Math.trunc(st.pointDifferential) : g("pointsFor") - g("pointsAgainst"),
                pts: g("points"),
                note: note && note.description ? translateNote(note.description) : null,
                noteColor: note && note.color ? note.color : null
            };
        });
        return rows.sort(function (a, b) { return a.pos - b.pos; });
    }

    function parseStandings(o) {
        var groups = [];
        if (o.children && o.children.length) {
            o.children.forEach(function (ch) {
                var entries = ch.standings && ch.standings.entries;
                if (!entries) return;
                var name = (ch.name || "").replace("Group", "Groupe").replace("League Phase", "Phase de ligue");
                groups.push({ name: name, rows: parseEntries(entries) });
            });
        } else if (o.standings && o.standings.entries) {
            groups.push({ name: "", rows: parseEntries(o.standings.entries) });
        }
        return groups;
    }

    function parseRoster(arr) {
        var flat = [];
        arr.forEach(function (o) {
            if (o.items) o.items.forEach(function (x) { flat.push(x); });
            else flat.push(o);
        });
        return flat.map(function (a) {
            var posAbbr = (a.position && a.position.abbreviation) || "";
            var inj = a.injuries && a.injuries.length ? (a.injuries[0].status || "Blessé") : null;
            return {
                id: String(a.id || ""),
                name: a.displayName || "",
                jersey: a.jersey || "",
                age: a.age !== undefined ? a.age : null,
                pos: posAbbr,
                posGroup: posGroup(posAbbr),
                injury: inj ? translateInjury(inj) : null
            };
        }).sort(function (a, b) {
            if (a.posGroup !== b.posGroup) return a.posGroup - b.posGroup;
            return (parseInt(a.jersey, 10) || 99) - (parseInt(b.jersey, 10) || 99);
        });
    }

    function parseSummary(o, league, id) {
        var header = o.header || {};
        var comp = header.competitions && header.competitions[0];
        var match = comp ? parseCompetition(header.id || id, comp, comp.date, comp.status, league, FL.leagueName(league)) : null;
        if (!match) return null;

        var events = (o.keyEvents || []).map(function (k) {
            var raw = (k.type && k.type.text) || "";
            return {
                minute: (k.clock && k.clock.displayValue) || "",
                type: evType(raw),
                rawType: raw,
                text: k.text || "",
                teamId: (k.team && k.team.id) ? String(k.team.id) : null,
                players: (k.participants || []).map(function (p) { return p.athlete && p.athlete.displayName; }).filter(Boolean)
            };
        });

        var lineups = (o.rosters || []).map(function (r) {
            return {
                teamId: String((r.team && r.team.id) || ""),
                formation: r.formation || null,
                players: (r.roster || []).map(function (p) {
                    var ath = p.athlete || {};
                    var stats = {};
                    (p.stats || []).forEach(function (s) {
                        var k = s.abbreviation || s.name;
                        if (typeof s.value === "number") stats[k] = s.value;
                    });
                    return {
                        id: String(ath.id || ""),
                        name: ath.displayName || "",
                        shortName: ath.shortName || ath.displayName || "",
                        jersey: p.jersey || ath.jersey || "",
                        pos: (p.position && p.position.abbreviation) || "",
                        starter: !!p.starter,
                        subIn: subFlag(p, "subbedIn"),
                        subOut: subFlag(p, "subbedOut")
                    };
                })
            };
        });

        var teamStats = {};
        var order = [];
        ((o.boxscore && o.boxscore.teams) || []).forEach(function (t) {
            var tid = String((t.team && t.team.id) || "");
            var m = {};
            (t.statistics || []).forEach(function (s) {
                m[s.name] = s.displayValue;
                if (order.indexOf(s.name) < 0) order.push(s.name);
            });
            teamStats[tid] = m;
        });

        return { match: match, events: events, lineups: lineups, teamStats: teamStats, statOrder: order };
    }

    function subFlag(p, key) {
        var v = p[key];
        if (v === undefined || v === null) return false;
        if (typeof v === "boolean") return v;
        if (typeof v === "object") return !!v.didSub;
        return String(v) === "true";
    }

    function parseLeaders(stats) {
        var out = [];
        (stats || []).forEach(function (s) {
            var n = ((s.name || "") + " " + (s.displayName || "")).toLowerCase();
            var cat = n.indexOf("goal") >= 0 ? "Buteurs" : n.indexOf("assist") >= 0 ? "Passeurs" : null;
            if (!cat || !s.leaders) return;
            var list = s.leaders.slice(0, 15).map(function (o) {
                var ath = o.athlete || {};
                var team = (ath.team && ath.team.displayName) || (o.team && o.team.displayName) || "";
                var nm = ath.displayName || "";
                return { category: cat, name: team ? nm + " · " + team : nm, value: String(Math.trunc(o.value || 0)) };
            });
            out.push({ category: cat, leaders: list });
        });
        return out;
    }

    // ------------------------------------------------------------ API publique

    function sortByDate(list) { return list.sort(function (a, b) { return a.date - b.date; }); }

    FL.espn = {
        dayKey: dayKey,
        posGroup: posGroup,
        posLabel: function (g) { return POS_LABELS[g] || POS_LABELS[3]; },

        scoreboard: async function (league, dayMs, force) {
            var key = dayKey(dayMs), today = dayKey(Date.now());
            var maxAge = key === today ? 25 : (key < today ? 6 * 3600 : 1800);
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/scoreboard?dates=" + key, maxAge, force);
            var events = f.data.events || [];
            var list = events.map(function (e) { return parseEvent(e, league, FL.leagueName(league)); }).filter(Boolean);
            return { data: sortByDate(list), stale: f.stale, fetchedAt: f.fetchedAt };
        },

        summary: async function (league, id, force) {
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/summary?event=" + encodeURIComponent(id), 20, force);
            var d = parseSummary(f.data, league, id);
            if (!d) throw new Error("Match introuvable");
            return { data: d, stale: f.stale, fetchedAt: f.fetchedAt };
        },

        standings: async function (league, force) {
            var f = await get("/apis/v2/sports/soccer/" + league + "/standings", 600, force);
            return { data: parseStandings(f.data), stale: f.stale, fetchedAt: f.fetchedAt };
        },

        leaders: async function (league, force) {
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/statistics", 3 * 3600, force);
            return { data: parseLeaders(f.data.stats), stale: f.stale, fetchedAt: f.fetchedAt };
        },

        teams: async function (league, force) {
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/teams", 7 * 86400, force);
            var out = [];
            (f.data.sports || []).forEach(function (s) {
                (s.leagues || []).forEach(function (lg) {
                    (lg.teams || []).forEach(function (x) { if (x.team) out.push(parseTeam(x.team)); });
                });
            });
            return out;
        },

        // Toutes les équipes (clubs + sélections), mises en cache une semaine
        allTeams: async function () {
            var cacheKey = "allteams-v1";
            var c = cacheRead(cacheKey);
            if (c && Date.now() - c.t < 7 * 86400 * 1000) return c.v;
            var comps = FL.leagues.filter(function (l) { return l.slug !== "fifa.friendly" && l.slug !== "fra.coupe_de_france"; });
            var res = await Promise.allSettled(comps.map(function (lg) {
                return FL.espn.teams(lg.slug).then(function (teams) {
                    return teams.map(function (t) { return { team: t, league: lg.slug, national: !!lg.national }; });
                });
            }));
            var all = [];
            res.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
            // une équipe = sa ligue nationale en priorité (pas la coupe d'Europe)
            all.sort(function (a, b) {
                var pa = /^(uefa|fifa)\./.test(a.league) ? 1 : 0, pb = /^(uefa|fifa)\./.test(b.league) ? 1 : 0;
                return pa - pb;
            });
            var seen = {};
            all = all.filter(function (h) {
                var k = h.team.id + (h.national ? "n" : "c");
                if (seen[k]) return false;
                seen[k] = true;
                return true;
            });
            if (all.length > 50) cacheWrite(cacheKey, all);
            return all;
        },

        roster: async function (league, teamId, force) {
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/teams/" + teamId + "/roster", 12 * 3600, force);
            return parseRoster(f.data.athletes || []);
        },

        schedule: async function (league, teamId, fixture, force) {
            var q = fixture ? "?fixture=true" : "";
            var f = await get("/apis/site/v2/sports/soccer/" + league + "/teams/" + teamId + "/schedule" + q,
                fixture ? 3 * 3600 : 1800, force);
            var events = f.data.events || [];
            return events.map(function (e) {
                var lg = e.league || {};
                var slug = lg.slug || league;
                var known = FL.leagues.some(function (x) { return x.slug === slug; });
                return parseEvent(e, slug, known ? FL.leagueName(slug) : (lg.name || slug));
            }).filter(Boolean);
        },

        // Matchs à venir (et récents) d'une équipe, toutes compétitions
        teamFixtures: async function (team, force) {
            var res = await Promise.allSettled(FL.searchLeaguesFor(team).map(function (lg) {
                return FL.espn.schedule(lg, team.id, true, force);
            }));
            var seen = {}, out = [];
            res.forEach(function (r) {
                if (r.status !== "fulfilled") return;
                r.value.forEach(function (m) {
                    if (!seen[m.id]) { seen[m.id] = true; out.push(m); }
                });
            });
            return sortByDate(out);
        }
    };
})();
