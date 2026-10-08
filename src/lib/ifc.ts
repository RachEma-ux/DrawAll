// Export IFC 4.3 (lot 17.1, décision D5) : fichier STEP physique (ISO 10303-21) au schéma
// IFC4X3_ADD2, écrit sans bibliothèque. Projet → site → bâtiment → étages (niveaux) ; murs, dalles,
// toitures, poteaux, poutres en volumes extrudés ou en faces ; baies (ouverture + porte ou fenêtre) ;
// espaces (pièces) ; jeux de propriétés et quantités de base. Mêmes éléments et mêmes hauteurs que la
// vue 3D (§8.11) : rien n'est inventé ; ce qui ne peut pas être exporté est dit dans le rapport.
// Repère : X du plan → X, Y du plan (vers le bas) → −Y (IFC : Y vers le nord), altitude → Z ; mm.
import type { CadObject, Georef, Level, OpeningObj, WallObj } from '@/types/cad';
import { gridNorthLocal, ifcMapConversion } from './georef';
import { building3d, roofFaces } from './building3d';
import { levelIdOf, levelsOf, onLevel } from './levels';
import { ifcClassOf, type PropertySet } from './properties';
import { areaM2, roomPolygons } from './rooms';
import { wallQuad } from './wall';

type P2 = [number, number];
type P3 = [number, number, number];

export interface IfcReport { exported: Record<string, number>; notExported: string[] }

// ——— Écriture STEP ———

/** Chaîne STEP : apostrophe doublée, barre oblique inverse doublée, hors ASCII en \X2\…\X0\. */
export function stepString(s: string): string {
  let out = '', wide = '';
  const flush = () => { if (wide) { out += `\\X2\\${wide}\\X0\\`; wide = ''; } };
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) {
      flush();
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else if (c <= 0xffff) wide += c.toString(16).toUpperCase().padStart(4, '0');
    else { flush(); out += `\\X4\\${c.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`; }
  }
  flush();
  return `'${out}'`;
}

/** Réel STEP : toujours un point décimal (1000. ; 0.5 ; 1.5E-07). */
export function stepReal(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`Réel non fini dans l'export IFC : ${v}`);
  const r = Math.abs(v) < 1e-12 ? 0 : v;
  const s = Number.isInteger(r) ? `${r}.` : String(Math.round(r * 1e9) / 1e9);
  return s.includes('e') ? s.replace('e', 'E').replace(/^(-?\d+)E/, '$1.E') : s;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** GlobalId IFC (22 caractères) déterministe, tiré d'une graine (projet + objet + rôle). */
export function ifcGuid(seed: string): string {
  // Quatre FNV-1a 32 bits à graines différentes → 128 bits.
  const words = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9].map(init => {
    let h = init >>> 0;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  });
  const bytes = words.flatMap(w => [w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255]);
  // 2 bits puis 21 × 6 bits (compression IFC) : premier caractère sur les 2 bits de tête.
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = ALPHABET[parseInt(bits.slice(0, 2), 2)];
  for (let i = 2; i < 128; i += 6) out += ALPHABET[parseInt(bits.slice(i, i + 6), 2)];
  return out;
}

class Step {
  lines: string[] = [];
  add(entity: string): string { this.lines.push(`#${this.lines.length + 1}=${entity};`); return `#${this.lines.length}`; }
}

const list = (xs: string[]) => `(${xs.join(',')})`;

// ——— Export ———

export interface IfcInput { objects: CadObject[]; levels: Level[] | undefined; projectName: string; date: Date; georef?: Georef }

