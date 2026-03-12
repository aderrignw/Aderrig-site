/* =========================
   Home Notices section
   - Shows Home + Public notices to everyone
   - Shows Home + Private notices to logged-in members when targeting matches
   - Keeps a visible placeholder on the Home page when there are no active notices
   - Bin collection notices are condensed into a single resident-friendly card
   ========================= */

(function () {
  'use strict';

  const listEl = document.getElementById('homeNoticeList');
  const sectionEl = document.getElementById('homeNoticesSection');
  if (!listEl || !sectionEl) return;

  const STORE_URL = '/.netlify/functions/store';
  const PUBLIC_URL = '/.netlify/functions/public-notices';
  const KEY_NOTICES = (window.ANW_KEYS && window.ANW_KEYS.NOTICES) || 'anw_notices';
  const DAY_MS = 24 * 60 * 60 * 1000;

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

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      const [m, d, y] = raw.split('/').map(Number);
      return new Date(y, m - 1, d);
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function startOfDay(value) {
    const d = parseDateValue(value);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isSameDay(a, b) {
    const da = startOfDay(a);
    const db = startOfDay(b);
    return !!(da && db && da.getTime() === db.getTime());
  }

  function formatLongDate(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatWeekday(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }

  function isBinNotice(it) {
    const cat = normalizeText(it?.category);
    const type = normalizeText(it?.meta?.type);
    const title = normalizeText(it?.title);
    return cat === 'bins' || type === 'bin_collection_import' || title.includes('bin collection');
  }

  function getBinDate(it) {
    return startOfDay(it?.date || it?.collectionDate || it?.startsOn || it?.startDate || it?.startsAt || null);
  }

  function getBinName(it) {
    const direct = String(it?.bin || '').trim();
    if (direct) return direct;
    const msg = String(it?.message || '');
    const match = msg.match(/([^\n.]+?)\s+bin\s+collection/i);
    return match ? String(match[1]).trim() : 'Bin';
  }

  function buildBinSummary(binItems) {
    if (!Array.isArray(binItems) || !binItems.length) return [];

    const dated = binItems
      .map((it) => ({ ...it, __binDate: getBinDate(it) }))
      .filter((it) => it.__binDate)
      .sort((a, b) => a.__binDate - b.__binDate);

    if (!dated.length) return [];

    const today = startOfDay(new Date());
    const yesterday = new Date(today.getTime() - DAY_MS);

    const todayItem = dated.find((it) => isSameDay(it.__binDate, today));
    const yesterdayItem = dated.find((it) => isSameDay(it.__binDate, yesterday));
    const nextItem = dated.find((it) => it.__binDate.getTime() > today.getTime());

    let primary = todayItem || yesterdayItem || nextItem || dated[dated.length - 1];
    if (!primary) return [];

    let title = '';
    let mainLine = '';
    const nextLine = nextItem
      ? `Next collection: ${getBinName(nextItem)} bin on ${formatLongDate(nextItem.__binDate)}.`
      : '';

    if (todayItem) {
      title = `${getBinName(todayItem)} bin collection today`;
      mainLine = `${formatLongDate(todayItem.__binDate)} collection is today.`;
    } else if (yesterdayItem) {
      title = `${getBinName(yesterdayItem)} bin collection completed`;
      mainLine = `${formatLongDate(yesterdayItem.__binDate)} collection completed.`;
      primary = yesterdayItem;
    } else {
      title = `${getBinName(primary)} bin collection`;
      mainLine = `${formatLongDate(primary.__binDate)} collection scheduled.`;
    }

    return [{
      id: `bin_summary_${primary.id || primary.__binDate.getTime()}`,
      title,
      message: nextLine ? `${mainLine}\n${nextLine}` : mainLine,
      category: '',
      home: primary.home,
      createdAt: primary.createdAt,
      _displayVariant: (todayItem || yesterdayItem) ? 'success' : 'info',
      _displayMeta: '',
      _displayMessageHtml: [mainLine, nextLine].filter(Boolean).map((line) => `<div>${esc(line)}</div>`).join(''),
      _displayBadge: formatVisibility(primary)
    }];
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
      const variant = it?._displayVariant || pickVariant(it);
      const title = esc(it?.title || 'Notice');
      const msgHtml = it?._displayMessageHtml || esc(it?.message || it?.text || '');
      const visibility = esc(it?._displayBadge || formatVisibility(it));
      const meta = String(it?._displayMeta || '').trim();
      return `
        <article class="home-notice-card home-notice-card--${variant}">
          <div class="home-notice-card__icon" aria-hidden="true">${ICONS[variant] || ICONS.info}</div>
          <div class="home-notice-card__body">
            <div class="home-notice-card__head">
              <h4 class="home-notice-card__title">${title}</h4>
              <span class="home-notice-card__badge">${visibility}</span>
            </div>
            <div class="home-notice-card__msg">${msgHtml}</div>
            ${meta ? `<div class="home-notice-card__meta">${esc(meta)}</div>` : ''}
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

  function getStartDate(n) {
    return n?.startsAt || n?.startsOn || n?.startDate || null;
  }

  function getEndDate(n) {
    return n?.expiresAt || n?.endsOn || n?.endDate || null;
  }

  function isNotStarted(n) {
    const st = getStartDate(n);
    const d = parseDateValue(st);
    return !!(d && d.getTime() > Date.now());
  }

  function isStarted(n) { return !isNotStarted(n); }

  function isExpired(n) {
    const exp = getEndDate(n);
    const d = parseDateValue(exp);
    return !!(d && d.getTime() < Date.now());
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

  function buildDisplayItems(items) {
    const binItems = items.filter(isBinNotice);
    const otherItems = items.filter((it) => !isBinNotice(it));
    const binSummary = buildBinSummary(binItems);
    return [...binSummary, ...otherItems]
      .sort((a, b) => Date.parse(b?.createdAt || 0) - Date.parse(a?.createdAt || 0))
      .slice(0, 8);
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
        });

      render(buildDisplayItems(merged));
    } catch {
      renderPlaceholder();
    }
  }

  main();
})();
