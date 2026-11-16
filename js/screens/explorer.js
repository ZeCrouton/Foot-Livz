(function () {
    var FL = window.FL, app = document.getElementById("app");

    app.innerHTML =
        '<input type="search" id="q" class="search" placeholder="Rechercher une équipe ou une compétition (ex. PSG, Lyon, Ligue 1…)" autocomplete="off" autofocus>' +
        '<div id="status"></div><div id="results"></div>';
    var input = document.getElementById("q"), results = document.getElementById("results"), status = document.getElementById("status");

    function renderStatus() {
        var st = FL.teamIndex.state;
        if (st.loading && st.total > 1) {
            status.innerHTML = '<p class="muted small">Chargement des équipes… ' + st.done + "/" + st.total + " compétitions</p>";
        } else if (!st.loading && !FL.teamIndex.all().length) {
            status.innerHTML = FL.notice("Impossible de charger la liste des équipes. Vérifiez votre connexion.", "error") +
                '<p><button type="button" class="btn" id="retry">Réessayer</button></p>';
        } else if (!st.loading && st.failed.length) {
            status.innerHTML = '<p class="muted small">' + st.failed.length + " compétition(s) n'ont pas pu être chargées. " +
                '<button type="button" class="btn small" id="retry">Réessayer</button></p>';
        } else {
            status.innerHTML = "";
        }
    }

    function render() {
        renderStatus();
        var q = input.value;
        if (FL.norm(q).length < 2) {
            results.innerHTML = FL.notice("Tapez au moins deux lettres : équipe, club, sélection ou compétition.");
            return;
        }
        var teams = FL.teamIndex.search(q), comps = FL.teamIndex.searchLeagues(q);
        var html = "";
        if (comps.length) {
            html += '<h3 class="day-title">Compétitions</h3><div class="card">' + comps.map(function (l) {
                return '<div class="list-row"><a href="league.html?league=' + encodeURIComponent(l.slug) + '" class="list-main"><span class="logo logo-empty">🏆</span><span>' +
                    FL.esc(l.name) + "</span><small>" + FL.esc(l.group) + "</small></a></div>";
            }).join("") + "</div>";
        }
        if (teams.length) {
            html += '<h3 class="day-title">Équipes</h3><div class="card">' + teams.map(function (h) {
                return '<div class="list-row"><a href="' + FL.teamUrl(h.league, h.team.id) + '" class="list-main">' +
                    FL.logo(h.team.logo) + "<span>" + FL.esc(h.team.name) + "</span><small>" + FL.esc(FL.leagueName(h.league)) + "</small></a></div>";
            }).join("") + "</div>";
        }
        if (!html) html = FL.teamIndex.state.loading ? '<p class="loading">Recherche en cours…</p>' : FL.notice("Aucun résultat pour « " + q + " ».");
        results.innerHTML = html;
    }

    input.addEventListener("input", render);
    app.addEventListener("click", function (e) {
        if (e.target.id === "retry") FL.teamIndex.retry();
    });
    FL.teamIndex.onChange(render);
    FL.teamIndex.load();
    render();
})();
