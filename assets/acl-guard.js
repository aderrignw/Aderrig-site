// FIXED acl-guard.js (never return empty role)

function getRole() {
  try {
    const email = getLoggedEmail();
    if (email && isMasterOwnerEmail(email)) return "owner";

    if (isAdminPath() && email) {
      const roles = getAdminRolesForEmail(email);
      if (hasAllowedAdminRole(roles)) {
        return roles[0] || "admin";
      }
    }
  } catch (_) {}

  try {
    if (!isAdminPath() && typeof window.anwGetLoggedRole === "function") {
      const role = normalizeRoleName(window.anwGetLoggedRole());
      if (role) return role;
    }
  } catch (_) {}

  try {
    if (!isAdminPath()) {
      const rawLogged = localStorage.getItem("anw_logged");
      const logged = rawLogged ? JSON.parse(rawLogged) : null;
      const role = normalizeRoleName(
        logged && (logged.role || logged.primaryRole || (Array.isArray(logged.roles) ? logged.roles[0] : ""))
      );
      if (role) return role;
    }
  } catch (_) {}

  return "resident"; // 🔥 CRITICAL FIX
}
