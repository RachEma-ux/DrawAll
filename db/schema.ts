import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  json,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projets DrawAll — un projet par ligne, propriétaire identifié.
 * `data` contient l'état complet du projet (objets, calques, blocs,
 * microversions, versions nommées) sérialisé en JSON.
 * `revision` sert à la détection de conflit : le client envoie la révision
 * sur laquelle il se base ; si elle diffère de la révision courante,
 * l'écriture est refusée (comportement transactionnel du dossier, §6).
 */
export const projects = mysqlTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    ownerId: bigint("ownerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    data: json("data").notNull(),
    revision: int("revision").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId)],
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Partage (lot 8.4) : membres d'un projet autres que son propriétaire, avec leur droit
 * (« lecture » : ouvrir et commenter ; « ecriture » : aussi enregistrer).
 */
export const projectMembers = mysqlTable(
  "project_members",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["lecture", "ecriture"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_members_unique").on(t.projectId, t.userId), index("project_members_user_idx").on(t.userId)],
);

export type ProjectMember = typeof projectMembers.$inferSelect;

/** Invitation par lien (lot 8.4) : jeton secret, droit accordé, date d'expiration. */
export const projectInvites = mysqlTable(
  "project_invites",
  {
    token: varchar("token", { length: 64 }).primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["lecture", "ecriture"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (t) => [index("project_invites_project_idx").on(t.projectId)],
);

export type ProjectInvite = typeof projectInvites.$inferSelect;

/** Commentaire (lot 8.4) ancré sur un objet du projet (identifiant OBJ-…), résolu ou non. */
export const projectComments = mysqlTable(
  "project_comments",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: bigint("authorId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectId: varchar("objectId", { length: 64 }).notNull(),
    text: text("text").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("project_comments_project_idx").on(t.projectId)],
);

export type ProjectComment = typeof projectComments.$inferSelect;

// TODO: Add your tables here. See docs/Database.md for schema examples and patterns.
//
// Example:
// export const posts = mysqlTable("posts", {
//   id: serial("id").primaryKey(),
//   title: varchar("title", { length: 255 }).notNull(),
//   content: text("content"),
//   createdAt: timestamp("created_at").notNull().defaultNow(),
// });
//
// Note: FK columns referencing a serial() PK must use:
//   bigint("columnName", { mode: "number", unsigned: true }).notNull()
