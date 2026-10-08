// Service worker (lot 7.2) exécuté avec un cache et un réseau simulés : mise en cache de toute la
// coquille dès l'installation, page en erreur jamais mise en cache, copie servie hors ligne.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Handler = (event: { request?: Request; waitUntil: (p: Promise<unknown>) => void; respondWith: (p: Promise<Response | undefined>) => void }) => void;

function load(network: (url: string) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Response>();
  const key = (r: string | Request) => new URL(typeof r === 'string' ? r : r.url, 'http://app.test').pathname;
  const cache = {
    put: async (r: string | Request, res: Response) => { store.set(key(r), res); },
    addAll: async (urls: string[]) => { for (const u of urls) { const res = await network(u); if (!res.ok) throw new Error(u); store.set(key(u), res); } },
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['drawall-v2'],
    delete: async () => true,
    match: async (r: string | Request) => store.get(key(r))?.clone(),
  };
  const self = {
    location: { origin: 'http://app.test' },
    addEventListener: (type: string, h: Handler) => { handlers[type] = h; },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const code = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
  new Function('self', 'caches', 'fetch', code)(self, caches, (u: string | Request) => network(typeof u === 'string' ? u : new URL(u.url).pathname));
  const run = async (type: string, request?: Request) => {
    let waited: Promise<unknown> | undefined, responded: Promise<Response | undefined> | undefined;
    handlers[type]({ request, waitUntil: p => { waited = p; }, respondWith: p => { responded = p; } });
    await waited;
    return responded ? await responded : undefined;
  };
  return { run, store };
}

const html = '<html><script type="module" src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-def.css"></html>';
const ok = (body: string, type: string) => new Response(body, { status: 200, headers: { 'content-type': type } });
const navigate = (path = '/') => ({ url: `http://app.test${path}`, method: 'GET', mode: 'navigate' }) as unknown as Request;

describe('service worker (lot 7.2)', () => {
  it('l’installation met en cache la page et les fichiers qu’elle charge', async () => {
    const sw = load(async u => (u === '/' ? ok(html, 'text/html') : ok('x', 'text/javascript')));
    await sw.run('install');
    expect([...sw.store.keys()].sort()).toEqual(['/', '/assets/index-abc.js', '/assets/index-def.css']);
  });

  it('une page en erreur n’écrase pas la copie ; sans réseau, la copie est servie', async () => {
    let mode: 'ok' | 'erreur' | 'hors-ligne' = 'ok';
    const sw = load(async u => {
      if (mode === 'hors-ligne') throw new TypeError('réseau');
      if (u === '/' && mode === 'erreur') return new Response('erreur serveur', { status: 500, headers: { 'content-type': 'text/html' } });
      return u === '/' ? ok(html, 'text/html') : ok('x', 'text/javascript');
    });
    await sw.run('install');
    mode = 'erreur';
    const err = await sw.run('fetch', navigate());
    expect(err!.status).toBe(500);
    await new Promise(r => setTimeout(r, 0));
    expect(await sw.store.get('/')!.clone().text()).toBe(html);
    mode = 'hors-ligne';
    const offline = await sw.run('fetch', navigate());
    expect(await offline!.text()).toBe(html);
  });
});
