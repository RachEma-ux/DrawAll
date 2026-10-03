// État du projet : microversions Git-like, annulation, versions nommées,
// persistance locale (cache navigateur — Concept §8 : espace de travail local explicite).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CadObject, MicroVersion, NewCadObject, ProjectState } from '@/types/cad';

const STORAGE_KEY = 'drawall-projet-v1';

function seedProject(): ProjectState {
  const objects: CadObject[] = [
    { id: 'OBJ-0001', name: 'Mur porteur A', kind: 'rect', classification: 'architecture', layer: 'Bâtiment', createdSeq: 0, x: 80, y: 80, w: 460, h: 24 },
    { id: 'OBJ-0002', name: 'Mur porteur B', kind: 'rect', classification: 'architecture', layer: 'Bâtiment', createdSeq: 0, x: 80, y: 80, w: 24, h: 320 },
    { id: 'OBJ-0003', name: 'Support machine', kind: 'rect', classification: 'mecanique', layer: 'Équipements', createdSeq: 0, x: 200, y: 200, w: 120, h: 90 },
    { id: 'OBJ-0004', name: 'Axe de référence', kind: 'line', classification: 'structure', layer: 'Repères', createdSeq: 0, x1: 140, y1: 360, x2: 520, y2: 360 },
    { id: 'OBJ-0005', name: 'Armoire électrique', kind: 'circle', classification: 'electrique', layer: 'Équipements', createdSeq: 0, cx: 460, cy: 180, r: 42 },
  ];
  return {
    versions: [{ seq: 0, label: 'Projet initial — démonstrateur atelier', time: Date.now(), objects }],
    pointer: 0,
    counter: 5,
  };
}

function load(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ProjectState;
      if (Array.isArray(p.versions) && p.versions.length > 0) return p;
    }
  } catch { /* cache illisible : réinitialisation */ }
  return seedProject();
}

export function useProject() {
  const [state, setState] = useState<ProjectState>(load);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota : état visible, non bloquant */ }
  }, [state]);

  const objects = state.versions[state.pointer].objects;
  const current = state.versions[state.pointer];

  const commit = useCallback((label: string, next: CadObject[], counter?: number) => {
    setState(s => {
      const seq = s.versions[s.versions.length - 1].seq + 1;
      const mv: MicroVersion = { seq, label, time: Date.now(), objects: next };
      return {
        versions: [...s.versions.slice(0, s.pointer + 1), mv],
        pointer: s.pointer + 1,
        counter: counter ?? s.counter,
      };
    });
  }, []);

  const addObject = useCallback((partial: NewCadObject, name?: string) => {
    const id = `OBJ-${String(state.counter + 1).padStart(4, '0')}`;
    const obj = { ...partial, id, createdSeq: state.versions[state.pointer].seq, name: name ?? id } as CadObject;
    commit(`Créer ${obj.kind === 'line' ? 'ligne' : obj.kind === 'rect' ? 'rectangle' : obj.kind === 'circle' ? 'cercle' : 'polyligne'} ${id}`, [...objects, obj], state.counter + 1);
    setSelectedId(id);
    return id;
  }, [state, objects, commit]);

  const updateObject = useCallback((id: string, patch: Partial<CadObject>, label = 'Modifier') => {
    commit(`${label} ${id}`, objects.map(o => (o.id === id ? ({ ...o, ...patch } as CadObject) : o)));
  }, [objects, commit]);

  const removeObject = useCallback((id: string) => {
    commit(`Supprimer ${id}`, objects.filter(o => o.id !== id));
    setSelectedId(sel => (sel === id ? null : sel));
  }, [objects, commit]);

  const undo = useCallback(() => setState(s => ({ ...s, pointer: Math.max(0, s.pointer - 1) })), []);
  const redo = useCallback(() => setState(s => ({ ...s, pointer: Math.min(s.versions.length - 1, s.pointer + 1) })), []);

  const goTo = useCallback((index: number) => {
    setState(s => ({ ...s, pointer: Math.max(0, Math.min(s.versions.length - 1, index)) }));
    setSelectedId(null);
  }, []);

  const nameVersion = useCallback((name: string) => {
    setState(s => ({
      ...s,
      versions: s.versions.map((v, i) => (i === s.pointer ? { ...v, named: name } : v)),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(seedProject());
    setSelectedId(null);
  }, []);

  const canUndo = state.pointer > 0;
  const canRedo = state.pointer < state.versions.length - 1;

  const diagnostics = useMemo(() => {
    const out: { level: 'info' | 'avertissement'; text: string }[] = [];
    const unclassified = objects.filter(o => o.classification === 'non-classifie');
    if (unclassified.length > 0) {
      out.push({ level: 'avertissement', text: `${unclassified.length} objet(s) sans classification métier — lectures indisponibles (${unclassified.map(o => o.id).join(', ')}).` });
    }
    for (const o of objects) {
      if (o.kind === 'line' && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 1) {
        out.push({ level: 'avertissement', text: `${o.id} : ligne de longueur nulle — géométrie à réparer.` });
      }
      if (o.kind === 'rect' && (o.w < 1 || o.h < 1)) {
        out.push({ level: 'avertissement', text: `${o.id} : rectangle dégénéré — géométrie à réparer.` });
      }
    }
    if (state.pointer < state.versions.length - 1) {
      out.push({ level: 'info', text: `Position historique : ${state.versions.length - 1 - state.pointer} microversion(s) en avance — toute modification créera une branche.` });
    }
    if (out.length === 0) out.push({ level: 'info', text: 'Aucun problème détecté sur la révision courante.' });
    return out;
  }, [objects, state.pointer, state.versions.length]);

  return {
    objects, current, versions: state.versions, pointer: state.pointer,
    selectedId, setSelectedId,
    addObject, updateObject, removeObject,
    undo, redo, goTo, canUndo, canRedo, nameVersion, reset,
    diagnostics,
  };
}
