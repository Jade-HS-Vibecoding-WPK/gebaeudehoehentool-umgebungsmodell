"""Aus OSM-Gebäuden 3D-Körper mit Maßen bauen (nur Standardbibliothek).

Koordinaten im Modell (alles in Metern, Ursprung = Mittelpunkt des Gebiets):
  x = Ost, y = Nord, z = Höhe
"""
import csv
import math
import os
from collections import Counter

from lib_geo import bereinigen, flaeche_vorzeichen, min_rechteck, triangulieren
from lib_osm import zahl

UNTERSTUETZTE_DAECHER = ("gabled", "hipped", "pyramidal")

DACHNAMEN_DE = {
    "flat": "Flachdach",
    "gabled": "Satteldach",
    "hipped": "Walmdach",
    "pyramidal": "Pyramidendach",
}


# ---------------------------------------------------------------- Körper bauen

def _koerper(ring, z_trauf, dach=None):
    """Baut einen geschlossenen Körper.

    ring    : Grundriss (gegen den Uhrzeigersinn)
    z_trauf : Höhe der Wände
    dach    : None = flaches Dach, sonst Dict mit ecken, z_first, art
    Gibt (punkte, dreiecke, triangulation_ok) zurück.
    """
    n = len(ring)
    punkte = [(x, y, 0.0) for x, y in ring] + [(x, y, z_trauf) for x, y in ring]
    dreiecke = []
    tris, ok = triangulieren(ring)
    for a, b, c in tris:
        dreiecke.append((a, c, b))  # Boden zeigt nach unten
    for i in range(n):
        j = (i + 1) % n
        dreiecke.append((i, j, n + j))
        dreiecke.append((i, n + j, n + i))
    if dach is None:
        for a, b, c in tris:
            dreiecke.append((n + a, n + b, n + c))
    else:
        p0, p1, p2, p3 = dach["ecken"]
        zr = dach["z_first"]
        lr = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        wr = math.hypot(p2[1] - p1[1], p2[0] - p1[0])
        ux, uy = (p1[0] - p0[0]) / lr, (p1[1] - p0[1]) / lr
        m0 = ((p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2)
        m1 = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        if dach["art"] == "gabled":
            r0, r1 = m0, m1
        elif dach["art"] == "hipped" and lr > wr + 1e-6:
            r0 = (m0[0] + ux * wr / 2, m0[1] + uy * wr / 2)
            r1 = (m1[0] - ux * wr / 2, m1[1] - uy * wr / 2)
        else:  # Pyramide oder Walmdach über quadratischem Grundriss
            mitte = ((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2)
            r0 = r1 = mitte
        i0 = len(punkte)
        punkte.append((r0[0], r0[1], zr))
        if r1 == r0:
            i1 = i0
        else:
            i1 = len(punkte)
            punkte.append((r1[0], r1[1], zr))
        t0, t1, t2, t3 = n, n + 1, n + 2, n + 3
        for tri in ((t0, t1, i1), (t0, i1, i0), (t2, t3, i0), (t2, i0, i1),
                    (t1, t2, i1), (t3, t0, i0)):
            if len(set(tri)) == 3:
                dreiecke.append(tri)
    return punkte, dreiecke, ok


def kanten_geschlossen(dreiecke):
    """Prüft, ob der Körper "wasserdicht" ist.

    Jede Kante muss genau einmal in jede Richtung vorkommen. Das stellt auch
    sicher, dass alle Flächen nach außen zeigen.
    """
    z = Counter()
    for a, b, c in dreiecke:
        z[(a, b)] += 1
        z[(b, c)] += 1
        z[(c, a)] += 1
    for (a, b), anzahl in z.items():
        if anzahl != 1 or z.get((b, a), 0) != 1:
            return False
    return True


# ---------------------------------------------------------------- Gebäude

def _runden(x, stellen=2):
    return None if x is None else round(x, stellen)


def baue_gebaeude(g, cfg, korrektur=None):
    """Baut ein Gebäude. Gibt (gebaeude, fehlergrund) zurück; bei Fehler ist gebaeude None."""
    tags = dict(g["tags"])
    hinweise = []
    status = "OSM-Wert"
    quelle = "OSM"
    if korrektur:
        quelle = korrektur.get("quelle") or "manuell"
        if korrektur.get("hoehe_m") is not None:
            tags["height"] = str(korrektur["hoehe_m"])
        if korrektur.get("dachhoehe_m") is not None:
            tags["roof:height"] = str(korrektur["dachhoehe_m"])
        if korrektur.get("dachform"):
            tags["roof:shape"] = korrektur["dachform"]
        status = "manuell"
    if g.get("hinweis_loch"):
        hinweise.append(g["hinweis_loch"])

    ring = bereinigen(g["ring"])
    if len(ring) < 3:
        return None, "Grundriss hat weniger als 3 Eckpunkte"
    flaeche = abs(flaeche_vorzeichen(ring))
    rechteck = min_rechteck(ring)
    if rechteck is None or flaeche < 0.5:
        return None, "Grundriss ist zu klein oder ungültig"
    laenge, breite = rechteck["laenge"], rechteck["breite"]
    fuellgrad = flaeche / (laenge * breite)
    ist_rechteckig = fuellgrad >= cfg.get("rechteck_toleranz", 0.95)

    hoehe = zahl(tags.get("height"))
    dachhoehe = zahl(tags.get("roof:height"))
    form = (tags.get("roof:shape") or "").strip().lower()
    geschosse = zahl(tags.get("building:levels"))

    traufe = first = None
    dachform_text = "unbekannt"
    dach = None
    body_ring = ring
    z_wand = None

    if hoehe is None or hoehe <= 0:
        status = "Höhe fehlt"
        z_wand = cfg.get("grundplatte_dicke_m", 1.0)
        dachform_text = "flach (Platzhalter)"
        if geschosse is not None:
            hinweise.append("Geschosse laut OSM: {:g} (nicht in Meter umgerechnet)".format(geschosse))
    elif form == "":
        z_wand = hoehe
        traufe = first = hoehe
        dachform_text = "unbekannt (als Flachdach)"
        hinweise.append("Dachform fehlt, als Flachdach gebaut")
    elif form == "flat":
        z_wand = hoehe
        traufe = first = hoehe
        dachform_text = "Flachdach"
    elif form in UNTERSTUETZTE_DAECHER:
        name_de = DACHNAMEN_DE[form]
        if dachhoehe is None or dachhoehe <= 0 or dachhoehe >= hoehe:
            z_wand = hoehe
            first = hoehe
            dachform_text = name_de + " (vereinfacht als Flachdach)"
            hinweise.append(
                "Dachhöhe fehlt oder ist ungültig: Traufhöhe unbekannt, Dach als Flachdach in Firsthöhe gebaut")
        else:
            traufe = hoehe - dachhoehe
            first = hoehe
            z_wand = traufe
            if ist_rechteckig:
                ecken = rechteck["ecken"]
                if (tags.get("roof:orientation") or "").strip().lower() == "across":
                    ecken = [ecken[1], ecken[2], ecken[3], ecken[0]]
                dach = {"ecken": ecken, "z_first": first, "art": form}
                body_ring = ecken  # gleiche Reihenfolge wie die Dachecken
                dachform_text = name_de
                if fuellgrad < 0.99:
                    hinweise.append("Grundriss durch umschließendes Rechteck ersetzt (Füllgrad {:.0%})".format(fuellgrad))
            else:
                dachform_text = name_de + " (vereinfacht, Grundriss nicht rechteckig)"
                hinweise.append("Grundriss nicht rechteckig: Körper nur bis Traufhöhe mit flachem Dach")
    else:
        z_wand = hoehe
        first = hoehe
        dachform_text = "{} (noch nicht umgesetzt)".format(form)
        hinweise.append("Dachform '{}' noch nicht umgesetzt: Flachdach in Firsthöhe, Traufhöhe unbekannt".format(form))

    punkte, dreiecke, tri_ok = _koerper(body_ring, z_wand, dach)
    geschlossen = tri_ok and kanten_geschlossen(dreiecke)
    if not geschlossen:
        hinweise.append("Körper nicht wasserdicht (Grundriss evtl. ungültig)")

    kennung = "{}_{}".format(g["osm_typ"], g["osm_id"])
    if status == "Höhe fehlt":
        material = "fehlt"
    elif hinweise:
        material = "hinweis"
    else:
        material = "ok"

    eigenschaften = {
        "id": kennung,
        "osm_id": "{}/{}".format(g["osm_typ"], g["osm_id"]),
        "name": tags.get("name", ""),
        "gebaeudeart": tags.get("building", ""),
        "laenge_m": _runden(laenge),
        "breite_m": _runden(breite),
        "traufhoehe_m": _runden(traufe),
        "firsthoehe_m": _runden(first),
        "dachform": dachform_text,
        "geschosse": geschosse,
        "grundflaeche_m2": _runden(flaeche, 1),
        "status": status,
        "hoehenquelle": None if status == "Höhe fehlt" else quelle,
        "hinweise": "; ".join(hinweise),
        "mesh_geschlossen": bool(geschlossen),
    }
    return {
        "id": kennung,
        "punkte": punkte,
        "dreiecke": dreiecke,
        "material": material,
        "eigenschaften": eigenschaften,
    }, None


# ---------------------------------------------------------------- Korrekturen

def lade_korrekturen(pfad):
    """Liest config/korrekturen.csv (Spalten: kennung;hoehe_m;dachhoehe_m;dachform;quelle;kommentar)."""
    if not os.path.exists(pfad):
        return {}
    ergebnis = {}
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        for zeile in csv.DictReader(f, delimiter=";"):
            k = (zeile.get("kennung") or "").strip()
            if not k or k.startswith("#"):
                continue
            ergebnis[k] = {
                "hoehe_m": zahl(zeile.get("hoehe_m")),
                "dachhoehe_m": zahl(zeile.get("dachhoehe_m")),
                "dachform": (zeile.get("dachform") or "").strip(),
                "quelle": (zeile.get("quelle") or "").strip(),
            }
    return ergebnis


# ---------------------------------------------------------------- Gesamtmodell

def erzeuge_modell(cfg, rohgebaeude, uebersprungen_osm, korrekturen=None):
    """Baut alle Gebäude im Gebiet. Gibt (gebaeude, bericht_text) zurück."""
    korrekturen = korrekturen or {}
    halb_b = cfg["breite_ost_west_m"] / 2.0
    halb_l = cfg["laenge_nord_sued_m"] / 2.0
    nur_innen = cfg.get("nur_gebaeude_mit_mittelpunkt_im_gebiet", True)

    gebaeude = []
    probleme = list(uebersprungen_osm)
    ausserhalb = 0
    for g in sorted(rohgebaeude, key=lambda x: (x["osm_typ"], x["osm_id"])):
        xs = [p[0] for p in g["ring"]]
        ys = [p[1] for p in g["ring"]]
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        if nur_innen and not (-halb_b <= mx <= halb_b and -halb_l <= my <= halb_l):
            ausserhalb += 1
            continue
        k = korrekturen.get("{}/{}".format(g["osm_typ"], g["osm_id"]))
        b, grund = baue_gebaeude(g, cfg, k)
        if b is None:
            probleme.append(("{}/{}".format(g["osm_typ"], g["osm_id"]), grund))
        else:
            gebaeude.append(b)

    z = Counter(b["eigenschaften"]["status"] for b in gebaeude)
    mit_hinweis = sum(1 for b in gebaeude if b["eigenschaften"]["hinweise"])
    nicht_dicht = [b["id"] for b in gebaeude if not b["eigenschaften"]["mesh_geschlossen"]]
    mit_dach = sum(1 for b in gebaeude
                   if b["eigenschaften"]["traufhoehe_m"] is not None
                   and b["eigenschaften"]["traufhoehe_m"] != b["eigenschaften"]["firsthoehe_m"])
    n = len(gebaeude)
    zeilen = [
        "BERICHT Umgebungsmodell",
        "=======================",
        "Gebiet: {} ({:g} m x {:g} m)".format(cfg.get("name", ""), cfg["breite_ost_west_m"], cfg["laenge_nord_sued_m"]),
        "",
        "Gebäude im Modell:               {}".format(n),
        "  davon mit Höhe aus OSM:        {}".format(z.get("OSM-Wert", 0)),
        "  davon mit Höhe manuell/Google: {}".format(z.get("manuell", 0)),
        "  davon OHNE Höhe (Grundplatte): {}".format(z.get("Höhe fehlt", 0)),
        "  davon mit Dach (Trauf<>First): {}".format(mit_dach),
        "  davon mit Hinweisen:           {}".format(mit_hinweis),
        "Außerhalb des Gebiets ignoriert: {}".format(ausserhalb),
        "Nicht gebaut (Problem):          {}".format(len(probleme)),
        "Nicht wasserdicht:               {}".format(len(nicht_dicht)),
    ]
    if n:
        zeilen.append("Anteil ohne Höhe:                {:.0%}".format(z.get("Höhe fehlt", 0) / n))
    if probleme:
        zeilen += ["", "Nicht gebaute Objekte:"] + ["  {}: {}".format(a, b) for a, b in probleme]
    if nicht_dicht:
        zeilen += ["", "Nicht wasserdicht:"] + ["  {}".format(i) for i in nicht_dicht]
    return gebaeude, "\n".join(zeilen) + "\n"


# ---------------------------------------------------------------- CSV

SPALTEN = [
    ("id", "ID"),
    ("osm_id", "OSM-Objekt"),
    ("name", "Name"),
    ("gebaeudeart", "Gebäudeart"),
    ("laenge_m", "Länge [m]"),
    ("breite_m", "Breite [m]"),
    ("traufhoehe_m", "Traufhöhe [m]"),
    ("firsthoehe_m", "Firsthöhe [m]"),
    ("dachform", "Dachform"),
    ("geschosse", "Geschosse"),
    ("grundflaeche_m2", "Grundfläche [m²]"),
    ("status", "Status"),
    ("hoehenquelle", "Höhenquelle"),
    ("hinweise", "Hinweise"),
    ("mesh_geschlossen", "Wasserdicht"),
]


def _csv_wert(w):
    if w is None:
        return ""
    if isinstance(w, bool):
        return "ja" if w else "nein"
    if isinstance(w, float):
        return ("{:g}".format(w) if w == int(w) else "{:.2f}".format(w)).replace(".", ",")
    return str(w)


def schreibe_csv(pfad, gebaeude, nur_ohne_hoehe=False):
    """Schreibt eine CSV, die sich direkt in deutschem Excel öffnen lässt."""
    with open(pfad, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([titel for _, titel in SPALTEN])
        for b in gebaeude:
            e = b["eigenschaften"]
            if nur_ohne_hoehe and e["status"] != "Höhe fehlt":
                continue
            w.writerow([_csv_wert(e.get(k)) for k, _ in SPALTEN])
