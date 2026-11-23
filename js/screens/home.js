(function () {
    var FL = window.FL, app = document.getElementById("app");
    var hasClub = FL.prefs.hasClub();
    var club = FL.prefs.club();
    var hasTable = FL.hasTable(club.league) && !club.national;
    var S = FL.base;                                           // "screens/"

    function block(id, title, more) {
        return '<section class="block" id="' + id + '"><div class="block-head"><h2>' + title + "</h2>" +
            (more ? '<a class="more" href="' + more.href + '">' + more.label + "</a>" : "") +
            '</div><div class="block-body">' + FL.skeleton(3) + "</div></section>";
    }
    function fill(id, html) {
        var el = document.querySelector("#" + id + " .block-body");
        if (el) el.innerHTML = html;
    }

    // ---------------------------------------------------------------- structure
    var hero = hasClub
        ? '<div class="hero" id="hero"><a class="hero-top" href="' + FL.teamUrl(club.league, club.id) + '" title="Fiche du club">' + FL.logo(club.logo).replace('class="logo"', 'class="logo hero-logo"') +
          '<div><h1>' + FL.esc(club.name) + '</h1><p class="hero-sub" id="hero-sub">' + FL.esc(FL.leagueName(club.league)) +
          '</p><div class="form" id="form"></div></div></a><div id="hero-next" class="hero-next"></div></div>'
        : '<div class="hero onboarding" id="hero"><h1>Bienvenue sur FootLivz</h1>' +
          '<p class="hero-sub">Choisis ton club de cœur : l\'application prendra ses couleurs et suivra ses matchs.</p>' +
          '<div id="picker" class="picker"></div></div>';

    app.innerHTML = hero +
        '<div class="home-grid"><div class="col-main">' +
        block("s-live", "En direct", { href: S + "live.html", label: "Tout voir" }) +
        block("s-agenda", "Prochains matchs", { href: S + "agenda.html", label: "Agenda" }) +
        (hasClub ? block("s-results", "Derniers résultats", { href: S + "team.html?league=" + encodeURIComponent(club.league) + "&id=" + encodeURIComponent(club.id), label: "Fiche du club" }) : "") +
        block("s-news", "Mercato", { href: S + "mercato.html", label: "Toute l'actu" }) +
        '</div><aside class="col-side">' +
        (hasTable ? block("s-table", "Classement · " + FL.esc(FL.leagueName(club.league)), { href: S + "league.html?league=" + encodeURIComponent(club.league), label: "Complet" }) : "") +
        block("s-teams", "Mes équipes", { href: S + "explorer.html", label: "Ajouter" }) +
        "</aside></div>";

    if (!hasClub) {
        FL.clubPicker(document.getElementById("picker"), function (team) {
            FL.prefs.setClub(team);
            FL.theme.applyFromPrefs();
            window.location.reload();
        });
    }

    // ---------------------------------------------------------------- En direct / aujourd'hui
    var hasLive = false;
    async function loadLive(force) {
        try {
            var d = await FL.espn.dayMatches(FL.startOfDay(Date.now()) + 12 * 3600 * 1000, force);
            var live = d.matches.filter(function (m) { return m.state === "LIVE"; });
            hasLive = live.length > 0;
            var h = document.querySelector("#s-live h2");
            if (live.length) {
                h.innerHTML = '<span class="live-dot"></span>En direct';
                fill("s-live", '<div class="card flush">' + live.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>");
            } else {
                h.textContent = "Aujourd'hui";
                var today = d.matches.slice().sort(function (a, b) { return a.date - b.date; }).slice(0, 8);
                fill("s-live", today.length
                    ? '<div class="card flush">' + today.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>"
                    : FL.notice("Aucun match aujourd'hui dans tes compétitions."));
            }
        } catch (e) {
            fill("s-live", FL.notice("Impossible de charger les matchs. Vérifiez votre connexion.", "error"));
        }
    }
    loadLive(false);
    // Pendant un match (et une dernière fois à la fin), tout l'accueil se met à jour tout seul.
    var wasLive = false;
    FL.every(30000, async function () {
        if (document.hidden) return;
        var before = hasLive;
        await loadLive(hasLive);
        if (hasLive || before || wasLive) {
            loadAgenda(true); loadResults(true); loadTable(hasLive);
        }
        wasLive = hasLive;
    });

    // ---------------------------------------------------------------- Agenda (toutes mes équipes)
    async function loadAgenda(force) {
        var teams = FL.prefs.teams();
        var res = await Promise.allSettled(teams.map(function (t) { return FL.espn.teamFixtures(t, force); }));
        if (res.every(function (r) { return r.status === "rejected"; })) {
            fill("s-agenda", FL.notice("Impossible de charger l'agenda.", "error"));
            return;
        }
        var now = Date.now(), all = [];
        res.forEach(function (r) { if (r.status === "fulfilled") all = all.concat(r.value); });
        var up = FL.uniqueMatches(all).filter(function (m) { return m.state !== "POST" && m.date > now - 3 * 3600 * 1000; })
            .sort(function (a, b) { return a.date - b.date; });

        fill("s-agenda", up.length
            ? FL.groupByDay(up.slice(0, 6)).map(function (g) {
                return '<h3 class="day-title">' + FL.esc(FL.fmtDay(g.day)) + '</h3><div class="card flush">' +
                    g.matches.map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>";
            }).join("")
            : FL.notice("Aucun match programmé pour tes équipes."));

        // Prochain match du club dans l'en-tête
        if (hasClub) {
            var mine = up.filter(function (m) { return m.home.id === club.id || m.away.id === club.id; })[0];
            var box = document.getElementById("hero-next");
            if (box && mine) {
                var live = mine.state === "LIVE";
                box.innerHTML = '<a class="next-card" href="' + FL.matchUrl(mine) + '">' +
                    '<span class="next-label">' + (live ? '<span class="live-dot"></span>En direct' : "Prochain match") + " · " + FL.esc(mine.leagueName) + "</span>" +
                    '<span class="next-teams"><span>' + FL.logo(mine.home.logo) + "<b>" + FL.esc(mine.home.short) + "</b></span>" +
                    '<strong class="next-score">' + (live ? FL.esc(mine.homeScore) + " – " + FL.esc(mine.awayScore) : "vs") + "</strong>" +
                    "<span><b>" + FL.esc(mine.away.short) + "</b>" + FL.logo(mine.away.logo) + "</span></span>" +
                    '<span class="next-when">' + (live ? FL.esc(mine.clock || "") : FL.esc(FL.fmtWhen(mine.date)) + (FL.countdown(mine.date) ? " · " + FL.countdown(mine.date) : "")) +
                    (mine.venue ? " · " + FL.esc(mine.venue) : "") + "</span></a>";
            } else if (box) {
                box.innerHTML = '<p class="next-empty">Aucun match programmé pour le moment.</p>';
            }
        }
    }
    loadAgenda(false);

    // ---------------------------------------------------------------- Résultats + forme du club
    async function loadResults(force) {
        if (!hasClub) return;
        {
            try {
                var past = await FL.espn.schedule(club.league, club.id, false, force);
                var done = past.filter(function (m) { return m.state === "POST"; }).sort(function (a, b) { return a.date - b.date; });
                var last = done.slice(-5);
                document.getElementById("form").innerHTML = last.map(function (m) {
                    var o = FL.outcome(m, club.id);
                    return o ? '<span class="pill pill-' + o.toLowerCase() + '" title="' + FL.esc(m.home.short + " " + m.homeScore + "-" + m.awayScore + " " + m.away.short) + '">' + o + "</span>" : "";
                }).join("");
                fill("s-results", last.length
                    ? '<div class="card flush">' + last.slice().reverse().map(function (m) { return FL.matchRow(m, { showLeague: true }); }).join("") + "</div>"
                    : FL.notice("Pas encore de résultat."));
            } catch (e) {
                fill("s-results", FL.notice("Résultats indisponibles.", "error"));
            }
        }
    }
    loadResults(false);

    // ---------------------------------------------------------------- Classement
    async function loadTable(force) {
        if (!hasTable) return;
        {
            try {
                var f = await FL.espn.standings(club.league, force);
                var group = f.data.filter(function (g) { return g.rows.some(function (r) { return r.teamId === club.id; }); })[0] || f.data[0];
                if (!group) { fill("s-table", FL.notice("Classement indisponible.")); return; }
                var idx = group.rows.findIndex(function (r) { return r.teamId === club.id; });
                var start = Math.max(0, Math.min(idx < 0 ? 0 : idx - 3, group.rows.length - 7));
                var rows = group.rows.slice(start, start + 7);
                var me = group.rows[idx];
                if (me) {
                    var sub = document.getElementById("hero-sub");
                    if (sub) sub.textContent = FL.leagueName(club.league) + " · " + me.pos + (me.pos === 1 ? "er" : "e") + " · " + me.pts + " pts";
                }
                fill("s-table", '<div class="card flush table-wrap"><table class="table compact"><thead><tr><th>#</th><th>Équipe</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead><tbody>' +
                    rows.map(function (r) {
                        return '<tr class="' + (r.teamId === club.id ? "me" : "") + '"><td>' + r.pos + '</td><td class="team-cell"><a href="' + FL.teamUrl(club.league, r.teamId) + '">' +
                            FL.logo(r.logo) + FL.esc(r.team) + "</a></td><td>" + r.played + "</td><td>" + (r.diff > 0 ? "+" : "") + r.diff +
                            "</td><td><strong>" + r.pts + "</strong></td></tr>";
                    }).join("") + "</tbody></table></div>");
            } catch (e) {
                fill("s-table", FL.notice("Classement indisponible.", "error"));
            }
        }
    }
    loadTable(false);

    // ---------------------------------------------------------------- Mercato
    (async function () {
        var topics = FL.news.topics();
        try {
            var f = await FL.news.loadTopic(topics[0], false);
            if (f.data.length < 3) f = await FL.news.loadTopic(topics.find(function (t) { return t.id === "une"; }), false);
            fill("s-news", '<div class="card flush news-list">' + f.data.slice(0, 5).map(function (a) {
                return '<a class="news-item" href="' + FL.esc(a.link) + '" target="_blank" rel="noopener noreferrer"><span class="news-title">' + FL.esc(a.title) +
                    '</span><span class="news-meta">' + FL.esc(a.source || "") + (a.source && a.date ? " · " : "") + FL.esc(FL.ago(a.date)) + "</span></a>";
            }).join("") + "</div>");
        } catch (e) {
            fill("s-news", FL.notice("Actualités indisponibles pour le moment.", "warn") + '<p><a class="btn small" href="' + S + 'mercato.html">Ouvrir le mercato</a></p>');
        }
    })();

    // ---------------------------------------------------------------- Mes équipes
    (function () {
        var list = hasClub ? FL.prefs.teams() : FL.prefs.followed();
        fill("s-teams", list.length
            ? '<div class="team-grid">' + list.map(function (t) {
                return '<a class="team-tile" href="' + FL.teamUrl(t.league, t.id) + '">' + FL.logo(t.logo) + "<span>" + FL.esc(t.name) + "</span></a>";
            }).join("") + "</div>"
            : FL.notice("Aucune équipe suivie. Cherche une équipe dans Explorer."));
    })();
})();
