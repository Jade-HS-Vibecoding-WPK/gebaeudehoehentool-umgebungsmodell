/* Umgebungsmodell – Oberfläche */
(function () {
  'use strict';
  const U = window.UM;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SUED = { lat: 53.5149291, lon: 8.1358768, w: 800, l: 1000 };
  const S = {
    area: Object.assign({}, SUED),
    proj: null, osmRaw: null, osmList: [], osmSkipped: [],
    exp: null, expInfo: null,
    recs: [], built: [], byId: new Map(), user: {},
    sel: null, match: null, lod1: false, filter: 'alle', dl: null, warnings: [],
  };
  const CFG = { plateThickness: 1, rectTol: 0.95 };
  const STATUS_FARBE = { ok: '#c9c4ba', hinweis: '#e6cc4d', fehlt: '#f28019', unsicher: '#e6cc4d', export: '#9e8ccc' };

  // ---------------------------------------------------------------- Hilfen
  function meldung(id, text, art) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'meldung ' + (art || '');
  }
  async function dateiLaden(file) { return await file.arrayBuffer(); }

  // ---------------------------------------------------------------- Speichern
  function crc32(u8) {
    let c, crc = 0xffffffff;
    if (!crc32.t) { crc32.t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } }
    for (let i = 0; i < u8.length; i++) crc = crc32.t[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((s, p) => s + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    const all = parts.concat(central, [new Uint8Array(e.buffer)]);
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }
  async function speichern(name, daten) {
    const u8 = typeof daten === 'string' ? new TextEncoder().encode(daten) : daten;
    if (S.dl) {
      const ext = name.split('.').pop().toLowerCase();
      let fn = name, data = u8;
      if (!['csv', 'txt', 'json', 'zip'].includes(ext)) { fn = name + '.zip'; data = zipStore([{ name, data: u8 }]); }
      try { await S.dl.save({ filename: fn, data: data }); meldung('exportMeldung', fn + ' gespeichert.', 'ok'); }
      catch (e) { meldung('exportMeldung', e && e.code === 'declined' ? 'Speichern abgebrochen.' : 'Speichern nicht möglich: ' + ((e && e.message) || e), 'warn'); }
      return;
    }
    const blob = new Blob([u8], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    meldung('exportMeldung', name + ' gespeichert (Ordner "Downloads").', 'ok');
  }

  // ---------------------------------------------------------------- Karte
  const M = { lat: SUED.lat, lon: SUED.lon, z: 15, tiles: new Map(), drag: null, dirty: true };
  const mapCv = $('karte');
  const mctx = mapCv.getContext('2d');
  const lon2x = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z) * 256;
  const lat2y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * 256; };
  const x2lon = (x, z) => (x / (Math.pow(2, z) * 256)) * 360 - 180;
  const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / (Math.pow(2, z) * 256); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };
  function mapView() {
    const w = mapCv.clientWidth, h = mapCv.clientHeight;
    return { w, h, x0: lon2x(M.lon, M.z) - w / 2, y0: lat2y(M.lat, M.z) - h / 2 };
  }
  const toPx = (lat, lon, v) => [lon2x(lon, M.z) - v.x0, lat2y(lat, M.z) - v.y0];
  const fromPx = (px, py, v) => [y2lat(py + v.y0, M.z), x2lon(px + v.x0, M.z)];
  function rectPx(v) {
    const b = U.bboxFromCenter(S.area.lat, S.area.lon, S.area.w, S.area.l);
    const a = toPx(b.n, b.w, v), c = toPx(b.s, b.e, v);
    return { x1: a[0], y1: a[1], x2: c[0], y2: c[1] };
  }
  function mapDraw() {
    M.dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const w = mapCv.clientWidth, h = mapCv.clientHeight;
    if (!w || !h) return;
    if (mapCv.width !== Math.round(w * dpr)) { mapCv.width = Math.round(w * dpr); mapCv.height = Math.round(h * dpr); }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = '#e6eaee'; mctx.fillRect(0, 0, w, h);
    const v = mapView();
    const t0x = Math.floor(v.x0 / 256), t1x = Math.floor((v.x0 + w) / 256), t0y = Math.floor(v.y0 / 256), t1y = Math.floor((v.y0 + h) / 256);
    const n = Math.pow(2, M.z);
    if ($('kachelnAn').checked) {
      for (let tx = t0x; tx <= t1x; tx++) for (let ty = t0y; ty <= t1y; ty++) {
        if (ty < 0 || ty >= n) continue;
        const key = M.z + '/' + (((tx % n) + n) % n) + '/' + ty;
        let im = M.tiles.get(key);
        if (!im) {
          im = new Image(); im.dataset.ok = '0';
          im.onload = () => { im.dataset.ok = '1'; M.dirty = true; };
          im.onerror = () => { im.dataset.ok = 'x'; };
          im.src = 'https://tile.openstreetmap.org/' + key + '.png';
          M.tiles.set(key, im);
        }
        if (im.dataset.ok === '1') mctx.drawImage(im, tx * 256 - v.x0, ty * 256 - v.y0, 256, 256);
      }
    }
    // Grundrisse
    const rings = [];
    if (S.recs.length) S.recs.forEach((r) => { const b = S.byId.get(r.id); rings.push({ ring: r.osm ? r.osm.ring : r.comp.hull, farbe: b ? STATUS_FARBE[b.material] : '#ccc', id: r.id }); });
    else S.osmList.forEach((o) => rings.push({ ring: o.ring, farbe: '#b9c3cc', id: null }));
    if (S.proj) {
      for (const r of rings) {
        mctx.beginPath();
        r.ring.forEach((p, i) => { const ll = S.proj.inv(p[0], p[1]); const q = toPx(ll[0], ll[1], v); if (i) mctx.lineTo(q[0], q[1]); else mctx.moveTo(q[0], q[1]); });
        mctx.closePath();
        mctx.fillStyle = r.id && r.id === S.sel ? '#2f6fdf' : r.farbe;
        mctx.globalAlpha = 0.85; mctx.fill(); mctx.globalAlpha = 1;
        mctx.strokeStyle = '#4a5560'; mctx.lineWidth = 0.7; mctx.stroke();
      }
    }
    // Rechteck
    const r = rectPx(v);
    mctx.fillStyle = 'rgba(47,111,223,0.07)'; mctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    mctx.setLineDash([8, 5]); mctx.strokeStyle = '#2f6fdf'; mctx.lineWidth = 2; mctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); mctx.setLineDash([]);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#2f6fdf';
    for (const [cx, cy] of [[r.x1, r.y1], [r.x2, r.y1], [r.x1, r.y2], [r.x2, r.y2]]) { mctx.fillRect(cx - 6, cy - 6, 12, 12); mctx.strokeRect(cx - 6, cy - 6, 12, 12); }
    // Kartenhinweis
    mctx.fillStyle = 'rgba(255,255,255,0.8)'; mctx.fillRect(0, h - 18, 330, 18);
    mctx.fillStyle = '#3b4650'; mctx.font = '11px system-ui, sans-serif'; mctx.fillText('Karte und Gebäudedaten © OpenStreetMap-Mitwirkende (ODbL)', 6, h - 5);
  }
  function mapPointer(e) { const b = mapCv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
  mapCv.addEventListener('pointerdown', (e) => {
    mapCv.setPointerCapture(e.pointerId);
    const [px, py] = mapPointer(e);
    const v = mapView(), r = rectPx(v);
    let mode = 'pan';
    for (const [cx, cy] of [[r.x1, r.y1], [r.x2, r.y1], [r.x1, r.y2], [r.x2, r.y2]]) if (Math.abs(px - cx) < 10 && Math.abs(py - cy) < 10) mode = 'resize';
    if (mode === 'pan' && px > r.x1 && px < r.x2 && py > r.y1 && py < r.y2) mode = 'move';
    M.drag = { mode, px, py, lat: M.lat, lon: M.lon, alat: S.area.lat, alon: S.area.lon, moved: false };
  });
  mapCv.addEventListener('pointermove', (e) => {
    if (!M.drag) return;
    const [px, py] = mapPointer(e);
    const d = M.drag;
    if (Math.abs(px - d.px) + Math.abs(py - d.py) > 3) d.moved = true;
    if (d.mode === 'pan') {
      const v0 = { w: mapCv.clientWidth, h: mapCv.clientHeight, x0: lon2x(d.lon, M.z) - mapCv.clientWidth / 2, y0: lat2y(d.lat, M.z) - mapCv.clientHeight / 2 };
      M.lon = x2lon(lon2x(d.lon, M.z) - (px - d.px), M.z); M.lat = y2lat(lat2y(d.lat, M.z) - (py - d.py), M.z);
    } else if (d.mode === 'move') {
      S.area.lon = x2lon(lon2x(d.alon, M.z) + (px - d.px), M.z); S.area.lat = y2lat(lat2y(d.alat, M.z) + (py - d.py), M.z);
      feldSync();
    } else {
      const v = mapView(); const ll = fromPx(px, py, v);
      const ky = (Math.PI / 180) * 6378137, kx = ky * Math.cos((S.area.lat * Math.PI) / 180);
      S.area.w = Math.max(50, Math.round((Math.abs(ll[1] - S.area.lon) * kx * 2) / 10) * 10);
      S.area.l = Math.max(50, Math.round((Math.abs(ll[0] - S.area.lat) * ky * 2) / 10) * 10);
      feldSync();
    }
    M.dirty = true;
  });
  mapCv.addEventListener('pointerup', (e) => {
    const d = M.drag; M.drag = null;
    if (d && !d.moved && d.mode !== 'resize' && S.proj) {
      const [px, py] = mapPointer(e); const v = mapView(); const ll = fromPx(px, py, v);
      const p = S.proj.fwd(ll[0], ll[1]);
      const hit = S.recs.find((r) => U.pointInPoly(p, r.osm ? r.osm.ring : r.comp.hull));
      if (hit) waehle(hit.id);
    }
    if (d && d.mode !== 'pan') hinweisGebietGeaendert();
  });
  mapCv.addEventListener('wheel', (e) => {
    e.preventDefault();
    M.z = Math.max(3, Math.min(19, M.z + (e.deltaY < 0 ? 1 : -1)));
    M.dirty = true;
  }, { passive: false });
  $('kachelnAn').addEventListener('change', () => { M.dirty = true; });
  function feldSync() {
    $('fLat').value = S.area.lat.toFixed(6); $('fLon').value = S.area.lon.toFixed(6);
    $('fBreite').value = S.area.w; $('fLaenge').value = S.area.l;
  }
  function felderLesen() {
    const f = (id) => parseFloat(String($(id).value).replace(',', '.'));
    const lat = f('fLat'), lon = f('fLon'), w = f('fBreite'), l = f('fLaenge');
    if (isFinite(lat) && isFinite(lon) && w > 0 && l > 0) { S.area = { lat, lon, w, l }; M.lat = lat; M.lon = lon; M.dirty = true; hinweisGebietGeaendert(); }
  }
  ['fLat', 'fLon', 'fBreite', 'fLaenge'].forEach((id) => $(id).addEventListener('change', felderLesen));
  function hinweisGebietGeaendert() {
    if (S.osmRaw && S.proj && (Math.abs(S.proj.lat0 - S.area.lat) > 1e-5 || Math.abs(S.proj.lon0 - S.area.lon) > 1e-5)) {
      meldung('osmMeldung', 'Das Rechteck wurde verschoben. Bitte die Gebäude neu von OpenStreetMap laden.', 'warn');
    }
  }
  function mapZoomAufGebiet() {
    M.lat = S.area.lat; M.lon = S.area.lon;
    const b = U.bboxFromCenter(S.area.lat, S.area.lon, S.area.w, S.area.l);
    const w = mapCv.clientWidth || 800, h = mapCv.clientHeight || 600;
    for (let z = 19; z >= 3; z--) {
      if (Math.abs(lon2x(b.e, z) - lon2x(b.w, z)) < w * 0.8 && Math.abs(lat2y(b.s, z) - lat2y(b.n, z)) < h * 0.8) { M.z = z; break; }
    }
    M.dirty = true;
  }

  // ---------------------------------------------------------------- OSM
  function osmUebernehmen(daten, quelle) {
    S.proj = U.projection(S.area.lat, S.area.lon);
    S.proj.lat0 = S.area.lat; S.proj.lon0 = S.area.lon;
    S.osmRaw = daten;
    const r = U.osmToBuildings(daten, S.proj);
    const hw = S.area.w / 2, hl = S.area.l / 2;
    const alle = r.buildings.length;
    S.osmList = r.buildings.filter((b) => Math.abs(b.centroid[0]) <= hw && Math.abs(b.centroid[1]) <= hl);
    S.osmSkipped = r.skipped;
    meldung('osmMeldung', S.osmList.length + ' Gebäude aus ' + quelle + ' im Rechteck' + (alle > S.osmList.length ? ' (' + (alle - S.osmList.length) + ' außerhalb ignoriert)' : '') +
      (r.skipped.length ? ', ' + r.skipped.length + ' übersprungen (z. B. Multipolygone)' : '') + '.', 'ok');
    verarbeiten();
    M.dirty = true;
  }
  async function osmLaden() {
    const b = U.bboxFromCenter(S.area.lat, S.area.lon, S.area.w, S.area.l);
    const q = '[out:json][timeout:120];(way["building"](' + [b.s, b.w, b.n, b.e].join(',') + ');relation["building"](' + [b.s, b.w, b.n, b.e].join(',') + '););out geom;';
    const urls = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    $('osmLaden').disabled = true;
    let letzter = '';
    for (const url of urls) {
      for (let versuch = 1; versuch <= 2; versuch++) {
        meldung('osmMeldung', 'Lade von ' + new URL(url).host + ' (Versuch ' + versuch + ') …', '');
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 90000);
          const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
          clearTimeout(to);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const daten = await res.json();
          $('osmLaden').disabled = false;
          return osmUebernehmen(daten, 'OpenStreetMap');
        } catch (e) { letzter = String((e && e.message) || e); await new Promise((r) => setTimeout(r, 4000)); }
      }
    }
    $('osmLaden').disabled = false;
    meldung('osmMeldung', 'OpenStreetMap ist von hier aus nicht erreichbar (' + letzter + '). Lade stattdessen die Datei "data/osm_gebaeude.json" aus dem Projektordner hoch (Knopf darunter).', 'warn');
  }
  $('osmLaden').addEventListener('click', osmLaden);
  $('osmDatei').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { osmUebernehmen(JSON.parse(new TextDecoder().decode(await dateiLaden(f))), 'Datei ' + f.name); }
    catch (err) { meldung('osmMeldung', 'Datei konnte nicht gelesen werden: ' + err.message, 'warn'); }
    e.target.value = '';
  });

  // ---------------------------------------------------------------- Export-Datei (TopoExport)
  async function exportDateiLaden(file) {
    meldung('expMeldung', 'Lese ' + file.name + ' …', '');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const res = U.parseModelFile(file.name, await dateiLaden(file));
      S.warnings = res.warnings || [];
      if (!res.groups.length) { meldung('expMeldung', (res.warnings[0] || 'Keine Flächen gefunden.'), 'warn'); return; }
      S.exp = { name: file.name, groups: res.groups };
      verarbeiten();
    } catch (err) { meldung('expMeldung', 'Datei konnte nicht gelesen werden: ' + err.message, 'warn'); }
  }
  $('expDatei').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) exportDateiLaden(f); e.target.value = ''; });
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'drop' && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (/\.json$/i.test(f.name)) f.arrayBuffer().then((b) => osmUebernehmen(JSON.parse(new TextDecoder().decode(b)), 'Datei ' + f.name));
      else exportDateiLaden(f);
    }
  }));
  $('achse').addEventListener('change', verarbeiten);
  $('einheit').addEventListener('change', verarbeiten);

  // ---------------------------------------------------------------- Verarbeiten
  function verarbeiten() {
    S.recs = [];
    const komp = [];
    let info = '';
    S.match = null; S.lod1 = false;
    if (S.exp) {
      const groups = S.exp.groups;
      const g = U.guessUp(groups);
      const up = $('achse').value === 'auto' ? g.up : $('achse').value;
      const u = U.guessUnit(g.extents, up, Math.max(S.area.w, S.area.l));
      const factor = $('einheit').value === 'auto' ? u.factor : { m: 1, cm: 0.01, mm: 0.001 }[$('einheit').value];
      const einheitName = $('einheit').value === 'auto' ? u.name : $('einheit').value;
      const comps = U.splitComponents(groups);
      const pass0 = comps.map((c) => { const a = U.analyzeComponent(U.toENU(c.tris, { up, unit: factor, flip: 0 })); a.name = c.name; return a; });
      let flip = 0, dx = 0, dy = 0, match = null;
      if (S.osmList.length) {
        match = U.alignAndMatch(pass0, S.osmList);
        flip = match.flip; dx = match.dx; dy = match.dy;
      } else {
        let sx = 0, sy = 0; pass0.forEach((a) => { sx += a.centroid[0]; sy += a.centroid[1]; });
        dx = -sx / Math.max(1, pass0.length); dy = -sy / Math.max(1, pass0.length);
      }
      const analyzed = comps.map((c) => {
        const t = U.toENU(c.tris, { up, unit: factor, flip }).map((tri) => tri.map((v) => [v[0] + dx, v[1] + dy, v[2]]));
        const a = U.analyzeComponent(t); a.name = c.name; return a;
      });
      S.lod1 = U.markLod1(analyzed);
      S.match = match;
      if (!S.proj) { S.proj = U.projection(S.area.lat, S.area.lon); S.proj.lat0 = S.area.lat; S.proj.lon0 = S.area.lon; }
      S.osmList.forEach((o, j) => {
        const ci = match ? match.matches.get(j) : undefined;
        const id = o.osm_typ + '_' + o.osm_id;
        S.recs.push({ id, osm: o, comp: ci !== undefined ? analyzed[ci] : null, user: S.user[id] || (S.user[id] = {}) });
      });
      let rest = match ? match.unmatchedComps : analyzed.map((_, i) => i);
      const hw = S.area.w / 2, hl = S.area.l / 2;
      const drop = { aussen: 0, klein: 0, teil: 0 };
      if (match) {
        rest = rest.filter((ci) => {
          const a = analyzed[ci], c = a.centroid;
          if (Math.abs(c[0]) > hw || Math.abs(c[1]) > hl) { drop.aussen++; return false; }
          if (a.footArea < 5) { drop.klein++; return false; }
          if (S.osmList.some((o) => U.pointInPoly([c[0], c[1]], o.ring))) { drop.teil++; return false; }
          return true;
        });
      }
      rest.forEach((ci) => { const id = 'export_' + analyzed[ci].name; S.recs.push({ id, osm: null, comp: analyzed[ci], user: S.user[id] || (S.user[id] = {}) }); });
      info = comps.length + ' Gebäude in ' + S.exp.name + ' erkannt (Höhenachse ' + up.toUpperCase() + ', Einheit ' + einheitName + ')';
      if (match) {
        info += '; ' + match.matches.size + ' mit OSM-Gebäuden verbunden' + (rest.length ? ', ' + rest.length + ' weitere nur im Export (lila, ohne OSM-Grundriss)' : '');
        const verw = [];
        if (drop.teil) verw.push(drop.teil + ' Teile/Anbauten von OSM-Gebäuden');
        if (drop.klein) verw.push(drop.klein + ' Kleinstobjekte unter 5 m²');
        if (drop.aussen) verw.push(drop.aussen + ' außerhalb des Rechtecks');
        if (verw.length) info += '. Nicht übernommen: ' + verw.join(', ');
        const ohne = S.osmList.length - match.matches.size;
        if (ohne) info += '. ' + ohne + ' OSM-Gebäude ohne Gegenstück im Export (Höhe fehlt)';
      }
      let art = 'ok';
      if (match && !match.ok) { info += '. ACHTUNG: ' + match.reason + '. Prüfe Gebiet, Höhenachse und Einheit.'; art = 'warn'; }
      if (S.lod1) { info += '. Der Export enthält nur flache Dächer (LoD1?): Dachformen müssen gewählt werden.'; art = 'warn'; }
      if (!S.osmList.length) { info += '. Ohne OSM-Gebäude werden die Umrisse aus dem Export genommen.'; art = 'warn'; }
      if (S.warnings.length) info += ' ' + S.warnings.join(' ');
      meldung('expMeldung', info, art);
      $('achse').value === 'auto' && ($('achseInfo').textContent = '(erkannt: ' + up.toUpperCase() + ')');
      $('einheitInfo').textContent = $('einheit').value === 'auto' ? '(erkannt: ' + einheitName + ')' : '';
    } else {
      S.osmList.forEach((o) => { const id = o.osm_typ + '_' + o.osm_id; S.recs.push({ id, osm: o, comp: null, user: S.user[id] || (S.user[id] = {}) }); });
    }
    baueAlle();
  }
  function baueAlle() {
    S.built = []; S.byId = new Map();
    for (const r of S.recs) {
      r.user = S.user[r.id] || (S.user[r.id] = {});
      const b = U.makeBuilding(r, CFG);
      if (b) { S.built.push(b); S.byId.set(b.id, b); }
    }
    aktualisieren();
  }
  function baueEins(id) {
    const r = S.recs.find((x) => x.id === id); if (!r) return;
    const b = U.makeBuilding(r, CFG);
    const i = S.built.findIndex((x) => x.id === id);
    if (b && i >= 0) { S.built[i] = b; S.byId.set(id, b); }
    aktualisieren();
  }

  // ---------------------------------------------------------------- Anzeige-Aktualisierung
  function zaehlen() {
    const z = { gesamt: S.built.length, unsicher: 0, fehlt: 0, manuell: 0, ok: 0, export: 0 };
    S.built.forEach((b) => { const s = b.props.status; if (s === 'Dachform unsicher') z.unsicher++; else if (s === 'Höhe fehlt') z.fehlt++; else if (s === 'manuell') z.manuell++; else z.ok++; if (b.material === 'export') z.export++; });
    return z;
  }
  function aktualisieren() {
    const z = zaehlen();
    $('zaehler').innerHTML = z.gesamt ? '<b>' + z.gesamt + '</b> Gebäude · <span class="chip gelb">' + z.unsicher + ' Dachform unsicher</span> <span class="chip orange">' + z.fehlt + ' Höhe fehlt</span> <span class="chip blau">' + z.manuell + ' manuell</span>' : 'Noch keine Gebäude geladen.';
    meldung('pruefMeldung', z.gesamt ? (z.unsicher ? z.unsicher + ' Gebäude brauchen eine Dachform-Auswahl (gelb). Klicke ein Gebäude an oder nutze den Knopf.' : 'Keine offenen Dachform-Fragen.') : '', z.unsicher ? 'warn' : 'ok');
    $('naechstes').disabled = !z.unsicher;
    ['btnGLB', 'btnCSV', 'btnSTL'].forEach((i) => { $(i).disabled = !z.gesamt; });
    stlInfo();
    listeZeichnen();
    gl.setData();
    M.dirty = true;
    zeigeDetails();
  }
  function stlInfo() {
    if (!S.built.length) { $('stlInfo').textContent = ''; return; }
    const mass = parseFloat($('massstab').value), bett = parseFloat($('bett').value);
    const mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
    S.built.forEach((b) => b.V.forEach((v) => { for (let k = 0; k < 2; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } }));
    const bx = ((mx[0] - mn[0]) * 1000) / mass, by = ((mx[1] - mn[1]) * 1000) / mass;
    let t = 'Größe bei 1:' + mass + ': ' + bx.toFixed(0) + ' x ' + by.toFixed(0) + ' mm.';
    if (Math.max(bx, by) > bett) t += ' Passt nicht auf ein Druckbett von ' + bett + ' mm. Nötig wäre mindestens 1:' + Math.ceil(((Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 1000) / bett) / 10) * 10 + ' oder eine Teilung in Kacheln.';
    $('stlInfo').textContent = t;
    $('stlInfo').className = 'meldung ' + (Math.max(bx, by) > bett ? 'warn' : '');
  }

  // ---------------------------------------------------------------- Liste
  function listeZeichnen() {
    const f = $('filter').value;
    const rows = S.built.filter((b) => f === 'alle' || (f === 'unsicher' && b.props.status === 'Dachform unsicher') || (f === 'fehlt' && b.props.status === 'Höhe fehlt') || (f === 'manuell' && b.props.status === 'manuell') || (f === 'export' && b.material === 'export'));
    const rang = { 'Dachform unsicher': 0, 'Höhe fehlt': 1, manuell: 2, ok: 3 };
    rows.sort((a, b) => (rang[a.props.status] - rang[b.props.status]) || a.id.localeCompare(b.id));
    const fmt = (v) => (v === null || v === undefined ? '–' : String(v).replace('.', ','));
    $('listeBody').innerHTML = rows.map((b) => {
      const p = b.props;
      const cls = p.status === 'Dachform unsicher' ? 'gelb' : p.status === 'Höhe fehlt' ? 'orange' : p.status === 'manuell' ? 'blau' : 'grau';
      return '<tr data-id="' + esc(b.id) + '" class="' + (b.id === S.sel ? 'sel' : '') + '"><td>' + esc(p.name || b.id) + '</td><td class="z">' + fmt(p.laenge_m) + '</td><td class="z">' + fmt(p.breite_m) + '</td><td class="z">' + fmt(p.traufhoehe_m) + '</td><td class="z">' + fmt(p.firsthoehe_m) + '</td><td>' + esc(p.dachform) + '</td><td><span class="chip ' + cls + '">' + esc(p.status) + '</span></td></tr>';
    }).join('');
    $('listeAnzahl').textContent = rows.length + ' von ' + S.built.length;
  }
  $('filter').addEventListener('change', listeZeichnen);
  $('listeBody').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) waehle(tr.dataset.id, true); });

  // ---------------------------------------------------------------- Auswahl und Details
  const ICON = {
    flat: '<svg viewBox="0 0 40 26"><rect x="6" y="8" width="28" height="14" fill="#d8d2c6" stroke="#4a5560"/></svg>',
    gabled: '<svg viewBox="0 0 40 26"><path d="M6 22V12L20 3l14 9v10z" fill="#d8d2c6" stroke="#4a5560"/></svg>',
    hipped: '<svg viewBox="0 0 40 26"><path d="M6 22V13l7-9h14l7 9v9z" fill="#d8d2c6" stroke="#4a5560"/></svg>',
    pyramidal: '<svg viewBox="0 0 40 26"><path d="M8 22V14L20 3l12 11v8z" fill="#d8d2c6" stroke="#4a5560"/><path d="M20 3v19" stroke="#4a5560"/></svg>',
    skillion: '<svg viewBox="0 0 40 26"><path d="M6 22V14L34 5v17z" fill="#d8d2c6" stroke="#4a5560"/></svg>',
  };
  function waehle(id, ausListe) {
    S.sel = id;
    gl.setSelected();
    zeigeDetails();
    listeZeichnen();
    M.dirty = true;
    if (ausListe) gl.fokus(id);
  }
  function zeigeDetails() {
    const el = $('details');
    const b = S.sel ? S.byId.get(S.sel) : null;
    if (!b) { el.innerHTML = '<h3>Gebäude</h3><p class="leise">Klicke ein Gebäude in der Karte, im 3D-Modell oder in der Liste an.</p>'; return; }
    const p = b.props, rec = S.recs.find((r) => r.id === b.id), u = rec.user;
    const fmt = (v, e) => (v === null || v === undefined || v === '' ? '<span class="leise">–</span>' : esc(String(v).replace('.', ',')) + (e ? ' ' + e : ''));
    let h = '<h3>' + esc(p.name || b.id) + '</h3>';
    h += '<table class="eig">';
    [['Länge', fmt(p.laenge_m, 'm')], ['Breite', fmt(p.breite_m, 'm')], ['Traufhöhe', fmt(p.traufhoehe_m, 'm')], ['Firsthöhe', fmt(p.firsthoehe_m, 'm')], ['Dachform', fmt(p.dachform)],
      ['Dachform-Quelle', fmt(p.dachform_quelle)], ['Höhenquelle', fmt(p.hoehenquelle)], ['Grundfläche', fmt(p.grundflaeche_m2, 'm²')], ['Geschosse (OSM)', fmt(p.geschosse)], ['Gebäudeart', fmt(p.gebaeudeart)], ['OSM-Objekt', fmt(p.osm_id)], ['Status', '<b>' + esc(p.status) + '</b>']]
      .forEach((r) => { h += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; });
    h += '</table>';
    if (p.hinweise) h += '<div class="hinweis">' + esc(p.hinweise) + '</div>';

    // Dachform-Auswahl
    h += '<h4>' + (b.uncertain ? 'Dachform unsicher: bitte wählen' : 'Dachform ändern') + '</h4><div class="dachwahl">';
    const cand = b.candidates && b.candidates.length ? b.candidates : ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion'];
    cand.forEach((c, i) => {
      const aktiv = u.shape === c || (!u.shape && !b.uncertain && b.shape === c);
      h += '<button class="dach ' + (aktiv ? 'aktiv' : '') + '" data-shape="' + c + '">' + ICON[c] + '<span>' + U.DACH_NAMEN[c] + '</span>' + (i === 0 && b.uncertain ? '<em>Vorschlag</em>' : '') + '</button>';
    });
    h += '</div>';
    if (u.shape) h += '<button class="klein" data-aktion="shapeReset">Auswahl zurücknehmen</button>';
    if (b.shape === 'skillion') {
      h += '<div class="zeile"><span>Tiefe Seite:</span>' + ['N', 'O', 'S', 'W'].map((d) => '<button class="klein ' + (u.lowSide === d ? 'aktiv' : '') + '" data-low="' + d + '">' + d + '</button>').join('') + '</div>';
    }
    if (['gabled', 'hipped'].includes(b.shape)) h += '<div class="zeile"><label><input type="checkbox" id="quer" ' + (u.across ? 'checked' : '') + '> Firstrichtung drehen</label></div>';

    // Höhen
    h += '<h4>Höhen (Meter)</h4><div class="hoehen">';
    h += '<label>Firsthöhe<input id="hFirst" type="text" value="' + (b.first !== null && b.first !== undefined ? String(Math.round(b.first * 100) / 100).replace('.', ',') : '') + '"></label>';
    h += '<label>Traufhöhe<input id="hEave" type="text" value="' + (b.eave !== null && b.eave !== undefined ? String(Math.round(b.eave * 100) / 100).replace('.', ',') : '') + '"></label>';
    h += '</div><div class="zeile"><button class="klein" data-aktion="hoehe">Höhen übernehmen</button>' + (u.first !== undefined ? '<button class="klein" data-aktion="hoeheReset">zurücksetzen</button>' : '') + '</div>';
    if (b.needsEave) {
      h += '<div class="zeile"><label>Dachhöhe (First minus Traufe)<input id="hRoof" type="text" value="' + String(u.roofH !== undefined ? u.roofH : 3).replace('.', ',') + '"></label><button class="klein" data-aktion="roof">Übernehmen</button></div>';
    }
    el.innerHTML = h;
  }
  function numFeld(id) { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? v : null; }
  $('details').addEventListener('click', (e) => {
    const b = S.sel ? S.byId.get(S.sel) : null; if (!b) return;
    const rec = S.recs.find((r) => r.id === b.id), u = rec.user;
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.shape) {
      u.shape = t.dataset.shape;
      if (u.shape !== 'flat' && u.shape !== undefined && b.needsEave === false && b.eave === null) { /* nichts */ }
      if (u.shape !== 'flat' && (b.eave === null || b.eave === undefined) && u.roofH === undefined) { u.roofH = 3; u.roofHDefault = true; }
      baueEins(b.id);
    } else if (t.dataset.aktion === 'shapeReset') { delete u.shape; delete u.lowSide; delete u.across; baueEins(b.id); }
    else if (t.dataset.low) { u.lowSide = t.dataset.low; baueEins(b.id); }
    else if (t.dataset.aktion === 'hoehe') {
      const f = numFeld('hFirst'), tr = numFeld('hEave');
      if (f === null || f <= 0) { meldung('pruefMeldung', 'Bitte eine Firsthöhe größer 0 eingeben.', 'warn'); return; }
      if (tr !== null && tr >= f) { meldung('pruefMeldung', 'Die Traufhöhe muss kleiner als die Firsthöhe sein.', 'warn'); return; }
      u.first = f; u.eave = tr; baueEins(b.id);
    } else if (t.dataset.aktion === 'hoeheReset') { delete u.first; delete u.eave; baueEins(b.id); }
    else if (t.dataset.aktion === 'roof') {
      const r = numFeld('hRoof');
      if (r === null || r <= 0 || r >= (b.first || 0)) { meldung('pruefMeldung', 'Die Dachhöhe muss größer 0 und kleiner als die Firsthöhe sein.', 'warn'); return; }
      u.roofH = r; u.roofHDefault = true; baueEins(b.id);
    }
  });
  $('details').addEventListener('change', (e) => {
    if (e.target.id === 'quer') { const b = S.byId.get(S.sel); const rec = S.recs.find((r) => r.id === b.id); rec.user.across = e.target.checked; baueEins(b.id); }
  });
  $('naechstes').addEventListener('click', () => {
    const offen = S.built.filter((b) => b.props.status === 'Dachform unsicher');
    if (!offen.length) return;
    const i = offen.findIndex((b) => b.id === S.sel);
    const n = offen[(i + 1) % offen.length];
    wechselTab('d3'); waehle(n.id, true);
  });

  // ---------------------------------------------------------------- 3D-Ansicht (WebGL)
  const gl = (function () {
    const cv = $('ansicht3d');
    let g = null, prog = null, bufs = {}, n = 0, owner = null, ranges = [], pos = null, cols = null, bounds = null, dirty = true;
    const cam = { yaw: -1.0, pitch: 0.7, dist: 500, target: [0, 0, 0] };
    const FOV = 45 * Math.PI / 180;
    function init() {
      try { g = cv.getContext('webgl', { antialias: true }) || cv.getContext('experimental-webgl'); } catch (e) { g = null; }
      if (!g) { $('glFehler').style.display = 'block'; return false; }
      const vs = 'attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uM;varying vec3 vN;varying vec3 vC;void main(){vN=aN;vC=aC;gl_Position=uM*vec4(aP,1.0);}';
      const fs = 'precision mediump float;varying vec3 vN;varying vec3 vC;void main(){vec3 L=normalize(vec3(-0.45,-0.6,0.8));float d=max(dot(normalize(vN),L),0.0);float h=0.5+0.5*normalize(vN).z;vec3 c=vC*(0.38+0.42*h*0.6+0.55*d);gl_FragColor=vec4(c,1.0);}';
      const sh = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
      prog = g.createProgram(); g.attachShader(prog, sh(g.VERTEX_SHADER, vs)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, fs)); g.linkProgram(prog);
      bufs = { p: g.createBuffer(), n: g.createBuffer(), c: g.createBuffer() };
      g.enable(g.DEPTH_TEST);
      return true;
    }
    const ok = init();
    function mulM(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
    function eyePos() { return [cam.target[0] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw), cam.target[1] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw), cam.target[2] + cam.dist * Math.sin(cam.pitch)]; }
    function basis() {
      const e = eyePos(); let f = [cam.target[0] - e[0], cam.target[1] - e[1], cam.target[2] - e[2]]; const fl = Math.hypot(...f); f = f.map((x) => x / fl);
      let r = [f[1] * 1 - f[2] * 0, f[2] * 0 - f[0] * 1, 0]; const rl = Math.hypot(...r); r = r.map((x) => x / rl);
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      return { e, f, r, u };
    }
    function matrix() {
      const { e, f, r, u } = basis();
      const asp = cv.clientWidth / Math.max(1, cv.clientHeight);
      const near = Math.max(0.5, cam.dist / 200), far = cam.dist * 20 + 5000;
      const t = 1 / Math.tan(FOV / 2);
      const P = [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
      const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1];
      return mulM(P, V);
    }
    function farbe(b, sel) {
      if (sel) return [0.18, 0.43, 0.87];
      const c = U.MAT[b.material] || U.MAT.ok; return c;
    }
    function setData() {
      if (!ok) return;
      const bs = S.built; let tris = 0; bs.forEach((b) => { tris += b.T.length; });
      const P = new Float32Array((tris + 2) * 9), N = new Float32Array((tris + 2) * 9);
      cols = new Float32Array((tris + 2) * 9); ranges = []; owner = [];
      let o = 0;
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      bs.forEach((b, bi) => {
        const start = o;
        b.T.forEach((t) => {
          const a = b.V[t[0]], c = b.V[t[1]], d = b.V[t[2]];
          const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          [a, c, d].forEach((v) => { P[o * 3] = v[0]; P[o * 3 + 1] = v[1]; P[o * 3 + 2] = v[2]; N[o * 3] = nx; N[o * 3 + 1] = ny; N[o * 3 + 2] = nz; o++; for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; } });
          owner.push(bi);
        });
        ranges.push([start, o]);
      });
      bounds = bs.length ? { mn, mx } : null;
      // Boden
      const ext = bounds ? Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 0.8 + 50 : 500;
      const cx = bounds ? (mn[0] + mx[0]) / 2 : 0, cy = bounds ? (mn[1] + mx[1]) / 2 : 0;
      const gq = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      gq.forEach((q) => { P[o * 3] = cx + q[0] * ext; P[o * 3 + 1] = cy + q[1] * ext; P[o * 3 + 2] = -0.05; N[o * 3 + 2] = 1; o++; });
      n = o; pos = P;
      g.bindBuffer(g.ARRAY_BUFFER, bufs.p); g.bufferData(g.ARRAY_BUFFER, P.subarray(0, n * 3), g.STATIC_DRAW);
      g.bindBuffer(g.ARRAY_BUFFER, bufs.n); g.bufferData(g.ARRAY_BUFFER, N.subarray(0, n * 3), g.STATIC_DRAW);
      setSelected();
      if (bounds && !setData.fit) { fit(); setData.fit = true; }
      if (!bounds) setData.fit = false;
      dirty = true;
    }
    function setSelected() {
      if (!ok || !cols) return;
      S.built.forEach((b, bi) => {
        const c = farbe(b, b.id === S.sel);
        for (let i = ranges[bi][0]; i < ranges[bi][1]; i++) { cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2]; }
      });
      for (let i = n - 6; i < n; i++) { cols[i * 3] = 0.86; cols[i * 3 + 1] = 0.89; cols[i * 3 + 2] = 0.9; }
      g.bindBuffer(g.ARRAY_BUFFER, bufs.c); g.bufferData(g.ARRAY_BUFFER, cols.subarray(0, n * 3), g.STATIC_DRAW);
      dirty = true;
    }
    function fit() {
      if (!bounds) return;
      cam.target = [(bounds.mn[0] + bounds.mx[0]) / 2, (bounds.mn[1] + bounds.mx[1]) / 2, (bounds.mn[2] + bounds.mx[2]) / 2];
      cam.dist = Math.max(60, Math.max(bounds.mx[0] - bounds.mn[0], bounds.mx[1] - bounds.mn[1]) * 1.3);
      dirty = true;
    }
    function fokus(id) {
      const i = S.built.findIndex((b) => b.id === id); if (i < 0 || !ranges[i]) return;
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let k = ranges[i][0]; k < ranges[i][1]; k++) for (let a = 0; a < 3; a++) { const v = pos[k * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
      cam.target = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      cam.dist = Math.max(40, Math.max(mx[0] - mn[0], mx[1] - mn[1]) * 3);
      dirty = true;
    }
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
    }
    function draw() {
      if (!ok) return;
      resize(); dirty = false;
      g.viewport(0, 0, cv.width, cv.height);
      g.clearColor(0.91, 0.93, 0.95, 1); g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
      if (!n) return;
      g.useProgram(prog);
      g.uniformMatrix4fv(g.getUniformLocation(prog, 'uM'), false, new Float32Array(matrix()));
      [['aP', bufs.p], ['aN', bufs.n], ['aC', bufs.c]].forEach(([nm, bf]) => { const l = g.getAttribLocation(prog, nm); g.bindBuffer(g.ARRAY_BUFFER, bf); g.enableVertexAttribArray(l); g.vertexAttribPointer(l, 3, g.FLOAT, false, 0, 0); });
      g.drawArrays(g.TRIANGLES, 0, n);
    }
    function pick(px, py) {
      if (!n) return null;
      const { e, f, r, u } = basis();
      const asp = cv.clientWidth / Math.max(1, cv.clientHeight), th = Math.tan(FOV / 2);
      const nx = (px / cv.clientWidth) * 2 - 1, ny = 1 - (py / cv.clientHeight) * 2;
      const d = [f[0] + nx * th * asp * r[0] + ny * th * u[0], f[1] + nx * th * asp * r[1] + ny * th * u[1], f[2] + nx * th * asp * r[2] + ny * th * u[2]];
      const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
      let best = Infinity, who = null;
      for (let t = 0; t < owner.length; t++) {
        const i = t * 9;
        const e1 = [pos[i + 3] - pos[i], pos[i + 4] - pos[i + 1], pos[i + 5] - pos[i + 2]], e2 = [pos[i + 6] - pos[i], pos[i + 7] - pos[i + 1], pos[i + 8] - pos[i + 2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) continue;
        const s = [e[0] - pos[i], e[1] - pos[i + 1], e[2] - pos[i + 2]];
        const uu = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det; if (uu < 0 || uu > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
        const vv = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (vv < 0 || uu + vv > 1) continue;
        const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
        if (tt > 0 && tt < best) { best = tt; who = owner[t]; }
      }
      return who === null ? null : S.built[who].id;
    }
    // Maus
    let drag = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey }; });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.pan) {
        const { r, u } = basis(); const k = (cam.dist * 2 * Math.tan(FOV / 2)) / cv.clientHeight;
        for (let a = 0; a < 3; a++) cam.target[a] += (-dx * r[a] + dy * u[a]) * k;
      } else { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.05, Math.min(1.5, cam.pitch + dy * 0.006)); }
      drag.x = e.clientX; drag.y = e.clientY; dirty = true;
    });
    cv.addEventListener('pointerup', (e) => {
      const d = drag; drag = null;
      if (d && !d.moved) { const b = cv.getBoundingClientRect(); waehle(pick(e.clientX - b.left, e.clientY - b.top)); }
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(10, Math.min(20000, cam.dist * Math.exp(e.deltaY * 0.0012))); dirty = true; }, { passive: false });
    $('ansichtZurueck').addEventListener('click', () => { fit(); });
    function loop() { if (dirty) draw(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
    return { setData, setSelected, fokus, redraw: () => { dirty = true; }, ok, cam, pick: (x, y) => pick(x, y) };
  })();

  // ---------------------------------------------------------------- Tabs
  function wechselTab(t) {
    ['karte', 'd3', 'liste'].forEach((k) => { $('tab_' + k).classList.toggle('aktiv', k === t); $('seite_' + k).classList.toggle('aktiv', k === t); });
    M.dirty = true; gl.redraw();
  }
  ['karte', 'd3', 'liste'].forEach((k) => $('tab_' + k).addEventListener('click', () => wechselTab(k)));
  window.addEventListener('resize', () => { M.dirty = true; gl.redraw(); });
  setInterval(() => { if (M.dirty) mapDraw(); }, 60);

  // ---------------------------------------------------------------- Export-Knöpfe
  function meta() { return { gebiet: 'Umgebungsmodell', einheit: 'Meter', achsen: 'glTF: x = Ost, y = oben, z = Süd; Ursprung = Gebietsmitte', quelle: '© OpenStreetMap-Mitwirkende (ODbL); Höhen: ' + (S.exp ? 'TopoExport-Export ' + S.exp.name : 'OSM/manuell'), hinweis: 'Fehlende Höhen = flache Grundplatte' }; }
  $('btnGLB').addEventListener('click', () => speichern('umgebungsmodell.glb', U.buildGLB(S.built, meta())));
  $('btnCSV').addEventListener('click', () => speichern('gebaeude.csv', U.buildCSV(S.built)));
  $('btnSTL').addEventListener('click', () => {
    const mass = parseFloat($('massstab').value);
    if (!(mass > 0)) { meldung('exportMeldung', 'Bitte einen Maßstab größer 0 eingeben, z. B. 500 für 1:500.', 'warn'); return; }
    const bad = S.built.filter((b) => !b.props.mesh_geschlossen).length;
    const r = U.buildSTL(S.built, 1000 / mass);
    speichern('umgebungsmodell_1zu' + mass + '.stl', r.data);
    if (bad) meldung('exportMeldung', 'ACHTUNG: ' + bad + ' Gebäude sind nicht wasserdicht.', 'warn');
  });
  $('massstab').addEventListener('input', stlInfo);
  $('bett').addEventListener('input', stlInfo);

  // ---------------------------------------------------------------- Beispiel und Voreinstellung
  $('btnSued').addEventListener('click', () => { S.area = Object.assign({}, SUED); feldSync(); mapZoomAufGebiet(); });
  $('btnDemo').addEventListener('click', () => {
    const d = U.demo();
    S.area = { lat: d.lat, lon: d.lon, w: 500, l: 400 }; feldSync(); mapZoomAufGebiet();
    S.user = {};
    osmUebernehmen(d.osm, 'Beispieldaten');
    const res = U.parseOBJ(d.obj);
    S.exp = { name: 'Beispiel-Export.obj', groups: res.groups };
    verarbeiten();
    wechselTab('d3');
  });

  // Speichern über die Plattform (nur veröffentlichte Seite)
  try {
    if (window.claude && window.claude.use) window.claude.use('downloads').then((d) => { if (d) { S.dl = d; $('hinweisZip').style.display = 'block'; } }).catch(() => {});
  } catch (e) { /* ignorieren */ }

  feldSync(); mapZoomAufGebiet(); aktualisieren();
  window.__S = S; window.__gl = gl; window.__waehle = waehle;
})();
