// Test des App-Kerns:  node webapp/tests/test_core.js
const U = require('../src/core.js');
let fehler = 0;
function pruefe(b, text) { console.log((b ? '  ok     ' : '  FEHLER ') + text); if (!b) fehler++; }
const nahe = (a, b, t) => a !== null && a !== undefined && Math.abs(a - b) <= (t === undefined ? 0.05 : t);

const demo = U.demo();
const proj = U.projection(demo.lat, demo.lon);

console.log('\n1. OSM lesen');
const osm = U.osmToBuildings(demo.osm, proj);
pruefe(osm.buildings.length === 10, '10 OSM-Gebäude gelesen (ist: ' + osm.buildings.length + ')');

console.log('\n2. OBJ lesen, Achsen und Einheit erkennen, Gebäude trennen');
const parsed = U.parseOBJ(demo.obj);
pruefe(parsed.groups.length === 9, '9 Objekte im OBJ (ist: ' + parsed.groups.length + ')');
const up = U.guessUp(parsed.groups);
pruefe(up.up === 'y', 'Höhenachse "y" erkannt (ist: ' + up.up + ')');
const unit = U.guessUnit(up.extents, up.up, 800);
pruefe(unit.name === 'cm', 'Einheit Zentimeter erkannt (ist: ' + unit.name + ')');
let comps = U.splitComponents(parsed.groups);
pruefe(comps.length === 9, '9 Gebäude getrennt (ist: ' + comps.length + ')');
// Alle Dreiecke in einer Gruppe: Trennung über Zusammenhang
const einTopf = U.splitComponents([{ name: 'alles', tris: parsed.groups.flatMap((g) => g.tris) }]);
pruefe(einTopf.length === 9, 'Trennung über zusammenhängende Flächen funktioniert auch ohne Gruppen (ist: ' + einTopf.length + ')');

console.log('\n3. Dachform erkennen');
const analyzed = comps.map((c) => { const tris = U.toENU(c.tris, { up: up.up, unit: unit.factor, flip: 0 }); const a = U.analyzeComponent(tris); a.name = c.name; return a; });
const erwartet = ['gabled', 'flat', 'hipped', 'pyramidal', 'skillion', 'gabled', null, 'flat', 'gabled'];
const wl = analyzed.map((a) => a.shape);
erwartet.forEach((e, i) => { if (e) pruefe(wl[i] === e && analyzed[i].confidence >= 0.8, 'Gebäude ' + (i + 1) + ': ' + e + ' erkannt (ist: ' + wl[i] + ', Sicherheit ' + analyzed[i].confidence + ')'); });
pruefe(analyzed[6].confidence < 0.8, 'Gebäude 7 (Walm nur an einem Ende): als unsicher erkannt (Sicherheit ' + analyzed[6].confidence + ')');
pruefe(nahe(analyzed[0].eaveRel, 8) && nahe(analyzed[0].ridgeRel, 12), 'Gebäude 1: Traufe 8 m, First 12 m (ist ' + analyzed[0].eaveRel.toFixed(2) + ' / ' + analyzed[0].ridgeRel.toFixed(2) + ')');
pruefe(nahe(analyzed[2].eaveRel, 11) && nahe(analyzed[2].ridgeRel, 14), 'Gebäude 3 (Walm): Traufe 11 m, First 14 m');
pruefe(!U.markLod1(analyzed), 'Beispiel wird nicht als LoD1 erkannt');

console.log('\n4. Zuordnung zu OSM');
const match = U.alignAndMatch(analyzed, osm.buildings);
pruefe(match.ok && match.matches.size === 8, '8 Gebäude zugeordnet (ist: ' + match.matches.size + ')');
pruefe(match.unmatchedComps.length === 1, '1 Export-Gebäude ohne OSM-Partner (ist: ' + match.unmatchedComps.length + ')');
pruefe(Math.abs(match.dx + 435120.5) < 1.5 || Math.abs(match.dx - 0) > 1000, 'Verschiebung wurde berechnet (dx=' + match.dx.toFixed(1) + ')');
const gespiegelt = analyzed.map((a) => Object.assign({}, a, { centroid: [-a.centroid[0], a.centroid[1]] }));
const m2 = U.alignAndMatch(gespiegelt, osm.buildings);
pruefe(m2.matches.size === 8 && m2.flip === 1, 'Auch gespiegelte Exporte werden zugeordnet (Spiegelung ' + m2.flip + ', ' + m2.matches.size + ' Treffer)');