export function exportIfc({ objects, levels: levelList, projectName, date, georef }: IfcInput): { content: string; report: IfcReport } {
  const s = new Step();
  const report: IfcReport = { exported: {}, notExported: [] };
  const count = (cls: string) => { report.exported[cls] = (report.exported[cls] ?? 0) + 1; };
  const guid = (id: string) => stepString(ifcGuid(`${projectName}|${id}`));
  const pt3 = (p: P3) => s.add(`IFCCARTESIANPOINT(${list(p.map(stepReal))})`);
  const pt2 = (p: P2) => s.add(`IFCCARTESIANPOINT(${list(p.map(stepReal))})`);
  const dir = (d: P3) => s.add(`IFCDIRECTION(${list(d.map(stepReal))})`);
  const axis3 = (o: P3) => s.add(`IFCAXIS2PLACEMENT3D(${pt3(o)},$,$)`);
  const toIfc = (p: { x: number; y: number } | P2): P2 => (Array.isArray(p) ? [p[0], -p[1]] : [p.x, -p.y]);

  // Unités : millimètre, mètre carré, mètre cube, radian.
  const units = s.add(`IFCUNITASSIGNMENT(${list([
    s.add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), s.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    s.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), s.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ])})`);
  // Nord du quadrillage (lot 17.3) dans le repère local, si le projet est géoréférencé.
  const trueNorth = georef ? s.add(`IFCDIRECTION(${list(gridNorthLocal(georef).map(stepReal))})`) : '$';
  const context = s.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${axis3([0, 0, 0])},${trueNorth})`);
  if (georef) {
    // Système projeté déclaré et conversion du repère du projet (mm) vers la carte (m).
    const metre = s.add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
    const crs = s.add(`IFCPROJECTEDCRS(${stepString(georef.crs)},$,$,$,$,$,${metre})`);
    const m = ifcMapConversion(georef);
    s.add(`IFCMAPCONVERSION(${context},${crs},${[m.eastings, m.northings, m.orthogonalHeight, m.xAxisAbscissa, m.xAxisOrdinate, m.scale].map(stepReal).join(',')})`);
  }
  const body = s.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const project = s.add(`IFCPROJECT(${guid('projet')},$,${stepString(projectName)},$,$,$,$,(${context}),${units})`);
  const sitePl = s.add(`IFCLOCALPLACEMENT($,${axis3([0, 0, 0])})`);
  const site = s.add(`IFCSITE(${guid('site')},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPl = s.add(`IFCLOCALPLACEMENT(${sitePl},${axis3([0, 0, 0])})`);
  const building = s.add(`IFCBUILDING(${guid('batiment')},$,${stepString('Bâtiment')},$,$,${buildingPl},$,$,.ELEMENT.,$,$,$)`);
  s.add(`IFCRELAGGREGATES(${guid('agg-projet')},$,$,$,${project},(${site}))`);
  s.add(`IFCRELAGGREGATES(${guid('agg-site')},$,$,$,${site},(${building}))`);

  const levels = levelsOf(levelList);
  const storeys = new Map<string, { ref: string; pl: string; elevation: number; contents: string[] }>();
  for (const l of levels) {
    const pl = s.add(`IFCLOCALPLACEMENT(${buildingPl},${axis3([0, 0, l.elevation])})`);
    const ref = s.add(`IFCBUILDINGSTOREY(${guid(`etage|${l.id}`)},$,${stepString(l.name)},$,$,${pl},$,$,.ELEMENT.,${stepReal(l.elevation)})`);
    storeys.set(l.id, { ref, pl, elevation: l.elevation, contents: [] });
    count('IfcBuildingStorey');
  }
  s.add(`IFCRELAGGREGATES(${guid('agg-batiment')},$,$,$,${building},${list([...storeys.values()].map(v => v.ref))})`);

  const shape = (rep: string) => s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  const polyline2 = (poly: P2[]) => s.add(`IFCPOLYLINE(${list([...poly, poly[0]].map(pt2))})`);
  /** Volume extrudé verticalement d'un contour (repère IFC), de z0 à z0 + h, relatif à l'étage. */
  const extruded = (poly: P2[], z0: number, h: number) => {
    const profile = s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyline2(poly)})`);
    const solid = s.add(`IFCEXTRUDEDAREASOLID(${profile},${axis3([0, 0, z0])},${dir([0, 0, 1])},${stepReal(h)})`);
    return shape(s.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`));
  };
  const circleExtruded = (c: P2, r: number, z0: number, h: number) => {
    const profile = s.add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${s.add(`IFCAXIS2PLACEMENT2D(${pt2(c)},$)`)},${stepReal(r)})`);
    const solid = s.add(`IFCEXTRUDEDAREASOLID(${profile},${axis3([0, 0, z0])},${dir([0, 0, 1])},${stepReal(h)})`);
    return shape(s.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`));
  };
  const facesShape = (faces: P3[][]) => {
    const fs = faces.map(f => s.add(`IFCFACE((${s.add(`IFCFACEOUTERBOUND(${s.add(`IFCPOLYLOOP(${list(f.map(pt3))})`)},.T.)`)}))`));
    const model = s.add(`IFCSHELLBASEDSURFACEMODEL((${s.add(`IFCOPENSHELL(${list(fs)})`)}))`);
    return shape(s.add(`IFCSHAPEREPRESENTATION(${body},'Body','SurfaceModel',(${model}))`));
  };
  const area = (poly: P2[]) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

  const psetsOf = (o: CadObject, element: string) => {
    for (const ps of (o.psets ?? []) as PropertySet[]) {
      const props = ps.props.map(p => {
        const v = typeof p.value === 'boolean' ? `IFCBOOLEAN(${p.value ? '.T.' : '.F.'})` : typeof p.value === 'number' ? `IFCREAL(${stepReal(p.value)})` : `IFCLABEL(${stepString(p.value)})`;
        return s.add(`IFCPROPERTYSINGLEVALUE(${stepString(p.name)},${p.unit ? stepString(`unité : ${p.unit}`) : '$'},${v},$)`);
      });
      if (!props.length) continue;
      const set = s.add(`IFCPROPERTYSET(${guid(`pset|${o.id}|${ps.name}`)},$,${stepString(ps.name)},$,${list(props)})`);
      s.add(`IFCRELDEFINESBYPROPERTIES(${guid(`rel-pset|${o.id}|${ps.name}`)},$,$,$,(${element}),${set})`);
    }
  };
  const quantities = (o: CadObject, element: string, qtoName: string, qs: [string, 'LENGTH' | 'AREA' | 'VOLUME', number][]) => {
    const ents = qs.map(([name, kind, v]) => s.add(`IFCQUANTITY${kind}(${stepString(name)},$,$,${stepReal(v)},$)`));
    const qto = s.add(`IFCELEMENTQUANTITY(${guid(`qto|${o.id}`)},$,${stepString(qtoName)},$,$,${list(ents)})`);
    s.add(`IFCRELDEFINESBYPROPERTIES(${guid(`rel-qto|${o.id}`)},$,$,$,(${element}),${qto})`);
  };
  /** Classe d'export : celle choisie si c'est un élément bâti exportable, sinon celle du type. */
  const entityOf = (o: CadObject, fallback: string) => {
    const c = ifcClassOf(o);
    return c === 'IfcAnnotation' || c === 'IfcSpace' || c === 'IfcDoor' || c === 'IfcWindow' ? fallback : c;
  };
  const element = (o: CadObject, cls: string, rep: string, predefined = '.NOTDEFINED.') => {
    const st = storeys.get(levelIdOf(o))!;
    const pl = s.add(`IFCLOCALPLACEMENT(${st.pl},${axis3([0, 0, 0])})`);
    const ref = s.add(`${cls.toUpperCase()}(${guid(o.id)},$,${stepString(o.name)},$,$,${pl},${rep},${stepString(o.id)},${predefined})`);
    st.contents.push(ref);
    count(cls);
    psetsOf(o, ref);
    return ref;
  };

  // Volumes du bâtiment : mêmes décisions que la vue 3D (hauteurs, éléments écartés).
  const model = building3d(objects, levelList);
  for (const sk of model.skipped) report.notExported.push(`${sk.id} : ${sk.reason}`);
  const walls = new Map<string, { ref: string; z0: number; h: number; wall: WallObj }>();
  // Baies exportées en volume (hauteur et allège connues) : volume retiré à chaque mur (volume net).
  const wallHeight = new Map(model.meshes.filter(m => m.kind === 'wall').map(m => [m.id, m.positions[(m.positions.length / 6) * 3 + 1] - m.positions[1]]));
  const voids = new Map<string, number>();
  for (const o of objects) {
    if (o.kind !== 'opening' || o.height === undefined) continue;
    const w = objects.find(x => x.id === o.hostId), h = wallHeight.get(o.hostId), sill = o.sill ?? (o.type === 'porte' ? 0 : undefined);
    if (w?.kind !== 'wall' || h === undefined || sill === undefined) continue;
    voids.set(w.id, (voids.get(w.id) ?? 0) + (o.width * w.thickness * Math.max(0, Math.min(o.height, h - sill))) / 1e9);
  }
  for (const m of model.meshes) {
    const o = objects.find(x => x.id === m.id)!;
    const elev = storeys.get(levelIdOf(o))!.elevation;
    if (m.kind === 'roof') {
      const zs = m.positions.filter((_, i) => i % 3 === 1);
      const faces = roofFaces(o as never, Math.min(...zs) - elev).map(f => f.map(([x, y, z]) => [x, -y, z] as P3));
      element(o, entityOf(o, 'IfcRoof'), facesShape(faces));
      continue;
    }
    const n = m.positions.length / 6;
    const ring: P2[] = [];
    for (let i = 0; i < n; i++) ring.push(toIfc([m.positions[3 * i], m.positions[3 * i + 2]]));
    const z0 = m.positions[1] - elev, h = m.positions[3 * n + 1] - m.positions[1];
    if (o.kind === 'column' && o.section === 'circle') {
      const ref = element(o, entityOf(o, 'IfcColumn'), circleExtruded(toIfc([o.x, o.y]), o.d! / 2, z0, h), '.COLUMN.');
      quantities(o, ref, 'Qto_ColumnBaseQuantities', [['Length', 'LENGTH', h], ['GrossVolume', 'VOLUME', (Math.PI * (o.d! / 2) ** 2 * h) / 1e9]]);
      continue;
    }
    const cls = o.kind === 'wall' ? 'IfcWall' : o.kind === 'slab' ? 'IfcSlab' : o.kind === 'column' ? 'IfcColumn' : 'IfcBeam';
    const predefined = o.kind === 'wall' ? '.STANDARD.' : o.kind === 'slab' ? '.FLOOR.' : o.kind === 'column' ? '.COLUMN.' : '.BEAM.';
    const ref = element(o, entityOf(o, cls), extruded(ring, z0, h), predefined);
    const vol = (area(ring) * h) / 1e9;
    if (o.kind === 'wall') {
      walls.set(o.id, { ref, z0, h, wall: o });
      quantities(o, ref, 'Qto_WallBaseQuantities', [['Length', 'LENGTH', Math.hypot(o.x2 - o.x1, o.y2 - o.y1)], ['Width', 'LENGTH', o.thickness], ['Height', 'LENGTH', h], ['GrossVolume', 'VOLUME', vol], ['NetVolume', 'VOLUME', vol - (voids.get(o.id) ?? 0)]]);
    } else if (o.kind === 'slab') {
      quantities(o, ref, 'Qto_SlabBaseQuantities', [['Depth', 'LENGTH', h], ['GrossArea', 'AREA', area(ring) / 1e6], ['GrossVolume', 'VOLUME', vol]]);
    } else {
      quantities(o, ref, o.kind === 'column' ? 'Qto_ColumnBaseQuantities' : 'Qto_BeamBaseQuantities', [['Length', 'LENGTH', o.kind === 'beam' ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) : h], ['GrossVolume', 'VOLUME', vol]]);
    }
  }

  // Baies : ouverture qui évide le mur, remplie par la porte ou la fenêtre.
  for (const o of objects) {
    if (o.kind !== 'opening') continue;
    const host = walls.get(o.hostId);
    const cls = o.type === 'porte' ? 'IfcDoor' : 'IfcWindow';
    if (!host) { report.notExported.push(`${o.id} : mur hôte ${o.hostId} non exporté`); continue; }
    const geom = openingBox(o, host.wall);
    const sill = o.sill ?? (o.type === 'porte' ? 0 : undefined);
    const st = storeys.get(levelIdOf(host.wall))!;
    const pl = s.add(`IFCLOCALPLACEMENT(${st.pl},${axis3([0, 0, 0])})`);
    let filled: string | null = null;
    if (o.height !== undefined && sill !== undefined && geom) {
      const opening = s.add(`IFCOPENINGELEMENT(${guid(`ouverture|${o.id}`)},$,${stepString(`Baie ${o.id}`)},$,$,${pl},${extruded(geom.map(toIfc), host.z0 + sill, o.height)},$,.OPENING.)`);
      s.add(`IFCRELVOIDSELEMENT(${guid(`vide|${o.id}`)},$,$,$,${host.ref},${opening})`);
      count('IfcOpeningElement');
      filled = opening;
    } else report.notExported.push(`${o.id} : ${o.type === 'porte' ? 'porte' : 'fenêtre'} sans ${o.height === undefined ? 'hauteur de baie' : 'allège'} saisie, exportée sans volume et sans évider le mur`);
    const height = o.height === undefined ? '$' : stepReal(o.height);
    const pre = o.type === 'porte' ? '.DOOR.' : '.WINDOW.';
    const door = s.add(`${cls.toUpperCase()}(${guid(o.id)},$,${stepString(o.name)},$,$,${pl},$,${stepString(o.id)},${height},${stepReal(o.width)},${pre},$,$)`);
    st.contents.push(door);
    count(cls);
    psetsOf(o, door);
    if (filled) s.add(`IFCRELFILLSELEMENT(${guid(`rempli|${o.id}`)},$,$,$,${filled},${door})`);
  }

  // Espaces : contour de la pièce (calculé par étage), hauteur d'étage si elle est connue.
  for (const l of levels) {
    const onL = onLevel(objects, l.id);
    const polys = roomPolygons(onL);
    for (const o of onL) {
      if (o.kind !== 'room') continue;
      const poly = polys.get(o.id);
      if (!poly) { report.notExported.push(`${o.id} : pièce non fermée, espace non exporté`); continue; }
      const h = storeyHeightOf(levels, l.id);
      const st = storeys.get(l.id)!;
      const pl = s.add(`IFCLOCALPLACEMENT(${st.pl},${axis3([0, 0, 0])})`);
      const rep = h === null ? '$' : extruded(poly.map(toIfc), 0, h);
      if (h === null) report.notExported.push(`${o.id} : hauteur d'étage inconnue, espace sans volume`);
      const ref = s.add(`IFCSPACE(${guid(o.id)},$,${stepString(o.name)},$,$,${pl},${rep},$,.ELEMENT.,.SPACE.,$)`);
      st.contents.push(ref);
      count('IfcSpace');
      quantities(o, ref, 'Qto_SpaceBaseQuantities', [['NetFloorArea', 'AREA', areaM2(poly)], ...(h === null ? [] : [['Height', 'LENGTH', h] as [string, 'LENGTH', number]])]);
      psetsOf(o, ref);
    }
  }

  for (const o of objects) {
    if (o.kind === 'solid' || o.kind === 'occurrence') report.notExported.push(`${o.id} : solide du noyau (échange par STEP, lot 17.2)`);
  }
  for (const [id, st] of storeys) {
    if (st.contents.length) s.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`contenu|${id}`)},$,$,$,${list(st.contents)},${st.ref})`);
  }

  const stamp = date.toISOString().slice(0, 19);
  const header = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME(${stepString(`${projectName}.ifc`)},'${stamp}',(''),(''),'DrawAll','DrawAll','');`,
    "FILE_SCHEMA(('IFC4X3_ADD2'));", 'ENDSEC;', 'DATA;',
  ];
  return { content: [...header, ...s.lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n'), report };
}

function storeyHeightOf(levels: Level[], id: string): number | null {
  const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex(l => l.id === id);
  return i >= 0 && i + 1 < sorted.length ? sorted[i + 1].elevation - sorted[i].elevation : null;
}

/** Rectangle de la baie en plan, débordant de 1 mm de chaque face du mur (évidement net). */
function openingBox(o: OpeningObj, wall: WallObj): { x: number; y: number }[] | null {
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (!(len > 0)) return null;
  const u = { x: (wall.x2 - wall.x1) / len, y: (wall.y2 - wall.y1) / len }, n = { x: u.y, y: -u.x };
  const ring = wallQuad(wall);
  if (!ring) return null;
  // Décalages des faces du mur le long de n (justification comprise), depuis l'axe tracé.
  const offs = ring.map(p => (p.x - wall.x1) * n.x + (p.y - wall.y1) * n.y);
  const lo = Math.min(...offs) - 1, hi = Math.max(...offs) + 1;
  const a = o.position - o.width / 2, b = o.position + o.width / 2;
  const at = (t: number, k: number) => ({ x: wall.x1 + u.x * t + n.x * k, y: wall.y1 + u.y * t + n.y * k });
  return [at(a, lo), at(b, lo), at(b, hi), at(a, hi)];
}
