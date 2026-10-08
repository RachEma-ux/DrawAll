// Sécurité de la connexion (lot 8.3) : `state` OAuth aléatoire, gardé dans un cookie court et
// vérifié au retour ; adresse de retour calculée par le serveur (jamais lue dans `state`).
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "hono/utils/cookie";
import { Paths } from "@contracts/constants";

/** Cookie du `state` en attente : limité au chemin OAuth, dix minutes. */
export const STATE_COOKIE = "drawall_oauth_state";
export const STATE_MAX_AGE_S = 10 * 60;

/** `state` imprévisible (256 bits, base64url). */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/** Comparaison en temps constant ; faux si l'un manque. */
export function statesMatch(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected), b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isLocalhost(host: string): boolean {
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "localhost" || host === "127.0.0.1";
}

/** Adresse de retour OAuth, d'après la requête (en-têtes du mandataire compris). */
export function callbackUrl(requestUrl: string, headers: Headers): string {
  const url = new URL(requestUrl);
  const host = headers.get("x-forwarded-host") || headers.get("host") || url.host;
  const proto = headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}${Paths.oauthCallback}`;
}

/** Options du cookie de `state` : httpOnly, chemin OAuth, Lax (retour par redirection), sécurisé hors localhost. */
export function stateCookieOptions(headers: Headers): CookieOptions {
  const local = isLocalhost(headers.get("host") || "");
  return { httpOnly: true, path: "/api/oauth", sameSite: "Lax", secure: !local, maxAge: STATE_MAX_AGE_S };
}
