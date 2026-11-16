# Umsetzungsplan: Umgebungsmodell Südzentrale Wilhelmshaven

Stand: 16.11.2026. Dieser Plan beschreibt, wie aus OpenStreetMap-Daten ein 3D-Umgebungsmodell mit digital hinterlegten Maßen entsteht. Er ergänzt die `README.md`.

## 1. Ziel

Ein Umgebungsmodell der Gebäude rund um das alte Gelände der Südzentrale bei der Kaiser-Wilhelm-Brücke in Wilhelmshaven.

- Jedes Gebäude ist ein eigener Körper mit Dach.
- Jedes Gebäude trägt digital seine Maße: **Länge, Breite, Traufhöhe, Firsthöhe, Dachform, Name/ID**.
- Das Modell ist **gleich wichtig** fürs Drucken und für die digitale Weiterarbeit.
- Die Maße lassen sich direkt am Modell ablesen, am wichtigsten in einer Betrachter-Webseite (Klick auf ein Gebäude zeigt die Maße).

## 2. Festlegungen aus dem Interview

| Thema | Entscheidung |
|---|---|
| Gebiet | Testgebiet um die Südzentrale / Kaiser-Wilhelm-Brücke, **800 m x 1000 m** |
| Datenquelle | **Grundrisse aus OpenStreetMap (OSM)**, **Höhen aus Google Earth** (Claude liest sie von Hand ab, nicht automatisch) |
| Maßstab | Keiner im Modell. Es entsteht in echten Metern. Der Maßstab wird erst beim STL-Export gewählt |
| Gebäudeform | Zuerst Quader mit Dach. Andere Grundrisse später |
| Höhen | **Nur gemessene oder abgelesene Werte, nichts wird geschätzt.** Gebäude ohne Höhe (weder OSM noch Google Earth) erscheinen als **flache Grundplatte** mit der Markierung "Höhe fehlt". Die Höhe wird direkt als Geometrie modelliert und zusätzlich mit ihrer Quelle als Eigenschaft gespeichert |
| Betrachter | **Sehr wichtig**, gehört zum Kernumfang |
| Rechner | Windows, Installation erlaubt |
| GitHub | Beide haben ein Konto und Schreibrechte |
| Arbeitsweise | Zu zweit, Claude schreibt den Code, ihr prüft die Ergebnisse |

## 3. Ergebnisse (Dateien)

| Datei | Zweck |
|---|---|
| `output/umgebungsmodell.glb` | 3D-Modell, Maße als Eigenschaften (`extras`) an jedem Gebäude |
| `output/umgebungsmodell.stl` | Für den 3D-Drucker, mit gewähltem Maßstab. Enthält keine Maße |
| `output/gebaeude.csv` | Tabelle aller Gebäude mit Maßen, auch in Excel lesbar |
| `output/fehlende_hoehen.csv` | Liste der Gebäude ohne Höhenangabe, zum Nachtragen |
| `viewer/index.html` | Betrachter im Browser: drehen, anklicken, Maße sehen |

Hinweis: STL kann keine Maße speichern. Deshalb ist GLB das Hauptformat für "Maße im Modell". Die GLB lässt sich später auch in Programme wie Blender importieren. Für Rhino oder Revit klären wir bei Bedarf ein zusätzliches Format (z. B. OBJ oder IFC).

## 4. Technischer Ansatz

