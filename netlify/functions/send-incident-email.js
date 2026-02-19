// Netlify Function: /.netlify/functions/send-incident-email
// Sends the incident report email via Resend, including optional attachments.
// IMPORTANT: Set these environment variables in Netlify:
// - RESEND_API_KEY = your Resend API key
// - RESEND_FROM   = a verified sender, e.g. "reports@aderrignw.ie" (or use onboarding@resend.dev while testing)

export async function handler(event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing RESEND_API_KEY in server environment" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const text = String(payload.text || "").trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  if (!to || !subject || !text) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing required fields: to, subject, text" }),
    };
  }

  // Keep attachments optional; do not persist them anywhere.
  // Resend expects each attachment to include: filename + base64 content.
  const safeAttachments = attachments
    .filter(a => a && a.filename && a.content)
    .map(a => ({
      filename: String(a.filename),
      content: String(a.content), // base64
    }));

  const from = process.env.RESEND_FROM || "onboarding@resend.dev";

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        attachments: safeAttachments.length ? safeAttachments : undefined,
      }),
    });

    const data = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      return {
        statusCode: resendRes.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: data?.message || "Resend API error",
          details: data,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, id: data?.id || null }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Server error sending email" }),
    };
  }
}
