import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import {
  createProject,
  deleteProject,
  findProjectById,
  findProjectsByUser,
  renameProject,
  saveProjectData,
} from "./queries/projects";

const projectDataSchema = z.record(z.string(), z.unknown());

const projectInput = {
  name: z.string().trim().min(1, "Le nom du projet est requis").max(255),
  description: z.string().trim().max(2000).optional(),
};

export const projectsRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findProjectsByUser(ctx.user.id)),

  get: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const project = await findProjectById(input.id, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return project;
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
        id: z.number().int().positive(),
        data: projectDataSchema,
        expectedRevision: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await saveProjectData({
        id: input.id,
        ownerId: ctx.user.id,
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
        id: z.number().int().positive(),
        ...projectInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await renameProject({
        id: input.id,
        ownerId: ctx.user.id,
        name: input.name,
        description: input.description,
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return project;
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteProject(input.id, ctx.user.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projet introuvable" });
      }
      return { ok: true };
    }),
});