- **Sprache:** Python (gut lesbar, viele fertige Bausteine).
- **Daten holen:** OSM über die Overpass-API (Gebäude mit Tags im Gebiet).
- **Koordinaten:** Umrechnung von Längen-/Breitengrad in Meter (UTM 32N, EPSG:25832), damit alle Maße in Metern stimmen.
- **Gebäudekörper:** Grundriss nach oben ziehen (Extrusion), Dach nach Dachform ergänzen.
- **Länge/Breite:** Bei Quadern aus dem kleinsten umschließenden Rechteck des Grundrisses.
- **Höhen:** Die Höhe wird direkt im 3D-Körper modelliert (Wandhöhe bis zur Traufe, Dach bis zum First). Vorrang haben die in Google Earth abgelesenen Werte (Datei `config/korrekturen.csv`). Wo dort nichts steht, gelten die OSM-Tags `height`, `roof:height`, `roof:shape`. Traufhöhe = Firsthöhe minus Dachhöhe. Die Geschosszahl (`building:levels`) wird nur als Information gespeichert, nicht in Meter umgerechnet. Jedes Gebäude speichert seine **Höhenquelle** ("Google Earth", "OSM" oder "manuell").
- **Export:** GLB mit Eigenschaften je Gebäude, CSV, STL.
- **Betrachter:** Webseite mit three.js, die die GLB lädt und beim Klick die Eigenschaften anzeigt. Sie läuft über einen kleinen lokalen Server (`python -m http.server`).
- **Quellenangabe:** "© OpenStreetMap-Mitwirkende" (Lizenz ODbL) und "Höhen: Google Earth" gehören in README und Betrachter. Google-Earth-Daten werden nur von Hand abgelesen und in die Korrekturdatei eingetragen, nicht automatisch ausgelesen. Für veröffentlichte Abbildungen gelten die Nutzungsbedingungen von Google.

### Geplante Ordnerstruktur

```
config/gebiet.json        Gebiet (Mittelpunkt, 800 x 1000 m), Einstellungen
src/                      Python-Skripte (je ein Skript pro Schritt)
data/                     heruntergeladene Rohdaten
output/                   fertige Dateien
viewer/                   Betrachter-Webseite
README.md, PLAN.md
```

## 5. Meilensteine

Jeder Meilenstein hat ein klares "Fertig, wenn".

### M0: Grundlagen und Einrichtung
- Ich erkläre GitHub, Repository, Commit, Python und OSM in einfachen Worten.
- Auf euren Windows-Rechnern werden **Git** (oder GitHub Desktop) und **Python** installiert, ich führe euch Schritt für Schritt.
- Das Repository wird in den Ordner "Claude Pro" geholt. Die vorhandene README wird mit der neuen zusammengeführt.
- **Fertig, wenn:** Beide können das Repository öffnen, eine Änderung speichern und hochladen.

### M1: Gebiet festlegen
- Wir bestimmen gemeinsam den Mittelpunkt (Südzentrale) auf der Karte und legen das Rechteck von 800 x 1000 m fest.
- **Fertig, wenn:** `config/gebiet.json` existiert und das Rechteck auf einer Karte geprüft wurde.

### M2: OSM-Daten laden und prüfen
- Gebäude im Gebiet laden und lokal speichern.
- Bericht erstellen: Wie viele Gebäude gibt es, wie viele haben Höhe, Dachform, Geschosszahl?
- **Fertig, wenn:** Der Bericht liegt vor und ihr wisst, wie vollständig die Daten sind.

### M3: Erstes Gebäude
- Ein einzelnes Gebäude mit Maßen und Dach als 3D-Körper bauen und als GLB speichern.
- **Fertig, wenn:** Die Datei lässt sich in einem 3D-Betrachter öffnen und die Maße stimmen mit der Karte überein.

### M4: Alle Gebäude (Quader und Dachformen)
- Alle Gebäude des Gebiets bauen. Unterstützte Dachformen zuerst: flach, Satteldach, Walmdach (weitere nach Bedarf).
- Gebäude ohne Höhe werden als flache Grundplatte mit Markierung "Höhe fehlt" erzeugt.
- **Fertig, wenn:** Das ganze Gebiet ist als eine GLB-Datei vorhanden und `fehlende_hoehen.csv` wird mitgeschrieben.

### M5: Maße einbetten und Tabelle
- Länge, Breite, Traufhöhe, Firsthöhe, Dachform, ID und Datenstatus ("OSM-Wert" oder "Höhe fehlt") werden an jedes Gebäude gehängt.
- `gebaeude.csv` entsteht aus denselben Daten.
- **Fertig, wenn:** Stichproben (ca. 10 Gebäude) stimmen zwischen Modell, CSV und Karte überein.

### M6: Betrachter-Webseite
- Modell im Browser drehen und zoomen, Gebäude anklicken, Maße in einem Fenster anzeigen. Gebäude ohne Höhe sind farblich erkennbar.
- **Fertig, wenn:** Beide Teammitglieder können die Seite lokal starten und die Maße ablesen.

