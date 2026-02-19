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
  const iconEl = bar.querySelector('[data-home-notice-icon]') || bar.querySelector('.home-notice-bar__icon');
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

  // Visual variants (icon + background) are chosen automatically based on notice category / keywords.
  const ICONS = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm0 4a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 6Zm2 14h-4v-2h1v-5h-1v-2h3v7h1v2Z"/></svg>',
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm4.3 7.7-5.2 6.1a1 1 0 0 1-1.5.1l-2.6-2.6 1.4-1.4 1.9 1.9 4.5-5.2 1.5 1.1Z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm3.5 13.1-1.4 1.4L12 13.4 9.9 15.5 8.5 14.1 10.6 12 8.5 9.9l1.4-1.4L12 10.6l2.1-2.1 1.4 1.4L13.4 12l2.1 2.1Z"/></svg>'
  };

  function normalizeText(v){ return String(v || '').trim().toLowerCase(); }

  function pickVariant(it){
    const cat = normalizeText(it?.category);
    const t = normalizeText(it?.title);
    const m = normalizeText(it?.message || it?.text);
    const blob = `${cat} ${t} ${m}`;

    // Strong signals
    if (/(urgent|emergency|crime|theft|break[-\s]?in|suspicious|danger|warning|scam)/.test(blob)) return 'warning';
    if (/(cancelled|canceled|closed|outage|error|failed|issue|problem)/.test(blob)) return 'error';
    if (/(success|thanks|thank you|completed|resolved|approved)/.test(blob)) return 'success';

    // Category defaults
    if (cat === 'safety') return 'warning';
    if (cat === 'garda') return 'info';
    if (cat === 'volunteer') return 'success';
    if (cat === 'meeting') return 'info';
    return 'info';
  }

  function applyVariant(variant){
    // Remove previous variant classes
    bar.classList.remove('home-notice-bar--info','home-notice-bar--success','home-notice-bar--warning','home-notice-bar--error');
    bar.classList.add(`home-notice-bar--${variant}`);
    if (iconEl) iconEl.innerHTML = ICONS[variant] || ICONS.info;
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
      // Show an empty "message area" placeholder only in local testing
      if (location.hostname === 'localhost') {
        items = [{
          title: 'Test',
          message: 'Message area — information will appear here.'
        }];
      } else {
        hide();
        return;
      }
    }
    const it = items[idx] || items[0];
    applyVariant(pickVariant(it));
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
