// Groupes (lot 10.5) : des objets partagent un identifiant GRP-0001 ; désigner un membre désigne
// le groupe. Fonctions pures.
import type { CadObject } from '@/types/cad';

const NUM = /^GRP-(\d+)$/;

/** Identifiant de groupe libre suivant (plus grand numéro existant + 1). */
export function nextGroupId(objects: CadObject[], taken: Iterable<string> = []): string {
  let max = 0;
  for (const id of [...objects.map(o => o.groupId), ...taken]) {
    const m = id ? NUM.exec(id) : null;
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `GRP-${String(max + 1).padStart(4, '0')}`;
}

/** Sélection étendue aux autres membres des groupes touchés (ordre conservé, désigné en dernier). */
export function expandToGroups(objects: CadObject[], ids: string[]): string[] {
  const groups = new Set(objects.filter(o => ids.includes(o.id) && o.groupId).map(o => o.groupId!));
  if (groups.size === 0) return ids;
  const members = objects.filter(o => o.groupId && groups.has(o.groupId) && !ids.includes(o.id)).map(o => o.id);
  return [...members, ...ids];
}

/** Grouper : tous les objets désignés (et les membres de leurs groupes) forment un groupe neuf. */
export function groupPatches(objects: CadObject[], ids: string[]): { groupId: string; patches: { id: string; patch: Partial<CadObject> }[] } | null {
  const all = expandToGroups(objects, ids);
  if (all.length < 2) return null;
  const groupId = nextGroupId(objects);
  return { groupId, patches: all.map(id => ({ id, patch: { groupId } })) };
}

/** Dégrouper : les groupes des objets désignés sont dissous (identifiant retiré de leurs membres). */
export function ungroupIds(objects: CadObject[], ids: string[]): string[] {
  const groups = new Set(objects.filter(o => ids.includes(o.id) && o.groupId).map(o => o.groupId!));
  return objects.filter(o => o.groupId && groups.has(o.groupId)).map(o => o.id);
}

/** Groupes du projet : identifiant et membres, triés. */
export function groupsOf(objects: CadObject[]): { id: string; members: string[] }[] {
  const map = new Map<string, string[]>();
  for (const o of objects) if (o.groupId) map.set(o.groupId, [...(map.get(o.groupId) ?? []), o.id]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, members]) => ({ id, members }));
}
