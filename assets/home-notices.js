/* =========================
   Home Notices Bar (compact carousel)
   - Shows public notices to everyone (via /.netlify/functions/public-notices)
   - Shows private home notices to logged-in members (via store) when allowed
   - Hides itself when there are no active notices
   ========================= */

(function () {
  'use strict';

  const bar = document.getElementById('homeNoticeBar');
  if (!bar) return;

  const textEl = bar.querySelector('[data-home-notice-text]');
  const prevBtn = bar.querySelector('[data-home-notice-prev]');
  const nextBtn = bar.querySelector('[data-home-notice-next]');

  const STORE_URL = '/.netlify/functions/store';
  const PUBLIC_URL = '/.netlify/functions/public-notices';

  const KEY_NOTICES = (window.ANW_KEYS && window.ANW_KEYS.NOTICES) || 'anw_notices';

  let items = [];
  let idx = 0;
  let timer = null;

  function esc(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function show() {
    bar.style.display = '';
  }

  function hide() {
    bar.style.display = 'none';
  }

  

  function isNotStarted(n) {
    const st = n?.startsAt ? Date.parse(n.startsAt) : NaN;
    return !isNaN(st) && st > Date.now();
  }

  function isStarted(n) {
    return !isNotStarted(n);
  }
function isExpired(n) {
    const exp = n?.expiresAt ? Date.parse(n.expiresAt) : NaN;
    return !isNaN(exp) && exp < Date.now();
  }

  function isHomeEnabled(n) {
    return !!(n && n.home && n.home.enabled);
  }

  function isPublicHome(n) {
    return isHomeEnabled(n) && String(n?.home?.visibility || 'private').toLowerCase() === 'public';
  }

  function isPrivateHome(n) {
    return isHomeEnabled(n) && String(n?.home?.visibility || 'private').toLowerCase() !== 'public';
  }

  function render() {
    if (!textEl) return;
    if (!items.length) {
      hide();
      return;
    }
    const it = items[idx] || items[0];
    const title = esc(it.title || 'Notice');
    const msg = esc(it.message || it.text || '');
    textEl.innerHTML = `<span class="home-notice-bar__title">${title}:</span> <span class="home-notice-bar__msg">${msg}</span>`;
    show();

    // Hide nav if only one
    const nav = items.length > 1;
    if (prevBtn) prevBtn.style.display = nav ? '' : 'none';
    if (nextBtn) nextBtn.style.display = nav ? '' : 'none';
  }

  function next() {
    if (!items.length) return;
    idx = (idx + 1) % items.length;
    render();
  }

  function prev() {
    if (!items.length) return;
    idx = (idx - 1 + items.length) % items.length;
    render();
  }

  function restartTimer() {
    if (timer) clearInterval(timer);
    if (items.length > 1) timer = setInterval(next, 8000);
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { prev(); restartTimer(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { next(); restartTimer(); });

  async function getIdentityToken() {
    if (!window.netlifyIdentity) return null;
    const user = window.netlifyIdentity.currentUser();
    if (!user) return null;
    try { return await user.jwt(); } catch { return null; }
  }

  // Minimal targeting logic (copied from dashboard, simplified)
  function normEmail(v){ return String(v||'').trim().toLowerCase(); }
  function normEir(v){ return String(v||'').replace(/\s+/g,'').toUpperCase(); }
  function getStreetName(address){
    const a = String(address||'').trim();
    if(!a) return '';
    let s = a.replace(/[A-Z]\d{2}\s?[A-Z0-9]{4}\b/gi, '').replace(/\s{2,}/g,' ').trim();
    s = (s.split(',')[0] || s).trim();
    s = s.replace(/^\s*\d+[A-Za-z]?\s+/, '').trim();
    return s;
  }
  function isAdminRole(role){
    const r = String(role||'').toLowerCase();
    return r === 'admin' || r === 'owner';
  }
  function noticeMatchesUser(n, user){
    const t = n?.target || {};
    const inc = t.include || {};
    const exc = t.exclude || {};
    const role = String(user?.role || 'resident').toLowerCase();
    const isAdmin = isAdminRole(role);
    const eir = normEir(user?.eircode || '');
    const street = getStreetName(user?.address || user?.fullAddress || '');

    if(Array.isArray(exc.roles) && exc.roles.map(String).map(x=>x.toLowerCase()).includes(role)) return false;
    if(Array.isArray(exc.eircodes) && exc.eircodes.map(String).map(normEir).includes(eir)) return false;
    if(Array.isArray(exc.emails) && exc.emails.map(normEmail).includes(normEmail(user?.email))) return false;
    if(inc.nonAdminOnly && isAdmin) return false;

    const hasAnyInclude = !!(
      inc.allLoggedIn ||
      (Array.isArray(inc.roles) && inc.roles.length) ||
      (Array.isArray(inc.eircodes) && inc.eircodes.length) ||
      (Array.isArray(inc.eircodePrefixes) && inc.eircodePrefixes.length) ||
      (Array.isArray(inc.streets) && inc.streets.length) ||
      (Array.isArray(inc.emails) && inc.emails.length)
    );
    if(!hasAnyInclude) return true;
    if(inc.allLoggedIn) return true;
    if(Array.isArray(inc.roles) && inc.roles.map(String).map(x=>x.toLowerCase()).includes(role)) return true;
    if(Array.isArray(inc.emails) && inc.emails.map(normEmail).includes(normEmail(user?.email))) return true;
    if(Array.isArray(inc.eircodes) && inc.eircodes.map(String).map(normEir).includes(eir)) return true;
    if(Array.isArray(inc.eircodePrefixes) && inc.eircodePrefixes.map(String).map(x=>x.toUpperCase()).some(p=>eir.startsWith(p))) return true;
    if(Array.isArray(inc.streets) && street){
      const stList = inc.streets.map(String).map(x=>x.trim().toLowerCase()).filter(Boolean);
      if(stList.includes(street.toLowerCase())) return true;
    }
    return false;
  }

  async function loadPublicNotices() {
    const res = await fetch(PUBLIC_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function loadPrivateNoticesForLoggedUser() {
    const token = await getIdentityToken();
    if (!token) return [];
    if (typeof window.anwInitStore === 'function') {
      try { await window.anwInitStore(); } catch {}
    }

    // Get logged user profile from localStorage cache (same as other pages)
    let me = null;
    try {
      const raw = localStorage.getItem('anw_logged');
      if (raw) me = JSON.parse(raw);
    } catch {}
    if (!me || !me.email) return [];

    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    const all = Array.isArray(data?.value) ? data.value : (Array.isArray(data) ? data : []);

    return all
      .filter(n => !isExpired(n)).filter(isStarted)
      .filter(n => isPrivateHome(n))
      .filter(n => noticeMatchesUser(n, me));
  }

  async function main() {
    try {
      const pub = (await loadPublicNotices()).filter(n => !isExpired(n)).filter(isStarted).filter(isPublicHome);
      const priv = await loadPrivateNoticesForLoggedUser();

      // Merge (public first, then private)
      const merged = [...pub, ...priv]
        .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
        .slice(0, 8);

      items = merged;
      idx = 0;
      render();
      restartTimer();
    } catch {
      hide();
    }
  }

  main();
})();
