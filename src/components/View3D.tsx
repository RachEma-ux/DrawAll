// Vue 3D (lot 15.1) : solides dérivés du plan (src/lib/building3d.ts) rendus en WebGL2 avec three.js,
// chargé à la demande (le module ne pèse rien tant que la vue n'est pas ouverte). Orbite, cadrage,
// temps de trame mesuré (rendu seul, synchronisé avec le GPU) et affiché.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CadObject, Layer, Level } from '@/types/cad';
import { building3d, p95, type Building3D, type Mesh3D } from '@/lib/building3d';
import { kernelMesh } from '@/lib/kernel/client';
import { effectiveSolid } from '@/lib/solids';
import { levelIdOf, levelsOf } from '@/lib/levels';

interface Props {
  objects: CadObject[];
  layers: Layer[];
  levels: Level[] | undefined;
  onClose: () => void;
}

const COLORS: Partial<Record<CadObject['kind'], number>> = { solid: 0x7dd3fc, wall: 0xd6d3cb, slab: 0x9aa4b2, column: 0xb8c4d6, beam: 0xa3b8d0, roof: 0xb4553f };
const KIND_LABEL: Partial<Record<CadObject['kind'], [string, string]>> = { wall: ['mur', 'murs'], slab: ['dalle', 'dalles'], column: ['poteau', 'poteaux'], beam: ['poutre', 'poutres'], roof: ['toiture', 'toitures'], solid: ['solide', 'solides'] };

type Status = { state: 'chargement' } | { state: 'pret'; p95: number | null } | { state: 'erreur'; message: string };

