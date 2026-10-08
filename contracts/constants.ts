export const Session = {
  cookieName: "kimi_sid",
  // Session de sept jours (lot 8.3 ; un an auparavant) : une nouvelle connexion est demandée ensuite.
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
  oauthLogin: "/api/oauth/login",
} as const;
