/* =========================================================
   Aderrig NW — Handbook
   Resident-facing handbook in a reading-pane layout.
   Reads combined handbook data from anw_handbook.
   ========================================================= */
(function(){
  'use strict';

  const KEYS = window.ANW_KEYS || {};
  const KEY_HANDBOOK = KEYS.HANDBOOK || 'anw_handbook';
  const KEY_READ = 'anw_handbook_read_items';

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function byOrder(a,b){
    const ao = Number(a?.order ?? 9999);
    const bo = Number(b?.order ?? 9999);
    if(ao !== bo) return ao - bo;
    return String(a?.title||'').localeCompare(String(b?.title||''));
  }

  function getHashParams(){
    const h = String(location.hash || '').replace(/^#/, '');
    const p = new URLSearchParams(h);
    return { cat: p.get('cat') || '', item: p.get('item') || '' };
  }

  function setHash(params){
    const p = new URLSearchParams();
    if(params.cat) p.set('cat', params.cat);
    if(params.item) p.set('item', params.item);
    const s = p.toString();
    location.hash = s ? ('#' + s) : '';
  }

  function toRichHtml(value){
    const html = String(value || '').trim();
    if(!html) return '';
    if(/[<][a-z!/]/i.test(html)) return html;
    const lines = html.split(/\r?\n/);
    let out = '';
    let inList = false;
    let listMode = 'ul';
    function flush(){ if(inList){ out += '</' + listMode + '>'; inList = false; } }
    lines.forEach(line => {
      if(/^###\s+/.test(line)){ flush(); out += '<h3>' + esc(line.replace(/^###\s+/, '')) + '</h3>'; return; }
      if(/^##\s+/.test(line)){ flush(); out += '<h3>' + esc(line.replace(/^##\s+/, '')) + '</h3>'; return; }
      if(/^#\s+/.test(line)){ flush(); out += '<h3>' + esc(line.replace(/^#\s+/, '')) + '</h3>'; return; }
      if(/^\d+\.\s+/.test(line)){ if(!inList || listMode !== 'ol'){ flush(); out += '<ol>'; inList = true; listMode = 'ol'; } out += '<li>' + esc(line.replace(/^\d+\.\s+/, '')) + '</li>'; return; }
      if(/^[-*]\s+/.test(line)){ if(!inList || listMode !== 'ul'){ flush(); out += '<ul>'; inList = true; listMode = 'ul'; } out += '<li>' + esc(line.replace(/^[-*]\s+/, '')) + '</li>'; return; }
      if(!line.trim()){ flush(); return; }
      flush();
      out += '<p>' + esc(line) + '</p>';
    });
    flush();
    return out;
  }

  function normalizeCategory(raw, index){
    const title = String((raw && (raw.title || raw.name)) || '').trim();
    if(!title) return null;
    return {
      id: String(raw.id || title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || ('category-' + (index + 1))),
      title,
      icon: raw.icon ? String(raw.icon) : '',
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : (index + 1),
      isActive: raw.isActive !== false && raw.active !== false
    };
  }

  function normalizeItem(raw, index){
    const title = String((raw && (raw.title || raw.name)) || '').trim();
    if(!title) return null;
    const hero = String(raw.heroImage || raw.heroUrl || raw.imageData || '').trim();
    return {
      id: String(raw.id || ('item-' + (index + 1))).trim(),
      categoryId: String(raw.categoryId || raw.category || raw.sectionId || '').trim(),
      categoryTitle: String(raw.categoryTitle || raw.sectionTitle || '').trim(),
      title,
      type: String(raw.type || (raw.url ? 'link' : 'page')).toLowerCase() === 'link' ? 'link' : 'page',
      summary: String(raw.summary || raw.excerpt || '').trim(),
      url: String(raw.url || raw.linkUrl || '').trim(),
      linkLabel: String(raw.linkLabel || '').trim(),
      heroImage: hero,
      contentHtml: toRichHtml(raw.contentHtml || raw.content || raw.body || ''),
      attachments: Array.isArray(raw.attachments) ? raw.attachments.filter(Boolean) : [],
      updatedAt: String(raw.updatedAt || raw.createdAt || '').trim(),
      isPublished: raw.isPublished !== false && String(raw.status || '').toLowerCase() !== 'draft',
      _index: index
    };
  }

  function inferCategoriesFromItems(items, existingCategories){
    const seen = new Set((existingCategories || []).map(cat => cat.id));
    const inferred = [];
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const categoryId = String(item.categoryId || '').trim();
      const categoryTitle = String(item.categoryTitle || item.categoryId || '').trim();
      if(!categoryId || !categoryTitle || seen.has(categoryId)) return;
      seen.add(categoryId);
      inferred.push({
        id: categoryId,
        title: categoryTitle,
        icon: '',
        order: (existingCategories || []).length + index + 1,
        isActive: true
      });
    });
    return inferred;
  }

  function normalizeHandbook(raw){
    const hb = (raw && typeof raw === 'object') ? raw : {};
    let categories = Array.isArray(hb.categories) ? hb.categories.map(normalizeCategory).filter(Boolean).sort(byOrder) : [];
    let items = [];
    if(Array.isArray(hb.items)){
      items = hb.items.map(normalizeItem).filter(Boolean);
    } else if(Array.isArray(hb.categories)){
      hb.categories.forEach((cat, cIndex) => {
        const catNorm = normalizeCategory(cat, cIndex);
        (Array.isArray(cat?.items) ? cat.items : []).forEach((item, iIndex) => {
          const norm = normalizeItem({ ...item, categoryId: item.categoryId || catNorm?.id, categoryTitle: item.categoryTitle || catNorm?.title }, iIndex);
          if(norm) items.push(norm);
        });
      });
    }
    categories = categories.concat(inferCategoriesFromItems(items, categories)).sort(byOrder);
    return { categories, items };
  }

  async function loadStore(key, fallback){
    try{
      const res = await fetch('/.netlify/functions/store?key=' + encodeURIComponent(key), { cache:'no-store' });
      if(!res.ok) throw new Error('store load failed');
      const data = await res.json();
      try{ if(typeof window.anwSave === 'function') window.anwSave(key, data); }catch(_){ }
      return data;
    }catch(_){ }

    try{ if(typeof window.anwInitStore === 'function') await window.anwInitStore(); }catch(_){ }
    try{ if(typeof window.anwFetchKey === 'function') return await window.anwFetchKey(key); }catch(_){ }
    try{ if(typeof window.anwLoad === 'function') return await window.anwLoad(key, fallback); }catch(_){ }
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){
      return fallback;
    }
  }

  async function loadHandbook(){
    const combined = await loadStore(KEY_HANDBOOK, { categories: [], items: [] });
    return normalizeHandbook(combined);
  }

  function getReadMap(){
    try{ return JSON.parse(localStorage.getItem(KEY_READ) || '{}') || {}; }catch(_){ return {}; }
  }

  function markRead(itemId){
    const map = getReadMap();
    map[itemId] = Date.now();
    try{ localStorage.setItem(KEY_READ, JSON.stringify(map)); }catch(_){ }
  }

  function isRead(itemId){
    return Boolean(getReadMap()[itemId]);
  }

  function parseTime(value){
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : null;
  }

  function formatDate(value){
    const time = parseTime(value);
    if(!time) return 'Latest update';
    try{
      return new Intl.DateTimeFormat('en-IE', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(time));
    }catch(_){
      return new Date(time).toLocaleDateString();
    }
  }

  function publishedItems(hb, catId){
    return hb.items.filter(it => it.isPublished && (!catId || it.categoryId === catId)).sort((a,b) => {
      const bt = parseTime(b.updatedAt);
      const at = parseTime(a.updatedAt);
      if(bt && at && bt !== at) return bt - at;
      if(bt && !at) return -1;
      if(at && !bt) return 1;
      return Number(b._index || 0) - Number(a._index || 0);
    });
  }

  function categoriesWithContent(hb){
    return hb.categories.filter(cat => cat.isActive !== false && hb.items.some(it => it.isPublished && it.categoryId === cat.id));
  }

  function renderCategories(hb, selectedCat){
    const wrap = $('#hbCategories');
    if(!wrap) return;
    const categories = categoriesWithContent(hb);
    if(!categories.length){
      wrap.innerHTML = '<div class="hb-empty">No handbook content has been published yet.</div>';
      return;
    }
    const allCount = publishedItems(hb, '').length;
    wrap.innerHTML = [
      `<button class="hb-cat-btn${!selectedCat ? ' is-active' : ''}" type="button" data-cat="">` +
        `<span class="hb-cat-name"><span>📥</span><span>All updates</span></span>` +
        `<span class="hb-count">${allCount}</span>` +
      `</button>`,
      ...categories.map(cat => {
        const count = publishedItems(hb, cat.id).length;
        return `<button class="hb-cat-btn${selectedCat === cat.id ? ' is-active' : ''}" type="button" data-cat="${esc(cat.id)}">` +
          `<span class="hb-cat-name"><span>${esc(cat.icon || '📘')}</span><span>${esc(cat.title)}</span></span>` +
          `<span class="hb-count">${count}</span>` +
        `</button>`;
      })
    ].join('');

    wrap.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat') || '';
        const items = publishedItems(hb, cat);
        setHash({ cat, item: items[0]?.id || '' });
      });
    });
  }

  function renderFeed(hb, selectedCat, selectedItemId){
    const wrap = $('#hbFeed');
    if(!wrap) return [];
    const items = publishedItems(hb, selectedCat);
    if(!items.length){
      wrap.innerHTML = '<div class="hb-empty">No updates are available in this category yet.</div>';
      return items;
    }
    wrap.innerHTML = items.map(it => {
      const active = selectedItemId === it.id;
      const read = isRead(it.id);
      const cat = hb.categories.find(c => c.id === it.categoryId);
      return `
        <article class="hb-item-card${active ? ' is-active' : ''}${read ? ' is-read' : ''}" data-item="${esc(it.id)}">
          <div class="hb-item-top">
            <div>
              <h4 class="hb-item-title">${esc(it.title)}</h4>
              ${it.summary ? `<p class="hb-item-sub">${esc(it.summary)}</p>` : ''}
            </div>
            <div class="hb-meta">
              ${read ? '<span class="hb-pill">Read</span>' : '<span class="hb-pill is-unread"><span class="hb-dot" aria-hidden="true"></span>&nbsp;New</span>'}
              <span class="hb-pill">${esc(cat?.title || it.categoryTitle || 'General')}</span>
              <span class="hb-pill">${esc(formatDate(it.updatedAt))}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
    wrap.querySelectorAll('[data-item]').forEach(card => {
      card.addEventListener('click', () => {
        const itemId = card.getAttribute('data-item') || '';
        setHash({ cat: selectedCat, item: itemId });
      });
    });
    return items;
  }

  function renderReader(hb, selectedCat, selectedItemId, items){
    const panel = $('#hbReader');
    if(!panel) return;
    const it = items.find(x => x.id === selectedItemId) || items[0];
    if(!it){
      panel.innerHTML = '<div class="hb-empty">Choose a category to see updates here.</div>';
      return;
    }
    if(selectedItemId !== it.id){
      setHash({ cat: selectedCat, item: it.id });
      return;
    }

    markRead(it.id);
    const cat = hb.categories.find(c => c.id === it.categoryId);
    const hero = it.heroImage ? `<img class="hb-hero-image" src="${esc(it.heroImage)}" alt="${esc(it.title)}">` : '';
    let body = '';
    if(it.type === 'link'){
      body = it.url
        ? `<p>This update opens an external link.</p><p><a class="hb-link" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.linkLabel || 'Open link')}</a></p>`
        : '<p>No link has been set yet.</p>';
    } else {
      body = it.contentHtml || '<p>No content has been added yet.</p>';
    }
    const atts = Array.isArray(it.attachments) ? it.attachments.filter(a => a && a.url) : [];
    const attHtml = atts.length ? `
      <div>
        <h4 style="margin:0 0 8px;">Attachments</h4>
        <div class="hb-attachments">
          ${atts.map(a => `<a class="hb-attach" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label || 'Open')}</a>`).join('')}
        </div>
      </div>
    ` : '';

    panel.innerHTML = `
      <div class="hb-reader-head">
        <div>
          <div class="hb-reader-meta">
            <span class="hb-pill">${esc(cat?.title || it.categoryTitle || 'General')}</span>
            <span class="hb-pill">${esc(formatDate(it.updatedAt))}</span>
            <span class="hb-pill">Read</span>
          </div>
          <h3 class="hb-reader-title">${esc(it.title)}</h3>
        </div>
      </div>
      ${hero}
      <div class="hb-body">${body}</div>
      ${attHtml}
    `;
  }

  async function main(){
    const hb = await loadHandbook();

    function rerender(){
      const availableCategories = categoriesWithContent(hb);
      let { cat, item } = getHashParams();
      if(cat && !availableCategories.some(c => c.id === cat)) cat = '';
      renderCategories(hb, cat);
      const items = renderFeed(hb, cat, item);
      renderReader(hb, cat, item, items);
      document.documentElement.classList.remove('anw-preauth-hide');
    }

    window.addEventListener('hashchange', rerender);
    rerender();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(() => {
      const el = document.getElementById('hbFeed') || document.getElementById('hbCategories');
      if(el) el.innerHTML = '<div class="hb-empty">Unable to load handbook.</div>';
      const reader = document.getElementById('hbReader');
      if(reader) reader.innerHTML = '<div class="hb-empty">Unable to load handbook.</div>';
      document.documentElement.classList.remove('anw-preauth-hide');
    });
  });
})();
