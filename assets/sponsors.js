/**
 * Aderrig NW — Community Supporters auto-rotation
 * ------------------------------------------------
 * Drop sponsor logos into:  assets/sponsors/
 * Naming convention (recommended, contiguous):
 *   sponsor1.webp, sponsor2.webp, sponsor3.webp ...
 * Supported extensions: webp, png, jpg, jpeg, svg
 *
 * Placeholders (optional, per page):
 *   <div id="sponsorsFooter" class="sponsors sponsors--footer"></div>
 *   <div id="sponsorsDashboard" class="sponsors sponsors--dash"></div>
 *   <div id="sponsorsAll" class="sponsors sponsors--grid"></div>
 *   <div id="sponsorsPage" class="sponsors"></div>  // "1 logo here" slot
 */
(function(){
  'use strict';

  const CONFIG = {
    baseDir: 'assets/sponsors/',
    prefix: 'sponsor',
    exts: ['webp','png','jpg','jpeg','svg'],
    maxIndex: 60,
    stopAfterMisses: 5,  // keep numbering contiguous for best performance
    footerCount: 4,
    pageCount: 1,
    sessionCount: 1,
    allLimit: 999,
    linkTo: null         // optionally set to "about.html#supporters"
  };

  function shuffle(arr){
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function urlExists(url){
    try{
      const r = await fetch(url, { method:'HEAD', cache:'force-cache' });
      if (r.ok) return true;
      const r2 = await fetch(url, { method:'GET', cache:'force-cache' });
      return r2.ok;
    }catch(e){
      return false;
    }
  }

  async function discoverSponsors(){
    const found = [];
    let missesInARow = 0;

    for (let i = 1; i <= CONFIG.maxIndex; i++){
      let hit = null;

      for (const ext of CONFIG.exts){
        const url = CONFIG.baseDir + CONFIG.prefix + i + '.' + ext;
        // eslint-disable-next-line no-await-in-loop
        const ok = await urlExists(url);
        if (ok){
          hit = url;
          break;
        }
      }

      if (hit){
        found.push({ src: hit, alt: 'Community Sponsor ' + i });
        missesInARow = 0;
      }else{
        missesInARow++;
        if (missesInARow >= CONFIG.stopAfterMisses) break;
      }
    }
    return found;
  }

  function pickForSession(list, n){
    if (!list.length) return [];
    const key = 'anw_sponsor_session_pick_v1';
    try{
      const cached = sessionStorage.getItem(key);
      if (cached){
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) return parsed.slice(0, n);
      }
    }catch(e){}
    const picked = shuffle(list).slice(0, n);
    try{ sessionStorage.setItem(key, JSON.stringify(picked)); }catch(e){}
    return picked;
  }

  function escapeHtml(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function renderInto(el, items, titleText){
    if (!el || !items || !items.length) return;

    const title = titleText ? `<p class="sponsors-title">${escapeHtml(titleText)}</p>` : '';
    const note = `<p class="sponsors-note">Community Supporters help cover hosting and maintenance costs. Supporters have no access to reports, alerts, or resident data.</p>`;

    const logos = items.map((it) => {
      const img = `<img src="${it.src}" alt="${escapeHtml(it.alt || 'Community Sponsor')}" loading="lazy" decoding="async">`;
      const href = CONFIG.linkTo ? CONFIG.linkTo : (it.href || '');
      if (href){
        return `<a class="sponsor" href="${href}" target="_blank" rel="noopener noreferrer">${img}</a>`;
      }
      return `<span class="sponsor">${img}</span>`;
    }).join('');

    el.innerHTML = `${title}${note}<div class="sponsors-logos">${logos}</div>`;
  }

  async function init(){
    const elFooter = document.getElementById('sponsorsFooter');
    const elDash   = document.getElementById('sponsorsDashboard');
    const elAll    = document.getElementById('sponsorsAll');
    const elPage   = document.getElementById('sponsorsPage');

    if (!elFooter && !elDash && !elAll && !elPage) return;

    const sponsors = await discoverSponsors();
    if (!sponsors.length) return;

    if (elFooter){
      renderInto(elFooter, shuffle(sponsors).slice(0, CONFIG.footerCount), 'Community Supporters');
    }
    if (elPage){
      renderInto(elPage, shuffle(sponsors).slice(0, CONFIG.pageCount), 'Community Supporters');
    }
    if (elDash){
      renderInto(elDash, pickForSession(sponsors, CONFIG.sessionCount), 'Community Supporters');
    }
    if (elAll){
      renderInto(elAll, sponsors.slice(0, CONFIG.allLimit), 'Community Supporters');
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
