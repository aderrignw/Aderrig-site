// HOME NOTICES + MISDELIVERED MAIL FIXED VERSION

function isLoggedIn() {
  return !!window.currentUser;
}

// =========================
// LOAD ALL NOTICES
// =========================
async function loadHomeNotices() {
  const notices = await fetchNoticesFromStorage();

  renderMisdeliveredMail(notices);
  renderRegularNotices(notices);
}

// =========================
// RENDER REGULAR NOTICES
// =========================
function renderRegularNotices(notices) {
  const container = document.getElementById("notices-container");
  if (!container) return;

  container.innerHTML = "";

  notices.forEach(item => {

    // 🚫 NÃO RENDERIZA MISDELIVERED MAIL AQUI
    if (item.category === "misdelivered_mail") return;

    const el = document.createElement("div");
    el.className = "notice-card";

    el.innerHTML = `
      <div class="notice-title">${item.title}</div>
      <div class="notice-body">${item.message}</div>
    `;

    container.appendChild(el);
  });
}

// =========================
// RENDER MISDELIVERED MAIL
// =========================
function renderMisdeliveredMail(notices) {
  if (!isLoggedIn()) return;

  const container = document.getElementById("misdelivered-mail-body");
  if (!container) return;

  container.innerHTML = "";

  const now = new Date();

  const items = notices.filter(n =>
    n.category === "misdelivered_mail" &&
    n.status === "not_collected" &&
    new Date(n.expiresAt) > now
  );

  items.forEach(item => {
    const isOwner = item.createdBy === window.currentUser?.email;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.meta.itemType}</td>
      <td>${item.meta.deliveredAddress}</td>
      <td>${item.meta.intendedAddress}</td>
      <td><span class="status-pill">Not collected</span></td>
      <td>
        ${isOwner ? `
          <div class="actions-inline">
            <button class="btn-small" onclick="markCollected('${item.id}')">Collected</button>
            <button class="btn-small" onclick="markReturned('${item.id}')">Returned</button>
          </div>
        ` : ``}
      </td>
    `;

    container.appendChild(row);
  });
}

// =========================
// ACTIONS
// =========================
async function markCollected(id) {
  await updateNoticeStatus(id, "collected");
  loadHomeNotices();
}

async function markReturned(id) {
  await updateNoticeStatus(id, "returned_to_sender");
  loadHomeNotices();
}
