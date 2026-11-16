(function () {
    var FL = window.FL, app = document.getElementById("app");

    function render() {
        var club = FL.prefs.club();
        var followed = FL.prefs.followed();
        var comps = FL.prefs.competitions();
        var theme = FL.prefs.theme();
        var fbc = FL.theme.fallbackColors(club) || {};
        var swatch = FL.theme.compute(theme.color || club.color || fbc.color, theme.color ? null : (club.alt || fbc.alt));

        app.innerHTML =
            '<h3 class="day-title">Club de cœur</h3><div class="card pad">' +
            '<div class="list-row"><span class="list-main">' + FL.logo(club.logo) + "<strong>" + FL.esc(FL.prefs.hasClub() ? club.name : "Aucun club choisi") + "</strong></span></div>" +
            '<p class="muted small">Change de club pour adapter les couleurs, l\'agenda et le mercato.</p><div id="picker"></div></div>' +

            '<h3 class="day-title">Couleurs</h3><div class="card pad">' +
            '<label class="switch"><input type="checkbox" id="theme-on"' + (theme.off ? "" : " checked") + "> Utiliser les couleurs de mon club</label>" +
            '<div class="color-row"><span class="swatch" style="background:#' + swatch.primary + '"></span><span class="swatch" style="background:#' + swatch.accent + '"></span>' +
            '<label class="small">Couleur personnalisée <input type="color" id="theme-color" value="#' + swatch.primary + '"></label>' +
            (theme.color ? '<button type="button" class="btn small" id="theme-reset">Couleur du club</button>' : "") + "</div></div>" +

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
        FL.clubPicker(document.getElementById("picker"), function (team) {
            FL.prefs.setClub(team);
            FL.prefs.setTheme({ off: FL.prefs.theme().off, color: "" });   // nouveau club = ses couleurs
            window.location.reload();
        });

        document.getElementById("theme-on").addEventListener("change", function () {
            FL.prefs.setTheme({ off: !this.checked, color: FL.prefs.theme().color });
            FL.theme.applyFromPrefs(); render();
        });
        document.getElementById("theme-color").addEventListener("change", function () {
            FL.prefs.setTheme({ off: false, color: this.value });
            FL.theme.applyFromPrefs(); render();
        });
        var r = document.getElementById("theme-reset");
        if (r) r.addEventListener("click", function () {
            FL.prefs.setTheme({ off: FL.prefs.theme().off, color: "" });
            FL.theme.applyFromPrefs(); render();
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
            if (confirm("Remettre les réglages par défaut ?")) { FL.prefs.reset(); window.location.reload(); }
        });
    }

    render();
})();
