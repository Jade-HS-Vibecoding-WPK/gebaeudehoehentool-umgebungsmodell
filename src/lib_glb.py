"""Schreibt ein Modell als GLB (binäres glTF 2.0) und als STL.

Nur Standardbibliothek. In der GLB-Datei bekommt jedes Gebäude einen eigenen
"Knoten" (node). Seine Maße stehen im Feld "extras" dieses Knotens.
"""
import json
import struct

MATERIALIEN = {
    "ok": ("Gebäude", [0.80, 0.78, 0.74, 1.0]),
    "hinweis": ("Gebäude mit Hinweis", [0.90, 0.80, 0.30, 1.0]),
    "fehlt": ("Höhe fehlt", [0.95, 0.50, 0.10, 1.0]),
}
MATERIAL_INDEX = {"ok": 0, "hinweis": 1, "fehlt": 2}


def _auffuellen(daten, byte=b"\x00"):
    rest = (-len(daten)) % 4
    return daten + byte * rest


def schreibe_glb(pfad, gebaeude, meta):
    """gebaeude: Liste von Dicts mit punkte (x,y,z), dreiecke, material, eigenschaften, id."""
    binaer = bytearray()
    buffer_views, accessors, meshes, nodes = [], [], [], []
    kinder = []
    for b in gebaeude:
        # Modell (x Ost, y Nord, z oben) -> glTF (x Ost, y oben, z = -Nord)
        pos = [(x, z, -y) for x, y, z in b["punkte"]]
        pos_bytes = b"".join(struct.pack("<3f", *p) for p in pos)
        idx_bytes = b"".join(struct.pack("<3I", *t) for t in b["dreiecke"])

        bv_pos = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": len(binaer), "byteLength": len(pos_bytes), "target": 34962})
        binaer += _auffuellen(pos_bytes)
        bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": len(binaer), "byteLength": len(idx_bytes), "target": 34963})
        binaer += _auffuellen(idx_bytes)

        acc_pos = len(accessors)
        accessors.append({
            "bufferView": bv_pos, "componentType": 5126, "count": len(pos), "type": "VEC3",
            "min": [min(p[i] for p in pos) for i in range(3)],
            "max": [max(p[i] for p in pos) for i in range(3)],
        })
        acc_idx = len(accessors)
        accessors.append({"bufferView": bv_idx, "componentType": 5125, "count": len(b["dreiecke"]) * 3, "type": "SCALAR"})

        meshes.append({
            "name": b["id"],
            "primitives": [{"attributes": {"POSITION": acc_pos}, "indices": acc_idx,
                            "material": MATERIAL_INDEX[b["material"]], "mode": 4}],
        })
        kinder.append(len(nodes) + 1)
        nodes.append({"name": b["id"], "mesh": len(meshes) - 1, "extras": b["eigenschaften"]})

    root = {"name": "Umgebungsmodell", "children": kinder, "extras": meta}
    nodes.insert(0, root)

    gltf = {
        "asset": {"version": "2.0", "generator": "umgebungsmodell (Studienprojekt)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binaer)}],
        "materials": [
            {"name": name, "pbrMetallicRoughness": {"baseColorFactor": farbe, "metallicFactor": 0.0, "roughnessFactor": 1.0}}
            for name, farbe in (MATERIALIEN[k] for k in ("ok", "hinweis", "fehlt"))
        ],
    }
    json_bytes = _auffuellen(json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = _auffuellen(bytes(binaer))
    gesamt = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with open(pfad, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, gesamt))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(bin_bytes), b"BIN\x00"))
        f.write(bin_bytes)


def schreibe_stl(pfad, gebaeude, faktor):
    """Binäres STL. Koordinaten in Metern * faktor (z. B. 1000/500 für Millimeter bei 1:500).

    Achsen wie im Modell: x Ost, y Nord, z oben (so erwarten es Slicer).
    Gibt (anzahl_dreiecke, (minx,miny,minz), (maxx,maxy,maxz)) zurück.
    """
    dreiecke = []
    for b in gebaeude:
        p = b["punkte"]
        for a, bb, c in b["dreiecke"]:
            dreiecke.append((p[a], p[bb], p[c]))
    if not dreiecke:
        raise ValueError("Keine Dreiecke zum Schreiben")
    alle = [v for t in dreiecke for v in t]
    mn = tuple(min(v[i] for v in alle) for i in range(3))
    mx = tuple(max(v[i] for v in alle) for i in range(3))
    # Modell so verschieben, dass die Ecke links vorne unten bei (0,0,0) liegt
    with open(pfad, "wb") as f:
        f.write(b"Umgebungsmodell STL".ljust(80, b" "))
        f.write(struct.pack("<I", len(dreiecke)))
        for a, b, c in dreiecke:
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            ln = (nx * nx + ny * ny + nz * nz) ** 0.5
            if ln > 0:
                nx, ny, nz = nx / ln, ny / ln, nz / ln
            f.write(struct.pack("<3f", nx, ny, nz))
            for v in (a, b, c):
                f.write(struct.pack("<3f", (v[0] - mn[0]) * faktor, (v[1] - mn[1]) * faktor, (v[2] - mn[2]) * faktor))
            f.write(b"\x00\x00")
    return len(dreiecke), mn, mx
