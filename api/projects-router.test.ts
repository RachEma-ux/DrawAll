// Partage et commentaires (lot 8.4) : deux comptes, droits lecture / écriture, commentaires.
// La base est simulée en mémoire (pas de MySQL dans la recette) ; le routeur et les droits sont réels.
// Le double reproduit le contrat des requêtes (jeton d'invitation à usage unique compris).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@db/schema';
import { can, roleOf } from './lib/access';

type Row = { id: number; ownerId: number; name: string; description: string | null; data: unknown; revision: number; createdAt: Date; updatedAt: Date };
const db = vi.hoisted(() => ({
  projects: [] as Row[],
  members: [] as { projectId: number; userId: number; role: 'lecture' | 'ecriture' }[],
  invites: [] as { token: string; projectId: number; role: 'lecture' | 'ecriture'; expiresAt: Date }[],
  comments: [] as { id: number; projectId: number; authorId: number; objectId: string; text: string; resolved: boolean; createdAt: Date }[],
  seq: 0,
}));

vi.mock('./queries/projects', () => ({
  createProject: async (d: { ownerId: number; name: string; description: string | null; data: unknown }) => {
    const row = { ...d, id: ++db.seq, revision: 1, createdAt: new Date(), updatedAt: new Date() };
    db.projects.push(row);
    return row;
  },
  saveProjectData: async (i: { id: number; data: unknown; expectedRevision: number }) => {
    const p = db.projects.find(r => r.id === i.id);
    if (!p) return { status: 'not_found' };
    if (p.revision !== i.expectedRevision) return { status: 'conflict', project: p };
    Object.assign(p, { data: i.data, revision: p.revision + 1 });
    return { status: 'saved', project: p };
  },
  renameProject: async (i: { id: number; ownerId: number; name: string }) => {
    const p = db.projects.find(r => r.id === i.id && r.ownerId === i.ownerId);
    if (p) p.name = i.name;
    return p;
  },
  deleteProject: async (id: number, ownerId: number) => {
    const n = db.projects.length;
    db.projects = db.projects.filter(r => !(r.id === id && r.ownerId === ownerId));
    return db.projects.length < n;
  },
}));

vi.mock('./queries/sharing', () => {
  const access = (id: number, userId: number) => {
    const project = db.projects.find(p => p.id === id);
    if (!project) return undefined;
    const role = roleOf(project.ownerId, userId, db.members.find(m => m.projectId === id && m.userId === userId)?.role);
    return role ? { project, role } : undefined;
  };
  return {
    findProjectAccess: async (id: number, userId: number) => access(id, userId),
    findProjectsForUser: async (userId: number) => db.projects.map(p => access(p.id, userId)).filter(Boolean).map(a => ({ ...a!.project, role: a!.role })),
    createInvite: async (projectId: number, role: 'lecture' | 'ecriture') => {
      const invite = { token: `jeton-${++db.seq}-0123456789abcdef`, projectId, role, expiresAt: new Date(Date.now() + 1000) };
      db.invites.push(invite);
      return { token: invite.token, expiresAt: invite.expiresAt };
    },
    acceptInvite: async (token: string, userId: number) => {
      const inv = db.invites.find(i => i.token === token && i.expiresAt > new Date());
      if (!inv) return undefined;
      db.invites = db.invites.filter(i => i !== inv);
      const existing = access(inv.projectId, userId);
      if (existing?.role === 'proprietaire') return { projectId: inv.projectId, role: 'proprietaire' };
      const m = db.members.find(x => x.projectId === inv.projectId && x.userId === userId);
      if (!m) db.members.push({ projectId: inv.projectId, userId, role: inv.role });
      else if (inv.role === 'ecriture') m.role = 'ecriture';
      return { projectId: inv.projectId, role: access(inv.projectId, userId)!.role };
    },
    listMembers: async (projectId: number) => db.members.filter(m => m.projectId === projectId),
    setMemberRole: async (projectId: number, userId: number, role: 'lecture' | 'ecriture') => {
      const m = db.members.find(x => x.projectId === projectId && x.userId === userId);
      if (m) m.role = role;
    },
    removeMember: async (projectId: number, userId: number) => {
      db.members = db.members.filter(x => !(x.projectId === projectId && x.userId === userId));
    },
    listComments: async (projectId: number) => db.comments.filter(c => c.projectId === projectId),
    addComment: async (projectId: number, authorId: number, objectId: string, text: string) => {
      const id = ++db.seq;
      db.comments.push({ id, projectId, authorId, objectId, text, resolved: false, createdAt: new Date() });
      return { id };
    },
    findComment: async (id: number) => db.comments.find(c => c.id === id),
    setCommentResolved: async (id: number, resolved: boolean) => {
      const c = db.comments.find(x => x.id === id);
      if (c) c.resolved = resolved;
    },
  };
});

