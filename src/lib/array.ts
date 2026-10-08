// Copies multiples : réseaux rectangulaire et polaire, collage. Fonctions pures.
// Une « pose » transforme une copie d'un objet ; elle ne crée pas d'identifiant (c'est le
// rôle du magasin de projet, qui garantit l'unicité).
import { parentOf, withParent, type CadObject } from '@/types/cad';
import { moveObject, rotateObject } from '@/lib/geometry';

/** Transformation appliquée à une copie : renvoie la modification, ou null si impossible. */
export type Placement = (o: CadObject) => Partial<CadObject> | null;

const norm = (deg: number) => { const a = ((deg % 360) + 360) % 360; return a > 360 - 1e-9 ? 0 : a; };

/**
 * Objets à copier pour une sélection : les objets choisis, les objets associatifs qui les suivent
 * (cotes, ouvertures, vues liées) et le parent de chaque objet associatif choisi (une cote ne se copie
 * pas sans ce qu'elle mesure, une porte sans son mur).
 */
export function withDependencies(objects: CadObject[], selected: Iterable<string>): CadObject[] {
  const ids = new Set(selected);
  // Remonter aux parents (une cote sur une ouverture remonte jusqu'au mur).
  for (let changed = true; changed;) {
    changed = false;
    for (const o of objects) { const p = parentOf(o); if (p && ids.has(o.id) && !ids.has(p)) { ids.add(p); changed = true; } }
  }
  // Îlots de hachure : copiés avec le contour qui les désigne.
  for (const o of objects) if (ids.has(o.id)) for (const h of o.holes ?? []) ids.add(h);
  // Puis descendre aux objets associatifs des objets copiés.
  for (let changed = true; changed;) {
    changed = false;
    for (const o of objects) { const p = parentOf(o); if (p && ids.has(p) && !ids.has(o.id)) { ids.add(o.id); changed = true; } }
  }
  return objects.filter(o => ids.has(o.id));
}

/** Au-delà, l'opération est refusée (protection de l'atelier). */
export const MAX_COPIES = 5000;

export type PlacementOutcome = { ok: true; placements: Placement[] } | { ok: false; error: string };

const isCount = (n: number) => Number.isInteger(n) && n >= 1;

export const translation = (dx: number, dy: number): Placement => o => moveObject(o, dx, dy);

/**
 * Rotation d'une copie autour de (cx, cy), en degrés dans le sens trigonométrique (antihoraire
 * à l'écran). Un rectangle tourné d'un angle quelconque devient une polyligne fermée.
 */
export const rotation = (cx: number, cy: number, deg: number): Placement => o => {
  // Une occurrence de bloc n'a pas d'orientation : la tourner déplacerait son point d'insertion
  // sans tourner son contenu. Elle n'est donc pas transformée (l'appelant le signale).
  if (o.kind === 'blockRef' && Math.abs(norm(deg)) > 1e-9) return null;
  // rotateObject compte les angles positifs dans le sens horaire à l'écran.
  const patch = rotateObject(o, cx, cy, -deg);
  if (patch || o.kind !== 'rect') return patch;
  const pts = [o.x, o.y, o.x + o.w, o.y, o.x + o.w, o.y + o.h, o.x, o.y + o.h, o.x, o.y];
  const poly = { ...o, kind: 'polyline', points: pts } as unknown as CadObject;
  const rotated = rotateObject(poly, cx, cy, -deg);
  return rotated ? ({ kind: 'polyline', points: (rotated as { points: number[] }).points } as Partial<CadObject>) : null;
};

/**
 * Réseau rectangulaire : `rows` × `cols` exemplaires (original compris), au pas (dx, dy).
 * Renvoie les poses des copies seulement (l'original reste en place).
 */
