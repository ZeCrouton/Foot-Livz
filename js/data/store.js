(function () {
    var FL = window.FL = window.FL || {};
    var KEY = "fl:prefs";

    var DEFAULT_CLUB = {
        id: "176", name: "Marseille", league: "fra.1", national: false,
        logo: "https://a.espncdn.com/i/teamlogos/soccer/500/176.png",
        color: "2faee0", alt: "ffffff"
    };
    var DEFAULT_COMPS = [
        "fra.1", "uefa.champions", "uefa.europa", "uefa.europa.conf", "fra.2", "fra.3",
        "fra.coupe_de_france", "eng.1", "esp.1", "ita.1", "ger.1", "fifa.worldq.uefa", "uefa.nations"
    ];

    function read() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function write(p) {
        try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* stockage plein ou désactivé */ }
    }

    FL.prefs = {
        club: function () {
            var p = read();
            return p.club || DEFAULT_CLUB;
        },
        // Vrai si l'utilisateur a réellement choisi un club de cœur
        hasClub: function () {
            return !!read().club;
        },
        // Complète les couleurs d'un club déjà enregistré (anciennes préférences)
        updateClub: function (id, patch) {
            var p = read();
            if (p.club && p.club.id === id) p.club = Object.assign({}, p.club, patch);
            if (p.followed) p.followed = p.followed.map(function (t) { return t.id === id ? Object.assign({}, t, patch) : t; });
            write(p);
        },
        theme: function () {
            var p = read();
            return { off: !!p.themeOff, color: p.themeColor || "" };
        },
        setTheme: function (t) {
            var p = read();
            p.themeOff = !!t.off;
            if (t.color) p.themeColor = t.color; else delete p.themeColor;
            write(p);
        },
        setClub: function (team) {
            var p = read();
            p.club = pick(team);
            write(p);
            if (!this.isFollowed(p.club.id)) this.follow(team);
        },
        followed: function () {
            var p = read();
            return p.followed || [];
        },
        isFollowed: function (id) {
            return this.followed().some(function (t) { return t.id === id; });
        },
        follow: function (team) {
            var p = read();
            var list = this.followed().filter(function (t) { return t.id !== team.id; });
            list.push(Object.assign({ level: 0 }, pick(team)));
            p.followed = list;
            write(p);
        },
        unfollow: function (id) {
            var p = read();
            p.followed = this.followed().filter(function (t) { return t.id !== id; });
            write(p);
        },
        // Équipes à suivre pour l'agenda : le club en premier, puis les équipes suivies
        teams: function () {
            var all = [this.club()].concat(this.followed());
            var seen = {};
            return all.filter(function (t) {
                if (seen[t.id]) return false;
                seen[t.id] = true;
                return true;
            });
        },
        competitions: function () {
            var p = read();
            return p.comps || DEFAULT_COMPS.slice();
        },
        setCompetitions: function (list) {
            var p = read();
            p.comps = list;
            write(p);
        },
        reset: function () {
            try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        }
    };

    function pick(t) {
        return {
            id: String(t.id), name: t.name, league: t.league, national: !!t.national, logo: t.logo || null,
            color: t.color || null, alt: t.alt || null
        };
    }
})();
