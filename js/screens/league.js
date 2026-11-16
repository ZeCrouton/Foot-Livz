(async function () {
    var FL = window.FL, app = document.getElementById("app");
    var params = FL.params();
    var slug = params.league || "fra.1";

    var options = FL.groups.map(function (g) {
        var items = FL.leagues.filter(function (l) { return l.group === g; });
        return '<optgroup label="' + FL.esc(g) + '">' + items.map(function (l) {
            return '<option value="' + FL.esc(l.slug) + '"' + (l.slug === slug ? " selected" : "") + ">" + FL.esc(l.name) + "</option>";
        }).join("") + "</optgroup>";
    }).join("");

    app.innerHTML = '<label class="field">Compétition <select id="comp">' + options + '</select></label>' +
        '<div id="content"><p class="loading">Chargement…</p></div>';
    var content = document.getElementById("content");

    document.getElementById("comp").addEventListener("change", function (e) {
        window.location.href = "league.html?league=" + encodeURIComponent(e.target.value);
    });

    async function renderTable() {
        if (!FL.hasTable(slug)) return FL.notice("Pas de classement pour cette compétition.");
        var f = await FL.espn.standings(slug, false);
        if (!f.data.length) return FL.notice("Classement indisponible.");
        return FL.staleBanner(f) + f.data.map(function (g) {
            return (g.name ? '<h3 class="day-title">' + FL.esc(g.name) + "</h3>" : "") +
                '<div class="card table-wrap"><table class="table"><thead><tr>' +
                "<th>#</th><th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead><tbody>" +
                g.rows.map(function (r) {
                    return "<tr><td>" + r.pos + '</td><td class="team-cell"><a href="' + FL.teamUrl(slug, r.teamId) + '">' +
                        FL.logo(r.logo) + FL.esc(r.team) + "</a>" +
                        (r.note ? '<small class="note" style="' + (r.noteColor ? "border-color:#" + FL.esc(r.noteColor) : "") + '">' + FL.esc(r.note) + "</small>" : "") +
                        "</td><td>" + r.played + "</td><td>" + r.won + "</td><td>" + r.drawn + "</td><td>" + r.lost +
                        "</td><td>" + (r.diff > 0 ? "+" : "") + r.diff + "</td><td><strong>" + r.pts + "</strong></td></tr>";
                }).join("") + "</tbody></table></div>";
        }).join("");
    }

    async function renderLeaders() {
        var f = await FL.espn.leaders(slug, false);
        if (!f.data.length) return "";
        return '<h3 class="day-title">Meilleurs joueurs</h3>' + f.data.map(function (c) {
            return '<div class="card"><h4>' + FL.esc(c.category) + "</h4>" + c.leaders.slice(0, 10).map(function (l, i) {
                return '<div class="list-row"><span class="rank">' + (i + 1) + '</span><span class="list-main">' +
                    FL.esc(l.name) + '</span><strong>' + FL.esc(l.value) + "</strong></div>";
            }).join("") + "</div>";
        }).join("");
    }

    try {
        var table = await renderTable();
        content.innerHTML = table;
    } catch (e) {
        content.innerHTML = FL.notice("Classement indisponible. Vérifiez votre connexion.", "error");
    }
    try {
        var leaders = await renderLeaders();
        content.insertAdjacentHTML("beforeend", leaders);
    } catch (e) { /* pas de buteurs pour cette compétition */ }
})();
