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

  function injectBinCardStyles() {
    if (document.getElementById('anw-bin-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'anw-bin-card-styles';
    style.textContent = `
      .home-bin-card{
        display:grid;
        grid-template-columns:92px 1fr;
        gap:16px;
        align-items:stretch;
        padding:18px;
        border:1px solid rgba(31,111,74,.16);
        border-radius:18px;
        background:linear-gradient(180deg,#fcfffd 0%,#f6fbf8 100%);
        box-shadow:0 8px 24px rgba(17,24,39,.06);
      }
      .home-bin-card__date{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        border-radius:16px;
        background:#17324d;
        color:#fff;
        min-height:110px;
        padding:12px 10px;
        text-align:center;
      }
      .home-bin-card__dow{ font-size:0.82rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; opacity:.92; }
      .home-bin-card__day{ font-size:2rem; line-height:1; font-weight:900; margin:6px 0 4px; }
      .home-bin-card__month{ font-size:.9rem; font-weight:700; opacity:.95; }
      .home-bin-card__body{ min-width:0; }
      .home-bin-card__eyebrow{
        display:inline-flex;
        align-items:center;
        gap:8px;
        font-size:.82rem;
        font-weight:800;
        color:#1f6f4a;
        letter-spacing:.02em;
        text-transform:uppercase;
        margin-bottom:6px;
      }
      .home-bin-card__status{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:6px 12px;
        border-radius:999px;
        font-size:.82rem;
        font-weight:800;
        background:rgba(31,111,74,.10);
        color:#1f6f4a;
        margin-bottom:10px;
      }
      .home-bin-card__status--done{ background:rgba(23,50,77,.10); color:#17324d; }
      .home-bin-card__title{ margin:0 0 8px; font-size:1.35rem; line-height:1.2; font-weight:900; color:#1f2937; }
      .home-bin-card__lead{ margin:0; font-size:1rem; line-height:1.55; color:#334155; }
      .home-bin-card__next{
        margin-top:14px;
        padding:14px 16px;
        border-radius:14px;
        background:#fff;
        border:1px solid rgba(17,24,39,.08);
      }
      .home-bin-card__next-label{ font-size:.78rem; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
      .home-bin-card__next-title{ font-size:1rem; font-weight:800; color:#111827; }
      .home-bin-card__next-date{ margin-top:2px; color:#475569; }
      .bin-chip{
        display:inline-flex;
        align-items:center;
        gap:8px;
        font-weight:800;
      }
      .bin-chip__dot{
        width:12px;
        height:12px;
        border-radius:999px;
        display:inline-block;
        border:1px solid rgba(17,24,39,.16);
        background:#cbd5e1;
      }
      .bin-chip--brown .bin-chip__dot{ background:#8b5e3c; }
      .bin-chip--black .bin-chip__dot{ background:#111827; }
      .bin-chip--green .bin-chip__dot{ background:#2f855a; }
      .bin-chip--blue .bin-chip__dot{ background:#2563eb; }
      @media (max-width: 720px){
        .home-bin-card{ grid-template-columns:1fr; }
        .home-bin-card__date{ min-height:unset; flex-direction:row; gap:10px; justify-content:flex-start; }
        .home-bin-card__day{ margin:0; font-size:1.5rem; }
      }
    `;
    document.head.appendChild(style);
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

  function formatMonthShort(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { month: 'short' });
  }

  function formatWeekdayShort(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function getDayNumber(value) {
    const d = parseDateValue(value);
    return d ? String(d.getDate()) : '';
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
    return match ? String(match[1]).trim() : 'General';
  }

  function getBinTone(name) {
    const n = normalizeText(name);
    if (n.includes('brown')) return 'brown';
    if (n.includes('black')) return 'black';
    if (n.includes('green')) return 'green';
    if (n.includes('blue')) return 'blue';
    return 'default';
  }

  function buildBinChip(name) {
    const label = esc(`${name} bin`);
    const tone = esc(getBinTone(name));
    return `<span class="bin-chip bin-chip--${tone}"><span class="bin-chip__dot" aria-hidden="true"></span><span>${label}</span></span>`;
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

    const primaryName = getBinName(primary);
    const primaryChip = buildBinChip(primaryName);
    let statusLabel = 'Next collection';
    let statusClass = '';
    let title = `${primaryName} bin collection`;
    let lead = `${formatLongDate(primary.__binDate)} collection scheduled.`;

    if (todayItem) {
      primary = todayItem;
      statusLabel = 'Today';
      statusClass = '';
      title = `${getBinName(todayItem)} bin collection today`;
      lead = `${formatLongDate(todayItem.__binDate)} collection is today.`;
    } else if (yesterdayItem) {
      primary = yesterdayItem;
      statusLabel = 'Completed';
      statusClass = ' home-bin-card__status--done';
      title = `${getBinName(yesterdayItem)} bin collection completed`;
      lead = `${formatLongDate(yesterdayItem.__binDate)} collection completed.`;
    }

    const nextHtml = nextItem
      ? `
        <div class="home-bin-card__next">
          <div class="home-bin-card__next-label">Next collection</div>
          <div class="home-bin-card__next-title">${buildBinChip(getBinName(nextItem))}</div>
          <div class="home-bin-card__next-date">${esc(formatLongDate(nextItem.__binDate))}</div>
        </div>`
      : '';

    injectBinCardStyles();

    return [{
      id: `bin_summary_${primary.id || primary.__binDate.getTime()}`,
      title,
      message: lead,
      category: '',
      home: primary.home,
      createdAt: primary.createdAt,
      _displayVariant: 'info',
      _displayMeta: '',
      _displayBadge: '',
      _displayCustomHtml: `
        <article class="home-bin-card" aria-label="Bin collection notice">
          <div class="home-bin-card__date" aria-hidden="true">
            <div class="home-bin-card__dow">${esc(formatWeekdayShort(primary.__binDate))}</div>
            <div class="home-bin-card__day">${esc(getDayNumber(primary.__binDate))}</div>
            <div class="home-bin-card__month">${esc(formatMonthShort(primary.__binDate))}</div>
          </div>
          <div class="home-bin-card__body">
            <div class="home-bin-card__eyebrow">♻️ Panda Waste</div>
            <div class="home-bin-card__status${statusClass}">${esc(statusLabel)}</div>
            <h4 class="home-bin-card__title">${primaryChip}</h4>
            <p class="home-bin-card__lead">${esc(lead)}</p>
            ${nextHtml}
          </div>
        </article>`
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
      if (it?._displayCustomHtml) return it._displayCustomHtml;

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
              ${visibility ? `<span class="home-notice-card__badge">${visibility}</span>` : ''}
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

  function isExpired(n) {
    const raw = n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || n?.showUntil || '';
    const exp = raw ? Date.parse(raw) : NaN;
    return !Number.isNaN(exp) && exp < Date.now();
  }

  function isNotStarted(n) {
    const raw = n?.startsAt || n?.startsOn || n?.startDate || n?.showFrom || '';
    const st = raw ? Date.parse(raw) : NaN;
    return !Number.isNaN(st) && st > Date.now();
  }

  function isPublicHome(n) {
    return !!(n && n.home && n.home.enabled) && String(n?.home?.visibility || 'private').toLowerCase() === 'public';
  }

  function isPrivateHome(n) {
    return !!(n && n.home && n.home.enabled) && String(n?.home?.visibility || 'private').toLowerCase() !== 'public';
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
      .filter(n => !isExpired(n))
      .filter(n => !isNotStarted(n))
      .filter(n => isPrivateHome(n))
      .filter(n => noticeMatchesUser(n, me));
  }

  async function main() {
    try {
      const publicItems = (await loadPublicNotices())
        .filter(n => !isExpired(n))
        .filter(n => isPublicHome(n));

      const privateItems = await loadPrivateNoticesForLoggedUser();

      const publicBinItems = publicItems.filter(isBinNotice);
      const publicRegularItems = publicItems.filter(n => !isBinNotice(n)).filter(n => !isNotStarted(n));

      const binSummary = buildBinSummary(publicBinItems);

      const seen = new Set();
      const merged = [...binSummary, ...publicRegularItems, ...privateItems]
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
