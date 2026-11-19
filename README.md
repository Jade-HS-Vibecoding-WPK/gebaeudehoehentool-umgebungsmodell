# Höhentool Umgebungsmodell

**Umgebungsmodell ohne CAD-Software: 3D-Druckdatei oder umgerechnete Maße für den Modellbau.**

Eine Web-App für Architekturstudierende: Man lädt einen 3D-Export eines Stadtausschnitts (z. B. von TopoExport). Die App erkennt jedes Gebäude mit Länge, Breite, Trauf- und Firsthöhe und Dachform. Daraus erstellt sie wahlweise druckfertige STL-Dateien für den 3D-Drucker oder eine Maßliste im gewünschten Maßstab für den Modellbau von Hand.

👉 **Direkt im Browser öffnen:** https://jade-hs-vibecoding-wpk.github.io/gebaeudehoehentool-umgebungsmodell/

![Startseite](screenshots/01_startseite.png)

---

## Inhalt

- [Was die App kann](#was-die-app-kann)
- [Schnellstart](#schnellstart)
- [Ansichten](#ansichten)
- [Exportieren](#exportieren)
- [3D-Druck auf Druckplatten](#3d-druck-auf-druckplatten)
- [Einstellungen](#einstellungen)
- [Datenquellen](#datenquellen)
- [Technik](#technik)
- [Projekt](#projekt)

---

## Was die App kann

- **3D-Exporte einlesen:** OBJ, DXF und STL, zum Beispiel von [TopoExport](https://topoexport.com/). Optional zusätzlich OpenStreetMap-Daten (`.osm`, `.json`, `.geojson`).
- **Gebäude erkennen:** Je Gebäude berechnet die App Länge, Breite, Traufhöhe, Firsthöhe, Dachneigung, Grundfläche und Dachform (Flach-, Pult-, Sattel-, Walm-, Krüppelwalm-, Mansard- und Pyramidendach).
- **Prüfen und korrigieren:** Ist die Dachform unsicher, schlägt die App Dachformen zur Auswahl vor. Maße lassen sich von Hand anpassen, auch einzelne Teile von L-, T- und U-förmigen Gebäuden.
- **Maßstab umrechnen:** Alle Maße erscheinen zusätzlich im Modellmaß, z. B. 1:500.
- **Exportieren:** 3D-Modell (GLB, OBJ, DXF), 3D-Druck (STL), Gebäudeliste (PDF, Excel).
- **Für den 3D-Druck optimieren:** Die Gebäude werden platzsparend auf Druckplatten verteilt. Jede Platte wird eine eigene STL-Datei, auf Wunsch mit eingelassenen Nummern und einem Belegungsplan als PDF.
- **Ohne Installation:** Alles läuft im Browser. Die Dateien werden nirgends hochgeladen.

---

## Schnellstart

1. Seite öffnen und auf **„Klicke hier zum Öffnen“** klicken.
2. Eine 3D-Datei auf das Feld **„Datei hierher ziehen“** ziehen oder links unter **3D-Datei** auswählen.
   Ohne eigene Datei geht **Testversion → Beispieldaten ausprobieren**. Das lädt einen Ausschnitt aus Wilhelmshaven (Quelle: TopoExport).
3. Links unter **Maßstab** den Maßstab eintragen, z. B. `500` für 1:500.
4. Gebäude in Karte, 3D-Modell oder Liste anklicken und unsichere Dachformen unter **Prüfen** bestätigen.
5. Oben rechts auf **Exportieren** klicken.

Bei Fragen hilft das kleine Häuschen unten rechts: Ein Klick darauf öffnet die Hilfe.

![Leere Seite: das Häuschen landet mit dem Fallschirm auf dem Feld „Datei hierher ziehen“](screenshots/02_leere_seite_fallschirm.png)

---

## Ansichten

Oben gibt es vier Reiter: **Karte**, **3D-Modell**, **Liste** und **3D + Liste**. Eine Auswahl gilt in allen Ansichten gleichzeitig.

| Bedienung | |
|---|---|
| Klick | Gebäude auswählen |
| Umschalt + Klick | mehrere Gebäude auswählen oder abwählen |
| Entf oder Mülleimer | ausgewählte Gebäude löschen |
| Ziehen / Strg + Ziehen / Mausrad | 3D-Modell drehen / verschieben / zoomen |

Die Farben zeigen den Stand jedes Gebäudes: *Maße vollständig*, *Dachform unsicher / Hinweis*, *Höhe fehlt (Grundplatte)* und *Nur im Export*. Ausgewählte Gebäude erscheinen cremefarben.

### 3D-Modell

![3D-Modell der Testversion Wilhelmshaven](screenshots/03_3d_modell.png)

### Gebäude-Details und Dachform

Rechts stehen alle Werte des ausgewählten Gebäudes, jeweils in Metern und im Modellmaß. Ist die Dachform unsicher, kann man sie direkt auswählen.

![Details eines Gebäudes mit Dachform-Auswahl](screenshots/04_gebaeude_details.png)

### Karte mit Nummern

Jedes Gebäude hat eine Nummer. Damit sich die Nummern bei vielen Gebäuden nicht überlagern, erscheinen sie erst beim Hineinzoomen.

![Karte mit Gebäudenummern](screenshots/05_karte_nummern.png)

### Liste

Alle Gebäude mit ihren Maßen in Metern und im Modellmaß. Die Liste lässt sich nach Nummer durchsuchen und filtern. Die Kopfzeile bleibt beim Scrollen stehen.

![Gebäudeliste](screenshots/06_liste.png)

### 3D + Liste

3D-Modell und Liste nebeneinander. Klickt man ein Gebäude in der Liste an, wird es im 3D-Modell hervorgehoben und herangezoomt. Rechts erscheinen seine Maße und die Dachformen zum Ändern.

![3D + Liste mit ausgewähltem Gebäude](screenshots/13_3d_liste_auswahl.png)

---

## Exportieren

![Export-Fenster](screenshots/07_export.png)

| Bereich | Formate | Wofür |
|---|---|---|
| **3D-Modell** | GLB, OBJ, DXF | Weiterarbeiten in 3D-Programmen, Maße in Metern |
| **3D-Druck** | STL | ganzes Modell in mm, oder auf Druckplatten verteilt (siehe unten) |
| **Liste drucken** | PDF | alle Maße als Tabelle |
| **Liste als Tabelle** | Excel (.xlsx) | zum Weiterrechnen |

Mit **„Mehrere Formate auf einmal speichern …“** lassen sich mehrere Dateien in einem Schritt speichern.

---

## 3D-Druck auf Druckplatten

Unter **3D-Druck → Auf Druckplatten verteilen** ordnet die App die Gebäude möglichst dicht auf Druckplatten der angegebenen Größe an, ohne dass sie sich berühren. Voreingestellt sind 180 × 180 mm, also die Druckfläche des Bambu Lab A1 mini.

- **Breite, Tiefe, Abstand (mm):** Größe der Druckplatte und Mindestabstand zwischen den Gebäuden.
- **Anordnung Druckplatte:** *Zuerst große Gebäude* oder *Zuerst kleine Gebäude*.
- **Gebäude:** *Alle Gebäude* oder *Nur ausgewählte*, zum Beispiel um einzelne Häuser nachzudrucken.
- **Nummer in die Unterseite einlassen:** Die Gebäudenummer wird 0,6 mm tief und gespiegelt in die Unterseite eingelassen. Außenmaße und Höhe bleiben gleich.
  - Ist für die volle Nummer kein Platz, bekommt das Gebäude eine Kurznummer wie **•3**, die nur auf ihrer Platte gilt.
  - Ist auch dafür kein Platz, findet man das Gebäude nur über den Belegungsplan.
- **Belegungsplan als PDF:** eine Seite je Druckplatte, bei 180-mm-Platten in Originalgröße. Nach dem Druck kann man die Teile direkt vom Druckbett auf den ausgedruckten Plan legen.

![Vorschau der Druckplatten](screenshots/08_druckplatten.png)

| Belegungsplan (PDF) | Unterseite mit eingelassenen Nummern |
|---|---|
| ![Belegungsplan](screenshots/09_belegungsplan.png) | ![Unterseite mit Nummern](screenshots/10_unterseite_nummern.png) |

> **Tipps für den Druck**
> - Im Slicer (z. B. Bambu Studio) die Teile **nicht automatisch neu anordnen lassen**, sonst passt die Lage nicht mehr zum Belegungsplan.
> - Den Belegungsplan mit **„Tatsächliche Größe“** drucken.
> - Die Ziffern sind 3,5 bis 7 mm hoch und für eine 0,4-mm-Düse ausgelegt.

---

## Einstellungen

Das Zahnrad oben rechts öffnet die Einstellungen:

- **Sprache:** Deutsch, English, Français, Español
- **Dunkelmodus**
- **Schriftgröße:** klein, mittel, groß
- **Häuschen:** Weihnachtsmütze an oder aus
- **Impressum und Quellen**

![Einstellungen](screenshots/11_einstellungen.png)

![Dunkelmodus mit 3D + Liste](screenshots/12_dunkelmodus.png)

---

## Datenquellen

- **TopoExport (Hauptquelle):** 3D-Exporte (DXF, OBJ, STL) mit Gebäudekörpern und Dachflächen. Daraus liest die App Trauf- und Firsthöhe, Dachneigung und Dachform. Auch die Testversion (Ausschnitt aus Wilhelmshaven) stammt von TopoExport.
  TopoExport stellt Daten aus amtlichen offenen Geodaten zusammen, in Niedersachsen in der Regel aus den 3D-Gebäudemodellen (LoD2) des LGLN.
  [topoexport.com](https://topoexport.com/) · [opengeodata.lgln.niedersachsen.de](https://opengeodata.lgln.niedersachsen.de/)
- **OpenStreetMap (optional):** nur wenn eine OSM-Datei geladen wird. Liefert Grundrisse, Gebäudeart, Geschosszahl und, wo eingetragen, Höhe und Dachform. Werte aus einer 3D-Datei haben immer Vorrang.
  © OpenStreetMap-Mitwirkende, Lizenz ODbL · [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright)

**So entstehen die Werte:**
- Länge und Breite werden aus dem Grundriss berechnet (kleinstes umschließendes Rechteck).
- Trauf- und Firsthöhe sowie die Dachneigung kommen aus den Dachflächen der 3D-Datei.

---

## Technik

- Die ganze App ist **eine einzige Datei** (`index.html`). Sie braucht keinen Server, keine Installation und keine externen Bibliotheken.
- Alles wird **lokal im Browser** berechnet. Geladene Dateien verlassen den Rechner nicht.
- 3D-Ansicht mit WebGL. PDF, Excel, STL, OBJ, DXF und GLB werden direkt im Browser erzeugt.
- Veröffentlicht über **GitHub Pages**.
  Nach einem Update die Seite einmal mit `?neu=1` am Ende der Adresse öffnen, damit der Browser keine alte, gespeicherte Fassung zeigt.

---

## Projekt

Studentisches Projekt im Wahlpflichtkurs **„Vibecoding“** an der **Jade Hochschule** (Wintersemester 2026/27) von Nele Geerdsen und Miriam Lorch.

\* Die App wurde mit KI erstellt und kann Fehler enthalten. Bitte wichtige Maße vor dem Modellbau prüfen.
