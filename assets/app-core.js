// app-core.js (FINAL CORRIGIDO)

window.ANW_KEYS = window.ANW_KEYS || {
  SESSION: "anw_session",
  USERS: "anw_users"
};

function anwLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function anwNormEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function anwGetLoggedEmail() {
  try {
    const u = window.netlifyIdentity?.currentUser();
    if (u?.email) return anwNormEmail(u.email);
  } catch {}

  const s = anwLoad(ANW_KEYS.SESSION, null);
  return s?.email ? anwNormEmail(s.email) : "";
}

// 🔥 CORREÇÃO FINAL AQUI
window.anwGetLoggedProfile = function () {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return null;

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return null;

    return users.find((u) => {
      const emails = [
        u?.email,
        u?.userEmail,
        u?.loginEmail,
        u?.netlifyEmail
      ]
      .map(anwNormEmail)
      .filter(Boolean);

      return emails.includes(email);
    }) || null;

  } catch {
    return null;
  }
};

window.anwHasApprovedAccess = function () {
  const u = window.anwGetLoggedProfile();
  if (!u) return false;

  const status = String(
    u.status || u.accountStatus || u.registrationStatus || ""
  ).toLowerCase();

  return (
    u.approved === true ||
    u.active === true ||
    status === "approved" ||
    status === "active"
  );
};
