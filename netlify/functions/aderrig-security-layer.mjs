import crypto from "crypto";
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

function decodeJwtSegment(segment) {
  try {
    const normalized = String(segment || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function timingSafeEqualString(a, b) {
  try {
    const aa = Buffer.from(String(a || ""));
    const bb = Buffer.from(String(b || ""));
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function getJwtVerificationSecrets() {
  return []
    .concat(process.env.NETLIFY_IDENTITY_JWT_SECRET || [])
    .concat(process.env.GOTRUE_JWT_SECRET || [])
    .concat(process.env.JWT_SECRET || [])
    .concat(process.env.IDENTITY_JWT_SECRET || [])
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function verifyJwtSignature(token, header) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return false;

  const alg = String(header?.alg || "").toUpperCase();
  if (!alg || alg === "NONE") return false;

  const secrets = getJwtVerificationSecrets();
  if (!secrets.length) return false;

  const signingInput = parts[0] + "." + parts[1];
  const expected = parts[2];

  for (const secret of secrets) {
    try {
      let digest = "";
      if (alg === "HS256") {
        digest = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
      } else if (alg === "HS384") {
        digest = crypto.createHmac("sha384", secret).update(signingInput).digest("base64url");
      } else if (alg === "HS512") {
        digest = crypto.createHmac("sha512", secret).update(signingInput).digest("base64url");
      } else {
        continue;
      }

      if (timingSafeEqualString(digest, expected)) return true;
    } catch {}
  }

  return false;
}

function parseJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;

    const header = decodeJwtSegment(parts[0]);
    const payload = decodeJwtSegment(parts[1]);
    if (!payload || typeof payload !== "object") return null;

    return {
      header: header && typeof header === "object" ? header : {},
      payload,
      verified: verifyJwtSignature(token, header || {}),
    };
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

  const parsed = parseJwtPayload(token);
  const payload = parsed?.payload;
  if (!payload || typeof payload !== "object") return null;

  const exp = Number(payload.exp || 0);
  const nbf = Number(payload.nbf || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (exp && exp <= nowSeconds) return null;
  if (nbf && nbf > nowSeconds) return null;

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
    __authSource: "bearer_payload",
    __tokenVerified: !!parsed.verified,
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

  // Roles from an unverified bearer payload are not trusted for admin decisions.
  // store.js can still promote a user after checking anw_users server-side.
  const tokenPayloadOnly = user.__authSource === "bearer_payload" && !user.__tokenVerified;
  if (tokenPayloadOnly) return [];

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
  if (directUser?.email) {
    return {
      ...directUser,
      email: normalizeEmail(directUser.email),
      __authSource: "netlify_context",
      __tokenVerified: true,
    };
  }

  const netlifyContext = parseNetlifyCustomContext(context);
  if (netlifyContext?.user?.email) {
    return {
      ...netlifyContext.user,
      email: normalizeEmail(netlifyContext.user.email),
      __authSource: "netlify_custom_context",
      __tokenVerified: true,
    };
  }
  if (netlifyContext?.identity?.email) {
    return {
      ...netlifyContext.identity,
      email: normalizeEmail(netlifyContext.identity.email),
      __authSource: "netlify_custom_identity",
      __tokenVerified: true,
    };
  }

  const tokenUser = readUserFromTokenPayload(req);
  if (tokenUser?.email && tokenUser.__tokenVerified === true) return tokenUser;

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
      const trustedIdentity = !!user && (
        user.__tokenVerified === true ||
        user.__authSource === "netlify_context" ||
        user.__authSource === "netlify_custom_context" ||
        user.__authSource === "netlify_custom_identity"
      );

      const tokenPayloadOnly = !!user && user.__authSource === "bearer_payload" && !user.__tokenVerified;

      // Owner/admin privileges must only be granted from a trusted identity.
      // A decoded-but-unverified bearer token may identify a normal user for
      // compatibility, but it must never promote someone to owner/admin.
      // Owner access is not granted here by email or environment variable.
      // The production source of truth is the verified anw_users record checked by each sensitive function.
      const isOwner = false;
      const isAdminByTrustedRole = trustedIdentity && !!(
        roles.includes("admin") ||
        roles.includes("owner") ||
        roles.includes("platform_support") ||
        roles.includes("area_coordinator") ||
        roles.includes("aux_coordinator") ||
        roles.includes("assistant_area_coordinator")
      );
      const isAdmin = !!(isOwner || isAdminByTrustedRole);

      const ctx = {
        user,
        roles,
        role: roles[0] || (isOwner ? "owner" : isAdmin ? "admin" : ""),
        isOwner,
        isAdmin,
        trustedIdentity,
        tokenPayloadOnly,
      };

      return await handler(ctx, req, context);
    } catch (error) {
      return jsonResponse({ error: error?.message || "server error" }, 500);
    }
  };
}
