"""Automatischer Test: Stimmen Maße, Volumen und Dateien?

Aufruf (im Projektordner):
    python tests/erzeuge_testdaten.py
    python tests/test_modell.py
"""
import json
import math
import os
import struct
import subprocess
import sys
import tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
PROJEKT = os.path.dirname(HIER)
sys.path.insert(0, os.path.join(PROJEKT, "src"))
from lib_geo import projektion  # noqa: E402
from lib_modell import erzeuge_modell, lade_korrekturen  # noqa: E402
from lib_osm import gebaeude_aus_osm  # noqa: E402

fehler = []


def pruefe(bedingung, text):
    print(("  ok     " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def nahe(a, b, tol=0.02):
    return a is not None and abs(a - b) <= tol


def volumen(b):
    """Volumen über Tetraeder zum Ursprung (nur korrekt bei geschlossenem Körper mit Flächen nach außen)."""
    p = b["punkte"]
    v = 0.0
    for a, bb, c in b["dreiecke"]:
        x1, y1, z1 = p[a]
        x2, y2, z2 = p[bb]
        x3, y3, z3 = p[c]
        v += (x1 * (y2 * z3 - y3 * z2) - y1 * (x2 * z3 - x3 * z2) + z1 * (x2 * y3 - x3 * y2)) / 6.0
    return v


with open(os.path.join(PROJEKT, "config", "gebiet.json"), encoding="utf-8") as f:
    cfg = json.load(f)
with open(os.path.join(HIER, "testdaten_overpass.json"), encoding="utf-8") as f:
    daten = json.load(f)
vor, _ = projektion(cfg["mittelpunkt_lat"], cfg["mittelpunkt_lon"])
roh, uebersprungen = gebaeude_aus_osm(daten, vor)
gebaeude, bericht = erzeuge_modell(cfg, roh, uebersprungen)
nach_id = {b["id"]: b for b in gebaeude}
e = {k: v["eigenschaften"] for k, v in nach_id.items()}

print("\n1. Anzahl und aussortierte Objekte")
pruefe(len(gebaeude) == 12, "12 Gebäude gebaut (ist: {})".format(len(gebaeude)))
pruefe(len(uebersprungen) == 2, "2 Objekte übersprungen: Multipolygon und Linie mit zu wenigen Punkten (ist: {})".format(len(uebersprungen)))
pruefe("way_11" not in nach_id, "Gebäude außerhalb des Gebiets fehlt im Modell")

print("\n2. Maße")
pruefe(nahe(e["way_1"]["laenge_m"], 20) and nahe(e["way_1"]["breite_m"], 10), "way_1: 20 x 10 m trotz 30° Drehung")
pruefe(nahe(e["way_1"]["traufhoehe_m"], 8) and nahe(e["way_1"]["firsthoehe_m"], 12), "way_1: Traufe 8 m, First 12 m")
pruefe(nahe(e["way_3"]["traufhoehe_m"], 11) and nahe(e["way_3"]["firsthoehe_m"], 14), "way_3 (Walmdach): Traufe 11 m, First 14 m")
pruefe(nahe(e["way_6"]["firsthoehe_m"], 9.5), "way_6: Höhe '9,5 m' richtig gelesen")
pruefe(e["way_5"]["status"] == "Höhe fehlt" and e["way_5"]["firsthoehe_m"] is None, "way_5: ohne Höhe -> Status 'Höhe fehlt', keine erfundene Höhe")
pruefe(e["way_1"]["hoehenquelle"] == "OSM" and e["way_5"]["hoehenquelle"] is None, "Höhenquelle: way_1 'OSM', way_5 (ohne Höhe) leer")
pruefe(e["way_5"]["geschosse"] == 3, "way_5: Geschosszahl 3 nur als Information gespeichert")
pruefe(nahe(e["way_9"]["firsthoehe_m"], 10) and e["way_9"]["traufhoehe_m"] is None, "way_9: Satteldach ohne Dachhöhe -> Traufhöhe leer")
pruefe("noch nicht umgesetzt" in e["way_13"]["dachform"], "way_13: unbekannte Dachform wird gemeldet")
pruefe("Loch" in e["relation_15"]["hinweise"] or "Innenhof" in e["relation_15"]["hinweise"], "relation_15: ignorierter Innenhof wird gemeldet")

print("\n3. Körper (wasserdicht, Volumen)")
pruefe(all(b["eigenschaften"]["mesh_geschlossen"] for b in gebaeude), "alle Körper wasserdicht")
erwartet = {
    "way_1": 2000.0,      # 20*10*8 + Satteldach 0,5*10*4*20
    "way_2": 1296.0,      # 12*12*9
    "way_3": 5512.5,      # 30*15*11 + Walmdach h/6*W*(3L-W)
    "way_4": 2560.0,      # L-Form 256 m² * 10 m
    "way_5": 150.0,       # Grundplatte 15*10*1
    "way_10": 1000.0,     # 10*10*9 + Pyramide 100*3/3
    "way_12": 1368.0,     # 18*8*8 + Dach quer
}
for k, soll in erwartet.items():
    ist = volumen(nach_id[k])
    pruefe(abs(ist - soll) < 0.5, "{}: Volumen {:.1f} m³ (erwartet {:.1f})".format(k, ist, soll))

print("\n4. Firstrichtung bei roof:orientation=across (way_12)")
hoechste = max(p[2] for p in nach_id["way_12"]["punkte"])
first_punkte = [p for p in nach_id["way_12"]["punkte"] if abs(p[2] - hoechste) < 1e-6]
abstand = math.dist(first_punkte[0][:2], first_punkte[1][:2]) if len(first_punkte) == 2 else None
pruefe(abstand is not None and abs(abstand - 8) < 0.05, "First verläuft über die kurze Seite (Länge 8 m, ist: {})".format(abstand))

print("\n5. Korrekturen")
with tempfile.TemporaryDirectory() as t:
    pfad = os.path.join(t, "k.csv")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write("kennung;hoehe_m;dachhoehe_m;dachform;quelle;kommentar\nway/5;15;4;gabled;Google Earth;aus Test\n")
    gb2, _ = erzeuge_modell(cfg, roh, uebersprungen, lade_korrekturen(pfad))
    e5 = {b["id"]: b["eigenschaften"] for b in gb2}["way_5"]
    pruefe(e5["status"] == "manuell" and nahe(e5["traufhoehe_m"], 11) and nahe(e5["firsthoehe_m"], 15), "way_5 mit Korrektur: Status 'manuell', Traufe 11, First 15")
    pruefe(e5["hoehenquelle"] == "Google Earth", "way_5 mit Korrektur: Höhenquelle 'Google Earth' wird gespeichert")

print("\n6. Skripte, GLB, CSV, STL")
with tempfile.TemporaryDirectory() as t:
    osm = os.path.join(HIER, "testdaten_overpass.json")
    r = subprocess.run([sys.executable, os.path.join(PROJEKT, "src", "02_modell_bauen.py"), "--osm", osm, "--ausgabe", t],
                       capture_output=True, text=True)
    pruefe(r.returncode == 0, "02_modell_bauen.py läuft ohne Fehler" + ("" if r.returncode == 0 else ": " + r.stderr[-300:]))
    glb = os.path.join(t, "umgebungsmodell.glb")
    with open(glb, "rb") as f:
        inhalt = f.read()
    magic, version, laenge = struct.unpack("<4sII", inhalt[:12])
    pruefe(magic == b"glTF" and version == 2 and laenge == len(inhalt), "GLB-Kopf gültig, Länge stimmt")
    jl, jt = struct.unpack("<I4s", inhalt[12:20])
    gltf = json.loads(inhalt[20:20 + jl])
    bl, bt = struct.unpack("<I4s", inhalt[20 + jl:28 + jl])
    pruefe(jt == b"JSON" and bt == b"BIN\x00" and gltf["buffers"][0]["byteLength"] <= bl, "JSON- und BIN-Teil vorhanden")
    knoten = [n for n in gltf["nodes"] if "mesh" in n]
    pruefe(len(knoten) == 12, "12 Gebäude-Knoten in der GLB")
    k1 = next(n for n in knoten if n["name"] == "way_1")
    pruefe(nahe(k1["extras"]["laenge_m"], 20) and nahe(k1["extras"]["firsthoehe_m"], 12), "Maße stehen als 'extras' am Gebäude-Knoten (way_1)")
    # Positionen: höchster Punkt (glTF-y) von way_1 muss 12 m sein
    acc = gltf["accessors"][gltf["meshes"][k1["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
    pruefe(abs(acc["max"][1] - 12) < 0.01 and abs(acc["min"][1]) < 0.01, "glTF-Höhe (y) von way_1 reicht von 0 bis 12 m")
    csv_text = open(os.path.join(t, "gebaeude.csv"), encoding="utf-8-sig").read()
    pruefe("Länge [m]" in csv_text and "20" in csv_text, "gebaeude.csv enthält Spalten und Werte")
    fehlend = open(os.path.join(t, "fehlende_hoehen.csv"), encoding="utf-8-sig").read().strip().splitlines()
    pruefe(len(fehlend) == 2 and "way_5" in fehlend[1], "fehlende_hoehen.csv enthält genau way_5")

    r = subprocess.run([sys.executable, os.path.join(PROJEKT, "src", "03_stl_export.py"), "--massstab", "500",
                        "--osm", osm, "--ausgabe", t], capture_output=True, text=True)
    pruefe(r.returncode == 0, "03_stl_export.py läuft ohne Fehler" + ("" if r.returncode == 0 else ": " + r.stderr[-300:]))
    stl = os.path.join(t, "umgebungsmodell_1zu500.stl")
    groesse = os.path.getsize(stl)
    with open(stl, "rb") as f:
        f.seek(80)
        n = struct.unpack("<I", f.read(4))[0]
    pruefe(groesse == 84 + 50 * n, "STL: Dateigröße passt zur Dreiecksanzahl ({} Dreiecke)".format(n))
    f_ = open(stl, "rb").read()
    zs = [struct.unpack("<f", f_[84 + 50 * i + 12 + 8: 84 + 50 * i + 12 + 12])[0] for i in range(min(n, 50))]
    pruefe(min(zs) >= -1e-6, "STL: nichts liegt unterhalb der Druckplatte (z >= 0)")

print("\n" + ("ALLE TESTS BESTANDEN" if not fehler else "{} TEST(S) FEHLGESCHLAGEN".format(len(fehler))))
sys.exit(1 if fehler else 0)
