function securityHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    ...extra,
  };
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders(extraHeaders),
  });
}

export function normalizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function readBearerToken(req) {
  const auth = String(req?.headers?.get("authorization") || "").trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readUserFromTokenPayload(req) {
  const token = readBearerToken(req);
  if (!token) return null;

  const payload = parseJwtPayload(token);
  if (!payload || typeof payload !== "object") return null;

  const exp = Number(payload.exp || 0);
  if (exp && exp * 1000 <= Date.now()) return null;

  const email = normalizeEmail(
    payload.email ||
    payload?.user_metadata?.email ||
    payload?.app_metadata?.email ||
    ""
  );

  if (!email) return null;

  return {
    ...payload,
    email,
    app_metadata: payload.app_metadata || {},
    user_metadata: payload.user_metadata || {},
  };
}

function parseNetlifyCustomContext(context) {
  try {
    const raw = context?.clientContext?.custom?.netlify;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    const decoded = Buffer.from(String(raw), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function splitRoles(value) {
  return []
    .concat(value || [])
    .flatMap((item) => (Array.isArray(item) ? item : String(item || "").split(/[;,|]/)))
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

export function getUserRoles(user) {
  if (!user) return [];
  return Array.from(
    new Set([
      ...splitRoles(user?.app_metadata?.roles),
      ...splitRoles(user?.app_metadata?.authorization?.roles),
      ...splitRoles(user?.roles),
      ...splitRoles(user?.role),
      ...splitRoles(user?.user_metadata?.roles),
      ...splitRoles(user?.user_metadata?.role),
    ])
  );
}

export function readCurrentUser(req, context) {
  const directUser = context?.clientContext?.user;
  if (directUser?.email) return directUser;

  const netlifyContext = parseNetlifyCustomContext(context);
  if (netlifyContext?.user?.email) return netlifyContext.user;
  if (netlifyContext?.identity?.email) return netlifyContext.identity;

  const tokenUser = readUserFromTokenPayload(req);
  if (tokenUser?.email) return tokenUser;

  return null;
}

function getAllowedOrigins(req) {
  const configured = String(
    process.env.URL || process.env.DEPLOY_URL || process.env.SITE_URL || ""
  ).trim();

  const values = []
    .concat(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : [])
    .concat(configured ? [configured] : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const requestHost = req.headers.get("host");
  if (requestHost) {
    values.push(`https://${requestHost}`);
    values.push(`http://${requestHost}`);
  }

  return Array.from(new Set(values));
}

function originAllowed(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const allowed = getAllowedOrigins(req);
  return allowed.length ? allowed.includes(origin) : true;
}

function methodAllowed(req, config) {
  return !Array.isArray(config?.methods) || config.methods.includes(req.method);
}

function contentLengthWithinLimit(req, config) {
  const maxBytes = Number(config?.maxBodyBytes || 1024 * 1024);
  const raw = req.headers.get("content-length");
  if (!raw) return true;
  const size = Number(raw);
  if (!Number.isFinite(size)) return true;
  return size <= maxBytes;
}

export function withSecurity(config, handler) {
  return async (req, context) => {
    try {
      if (!methodAllowed(req, config)) {
        return jsonResponse({ error: "method not allowed" }, 405);
      }

      if (!originAllowed(req)) {
        return jsonResponse({ error: "forbidden origin" }, 403);
      }

      if (!contentLengthWithinLimit(req, config)) {
        return jsonResponse({ error: "payload too large" }, 413);
      }

      const user = readCurrentUser(req, context);
      const roles = getUserRoles(user);
      const ownerEmails = Array.from(
        new Set(
          []
            .concat(process.env.OWNER_EMAILS ? process.env.OWNER_EMAILS.split(",") : [])
            .concat(["claudiosantos1968@gmail.com"])
            .map((v) => normalizeEmail(v))
            .filter(Boolean)
        )
      );

      const isOwner = !!user && ownerEmails.includes(normalizeEmail(user?.email));
      const isAdmin = !!(
        isOwner ||
        roles.includes("admin") ||
        roles.includes("owner") ||
        roles.includes("platform_support") ||
        roles.includes("area_coordinator") ||
        roles.includes("aux_coordinator") ||
        roles.includes("assistant_area_coordinator")
      );

      const ctx = {
        user,
        roles,
        role: roles[0] || (isOwner ? "owner" : isAdmin ? "admin" : ""),
        isOwner,
        isAdmin,
      };

      return await handler(ctx, req, context);
    } catch (error) {
      return jsonResponse({ error: error?.message || "server error" }, 500);
    }
  };
}
