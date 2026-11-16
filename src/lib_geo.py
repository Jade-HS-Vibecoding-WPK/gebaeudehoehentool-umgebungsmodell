"""Geometrie-Helfer: Umrechnung in Meter, Rechtecke, Dreiecke.

Dieses Modul benutzt nur die Python-Standardbibliothek. Es muss also nichts
extra installiert werden.
"""
import math

ERDRADIUS_M = 6378137.0


def projektion(lat0, lon0):
    """Macht aus Breiten-/Längengrad Meter (x = Ost, y = Nord) um einen Mittelpunkt.

    Bei Gebieten von ca. 1 km Größe ist der Fehler kleiner als 0,1 %.
    """
    ky = math.radians(1.0) * ERDRADIUS_M
    kx = ky * math.cos(math.radians(lat0))

    def vor(lat, lon):
        return ((lon - lon0) * kx, (lat - lat0) * ky)

    def rueck(x, y):
        return (lat0 + y / ky, lon0 + x / kx)

    return vor, rueck


def flaeche_vorzeichen(pts):
    """Fläche mit Vorzeichen (positiv = gegen den Uhrzeigersinn)."""
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def kreuz(a, b, c):
    """Kreuzprodukt (b-a) x (c-a). Positiv = Linkskurve."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def abstand_punkt_gerade(p, a, b):
    laenge = math.hypot(b[0] - a[0], b[1] - a[1])
    if laenge < 1e-12:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    return abs(kreuz(a, b, p)) / laenge


def bereinigen(pts, tol=0.01):
    """Entfernt doppelte Punkte, den Schlusspunkt und fast gerade Eckpunkte.

    tol ist in Metern (1 cm). Gibt eine Liste gegen den Uhrzeigersinn zurück.
    """
    pts = [tuple(p) for p in pts]
    if len(pts) > 1 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < tol:
        pts = pts[:-1]
    neu = []
    for p in pts:
        if not neu or math.hypot(p[0] - neu[-1][0], p[1] - neu[-1][1]) >= tol:
            neu.append(p)
    pts = neu
    geaendert = True
    while geaendert and len(pts) > 3:
        geaendert = False
        for i in range(len(pts)):
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % len(pts)]
            if abstand_punkt_gerade(b, a, c) < tol:
                del pts[i]
                geaendert = True
                break
    if len(pts) >= 3 and flaeche_vorzeichen(pts) < 0:
        pts.reverse()
    return pts


def konvexe_huelle(punkte):
    pts = sorted(set(punkte))
    if len(pts) <= 2:
        return pts
    unten = []
    for p in pts:
        while len(unten) >= 2 and kreuz(unten[-2], unten[-1], p) <= 0:
            unten.pop()
        unten.append(p)
    oben = []
    for p in reversed(pts):
        while len(oben) >= 2 and kreuz(oben[-2], oben[-1], p) <= 0:
            oben.pop()
        oben.append(p)
    return unten[:-1] + oben[:-1]


def min_rechteck(pts):
    """Kleinstes umschließendes (gedrehtes) Rechteck.

    Gibt ein Dict zurück:
      laenge, breite : Seitenlängen in m (laenge >= breite)
      ecken          : 4 Punkte gegen den Uhrzeigersinn; Ecke 0 -> 1 liegt auf der langen Seite
    """
    huelle = konvexe_huelle(pts)
    n = len(huelle)
    if n < 3:
        return None
    beste = None
    for i in range(n):
        p = huelle[i]
        q = huelle[(i + 1) % n]
        d = math.hypot(q[0] - p[0], q[1] - p[1])
        if d < 1e-9:
            continue
        ex, ey = (q[0] - p[0]) / d, (q[1] - p[1]) / d
        nx, ny = -ey, ex
        us = [(x - p[0]) * ex + (y - p[1]) * ey for x, y in huelle]
        vs = [(x - p[0]) * nx + (y - p[1]) * ny for x, y in huelle]
        umin, umax, vmin, vmax = min(us), max(us), min(vs), max(vs)
        flaeche = (umax - umin) * (vmax - vmin)
        if beste is None or flaeche < beste[0]:
            beste = (flaeche, p, ex, ey, nx, ny, umin, umax, vmin, vmax)
    if beste is None:
        return None
    _, p, ex, ey, nx, ny, umin, umax, vmin, vmax = beste
    du, dv = umax - umin, vmax - vmin
    if du >= dv:
        ax, ay, bx, by = ex, ey, nx, ny
        a0, a1, b0, b1 = umin, umax, vmin, vmax
    else:
        ax, ay, bx, by = nx, ny, -ex, -ey
        a0, a1, b0, b1 = vmin, vmax, -umax, -umin

    def punkt(a, b):
        return (p[0] + a * ax + b * bx, p[1] + a * ay + b * by)

    return {
        "laenge": max(du, dv),
        "breite": min(du, dv),
        "ecken": [punkt(a0, b0), punkt(a1, b0), punkt(a1, b1), punkt(a0, b1)],
    }


def _im_dreieck(p, a, b, c, eps=1e-9):
    d1 = kreuz(a, b, p)
    d2 = kreuz(b, c, p)
    d3 = kreuz(c, a, p)
    return d1 > eps and d2 > eps and d3 > eps


def triangulieren(pts):
    """Zerlegt ein einfaches Vieleck (gegen den Uhrzeigersinn, ohne Löcher) in Dreiecke.

    Verfahren: "Ear Clipping". Gibt (dreiecke, ok) zurück. Die Dreiecke sind
    Index-Tripel (gegen den Uhrzeigersinn). ok=False heißt: Das Vieleck war
    wohl ungültig (z. B. sich selbst schneidend), das Ergebnis ist unsicher.
    """
    idx = list(range(len(pts)))
    dreiecke = []
    ok = True
    schutz = 0
    while len(idx) > 3:
        schutz += 1
        if schutz > 10 * len(pts) * len(pts) + 100:
            ok = False
            break
        m = len(idx)
        gefunden = False
        for k in range(m):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % m]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if kreuz(a, b, c) <= 1e-9:
                continue
            if any(_im_dreieck(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            dreiecke.append((i0, i1, i2))
            del idx[k]
            gefunden = True
            break
        if not gefunden:
            ok = False
            i0, i1, i2 = idx[-1], idx[0], idx[1]
            dreiecke.append((i0, i1, i2))
            del idx[0]
    if len(idx) == 3:
        dreiecke.append(tuple(idx))
    return dreiecke, ok
