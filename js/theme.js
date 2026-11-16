/* Thème aux couleurs du club de cœur. Chargé dans <head> pour éviter tout clignotement. */
(function () {
    var FL = window.FL = window.FL || {};
    var KEY = "fl:prefs";
    var NEUTRAL = { color: "1e3a8a", alt: "ffffff" };
    var DEFAULT_CLUB = { id: "176", color: "2faee0", alt: "ffffff" };

    function readPrefs() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function hex(c) {
        c = String(c || "").replace("#", "").trim();
        if (/^[0-9a-f]{3}$/i.test(c)) c = c.split("").map(function (x) { return x + x; }).join("");
        return /^[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
    }
    function rgb(h) { return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
    function toHex(a) {
        return a.map(function (v) {
            v = Math.max(0, Math.min(255, Math.round(v)));
            return (v < 16 ? "0" : "") + v.toString(16);
        }).join("");
    }
    function lum(h) {
        var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contrast(a, b) {
        var la = lum(a), lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    function mix(h, target, t) {
        var a = rgb(h), b = rgb(target);
        return toHex(a.map(function (v, i) { return v + (b[i] - v) * t; }));
    }
    function readable(h, bg, towards) {
        var out = h, i = 0;
        while (contrast(out, bg) < 4.5 && i < 25) { out = mix(out, towards, 0.1); i++; }
        return out;
    }

    // Calcule la palette complète à partir des couleurs du club
    function compute(color, alt) {
        var primary = hex(color) || NEUTRAL.color;
        var accent = hex(alt);
        if (lum(primary) > 0.72) {                 // trop clair pour un fond d'en-tête
            if (accent && lum(accent) < 0.45) { var t = primary; primary = accent; accent = t; }
            else primary = mix(primary, "000000", 0.6);
        }
        if (!accent || contrast(accent, primary) < 1.8) accent = lum(primary) > 0.35 ? "111111" : "ffffff";
        var on = contrast("ffffff", primary) >= contrast("111111", primary) ? "ffffff" : "111111";
        var r = rgb(primary);
        return {
            primary: primary,
            dark: mix(primary, "000000", 0.28),
            accent: accent,
            on: on,
            onAccent: contrast("ffffff", accent) >= contrast("111111", accent) ? "ffffff" : "111111",
            onSoft: on === "ffffff" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.12)",
            soft: "rgba(" + r[0] + "," + r[1] + "," + r[2] + ",.12)",
            textLight: readable(primary, "ffffff", "000000"),
            textDark: readable(primary, "16181d", "ffffff")
        };
    }

    function apply(color, alt) {
        var p = compute(color, alt), s = document.documentElement.style;
        s.setProperty("--primary", "#" + p.primary);
        s.setProperty("--primary-dark", "#" + p.dark);
        s.setProperty("--accent", "#" + p.accent);
        s.setProperty("--on-primary", "#" + p.on);
        s.setProperty("--on-accent", "#" + p.onAccent);
        s.setProperty("--on-primary-soft", p.onSoft);
        s.setProperty("--primary-soft", p.soft);
        s.setProperty("--primary-text-l", "#" + p.textLight);
        s.setProperty("--primary-text-d", "#" + p.textDark);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", "#" + p.primary);
        return p;
    }

    function applyFromPrefs() {
        var p = readPrefs();
        if (p.themeOff) return apply(NEUTRAL.color, NEUTRAL.alt);
        var club = p.club || DEFAULT_CLUB;
        var color = hex(p.themeColor) || club.color || (club.id === DEFAULT_CLUB.id ? DEFAULT_CLUB.color : null);
        var alt = hex(p.themeColor) ? null : (club.alt || (club.id === DEFAULT_CLUB.id ? DEFAULT_CLUB.alt : null));
        return apply(color, alt);
    }

    FL.theme = { compute: compute, apply: apply, applyFromPrefs: applyFromPrefs, hex: hex };
    applyFromPrefs();
})();
