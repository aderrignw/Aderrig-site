/* =========================================================
   Aderrig NW — Handbook (Resident view)
   - Renders categories as dashboard cards
   - Supports items of type: page | link
   Data shape (KV: anw_handbook):
   {
     categories: [
       { id, title, icon?, order?, isActive?, items:[ {id,title,type,summary,url,contentHtml,heroImage,attachments,updatedAt,isPublished} ] }
     ]
   }
   ========================================================= */

(function(){
  'use strict';

  const KEY = (window.ANW_KEYS && window.ANW_KEYS.HANDBOOK) ? window.ANW_KEYS.HANDBOOK : 'anw_handbook';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function byOrder(a,b){
    const ao = Number(a?.order ?? 9999);
    const bo = Number(b?.order ?? 9999);
    if(ao !== bo) return ao - bo;
    return String(a?.title||'').localeCompare(String(b?.title||''));
  }

  function getHashParams(){
    const h = String(location.hash||'').replace(/^#/, '');
    const p = new URLSearchParams(h);
    return {
      cat: p.get('cat') || '',
      item: p.get('item') || '',
      q: p.get('q') || ''
    };
  }

  function setHash(params){
    const p = new URLSearchParams();
    if(params.cat) p.set('cat', params.cat);
    if(params.item) p.set('item', params.item);
    if(params.q) p.set('q', params.q);
    const s = p.toString();
    location.hash = s ? ('#' + s) : '';
  }

  function normalizeHandbook(raw){
    const hb = (raw && typeof raw === 'object') ? raw : {};
    if(!Array.isArray(hb.categories)) hb.categories = [];
    hb.categories = hb.categories
      .filter(c => c && typeof c === 'object')
      .map(c => ({
        id: String(c.id || '').trim(),
        title: String(c.title || '').trim(),
        icon: c.icon ? String(c.icon) : '',
        order: Number.isFinite(Number(c.order)) ? Number(c.order) : 9999,
        isActive: (c.isActive === false) ? false : true,
        items: Array.isArray(c.items) ? c.items : []
      }))
      .filter(c => c.id && c.title)
      .sort(byOrder);

    hb.categories.forEach(c => {
      c.items = (c.items || [])
        .filter(it => it && typeof it === 'object')
        .map(it => ({
          id: String(it.id || '').trim(),
          title: String(it.title || '').trim(),
          type: (String(it.type || 'page').toLowerCase() === 'link') ? 'link' : 'page',
          summary: String(it.summary || '').trim(),
          url: String(it.url || '').trim(),
          heroImage: String(it.heroImage || '').trim(),
          contentHtml: String(it.contentHtml || '').trim(),
          attachments: Array.isArray(it.attachments) ? it.attachments : [],
          updatedAt: String(it.updatedAt || '').trim(),
          isPublished: (it.isPublished === false) ? false : true
        }))
        .filter(it => it.id && it.title)
        .sort((a,b)=> String(a.title).localeCompare(String(b.title)));
    });

    return hb;
  }

  function renderCategories(hb, q){
    const wrap = $('#hbCategories');
    if(!wrap) return;

    const needle = String(q||'').toLowerCase().trim();

    const cats = hb.categories.filter(c => c.isActive);

    const filtered = needle
      ? cats.filter(c => {
          if(String(c.title).toLowerCase().includes(needle)) return true;
          return (c.items||[]).some(it => String(it.title).toLowerCase().includes(needle) || String(it.summary).toLowerCase().includes(needle));
        })
      : cats;

    if(!filtered.length){
      wrap.innerHTML = `<p class="tiny muted" style="margin:0;">No handbook categories yet.</p>`;
      return;
    }

    wrap.innerHTML = filtered.map(c => {
      const icon = c.icon ? `<div class="hb-icon">${esc(c.icon)}</div>` : `<div class="hb-icon">📘</div>`;
      const count = (c.items||[]).filter(it => it.isPublished).length;
      return `
        <a class="card hb-card" href="#cat=${encodeURIComponent(c.id)}" aria-label="Open ${esc(c.title)}">
          ${icon}
          <div class="hb-card-body">
            <div class="hb-card-title">${esc(c.title)}</div>
            <div class="tiny muted">${count} item${count===1?'':'s'}</div>
          </div>
        </a>
      `;
    }).join('');
  }

  function renderCategoryView(hb, catId, q){
    const cat = hb.categories.find(c => c.id === catId && c.isActive);
    const panel = $('#hbCategory');
    const list = $('#hbItems');
    const title = $('#hbCatTitle');
    if(!panel || !list || !title) return;

    if(!cat){
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    title.textContent = cat.title;

    const needle = String(q||'').toLowerCase().trim();
    const items = (cat.items||[]).filter(it => it.isPublished);
    const filtered = needle ? items.filter(it => (it.title||'').toLowerCase().includes(needle) || (it.summary||'').toLowerCase().includes(needle)) : items;

    if(!filtered.length){
      list.innerHTML = `<p class="tiny muted" style="margin:0;">No items found.</p>`;
      return;
    }

    list.innerHTML = filtered.map(it => {
      const isLink = (it.type === 'link');
      const right = isLink ? `<span class="tag gray">External</span>` : `<span class="tag ok">Page</span>`;
      const href = isLink ? (it.url || '#') : `#cat=${encodeURIComponent(cat.id)}&item=${encodeURIComponent(it.id)}`;
      const target = isLink ? ' target="_blank" rel="noopener"' : '';
      const disabled = (isLink && !it.url) ? ' aria-disabled="true" style="opacity:.55; pointer-events:none;"' : '';
      return `
        <a class="hb-item" href="${esc(href)}"${target}${disabled}>
          <div class="hb-item-main">
            <div class="hb-item-title">${esc(it.title)}</div>
            ${it.summary ? `<div class="tiny muted">${esc(it.summary)}</div>` : ''}
          </div>
          <div class="hb-item-right">${right} <span aria-hidden="true">›</span></div>
        </a>
      `;
    }).join('');
  }

  function renderItem(hb, catId, itemId){
    const cat = hb.categories.find(c => c.id === catId && c.isActive);
    const it = cat ? (cat.items||[]).find(x => x.id === itemId && x.isPublished) : null;

    const panel = $('#hbItem');
    if(!panel) return;

    if(!it){
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';

    const hero = it.heroImage ? `<img class="hb-hero" src="${esc(it.heroImage)}" alt="${esc(it.title)}">` : '';

    // Items of type "link" normally open directly from the list.
    // This view remains as a fallback (e.g., deep-linked item).
    let body = '';
    if(it.type === 'link'){
      const url = it.url;
      body = url
        ? `
            <p class="muted">This item opens an external link.</p>
            <p><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Open link</a></p>
          `
        : `<p class="muted">No link has been set yet.</p>`;
    } else {
      body = it.contentHtml ? it.contentHtml : `<p class="muted">No content has been added yet.</p>`;
    }

    const atts = Array.isArray(it.attachments) ? it.attachments.filter(a => a && a.url) : [];
    const attHtml = atts.length ? `
      <div style="margin-top:14px;">
        <h4 style="margin:0 0 8px;">Attachments</h4>
        <div class="grid" style="gap:10px;">
          ${atts.map(a => `<a class="hb-attach" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label||'Open')}</a>`).join('')}
        </div>
      </div>
    ` : '';

    panel.innerHTML = `
      <div class="hb-item-head">
        <div>
          <div class="tiny muted"><a href="#" data-hb-home>Handbook</a> <span aria-hidden="true">›</span> <a href="#cat=${encodeURIComponent(catId)}">${esc(cat?.title||'')}</a></div>
          <h3 style="margin:6px 0 0;">${esc(it.title)}</h3>
          ${it.updatedAt ? `<div class="tiny muted">Updated: ${esc(new Date(it.updatedAt).toLocaleDateString('en-IE'))}</div>` : ''}
        </div>
        <div>
          <button class="btn btn-line small" type="button" id="hbBackBtn">Back</button>
        </div>
      </div>
      ${hero}
      <div class="hb-content">${body}</div>
      ${attHtml}
    `;

    const back = $('#hbBackBtn');
    if(back){
      back.addEventListener('click', () => {
        setHash({ cat: catId, item: '' });
      });
    }

    const home = panel.querySelector('[data-hb-home]');
    if(home){
      home.addEventListener('click', (e) => {
        e.preventDefault();
        setHash({ cat: '', item: '', q: getHashParams().q });
      });
    }
  }

  async function loadHandbook(){
    if(typeof window.anwInitStore === 'function'){
      try{ await window.anwInitStore(); }catch(e){}
    }
    if(typeof window.anwFetchKey === 'function'){
      try{ return await window.anwFetchKey(KEY); }catch(e){}
    }
    if(typeof window.anwLoad === 'function'){
      try{ return window.anwLoad(KEY, {categories:[]}); }catch(e){}
    }
    return { categories: [] };
  }

  async function main(){
    const qInput = $('#hbSearch');

    let hb = normalizeHandbook(await loadHandbook());

    const catsPanel = document.getElementById('hbHome');
    const backToCats = document.querySelector('#hbCategory a.btn');
    if(backToCats){
      backToCats.addEventListener('click', (e) => {
        e.preventDefault();
        const { q } = getHashParams();
        setHash({ cat: '', item: '', q });
      });
    }

    function rerender(){
      const {cat, item, q} = getHashParams();
      const query = q || (qInput ? qInput.value : '');

      // categories grid
      renderCategories(hb, query);

      // category list
      renderCategoryView(hb, cat, query);

      // item view
      renderItem(hb, cat, item);

      // toggle panels (premium flow)
      const catPanel = $('#hbCategory');
      const itemPanel = $('#hbItem');
      const showCats = !cat;
      if(catsPanel) catsPanel.style.display = showCats ? '' : 'none';
      if(catPanel) catPanel.style.display = cat ? '' : 'none';
      if(itemPanel) itemPanel.style.display = (cat && item) ? '' : 'none';

      // sync search to hash
      if(qInput && qInput.value !== query) qInput.value = query;
    }

    if(qInput){
      qInput.addEventListener('input', () => {
        const {cat, item} = getHashParams();
        setHash({ cat, item, q: qInput.value });
      });
    }

    window.addEventListener('hashchange', rerender);

    rerender();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(e => {
      const el = document.getElementById('hbCategories');
      if(el) el.innerHTML = `<p class="tiny muted">Unable to load handbook.</p>`;
    });
  });

})();
