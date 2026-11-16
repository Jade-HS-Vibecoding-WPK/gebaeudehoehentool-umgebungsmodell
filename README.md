# Umgebungsmodell: Gebäudehöhen automatisch ermitteln und als 3D-Modell ausgeben

Höhen und Geschosszahlen von Gebäuden in einem bestimmten Gebiet werden automatisch ermittelt und als 3D-Modell dargestellt. Jedes Gebäude trägt seine Maße digital als Eigenschaften, und das Modell lässt sich für den 3D-Druck exportieren.

## Ziel

- Eine 3D-Datei mit den Gebäuden eines Gebiets (Umgebungsmodell).
- Jedes Gebäude enthält digital: **Name, Länge, Breite, Traufhöhe, Firsthöhe, Dachform**.
- Die Maße sind direkt im Modell ablesbar.
- Das Modell kann direkt an einen 3D-Drucker weitergegeben werden.

## Festlegungen

- **Kein Maßstab** im Modell: Es entsteht in echten Metern. Der Maßstab wird erst beim Drucken gewählt.
- **Datenquellen:** Grundrisse aus OpenStreetMap (OSM). Höhen aus Google Earth, von Hand abgelesen und in `config/korrekturen.csv` eingetragen. OSM-Höhen gelten nur, wo kein Google-Earth-Wert vorliegt.
- **Gebäudeformen:** Zuerst Quader mit Dach (Flach-, Sattel-, Walmdach usw.). Nicht rechteckige Grundrisse (z. B. L-Form) folgen später.
- **Umsetzung:** Die Programmierung übernimmt Claude. Das Team prüft die Ergebnisse.

## Ausgabeformate

| Datei | Zweck |
|---|---|
| **GLB (glTF)** | 3D-Modell mit den Maßen als Eigenschaften jedes Gebäudes |
| **STL** | Wird aus demselben Modell erzeugt, nur für den 3D-Drucker (enthält keine Maße) |
| **CSV** | Liste aller Gebäude mit ihren Maßen zur Kontrolle |
| **Webseite (Betrachter)** | Modell drehen, Gebäude anklicken, Maße sehen |

## Höhen

1. Die Höhe wird direkt im 3D-Körper modelliert und mit ihrer **Quelle** (Google Earth, OSM oder manuell) im Modell gespeichert.
2. Vorrang haben Google-Earth-Werte aus `config/korrekturen.csv`, danach OSM-Werte.
3. Es wird nichts geschätzt. Gebäude ohne Höhe erscheinen als flache Grundplatte mit der Markierung **"Höhe fehlt"**.

Quellenangabe: © OpenStreetMap-Mitwirkende (ODbL); Höhen: Google Earth (von Hand abgelesen).

## Arbeitsplan

1. **Grundlagen:** GitHub, Repository, Python und OSM verstehen
2. **Arbeitsumgebung:** Python auf dem Rechner einrichten
3. **Projekt holen:** Repository in den lokalen Ordner laden
4. **Gebiet festlegen:** Rechteck um das gewünschte Gebiet wählen
5. **OSM-Daten laden:** Grundrisse, Dachform und Höhenangaben abrufen
6. **Lücken prüfen:** Fehlende Höhen schätzen oder nachtragen
7. **3D-Modell bauen:** Gebäudekörper mit Dach erzeugen
8. **Maße einbetten:** Länge, Breite, Traufhöhe, Firsthöhe und Name an jedes Gebäude hängen
9. **Betrachter-Webseite:** Modell ansehen und Maße per Klick anzeigen
10. **Export für den Druck:** STL erzeugen und prüfen, ob alle Körper geschlossen sind
11. **Zusammenarbeit:** Änderungen abwechselnd speichern und hochladen

## Offene Fragen

- Welches Gebiet wird zuerst modelliert?
- Läuft alles auf einem Windows-Rechner, und darf dort Software (Python) installiert werden?
- Haben beide Teammitglieder Schreibrechte im Repository und ein GitHub-Konto?
- Sollen fehlende Höhen automatisch geschätzt werden?

## Team

Zusammenarbeit zu zweit, abwechselnd (Annahme, bitte bestätigen).

## Lizenz

MIT, siehe Datei `LICENSE`.
