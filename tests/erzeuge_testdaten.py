"""Erzeugt erfundene Testdaten im Overpass-Format (ohne Internet).

Die Gebäude haben genau bekannte Maße. So kann man prüfen, ob das Programm
richtig rechnet. Aufruf:  python tests/erzeuge_testdaten.py
"""
import json
import math
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
PROJEKT = os.path.dirname(HIER)
sys.path.insert(0, os.path.join(PROJEKT, "src"))
from lib_geo import projektion  # noqa: E402

with open(os.path.join(PROJEKT, "config", "gebiet.json"), encoding="utf-8") as f:
    CFG = json.load(f)
_, RUECK = projektion(CFG["mittelpunkt_lat"], CFG["mittelpunkt_lon"])


def geo(punkte_m):
    """Meter-Punkte (x, y) -> Overpass-Geometrie, Ring geschlossen."""
    pts = list(punkte_m) + [punkte_m[0]]
    return [{"lat": RUECK(x, y)[0], "lon": RUECK(x, y)[1]} for x, y in pts]


def rechteck(cx, cy, laenge, breite, winkel=0.0):
    w = math.radians(winkel)
    c, s = math.cos(w), math.sin(w)
    ecken = [(-laenge / 2, -breite / 2), (laenge / 2, -breite / 2), (laenge / 2, breite / 2), (-laenge / 2, breite / 2)]
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in ecken]


def l_form(ox, oy):
    return [(ox + x, oy + y) for x, y in [(0, 0), (20, 0), (20, 8), (8, 8), (8, 20), (0, 20)]]


def way(i, punkte, **tags):
    return {"type": "way", "id": i, "tags": dict({"building": "yes"}, **tags), "geometry": geo(punkte)}


elemente = [
    way(1, rechteck(50, 50, 20, 10, 30), height="12", **{"roof:shape": "gabled", "roof:height": "4"}),
    way(2, rechteck(-100, 100, 12, 12), height="9", **{"roof:shape": "flat"}),
    way(3, rechteck(200, -200, 30, 15), height="14", **{"roof:shape": "hipped", "roof:height": "3"}),
    way(4, l_form(-200, -150), height="10", **{"roof:shape": "flat"}),
    way(5, rechteck(100, -50, 15, 10), **{"building:levels": "3"}),
    way(6, rechteck(300, 300, 10, 10), height="9,5 m"),
    {"type": "relation", "id": 7, "tags": {"building": "yes", "type": "multipolygon"}, "members": [
        {"type": "way", "role": "outer", "geometry": geo(rechteck(-300, -300, 10, 10))},
        {"type": "way", "role": "outer", "geometry": geo(rechteck(-300, -280, 10, 10))}]},
    way(8, l_form(-300, 200), height="10", **{"roof:shape": "gabled", "roof:height": "3"}),
    way(9, rechteck(0, -300, 16, 9), height="10", **{"roof:shape": "gabled"}),
    way(10, rechteck(150, 150, 10, 10), height="12", **{"roof:shape": "hipped", "roof:height": "3"}),
    way(11, rechteck(0, 700, 10, 10), height="5"),
    way(12, rechteck(-50, -100, 18, 8), height="11", **{"roof:shape": "gabled", "roof:height": "3", "roof:orientation": "across"}),
    way(13, rechteck(250, 50, 10, 6), height="8", **{"roof:shape": "skillion", "roof:height": "2"}),
    {"type": "way", "id": 14, "tags": {"building": "yes"}, "geometry": geo([(0, 0), (1, 0), (2, 0)])[:3]},
    {"type": "relation", "id": 15, "tags": {"building": "yes", "type": "multipolygon", "height": "7", "roof:shape": "flat"},
     "members": [{"type": "way", "role": "outer", "geometry": geo(rechteck(-150, 300, 14, 14))},
                 {"type": "way", "role": "inner", "geometry": geo(rechteck(-150, 300, 4, 4))}]},
]

ziel = os.path.join(HIER, "testdaten_overpass.json")
with open(ziel, "w", encoding="utf-8") as f:
    json.dump({"elements": elemente}, f, ensure_ascii=False, indent=1)
print("geschrieben:", ziel)
