/* =========================
   Home Notices section
   Production version
   - Shows Home + Public notices to everyone
   - Shows Home + Private notices to logged-in members when targeting matches
   - Condenses bin notices into one card
   - Bin card shows: completed this week + next week
   - Adds Misdelivered Mail board for logged-in members only
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
      .home-bin-card__dow{ font-size:.82rem; font-weight:800; letter-spacing:.04em; text-transform:uppercase; opacity:.92; }
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
      .home-bin-card__title{ margin:0 0 8px; font-size:1.35rem; line-height:1.2; font-weight:900; color:#1f2937; }
      .home-bin-card__lead{ margin:0; font-size:1rem; line-height:1.55; color:#334155; }
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

  function injectMisdeliveredMailStyles() {
    if (document.getElementById('anw-mail-board-styles')) return;
    const style = document.createElement('style');
    style.id = 'anw-mail-board-styles';
    style.textContent = `
      .mail-board-card{
        padding:14px 0 0;
        border-top:1px solid rgba(17,24,39,.08);
        max-width:100%;
        overflow:hidden;
      }
      .mail-board-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin:0 0 6px;
      }
      .mail-board-title{
        margin:0;
        font-size:1rem;
        line-height:1.25;
        font-weight:800;
        color:#1f2937;
        display:flex;
        align-items:center;
        gap:8px;
      }
      .mail-board-sub{
        margin:0 0 10px;
        font-size:.95rem;
        color:#64748b;
      }
      .mail-board-add{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:32px;
        padding:0 10px;
        border-radius:999px;
        border:1px solid rgba(31,111,74,.28);
        background:#fff;
        color:#1f6f4a;
        font-size:.84rem;
        font-weight:700;
        cursor:pointer;
        white-space:nowrap;
        flex:0 0 auto;
      }
      .mail-board-add:hover{ background:rgba(31,111,74,.05); }

      .mail-board-grid{
        width:100%;
        max-width:100%;
        border:1px solid rgba(17,24,39,.08);
        border-radius:14px;
        background:#fff;
        overflow-x:auto;
        overflow-y:hidden;
        box-sizing:border-box;
      }

      .mail-board-header,
      .mail-board-row{
        display:grid;
        grid-template-columns:84px minmax(140px,1fr) minmax(160px,1fr) 112px 210px;
        gap:10px;
        align-items:center;
        padding:10px 12px;
        min-width: 740px;
        box-sizing:border-box;
      }

      .mail-board-header{
        background:#f8fafc;
        color:#475569;
        font-size:.88rem;
        font-weight:700;
      }

      .mail-board-row{
        border-top:1px solid rgba(17,24,39,.08);
        color:#475569;
        font-size:.95rem;
      }

      .mail-board-cell{
        min-width:0;
      }

      .mail-board-row .mail-board-cell{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }

      .mail-board-type{
        display:inline-flex;
        align-items:center;
        gap:8px;
        color:#334155;
      }

      .mail-board-type-icon{
        font-size:1rem;
        opacity:.9;
      }

      .mail-board-status{
        display:inline-flex;
        align-items:center;
        justify-content:flex-start;
      }

      .mail-pill{
        display:inline-flex;
        align-items:center;
        min-height:26px;
        padding:0 9px;
        border-radius:999px;
        background:#edf7f0;
        color:#1f6f4a;
        font-size:.8rem;
        font-weight:700;
        white-space:nowrap;
      }

      .mail-board-actions{
        display:flex;
        align-items:center;
        justify-content:flex-start;
        gap:5px;
        flex-wrap:nowrap;
        min-width:0;
        overflow:hidden;
      }

      .mail-action-btn{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-height:26px;
        padding:0 6px;
        border-radius:999px;
        border:1px solid rgba(17,24,39,.12);
        background:#fff;
        color:#334155;
        font-size:.68rem;
        font-weight:700;
        line-height:1;
        white-space:nowrap;
        cursor:pointer;
        flex:0 0 auto;
      }

      .mail-action-btn:hover{
        background:#f8fafc;
      }

      .mail-action-btn--owner{
        border-color:rgba(185,28,28,.18);
        color:#b91c1c;
      }

      .mail-board-empty{
        padding:12px 14px;
        color:#64748b;
        font-size:.95rem;
      }

      @media (max-width: 860px){
        .mail-board-head{
          align-items:flex-start;
        }
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

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      const [m, d, y] = raw.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function startOfDay(value) {
    const d = parseDateValue(value);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function formatLongDate(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString('en-IE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function formatMonthShort(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString('en-IE', { month: 'short' });
  }

  function formatWeekdayShort(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString('en-IE', { weekday: 'short' });
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
    return startOfDay(
      it?.date ||
      it?.collectionDate ||
      it?.meta?.collectionDate ||
      it?.meta?.date ||
      it?.startsOn ||
      it?.startDate ||
      it?.startsAt ||
      it?.endsOn ||
      it?.endDate ||
      null
    );
  }

  function startOfWeek(value) {
    const d = startOfDay(value);
    if (!d) return null;
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }

  function endOfWeek(value) {
    const d = startOfWeek(value);
    if (!d) return null;
    d.setDate(d.getDate() + 6);
    return d;
  }

  function addDays(value, days) {
    const d = startOfDay(value);
    if (!d) return null;
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  function isWithinRange(value, start, end) {
    const d = startOfDay(value);
    const s = startOfDay(start);
    const e = startOfDay(end);
    return !!(d && s && e && d.getTime() >= s.getTime() && d.getTime() <= e.getTime());
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
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);
    const nextWeekStart = addDays(weekEnd, 1);
    const nextWeekEnd = addDays(nextWeekStart, 6);

    const thisWeekItems = dated.filter((it) => isWithinRange(it.__binDate, weekStart, weekEnd));
    const nextWeekItems = dated.filter((it) => isWithinRange(it.__binDate, nextWeekStart, nextWeekEnd));
    const futureItems = dated.filter((it) => it.__binDate.getTime() >= today.getTime());
    const pastItems = dated.filter((it) => it.__binDate.getTime() < today.getTime());

    const todayItem = dated.find((it) => it.__binDate.getTime() === today.getTime()) || null;
    const completedThisWeekItem = thisWeekItems
      .filter((it) => it.__binDate.getTime() < today.getTime())
      .slice(-1)[0] || null;

    const thisWeekUpcoming = thisWeekItems
      .filter((it) => it.__binDate.getTime() > today.getTime())[0] || null;

    const nextWeekUpcoming = nextWeekItems[0] || null;
    const fallbackUpcoming = futureItems
      .filter((it) => it.__binDate.getTime() > today.getTime())[0] || null;

    const latestCompleted = pastItems[pastItems.length - 1] || null;

    const primary = todayItem || thisWeekUpcoming || nextWeekUpcoming || fallbackUpcoming || latestCompleted || dated[dated.length - 1];
    if (!primary) return [];

    const primaryName = getBinName(primary);
    const primaryChip = buildBinChip(primaryName);

    const lines = [];
    let lead = '';
    let eyebrow = '♻️ Panda Waste';

    if (todayItem) {
      lead = `Today is your ${getBinName(todayItem)} bin collection day. Please leave your bin out and make sure it is secure so it does not open and leave litter on the pavement or road.`;
      eyebrow = '🚛 Collection today';
    } else {
      if (thisWeekUpcoming) {
        lines.push(`This week: ${getBinName(thisWeekUpcoming)} bin on ${formatLongDate(thisWeekUpcoming.__binDate)}.`);
      } else if (nextWeekUpcoming) {
        lines.push(`Next week: ${getBinName(nextWeekUpcoming)} bin on ${formatLongDate(nextWeekUpcoming.__binDate)}.`);
      } else if (fallbackUpcoming) {
        lines.push(`Next collection: ${getBinName(fallbackUpcoming)} bin on ${formatLongDate(fallbackUpcoming.__binDate)}.`);
      }

      if (completedThisWeekItem) {
        lines.push(`Completed this week: ${getBinName(completedThisWeekItem)} bin on ${formatLongDate(completedThisWeekItem.__binDate)}.`);
      } else if (latestCompleted && !lines.length) {
        lines.push(`Last collection: ${getBinName(latestCompleted)} bin on ${formatLongDate(latestCompleted.__binDate)}.`);
      } else if (latestCompleted && lines.length) {
        lines.push(`Last collection: ${getBinName(latestCompleted)} bin on ${formatLongDate(latestCompleted.__binDate)}.`);
      }

      lead = lines.join(' ');
    }

    if (!lead) return [];

    injectBinCardStyles();

    return [{
      id: `bin_summary_${primary.id || primary.__binDate.getTime()}`,
      title: `${primaryName} bin`,
      message: lead,
      category: '',
      home: primary.home,
      createdAt: primary.createdAt || primary.date,
      _sortTs: primary.__binDate.getTime(),
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
            <div class="home-bin-card__eyebrow">${esc(eyebrow)}</div>
            <h4 class="home-bin-card__title">${primaryChip}</h4>
            <p class="home-bin-card__lead">${esc(lead)}</p>
          </div>
        </article>`
    }];
  }

  function getLoggedProfile(){
    try{
      const raw = localStorage.getItem('anw_logged');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email) return parsed;
      }
    }catch(_){}

    try{
      const user = window.netlifyIdentity && window.netlifyIdentity.currentUser
        ? window.netlifyIdentity.currentUser()
        : null;
      if (!user) return null;

      const appMeta = user.app_metadata || {};
      const userMeta = user.user_metadata || {};

      return {
        email: user.email || '',
        role: userMeta.role || appMeta.role || 'resident',
        roles: []
          .concat(Array.isArray(userMeta.roles) ? userMeta.roles : [])
          .concat(Array.isArray(appMeta.roles) ? appMeta.roles : [])
          .filter(Boolean),
        eircode: userMeta.eircode || '',
        address: userMeta.address || userMeta.fullAddress || ''
      };
    }catch(_){
      return null;
    }
  }

  function normEmail(v){ return String(v||'').trim().toLowerCase(); }

  function getLoggedEmail(){
    const me = getLoggedProfile();
    return normEmail(me && me.email);
  }

  function getLoggedRoles(){
    const me = getLoggedProfile() || {};
    const list = [];
    if (me.role) list.push(String(me.role));
    if (Array.isArray(me.roles)) list.push(...me.roles.map(String));
    return list.map(v => String(v || '').toLowerCase()).filter(Boolean);
  }

  function hasOwnerAccess(){
    const roles = getLoggedRoles();
    return roles.includes('owner') || roles.includes('admin');
  }

  function isMisdeliveredMailNotice(it){
    const cat = normalizeText(it?.category);
    const type = normalizeText(it?.meta?.type);
    return cat === 'misdelivered_mail' || type === 'misdelivered_mail';
  }

  function getMailItemType(it){
    return String(it?.meta?.itemType || 'Letter').trim() || 'Letter';
  }

  function getMailIcon(type){
    const t = normalizeText(type);
    if (t.includes('parcel')) return '📦';
    if (t.includes('envelope')) return '✉️';
    return '📄';
  }

  function formatMailType(type){
    const raw = String(type || '').trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Letter';
  }

  function getMailExpiryIso(it){
    const direct = parseDateValue(it?.expiresAt || it?.expires || it?.endDate || it?.endsOn || '');
    if (direct) return direct.toISOString();
    const created = parseDateValue(it?.createdAt || it?.updatedAt || '');
    if (!created) return '';
    const d = new Date(created.getTime());
    d.setDate(d.getDate() + 5);
    return d.toISOString();
  }

  function isMailOpen(it){
    const status = normalizeText(it?.mailStatus || it?.status || 'not_collected');
    if (['collected','returned_to_sender','expired','deleted','removed'].includes(status)) return false;
    const exp = parseDateValue(getMailExpiryIso(it));
    return !!(exp && exp.getTime() > Date.now());
  }

  function canManageMail(it){
    const mine = normEmail(it?.createdBy || it?.authorEmail || it?.createdByEmail) === getLoggedEmail();
    return mine;
  }

  function buildMisdeliveredMailBoard(items){
    const me = getLoggedProfile();
    if (!me || !me.email) return null;

    injectMisdeliveredMailStyles();

    const rows = (Array.isArray(items) ? items : []).map((it) => {
      const type = formatMailType(getMailItemType(it));
      const delivered = esc(it?.meta?.deliveredAddress || '');
      const correct = esc(it?.meta?.intendedAddress || '');
      const actions = [];

      if (canManageMail(it)) {
        actions.push(`<button type="button" class="mail-action-btn" data-mail-action="collected" data-mail-id="${esc(it.id || '')}">Collected</button>`);
        actions.push(`<button type="button" class="mail-action-btn" data-mail-action="returned" data-mail-id="${esc(it.id || '')}">Returned to sender</button>`);
      }

      if (hasOwnerAccess()) {
        actions.push(`<button type="button" class="mail-action-btn mail-action-btn--owner" data-mail-action="remove" data-mail-id="${esc(it.id || '')}">Remove</button>`);
      }

      return `
        <div class="mail-board-row">
          <div class="mail-board-cell"><span class="mail-board-type"><span class="mail-board-type-icon" aria-hidden="true">${getMailIcon(type)}</span><span>${esc(type)}</span></span></div>
          <div class="mail-board-cell">${delivered}</div>
          <div class="mail-board-cell">${correct}</div>
          <div class="mail-board-cell mail-board-status"><span class="mail-pill">Not collected</span></div>
          <div class="mail-board-cell"><div class="mail-board-actions">${actions.join('')}</div></div>
        </div>`;
    }).join('');

    const empty = `<div class="mail-board-empty">No active entries right now.</div>`;

    return {
      id: 'misdelivered_mail_board',
      createdAt: new Date().toISOString(),
      _sortTs: Date.now() - 1,
      _displayCustomHtml: `
        <section class="mail-board-card" aria-label="Misdelivered mail">
          <div class="mail-board-head">
            <h4 class="mail-board-title"><span aria-hidden="true">📬</span><span>Misdelivered Mail</span></h4>
            <button type="button" class="mail-board-add" data-mail-action="add">+ Add entry</button>
          </div>
          <p class="mail-board-sub">Members only. Show only where it was delivered and the correct address.</p>
          <div class="mail-board-grid">
            <div class="mail-board-header">
              <div>Type</div>
              <div>Delivered at</div>
              <div>Correct address</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            ${rows || empty}
          </div>
        </section>`
    };
  }

  async function getIdentityToken() {
    if (!window.netlifyIdentity) return null;
    const user = window.netlifyIdentity.currentUser();
    if (!user) return null;
    try { return await user.jwt(); } catch { return null; }
  }

  async function loadAllNoticesForEdit(){
    const token = await getIdentityToken();
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      headers,
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('Could not load notices.');
    const data = await res.json().catch(() => ([]));
    return Array.isArray(data?.value) ? data.value : (Array.isArray(data) ? data : []);
  }

  async function saveAllNotices(next){
    const token = await getIdentityToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(Array.isArray(next) ? next : [])
    });
    if (!res.ok) throw new Error('Could not save notices.');
    return true;
  }

  async function syncExpiredMisdeliveredMail(){
    try{
      const all = await loadAllNoticesForEdit();
      let changed = false;
      const now = Date.now();

      const next = all.map((it) => {
        if (!isMisdeliveredMailNotice(it)) return it;
        const status = normalizeText(it?.mailStatus || it?.status || 'not_collected');
        const exp = parseDateValue(getMailExpiryIso(it));

        if (status === 'not_collected' && exp && exp.getTime() <= now) {
          changed = true;
          return Object.assign({}, it, {
            expiresAt: exp.toISOString(),
            mailStatus: 'expired',
            status: 'expired',
            updatedAt: new Date().toISOString()
          });
        }
        return it;
      });

      if (changed) await saveAllNotices(next);
    }catch(err){
      console.warn('mail expiry sync failed', err);
    }
  }

  async function createMisdeliveredMailEntry(){
    const itemType = window.prompt('Item type: Letter, Envelope or Parcel', 'Letter');
    if (itemType == null) return;

    const deliveredAddress = window.prompt('Delivered at address', '');
    if (deliveredAddress == null || !String(deliveredAddress).trim()) return;

    const intendedAddress = window.prompt('Correct address on the item', '');
    if (intendedAddress == null || !String(intendedAddress).trim()) return;

    const me = getLoggedProfile();
    if (!me || !me.email) {
      window.alert('Please log in first.');
      return;
    }

    const all = await loadAllNoticesForEdit();
    const now = new Date();
    const expires = new Date(now.getTime());
    expires.setDate(expires.getDate() + 5);

    const entry = {
      id: `mail_${Date.now()}`,
      title: 'Misdelivered Mail',
      message: 'Misdelivered Mail',
      category: 'misdelivered_mail',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      published: true,
      showOnHome: true,
      status: 'not_collected',
      mailStatus: 'not_collected',
      createdBy: String(me.email || ''),
      target: { include: { allLoggedIn: true } },
      targets: { allLoggedIn: true },
      home: { enabled: true, visibility: 'private' },
      meta: {
        type: 'misdelivered_mail',
        itemType: formatMailType(itemType),
        deliveredAddress: String(deliveredAddress).trim(),
        intendedAddress: String(intendedAddress).trim()
      }
    };

    await saveAllNotices([entry].concat(all || []));
    await main();
  }

  async function updateMisdeliveredMailStatus(id, nextStatus){
    const all = await loadAllNoticesForEdit();
    const email = getLoggedEmail();

    const next = (all || []).map((it) => {
      if (String(it?.id || '') !== String(id || '')) return it;

      const mine = normEmail(it?.createdBy || '') === email;
      if (!mine) return it;

      return Object.assign({}, it, {
        mailStatus: nextStatus,
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
    });

    await saveAllNotices(next);
    await main();
  }

  async function removeMisdeliveredMail(id){
    if (!hasOwnerAccess()) return;

    const ok = window.confirm('Remove this entry?');
    if (!ok) return;

    const all = await loadAllNoticesForEdit();
    const next = (all || []).filter((it) => String(it?.id || '') !== String(id || ''));

    await saveAllNotices(next);
    await main();
  }

  listEl.addEventListener('click', async (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('[data-mail-action]') : null;
    if (!btn) return;

    const action = String(btn.getAttribute('data-mail-action') || '');
    const id = String(btn.getAttribute('data-mail-id') || '');

    try {
      if (action === 'add') {
        await createMisdeliveredMailEntry();
        return;
      }

      if (!id) return;

      if (action === 'collected') {
        await updateMisdeliveredMailStatus(id, 'collected');
        return;
      }

      if (action === 'returned') {
        await updateMisdeliveredMailStatus(id, 'returned_to_sender');
        return;
      }

      if (action === 'remove') {
        await removeMisdeliveredMail(id);
      }
    } catch (err) {
      console.error('mail action failed', err);
      window.alert('Could not update this mail entry right now.');
    }
  });

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
      const meta = String(it?._displayMeta || '').trim();

      return `
        <article class="home-notice-card home-notice-card--${variant}">
          <div class="home-notice-card__icon" aria-hidden="true">${ICONS[variant] || ICONS.info}</div>
          <div class="home-notice-card__body">
            <div class="home-notice-card__head">
              <h4 class="home-notice-card__title">${title}</h4>
            </div>
            <div class="home-notice-card__msg">${msgHtml}</div>
            ${meta ? `<div class="home-notice-card__meta">${esc(meta)}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

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
    const d = parseDateValue(n?.expiresAt || n?.endsOn || n?.endDate || n?.expires || n?.showUntil || '');
    return !!(d && d.getTime() < Date.now());
  }

  function isNotStarted(n) {
    const d = parseDateValue(n?.startsAt || n?.startsOn || n?.startDate || n?.showFrom || '');
    return !!(d && d.getTime() > Date.now());
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
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  async function loadPrivateNoticesForLoggedUser() {
    const token = await getIdentityToken();
    if (!token) return [];

    if (typeof window.anwInitStore === 'function') {
      try { await window.anwInitStore(); } catch {}
    }

    const me = getLoggedProfile();
    if (!me || !me.email) return [];

    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store'
    });

    const data = await res.json().catch(() => ({}));
    const all = Array.isArray(data?.value) ? data.value : (Array.isArray(data) ? data : []);

    return all
      .filter(n => !isExpired(n))
      .filter(n => !isNotStarted(n))
      .filter(n => isPrivateHome(n))
      .filter(n => noticeMatchesUser(n, me));
  }

  function getNoticeSortValue(it){
    if (typeof it?._sortTs === 'number') return it._sortTs;
    const fromDate = parseDateValue(it?.date || it?.startDate || it?.startsOn || it?.createdAt || null);
    return fromDate ? fromDate.getTime() : 0;
  }

  async function main() {
    try {
      await syncExpiredMisdeliveredMail();

      const publicItems = (await loadPublicNotices())
        .filter(n => !isExpired(n))
        .filter(n => isPublicHome(n));

      const privateItems = await loadPrivateNoticesForLoggedUser();

      const publicBinItems = publicItems.filter(isBinNotice);
      const publicRegularItems = publicItems
        .filter(n => !isBinNotice(n))
        .filter(n => !isMisdeliveredMailNotice(n))
        .filter(n => !isNotStarted(n));

      const privateMailItems = privateItems
        .filter(isMisdeliveredMailNotice)
        .filter(isMailOpen)
        .sort((a, b) => getNoticeSortValue(b) - getNoticeSortValue(a));

      const privateRegularItems = privateItems.filter(n => !isMisdeliveredMailNotice(n));

      const binSummary = buildBinSummary(publicBinItems);
      const mailBoard = buildMisdeliveredMailBoard(privateMailItems);

      const seen = new Set();
      const merged = [
        ...binSummary,
        ...publicRegularItems,
        ...(mailBoard ? [mailBoard] : []),
        ...privateRegularItems
      ]
        .filter(it => {
          const id = String(it?.id || '');
          if (!id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .sort((a, b) => getNoticeSortValue(b) - getNoticeSortValue(a))
        .slice(0, 8);

      render(merged);
    } catch (err) {
      console.error('home-notices.js failed:', err);
      renderPlaceholder();
    }
  }

  main();
})();