console.log('\n5. Gebäude bauen');
const recs = [];
osm.buildings.forEach((o, j) => {
  const ci = match.matches.get(j);
  let comp = null;
  if (ci !== undefined) {
    const a = analyzed[ci];
    const tris = U.toENU(comps[ci].tris, { up: up.up, unit: unit.factor, flip: match.flip });
    comp = U.analyzeComponent(tris); comp.name = comps[ci].name;
    comp.lod1Like = false;
  }
  recs.push({ id: 'way_' + o.osm_id, osm: o, comp, user: {} });
});
const bs = recs.map((r) => U.makeBuilding(r, { plateThickness: 1 }));
const nach = {};
bs.forEach((b) => { nach[b.id] = b; });
pruefe(bs.every((b) => b && b.props.mesh_geschlossen), 'alle ' + bs.length + ' Körper wasserdicht');
const V = (id) => U.volume(nach[id]);
pruefe(nahe(nach.way_1001.props.traufhoehe_m, 8) && nahe(nach.way_1001.props.firsthoehe_m, 12), 'way_1001: Traufe 8, First 12');
pruefe(nach.way_1001.props.hoehenquelle === 'TopoExport', 'Höhenquelle TopoExport');
pruefe(nahe(nach.way_1001.props.laenge_m, 20) && nahe(nach.way_1001.props.breite_m, 10), 'way_1001: Länge 20 m, Breite 10 m (aus OSM-Umriss)');
pruefe(Math.abs(V('way_1001') - 2000) < 1, 'Volumen Satteldach 2000 m³ (ist ' + V('way_1001').toFixed(1) + ')');
pruefe(Math.abs(V('way_1002') - 1296) < 1, 'Volumen Flachdach 1296 m³ (ist ' + V('way_1002').toFixed(1) + ')');
pruefe(Math.abs(V('way_1003') - 5512.5) < 1, 'Volumen Walmdach 5512,5 m³ (ist ' + V('way_1003').toFixed(1) + ')');
pruefe(Math.abs(V('way_1004') - 1000) < 1, 'Volumen Pyramidendach 1000 m³ (ist ' + V('way_1004').toFixed(1) + ')');
pruefe(Math.abs(V('way_1005') - (14 * 8 * 4 + 14 * 8 * 3 / 2)) < 1, 'Volumen Pultdach ' + (14 * 8 * 5.5) + ' m³ (ist ' + V('way_1005').toFixed(1) + ')');
pruefe(Math.abs(V('way_1006') - 1368) < 1, 'Volumen quer liegendes Satteldach 1368 m³ (ist ' + V('way_1006').toFixed(1) + ')');
const hoch = nach.way_1006.V.filter((v) => Math.abs(v[2] - 11) < 1e-6);
pruefe(hoch.length === 2 && Math.abs(Math.hypot(hoch[0][0] - hoch[1][0], hoch[0][1] - hoch[1][1]) - 8) < 0.05, 'way_1006: First liegt quer (8 m lang), aus dem Export abgeleitet');
pruefe(nach.way_1007.props.status === 'Dachform unsicher' && nach.way_1007.uncertain, 'way_1007: Status "Dachform unsicher"');
pruefe(nach.way_1007.candidates[0] === 'gabled' && nach.way_1007.candidates.length === 5, 'way_1007: Auswahl beginnt mit OSM-Vorschlag, 5 Dachformen zur Wahl');
pruefe(nach.way_1008.props.dachform.includes('vereinfacht') === false && nahe(nach.way_1008.props.firsthoehe_m, 10), 'way_1008: L-Form flach, Höhe 10 m');
pruefe(nach.way_1009.props.status === 'Höhe fehlt' && nach.way_1009.props.firsthoehe_m === null, 'way_1009 (ohne Export): Höhe fehlt, keine erfundene Höhe');
pruefe(nach.way_1009.props.hinweise.includes('Geschosse laut OSM'), 'way_1009: Geschosszahl nur als Hinweis');
pruefe(nach.way_1010.props.status === 'Höhe fehlt', 'way_1010: Höhe fehlt');

