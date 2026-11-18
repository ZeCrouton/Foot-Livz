/* En-tête, navigation et pied de page communs à toutes les pages. */
(function () {
    var FL = window.FL = window.FL || {};

    // --- PWA : enregistrement du Service Worker ---
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            var swBase = (document.body.getAttribute("data-root") || "") + "../";
            // depuis index.html : sw.js à la racine ; depuis screens/ : ../sw.js
            var swPath = (document.body.getAttribute("data-root") ? "../" : "") + "sw.js";
            navigator.serviceWorker.register(swPath).catch(function () { /* silencieux */ });
        });
    }

    // --- PWA : capture du prompt d'installation ---
    window._flInstallPrompt = null;

    // Vérifie si déjà installé en PWA standalone
    var isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

    function flInstallClick() {
        if (window._flInstallPrompt) {
            // Chrome a fourni le prompt natif → on l'utilise
            window._flInstallPrompt.prompt();
            window._flInstallPrompt.userChoice.then(function () {
                window._flInstallPrompt = null;
                var btn = document.getElementById("fl-install-btn");
                if (btn) btn.hidden = true;
            });
        } else {
            // Pas de prompt natif (iOS Safari, Firefox…) → guide manuel
            var msg = /iphone|ipad|ipod/i.test(navigator.userAgent)
                ? "Sur Safari iOS :\nAppuyez sur ⬆ Partager → « Sur l'écran d'accueil »"
                : "Dans le menu de votre navigateur :\nchoisissez « Ajouter à l'écran d'accueil » ou « Installer »";
            alert(msg);
        }
    }
    window._flInstallClick = flInstallClick;

    window.addEventListener("beforeinstallprompt", function (e) {
        e.preventDefault();
        window._flInstallPrompt = e;
        var btn = document.getElementById("fl-install-btn");
        if (btn) { btn.hidden = false; btn.title = "Installer l'application"; }
    });
    window.addEventListener("appinstalled", function () {
        window._flInstallPrompt = null;
        var btn = document.getElementById("fl-install-btn");
        if (btn) btn.hidden = true;
    });
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
            '<div class="site-bar-right">' +
            '<button id="fl-install-btn" class="install-btn"' + (isStandalone ? ' hidden' : '') + ' title="Installer l\'application" onclick="window._flInstallClick()">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v13M7 11l5 5 5-5"/><rect x="3" y="18" width="18" height="3" rx="1"/></svg>' +
            '<span>Installer</span></button>' +
            '<a class="club-pill" href="' + FL.base + 'settings.html" title="Changer de club">' +
            (hasClub ? FL.logo(club.logo) + "<span>" + FL.esc(club.name) + "</span>" : "<span>Choisir mon club</span>") + "</a></div></div>" +
            '<nav class="tabs" aria-label="Navigation principale">' + TABS.map(function (t) {
                return '<a href="' + t.href + '"' + (t.id === page ? ' class="active" aria-current="page"' : "") + ">" + t.label + "</a>";
            }).join("") + "</nav>";
        body.insertBefore(header, body.firstChild);

        var footer = document.createElement("footer");
        footer.className = "site-footer";
        footer.innerHTML = "<p>FootLivz · Scores et données : ESPN · Ligue 3 : LFP, FFF · Actualités : Google Actualités</p>";
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