export function rectangularArray(rows: number, cols: number, dx: number, dy: number, perCopy = 1): PlacementOutcome {
  if (!isCount(rows) || !isCount(cols)) return { ok: false, error: 'Lignes et colonnes : nombres entiers d’au moins 1.' };
  if (![dx, dy].every(Number.isFinite)) return { ok: false, error: 'Les pas doivent être des nombres.' };
  const copies = rows * cols - 1;
  if (copies < 1) return { ok: false, error: 'Le réseau doit compter au moins deux exemplaires.' };
  if ((rows > 1 && dy === 0) || (cols > 1 && dx === 0)) return { ok: false, error: 'Un pas nul superposerait les copies.' };
  if (copies * perCopy > MAX_COPIES) return { ok: false, error: `Trop de copies : ${copies * perCopy} (au plus ${MAX_COPIES}).` };
  const placements: Placement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      placements.push(translation(c * dx, r * dy));
    }
  }
  return { ok: true, placements };
}

/**
 * Angles (degrés, sens trigonométrique) des copies d'un réseau polaire de `count` exemplaires
 * (original compris) répartis sur `total` degrés. Sur un tour complet, le dernier exemplaire ne
 * recouvre pas le premier.
 */
export function polarAngles(count: number, total: number): number[] {
  const full = Math.abs(Math.abs(total) - 360) < 1e-9;
  const step = full ? total / count : total / (count - 1);
  const out: number[] = [];
  for (let k = 1; k < count; k++) out.push(k * step);
  return out;
}

/** Réseau polaire de `count` exemplaires autour de (cx, cy) sur `total` degrés (360 : tour complet). */
export function polarArray(count: number, total: number, cx: number, cy: number, perCopy = 1): PlacementOutcome {
  if (!Number.isInteger(count) || count < 2) return { ok: false, error: 'Le réseau doit compter au moins deux exemplaires.' };
  if (![total, cx, cy].every(Number.isFinite) || total === 0 || Math.abs(total) > 360) {
    return { ok: false, error: 'Angle total : entre −360° et 360°, non nul.' };
  }
  if ((count - 1) * perCopy > MAX_COPIES) return { ok: false, error: `Trop de copies : ${(count - 1) * perCopy} (au plus ${MAX_COPIES}).` };
  return { ok: true, placements: polarAngles(count, total).map(a => rotation(cx, cy, a)) };
}

/**
 * Crée les copies de `sources` pour chaque pose, avec des identifiants neufs tirés du compteur.
 * Une cote suit sa cible et une ouverture son mur : elle est copiée seulement si sa cible ou son
 * mur l'est aussi, et pointe alors vers cette copie. Les objets qu'une pose ne sait pas transformer sont omis.
 */
export function cloneAll(sources: CadObject[], placements: Placement[], counter: number, seq: number): { objects: CadObject[]; counter: number } {
  const out: CadObject[] = [];
  // Objets associatifs (cote, ouverture, vues) : copiés après leur parent, rattachés à sa copie.
  const shapes = sources.filter(o => !parentOf(o));
  const dependents = sources.filter(o => !!parentOf(o));
  for (const place of placements) {
    const ids = new Map<string, string>();
    const start = out.length;
    for (const o of shapes) {
      const patch = place(o);
      if (!patch) continue;
      counter += 1;
      const id = `OBJ-${String(counter).padStart(4, '0')}`;
      ids.set(o.id, id);
      out.push({ ...o, ...patch, id, createdSeq: seq } as CadObject);
    }
    // Îlots de hachure : ils suivent la copie de leur contour, sinon ils sont abandonnés
    // (seulement pour les copies de cette pose).
    for (const c of out.slice(start)) {
      if (c.holes) {
        const holes = c.holes.map(h => ids.get(h)).filter((h): h is string => !!h);
        if (holes.length) c.holes = holes; else delete c.holes;
      }
    }
    // Plusieurs passes : une cote d'ouverture suit la copie de l'ouverture, elle-même celle du mur.
    for (let pending = dependents, progress = true; pending.length && progress;) {
      progress = false;
      const next: CadObject[] = [];
      for (const d of pending) {
        const parent = ids.get(parentOf(d)!);
        if (!parent) { next.push(d); continue; }
        counter += 1;
        const id = `OBJ-${String(counter).padStart(4, '0')}`;
        ids.set(d.id, id);
        out.push({ ...withParent(d, parent), id, createdSeq: seq } as CadObject);
        progress = true;
      }
      pending = next;
    }
  }
  return { objects: out, counter };
}
