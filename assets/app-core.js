// FIXED app-core.js (fallback roles restored)

function anwGetLoggedRole() {
  try {
    const email = anwNormEmail(anwGetLoggedEmail());
    if (!email) return "resident";

    if (anwIsMasterEmail(email)) return "owner";

    const users = anwLoad(ANW_KEYS.USERS, []);
    if (!Array.isArray(users)) return "resident";

    const me = users.find(u => anwNormEmail(u && u.email) === email);
    if (!me) return "resident";

    const normalized = anwCollectProfileRoles(me).map(anwNormalizeRoleName);

    if (normalized.includes("owner")) return "owner";
    if (normalized.includes("admin")) return "admin";
    if (normalized.includes("area_coordinator")) return "area_coordinator";
    if (normalized.includes("assistant_area_coordinator")) return "assistant_area_coordinator";
    if (normalized.includes("street_coordinator")) return "street_coordinator";
    if (normalized.includes("projects")) return "projects";

    return "resident";
  } catch (e) {
    console.warn("Erro ao obter role do usuário:", e);
    return "resident";
  }
}
