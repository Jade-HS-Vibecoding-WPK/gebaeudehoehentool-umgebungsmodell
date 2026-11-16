"""Schritt 2: 3D-Modell (GLB), Maßtabelle (CSV) und Bericht erzeugen.

Aufruf (im Projektordner):
    python src/02_modell_bauen.py

Optional mit anderer Eingabedatei (z. B. zum Testen):
    python src/02_modell_bauen.py --osm tests/testdaten_overpass.json --ausgabe tests/ausgabe
"""
import argparse
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
from lib_glb import schreibe_glb  # noqa: E402
from lib_geo import projektion  # noqa: E402
from lib_modell import erzeuge_modell, lade_korrekturen, schreibe_csv  # noqa: E402
from lib_osm import gebaeude_aus_osm  # noqa: E402

PROJEKT = os.path.dirname(HIER)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", default=os.path.join(PROJEKT, "config", "gebiet.json"))
    p.add_argument("--osm", default=os.path.join(PROJEKT, "data", "osm_gebaeude.json"))
    p.add_argument("--korrekturen", default=os.path.join(PROJEKT, "config", "korrekturen.csv"))
    p.add_argument("--ausgabe", default=os.path.join(PROJEKT, "output"))
    a = p.parse_args()

    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    if not os.path.exists(a.osm):
        sys.exit("Eingabedatei fehlt: {}\nZuerst 'python src/01_daten_laden.py' ausführen.".format(a.osm))
    with open(a.osm, encoding="utf-8") as f:
        daten = json.load(f)

    vor, _ = projektion(cfg["mittelpunkt_lat"], cfg["mittelpunkt_lon"])
    roh, uebersprungen = gebaeude_aus_osm(daten, vor)
    korrekturen = lade_korrekturen(a.korrekturen)
    gebaeude, bericht = erzeuge_modell(cfg, roh, uebersprungen, korrekturen)

    os.makedirs(a.ausgabe, exist_ok=True)
    meta = {
        "gebiet": cfg.get("name", ""),
        "einheit": "Meter",
        "achsen": "x = Ost, y = oben, z = Süd (glTF-Konvention); Ursprung = Gebietsmitte",
        "quelle": "© OpenStreetMap-Mitwirkende (ODbL)",
        "hinweis": "Höhen nur aus OSM-Werten oder manuellen Korrekturen; fehlende Höhen = flache Grundplatte",
    }
    schreibe_glb(os.path.join(a.ausgabe, "umgebungsmodell.glb"), gebaeude, meta)
    schreibe_csv(os.path.join(a.ausgabe, "gebaeude.csv"), gebaeude)
    schreibe_csv(os.path.join(a.ausgabe, "fehlende_hoehen.csv"), gebaeude, nur_ohne_hoehe=True)
    with open(os.path.join(a.ausgabe, "bericht.txt"), "w", encoding="utf-8") as f:
        f.write(bericht)
    print(bericht)
    print("Dateien liegen in:", a.ausgabe)


if __name__ == "__main__":
    main()
