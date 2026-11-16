(function () {
    var FL = window.FL = window.FL || {};

    // Compétitions ESPN (la Ligue 3 / LFP n'est pas portée sur le web)
    FL.leagues = [
        { slug: "fra.1", name: "Ligue 1", group: "France" },
        { slug: "fra.2", name: "Ligue 2", group: "France" },
        { slug: "fra.coupe_de_france", name: "Coupe de France", group: "France" },
        { slug: "fra.w.1", name: "Première Ligue (F)", group: "France" },
        { slug: "uefa.champions", name: "Ligue des champions", group: "Coupes d'Europe" },
        { slug: "uefa.europa", name: "Ligue Europa", group: "Coupes d'Europe" },
        { slug: "uefa.europa.conf", name: "Ligue Conférence", group: "Coupes d'Europe" },
        { slug: "eng.1", name: "Premier League", group: "Grands championnats" },
        { slug: "esp.1", name: "Liga", group: "Grands championnats" },
        { slug: "ita.1", name: "Serie A", group: "Grands championnats" },
        { slug: "ger.1", name: "Bundesliga", group: "Grands championnats" },
        { slug: "eng.2", name: "Championship", group: "Autres championnats" },
        { slug: "esp.2", name: "Liga 2", group: "Autres championnats" },
        { slug: "ita.2", name: "Serie B", group: "Autres championnats" },
        { slug: "ger.2", name: "2. Bundesliga", group: "Autres championnats" },
        { slug: "por.1", name: "Liga Portugal", group: "Autres championnats" },
        { slug: "ned.1", name: "Eredivisie", group: "Autres championnats" },
        { slug: "bel.1", name: "Pro League (Belgique)", group: "Autres championnats" },
        { slug: "tur.1", name: "Süper Lig", group: "Autres championnats" },
        { slug: "sco.1", name: "Premiership (Écosse)", group: "Autres championnats" },
        { slug: "ksa.1", name: "Saudi Pro League", group: "Autres championnats" },
        { slug: "usa.1", name: "MLS", group: "Autres championnats" },
        { slug: "bra.1", name: "Brasileirão", group: "Autres championnats" },
        { slug: "arg.1", name: "Liga Profesional (Argentine)", group: "Autres championnats" },
        { slug: "fifa.worldq.uefa", name: "Qualifs Coupe du monde (Europe)", group: "Sélections", national: true },
        { slug: "uefa.nations", name: "Ligue des nations", group: "Sélections", national: true },
        { slug: "fifa.friendly", name: "Matchs amicaux", group: "Sélections", national: true },
        { slug: "fifa.world", name: "Coupe du monde", group: "Sélections", national: true }
    ];

    FL.groups = ["France", "Coupes d'Europe", "Grands championnats", "Autres championnats", "Sélections"];
    FL.clubCups = ["uefa.champions", "uefa.europa", "uefa.europa.conf"];
    FL.nationalComps = ["fifa.worldq.uefa", "uefa.nations", "fifa.friendly", "fifa.world"];

    FL.leagueName = function (slug) {
        var l = FL.leagues.find(function (x) { return x.slug === slug; });
        return l ? l.name : slug;
    };

    FL.hasTable = function (slug) {
        return slug !== "fra.coupe_de_france" && slug !== "fifa.friendly";
    };

    // Compétitions où chercher les matchs à venir d'une équipe
    FL.searchLeaguesFor = function (t) {
        if (t.national) return FL.nationalComps.slice();
        var l = [t.league].concat(FL.clubCups);
        if (t.league.indexOf("fra.") === 0) l.push("fra.coupe_de_france");
        return l.filter(function (v, i, a) { return a.indexOf(v) === i; });
    };
})();
