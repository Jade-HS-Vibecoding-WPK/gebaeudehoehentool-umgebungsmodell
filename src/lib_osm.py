"""OpenStreetMap-Daten laden und lesen (nur Standardbibliothek)."""
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request

_ZAHL = re.compile(r"^\s*(-?\d+(?:[.,]\d+)?)\s*(m|meter)?\s*$", re.IGNORECASE)


def zahl(text):
    """Liest Zahlen wie '12', '9,5' oder '12 m'. Alles andere (z. B. Fuß) ergibt None."""
    if text is None:
        return None
    t = _ZAHL.match(str(text))
    if not t:
        return None
    return float(t.group(1).replace(",", "."))


def bbox_aus_mitte(lat0, lon0, breite_ost_west_m, laenge_nord_sued_m):
    """Rechteck um den Mittelpunkt: (süd, west, nord, ost) in Grad."""
    dlat = (laenge_nord_sued_m / 2.0) / 111320.0
    dlon = (breite_ost_west_m / 2.0) / (111320.0 * math.cos(math.radians(lat0)))
    return (lat0 - dlat, lon0 - dlon, lat0 + dlat, lon0 + dlon)


def lade_overpass(bbox, urls, versuche=2):
    """Holt alle Gebäude im Rechteck von der Overpass-API."""
    s, w, n, e = bbox
    abfrage = (
        "[out:json][timeout:120];"
        '(way["building"]({s},{w},{n},{e});relation["building"]({s},{w},{n},{e}););'
        "out geom;"
    ).format(s=s, w=w, n=n, e=e)
    daten = urllib.parse.urlencode({"data": abfrage}).encode("utf-8")
    letzter_fehler = None
    for url in urls:
        for versuch in range(versuche):
            try:
                req = urllib.request.Request(
                    url,
                    data=daten,
                    headers={"User-Agent": "umgebungsmodell-hochschule/0.1 (Studienprojekt)"},
                )
                with urllib.request.urlopen(req, timeout=180) as antwort:
                    return json.loads(antwort.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as fehler:
                letzter_fehler = fehler
                print("  Versuch fehlgeschlagen ({}): {}".format(url, fehler))
                time.sleep(3)
    raise RuntimeError("Overpass nicht erreichbar: {}".format(letzter_fehler))


def _ring(geometrie, vor):
    return [vor(p["lat"], p["lon"]) for p in geometrie]


def gebaeude_aus_osm(daten, vor):
    """Wandelt die Overpass-Antwort in eine Liste von Gebäuden um.

    Rückgabe: (gebaeude, uebersprungen)
      gebaeude: Liste von Dicts mit osm_typ, osm_id, tags, ring (Meter)
      uebersprungen: Liste von (kennung, grund)
    """
    gebaeude = []
    uebersprungen = []
    for el in daten.get("elements", []):
        typ = el.get("type")
        kennung = "{}/{}".format(typ, el.get("id"))
        tags = el.get("tags", {})
        if typ == "way":
            geo = el.get("geometry")
            if not geo or len(geo) < 4:
                uebersprungen.append((kennung, "Linie hat zu wenige Punkte"))
                continue
            if geo[0] != geo[-1]:
                uebersprungen.append((kennung, "Linie ist nicht geschlossen"))
                continue
            gebaeude.append({"osm_typ": "way", "osm_id": el["id"], "tags": tags, "ring": _ring(geo, vor)})
        elif typ == "relation":
            aussen = [m for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            innen = [m for m in el.get("members", []) if m.get("role") == "inner"]
            if len(aussen) != 1:
                uebersprungen.append((kennung, "Multipolygon mit {} Außenringen (noch nicht unterstützt)".format(len(aussen))))
                continue
            geo = aussen[0]["geometry"]
            if geo[0] != geo[-1]:
                uebersprungen.append((kennung, "Außenring nicht geschlossen"))
                continue
            eintrag = {"osm_typ": "relation", "osm_id": el["id"], "tags": tags, "ring": _ring(geo, vor)}
            if innen:
                eintrag["hinweis_loch"] = "Innenhof/Loch im Grundriss wurde ignoriert"
            gebaeude.append(eintrag)
    return gebaeude, uebersprungen
