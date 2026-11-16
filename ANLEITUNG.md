# Anleitung für Windows (Schritt für Schritt)

Du brauchst **nur Python**. Es müssen keine weiteren Pakete installiert werden.

## Einmalig: Python installieren

1. Öffne https://www.python.org/downloads/ und lade die aktuelle Python-3-Version für Windows herunter.
2. Starte das Installationsprogramm.
3. **Wichtig:** Setze unten im ersten Fenster den Haken bei **"Add python.exe to PATH"**. Dann klicke "Install Now".
4. Prüfe die Installation: Drücke die Windows-Taste, tippe `cmd`, öffne die **Eingabeaufforderung** und tippe:

   ```
   python --version
   ```

   Es sollte z. B. `Python 3.13.x` erscheinen. Falls "Python wurde nicht gefunden" kommt, versuche `py --version`. Dann nimmst du in allen Befehlen unten `py` statt `python`.

## Im Projektordner arbeiten

Öffne den Projektordner im Explorer ("Claude Pro"). Klicke oben in die Adresszeile, tippe `cmd` und drücke Enter. Es öffnet sich eine Eingabeaufforderung genau in diesem Ordner. Alle Befehle unten tippst du dort.

## Schritt 0: Testen, ob alles funktioniert (ohne Internet)

```
python tests\erzeuge_testdaten.py
python tests\test_modell.py
```

Am Ende muss **ALLE TESTS BESTANDEN** stehen. Wenn dort Fehler stehen, schicke mir den Text.

## Schritt 1: Gebiet prüfen

Öffne `config\gebiet.json` mit dem Windows-Editor (Rechtsklick, "Öffnen mit", Editor).

- `mittelpunkt_lat` und `mittelpunkt_lon` sind **vorerst die Koordinaten der Kaiser-Wilhelm-Brücke**, nicht der Südzentrale.
- So findest du die richtigen Werte: Öffne https://www.openstreetmap.org, suche die Südzentrale in Wilhelmshaven, mache einen **Rechtsklick auf die Mitte des Geländes** und wähle "Adresse anzeigen". Links stehen die Koordinaten, z. B. `53.5136, 8.1352`. Der erste Wert ist `lat`, der zweite `lon`.
- Wenn `breite_ost_west_m` und `laenge_nord_sued_m` vertauscht sind, tausche die Zahlen.

Speichern nicht vergessen.

## Schritt 2: Gebäude aus OpenStreetMap laden

```
python src\01_daten_laden.py
```

Das braucht Internet und dauert einige Sekunden bis eine Minute. Danach liegt `data\osm_gebaeude.json` im Ordner.

## Schritt 3: Modell bauen

```
python src\02_modell_bauen.py
```

Es erscheint ein **Bericht**. Wichtig sind diese Zeilen:
- "OHNE Höhe (Grundplatte)" und "Anteil ohne Höhe": So viele Gebäude haben in OpenStreetMap keine Höhe.
- "Nicht gebaute Objekte": Sie stehen mit Grund im Bericht.

Es entstehen in `output\`:
- `umgebungsmodell.glb`: das 3D-Modell mit den Maßen an jedem Gebäude
- `gebaeude.csv`: alle Maße als Tabelle (in Excel öffnen)
- `fehlende_hoehen.csv`: Gebäude, bei denen ihr Höhen nachtragen müsst
- `bericht.txt`: der Bericht

## Schritt 4: Modell im Browser ansehen

```
python -m http.server 8000
```

Dann im Browser öffnen: **http://localhost:8000/viewer/**

Das Fenster der Eingabeaufforderung muss dabei offen bleiben. Beenden mit `Strg + C`.
Der Betrachter braucht Internet, weil er die Bibliothek three.js aus dem Netz lädt.

## Schritt 5: Höhen aus Google Earth eintragen

Die Grundrisse kommen aus OpenStreetMap, die Höhen aus Google Earth. Die gemessenen Höhen stehen in `config\korrekturen.csv`. Pro Zeile ein Gebäude, getrennt durch Semikolon:

```
kennung;hoehe_m;dachhoehe_m;dachform;quelle;kommentar
way/123456;14;4;gabled;Google Earth;Messung am 16.11.2026
```

Werte in dieser Datei gelten **vorrangig** vor den OSM-Werten. Die Spalte `quelle` wird als "Höhenquelle" im Modell gespeichert.

- `kennung`: steht in `gebaeude.csv` bzw. `fehlende_hoehen.csv` in der Spalte "OSM-Objekt".
- `hoehe_m`: Gesamthöhe bis zum First.
- `dachhoehe_m`: Höhe des Daches (Firsthöhe minus Traufhöhe). Bei Flachdach leer lassen.
- `dachform`: `flat`, `gabled` (Satteldach), `hipped` (Walmdach) oder `pyramidal`.

Danach Schritt 3 erneut ausführen. Diese Gebäude haben dann den Status "manuell".

## Schritt 6: STL für den 3D-Drucker

```
python src\03_stl_export.py --massstab 500
```

Das Programm schreibt `output\umgebungsmodell_1zu500.stl` und sagt dir die Größe in mm. Passt das Modell nicht aufs Druckbett, nennt es den nötigen Maßstab. Mit `--druckbett 250` gibst du die Kantenlänge deines Druckbetts an. Ein Gebiet von 800 x 1000 m passt nur in sehr kleinem Maßstab auf ein Druckbett. Das Teilen in Kacheln ist ein späterer Schritt.

## Wichtig

- Die STL-Datei enthält nur die Form. Die Maße stehen in der GLB-Datei, im Betrachter und in `gebaeude.csv`.
- Gebäude ohne Höhe in OpenStreetMap werden **nicht geschätzt**. Sie erscheinen als orange Grundplatte (Dicke 1 m, einstellbar in `gebiet.json`).
- Die Dateien in `data\` und `output\` kannst du jederzeit neu erzeugen.
