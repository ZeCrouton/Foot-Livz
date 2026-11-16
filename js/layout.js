/* En-tête, navigation et pied de page communs à toutes les pages. */
(function () {
    var FL = window.FL = window.FL || {};
    var body = document.body;
    var page = body.getAttribute("data-page") || "home";
    var root = body.getAttribute("data-root") || "";          // "" depuis index.html, "../" depuis screens/
    FL.base = root ? "" : "screens/";                          // préfixe pour atteindre screens/ depuis la page courante
    var home = (root ? "../" : "") + "index.html";

    var TABS = [
        { id: "home", label: "Accueil", href: home },
        { id: "live", label: "Live", href: FL.base + "live.html" },
        { id: "agenda", label: "Agenda", href: FL.base + "agenda.html" },
        { id: "league", label: "Classements", href: FL.base + "league.html" },
        { id: "mercato", label: "Mercato", href: FL.base + "mercato.html" },
        { id: "team", label: "Équipes", href: FL.base + "team.html" },
        { id: "explorer", label: "Explorer", href: FL.base + "explorer.html" },
        { id: "settings", label: "Réglages", href: FL.base + "settings.html" }
    ];

    function render() {
        var club = FL.prefs.club();
        var hasClub = FL.prefs.hasClub();
        var header = document.createElement("header");
        header.className = "site-header";
        header.innerHTML =
            '<div class="site-bar">' +
            '<a class="brand" href="' + home + '"><span class="brand-ball" aria-hidden="true">⚽</span>FootLivz</a>' +
            '<a class="club-pill" href="' + FL.base + 'settings.html" title="Changer de club">' +
            (hasClub ? FL.logo(club.logo) + "<span>" + FL.esc(club.name) + "</span>" : "<span>Choisir mon club</span>") + "</a></div>" +
            '<nav class="tabs" aria-label="Navigation principale">' + TABS.map(function (t) {
                return '<a href="' + t.href + '"' + (t.id === page ? ' class="active" aria-current="page"' : "") + ">" + t.label + "</a>";
            }).join("") + "</nav>";
        body.insertBefore(header, body.firstChild);

        var footer = document.createElement("footer");
        footer.className = "site-footer";
        footer.innerHTML = "<p>FootLivz · Scores et données : ESPN · Actualités : Google Actualités</p>";
        body.appendChild(footer);

        var title = body.getAttribute("data-title");
        var h = document.getElementById("page-title");
        if (h && title) h.textContent = title;
        if (title && page !== "home") document.title = title + " - FootLivz";

        // Fait défiler l'onglet actif dans la zone visible (petits écrans)
        var active = header.querySelector(".tabs a.active");
        if (active && active.scrollIntoView) {
            var nav = header.querySelector(".tabs");
            nav.scrollLeft = Math.max(0, active.offsetLeft - 16);
        }
    }

    render();

    // Anciennes préférences sans couleurs : on les récupère auprès d'ESPN, une seule fois
    (async function () {
        var club = FL.prefs.club();
        if (!FL.prefs.hasClub() || club.color) return;
        try {
            var t = await FL.espn.team(club.league, club.id);
            if (t && t.color) { FL.prefs.updateClub(club.id, { color: t.color, alt: t.alt }); FL.theme.applyFromPrefs(); }
        } catch (e) { /* on garde le thème neutre */ }
    })();
})();
