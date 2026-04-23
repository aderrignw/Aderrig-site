/* =========================================================
   Aderrig NW — Handbook
   Resident-facing handbook with category sidebar and inline items.
   ========================================================= */
(function(){
  'use strict';

  const KEYS = window.ANW_KEYS || {};
  const KEY_HANDBOOK = KEYS.HANDBOOK || 'anw_handbook';
  const KEY_READ = 'anw_handbook_read_items';

  const $ = (sel, root=document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function unwrapStorePayload(payload){
    if(payload && typeof payload === 'object' && !Array.isArray(payload)){
      if(payload.value && typeof payload.value === 'object') return payload.value;
      if(payload.data && typeof payload.data === 'object') return payload.data;
      if(payload.item && typeof payload.item === 'object') return payload.item;
    }
    return payload;
  }

  function byOrder(a,b){
    const ao = Number(a?.order ?? 9999);
    const bo = Number(b?.order ?? 9999);
    if(ao !== bo) return ao - bo;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
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
    const source = unwrapStorePayload(raw);
    const hb = (source && typeof source === 'object') ? source : {};
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
      const data = unwrapStorePayload(await res.json());
      try{ if(typeof window.anwSave === 'function') window.anwSave(key, data); }catch(_){}
      if(data && typeof data === 'object') return data;
    }catch(_){}

    try{ if(typeof window.anwInitStore === 'function') await window.anwInitStore(); }catch(_){}
    try{ if(typeof window.anwFetchKey === 'function') return unwrapStorePayload(await window.anwFetchKey(key)); }catch(_){}
    try{ if(typeof window.anwLoad === 'function') return unwrapStorePayload(await window.anwLoad(key, fallback)); }catch(_){}
    try{
      const raw = localStorage.getItem(key);
      return raw ? unwrapStorePayload(JSON.parse(raw)) : fallback;
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
    try{ localStorage.setItem(KEY_READ, JSON.stringify(map)); }catch(_){}
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

  function buildExpandedSection(item){
    const hasHero = !!item.heroImage;
    const atts = Array.isArray(item.attachments) ? item.attachments.filter(a => a && a.url) : [];
    const heroDownload = hasHero ? `<a class="hb-download" href="${esc(item.heroImage)}" download>Download image</a>` : '';
    const expandedActions = `<div class="hb-expanded-actions">${heroDownload}<button type="button" class="hb-close-btn" data-close-item="${esc(item.id)}">Close</button></div>`;
    const heroHtml = hasHero ? `
      <div class="hb-image-col">
        <button class="hb-image-btn" type="button" data-hb-image="${esc(item.heroImage)}" aria-label="Open image">
          <img class="hb-hero-image" src="${esc(item.heroImage)}" alt="${esc(item.title)}">
        </button>
      </div>
    ` : '';
    const filesHtml = atts.length ? `
      <div class="hb-file-col">
        <div class="hb-file-title">Attachments</div>
        <div class="hb-files">
          ${atts.map(a => `<a class="hb-download" href="${esc(a.url)}" target="_blank" rel="noopener" download>${esc(a.label || 'Download file')}</a>`).join('')}
        </div>
      </div>
    ` : '';
    const bodyHtml = item.type === 'link'
      ? (item.url ? `<p><a class="hb-download" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.linkLabel || 'Open link')}</a></p>` : '<p>No link has been set yet.</p>')
      : (item.contentHtml || '');

    const bodySection = bodyHtml ? `<div class="hb-body">${bodyHtml}</div>` : '';
    const mediaSection = (hasHero || atts.length) ? `<div class="hb-media-row">${heroHtml}${filesHtml}</div>` : '';
    return `<div class="hb-expanded" id="hbExpanded-${esc(item.id)}" hidden>${expandedActions}${bodySection}${mediaSection}</div>`;
  }

  function renderFeed(hb, selectedCat, selectedItemId){
    const wrap = $('#hbFeed');
    if(!wrap) return;
    const items = publishedItems(hb, selectedCat);
    if(!items.length){
      wrap.innerHTML = '<div class="hb-empty">No updates are available in this category yet.</div>';
      return;
    }

    wrap.innerHTML = items.map(it => {
      const read = isRead(it.id);
      const cat = hb.categories.find(c => c.id === it.categoryId);
      const meta = [cat?.title || it.categoryTitle || 'General', formatDate(it.updatedAt)].filter(Boolean).join(' • ');
      const expanded = selectedItemId === it.id;
      const canExpand = Boolean(it.heroImage || (Array.isArray(it.attachments) && it.attachments.length) || it.contentHtml || (it.type === 'link' && it.url));
      const titleHtml = canExpand
        ? `<button type="button" class="hb-item-title-btn" data-view-more="${esc(it.id)}">${esc(it.title)}</button>`
        : esc(it.title);
      return `
        <article class="hb-item-card${read ? ' is-read' : ''}">
          <div class="hb-item-head">
            <div class="hb-item-main">
              <h4 class="hb-item-title">${titleHtml}</h4>
              <div class="hb-item-meta-line">${esc(meta)}</div>
              ${it.summary ? `<p class="hb-item-summary">${esc(it.summary)}</p>` : ''}
            </div>
            <div class="hb-actions">
              ${read ? '<span class="hb-pill">Read</span>' : '<span class="hb-pill is-unread">New</span>'}
              ${canExpand ? `<button type="button" class="hb-more-btn" data-view-more="${esc(it.id)}">${expanded ? 'Hide' : 'View more'}</button>` : ''}
            </div>
          </div>
          ${expanded ? buildExpandedSection(it) : ''}
        </article>
      `;
    }).join('');

    wrap.querySelectorAll('[data-view-more]').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.getAttribute('data-view-more') || '';
        if(!itemId) return;
        if(selectedItemId === itemId){
          setHash({ cat: selectedCat, item: '' });
          return;
        }
        markRead(itemId);
        setHash({ cat: selectedCat, item: itemId });
      });
    });

    wrap.querySelectorAll('[data-close-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        setHash({ cat: selectedCat, item: '' });
      });
    });

    wrap.querySelectorAll('[data-hb-image]').forEach(btn => {
      btn.addEventListener('click', () => {
        openImageLightbox(btn.getAttribute('data-hb-image') || '', btn.closest('.hb-item-card')?.querySelector('.hb-item-title')?.textContent || 'Image');
      });
    });

    const expanded = selectedItemId ? document.getElementById('hbExpanded-' + selectedItemId) : null;
    if(expanded) expanded.removeAttribute('hidden');
  }

  function openImageLightbox(src, title){
    if(!src) return;
    let modal = document.getElementById('hbImageLightbox');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'hbImageLightbox';
      modal.className = 'hb-lightbox';
      modal.innerHTML = '<button type="button" class="hb-lightbox-close" aria-label="Close image">×</button><img class="hb-lightbox-image" alt=""><div class="hb-lightbox-caption"></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if(e.target === modal || e.target.classList.contains('hb-lightbox-close')) modal.classList.remove('is-open');
      });
      document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') modal.classList.remove('is-open');
      });
    }
    $('.hb-lightbox-image', modal).src = src;
    $('.hb-lightbox-image', modal).alt = title || 'Image';
    $('.hb-lightbox-caption', modal).textContent = title || '';
    modal.classList.add('is-open');
  }

  async function main(){
    const hb = await loadHandbook();

    function rerender(){
      const { cat, item } = getHashParams();
      const selectedCat = cat || '';
      renderCategories(hb, selectedCat);
      renderFeed(hb, selectedCat, item || '');
      document.documentElement.classList.remove('anw-preauth-hide');
    }

    window.addEventListener('hashchange', rerender);
    rerender();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(() => {
      const categories = document.getElementById('hbCategories');
      const feed = document.getElementById('hbFeed');
      if(categories) categories.innerHTML = '<div class="hb-empty">Unable to load handbook.</div>';
      if(feed) feed.innerHTML = '<div class="hb-empty">Please try again in a moment.</div>';
      document.documentElement.classList.remove('anw-preauth-hide');
    });
  });
})();