console.log('\n6. Benutzer wählt Dachform per Klick');
const r7 = recs.find((r) => r.id === 'way_1007');
r7.user = { shape: 'hipped' };
const b7 = U.makeBuilding(r7, {});
pruefe(b7.props.status === 'manuell' && b7.props.dachform === 'Walmdach' && b7.props.dachform_quelle === 'manuell gewählt', 'way_1007 nach Auswahl "Walmdach": Status manuell, Quelle gespeichert');
pruefe(b7.props.mesh_geschlossen && !b7.uncertain, 'way_1007 danach wasserdicht, nicht mehr unsicher');

console.log('\n7. LoD1-Fall (nur Höhe, keine Dachform)');
const c1 = U.analyzeComponent(U.toENU(comps[1].tris, { up: 'y', unit: 0.01, flip: 0 }));
c1.lod1Like = true;
const rl = U.makeBuilding({ id: 'x', osm: osm.buildings[1], comp: c1, user: {} }, {});
pruefe(rl.uncertain && rl.props.status === 'Dachform unsicher' && rl.needsEave === false, 'LoD1: Dachform wird abgefragt');
const rl2 = U.makeBuilding({ id: 'x', osm: osm.buildings[1], comp: c1, user: { shape: 'gabled', roofH: 3, roofHDefault: true } }, {});
pruefe(nahe(rl2.props.traufhoehe_m, 6) && nahe(rl2.props.firsthoehe_m, 9) && rl2.props.hinweise.includes('prüfen'), 'LoD1 + Satteldach + Dachhöhe 3 m: Traufe 6 m, Hinweis zur Prüfung');

console.log('\n8. Export-Dateien');
const meta = { quelle: 'test' };
const glb = U.buildGLB(bs, meta);
const dv = new DataView(glb.buffer, glb.byteOffset);
pruefe(dv.getUint32(0, true) === 0x46546c67 && dv.getUint32(4, true) === 2 && dv.getUint32(8, true) === glb.length, 'GLB-Kopf gültig');
const jl = dv.getUint32(12, true);
const gltf = JSON.parse(Buffer.from(glb.slice(20, 20 + jl)).toString('utf8'));
pruefe(gltf.nodes.length === bs.length + 1 && gltf.nodes[1].extras.laenge_m === bs[0].props.laenge_m, 'GLB: Gebäude-Knoten mit Maßen als extras');
const acc = gltf.accessors[gltf.meshes[gltf.nodes[1].mesh].primitives[0].attributes.POSITION];
pruefe(nahe(acc.max[1], 12, 0.01) && nahe(acc.min[1], 0, 0.01), 'GLB: Höhe von 0 bis 12 m');
const stl = U.buildSTL(bs, 1000 / 500);
pruefe(stl.data.length === 84 + 50 * stl.triangles, 'STL: Größe passt (' + stl.triangles + ' Dreiecke)');
const csv = U.buildCSV(bs);
pruefe(csv.startsWith('﻿ID;') && csv.includes('Satteldach') && csv.includes('Dachform-Quelle'), 'CSV mit Kopfzeile und Dachform');

console.log('\n9. Weitere Formate');
const tri = '  0\nSECTION\n  2\nENTITIES\n  0\n3DFACE\n  8\nHaus1\n 10\n0\n 20\n0\n 30\n0\n 11\n1\n 21\n0\n 31\n0\n 12\n1\n 22\n1\n 32\n0\n 13\n0\n 23\n1\n 33\n0\n  0\nENDSEC\n  0\nEOF\n';
const dxf = U.parseDXF(tri);
pruefe(dxf.groups.length === 1 && dxf.groups[0].tris.length === 2 && dxf.groups[0].name === 'Haus1', 'DXF: 3DFACE (Viereck) als 2 Dreiecke, Layer-Name übernommen');
const stlAscii = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid';
pruefe(U.parseSTL(new TextEncoder().encode(stlAscii)).groups[0].tris.length === 1, 'STL (Text) gelesen');
const stlBin = U.parseSTL(stl.data);
pruefe(stlBin.groups[0].tris.length === stl.triangles, 'STL (binär) gelesen');
const poly = U.parseOBJ('v 0 0 0\nv 4 0 0\nv 4 4 0\nv 2 1 0\nv 0 4 0\nf 1 2 3 4 5\n');
pruefe(poly.groups[0].tris.length === 3, 'OBJ: Vieleck mit 5 Ecken in 3 Dreiecke zerlegt');

console.log('\n' + (fehler ? fehler + ' TEST(S) FEHLGESCHLAGEN' : 'ALLE TESTS BESTANDEN'));
process.exit(fehler ? 1 : 0);
