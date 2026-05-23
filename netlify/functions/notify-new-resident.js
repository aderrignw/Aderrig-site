import { withSecurity, jsonResponse, normalizeEmail } from "./aderrig-security-layer.mjs";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map();

function getClientIp(req) {
  return req.headers.get("x-nf-client-connection-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function allow(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length <= RATE_MAX;
}

function clean(value, max = 300) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 2000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendWithResend({ to, from, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { skipped: true, reason: "missing RESEND_API_KEY" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, data };
  }
  return { ok: true, data };
}

export default withSecurity(
  {
    methods: ["POST"],
    maxBodyBytes: 32 * 1024,
  },
  async (ctx, req) => {
    if (!allow(req)) {
      return jsonResponse({ error: "rate limit" }, 429);
    }

    // The registration page logs the new resident in before calling this function.
    // Requiring an authenticated Identity user helps prevent public email spam.
    if (!ctx.user?.email) {
      return jsonResponse({ error: "authentication required" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "invalid body" }, 400);
    }

    const resident = {
      name: clean(body.name, 160),
      email: normalizeEmail(body.email),
      eircode: clean(body.eircode, 40).toUpperCase(),
      address: clean(body.address, 300),
      phone: clean(body.phone, 80),
      residentType: clean(body.residentType, 100),
      managementCompany: clean(body.managementCompany, 160),
      createdAt: clean(body.createdAt, 80),
    };

    if (!resident.email) {
      return jsonResponse({ error: "missing resident email" }, 400);
    }

    const to = normalizeEmail(process.env.ADMIN_NOTIFY_EMAIL || process.env.MASTER_EMAIL || "aderrignw@gmail.com");
    const from = String(
      process.env.RESEND_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      "Aderrig NW <onboarding@resend.dev>"
    ).trim();
    const siteUrl = String(process.env.SITE_URL || process.env.URL || "https://aderrignw.ie").replace(/\/$/, "");
    const adminUrl = `${siteUrl}/admin.html`;

    const subject = "New resident pending approval - Aderrig NW";
    const text = [
      "A new resident has registered and is pending approval.",
      "",
      `Name: ${resident.name || "-"}`,
      `Email: ${resident.email || "-"}`,
      `Eircode: ${resident.eircode || "-"}`,
      `Address: ${resident.address || "-"}`,
      `Phone: ${resident.phone || "-"}`,
      `Resident type: ${resident.residentType || "-"}`,
      `Management company: ${resident.managementCompany || "-"}`,
      `Registered at: ${resident.createdAt || new Date().toISOString()}`,
      "",
      `Open Admin Panel: ${adminUrl}`,
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2>New resident pending approval</h2>
        <p>A new resident has registered and is waiting for admin approval.</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e5e7eb;">
          <tr><td><strong>Name</strong></td><td>${escapeHtml(resident.name) || "-"}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(resident.email) || "-"}</td></tr>
          <tr><td><strong>Eircode</strong></td><td>${escapeHtml(resident.eircode) || "-"}</td></tr>
          <tr><td><strong>Address</strong></td><td>${escapeHtml(resident.address) || "-"}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${escapeHtml(resident.phone) || "-"}</td></tr>
          <tr><td><strong>Resident type</strong></td><td>${escapeHtml(resident.residentType) || "-"}</td></tr>
          <tr><td><strong>Management company</strong></td><td>${escapeHtml(resident.managementCompany) || "-"}</td></tr>
          <tr><td><strong>Registered at</strong></td><td>${escapeHtml(resident.createdAt || new Date().toISOString())}</td></tr>
        </table>
        <p><a href="${escapeHtml(adminUrl)}">Open Admin Panel</a></p>
      </div>`;

    const result = await sendWithResend({ to, from, subject, text, html });
    if (result?.ok || result?.skipped) {
      return jsonResponse({ ok: true, email: result }, 200);
    }

    return jsonResponse({ error: "email send failed", email: result }, 502);
  }
);
