(async function () {
    var FL = window.FL, app = document.getElementById("app");

    function render() {
        var club = FL.prefs.club();
        var followed = FL.prefs.followed();
        var comps = FL.prefs.competitions();

        app.innerHTML =
            '<h3 class="day-title">Club de cœur</h3><div class="card">' +
            '<div class="list-row"><span class="list-main">' + FL.logo(club.logo) + "<span>" + FL.esc(club.name) + "</span></span></div>" +
            '<label class="field">Changer de club<input type="search" id="club-q" class="search" placeholder="Rechercher une équipe…" autocomplete="off"></label>' +
            '<div id="club-results"></div></div>' +

            '<h3 class="day-title">Équipes suivies</h3><div class="card">' +
            (followed.length ? followed.map(function (t) {
                return '<div class="list-row"><span class="list-main">' + FL.logo(t.logo) + "<span>" + FL.esc(t.name) + "</span></span>" +
                    '<button type="button" class="btn small" data-unfollow="' + FL.esc(t.id) + '">Retirer</button></div>';
            }).join("") : FL.notice("Aucune équipe suivie.")) + "</div>" +

            '<h3 class="day-title">Compétitions dans Live</h3><div class="card checks">' +
            FL.leagues.map(function (l) {
                return '<label><input type="checkbox" value="' + FL.esc(l.slug) + '"' + (comps.indexOf(l.slug) >= 0 ? " checked" : "") + "> " + FL.esc(l.name) + "</label>";
            }).join("") + "</div>" +

            '<p><button type="button" id="reset" class="btn danger">Réinitialiser les réglages</button></p>';

        bind();
    }

    function bind() {
        var q = document.getElementById("club-q");
        q.addEventListener("input", async function () {
            var n = FL.norm(q.value);
            var box = document.getElementById("club-results");
            if (n.length < 2) { box.innerHTML = ""; return; }
            box.innerHTML = '<p class="loading">Recherche…</p>';
            var all;
            try { all = await FL.espn.allTeams(); }
            catch (e) { box.innerHTML = FL.notice("Liste des équipes indisponible.", "error"); return; }
            var hits = all.filter(function (h) { return FL.norm(h.team.name).indexOf(n) >= 0 || FL.norm(h.team.short).indexOf(n) >= 0; }).slice(0, 15);
            box.innerHTML = hits.map(function (h, i) {
                return '<div class="list-row"><span class="list-main">' + FL.logo(h.team.logo) + "<span>" + FL.esc(h.team.name) +
                    "</span><small>" + FL.esc(FL.leagueName(h.league)) + '</small></span><button type="button" class="btn small" data-club="' + i + '">Choisir</button></div>';
            }).join("") || FL.notice("Aucune équipe trouvée.");
            box.querySelectorAll("button[data-club]").forEach(function (b) {
                b.addEventListener("click", function () {
                    var h = hits[+b.getAttribute("data-club")];
                    FL.prefs.setClub({ id: h.team.id, name: h.team.name, league: h.league, national: h.national, logo: h.team.logo });
                    render();
                });
            });
        });

        app.querySelectorAll("button[data-unfollow]").forEach(function (b) {
            b.addEventListener("click", function () { FL.prefs.unfollow(b.getAttribute("data-unfollow")); render(); });
        });

        app.querySelectorAll(".checks input").forEach(function (c) {
            c.addEventListener("change", function () {
                var list = Array.prototype.slice.call(app.querySelectorAll(".checks input:checked")).map(function (x) { return x.value; });
                FL.prefs.setCompetitions(list);
            });
        });

        document.getElementById("reset").addEventListener("click", function () {
            if (confirm("Remettre les réglages par défaut ?")) { FL.prefs.reset(); render(); }
        });
    }

    render();
})();
