// DWG (lot 6.3) : en attendant le choix d'un convertisseur (décision du maître d'ouvrage, feuille de
// route §7), un fichier DWG est reconnu à sa signature et refusé avec un message qui indique comment
// l'ouvrir. Aucune lecture partielle, aucune géométrie devinée.

/** Versions DWG d'après la signature des six premiers octets (« AC10xx »). */
export const DWG_VERSIONS: Record<string, string> = {
  AC1009: 'R11/R12', AC1012: 'R13', AC1014: 'R14', AC1015: 'AutoCAD 2000', AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007', AC1024: 'AutoCAD 2010', AC1027: 'AutoCAD 2013', AC1032: 'AutoCAD 2018',
};

/** Signature DWG (« AC10xx ») au début du fichier, ou null. */
export function detectDwg(head: Uint8Array): { code: string; version: string } | null {
  if (head.length < 6) return null;
  const code = String.fromCharCode(...head.slice(0, 6));
  if (!/^AC10\d\d$/.test(code)) return null;
  return { code, version: DWG_VERSIONS[code] ?? `version inconnue (${code})` };
}

/** Message de refus : ce qu'est le fichier, pourquoi il n'est pas lu, comment l'ouvrir. */
export function dwgRefusal(name: string, d: { code: string; version: string }): string {
  return [
    `${name} est un fichier DWG (${d.version}, signature ${d.code}).`,
    'La lecture des DWG attend le choix d\'un convertisseur (bibliothèque et licence : décision du maître d\'ouvrage, feuille de route §7) ; le fichier n\'est pas importé.',
    'Pour l\'ouvrir dès maintenant : enregistrez-le au format DXF depuis le logiciel d\'origine (ou avec un convertisseur DWG → DXF), puis importez le DXF.',
  ].join('\n');
}
