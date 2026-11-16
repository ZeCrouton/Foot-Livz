(function () {
    var FL = window.FL = window.FL || {};
    var KEY = "fl:prefs";

    var DEFAULT_CLUB = {
        id: "176", name: "Marseille", league: "fra.1", national: false,
        logo: "https://a.espncdn.com/i/teamlogos/soccer/500/176.png"
    };
    var DEFAULT_COMPS = [
        "fra.1", "uefa.champions", "uefa.europa", "uefa.europa.conf", "fra.2",
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
        setClub: function (team) {
            var p = read();
            p.club = pick(team);
            write(p);
            if (!this.isFollowed(p.club.id)) this.follow(team);
        },
        followed: function () {
            var p = read();
            return p.followed || [Object.assign({ level: 0 }, DEFAULT_CLUB)];
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
        return { id: String(t.id), name: t.name, league: t.league, national: !!t.national, logo: t.logo || null };
    }
})();
