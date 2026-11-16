"""Schritt 3: STL-Datei für den 3D-Drucker erzeugen.

Aufruf (im Projektordner), Beispiel 1:500:
    python src/03_stl_export.py --massstab 500

Der Maßstab wird erst hier gewählt. Die Einheit in der STL-Datei ist Millimeter.
"""
import argparse
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
from lib_glb import schreibe_stl  # noqa: E402
from lib_geo import projektion  # noqa: E402
from lib_modell import erzeuge_modell, lade_korrekturen  # noqa: E402
from lib_osm import gebaeude_aus_osm  # noqa: E402

PROJEKT = os.path.dirname(HIER)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--massstab", type=float, required=True, help="z. B. 500 für 1:500")
    p.add_argument("--druckbett", type=float, default=220.0, help="Kantenlänge des Druckbetts in mm (Standard 220)")
    p.add_argument("--config", default=os.path.join(PROJEKT, "config", "gebiet.json"))
    p.add_argument("--osm", default=os.path.join(PROJEKT, "data", "osm_gebaeude.json"))
    p.add_argument("--korrekturen", default=os.path.join(PROJEKT, "config", "korrekturen.csv"))
    p.add_argument("--ausgabe", default=os.path.join(PROJEKT, "output"))
    a = p.parse_args()

    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    with open(a.osm, encoding="utf-8") as f:
        daten = json.load(f)
    vor, _ = projektion(cfg["mittelpunkt_lat"], cfg["mittelpunkt_lon"])
    roh, uebersprungen = gebaeude_aus_osm(daten, vor)
    gebaeude, _ = erzeuge_modell(cfg, roh, uebersprungen, lade_korrekturen(a.korrekturen))

    faktor = 1000.0 / a.massstab  # Meter -> Millimeter im Maßstab
    os.makedirs(a.ausgabe, exist_ok=True)
    ziel = os.path.join(a.ausgabe, "umgebungsmodell_1zu{:g}.stl".format(a.massstab))
    anzahl, mn, mx = schreibe_stl(ziel, gebaeude, faktor)
    breite_mm = (mx[0] - mn[0]) * faktor
    tiefe_mm = (mx[1] - mn[1]) * faktor
    hoehe_mm = (mx[2] - mn[2]) * faktor
    print("STL geschrieben:", ziel)
    print("  Dreiecke: {}".format(anzahl))
    print("  Größe im Maßstab 1:{:g}: {:.0f} x {:.0f} x {:.1f} mm".format(a.massstab, breite_mm, tiefe_mm, hoehe_mm))
    nicht_dicht = [b["id"] for b in gebaeude if not b["eigenschaften"]["mesh_geschlossen"]]
    if nicht_dicht:
        print("  ACHTUNG: {} Gebäude sind nicht wasserdicht: {}".format(len(nicht_dicht), ", ".join(nicht_dicht[:10])))
    if max(breite_mm, tiefe_mm) > a.druckbett:
        noetig = max(mx[0] - mn[0], mx[1] - mn[1]) * 1000.0 / a.druckbett
        print("  ACHTUNG: Das Modell passt nicht auf ein Druckbett von {:g} mm.".format(a.druckbett))
        print("  Für das ganze Gebiet auf einmal wäre mindestens 1:{:.0f} nötig (oder das Modell in Kacheln teilen).".format(noetig))
    print("Hinweis: STL enthält nur die Form. Die Maße stehen in der GLB-Datei und in gebaeude.csv.")


if __name__ == "__main__":
    main()
