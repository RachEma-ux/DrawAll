import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { can, type ProjectAction } from "./lib/access";
import {
  createProject,
  deleteProject,
  renameProject,
  saveProjectData,
} from "./queries/projects";
import {
  acceptInvite,
  addComment,
  createInvite,
  findComment,
  findProjectAccess,
  findProjectsForUser,
  listComments,
  listMembers,
  removeMember,
  setCommentResolved,
  setMemberRole,
} from "./queries/sharing";

const projectDataSchema = z.record(z.string(), z.unknown());

const projectInput = {
  name: z.string().trim().min(1, "Le nom du projet est requis").max(255),
  description: z.string().trim().max(2000).optional(),
};

const projectId = z.number().int().positive();
const memberRole = z.enum(["lecture", "ecriture"]);

/**
 * Droit d'agir sur un projet (lot 8.4) : un projet auquel l'utilisateur n'a pas accès est
 * « introuvable » (on ne révèle pas son existence) ; un accès insuffisant est « interdit ».
 */
async function requireAccess(userId: number, id: number, action: ProjectAction) {
  const access = await findProjectAccess(id, userId);
  if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
  if (!can(access.role, action)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Droit insuffisant sur ce projet" });
  }
  return access;
}

export const projectsRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findProjectsForUser(ctx.user.id)),

  get: authedQuery
    .input(z.object({ id: projectId }))
    .query(async ({ ctx, input }) => {
      const { project, role } = await requireAccess(ctx.user.id, input.id, "lire");
      return { ...project, role };
    }),

  create: authedQuery
    .input(
      z.object({
        ...projectInput,
        data: projectDataSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      createProject({
        ownerId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        data: input.data,
      }),
    ),

  save: authedQuery
    .input(
      z.object({
        id: projectId,
        data: projectDataSchema,
        expectedRevision: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "enregistrer");
      const result = await saveProjectData({
        id: input.id,
        data: input.data,
        expectedRevision: input.expectedRevision,
      });
      if (result.status === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return result;
    }),

  rename: authedQuery
    .input(
      z.object({
        id: projectId,
        ...projectInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { project: current } = await requireAccess(ctx.user.id, input.id, "renommer");
      const project = await renameProject({
        id: input.id,
        ownerId: current.ownerId,
        name: input.name,
        description: input.description,
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return project;
    }),

  remove: authedQuery
    .input(z.object({ id: projectId }))
    .mutation(async ({ ctx, input }) => {
      const { project } = await requireAccess(ctx.user.id, input.id, "supprimer");
      const deleted = await deleteProject(input.id, project.ownerId);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return { ok: true };
    }),

  // Partage (lot 8.4) : lien d'invitation en lecture ou en écriture, membres, droits.
  share: authedQuery
    .input(z.object({ id: projectId, role: memberRole }))
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "partager");
      return createInvite(input.id, input.role);
    }),

  join: authedQuery
    .input(z.object({ token: z.string().min(16).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const joined = await acceptInvite(input.token, ctx.user.id);
      if (!joined) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation inconnue ou expirée" });
      }
      return joined;
    }),

  members: authedQuery
    .input(z.object({ id: projectId }))
    .query(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "lire");
      return listMembers(input.id);
    }),

  setMemberRole: authedQuery
    .input(z.object({ id: projectId, userId: z.number().int().positive(), role: memberRole }))
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "partager");
      await setMemberRole(input.id, input.userId, input.role);
      return { ok: true };
    }),

  removeMember: authedQuery
    .input(z.object({ id: projectId, userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Le propriétaire retire qui il veut ; un membre peut se retirer lui-même.
      if (input.userId === ctx.user.id) await requireAccess(ctx.user.id, input.id, "lire");
      else await requireAccess(ctx.user.id, input.id, "partager");
      await removeMember(input.id, input.userId);
      return { ok: true };
    }),

  // Commentaires (lot 8.4) ancrés sur un objet du projet.
  comments: authedQuery
    .input(z.object({ id: projectId }))
    .query(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "lire");
      return listComments(input.id);
    }),

  comment: authedQuery
    .input(
      z.object({
        id: projectId,
        objectId: z.string().trim().min(1).max(64),
        text: z.string().trim().min(1, "Le commentaire est vide").max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAccess(ctx.user.id, input.id, "commenter");
      return addComment(input.id, ctx.user.id, input.objectId, input.text);
    }),

  resolveComment: authedQuery
    .input(z.object({ commentId: z.number().int().positive(), resolved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await findComment(input.commentId);
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "Commentaire introuvable" });
      // L'auteur d'un commentaire peut toujours le résoudre ; sinon il faut le droit d'écriture.
      const access = await requireAccess(ctx.user.id, comment.projectId, "lire");
      if (comment.authorId !== ctx.user.id && !can(access.role, "resoudre")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Droit insuffisant sur ce projet" });
      }
      await setCommentResolved(input.commentId, input.resolved);
      return { ok: true };
    }),
});