export default function View3D({ objects, layers, levels, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const frameRef = useRef<() => void>(() => {});
  const measureRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>({ state: 'chargement' });

  const visible = useMemo(() => {
    const shown = new Set(layers.filter(l => l.visible).map(l => l.id));
    return objects.filter(o => shown.has(o.layerId));
  }, [objects, layers]);
  const plan = useMemo(() => building3d(visible, levels), [visible, levels]);
  // Solides du noyau (lot 15.2) : maillés par OCCT dans le Worker, posés à l'altitude de leur niveau.
  // Solides et occurrences de pièces (lot 16.3), maillés par le noyau.
  const solids = useMemo(() => visible.flatMap(o => { const s = effectiveSolid(o, objects); return s ? [s] : []; }), [visible, objects]);
  const [kernelPart, setKernelPart] = useState<{ for: CadObject[]; part: Building3D } | null>(null);
  useEffect(() => {
    if (!solids.length) return;
    let live = true;
    const lv = levelsOf(levels);
    Promise.allSettled(solids.map(s => (s.kind === 'solid' ? kernelMesh(s.recipe, 1) : Promise.reject(new Error('non solide'))))).then(results => {
      if (!live) return;
      const part: Building3D = { meshes: [], skipped: [] };
      results.forEach((r, i) => {
        const s = solids[i], z = lv.find(l => l.id === levelIdOf(s))?.elevation ?? 0;
        if (r.status === 'rejected') { part.skipped.push({ id: s.id, reason: `noyau 3D : ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` }); return; }
        const v = r.value.mesh.vertices, positions: number[] = [];
        for (let k = 0; k + 2 < v.length; k += 3) positions.push(v[k], v[k + 2] + z, v[k + 1]);
        part.meshes.push({ id: s.id, kind: 'solid', positions, indices: r.value.mesh.triangles });
      });
      setKernelPart({ for: solids, part });
    });
    return () => { live = false; };
  }, [solids, levels]);
  const pending = solids.length > 0 && kernelPart?.for !== solids;
  const model = useMemo<Building3D>(() => (solids.length && kernelPart?.for === solids
    ? { meshes: [...plan.meshes, ...kernelPart.part.meshes], skipped: [...plan.skipped, ...kernelPart.part.skipped] }
    : plan), [plan, solids, kernelPart]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of model.meshes) c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
    return [...c].map(([k, n]) => `${n} ${KIND_LABEL[k as CadObject['kind']]?.[n > 1 ? 1 : 0] ?? k}`);
  }, [model]);

  useEffect(() => {
    const el = host.current;
    if (!el || pending) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const canvas = document.createElement('canvas');
      if (!canvas.getContext('webgl2')) { setStatus({ state: 'erreur', message: 'WebGL2 indisponible sur cet appareil : vue 3D impossible.' }); return; }
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(canvas);
      canvas.setAttribute('aria-label', 'Maquette 3D');
      canvas.className = 'block h-full w-full touch-none';
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1120);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(1, 2, 1.5);
      scene.add(sun);
      const camera = new THREE.PerspectiveCamera(45, 1, 10, 1e7);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = false;

      const group = new THREE.Group();
      const toGeometry = (m: Mesh3D) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
        g.setIndex(m.indices);
        g.computeVertexNormals();
        return g;
      };
      for (const m of model.meshes) {
        const g = toGeometry(m);
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COLORS[m.kind] ?? 0xcccccc, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }));
        mesh.userData.id = m.id;
        group.add(mesh);
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), new THREE.LineBasicMaterial({ color: 0x1e293b })));
      }
      scene.add(group);

      const render = () => renderer.render(scene, camera);
      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };
      // Cadrage : la sphère englobante tient dans le champ, vue de trois quarts.
      const frame = () => {
        const box = new THREE.Box3().setFromObject(group);
        const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const r = box.isEmpty() ? 5000 : Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 500);
        const d = r / Math.sin(((camera.fov / 2) * Math.PI) / 180);
        camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(d));
        camera.near = d / 1000;
        camera.far = d * 10;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        render();
      };
      // Mesure : 60 trames autour du bâtiment, rendu puis attente du GPU (finish).
      const measure = () => {
        const gl = renderer.getContext();
        const times: number[] = [];
        const start = camera.position.clone().sub(controls.target);
        for (let i = 0; i < 60; i++) {
          camera.position.copy(start).applyAxisAngle(new THREE.Vector3(0, 1, 0), (i / 60) * 2 * Math.PI).add(controls.target);
          camera.lookAt(controls.target);
          const t0 = performance.now();
          render();
          gl.finish();
          times.push(performance.now() - t0);
        }
        camera.position.copy(start).add(controls.target);
        controls.update();
        render();
        if (!disposed) setStatus({ state: 'pret', p95: p95(times) });
      };
      frameRef.current = frame;
      measureRef.current = measure;
      controls.addEventListener('change', render);
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      frame();
      measure();
      cleanup = () => {
        ro.disconnect();
        controls.dispose();
        group.traverse(o => {
          const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
          m.geometry?.dispose();
          m.material?.dispose();
        });
        renderer.dispose();
        canvas.remove();
      };
    })().catch(e => { if (!disposed) setStatus({ state: 'erreur', message: `Vue 3D impossible : ${e instanceof Error ? e.message : String(e)}` }); });
    return () => { disposed = true; cleanup(); };
  }, [model, pending]);

  return (
    <div role="dialog" aria-label="Vue 3D" data-solides={model.meshes.length} data-trame-p95={status.state === 'pret' && status.p95 !== null ? status.p95.toFixed(2) : undefined}
      className="fixed inset-0 z-50 flex flex-col bg-[#0b1120] font-mono text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm text-foreground">Vue 3D</h2>
        <span data-testid="vue3d-contenu">{model.meshes.length ? counts.join(', ') : (pending ? 'Maillage des solides par le noyau 3D…' : 'Aucun solide : dessinez des murs, dalles, poteaux, poutres, toitures ou des solides.')}</span>
        <span className="ml-auto" data-testid="vue3d-trame">
          {status.state === 'chargement' ? 'Chargement…' : status.state === 'pret' ? `Temps de trame (p95, 60 trames) : ${status.p95 === null ? 'non mesuré' : `${status.p95.toFixed(1).replace('.', ',')} ms`}` : ''}
        </span>
        <button type="button" onClick={() => frameRef.current()} className="rounded-sm border border-border px-2 py-0.5 text-foreground hover:bg-white/5">Cadrer la maquette</button>
        <button type="button" onClick={() => measureRef.current()} className="rounded-sm border border-border px-2 py-0.5 text-foreground hover:bg-white/5">Mesurer</button>
        <button type="button" onClick={onClose} aria-label="Fermer la vue 3D" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      {status.state === 'erreur' && <p role="alert" className="px-3 py-2 text-red-300">{status.message}</p>}
      {model.skipped.length > 0 && (
        <ul data-testid="vue3d-ecartes" className="border-b border-border px-3 py-1 text-amber-300">
          {model.skipped.map(s => {
            const o = objects.find(x => x.id === s.id);
            return <li key={s.id}>{o?.name ?? s.id} non montré : {s.reason}.</li>;
          })}
        </ul>
      )}
      <div ref={host} className="relative min-h-0 flex-1" />
    </div>
  );
}