### M7: Höhen aus Google Earth ablesen
- Claude liest die Höhen (First, Traufe, Dachform) der Gebäude von Hand in Google Earth ab und trägt sie mit Quelle und Datum in `config/korrekturen.csv` ein. Reihenfolge: zuerst die Gebäude ohne OSM-Höhe, danach die Gebäude rund um die Südzentrale, danach der Rest. Ihr stichprobenartig gegenprüft.
- **Fertig, wenn:** Das Modell mit den Korrekturen neu erzeugt werden kann, ohne Code zu ändern, und für alle Gebäude im Kerngebiet eine Höhenquelle eingetragen ist.

### M8: Druckfertig machen
- Maßstab wählen, STL erzeugen, prüfen ob alle Körper geschlossen sind und ob das Modell aufs Druckbett passt (ggf. in Kacheln teilen).
- Entscheidung, ob eine Grundplatte (Sockel) mitgedruckt wird.
- **Fertig, wenn:** Eine STL-Datei ist im Slicer des Druckers fehlerfrei geladen.

### M9: Erweiterung (später)
- Nicht rechteckige Grundrisse (L-Form u. a.), genauere Dachformen, Gelände, Straßen, Wasserflächen.

## 6. Zusammenarbeit zu zweit

- Gemeinsames Repository auf GitHub.
- Vor jeder Arbeitssitzung: neueste Version holen ("pull"). Nach der Arbeit: Änderungen speichern und hochladen ("commit" und "push").
- Zu Beginn arbeitet ihr **abwechselnd**, damit es keine Konflikte gibt. Später zeige ich euch Branches, damit ihr parallel arbeiten könnt.
- Aufgabenteilung als Vorschlag: Person A kümmert sich um Daten und Prüfung (M2, M5, M7), Person B um Betrachter und Druck (M6, M8). Das legt ihr selbst fest.

## 7. Risiken und offene Punkte

| Risiko / Frage | Umgang damit |
|---|---|
| OSM hat in diesem Gebiet viele Gebäude ohne Höhe. Dann sind viele Gebäude nur Grundplatten | M2 liefert eine Zahl dazu. Falls der Anteil hoch ist, besprechen wir, ob doch aus der Geschosszahl geschätzt werden soll |
| Google-Earth-Höhen sind Ablesungen und keine amtlichen Messwerte (Genauigkeit grob ca. 1 bis 3 m, je nach Ansicht) | Jede Höhe bekommt Quelle und Datum. Stichproben gegen Pläne oder Messungen. Die Genauigkeit nennen wir in der Arbeit |
| Hunderte Gebäude von Hand abzulesen ist sehr aufwendig, und Google Earth im Browser kann Anmeldung oder Grafikfunktionen verlangen | M2 nennt die Gebäudeanzahl. Wir legen ein Kerngebiet fest und messen dort zuerst |
| Dachform fehlt in OSM | Gebäude bekommt ein Flachdach, Markierung "Dachform fehlt" |
| Firsthöhe vorhanden, Traufhöhe nicht berechenbar (kein `roof:height`) | Traufhöhe bleibt leer und wird markiert |
| Größe 800 x 1000 m ergibt viele Gebäude, Modell evtl. zu groß für ein Druckbett | In M8 Maßstab und Teilung klären |
| Windows-Installation (Rechte, Pfade mit Leerzeichen und OneDrive) | In M0 testen. Bei Problemen ggf. Projektordner außerhalb von OneDrive ablegen |
| Meine Arbeitsumgebung kann Windows-Programme nicht für euch installieren | Ihr installiert nach meiner Anleitung. Ich schreibe und teste den Code |
| Kaiser-Wilhelm-Brücke und Hafenanlagen sind keine Gebäude | Brücken, Kräne usw. sind zunächst nicht Teil des Modells. Ob sie als einfache Körper hinzukommen, entscheiden wir in M9 |

## 8. Nächster Schritt

M0 starten: Grundlagen erklären, Git und Python auf einem Rechner einrichten und das Repository in den Ordner "Claude Pro" holen.