const { appRouter } = await import('./router');
const user = (id: number, name: string) => ({ id, name, role: 'user' }) as unknown as User;
const caller = (u?: User) => appRouter.createCaller({ req: new Request('http://test'), resHeaders: new Headers(), user: u });
const alice = caller(user(1, 'Alice'));
const bruno = caller(user(2, 'Bruno'));
const chloe = caller(user(3, 'Chloé'));

beforeEach(() => {
  db.projects = []; db.members = []; db.invites = []; db.comments = []; db.seq = 0;
});

const code = (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code);

describe('droits (lot 8.4)', () => {
  it('table des droits', () => {
    expect(can('lecture', 'lire')).toBe(true);
    expect(can('lecture', 'commenter')).toBe(true);
    expect(can('lecture', 'enregistrer')).toBe(false);
    expect(can('ecriture', 'enregistrer')).toBe(true);
    expect(can('ecriture', 'partager')).toBe(false);
    expect(can('proprietaire', 'supprimer')).toBe(true);
    expect(can(null, 'lire')).toBe(false);
  });
});

describe('deux comptes (lot 8.4)', () => {
  it('un projet non partagé est introuvable pour un autre compte', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: { v: 1 } });
    expect(await code(bruno.projects.get({ id: p.id }))).toBe('NOT_FOUND');
    expect(await code(bruno.projects.save({ id: p.id, data: { v: 2 }, expectedRevision: 1 }))).toBe('NOT_FOUND');
    expect(await code(bruno.projects.comment({ id: p.id, objectId: 'OBJ-1', text: 'x' }))).toBe('NOT_FOUND');
    expect(await bruno.projects.list()).toEqual([]);
    expect(await code(caller().projects.list())).toBe('UNAUTHORIZED');
  });

  it('lien en lecture : le membre ouvre et commente, mais n’enregistre pas, ne partage pas, ne supprime pas', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: { v: 1 } });
    const { token } = await alice.projects.share({ id: p.id, role: 'lecture' });
    expect(await bruno.projects.join({ token })).toEqual({ projectId: p.id, role: 'lecture' });
    expect((await bruno.projects.list()).map(x => [x.name, x.role])).toEqual([['Maison', 'lecture']]);
    expect(await bruno.projects.get({ id: p.id })).toMatchObject({ data: { v: 1 }, role: 'lecture' });
    expect(await code(bruno.projects.save({ id: p.id, data: { v: 2 }, expectedRevision: 1 }))).toBe('FORBIDDEN');
    expect(await code(bruno.projects.share({ id: p.id, role: 'ecriture' }))).toBe('FORBIDDEN');
    expect(await code(bruno.projects.rename({ id: p.id, name: 'Autre' }))).toBe('FORBIDDEN');
    expect(await code(bruno.projects.remove({ id: p.id }))).toBe('FORBIDDEN');
    expect(await code(bruno.projects.comment({ id: p.id, objectId: 'OBJ-3', text: 'Cote à vérifier' }))).toBe('OK');
    expect((await alice.projects.comments({ id: p.id })).map(c => [c.objectId, c.text, c.authorId])).toEqual([['OBJ-3', 'Cote à vérifier', 2]]);
    expect(db.projects[0].data).toEqual({ v: 1 });
  });

  it('lien en écriture : le membre enregistre ; le propriétaire voit la révision suivante', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: { v: 1 } });
    const { token } = await alice.projects.share({ id: p.id, role: 'ecriture' });
    await bruno.projects.join({ token });
    expect(await bruno.projects.save({ id: p.id, data: { v: 2 }, expectedRevision: 1 })).toMatchObject({ status: 'saved' });
    expect(await alice.projects.get({ id: p.id })).toMatchObject({ data: { v: 2 }, revision: 2, role: 'proprietaire' });
    // Enregistrement concurrent : le second reçoit un conflit, pas d'écrasement.
    expect(await alice.projects.save({ id: p.id, data: { v: 3 }, expectedRevision: 1 })).toMatchObject({ status: 'conflict' });
    expect(await code(bruno.projects.remove({ id: p.id }))).toBe('FORBIDDEN');
  });

  it('résolution : l’auteur ou un droit d’écriture ; un lecteur ne résout pas le commentaire d’un autre', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: {} });
    await bruno.projects.join({ token: (await alice.projects.share({ id: p.id, role: 'lecture' })).token });
    await chloe.projects.join({ token: (await alice.projects.share({ id: p.id, role: 'lecture' })).token });
    const { id } = await alice.projects.comment({ id: p.id, objectId: 'OBJ-1', text: 'Mur porteur ?' });
    expect(await code(bruno.projects.resolveComment({ commentId: id, resolved: true }))).toBe('FORBIDDEN');
    const own = await bruno.projects.comment({ id: p.id, objectId: 'OBJ-2', text: 'Fenêtre' });
    expect(await code(bruno.projects.resolveComment({ commentId: own.id, resolved: true }))).toBe('OK');
    expect(await code(alice.projects.resolveComment({ commentId: id, resolved: true }))).toBe('OK');
    expect(db.comments.map(c => c.resolved)).toEqual([true, true]);
    expect(await code(chloe.projects.resolveComment({ commentId: own.id, resolved: false }))).toBe('FORBIDDEN');
  });

  it('membres : le propriétaire relève ou retire un droit ; un membre peut se retirer ; un jeton inconnu est refusé', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: {} });
    await bruno.projects.join({ token: (await alice.projects.share({ id: p.id, role: 'lecture' })).token });
    await chloe.projects.join({ token: (await alice.projects.share({ id: p.id, role: 'lecture' })).token });
    await alice.projects.setMemberRole({ id: p.id, userId: 2, role: 'ecriture' });
    expect(await bruno.projects.save({ id: p.id, data: { v: 2 }, expectedRevision: 1 })).toMatchObject({ status: 'saved' });
    expect(await code(bruno.projects.removeMember({ id: p.id, userId: 3 }))).toBe('FORBIDDEN');
    await chloe.projects.removeMember({ id: p.id, userId: 3 });
    expect(await code(chloe.projects.get({ id: p.id }))).toBe('NOT_FOUND');
    await alice.projects.removeMember({ id: p.id, userId: 2 });
    expect(await code(bruno.projects.get({ id: p.id }))).toBe('NOT_FOUND');
    expect(await code(bruno.projects.join({ token: 'jeton-inconnu-0123456789' }))).toBe('NOT_FOUND');
  });

  it('un lien est à usage unique : un membre retiré ne revient pas avec, un tiers non plus', async () => {
    const p = await alice.projects.create({ name: 'Maison', data: {} });
    const { token } = await alice.projects.share({ id: p.id, role: 'ecriture' });
    await bruno.projects.join({ token });
    await alice.projects.removeMember({ id: p.id, userId: 2 });
    expect(await code(bruno.projects.join({ token }))).toBe('NOT_FOUND');
    expect(await code(chloe.projects.join({ token }))).toBe('NOT_FOUND');
    expect(await code(bruno.projects.get({ id: p.id }))).toBe('NOT_FOUND');
  });
});
