"""Baut aus webapp/src/ die eine Datei webapp/index.html (alles in einer Datei).

Aufruf:  python webapp/bauen.py
"""
import os

HIER = os.path.dirname(os.path.abspath(__file__))


def lesen(name):
    with open(os.path.join(HIER, "src", name), encoding="utf-8") as f:
        return f.read()


seite = lesen("template.html")
seite = seite.replace("/*CORE*/", lesen("core.js")).replace("/*APP*/", lesen("app.js"))
with open(os.path.join(HIER, "index.html"), "w", encoding="utf-8") as f:
    f.write(seite)
print("geschrieben: webapp/index.html ({:.0f} KB)".format(len(seite.encode("utf-8")) / 1024))
