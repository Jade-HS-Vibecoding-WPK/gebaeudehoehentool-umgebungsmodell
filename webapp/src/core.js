/* Umgebungsmodell – Kern der Web-App (ohne Oberfläche, ohne Abhängigkeiten).
   Alles in Metern. Koordinaten im Modell: x = Ost, y = Nord, z = oben. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const U = {};

  // ------------------------------------------------------------------ Geo
  U.projection = function (lat0, lon0) {
    const ky = (Math.PI / 180) * 6378137;
    const kx = ky * Math.cos((lat0 * Math.PI) / 180);
    return {
      fwd: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky],
      inv: (x, y) => [lat0 + y / ky, lon0 + x / kx],
    };
  };
  U.bboxFromCenter = function (lat0, lon0, breiteOW, laengeNS) {
    const dlat = laengeNS / 2 / 111320;
    const dlon = breiteOW / 2 / (111320 * Math.cos((lat0 * Math.PI) / 180));
    return { s: lat0 - dlat, w: lon0 - dlon, n: lat0 + dlat, e: lon0 + dlon };
  };
  U.parseNum = function (t) {
    if (t === null || t === undefined) return null;
    const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(m|meter)?\s*$/i.exec(String(t));
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };

  // ------------------------------------------------------------------ 2D-Geometrie
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  U.signedArea = function (p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  };
  function distPointLine(p, a, b) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(cross(a, b, p)) / l;
  }
  U.cleanRing = function (pts, tol) {
    tol = tol === undefined ? 0.01 : tol;
    let p = pts.map((q) => [q[0], q[1]]);
    if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < tol) p.pop();
    const n1 = [];
    for (const q of p) {
      if (!n1.length || Math.hypot(q[0] - n1[n1.length - 1][0], q[1] - n1[n1.length - 1][1]) >= tol) n1.push(q);
    }
    p = n1;
    let changed = true;
    while (changed && p.length > 3) {
      changed = false;
      for (let i = 0; i < p.length; i++) {
        const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
        if (distPointLine(b, a, c) < tol) { p.splice(i, 1); changed = true; break; }
      }
    }
    if (p.length >= 3 && U.signedArea(p) < 0) p.reverse();
    return p;
  };
  U.convexHull = function (points) {
    const pts = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length <= 2) return pts;
    const lo = [];
    for (const p of pts) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
      lo.push(p);
    }
    const up = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
      up.push(p);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  };
  U.minRect = function (pts) {
    const h = U.convexHull(pts);
    const n = h.length;
    if (n < 3) return null;
    let best = null;
    for (let i = 0; i < n; i++) {
      const p = h[i], q = h[(i + 1) % n];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < 1e-9) continue;
      const ex = (q[0] - p[0]) / d, ey = (q[1] - p[1]) / d, nx = -ey, ny = ex;
      let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
      for (const r of h) {
        const u = (r[0] - p[0]) * ex + (r[1] - p[1]) * ey;
        const v = (r[0] - p[0]) * nx + (r[1] - p[1]) * ny;
        if (u < umin) umin = u; if (u > umax) umax = u;
        if (v < vmin) vmin = v; if (v > vmax) vmax = v;
      }
      const area = (umax - umin) * (vmax - vmin);
      if (!best || area < best.area) best = { area, p, ex, ey, nx, ny, umin, umax, vmin, vmax };
    }
    if (!best) return null;
    const du = best.umax - best.umin, dv = best.vmax - best.vmin;
    let ax, ay, bx, by, a0, a1, b0, b1;
    if (du >= dv) { ax = best.ex; ay = best.ey; bx = best.nx; by = best.ny; a0 = best.umin; a1 = best.umax; b0 = best.vmin; b1 = best.vmax; }
    else { ax = best.nx; ay = best.ny; bx = -best.ex; by = -best.ey; a0 = best.vmin; a1 = best.vmax; b0 = -best.umax; b1 = -best.umin; }
    const P = best.p;
    const pt = (a, b) => [P[0] + a * ax + b * bx, P[1] + a * ay + b * by];
    return { laenge: Math.max(du, dv), breite: Math.min(du, dv), ecken: [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)] };
  };
  function inTri(p, a, b, c) {
    const eps = 1e-9;
    return cross(a, b, p) > eps && cross(b, c, p) > eps && cross(c, a, p) > eps;
  }
  U.triangulate = function (pts) {
    const idx = pts.map((_, i) => i);
    const tris = [];
    let ok = true, guard = 0;
    while (idx.length > 3) {
      if (++guard > 10 * pts.length * pts.length + 100) { ok = false; break; }
      const m = idx.length;
      let found = false;
      for (let k = 0; k < m; k++) {
        const i0 = idx[(k + m - 1) % m], i1 = idx[k], i2 = idx[(k + 1) % m];
        const a = pts[i0], b = pts[i1], c = pts[i2];
        if (cross(a, b, c) <= 1e-9) continue;
        let blocked = false;
        for (const j of idx) {
          if (j === i0 || j === i1 || j === i2) continue;
          if (inTri(pts[j], a, b, c)) { blocked = true; break; }
        }
        if (blocked) continue;
        tris.push([i0, i1, i2]);
        idx.splice(k, 1);
        found = true;
        break;
      }
      if (!found) {
        ok = false;
        tris.push([idx[idx.length - 1], idx[0], idx[1]]);
        idx.shift();
      }
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return { tris, ok };
  };
  U.polyCentroid = function (p) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i], r = p[(i + 1) % p.length];
      const f = q[0] * r[1] - r[0] * q[1];
      a += f; cx += (q[0] + r[0]) * f; cy += (q[1] + r[1]) * f;
    }
    if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
    return [cx / (3 * a), cy / (3 * a)];
  };
  U.pointInPoly = function (pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  // Vieleck im Raum (z. B. Dachfläche aus OBJ/DXF) in Dreiecke zerlegen; Orientierung bleibt erhalten
  function triangulateFace(pts) {
    const n = pts.length;
    if (n < 3) return [];
    if (n === 3) return [[0, 1, 2]];
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let proj, sign;
    if (az >= ax && az >= ay) { proj = pts.map((p) => [p[0], p[1]]); sign = nz >= 0 ? 1 : -1; }
    else if (ax >= ay) { proj = pts.map((p) => [p[1], p[2]]); sign = nx >= 0 ? 1 : -1; }
    else { proj = pts.map((p) => [p[2], p[0]]); sign = ny >= 0 ? 1 : -1; }
    if (n === 4 && sign > 0 && cross(proj[0], proj[1], proj[2]) > 0 && cross(proj[1], proj[2], proj[3]) > 0 &&
        cross(proj[2], proj[3], proj[0]) > 0 && cross(proj[3], proj[0], proj[1]) > 0) return [[0, 1, 2], [0, 2, 3]];
    const order = sign > 0 ? proj.map((_, i) => i) : proj.map((_, i) => n - 1 - i);
    const res = U.triangulate(order.map((i) => proj[i]));
    return res.tris.map((t) => {
      const a = order[t[0]], b = order[t[1]], c = order[t[2]];
      return sign > 0 ? [a, b, c] : [a, c, b];
    });
  }

  // ------------------------------------------------------------------ Dateiformate
  U.parseOBJ = function (text) {
    const verts = [], groups = new Map(), warnings = [];
    let cur = 'Objekt';
    for (const raw of text.split(/\r?\n/)) {
      if (raw.length < 2) continue;
      const c0 = raw[0], c1 = raw[1];
      if (c0 === 'v' && c1 === ' ') {
        const p = raw.trim().split(/\s+/);
        verts.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
      } else if ((c0 === 'o' || c0 === 'g') && c1 === ' ') {
        cur = raw.slice(2).trim() || cur;
      } else if (c0 === 'f' && c1 === ' ') {
        const p = raw.trim().split(/\s+/).slice(1);
        const face = p.map((s) => {
          let i = parseInt(s.split('/')[0], 10);
          i = i < 0 ? verts.length + i : i - 1;
          return verts[i];
        });
        if (face.some((v) => !v)) continue;
        let g = groups.get(cur);
        if (!g) { g = []; groups.set(cur, g); }
        for (const t of triangulateFace(face)) g.push([face[t[0]], face[t[1]], face[t[2]]]);
      }
    }
    return { groups: [...groups].map(([name, tris]) => ({ name, tris })), warnings };
  };

  U.parseSTL = function (buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const tris = [];
    if (u8.byteLength >= 84) {
      const n = dv.getUint32(80, true);
      if (84 + 50 * n === u8.byteLength) {
        for (let i = 0; i < n; i++) {
          const o = 84 + 50 * i + 12;
          const t = [];
          for (let k = 0; k < 3; k++) t.push([dv.getFloat32(o + 12 * k, true), dv.getFloat32(o + 12 * k + 4, true), dv.getFloat32(o + 12 * k + 8, true)]);
          tris.push(t);
        }
        return { groups: [{ name: 'STL', tris }], warnings: [] };
      }
    }
    let text = '';
    for (let i = 0; i < u8.length; i += 65536) text += String.fromCharCode.apply(null, u8.subarray(i, i + 65536));
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m, cur = [];
    while ((m = re.exec(text))) {
      cur.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      if (cur.length === 3) { tris.push(cur); cur = []; }
    }
    return { groups: [{ name: 'STL', tris }], warnings: tris.length ? [] : ['STL-Datei enthält keine Dreiecke'] };
  };

  // DXF: liest ASCII- und Binär-DXF (AutoCAD ab 2000). Unterstützt 3DFACE, POLYLINE (Polyface) und MESH.
  function dxfGruppenBinaer(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const dec = new TextDecoder('windows-1252');
    const out = [];
    let i = 22;
    const n = u8.length;
    while (i + 2 <= n) {
      const c = dv.getUint16(i, true); i += 2;
      let v;
      if (c < 10 || (c >= 100 && c <= 102) || c === 105 || (c >= 300 && c <= 309) || (c >= 320 && c <= 369) || (c >= 390 && c <= 399) ||
          (c >= 410 && c <= 419) || (c >= 430 && c <= 439) || (c >= 470 && c <= 481) || c === 999 || (c >= 1000 && c <= 1009)) {
        let j = i; while (j < n && u8[j] !== 0) j++;
        v = dec.decode(u8.subarray(i, j)); i = j + 1;
      } else if ((c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239) || (c >= 460 && c <= 469) || (c >= 1010 && c <= 1059)) {
        v = dv.getFloat64(i, true); i += 8;
      } else if ((c >= 60 && c <= 79) || (c >= 170 && c <= 179) || (c >= 270 && c <= 289) || (c >= 370 && c <= 389) || (c >= 400 && c <= 409) || (c >= 1060 && c <= 1070)) {
        v = dv.getInt16(i, true); i += 2;
      } else if ((c >= 90 && c <= 99) || (c >= 420 && c <= 429) || (c >= 440 && c <= 459) || c === 1071) {
        v = dv.getInt32(i, true); i += 4;
      } else if (c >= 160 && c <= 169) {
        v = Number(dv.getBigInt64(i, true)); i += 8;
      } else if (c >= 290 && c <= 299) {
        v = u8[i]; i += 1;
      } else if (c >= 310 && c <= 319) {
        const l = u8[i]; v = null; i += 1 + l;
      } else throw new Error('DXF: unbekannter Gruppencode ' + c);
      out.push([c, v]);
    }
    return out;
  }
  function dxfGruppenText(text) {
    const L = text.split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < L.length; i += 2) {
      const c = parseInt(L[i].trim(), 10);
      if (!isFinite(c)) continue;
      out.push([c, L[i + 1].trim()]);
    }
    return out;
  }
  U.parseDXF = function (src) {
    let G;
    const u8 = typeof src === 'string' ? null : (src instanceof Uint8Array ? src : new Uint8Array(src));
    if (u8) {
      let head = ''; for (let i = 0; i < Math.min(22, u8.length); i++) head += String.fromCharCode(u8[i]);
      G = head.indexOf('AutoCAD Binary DXF') === 0 ? dxfGruppenBinaer(u8) : dxfGruppenText(new TextDecoder('utf-8').decode(u8));
    } else G = dxfGruppenText(src);
    const ents = [];
    let cur = null, inEntities = false;
    for (let i = 0; i < G.length; i++) {
      const code = G[i][0], val = G[i][1];
      if (code === 0) {
        if (val === 'SECTION') { cur = null; continue; }
        if (val === 'ENDSEC') { cur = null; inEntities = false; continue; }
        cur = { type: val, p: [] };
        if (inEntities) ents.push(cur);
      } else if (code === 2 && cur === null && val === 'ENTITIES') {
        inEntities = true;
      } else if (cur) cur.p.push([code, val]);
    }
    const num = (e, code) => { const f = e.p.find((q) => q[0] === code); return f ? parseFloat(f[1]) : 0; };
    const layerOf = (e) => { const f = e.p.find((q) => q[0] === 8); return f ? String(f[1]) : 'Layer0'; };
    const groups = new Map(), warnings = [], unsupported = new Map();
    const add = (name, tri) => { let g = groups.get(name); if (!g) { g = []; groups.set(name, g); } g.push(tri); };
    let nMesh = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.type === '3DFACE') {
        const v = [0, 1, 2, 3].map((k) => [num(e, 10 + k), num(e, 20 + k), num(e, 30 + k)]);
        const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
        const L2 = layerOf(e);
        if (same(v[2], v[3])) add(L2, [v[0], v[1], v[2]]);
        else { add(L2, [v[0], v[1], v[2]]); add(L2, [v[0], v[2], v[3]]); }
      } else if (e.type === 'MESH') {
        // SubD-Netz: 92 = Anzahl Punkte, dann je Punkt 10/20/30; 93 = Länge der Flächenliste, dann 90-Werte (Anzahl, Indizes ...)
        const verts = [], fl = [];
        let nv = -1, nf = -1, k = 0, px = null, py = null;
        for (const [c, v] of e.p) {
          if (c === 92 && nv < 0) { nv = v; continue; }
          if (nv >= 0 && verts.length < nv) {
            if (c === 10) px = v; else if (c === 20) py = v; else if (c === 30) verts.push([px, py, v]);
            continue;
          }
          if (c === 93 && nf < 0) { nf = v; continue; }
          if (nf >= 0 && k < nf && c === 90) { fl.push(v); k++; }
        }
        const layer = layerOf(e), name = layer + '#' + (++nMesh);
        for (let p = 0; p < fl.length;) {
          const cnt = fl[p++];
          const face = fl.slice(p, p + cnt).map((q) => verts[q]);
          p += cnt;
          if (cnt < 3 || face.some((q) => !q)) continue;
          for (const t of triangulateFace(face)) add(name, [face[t[0]], face[t[1]], face[t[2]]]);
        }
      } else if (e.type === 'POLYLINE') {
        const flags = num(e, 70);
        const layer = layerOf(e);
        const pv = [], faces = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type !== 'SEQEND'; j++) {
          if (ents[j].type !== 'VERTEX') continue;
          const f = num(ents[j], 70);
          if ((f & 128) && !(f & 64)) faces.push([71, 72, 73, 74].map((c) => Math.abs(num(ents[j], c))).filter((x) => x > 0));
          else pv.push([num(ents[j], 10), num(ents[j], 20), num(ents[j], 30)]);
        }
        i = j;
        if (flags & 64) {
          for (const f of faces) {
            const face = f.map((k) => pv[k - 1]).filter(Boolean);
            if (face.length < 3) continue;
            for (const t of triangulateFace(face)) add(layer, [face[t[0]], face[t[1]], face[t[2]]]);
          }
        } else unsupported.set('POLYLINE', (unsupported.get('POLYLINE') || 0) + 1);
      } else if (e.type !== 'VERTEX' && e.type !== 'SEQEND') {
        unsupported.set(e.type, (unsupported.get(e.type) || 0) + 1);
      }
    }
    // Viele Ebenen (z. B. TopoExport): nur Gebäude-Ebene verwenden
    const namen = [...groups.keys()];
    const ebeneVon = (n) => n.split('#')[0];
    const geb = namen.filter((n) => /BUILDING|GEBAEUDE|GEBÄUDE/i.test(ebeneVon(n)));
    if (geb.length && geb.length < namen.length) {
      const verworfen = [...new Set(namen.filter((n) => !geb.includes(n)).map(ebeneVon))];
      for (const n of namen) if (!geb.includes(n)) groups.delete(n);
      warnings.push('Nur die Gebäude-Ebene wurde gelesen (übersprungen: ' + verworfen.join(', ') + ').');
    }
    if (!groups.size) {
      warnings.push('DXF enthält keine lesbaren Flächen' + (unsupported.size ? '. Gefunden: ' + [...unsupported].map(([k, v]) => k + ' x' + v).join(', ') : '') + '. Bitte als OBJ exportieren.');
    }
    return { groups: [...groups].map(([name, tris]) => ({ name, tris })), warnings };
  };

  U.parseModelFile = function (name, arrayBuffer) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const u8 = new Uint8Array(arrayBuffer);
    const dec = () => new TextDecoder('utf-8').decode(u8);
    if (ext === 'obj') return U.parseOBJ(dec());
    if (ext === 'stl') return U.parseSTL(u8);
    if (ext === 'dxf') return U.parseDXF(u8);
    if (ext === 'ifc' || ext === 'pdf' || ext === 'svg') {
      return { groups: [], warnings: ['Das Format .' + ext + ' wird nicht gelesen. Bitte OBJ, DXF oder STL exportieren.'] };
    }
    const t = dec();
    if (/^\s*(solid|facet)/i.test(t.slice(0, 200))) return U.parseSTL(u8);
    if (/\nf\s/.test(t)) return U.parseOBJ(t);
    return { groups: [], warnings: ['Dateiformat nicht erkannt. Erlaubt: OBJ, DXF, STL.'] };
  };

  // ------------------------------------------------------------------ Gebäude aus Dreiecken trennen
  U.splitComponents = function (groups) {
    const comps = [];
    for (const g of groups) {
      const ids = new Map(), parent = [];
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const vid = (v) => {
        const k = Math.round(v[0] * 1000) + ',' + Math.round(v[1] * 1000) + ',' + Math.round(v[2] * 1000);
        let id = ids.get(k);
        if (id === undefined) { id = parent.length; ids.set(k, id); parent.push(id); }
        return id;
      };
      const tv = g.tris.map((t) => t.map(vid));
      for (const t of tv) {
        const a = find(t[0]);
        for (let k = 1; k < 3; k++) { const b = find(t[k]); if (a !== b) parent[b] = a; }
      }
      const byRoot = new Map();
      g.tris.forEach((t, i) => {
        const r = find(tv[i][0]);
        let c = byRoot.get(r);
        if (!c) { c = []; byRoot.set(r, c); }
        c.push(t);
      });
      let k = 0;
      for (const tris of byRoot.values()) {
        k++;
        comps.push({ name: byRoot.size > 1 ? g.name + '_' + k : g.name, tris });
      }
    }
    return comps;
  };

  // Achsen und Einheit. up: 'x'|'y'|'z'|'auto'; unit: Faktor auf Meter; flip: 0..3 (Spiegelung Ost/Nord)
  U.guessUp = function (groups) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const g of groups) for (const t of g.tris) for (const v of t) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    let up = 2;
    for (let k = 0; k < 3; k++) if (ext[k] < ext[up]) up = k;
    return { up: 'xyz'[up], extents: ext };
  };
  U.guessUnit = function (extents, up, expected) {
    const idx = { x: 0, y: 1, z: 2 }[up];
    const hor = extents.filter((_, i) => i !== idx);
    const L = Math.max(hor[0], hor[1]);
    const cands = [['m', 1], ['cm', 0.01], ['mm', 0.001]];
    let best = cands[0];
    if (expected) {
      let bd = Infinity;
      for (const c of cands) {
        const d = Math.abs(Math.log((L * c[1]) / expected));
        if (d < bd) { bd = d; best = c; }
      }
    } else if (L > 200000) best = cands[2];
    else if (L > 20000) best = cands[1];
    return { name: best[0], factor: best[1] };
  };
  U.toENU = function (tris, opt) {
    const s = opt.unit || 1;
    const up = opt.up || 'z';
    const flip = opt.flip || 0;
    const sx = flip & 1 ? -1 : 1, sy = flip & 2 ? -1 : 1;
    const mirror = sx * sy < 0;
    const map = (v) => {
      let e, n, u;
      if (up === 'z') { e = v[0]; n = v[1]; u = v[2]; }
      else if (up === 'y') { e = v[0]; n = -v[2]; u = v[1]; }
      else { e = v[1]; n = v[2]; u = v[0]; }
      return [sx * e * s, sy * n * s, u * s];
    };
    return tris.map((t) => {
      const a = map(t[0]), b = map(t[1]), c = map(t[2]);
      return mirror ? [a, c, b] : [a, b, c];
    });
  };

  // ------------------------------------------------------------------ Gebäude analysieren (Höhen, Dachform)
  const DACH_NAMEN = { flat: 'Flachdach', skillion: 'Pultdach', gabled: 'Satteldach', hipped: 'Walmdach', pyramidal: 'Pyramidendach' };
  U.DACH_NAMEN = DACH_NAMEN;

  U.analyzeComponent = function (tris) {
    let zmin = Infinity, zmax = -Infinity;
    for (const t of tris) for (const v of t) { if (v[2] < zmin) zmin = v[2]; if (v[2] > zmax) zmax = v[2]; }
    const roof = [];
    let projArea = 0, cx = 0, cy = 0;
    const hullPts = [];
    for (const t of tris) {
      for (const v of t) hullPts.push(v);
      const ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2];
      const vx = t[2][0] - t[0][0], vy = t[2][1] - t[0][1], vz = t[2][2] - t[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) continue;
      const area = len / 2;
      const upz = nz / len;
      if (Math.abs(upz) <= 0.15) continue; // Wand
      if (Math.max(t[0][2], t[1][2], t[2][2]) < zmin + 0.05 && zmax - zmin > 0.2) continue; // Unterseite (auf Bodenniveau)
      if (upz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nzu = Math.abs(nz) / len;
      const az = Math.atan2(ny, nx);
      const slope = Math.acos(Math.min(1, nzu));
      const pa = Math.abs(nz) / 2;
      projArea += pa;
      cx += pa * (t[0][0] + t[1][0] + t[2][0]) / 3;
      cy += pa * (t[0][1] + t[1][1] + t[2][1]) / 3;
      roof.push({ t, area, pa, az, slope });
    }
    const hull = U.convexHull(hullPts);
    const centroid = projArea > 1e-9 ? [cx / projArea, cy / projArea] : U.polyCentroid(hull);
    const footArea = projArea > 1e-9 ? projArea : Math.abs(U.signedArea(hull));
    const res = { zmin, zmax, centroid, footArea, hull, shape: 'flat', confidence: 0, candidates: [], eaveRel: zmax - zmin, ridgeRel: zmax - zmin, azimuth: null, note: '' };
    const roofArea = roof.reduce((s, r) => s + r.area, 0);
    if (!roof.length || roofArea < 1e-9) { res.note = 'Keine Dachflächen gefunden'; res.confidence = 0.2; res.candidates = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion']; return res; }
    const FLAT = (5 * Math.PI) / 180;
    let flatArea = 0;
    const clusters = [];
    for (const r of roof.slice().sort((a, b) => b.area - a.area)) {
      if (r.slope < FLAT) { flatArea += r.area; continue; }
      let c = clusters.find((k) => {
        let d = Math.abs(k.az - r.az); if (d > Math.PI) d = 2 * Math.PI - d;
        return d < (20 * Math.PI) / 180 && Math.abs(k.slope - r.slope) < (8 * Math.PI) / 180;
      });
      if (!c) { c = { az: r.az, slope: r.slope, area: 0 }; clusters.push(c); }
      c.area += r.area;
    }
    const sig = clusters.filter((c) => c.area / roofArea >= 0.07).sort((a, b) => b.area - a.area);
    const flatShare = flatArea / roofArea;
    let eaveZ = Infinity;
    for (const r of roof) for (const v of r.t) if (v[2] < eaveZ) eaveZ = v[2];
    res.eaveRel = eaveZ - zmin;
    res.ridgeRel = zmax - zmin;
    const angDiff = (a, b) => { let d = Math.abs(a - b); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    const opposite = (a, b) => Math.abs(angDiff(a, b) - Math.PI) < (25 * Math.PI) / 180;
    const apexCount = (() => {
      const top = [];
      for (const r of roof) for (const v of r.t) if (v[2] > zmax - 0.05) top.push(v);
      const keys = new Set(top.map((v) => Math.round(v[0] * 10) + ',' + Math.round(v[1] * 10)));
      return keys.size;
    })();
    if (sig.length === 0) {
      res.shape = 'flat'; res.eaveRel = res.ridgeRel; res.confidence = flatShare > 0.85 ? 1 : 0.6;
      res.candidates = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion'];
    } else if (sig.length === 1 && flatShare < 0.2) {
      res.shape = 'skillion'; res.azimuth = sig[0].az; res.confidence = 0.85;
      res.candidates = ['skillion', 'gabled', 'flat', 'hipped', 'pyramidal'];
    } else if (sig.length === 2 && opposite(sig[0].az, sig[1].az) && flatShare < 0.25) {
      res.shape = 'gabled'; res.azimuth = sig[0].az; res.confidence = 0.95;
      res.candidates = ['gabled', 'hipped', 'flat', 'skillion', 'pyramidal'];
    } else if (sig.length === 4 && flatShare < 0.25) {
      const pairs = (opposite(sig[0].az, sig[1].az) && opposite(sig[2].az, sig[3].az)) ||
        (opposite(sig[0].az, sig[2].az) && opposite(sig[1].az, sig[3].az)) ||
        (opposite(sig[0].az, sig[3].az) && opposite(sig[1].az, sig[2].az));
      res.azimuth = sig[0].az;
      if (pairs && apexCount === 1) { res.shape = 'pyramidal'; res.confidence = 0.9; res.candidates = ['pyramidal', 'hipped', 'gabled', 'flat', 'skillion']; }
      else if (pairs) { res.shape = 'hipped'; res.confidence = 0.9; res.candidates = ['hipped', 'pyramidal', 'gabled', 'flat', 'skillion']; }
      else { res.shape = 'hipped'; res.confidence = 0.3; res.candidates = ['hipped', 'gabled', 'pyramidal', 'flat', 'skillion']; res.note = 'Dachflächen passen zu keiner Standardform'; }
    } else {
      res.shape = sig.length === 3 ? 'hipped' : 'gabled';
      res.confidence = 0.3;
      res.candidates = sig.length === 3 ? ['hipped', 'gabled', 'pyramidal', 'flat', 'skillion'] : ['gabled', 'hipped', 'flat', 'pyramidal', 'skillion'];
      res.note = sig.length + ' unterschiedliche Dachflächen erkannt (z. B. Krüppelwalm oder Dachaufbauten)';
    }
    return res;
  };

  // Sind alle Gebäude flach, ist der Export vermutlich LoD1 (Blockmodell ohne Dachformen)
  U.markLod1 = function (comps) {
    const flat = comps.filter((c) => c.shape === 'flat').length;
    const lod1 = comps.length >= 10 && flat / comps.length >= 0.98;
    comps.forEach((c) => { c.lod1Like = lod1; });
    return lod1;
  };

  // ------------------------------------------------------------------ Zuordnung Export <-> OSM
  U.alignAndMatch = function (comps, osm, opt) {
    opt = opt || {};
    const ratioOk = (a, b) => { const r = a / b; return r > 0.4 && r < 2.5; };
    let best = null;
    const flips = opt.flips || [0, 1, 2, 3];
    for (const flip of flips) {
      const sx = flip & 1 ? -1 : 1, sy = flip & 2 ? -1 : 1;
      const votes = new Map();
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        const cx = sx * c.centroid[0], cy = sy * c.centroid[1];
        for (let j = 0; j < osm.length; j++) {
          const o = osm[j];
          if (!ratioOk(c.footArea, o.area)) continue;
          const dx = o.centroid[0] - cx, dy = o.centroid[1] - cy;
          const key = Math.round(dx / 2) + ',' + Math.round(dy / 2);
          let v = votes.get(key);
          if (!v) { v = { n: 0, sx: 0, sy: 0, kx: Math.round(dx / 2), ky: Math.round(dy / 2) }; votes.set(key, v); }
          v.n++;
        }
      }
      // Nachbarzellen mitzählen
      let top = null;
      for (const v of votes.values()) {
        let n = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const w = votes.get((v.kx + a) + ',' + (v.ky + b)); if (w) n += w.n; }
        if (!top || n > top.n) top = { n, kx: v.kx, ky: v.ky };
      }
      if (top && (!best || top.n > best.votes)) best = { flip, votes: top.n, kx: top.kx, ky: top.ky, sx, sy };
    }
    if (!best) return { ok: false, reason: 'Keine passenden Gebäude gefunden', matches: new Map(), unmatchedComps: comps.map((_, i) => i), flip: 0, dx: 0, dy: 0, score: 0 };
    // Verschiebung verfeinern
    const sx = best.sx, sy = best.sy;
    let sdx = 0, sdy = 0, sn = 0;
    for (const c of comps) {
      for (const o of osm) {
        if (!ratioOk(c.footArea, o.area)) continue;
        const dx = o.centroid[0] - sx * c.centroid[0], dy = o.centroid[1] - sy * c.centroid[1];
        if (Math.abs(dx - best.kx * 2) < 4 && Math.abs(dy - best.ky * 2) < 4) { sdx += dx; sdy += dy; sn++; }
      }
    }
    const dx = sn ? sdx / sn : best.kx * 2, dy = sn ? sdy / sn : best.ky * 2;
    const pairs = [];
    comps.forEach((c, i) => {
      const x = sx * c.centroid[0] + dx, y = sy * c.centroid[1] + dy;
      osm.forEach((o, j) => {
        const d = Math.hypot(o.centroid[0] - x, o.centroid[1] - y);
        const tol = Math.max(6, 0.35 * Math.sqrt(o.area));
        if (d <= tol && ratioOk(c.footArea, o.area)) pairs.push({ i, j, d });
      });
    });
    pairs.sort((a, b) => a.d - b.d);
    const usedC = new Set(), usedO = new Set(), matches = new Map();
    for (const p of pairs) {
      if (usedC.has(p.i) || usedO.has(p.j)) continue;
      usedC.add(p.i); usedO.add(p.j); matches.set(p.j, p.i);
    }
    const unmatchedComps = comps.map((_, i) => i).filter((i) => !usedC.has(i));
    const score = matches.size / Math.max(1, Math.min(comps.length, osm.length));
    return { ok: score >= 0.25, reason: score >= 0.25 ? '' : 'Nur ' + matches.size + ' Gebäude konnten zugeordnet werden', matches, unmatchedComps, flip: best.flip, dx, dy, score };
  };

  // ------------------------------------------------------------------ Körper bauen
  function koerper(ring, tops, roof) {
    const n = ring.length;
    const V = [];
    for (let i = 0; i < n; i++) V.push([ring[i][0], ring[i][1], 0]);
    for (let i = 0; i < n; i++) V.push([ring[i][0], ring[i][1], tops[i]]);
    const T = [];
    const tr = U.triangulate(ring);
    for (const t of tr.tris) T.push([t[0], t[2], t[1]]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      T.push([i, j, n + j]);
      T.push([i, n + j, n + i]);
    }
    if (!roof) {
      for (const t of tr.tris) T.push([n + t[0], n + t[1], n + t[2]]);
    } else {
      const [p0, p1, p2, p3] = roof.ecken;
      const zr = roof.zFirst;
      const lr = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const wr = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const ux = (p1[0] - p0[0]) / lr, uy = (p1[1] - p0[1]) / lr;
      const m0 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2];
      const m1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      let r0, r1;
      if (roof.art === 'gabled') { r0 = m0; r1 = m1; }
      else if (roof.art === 'hipped' && lr > wr + 1e-6) {
        r0 = [m0[0] + (ux * wr) / 2, m0[1] + (uy * wr) / 2];
        r1 = [m1[0] - (ux * wr) / 2, m1[1] - (uy * wr) / 2];
      } else { const c = [(m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2]; r0 = r1 = c; }
      if (roof.r0) r0 = roof.r0;
      if (roof.r1) r1 = roof.r1;
      const i0 = V.length;
      V.push([r0[0], r0[1], zr]);
      let i1;
      if (r1 === r0) i1 = i0; else { i1 = V.length; V.push([r1[0], r1[1], zr]); }
      const t0 = n, t1 = n + 1, t2 = n + 2, t3 = n + 3;
      for (const tri of [[t0, t1, i1], [t0, i1, i0], [t2, t3, i0], [t2, i0, i1], [t1, t2, i1], [t3, t0, i0]]) {
        if (new Set(tri).size === 3) T.push(tri);
      }
    }
    return { V, T, ok: tr.ok };
  }
  U.edgesClosed = function (T) {
    const c = new Map();
    for (const t of T) for (let k = 0; k < 3; k++) { const key = t[k] + ',' + t[(k + 1) % 3]; c.set(key, (c.get(key) || 0) + 1); }
    for (const [key, n] of c) {
      const [a, b] = key.split(',');
      if (n !== 1 || c.get(b + ',' + a) !== 1) return false;
    }
    return true;
  };
  U.volume = function (m) {
    let v = 0;
    for (const t of m.T) {
      const a = m.V[t[0]], b = m.V[t[1]], c = m.V[t[2]];
      v += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
    }
    return v;
  };

  // Gebäude erzeugen. rec: {id, osm:{osm_typ,osm_id,tags,ring,centroid,area}|null, comp:analysiertes Bauteil|null (Koordinaten schon ausgerichtet), user:{shape,eave,first,roofH,lowSide}}
  U.makeBuilding = function (rec, cfg) {
    cfg = cfg || {};
    const user = rec.user || {};
    const osm = rec.osm, comp = rec.comp;
    const tags = osm ? osm.tags : {};
    const hints = [];
    let ringSrc = osm ? osm.ring : comp.hull;
    let ring = U.cleanRing(ringSrc);
    if (ring.length < 3) return null;
    const area = Math.abs(U.signedArea(ring));
    const rect = U.minRect(ring);
    if (!rect || area < 0.5) return null;
    const fill = area / (rect.laenge * rect.breite);
    const rectOk = fill >= (cfg.rectTol || 0.95);
    if (!osm) hints.push('Nur im Export vorhanden (Umriss vereinfacht als konvexe Hülle)');
    if (osm && osm.holeHint) hints.push(osm.holeHint);

    // Höhen
    let first = null, eave = null, heightSrc = null;
    const lod1 = !!(comp && comp.lod1Like);
    if (user.first !== undefined && user.first !== null) { first = user.first; eave = user.eave !== undefined ? user.eave : null; heightSrc = 'manuell'; }
    else if (comp) { first = comp.ridgeRel; eave = lod1 ? null : comp.eaveRel; heightSrc = 'TopoExport'; }
    else {
      const h = U.parseNum(tags.height), rh = U.parseNum(tags['roof:height']);
      if (h && h > 0) { first = h; eave = rh && rh > 0 && rh < h ? h - rh : null; heightSrc = 'OSM'; }
    }
    if (first !== null && first <= 0.05) first = null;

    // Dachform
    const supported = ['flat', 'skillion', 'gabled', 'hipped', 'pyramidal'];
    const osmShape = (tags['roof:shape'] || '').trim().toLowerCase();
    let shape = null, shapeSrc = '', uncertain = false, candidates = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion'];
    if (user.shape) { shape = user.shape; shapeSrc = 'manuell gewählt'; }
    else if (comp && !lod1) {
      candidates = comp.candidates.slice();
      if (comp.confidence >= 0.8) { shape = comp.shape; shapeSrc = 'aus Export erkannt'; if (osmShape && supported.includes(osmShape) && osmShape !== shape) hints.push('OSM nennt "' + osmShape + '", der Export zeigt ' + DACH_NAMEN[shape]); }
      else {
        uncertain = true;
        if (osmShape && supported.includes(osmShape)) { shape = osmShape; shapeSrc = 'OSM (unbestätigt)'; candidates = [osmShape].concat(candidates.filter((c) => c !== osmShape)); }
        else { shape = comp.shape; shapeSrc = 'Vorschlag (unsicher)'; }
        if (comp.note) hints.push(comp.note);
      }
    } else if (osmShape && supported.includes(osmShape)) { shape = osmShape; shapeSrc = 'OSM'; candidates = [osmShape].concat(candidates.filter((c) => c !== osmShape)); }
    else if (first !== null) { uncertain = true; shape = 'flat'; shapeSrc = 'Vorschlag (unsicher)'; hints.push(lod1 ? 'Export ohne Dachformen (LoD1): bitte Dachform wählen' : 'Dachform unbekannt: bitte wählen'); }
    else shape = 'flat';

    // Dach-Höhe bei gewählter geneigter Form ohne Traufhöhe
    let roofHAssumed = false;
    if (first !== null && shape !== 'flat' && (eave === null || eave === undefined)) {
      const rh = user.roofH !== undefined ? user.roofH : null;
      if (rh && rh > 0 && rh < first) { eave = first - rh; roofHAssumed = user.roofHDefault === true; }
    }

    // Maße und Körper
    let tops = null, roof = null, bodyRing = ring, plate = false;
    let outEave = null, outFirst = null, shapeText = DACH_NAMEN[shape];
    const needsRect = ['gabled', 'hipped', 'pyramidal', 'skillion'].includes(shape);
    if (first === null) {
      plate = true;
      tops = ring.map(() => cfg.plateThickness || 1);
      shapeText = 'flach (Platzhalter)';
      shape = 'flat';
    } else if (shape === 'flat') {
      tops = ring.map(() => first); outEave = first; outFirst = first;
    } else if (eave === null || eave === undefined) {
      tops = ring.map(() => first); outFirst = first; outEave = null;
      shapeText = DACH_NAMEN[shape] + ' (nur Höhe bekannt, als Flachdach gebaut)';
      hints.push('Traufhöhe unbekannt: Dach wird erst nach Eingabe der Dachhöhe gebaut');
    } else if (!rectOk) {
      tops = ring.map(() => eave); outEave = eave; outFirst = first;
      shapeText = DACH_NAMEN[shape] + ' (vereinfacht, Grundriss nicht rechteckig)';
      hints.push('Grundriss nicht rechteckig: Körper nur bis Traufhöhe mit flachem Dach');
    } else {
      let ecken = rect.ecken;
      if (shape === 'skillion') {
        // tiefe Seite bestimmen (Richtung, in die das Dach abfällt)
        let az = comp && comp.azimuth !== null && comp.azimuth !== undefined ? comp.azimuth : null;
        if (user.lowSide) az = { O: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 }[user.lowSide];
        if (az === null) az = -Math.PI / 2;
        const dir = [Math.cos(az), Math.sin(az)];
        let bestK = 0, bestD = -Infinity;
        for (let k = 0; k < 4; k++) {
          const a = ecken[k], b = ecken[(k + 1) % 4];
          const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
          const nrm = [ey / l, -ex / l];
          const d = nrm[0] * dir[0] + nrm[1] * dir[1];
          if (d > bestD) { bestD = d; bestK = k; }
        }
        bodyRing = ecken;
        const lowA = bestK, lowB = (bestK + 1) % 4;
        tops = ecken.map((_, i) => (i === lowA || i === lowB ? eave : first));
        outEave = eave; outFirst = first;
      } else {
        const orient = (tags['roof:orientation'] || '').trim().toLowerCase();
        if (comp && !lod1 && comp.azimuth !== null && comp.azimuth !== undefined && comp.confidence >= 0.8 && shape === comp.shape) {
          const theta = Math.atan2(ecken[1][1] - ecken[0][1], ecken[1][0] - ecken[0][0]);
          let d = Math.abs(comp.azimuth + Math.PI / 2 - theta) % Math.PI;
          if (d > Math.PI / 2) d = Math.PI - d;
          if (d > Math.PI / 4) ecken = [ecken[1], ecken[2], ecken[3], ecken[0]];
        } else if (orient === 'across') ecken = [ecken[1], ecken[2], ecken[3], ecken[0]];
        if (user.across) ecken = [ecken[1], ecken[2], ecken[3], ecken[0]];
        bodyRing = ecken;
        tops = ecken.map(() => eave);
        roof = { ecken, zFirst: first, art: shape };
        outEave = eave; outFirst = first;
      }
      if (fill < 0.99) hints.push('Grundriss durch umschließendes Rechteck ersetzt (Füllgrad ' + Math.round(fill * 100) + ' %)');
    }
    if (roofHAssumed) hints.push('Dachhöhe ' + (first - eave).toFixed(1) + ' m ist ein Eingabewert, bitte prüfen');

    const m = koerper(bodyRing, tops, roof);
    const closed = m.ok && U.edgesClosed(m.T);
    if (!closed) hints.push('Körper nicht wasserdicht (Grundriss evtl. ungültig)');

    let status;
    if (plate) status = 'Höhe fehlt';
    else if (uncertain) status = 'Dachform unsicher';
    else if (heightSrc === 'manuell' || shapeSrc === 'manuell gewählt') status = 'manuell';
    else status = 'ok';
    const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
    const levels = U.parseNum(tags['building:levels']);
    if (plate && levels) hints.push('Geschosse laut OSM: ' + levels + ' (nicht in Meter umgerechnet)');

    const props = {
      id: rec.id,
      osm_id: osm ? osm.osm_typ + '/' + osm.osm_id : '',
      name: tags.name || (comp && !osm ? comp.name : '') || '',
      gebaeudeart: tags.building || '',
      laenge_m: r2(rect.laenge), breite_m: r2(rect.breite),
      traufhoehe_m: r2(outEave), firsthoehe_m: r2(outFirst),
      dachform: shapeText,
      dachform_quelle: plate ? '' : shapeSrc,
      hoehenquelle: plate ? '' : heightSrc,
      geschosse: levels,
      grundflaeche_m2: Math.round(area * 10) / 10,
      status,
      hinweise: hints.join('; '),
      mesh_geschlossen: !!closed,
    };
    let material = 'ok';
    if (plate) material = 'fehlt'; else if (uncertain) material = 'unsicher'; else if (!osm) material = 'export'; else if (hints.length) material = 'hinweis';
    return { id: rec.id, V: m.V, T: m.T, props, material, shape, uncertain, candidates, needsEave: first !== null && shape !== 'flat' && (eave === null || eave === undefined), lod1, hasComp: !!comp, first, eave };
  };

  // ------------------------------------------------------------------ OSM lesen
  U.osmToBuildings = function (data, proj) {
    const out = [], skipped = [];
    for (const el of data.elements || []) {
      const kennung = el.type + '/' + el.id;
      const tags = el.tags || {};
      let geom = null, hole = null;
      if (el.type === 'way') {
        geom = el.geometry;
        if (!geom || geom.length < 4) { skipped.push([kennung, 'zu wenige Punkte']); continue; }
        if (geom[0].lat !== geom[geom.length - 1].lat || geom[0].lon !== geom[geom.length - 1].lon) { skipped.push([kennung, 'nicht geschlossen']); continue; }
      } else if (el.type === 'relation') {
        const outer = (el.members || []).filter((m) => m.role === 'outer' && m.geometry);
        const inner = (el.members || []).filter((m) => m.role === 'inner');
        if (outer.length !== 1) { skipped.push([kennung, 'Multipolygon mit ' + outer.length + ' Außenringen']); continue; }
        geom = outer[0].geometry;
        if (geom[0].lat !== geom[geom.length - 1].lat || geom[0].lon !== geom[geom.length - 1].lon) { skipped.push([kennung, 'Außenring nicht geschlossen']); continue; }
        if (inner.length) hole = 'Innenhof/Loch im Grundriss wurde ignoriert';
      } else continue;
      const ring = U.cleanRing(geom.map((p) => proj.fwd(p.lat, p.lon)));
      if (ring.length < 3) { skipped.push([kennung, 'ungültiger Grundriss']); continue; }
      out.push({ osm_typ: el.type, osm_id: el.id, tags, ring, centroid: U.polyCentroid(ring), area: Math.abs(U.signedArea(ring)), holeHint: hole });
    }
    return { buildings: out, skipped };
  };

  // ------------------------------------------------------------------ Export
  const MAT = {
    ok: [0.80, 0.78, 0.74], hinweis: [0.90, 0.80, 0.30], fehlt: [0.95, 0.50, 0.10], unsicher: [0.90, 0.80, 0.30], export: [0.62, 0.55, 0.80],
  };
  U.MAT = MAT;
  const MAT_ORDER = ['ok', 'hinweis', 'fehlt', 'export'];
  const MAT_NAME = { ok: 'Gebäude', hinweis: 'Gebäude mit Hinweis', fehlt: 'Höhe fehlt', export: 'Nur im Export' };
  function pad4(len) { return (4 - (len % 4)) % 4; }
  U.buildGLB = function (buildings, meta) {
    const chunks = [], bufferViews = [], accessors = [], meshes = [], nodes = [{ name: 'Umgebungsmodell', children: [], extras: meta }];
    let offset = 0;
    const pushBuf = (arr) => {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      const start = offset;
      chunks.push(bytes);
      offset += bytes.length;
      const p = pad4(bytes.length);
      if (p) { chunks.push(new Uint8Array(p)); offset += p; }
      return { start, len: bytes.length };
    };
    for (const b of buildings) {
      const pos = new Float32Array(b.V.length * 3);
      b.V.forEach((v, i) => { pos[3 * i] = v[0]; pos[3 * i + 1] = v[2]; pos[3 * i + 2] = -v[1]; });
      const idx = new Uint32Array(b.T.length * 3);
      b.T.forEach((t, i) => { idx[3 * i] = t[0]; idx[3 * i + 1] = t[1]; idx[3 * i + 2] = t[2]; });
      const bp = pushBuf(pos), bi = pushBuf(idx);
      const bvp = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bp.start, byteLength: bp.len, target: 34962 });
      const bvi = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: bi.start, byteLength: bi.len, target: 34963 });
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < mn[k]) mn[k] = pos[i + k]; if (pos[i + k] > mx[k]) mx[k] = pos[i + k]; }
      const ap = accessors.length;
      accessors.push({ bufferView: bvp, componentType: 5126, count: b.V.length, type: 'VEC3', min: mn, max: mx });
      const ai = accessors.length;
      accessors.push({ bufferView: bvi, componentType: 5125, count: idx.length, type: 'SCALAR' });
      const matKey = b.material === 'unsicher' ? 'hinweis' : b.material;
      meshes.push({ name: b.id, primitives: [{ attributes: { POSITION: ap }, indices: ai, material: MAT_ORDER.indexOf(matKey), mode: 4 }] });
      nodes[0].children.push(nodes.length);
      nodes.push({ name: b.id, mesh: meshes.length - 1, extras: b.props });
    }
    const gltf = {
      asset: { version: '2.0', generator: 'Umgebungsmodell Web-App' },
      scene: 0, scenes: [{ nodes: [0] }], nodes, meshes, accessors, bufferViews,
      buffers: [{ byteLength: offset }],
      materials: MAT_ORDER.map((k) => ({ name: MAT_NAME[k], pbrMetallicRoughness: { baseColorFactor: MAT[k].concat([1]), metallicFactor: 0, roughnessFactor: 1 } })),
    };
    const enc = new TextEncoder();
    let json = enc.encode(JSON.stringify(gltf));
    const jp = pad4(json.length);
    if (jp) { const j2 = new Uint8Array(json.length + jp).fill(0x20); j2.set(json); json = j2; }
    const bin = new Uint8Array(offset);
    let o = 0;
    for (const c of chunks) { bin.set(c, o); o += c.length; }
    const total = 12 + 8 + json.length + 8 + bin.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    out.set([0x67, 0x6c, 0x54, 0x46], 0);
    dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, json.length, true); out.set([0x4a, 0x53, 0x4f, 0x4e], 16); out.set(json, 20);
    const p = 20 + json.length;
    dv.setUint32(p, bin.length, true); out.set([0x42, 0x49, 0x4e, 0x00], p + 4); out.set(bin, p + 8);
    return out;
  };

  U.buildSTL = function (buildings, factor) {
    let n = 0;
    for (const b of buildings) n += b.T.length;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const b of buildings) for (const v of b.V) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
    const out = new Uint8Array(84 + 50 * n);
    const dv = new DataView(out.buffer);
    const head = 'Umgebungsmodell STL (Millimeter)';
    for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i);
    dv.setUint32(80, n, true);
    let o = 84;
    for (const b of buildings) {
      for (const t of b.T) {
        const a = b.V[t[0]], bb = b.V[t[1]], c = b.V[t[2]];
        const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
        let q = o + 12;
        for (const v of [a, bb, c]) {
          dv.setFloat32(q, (v[0] - mn[0]) * factor, true); dv.setFloat32(q + 4, (v[1] - mn[1]) * factor, true); dv.setFloat32(q + 8, (v[2] - mn[2]) * factor, true);
          q += 12;
        }
        o += 50;
      }
    }
    return { data: out, size: [(mx[0] - mn[0]) * factor, (mx[1] - mn[1]) * factor, (mx[2] - mn[2]) * factor], triangles: n };
  };

  const CSV_COLS = [['id', 'ID'], ['osm_id', 'OSM-Objekt'], ['name', 'Name'], ['gebaeudeart', 'Gebäudeart'], ['laenge_m', 'Länge [m]'], ['breite_m', 'Breite [m]'],
    ['traufhoehe_m', 'Traufhöhe [m]'], ['firsthoehe_m', 'Firsthöhe [m]'], ['dachform', 'Dachform'], ['dachform_quelle', 'Dachform-Quelle'], ['hoehenquelle', 'Höhenquelle'],
    ['geschosse', 'Geschosse'], ['grundflaeche_m2', 'Grundfläche [m²]'], ['status', 'Status'], ['hinweise', 'Hinweise'], ['mesh_geschlossen', 'Wasserdicht']];
  U.CSV_COLS = CSV_COLS;
  U.buildCSV = function (buildings) {
    const fmt = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'ja' : 'nein';
      if (typeof v === 'number') return String(v).replace('.', ',');
      const s = String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [CSV_COLS.map((c) => c[1]).join(';')];
    for (const b of buildings) lines.push(CSV_COLS.map((c) => fmt(b.props[c[0]])).join(';'));
    return '﻿' + lines.join('\r\n') + '\r\n';
  };

  // ------------------------------------------------------------------ Beispieldaten (für Tests und zum Ausprobieren)
  U.demo = function () {
    const lat0 = 53.5149291, lon0 = 8.1358768;
    const proj = U.projection(lat0, lon0);
    const rect = (cx, cy, l, w, deg) => {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
    };
    const lform = (ox, oy) => [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]].map(([x, y]) => [ox + x, oy + y]);
    const list = [
      { id: 1, ring: rect(-150, 120, 20, 10, 30), eave: 8, first: 12, shape: 'gabled', tags: { building: 'house', name: 'Satteldach-Haus' } },
      { id: 2, ring: rect(-60, 120, 12, 12, 0), eave: 9, first: 9, shape: 'flat', tags: { building: 'yes' } },
      { id: 3, ring: rect(40, 120, 30, 15, 0), eave: 11, first: 14, shape: 'hipped', tags: { building: 'yes', name: 'Walmdach-Haus' } },
      { id: 4, ring: rect(130, 120, 10, 10, 0), eave: 9, first: 12, shape: 'pyramidal', tags: { building: 'yes' } },
      { id: 5, ring: rect(-150, 20, 14, 8, 10), eave: 4, first: 7, shape: 'skillion', low: -Math.PI / 2, tags: { building: 'yes' } },
      { id: 6, ring: rect(-60, 20, 18, 8, 0), eave: 8, first: 11, shape: 'gabled', across: true, tags: { building: 'yes' } },
      { id: 7, ring: rect(40, 20, 16, 9, 0), eave: 6, first: 9.5, shape: 'halfhip', tags: { building: 'house', 'roof:shape': 'gabled' } },
      { id: 8, ring: lform(100, -10), eave: 10, first: 10, shape: 'flat', tags: { building: 'yes' } },
      { id: 9, ring: rect(-150, -100, 15, 10, 0), tags: { building: 'yes', 'building:levels': '3' }, noExport: true },
      { id: 10, ring: rect(-60, -100, 10, 10, 0), tags: { building: 'yes', 'roof:shape': 'gabled' }, noExport: true, noGeom: false },
      { id: 11, ring: rect(40, -100, 12, 8, 0), eave: 5, first: 8, shape: 'gabled', tags: { building: 'yes' }, exportOnly: true },
    ];
    const elements = [];
    const objVerts = [], objFaces = [];
    const OFF = [435120.5, 5930480.25]; // Koordinatenursprung des "Exports"
    const meshes = [];
    for (const b of list) {
      if (!b.exportOnly) {
        const geo = b.ring.concat([b.ring[0]]).map((p) => { const ll = proj.inv(p[0], p[1]); return { lat: ll[0], lon: ll[1] }; });
        elements.push({ type: 'way', id: 1000 + b.id, tags: b.tags, geometry: geo });
      }
      if (b.noExport) continue;
      const ring = U.cleanRing(b.ring);
      const r = U.minRect(ring);
      let m;
      if (b.shape === 'flat') m = koerper(ring, ring.map(() => b.first), null);
      else if (b.shape === 'skillion') {
        const e = r.ecken; const dir = [Math.cos(b.low), Math.sin(b.low)];
        let bk = 0, bd = -Infinity;
        for (let k = 0; k < 4; k++) { const a = e[k], c = e[(k + 1) % 4]; const ex = c[0] - a[0], ey = c[1] - a[1], l = Math.hypot(ex, ey); const d = (ey / l) * dir[0] + (-ex / l) * dir[1]; if (d > bd) { bd = d; bk = k; } }
        m = koerper(e, e.map((_, i) => (i === bk || i === (bk + 1) % 4 ? b.eave : b.first)), null);
      } else {
        let e = r.ecken;
        if (b.across) e = [e[1], e[2], e[3], e[0]];
        const roof = { ecken: e, zFirst: b.first, art: b.shape === 'halfhip' ? 'gabled' : b.shape };
        if (b.shape === 'halfhip') {
          const w = Math.hypot(e[2][0] - e[1][0], e[2][1] - e[1][1]);
          const lr = Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]);
          const ux = (e[1][0] - e[0][0]) / lr, uy = (e[1][1] - e[0][1]) / lr;
          const m0 = [(e[0][0] + e[3][0]) / 2, (e[0][1] + e[3][1]) / 2];
          roof.r0 = [m0[0] + (ux * w) / 2, m0[1] + (uy * w) / 2];
        }
        m = koerper(e, e.map(() => b.eave), roof);
      }
      meshes.push(m);
    }
    // OBJ im "Y oben"-System, versetzt, in Zentimetern, mit Gebäude-Gruppen
    let obj = '# Beispiel-Export (Y oben, Zentimeter)\n';
    let vbase = 0, gi = 0;
    for (const m of meshes) {
      gi++;
      obj += 'o Gebaeude_' + gi + '\n';
      for (const v of m.V) obj += 'v ' + ((v[0] + OFF[0]) * 100).toFixed(1) + ' ' + (v[2] * 100).toFixed(1) + ' ' + (-(v[1] + OFF[1]) * 100).toFixed(1) + '\n';
      for (const t of m.T) obj += 'f ' + (vbase + t[0] + 1) + ' ' + (vbase + t[1] + 1) + ' ' + (vbase + t[2] + 1) + '\n';
      vbase += m.V.length;
    }
    return { osm: { elements }, obj, lat: lat0, lon: lon0, list };
  };

  U.koerper = koerper;
  return U;
});
