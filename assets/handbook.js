/* =========================================================
   Aderrig NW — Handbook
   - Resident-facing handbook only
   - Reads combined handbook data from anw_handbook
   Data shape:
   {
     categories:[{ id,title,icon?,order?,isActive?|active? }],
     items:[{ id,categoryId,title,summary,contentHtml|content,url,heroImage|heroUrl,attachments,updatedAt,isPublished|status,type }]
   }
   ========================================================= */
(function(){
  'use strict';

  const KEYS = window.ANW_KEYS || {};
  const KEY_HANDBOOK = KEYS.HANDBOOK || 'anw_handbook';

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
    return { cat: p.get('cat') || '', item: p.get('item') || '', q: p.get('q') || '' };
  }

  function setHash(params){
    const p = new URLSearchParams();
    if(params.cat) p.set('cat', params.cat);
    if(params.item) p.set('item', params.item);
    if(params.q) p.set('q', params.q);
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
      title,
      type: String(raw.type || (raw.url ? 'link' : 'page')).toLowerCase() === 'link' ? 'link' : 'page',
      summary: String(raw.summary || raw.excerpt || '').trim(),
      url: String(raw.url || raw.linkUrl || '').trim(),
      linkLabel: String(raw.linkLabel || '').trim(),
      heroImage: hero,
      contentHtml: toRichHtml(raw.contentHtml || raw.content || raw.body || ''),
      attachments: Array.isArray(raw.attachments) ? raw.attachments.filter(Boolean) : [],
      updatedAt: String(raw.updatedAt || '').trim(),
      isPublished: raw.isPublished !== false && String(raw.status || '').toLowerCase() !== 'draft'
    };
  }

  function normalizeHandbook(raw){
    const hb = (raw && typeof raw === 'object') ? raw : {};
    const categories = Array.isArray(hb.categories) ? hb.categories.map(normalizeCategory).filter(Boolean).sort(byOrder) : [];
    let items = [];
    if(Array.isArray(hb.items)){
      items = hb.items.map(normalizeItem).filter(Boolean);
    } else if(Array.isArray(hb.categories)){
      hb.categories.forEach((cat, cIndex) => {
        const catNorm = normalizeCategory(cat, cIndex);
        (Array.isArray(cat?.items) ? cat.items : []).forEach((item, iIndex) => {
          const norm = normalizeItem({ ...item, categoryId: item.categoryId || catNorm?.id }, iIndex);
          if(norm) items.push(norm);
        });
      });
    }
    return { categories, items };
  }

  async function loadStore(key, fallback){
    try{
      if(typeof window.anwInitStore === 'function') await window.anwInitStore();
    }catch(_){ }
    try{
      if(typeof window.anwFetchKey === 'function') return await window.anwFetchKey(key);
    }catch(_){ }
    try{
      if(typeof window.anwLoad === 'function') return await window.anwLoad(key, fallback);
    }catch(_){ }
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

  function visibleCategories(hb, q){
    const needle = String(q || '').toLowerCase().trim();
    const categories = hb.categories.filter(cat => cat.isActive !== false);
    if(!needle) return categories;
    return categories.filter(cat => {
      if(String(cat.title).toLowerCase().includes(needle)) return true;
      return hb.items.some(it =>
        it.categoryId === cat.id &&
        it.isPublished &&
        (String(it.title).toLowerCase().includes(needle) || String(it.summary).toLowerCase().includes(needle))
      );
    });
  }

  function renderCategories(hb, q){
    const wrap = $('#hbCategories');
    if(!wrap) return;
    const categories = visibleCategories(hb, q);
    if(!categories.length){
      wrap.innerHTML = '<div class="hb-empty">No handbook content has been published yet. Publish a category and at least one item in the admin panel and it will appear here.</div>';
      return;
    }
    wrap.innerHTML = categories.map(cat => {
      const count = hb.items.filter(it => it.categoryId === cat.id && it.isPublished).length;
      return `
        <a class="hb-card hb-cat-card" href="#cat=${encodeURIComponent(cat.id)}" aria-label="Open ${esc(cat.title)}">
          <div class="hb-cat-icon">${esc(cat.icon || '📘')}</div>
          <div>
            <div class="hb-cat-title">${esc(cat.title)}</div>
            <div class="hb-cat-sub">${count} item${count === 1 ? '' : 's'}</div>
          </div>
        </a>
      `;
    }).join('');
  }

  function itemsForCategory(hb, catId, q){
    const needle = String(q || '').toLowerCase().trim();
    return hb.items.filter(it => {
      if(!it.isPublished) return false;
      if(it.categoryId !== catId) return false;
      if(!needle) return true;
      return String(it.title).toLowerCase().includes(needle) || String(it.summary).toLowerCase().includes(needle);
    }).sort((a,b) => String(a.title).localeCompare(String(b.title)));
  }

  function renderCategoryView(hb, catId, q){
    const panel = $('#hbCategory');
    const list = $('#hbItems');
    const title = $('#hbCatTitle');
    if(!panel || !list || !title) return;
    const cat = hb.categories.find(c => c.id === catId && c.isActive !== false);
    if(!cat){
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    title.textContent = cat.title;
    const items = itemsForCategory(hb, cat.id, q);
    if(!items.length){
      list.innerHTML = '<div class="hb-empty">No published items were found in this category.</div>';
      return;
    }
    list.innerHTML = items.map(it => {
      const isLink = it.type === 'link';
      const right = isLink ? '<span class="hb-status">External</span>' : '<span class="hb-status">Page</span>';
      const href = isLink ? (it.url || '#') : `#cat=${encodeURIComponent(cat.id)}&item=${encodeURIComponent(it.id)}`;
      const target = isLink ? ' target="_blank" rel="noopener"' : '';
      const disabled = (isLink && !it.url) ? ' aria-disabled="true" style="opacity:.55; pointer-events:none;"' : '';
      return `
        <a class="hb-item" href="${esc(href)}"${target}${disabled}>
          <div>
            <div class="hb-item-title">${esc(it.title)}</div>
            ${it.summary ? `<div class="hb-item-sub">${esc(it.summary)}</div>` : ''}
          </div>
          <div class="hb-item-right">${right}<span aria-hidden="true">›</span></div>
        </a>
      `;
    }).join('');
  }

  function renderItem(hb, catId, itemId){
    const cat = hb.categories.find(c => c.id === catId && c.isActive !== false);
    const it = hb.items.find(x => x.categoryId === catId && x.id === itemId && x.isPublished);
    const panel = $('#hbItem');
    if(!panel) return;
    if(!it){
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const hero = it.heroImage ? `<img class="hb-hero-image" src="${esc(it.heroImage)}" alt="${esc(it.title)}">` : '';
    let body = '';
    if(it.type === 'link'){
      body = it.url
        ? `<p>This item opens an external link.</p><p><a class="hb-link" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.linkLabel || 'Open link')}</a></p>`
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
      <div class="hb-item-shell">
        <div class="hb-item-head">
          <div>
            <div class="hb-breadcrumb"><a href="#" data-hb-home>Handbook</a> <span aria-hidden="true">›</span> <a href="#cat=${encodeURIComponent(catId)}">${esc(cat?.title || '')}</a></div>
            <h3 style="margin:6px 0 0;">${esc(it.title)}</h3>
          </div>
          <div><button class="hb-link" type="button" id="hbBackBtn">Back</button></div>
        </div>
        ${hero}
        <div class="hb-body">${body}</div>
        ${attHtml}
      </div>
    `;
    $('#hbBackBtn')?.addEventListener('click', () => setHash({ cat: catId, item: '' }));
    panel.querySelector('[data-hb-home]')?.addEventListener('click', (e) => {
      e.preventDefault();
      setHash({ cat: '', item: '', q: getHashParams().q });
    });
  }

  async function main(){
    const hb = await loadHandbook();
    const qInput = $('#hbSearch');
    const catsPanel = $('#hbHome');
    const backToCategories = $('#hbBackToCategories');

    function rerender(){
      const { cat, item, q } = getHashParams();
      const query = q || (qInput ? qInput.value : '');
      renderCategories(hb, query);
      renderCategoryView(hb, cat, query);
      renderItem(hb, cat, item);
      const catPanel = $('#hbCategory');
      const itemPanel = $('#hbItem');
      if(catsPanel) catsPanel.style.display = !cat ? '' : 'none';
      if(catPanel) catPanel.style.display = cat ? '' : 'none';
      if(itemPanel) itemPanel.style.display = (cat && item) ? '' : 'none';
      if(qInput && qInput.value !== query) qInput.value = query;
      document.documentElement.classList.remove('anw-preauth-hide');
    }

    qInput?.addEventListener('input', () => {
      const { cat, item } = getHashParams();
      setHash({ cat, item, q: qInput.value });
    });
    backToCategories?.addEventListener('click', (e) => {
      e.preventDefault();
      setHash({ cat: '', item: '', q: '' });
    });
    window.addEventListener('hashchange', rerender);
    rerender();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch(() => {
      const el = document.getElementById('hbCategories');
      if(el) el.innerHTML = '<div class="hb-empty">Unable to load handbook.</div>';
      document.documentElement.classList.remove('anw-preauth-hide');
    });
  });
})();
