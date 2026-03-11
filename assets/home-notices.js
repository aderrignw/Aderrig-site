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

  function isNotStarted(n) {
    const startValue = n?.startsAt || n?.startsOn || n?.startDate || n?.showFrom || '';
    const st = startValue ? Date.parse(startValue) : NaN;
    return !isNaN(st) && st > Date.now();
  }
  function isStarted(n) { return !isNotStarted(n); }
  function isExpired(n) {
    const endValue = n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || n?.showUntil || '';
    const exp = endValue ? Date.parse(endValue) : NaN;
    return !isNaN(exp) && exp < Date.now();
  }
  function isHomeEnabled(n) {
    return !!(n && n.home && n.home.enabled);
  }
  function isPublicHome(n) {
    return isHomeEnabled(n) && String(n?.home?.visibility || 'private').toLowerCase() === 'public';
  }
  function isBinNotice(n){
    const category = normalizeText(n?.category);
    const metaType = normalizeText(n?.meta?.type);
    return category === 'bins' || metaType === 'bin_collection_import' || (!!n?.bin && !!n?.date);
  }

  function parseNoticeDateValue(n){
    const raw = n?.date || n?.collectionDate || n?.startsAt || n?.startsOn || '';
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfToday(){
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function addDays(date, days){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function sameDay(a, b){
    return !!a && !!b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function dayName(d){
    return d ? d.toLocaleDateString(undefined, { weekday: 'long' }) : '';
  }

  function prettyDate(d){
    return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }

  function niceBinName(v){
    const raw = String(v || '').trim();
    if (!raw) return 'Bin';
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  function buildBinDisplayNotices(items){
    const today = startOfToday();
    const yesterday = addDays(today, -1);

    const bins = items
      .filter(isBinNotice)
      .map((n) => ({ ...n, _collectionDate: parseNoticeDateValue(n) }))
      .filter((n) => !!n._collectionDate)
      .sort((a, b) => a._collectionDate - b._collectionDate);

    if (!bins.length) return [];

    const results = [];

    const todays = bins.filter((n) => sameDay(n._collectionDate, today));
    todays.forEach((n) => {
      const binName = niceBinName(n.bin);
      results.push({
        ...n,
        id: `${n.id || 'bin'}__today`,
        title: `${binName} bin collection — Today`,
        message: `${dayName(n._collectionDate)}: ${binName} bin collection is scheduled for today (${prettyDate(n._collectionDate)}).`,
        category: 'Bins',
        _priority: 0
      });
    });

    const completedYesterday = bins.filter((n) => sameDay(n._collectionDate, yesterday));
    completedYesterday.forEach((n) => {
      const binName = niceBinName(n.bin);
      results.push({
        ...n,
        id: `${n.id || 'bin'}__completed`,
        title: `${binName} bin collection completed`,
        message: `${dayName(n._collectionDate)} ${prettyDate(n._collectionDate)} collection completed.`,
        category: 'Bins',
        _priority: 1
      });
    });

    const upcomingAnchor = todays.length ? addDays(today, 1) : today;
    const nextUpcoming = bins.find((n) => n._collectionDate >= upcomingAnchor);
    if (nextUpcoming) {
      const binName = niceBinName(nextUpcoming.bin);
      const isToday = sameDay(nextUpcoming._collectionDate, today);
      results.push({
        ...nextUpcoming,
        id: `${nextUpcoming.id || 'bin'}__next`,
        title: isToday ? `${binName} bin collection — Today` : `Next bin collection — ${binName} bin`,
        message: isToday
          ? `${dayName(nextUpcoming._collectionDate)}: ${binName} bin collection is scheduled for today (${prettyDate(nextUpcoming._collectionDate)}).`
          : `${dayName(nextUpcoming._collectionDate)}: ${binName} bin collection scheduled for ${prettyDate(nextUpcoming._collectionDate)}.`,
        category: 'Bins',
        _priority: 2
      });
    }

    const seen = new Set();
    return results.filter((item) => {
      const key = `${item.title}|${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function prepareDisplayItems(items){
    const source = Array.isArray(items) ? items.slice() : [];
    const binDisplay = buildBinDisplayNotices(source);
    const otherNotices = source.filter((n) => !isBinNotice(n));
    return [...binDisplay, ...otherNotices]
      .sort((a, b) => {
        const ap = Number(a?._priority ?? 99);
        const bp = Number(b?._priority ?? 99);
        if (ap !== bp) return ap - bp;
        return Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0);
      })
      .slice(0, 8);
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
    const displayItems = prepareDisplayItems(items);
    if (!Array.isArray(displayItems) || !displayItems.length) {
      renderPlaceholder();
      return;
    }
    listEl.innerHTML = displayItems.map((it) => {
      const variant = pickVariant(it);
      const expires = asDate(it?.expiresAt);
      const category = esc(it?.category || 'General');
      const title = esc(it?.title || 'Notice');
      const msg = esc(it?.message || it?.text || '');
      const visibility = esc(formatVisibility(it));
      const weekday = it?._collectionDate ? dayName(it._collectionDate) : '';
      const meta = [
        category,
        weekday,
        visibility,
        expires ? `Visible until ${esc(expires)}` : ''
      ].filter(Boolean).join(' · ');
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
