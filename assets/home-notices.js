/* =========================
   Home Notices section
   Production version
   - Shows Home + Public notices to everyone
   - Shows Home + Private notices to logged-in members when targeting matches
   - Condenses bin notices into one card
   - Members-only Misdelivered Mail board with fixed fields and 5-day expiry
   ========================= */

(function () {
  'use strict';

  const listEl = document.getElementById('homeNoticeList');
  const sectionEl = document.getElementById('homeNoticesSection');
  if (!listEl || !sectionEl) return;

  const mailBoardEl = document.getElementById('misdeliveredMailBoard');
  const mailListEl = document.getElementById('misdeliveredMailList');
  const mailFormEl = document.getElementById('misdeliveredMailForm');
  const mailMsgEl = document.getElementById('misdeliveredMailMsg');
  const mailToggleBtn = document.getElementById('mailBoardToggleBtn');
  const mailCancelBtn = document.getElementById('mailBoardCancelBtn');
  const mailTypeEl = document.getElementById('mailItemType');
  const mailDeliveredEl = document.getElementById('mailDeliveredAddress');
  const mailCorrectEl = document.getElementById('mailCorrectAddress');

  const STORE_URL = '/.netlify/functions/store';
  const PUBLIC_URL = '/.netlify/functions/public-notices';
  const KEY_NOTICES = (window.ANW_KEYS && window.ANW_KEYS.NOTICES) || 'anw_notices';
  const MAIL_NOTICE_TYPE = 'misdelivered_mail';
  const MAIL_VISIBLE_DAYS = 5;

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

  function injectMailBoardStyles() {
    if (document.getElementById('anw-mail-board-styles')) return;
    const style = document.createElement('style');
    style.id = 'anw-mail-board-styles';
    style.textContent = `
      .mail-board{
        margin-top:18px;
        padding-top:14px;
        border-top:1px solid rgba(15,23,42,.08);
      }
      .mail-board__top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        margin-bottom:10px;
      }
      .mail-board__heading{
        min-width:0;
      }
      .mail-board__title{
        margin:0 0 2px;
        font-size:1rem;
        font-weight:900;
        color:#1f2937;
      }
      .mail-board__intro{
        margin:0;
        color:#64748b;
        font-size:.92rem;
        line-height:1.4;
      }
      .mail-board__add-btn{
        flex:0 0 auto;
        height:34px;
        padding:0 12px;
        border-radius:999px;
        font-size:.9rem;
        font-weight:800;
        white-space:nowrap;
      }
      .mail-board__form-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
      }
      .mail-board__form{
        margin:8px 0 12px;
        padding:12px;
        border:1px solid rgba(15,23,42,.10);
        border-radius:12px;
        background:#f8fbfa;
      }
      .mail-board__form-grid{
        display:grid;
        grid-template-columns:130px minmax(220px,1fr) minmax(220px,1fr);
        gap:10px;
      }
      .mail-board__field{ display:flex; flex-direction:column; gap:6px; font-weight:700; color:#1f2937; }
      .mail-board__field span{ font-size:.88rem; }
      .mail-board__hint{ margin:8px 0 0; }
      .mail-board__table{
        border:1px solid rgba(15,23,42,.10);
        border-radius:14px;
        overflow:hidden;
        background:#fff;
      }
      .mail-board__row,
      .mail-board__head{
        display:grid;
        grid-template-columns:92px minmax(170px,1.2fr) minmax(170px,1.25fr) 118px 165px;
        gap:10px;
        align-items:center;
        padding:9px 12px;
      }
      .mail-board__head{
        background:#17324d;
        color:#fff;
        font-size:.78rem;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.03em;
      }
      .mail-board__row{ border-top:1px solid rgba(15,23,42,.08); }
      .mail-board__row:first-of-type{ border-top:none; }
      .mail-board__cell{ min-width:0; color:#1f2937; }
      .mail-board__cell strong{ font-weight:800; }
      .mail-board__type{
        display:inline-flex;
        align-items:center;
        gap:6px;
        font-weight:800;
      }
      .mail-board__type-icon{ font-size:.95rem; }
      .mail-board__status{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:4px 8px;
        border-radius:999px;
        background:#eef6f1;
        color:#1f6f4a;
        font-weight:800;
        font-size:.78rem;
        line-height:1.15;
        white-space:nowrap;
      }
      .mail-board__row-actions{
        display:inline-flex;
        gap:6px;
        flex-wrap:nowrap;
        align-items:center;
        white-space:nowrap;
      }
      .mail-board__small-btn{
        border:1px solid rgba(15,23,42,.12);
        background:#fff;
        color:#17324d;
        border-radius:999px;
        padding:5px 9px;
        font-weight:800;
        font-size:.78rem;
        line-height:1.1;
        cursor:pointer;
        min-height:28px;
        white-space:nowrap;
      }
      .mail-board__small-btn:hover{
        background:#f8fafc;
      }
      .mail-board__empty{
        padding:12px;
        color:#475569;
        font-size:.92rem;
      }
      .mail-board__meta{
        font-size:.78rem;
        color:#94a3b8;
      }
      @media (max-width: 1040px){
        .mail-board__row,
        .mail-board__head{
          grid-template-columns:92px minmax(160px,1fr) minmax(160px,1fr) 110px 150px;
          gap:8px;
          padding:8px 10px;
        }
        .mail-board__small-btn{
          padding:4px 8px;
          font-size:.74rem;
        }
      }
      @media (max-width: 860px){
        .mail-board__top{
          flex-direction:column;
          align-items:flex-start;
        }
        .mail-board__form-grid{ grid-template-columns:1fr; }
        .mail-board__head{ display:none; }
        .mail-board__row{
          grid-template-columns:1fr;
          gap:7px;
          padding:10px 12px;
        }
        .mail-board__cell::before{
          content:attr(data-label);
          display:block;
          margin-bottom:3px;
          font-size:.74rem;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.04em;
          color:#64748b;
        }
        .mail-board__row-actions{ flex-wrap:wrap; }
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
  function normEmail(v){ return String(v||'').trim().toLowerCase(); }

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

  function formatDateShort(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
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

  function isMisdeliveredMailNotice(it) {
    return normalizeText(it?.meta?.type) === MAIL_NOTICE_TYPE || normalizeText(it?.category) === MAIL_NOTICE_TYPE;
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
      } else if (latestCompleted) {
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

  async function getIdentityToken() {
    if (!window.netlifyIdentity) return null;
    const user = window.netlifyIdentity.currentUser();
    if (!user) return null;
    try { return await user.jwt(); } catch { return null; }
  }

  function getStreetName(address){
    const a = String(address||'').trim();
    if(!a) return '';
    let s = a.replace(/[A-Z]\d{2}\s?[A-Z0-9]{4}\b/gi, '').replace(/\s{2,}/g,' ').trim();
    s = (s.split(',')[0] || s).trim();
    s = s.replace(/^\s*\d+[A-Za-z]?\s+/, '').trim();
    return s;
  }

  function normEir(v){ return String(v||'').replace(/\s+/g,'').toUpperCase(); }
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

  function getLoggedUserProfile() {
    try {
      const raw = localStorage.getItem('anw_logged');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email) return parsed;
      }
    } catch {}
    const currentUser = window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function'
      ? window.netlifyIdentity.currentUser()
      : null;
    if (currentUser && currentUser.email) {
      return { email: currentUser.email, role: 'resident' };
    }
    return null;
  }

  async function loadAllNoticesForLoggedUser() {
    const token = await getIdentityToken();
    if (!token) return { me: null, items: [] };
    if (typeof window.anwInitStore === 'function') {
      try { await window.anwInitStore(); } catch {}
    }
    const me = getLoggedUserProfile();
    if (!me || !me.email) return { me: null, items: [] };

    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    const all = Array.isArray(data?.value) ? data.value : (Array.isArray(data) ? data : []);
    return { me, items: all };
  }

  async function saveAllNotices(items) {
    const token = await getIdentityToken();
    if (!token) throw new Error('Please log in again and retry.');
    const res = await fetch(`${STORE_URL}?key=${encodeURIComponent(KEY_NOTICES)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(Array.isArray(items) ? items : [])
    });
    if (!res.ok) {
      let message = '';
      try { message = await res.text(); } catch {}
      throw new Error(message || `Unable to save notices (${res.status}).`);
    }
    return await res.json().catch(() => ({}));
  }

  function getNoticeSortValue(it){
    if (typeof it?._sortTs === 'number') return it._sortTs;
    const fromDate = parseDateValue(it?.date || it?.startDate || it?.startsOn || it?.createdAt || null);
    return fromDate ? fromDate.getTime() : 0;
  }

  function normalizeAddress(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getMailTypeMeta(value) {
    const key = normalizeText(value);
    if (key === 'parcel') return { icon: '📦', label: 'Parcel' };
    if (key === 'envelope') return { icon: '✉️', label: 'Envelope' };
    return { icon: '📄', label: 'Letter' };
  }

  function getMailStatusLabel(value) {
    const key = normalizeText(value);
    if (key === 'collected') return 'Collected';
    if (key === 'returned_to_sender') return 'Returned to sender';
    if (key === 'expired') return 'Expired';
    return 'Not collected';
  }

  function buildMailMessage(itemType, deliveredAddress, intendedAddress) {
    const typeMeta = getMailTypeMeta(itemType);
    return `${typeMeta.label} delivered at ${deliveredAddress}. Correct address: ${intendedAddress}.`;
  }

  function buildMailNotice(itemType, deliveredAddress, intendedAddress, createdBy) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAIL_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
    return {
      id: `mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: 'Misdelivered mail',
      message: buildMailMessage(itemType, deliveredAddress, intendedAddress),
      category: MAIL_NOTICE_TYPE,
      createdAt: now.toISOString(),
      createdBy: normEmail(createdBy || ''),
      expiresAt: expiresAt.toISOString(),
      status: 'not_collected',
      home: {
        enabled: true,
        visibility: 'private'
      },
      target: {
        include: { allLoggedIn: true },
        exclude: {}
      },
      meta: {
        type: MAIL_NOTICE_TYPE,
        itemType: normalizeText(itemType),
        deliveredAddress,
        intendedAddress
      }
    };
  }

  function isMailActive(it) {
    return isMisdeliveredMailNotice(it) && normalizeText(it?.status || 'not_collected') === 'not_collected' && !isExpired(it);
  }

  function setMailBoardMessage(message, kind) {
    if (!mailMsgEl) return;
    mailMsgEl.textContent = String(message || '');
    mailMsgEl.style.color = kind === 'error' ? '#b91c1c' : '#1f6f4a';
  }

  function toggleMailForm(show) {
    if (!mailFormEl) return;
    mailFormEl.hidden = !show;
    if (mailToggleBtn) mailToggleBtn.hidden = !!show;
    if (show) {
      mailTypeEl?.focus();
    }
  }

  function resetMailForm() {
    if (mailFormEl) mailFormEl.reset();
    setMailBoardMessage('', 'ok');
    toggleMailForm(false);
  }

  async function syncExpiredMailNotices(allItems) {
    const items = Array.isArray(allItems) ? allItems.slice() : [];
    let changed = false;
    const next = items.map((item) => {
      if (!isMisdeliveredMailNotice(item)) return item;
      if (normalizeText(item?.status || 'not_collected') !== 'not_collected') return item;
      if (!isExpired(item)) return item;
      changed = true;
      return { ...item, status: 'expired', expiredAt: new Date().toISOString() };
    });
    if (changed) {
      try { await saveAllNotices(next); } catch {}
      return next;
    }
    return items;
  }

  function renderMailBoard(items, me) {
    if (!mailBoardEl || !mailListEl) return;
    injectMailBoardStyles();
    mailBoardEl.hidden = !me;
    if (!me) return;

    const mailItems = (Array.isArray(items) ? items : [])
      .filter(isMailActive)
      .sort((a, b) => getNoticeSortValue(b) - getNoticeSortValue(a));

    if (!mailItems.length) {
      mailListEl.innerHTML = `<div class="mail-board__empty">No active entries right now.</div>`;
      return;
    }

    const rows = mailItems.map((item) => {
      const meta = item?.meta || {};
      const typeMeta = getMailTypeMeta(meta.itemType);
      const deliveredAddress = esc(meta.deliveredAddress || '—');
      const intendedAddress = esc(meta.intendedAddress || '—');
      const mine = normEmail(item?.createdBy) === normEmail(me?.email);
      const actions = mine
        ? `<div class="mail-board__row-actions">
            <button class="mail-board__small-btn" type="button" data-mail-action="collected" data-mail-id="${esc(item.id)}">Collected</button>
            <button class="mail-board__small-btn" type="button" data-mail-action="returned_to_sender" data-mail-id="${esc(item.id)}">Returned to sender</button>
          </div>`
        : `<div class="mail-board__meta"></div>`;

      return `
        <div class="mail-board__row">
          <div class="mail-board__cell" data-label="Type">
            <span class="mail-board__type"><span class="mail-board__type-icon" aria-hidden="true">${typeMeta.icon}</span><span>${esc(typeMeta.label)}</span></span>
          </div>
          <div class="mail-board__cell" data-label="Delivered at"><strong>${deliveredAddress}</strong></div>
          <div class="mail-board__cell" data-label="Correct address"><strong>${intendedAddress}</strong></div>
          <div class="mail-board__cell" data-label="Status"><span class="mail-board__status">${esc(getMailStatusLabel(item.status))}</span></div>
          <div class="mail-board__cell" data-label="Action">${actions}</div>
        </div>
      `;
    }).join('');

    mailListEl.innerHTML = `
      <div class="mail-board__head">
        <div>Type</div>
        <div>Delivered at</div>
        <div>Correct address</div>
        <div>Status</div>
        <div>Action</div>
      </div>
      ${rows}
    `;

    Array.from(mailListEl.querySelectorAll('[data-mail-action][data-mail-id]')).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = String(btn.getAttribute('data-mail-action') || '');
        const noticeId = String(btn.getAttribute('data-mail-id') || '');
        if (!action || !noticeId) return;
        btn.disabled = true;
        try {
          setMailBoardMessage('Saving update…', 'ok');
          const state = await loadAllNoticesForLoggedUser();
          const next = state.items.map((item) => {
            if (String(item?.id || '') !== noticeId) return item;
            if (normEmail(item?.createdBy) !== normEmail(state?.me?.email)) return item;
            return {
              ...item,
              status: action,
              resolvedAt: new Date().toISOString()
            };
          });
          await saveAllNotices(next);
          setMailBoardMessage('Entry updated.', 'ok');
          await refreshMailBoardOnly();
        } catch (err) {
          setMailBoardMessage(err?.message || 'Unable to update this entry.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function refreshMailBoardOnly() {
    const state = await loadAllNoticesForLoggedUser();
    if (!state.me) {
      if (mailBoardEl) mailBoardEl.hidden = true;
      return;
    }
    const synced = await syncExpiredMailNotices(state.items);
    const visible = synced.filter((n) => !isNotStarted(n)).filter((n) => isPrivateHome(n)).filter((n) => noticeMatchesUser(n, state.me));
    renderMailBoard(visible, state.me);
  }

  function bindMailBoardEvents() {
    if (mailToggleBtn && !mailToggleBtn.dataset.bound) {
      mailToggleBtn.dataset.bound = '1';
      mailToggleBtn.addEventListener('click', () => {
        setMailBoardMessage('', 'ok');
        toggleMailForm(true);
      });
    }

    if (mailCancelBtn && !mailCancelBtn.dataset.bound) {
      mailCancelBtn.dataset.bound = '1';
      mailCancelBtn.addEventListener('click', () => {
        resetMailForm();
      });
    }

    if (mailFormEl && !mailFormEl.dataset.bound) {
      mailFormEl.dataset.bound = '1';
      mailFormEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        const itemType = normalizeText(mailTypeEl?.value || '');
        const deliveredAddress = normalizeAddress(mailDeliveredEl?.value || '');
        const intendedAddress = normalizeAddress(mailCorrectEl?.value || '');
        if (!itemType || !deliveredAddress || !intendedAddress) {
          setMailBoardMessage('Please complete all fields.', 'error');
          return;
        }
        if (deliveredAddress.toLowerCase() === intendedAddress.toLowerCase()) {
          setMailBoardMessage('Delivered at and correct address must be different.', 'error');
          return;
        }

        const submitBtn = mailFormEl.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          setMailBoardMessage('Publishing entry…', 'ok');
          const state = await loadAllNoticesForLoggedUser();
          if (!state.me || !state.me.email) throw new Error('Please log in again and retry.');
          const next = Array.isArray(state.items) ? state.items.slice() : [];
          next.push(buildMailNotice(itemType, deliveredAddress, intendedAddress, state.me.email));
          await saveAllNotices(next);
          resetMailForm();
          setMailBoardMessage('Entry published.', 'ok');
          await refreshMailBoardOnly();
        } catch (err) {
          setMailBoardMessage(err?.message || 'Unable to publish this entry.', 'error');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  async function main() {
    try {
      bindMailBoardEvents();

      const publicItems = (await loadPublicNotices())
        .filter(n => !isExpired(n))
        .filter(n => isPublicHome(n))
        .filter(n => !isMisdeliveredMailNotice(n));

      const privateState = await loadAllNoticesForLoggedUser();
      const privateItemsRaw = privateState.me
        ? privateState.items
            .filter(n => !isExpired(n))
            .filter(n => !isNotStarted(n))
            .filter(n => isPrivateHome(n))
            .filter(n => noticeMatchesUser(n, privateState.me))
        : [];

      const syncedItems = privateState.me ? await syncExpiredMailNotices(privateState.items) : privateState.items;
      const privateItems = privateState.me
        ? syncedItems
            .filter(n => !isExpired(n))
            .filter(n => !isNotStarted(n))
            .filter(n => isPrivateHome(n))
            .filter(n => noticeMatchesUser(n, privateState.me))
        : privateItemsRaw;

      const publicBinItems = publicItems.filter(isBinNotice);
      const publicRegularItems = publicItems.filter(n => !isBinNotice(n));
      const privateRegularItems = privateItems.filter(n => !isMisdeliveredMailNotice(n));

      const binSummary = buildBinSummary(publicBinItems);

      const seen = new Set();
      const merged = [...binSummary, ...publicRegularItems, ...privateRegularItems]
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
      renderMailBoard(privateItems, privateState.me);
    } catch (err) {
      console.error('home-notices.js failed:', err);
      renderPlaceholder();
      if (mailBoardEl) mailBoardEl.hidden = true;
    }
  }

  main();
})();
