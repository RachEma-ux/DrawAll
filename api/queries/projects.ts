import { and, desc, eq, sql } from "drizzle-orm";
import { projects, type InsertProject, type Project } from "@db/schema";
import { getDb } from "./connection";

export type ProjectSummary = Pick<
  Project,
  "id" | "name" | "description" | "revision" | "createdAt" | "updatedAt"
>;

export type SaveProjectResult =
  | { status: "saved"; project: Project }
  | { status: "conflict"; project: Project }
  | { status: "not_found" };

const summaryColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  revision: projects.revision,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

export async function findProjectsByUser(ownerId: number): Promise<ProjectSummary[]> {
  return getDb()
    .select(summaryColumns)
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.updatedAt));
}

export async function findProjectById(
  id: number,
  ownerId: number,
): Promise<Project | undefined> {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .limit(1);
  return rows.at(0);
}

export async function createProject(
  data: Pick<InsertProject, "ownerId" | "name" | "description" | "data">,
): Promise<Project> {
  const [{ id }] = await getDb().insert(projects).values(data).$returningId();
  const created = await findProjectById(id, data.ownerId);
  if (!created) throw new Error("Project creation failed");
  return created;
}

/**
 * Sauvegarde transactionnelle à concurrence optimiste :
 * la mise à jour ne s'applique que si la révision lue par le client est
 * encore la révision courante en base. Sinon, le serveur renvoie l'état
 * actuel pour permettre une résolution explicite côté atelier.
 * Le droit d'enregistrer (propriétaire ou membre en écriture, lot 8.4) est vérifié par le routeur.
 */
export async function saveProjectData(input: {
  id: number;
  data: unknown;
  expectedRevision: number;
}): Promise<SaveProjectResult> {
  return getDb().transaction(async (tx) => {
    const currentRows = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
      .limit(1);
    const current = currentRows.at(0);
    if (!current) return { status: "not_found" };

    if (current.revision !== input.expectedRevision) {
      return { status: "conflict", project: current };
    }

    const nextRevision = current.revision + 1;
    await tx
      .update(projects)
      .set({
        data: input.data,
        revision: nextRevision,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, input.id),
          eq(projects.revision, input.expectedRevision),
        ),
      );

    const afterRows = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
      .limit(1);
    const after = afterRows.at(0);
    if (!after) return { status: "not_found" };
    if (after.revision !== nextRevision) return { status: "conflict", project: after };
    return { status: "saved", project: after };
  });
}

export async function renameProject(input: {
  id: number;
  ownerId: number;
  name: string;
  description?: string;
}): Promise<Project | undefined> {
  await getDb()
    .update(projects)
    .set({
      name: input.name,
      description: input.description ?? null,
      revision: sql`${projects.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, input.id), eq(projects.ownerId, input.ownerId)));
  return findProjectById(input.id, input.ownerId);
}

export async function deleteProject(id: number, ownerId: number): Promise<boolean> {
  const existing = await findProjectById(id, ownerId);
  if (!existing) return false;
  await getDb()
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
  return true;
}
