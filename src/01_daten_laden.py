"""Schritt 1: Gebäude aus OpenStreetMap laden und in data/ speichern.

Aufruf (im Projektordner):
    python src/01_daten_laden.py
"""
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HIER)
from lib_osm import bbox_aus_mitte, lade_overpass  # noqa: E402

PROJEKT = os.path.dirname(HIER)


def main():
    with open(os.path.join(PROJEKT, "config", "gebiet.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    bbox = bbox_aus_mitte(cfg["mittelpunkt_lat"], cfg["mittelpunkt_lon"],
                          cfg["breite_ost_west_m"], cfg["laenge_nord_sued_m"])
    print("Gebiet (süd, west, nord, ost):", ["{:.5f}".format(x) for x in bbox])
    print("Lade Gebäude von OpenStreetMap (das kann ein paar Sekunden dauern) ...")
    daten = lade_overpass(bbox, cfg["overpass_urls"])
    os.makedirs(os.path.join(PROJEKT, "data"), exist_ok=True)
    ziel = os.path.join(PROJEKT, "data", "osm_gebaeude.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False)
    print("Fertig: {} Objekte gespeichert in {}".format(len(daten.get("elements", [])), ziel))
    print("Datenquelle: (c) OpenStreetMap-Mitwirkende, Lizenz ODbL")


if __name__ == "__main__":
    main()
