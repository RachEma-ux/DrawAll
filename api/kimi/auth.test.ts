// Gestionnaire de rappel OAuth (lot 8.3) : `state` aléatoire émis et vérifié, adresse de retour
// calculée par le serveur, session de sept jours.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

process.env.KIMI_AUTH_URL = 'https://auth.test';
process.env.KIMI_OPEN_URL = 'https://open.test';
process.env.APP_ID = 'app-1';
process.env.APP_SECRET = 'secret-de-test-assez-long-pour-hs256';

let app: Hono;
let session: typeof import('./session');
let constants: typeof import('@contracts/constants');

beforeAll(async () => {
  const auth = await import('./auth');
  session = await import('./session');
  constants = await import('@contracts/constants');
  app = new Hono();
  app.get('/api/oauth/login', auth.createOAuthLoginHandler());
  app.get('/api/oauth/callback', auth.createOAuthCallbackHandler());
});
afterEach(() => vi.unstubAllGlobals());

const host = { host: 'drawall.example' };
const stateCookie = (res: Response) => /drawall_oauth_state=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];

describe('connexion OAuth (lot 8.3)', () => {
  it('le départ émet un state aléatoire, gardé dans un cookie court httpOnly, et l’adresse de retour du serveur', async () => {
    const a = await app.request('/api/oauth/login', { headers: host });
    const b = await app.request('/api/oauth/login', { headers: host });
    expect(a.status).toBe(302);
    const url = new URL(a.headers.get('location')!);
    expect(url.origin + url.pathname).toBe('https://auth.test/api/oauth/authorize');
    const state = url.searchParams.get('state')!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stateCookie(a)).toBe(state);
    expect(new URL(b.headers.get('location')!).searchParams.get('state')).not.toBe(state);
    expect(url.searchParams.get('redirect_uri')).toBe('http://drawall.example/api/oauth/callback');
    const cookie = a.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toMatch(/Path=\/api\/oauth/);
  });

  it('un rappel sans state, sans cookie ou avec un state différent est refusé', async () => {
    expect((await app.request('/api/oauth/callback?code=c', { headers: host })).status).toBe(400);
    const noCookie = await app.request('/api/oauth/callback?code=c&state=abc', { headers: host });
    expect(noCookie.status).toBe(400);
    expect(await noCookie.json()).toMatchObject({ error: 'invalid_state' });
    const wrong = await app.request('/api/oauth/callback?code=c&state=abc', { headers: { ...host, cookie: 'drawall_oauth_state=xyz' } });
    expect(wrong.status).toBe(400);
    // Ancien format (state = adresse de retour en base64) : refusé aussi.
    const legacy = await app.request(`/api/oauth/callback?code=c&state=${btoa('https://evil.test/cb')}`, { headers: host });
    expect(legacy.status).toBe(400);
  });

  it('un state valide est accepté ; l’échange de code utilise l’adresse de retour du serveur ; le cookie est effacé', async () => {
    const fetchMock = vi.fn(async () => new Response('refusé', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await app.request('/api/oauth/callback?code=c0de&state=s1', { headers: { ...host, cookie: 'drawall_oauth_state=s1' } });
    // Au-delà de la vérification du state : l'échange (simulé, refusé) est tenté.
    expect(res.status).toBe(500);
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(new URLSearchParams(body).get('redirect_uri')).toBe('http://drawall.example/api/oauth/callback');
    expect(res.headers.get('set-cookie')).toMatch(/drawall_oauth_state=;.*Max-Age=0/);
  });

  it('session de sept jours (cookie et jeton)', async () => {
    expect(constants.Session.maxAgeMs).toBe(7 * 24 * 3600 * 1000);
    const token = await session.signSessionToken({ unionId: 'u', clientId: 'app-1' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);
  });
});
