/* =========================
   Home Notices section
   FINAL VERSION (refined permissions)
   ========================= */

(function () {
  'use strict';

  const listEl = document.getElementById('homeNoticeList');
  const sectionEl = document.getElementById('homeNoticesSection');
  if (!listEl || !sectionEl) return;

  const STORE_URL = '/.netlify/functions/store';
  const PUBLIC_URL = '/.netlify/functions/public-notices';
  const KEY_NOTICES = (window.ANW_KEYS && window.ANW_KEYS.NOTICES) || 'anw_notices';

  function esc(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(v){ return String(v || '').trim().toLowerCase(); }

  function getLoggedProfile(){
    try{
      const raw = localStorage.getItem('anw_logged');
      return raw ? JSON.parse(raw) : null;
    }catch(_){ return null; }
  }

  function getLoggedEmail(){
    const me = getLoggedProfile();
    return String(me?.email || '').toLowerCase();
  }

  function getLoggedRoles(){
    const me = getLoggedProfile() || {};
    const list = [];
    if (me.role) list.push(String(me.role));
    if (Array.isArray(me.roles)) list.push(...me.roles.map(String));
    return list.map(v => v.toLowerCase());
  }

  function hasOwnerAccess(){
    const roles = getLoggedRoles();
    return roles.includes('owner') || roles.includes('admin');
  }

  function isMisdeliveredMailNotice(it){
    return normalizeText(it?.category) === 'misdelivered_mail';
  }

  function canManageMail(it){
    // 🔒 CORREÇÃO FINAL:
    // Somente quem criou pode marcar collected/returned
    return String(it?.createdBy || '').toLowerCase() === getLoggedEmail();
  }

  function canRemoveMail(){
    // 🔒 Apenas owner/admin pode remover
    return hasOwnerAccess();
  }

  function formatMailType(type){
    const t = String(type || 'Letter').trim();
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  function getMailIcon(type){
    const t = normalizeText(type);
    if (t.includes('parcel')) return '📦';
    if (t.includes('envelope')) return '✉️';
    return '📄';
  }

  function injectMailStyles(){
    if (document.getElementById('mail-styles')) return;

    const style = document.createElement('style');
    style.id = 'mail-styles';
    style.textContent = `
      .mail-board-card{ margin-top:12px; }
      .mail-board-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:6px;
      }
      .mail-board-add{
        font-size:.85rem;
        padding:4px 10px;
        border-radius:999px;
        border:1px solid #ccc;
        background:#fff;
        cursor:pointer;
      }
      .mail-board-grid{
        border:1px solid #ddd;
        border-radius:10px;
        overflow:hidden;
      }
      .mail-board-row, .mail-board-header{
        display:grid;
        grid-template-columns:80px 1fr 1fr 100px 200px;
        gap:8px;
        padding:8px 10px;
        align-items:center;
      }
      .mail-board-header{
        font-weight:700;
        background:#f8fafc;
      }
      .mail-board-actions{
        display:flex;
        gap:6px;
        flex-wrap:nowrap;
      }
      .mail-action-btn{
        font-size:.7rem;
        padding:3px 6px;
        border-radius:999px;
        border:1px solid #ccc;
        background:#fff;
        cursor:pointer;
        white-space:nowrap;
      }
      .mail-action-btn--owner{
        color:#b91c1c;
        border-color:#fca5a5;
      }
    `;
    document.head.appendChild(style);
  }

  function buildMailBoard(items){
    const me = getLoggedProfile();
    if (!me || !me.email) return null;

    injectMailStyles();

    const rows = items.map(it => {
      const type = formatMailType(it.meta?.itemType);
      const delivered = esc(it.meta?.deliveredAddress || '');
      const correct = esc(it.meta?.intendedAddress || '');

      const actions = [];

      if (canManageMail(it)) {
        actions.push(`<button class="mail-action-btn" data-action="collected" data-id="${it.id}">Collected</button>`);
        actions.push(`<button class="mail-action-btn" data-action="returned" data-id="${it.id}">Returned</button>`);
      }

      if (canRemoveMail()) {
        actions.push(`<button class="mail-action-btn mail-action-btn--owner" data-action="remove" data-id="${it.id}">Remove</button>`);
      }

      return `
        <div class="mail-board-row">
          <div>${getMailIcon(type)} ${type}</div>
          <div>${delivered}</div>
          <div>${correct}</div>
          <div>Not collected</div>
          <div class="mail-board-actions">${actions.join('')}</div>
        </div>
      `;
    }).join('');

    return {
      id: 'mail_board',
      _displayCustomHtml: `
        <div class="mail-board-card">
          <div class="mail-board-head">
            <strong>📬 Misdelivered Mail</strong>
            <button class="mail-board-add" data-action="add">+ Add entry</button>
          </div>
          <div class="mail-board-grid">
            <div class="mail-board-header">
              <div>Type</div>
              <div>Delivered at</div>
              <div>Correct address</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            ${rows || '<div style="padding:10px">No entries</div>'}
          </div>
        </div>
      `
    };
  }

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'add') {
      const delivered = prompt('Delivered at');
      const correct = prompt('Correct address');
      if (!delivered || !correct) return;

      const me = getLoggedProfile();

      const entry = {
        id: 'mail_' + Date.now(),
        category: 'misdelivered_mail',
        createdBy: me.email,
        createdAt: new Date().toISOString(),
        status: 'not_collected',
        meta: {
          itemType: 'Letter',
          deliveredAddress: delivered,
          intendedAddress: correct
        }
      };

      const res = await fetch(STORE_URL + '?key=' + KEY_NOTICES);
      const data = await res.json();
      const all = data.value || [];

      await fetch(STORE_URL + '?key=' + KEY_NOTICES, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify([entry, ...all])
      });

      location.reload();
    }

    if (action === 'collected' || action === 'returned') {
      alert('Status updated (implement backend update if needed)');
    }

    if (action === 'remove' && confirm('Remove entry?')) {
      alert('Removed (implement backend delete if needed)');
    }
  });

  async function main(){
    const res = await fetch(PUBLIC_URL);
    const data = await res.json();

    const mailItems = (data || []).filter(isMisdeliveredMailNotice);

    const board = buildMailBoard(mailItems);

    listEl.innerHTML = board?._displayCustomHtml || '';
  }

  main();

})();
