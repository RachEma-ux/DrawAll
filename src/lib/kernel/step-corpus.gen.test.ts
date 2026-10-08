// Génération du corpus STEP de l'essai P0 (lot 11.4) par l'écrivain STEP d'OCCT (XCAF).
// Ne tourne qu'à la demande : P0_STEP_CORPUS=1 npx vitest run src/lib/kernel/step-corpus.gen.test.ts
// Les fichiers sont versionnés dans src/lib/__fixtures__/step/ ; les variantes « tronqué » et
// « entité manquante » sont dérivées de l'assemblage par une coupe et une suppression de ligne.
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { getOC, makeBaseBox, makeCylinder, type Shape3D } from 'replicad';
import { loadKernel } from './occt';

const DIR = 'src/lib/__fixtures__/step';

it.skipIf(!process.env.P0_STEP_CORPUS)('génère le corpus STEP', async () => {
  await loadKernel();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- liaisons OCCT non typées pour XCAF
  const oc = getOC() as any;
  const str = (s: string) => new oc.TCollection_ExtendedString(s, true);
  const loc = (x: number, y: number, z: number) => { const t = new oc.gp_Trsf(); t.SetTranslation(new oc.gp_Vec(x, y, z)); return new oc.TopLoc_Location(t); };

  function write(file: string, build: (tool: any, color: any) => void, { unit = 'MM', schema = 4 } = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const doc = new oc.TDocStd_Document(str('XmlOcaf'));
    oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
    const tool = oc.XCAFDoc_DocumentTool.ShapeTool(doc.Main());
    const color = oc.XCAFDoc_DocumentTool.ColorTool(doc.Main());
    build(tool, color);
    tool.UpdateAssemblies();
    // Paramètres posés après la création de l'écrivain (qui initialise ses valeurs par défaut).
    const writer = new oc.STEPCAFControl_Writer(new oc.XSControl_WorkSession(), false);
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    oc.Interface_Static.SetCVal('write.step.unit', unit);
    oc.Interface_Static.SetIVal('write.step.schema', schema);
    oc.Interface_Static.SetIVal('write.step.assembly', 1);
    writer.SetNameMode(true);
    writer.SetColorMode(true);
    if (!writer.Perform(doc, 'out.step', new oc.Message_ProgressRange())) throw new Error(`écriture ${file}`);
    writeFileSync(`${DIR}/${file}`, oc.FS.readFile('/out.step'));
    oc.FS.unlink('/out.step');
  }
  const part = (tool: any, shape: Shape3D, name: string) => { const l = tool.AddShape(shape.wrapped, false, true); oc.TDataStd_Name.Set(l, str(name)); return l; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const red = () => new oc.Quantity_ColorRGBA(1, 0, 0, 1);

  // Pièce seule : pavé 100 × 50 × 20 mm (coin minimal à l'origine), schémas AP203, AP214 et AP242.
  for (const [file, schema] of [['piece-ap203.step', 3], ['piece-ap214.step', 4], ['piece-ap242.step', 5]] as const) {
    write(file, tool => part(tool, makeBaseBox(100, 50, 20).translate([50, 25, 0]), 'socle'), { schema });
  }
  // Assemblage : socle (rouge) + deux occurrences d'un même axe Ø 10 × 30 posées dessus.
  const assembly = (tool: any, color: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const asm = tool.NewShape(); oc.TDataStd_Name.Set(asm, str('ensemble'));
    const socle = part(tool, makeBaseBox(100, 50, 20).translate([50, 25, 0]), 'socle');
    color.SetColor(socle, red(), oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
    const axe = part(tool, makeCylinder(5, 30), 'axe');
    tool.AddComponent(asm, socle, loc(0, 0, 0));
    tool.AddComponent(asm, axe, loc(20, 25, 20));
    tool.AddComponent(asm, axe, loc(80, 25, 20));
  };
  write('assemblage-mm.step', assembly);
  write('assemblage-pouce.step', assembly, { unit: 'INCH' });

  const asm = readFileSync(`${DIR}/assemblage-mm.step`, 'utf8');
  writeFileSync(`${DIR}/tronque.step`, asm.slice(0, Math.floor(asm.length / 2)));
  const lines = asm.split('\n');
  const breps = lines.flatMap((l, i) => (l.includes('MANIFOLD_SOLID_BREP') ? [i] : []));
  lines.splice(breps[breps.length - 1], 1); // corps solide de l'axe supprimé
  writeFileSync(`${DIR}/entite-manquante.step`, lines.join('\n'));
});
