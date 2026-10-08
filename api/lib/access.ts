// Droits sur un projet partagé (lot 8.4). Propriétaire : tout ; « ecriture » : ouvrir, enregistrer,
// commenter, résoudre ; « lecture » : ouvrir et commenter. Le partage (invitations, membres), le
// renommage et la suppression restent au propriétaire.
export type ProjectRole = "proprietaire" | "ecriture" | "lecture";
export type ProjectAction = "lire" | "enregistrer" | "commenter" | "resoudre" | "partager" | "renommer" | "supprimer";

const ALLOWED: Record<ProjectRole, ProjectAction[]> = {
  proprietaire: ["lire", "enregistrer", "commenter", "resoudre", "partager", "renommer", "supprimer"],
  ecriture: ["lire", "enregistrer", "commenter", "resoudre"],
  lecture: ["lire", "commenter"],
};

export function can(role: ProjectRole | null | undefined, action: ProjectAction): boolean {
  return !!role && ALLOWED[role].includes(action);
}

/** Droit d'un utilisateur : propriétaire, membre (lecture / écriture) ou aucun. */
export function roleOf(ownerId: number, userId: number, memberRole: "lecture" | "ecriture" | null | undefined): ProjectRole | null {
  if (ownerId === userId) return "proprietaire";
  return memberRole ?? null;
}

/** Durée de validité d'un lien d'invitation (7 jours). */
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
