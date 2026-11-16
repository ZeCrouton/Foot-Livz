(async function () {
    var FL = window.FL, app = document.getElementById("app");
    var all = null, loadError = false;

    app.innerHTML =
        '<input type="search" id="q" class="search" placeholder="Rechercher une équipe (ex. PSG, Lyon, Real…)" autocomplete="off">' +
        '<div id="results"></div>';
    var input = document.getElementById("q"), results = document.getElementById("results");

    async function ensureTeams() {
        if (all || loadError) return;
        results.innerHTML = '<p class="loading">Chargement des équipes…</p>';
        try { all = await FL.espn.allTeams(); }
        catch (e) { loadError = true; }
    }

    function search(q) {
        var n = FL.norm(q);
        if (n.length < 2) return [];
        return all.filter(function (h) {
            var name = FL.norm(h.team.name), short = FL.norm(h.team.short), abbr = FL.norm(h.team.abbr);
            return name.indexOf(n) >= 0 || short.indexOf(n) >= 0 || abbr === n ||
                (n === "om" && h.team.id === "176") || (n === "psg" && name.indexOf("paris saint") >= 0);
        }).sort(function (a, b) {
            return (FL.norm(a.team.short).indexOf(n) === 0 ? 0 : 1) - (FL.norm(b.team.short).indexOf(n) === 0 ? 0 : 1);
        }).slice(0, 30);
    }

    async function update() {
        var q = input.value;
        if (FL.norm(q).length < 2) { results.innerHTML = ""; return; }
        await ensureTeams();
        if (loadError) { results.innerHTML = FL.notice("Liste des équipes indisponible. Vérifiez votre connexion.", "error"); return; }
        var hits = search(q);
        if (!hits.length) { results.innerHTML = FL.notice("Aucune équipe trouvée."); return; }
        results.innerHTML = '<div class="card">' + hits.map(function (h) {
            return '<div class="list-row"><a href="' + FL.teamUrl(h.league, h.team.id) + '" class="list-main">' +
                FL.logo(h.team.logo) + "<span>" + FL.esc(h.team.name) + '</span><small>' + FL.esc(FL.leagueName(h.league)) +
                "</small></a></div>";
        }).join("") + "</div>";
    }

    input.addEventListener("input", update);
    results.innerHTML = FL.notice("Tapez au moins deux lettres pour chercher une équipe, toutes compétitions confondues.");
})();
