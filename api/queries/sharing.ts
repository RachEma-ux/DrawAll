// Partage et commentaires (lot 8.4) : accès d'un utilisateur à un projet, invitations par lien,
// membres, commentaires ancrés sur un objet.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { projectComments, projectInvites, projectMembers, projects, users, type Project } from "@db/schema";
import { getDb } from "./connection";
import { INVITE_TTL_MS, roleOf, type ProjectRole } from "../lib/access";

export type SharedProjectSummary = Pick<Project, "id" | "name" | "description" | "revision" | "createdAt" | "updatedAt"> & { role: ProjectRole };

/** Projets du compte : les siens et ceux qui lui sont partagés, avec son droit. */
export async function findProjectsForUser(userId: number): Promise<SharedProjectSummary[]> {
  const db = getDb();
  const cols = { id: projects.id, name: projects.name, description: projects.description, revision: projects.revision, createdAt: projects.createdAt, updatedAt: projects.updatedAt };
  const owned = await db.select(cols).from(projects).where(eq(projects.ownerId, userId));
  const shared = await db.select({ ...cols, role: projectMembers.role }).from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(eq(projectMembers.userId, userId));
  return [...owned.map(p => ({ ...p, role: "proprietaire" as const })), ...shared]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

/** Projet et droit de l'utilisateur, ou undefined s'il n'y a pas accès. */
export async function findProjectAccess(id: number, userId: number): Promise<{ project: Project; role: ProjectRole } | undefined> {
  const db = getDb();
  const project = (await db.select().from(projects).where(eq(projects.id, id)).limit(1)).at(0);
  if (!project) return undefined;
  const member = (await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId))).limit(1)).at(0);
  const role = roleOf(project.ownerId, userId, member?.role);
  return role ? { project, role } : undefined;
}

/** Lien d'invitation : jeton secret (192 bits), à usage unique, valable sept jours. */
export async function createInvite(projectId: number, role: "lecture" | "ecriture", now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await getDb().insert(projectInvites).values({ token, projectId, role, expiresAt });
  return { token, expiresAt };
}

/**
 * Accepter une invitation : l'utilisateur devient membre (ou voit son droit relevé à l'écriture) ;
 * le propriétaire n'est pas ajouté. Le jeton est à usage unique : consommé à l'acceptation, il ne
 * peut pas rendre l'accès à un membre retiré. Jeton inconnu, déjà utilisé ou expiré : undefined.
 */
export async function acceptInvite(token: string, userId: number, now = new Date()): Promise<{ projectId: number; role: ProjectRole } | undefined> {
  return getDb().transaction(async (tx) => {
    const invite = (await tx.select().from(projectInvites).where(and(eq(projectInvites.token, token), gt(projectInvites.expiresAt, now))).limit(1).for("update")).at(0);
    if (!invite) return undefined;
    await tx.delete(projectInvites).where(eq(projectInvites.token, token));
    const project = (await tx.select().from(projects).where(eq(projects.id, invite.projectId)).limit(1)).at(0);
    if (!project) return undefined;
    if (project.ownerId === userId) return { projectId: project.id, role: "proprietaire" as const };
    const member = (await tx.select().from(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId))).limit(1)).at(0);
    if (!member) await tx.insert(projectMembers).values({ projectId: project.id, userId, role: invite.role });
    else if (member.role === "lecture" && invite.role === "ecriture") await tx.update(projectMembers).set({ role: "ecriture" }).where(eq(projectMembers.id, member.id));
    return { projectId: project.id, role: member?.role === "ecriture" ? "ecriture" as const : invite.role };
  });
}

export async function listMembers(projectId: number) {
  return getDb().select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name }).from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId)).orderBy(asc(users.name));
}

export async function setMemberRole(projectId: number, userId: number, role: "lecture" | "ecriture") {
  await getDb().update(projectMembers).set({ role }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function removeMember(projectId: number, userId: number) {
  await getDb().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function listComments(projectId: number) {
  return getDb().select({
    id: projectComments.id, objectId: projectComments.objectId, text: projectComments.text, resolved: projectComments.resolved,
    createdAt: projectComments.createdAt, authorId: projectComments.authorId, authorName: users.name,
  }).from(projectComments).innerJoin(users, eq(users.id, projectComments.authorId))
    .where(eq(projectComments.projectId, projectId)).orderBy(desc(projectComments.createdAt));
}

export async function addComment(projectId: number, authorId: number, objectId: string, text: string) {
  const [{ id }] = await getDb().insert(projectComments).values({ projectId, authorId, objectId, text }).$returningId();
  return { id };
}

export async function findComment(id: number) {
  return (await getDb().select().from(projectComments).where(eq(projectComments.id, id)).limit(1)).at(0);
}

export async function setCommentResolved(id: number, resolved: boolean) {
  await getDb().update(projectComments).set({ resolved }).where(eq(projectComments.id, id));
}

