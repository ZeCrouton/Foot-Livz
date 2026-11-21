(function () {
    var FL = window.FL, app = document.getElementById("app");
    var topics = FL.news.topics();
    var current = null;
    try { current = sessionStorage.getItem("fl:mercato-topic"); } catch (e) { /* ignore */ }
    if (!topics.some(function (t) { return t.id === current; })) current = topics[0].id;
    var token = 0;

    app.innerHTML = '<div class="chips" id="topics"></div><div id="news"></div>';
    var chipsBox = document.getElementById("topics"), box = document.getElementById("news");

    function chips() {
        chipsBox.innerHTML = topics.map(function (t) { return FL.chip(t.label, t.id, t.id === current, "topic"); }).join("");
    }

    function list(items) {
        return '<div class="card news-list">' + items.map(function (a) {
            return '<a class="news-item" href="' + FL.esc(a.link) + '" target="_blank" rel="noopener noreferrer">' +
                '<span class="news-title">' + FL.esc(a.title) + "</span>" +
                '<span class="news-meta">' + FL.esc(a.source || "") + (a.source && a.date ? " · " : "") + FL.esc(FL.ago(a.date)) + "</span></a>";
        }).join("") + "</div>";
    }

    async function show(force) {
        var my = ++token;
        var topic = topics.find(function (t) { return t.id === current; });
        box.innerHTML = FL.skeleton(6);
        var f = null, fallback = false;
        try {
            f = await FL.news.loadTopic(topic, force);
            // Peu de résultats pour un club : on complète avec les actus mercato générales
            if (topic.id.charAt(0) === "t" || topic.id === "club") {
                if (f.data.length < 3) { f = await FL.news.loadTopic(topics.find(function (t) { return t.id === "une"; }), force); fallback = true; }
            }
        } catch (e) { f = null; }
        if (my !== token) return;

        if (!f) {
            // Dernier recours : actualités ESPN (en anglais)
            try {
                var club = FL.prefs.club();
                var n = await FL.espn.news(club.national ? "fifa.world" : club.league, force);
                if (n.data.length) {
                    box.innerHTML = FL.notice("Les flux mercato en français sont momentanément injoignables. Voici les actualités ESPN (en anglais).", "warn") + list(n.data.slice(0, 20));
                    return;
                }
            } catch (e2) { /* on affiche l'erreur */ }
            box.innerHTML = FL.notice("Impossible de charger les actualités pour le moment.", "error") +
                '<p><button type="button" class="btn" id="retry">Réessayer</button> ' +
                '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + FL.esc(FL.news.searchUrl(topic.query)) + '">Ouvrir sur Google Actualités</a></p>';
            return;
        }
        box.innerHTML = FL.staleBanner(f) +
            (fallback ? FL.notice("Pas d'actualité récente spécifique à « " + topic.label + " » : voici le mercato général.") : "") +
            list(f.data) +
            '<p class="muted small">Sources : Google Actualités' + (f.fm ? " · Foot Mercato" : "") + ' · mis à jour ' + FL.esc(FL.ago(f.fetchedAt)) +
            ' · <button type="button" class="linklike" id="refresh">Actualiser</button></p>';
    }

    app.addEventListener("click", function (e) {
        var c = e.target.closest("button.chip");
        if (c) {
            current = c.getAttribute("data-topic");
            try { sessionStorage.setItem("fl:mercato-topic", current); } catch (x) { /* ignore */ }
            chips(); show(false); return;
        }
        if (e.target.id === "retry" || e.target.id === "refresh") show(true);
    });

    chips();
    show(false);
})();
