/* =========================
   Home Notices section
   - Shows Home + Public notices to everyone
   - Shows Home + Private notices to logged-in members when targeting matches
   - Expands automatically with 1, 2, 3+ notices
   - Keeps a visible placeholder on the Home page when there are no active notices
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

    if (/(urgent|emergency|crime|theft|break[-\s]?in|suspicious|danger|warning|scam)/.test(blob)) return 'warning';
    if (/(cancelled|canceled|closed|outage|error|failed|issue|problem)/.test(blob)) return 'error';
    if (/(success|thanks|thank you|completed|resolved|approved|collection|recycling|volunteer)/.test(blob)) return 'success';

    if (cat === 'safety') return 'warning';
    if (cat === 'garda') return 'info';
    if (cat === 'volunteer') return 'success';
    if (cat === 'meeting') return 'info';
    return 'info';
  }

  function formatVisibility(it){
    const vis = String(it?.home?.visibility || 'private').toLowerCase();
    return vis === 'public' ? 'Public' : 'Members only';
  }

  function asDate(d){
    const v = d ? new Date(d) : null;
    return v && !Number.isNaN(v.getTime()) ? v.toLocaleDateString() : '';
  }

  function getStartValue(n) {
    return n?.startsAt || n?.startsOn || n?.startDate || '';
  }
  function getExpiryValue(n) {
    return n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || '';
  }
  function isNotStarted(n) {
    const st = getStartValue(n) ? Date.parse(getStartValue(n)) : NaN;
    return !isNaN(st) && st > Date.now();
  }
  function isStarted(n) { return !isNotStarted(n); }
  function isExpired(n) {
    const exp = getExpiryValue(n) ? Date.parse(getExpiryValue(n)) : NaN;
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

  function renderPlaceholder(){
    listEl.innerHTML = `
      <article class="home-notice-card home-notice-card--placeholder">
        <div class="home-notice-card__icon" aria-hidden="true">${ICONS.info}</div>
        <div class="home-notice-card__body">
          <div class="home-notice-card__title">No notices published yet</div>
          <div class="home-notice-card__msg">
            Notices marked with <strong>Show on Home</strong> in Admin → Notices will appear here automatically.
          </div>
        </div>
      </article>
    `;
  }

  function render(items){
    if (!Array.isArray(items) || !items.length) {
      renderPlaceholder();
      return;
    }
    listEl.innerHTML = items.map((it) => {
      const variant = pickVariant(it);
      const expires = asDate(getExpiryValue(it));
      const category = esc(it?.category || 'General');
      const title = esc(it?.title || 'Notice');
      const msg = esc(it?.message || it?.text || '');
      const visibility = esc(formatVisibility(it));
      const meta = [category, visibility, expires ? `Expires ${esc(expires)}` : ''].filter(Boolean).join(' · ');
      return `
        <article class="home-notice-card home-notice-card--${variant}">
          <div class="home-notice-card__icon" aria-hidden="true">${ICONS[variant] || ICONS.info}</div>
          <div class="home-notice-card__body">
            <div class="home-notice-card__head">
              <h4 class="home-notice-card__title">${title}</h4>
              <span class="home-notice-card__badge">${visibility}</span>
            </div>
            <div class="home-notice-card__msg">${msg}</div>
            <div class="home-notice-card__meta">${meta}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function getIdentityToken() {
    if (!window.netlifyIdentity) return null;
    const user = window.netlifyIdentity.currentUser();
    if (!user) return null;
    try { return await user.jwt(); } catch { return null; }
  }

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
    const target = n?.target || {};
    const include = target.include || {};
    const exclude = target.exclude || {};
    const legacy = n?.targets || {};
    const userRoles = []
      .concat(Array.isArray(user?.roles) ? user.roles : [])
      .concat(user?.role ? [user.role] : [])
      .map(v => String(v || '').toLowerCase())
      .filter(Boolean);
    if(!userRoles.length) userRoles.push('resident');
    const isAdmin = userRoles.some(isAdminRole);
    const eir = normEir(user?.eircode || '');
    const street = getStreetName(user?.address || user?.fullAddress || '');

    const inc = {
      allLoggedIn: !!(include.allLoggedIn || legacy.allLogged),
      nonAdminOnly: !!(include.nonAdminOnly || legacy.nonAdminOnly),
      roles: (Array.isArray(include.roles) && include.roles.length ? include.roles : legacy.roles || []).map(String).map(x=>x.toLowerCase()),
      eircodes: (Array.isArray(include.eircodes) && include.eircodes.length ? include.eircodes : legacy.eircodes || []).map(String).map(normEir),
      eircodePrefixes: (Array.isArray(include.eircodePrefixes) && include.eircodePrefixes.length ? include.eircodePrefixes : legacy.eirPrefixes || []).map(String).map(x=>x.toUpperCase()),
      streets: (Array.isArray(include.streets) && include.streets.length ? include.streets : legacy.streets || []).map(String).map(x=>x.trim().toLowerCase()).filter(Boolean),
      emails: (Array.isArray(include.emails) && include.emails.length ? include.emails : legacy.emails || []).map(normEmail)
    };

    if(Array.isArray(exclude.roles) && exclude.roles.map(String).map(x=>x.toLowerCase()).some(r => userRoles.includes(r))) return false;
    if(Array.isArray(exclude.eircodes) && exclude.eircodes.map(String).map(normEir).includes(eir)) return false;
    if(Array.isArray(exclude.emails) && exclude.emails.map(normEmail).includes(normEmail(user?.email))) return false;
    if(inc.nonAdminOnly && isAdmin) return false;

    const hasAnyInclude = !!(inc.allLoggedIn || inc.roles.length || inc.eircodes.length || inc.eircodePrefixes.length || inc.streets.length || inc.emails.length);
    if(!hasAnyInclude) return true;
    if(inc.allLoggedIn) return true;
    if(inc.roles.some(r => userRoles.includes(r))) return true;
    if(inc.emails.includes(normEmail(user?.email))) return true;
    if(inc.eircodes.includes(eir)) return true;
    if(inc.eircodePrefixes.some(p => eir.startsWith(p))) return true;
    if(street && inc.streets.includes(street.toLowerCase())) return true;
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

      const seen = new Set();
      const merged = [...pub, ...priv]
        .filter(it => {
          const id = String(it?.id || '');
          if (!id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
        .slice(0, 8);

      render(merged);
    } catch {
      renderPlaceholder();
    }
  }

  main();
})();
