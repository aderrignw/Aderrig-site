(function(){
  'use strict';

  const KEYS = window.ANW_KEYS || {};
  const KEY_USERS = KEYS.USERS || 'anw_users';
  const KEY_ELECTIONS = KEYS.ELECTIONS || 'anw_elections';
  const KEY_ELECTION_INTEREST = KEYS.ELECTION_INTEREST || 'anw_election_interest';
  const KEY_REPORTS = KEYS.REPORTS || KEYS.INCIDENTS || 'anw_incidents';
  const KEY_PROJECTS = KEYS.PROJECTS || 'anw_projects';
  const KEY_PROJECT_RECIPIENTS = KEYS.PROJECT_RECIPIENTS || 'anw_project_recipients';
  const KEY_ACCESS = KEYS.ACL || KEYS.ACCESS || 'acl';
  const KEY_TASKS = KEYS.TASKS || 'anw_tasks';
  const KEY_NOTICES = window.getNoticesKey();

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  const ADMIN_ALLOWED_ROLES = ['admin','owner','platform_support','area_coordinator','aux_coordinator','assistant_area_coordinator'];
  const OWNER_EMAIL = 'claudiosantos1968@gmail.com';

  function hasAllowedAdminRole(roles){
    const list = Array.isArray(roles) ? roles : [roles];
    const normalized = list
      .map(v => (typeof window.anwGetCanonicalRole === 'function') ? window.anwGetCanonicalRole({ role:v }, '') : String(v||'').toLowerCase())
      .filter(Boolean);
    return normalized.some(v => ADMIN_ALLOWED_ROLES.includes(v));
  }

  async function anwLoadSafe(key, fallback){
    try{
      const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, { cache:'no-store' });
      if(!res.ok) throw new Error('store load failed');
      const data = await res.json();
      try{ if(typeof window.anwSave === 'function') window.anwSave(key, data); }catch(_){ }
      return data;
    }catch(_){
      try{
        if(typeof window.anwLoad === 'function') return await window.anwLoad(key, fallback);
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }catch(__){
        return fallback;
      }
    }
  }

  async function anwSaveSafe(key, value){
    try{
      const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(value)
      });
      if(!res.ok) throw new Error('store save failed');
      try{ if(typeof window.anwSave === 'function') window.anwSave(key, value); }catch(_){ }
      return true;
    }catch(err){
      try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_){ }
      console.error(err);
      throw err;
    }
  }

  function downloadText(filename, text, type='application/json'){
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function esc(s){
    return String(s == null ? '' : s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function fmtDate(v){
    if(!v) return '—';
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }

  function fmtDateShort(v){
    if(!v) return '—';
    const d = new Date(v + 'T12:00:00');
    if(Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString();
  }

  function normList(v){
    if(Array.isArray(v)) return v.filter(Boolean);
    if(v == null || v === '') return [];
    return String(v).split(/[;,|]/).map(s => s.trim()).filter(Boolean);
  }

  function uniqueBy(arr, getKey){
    const seen = new Set();
    return arr.filter(item => {
      const k = getKey(item);
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function slugify(v){
    return String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function parseCsvLine(line){
    const out = [];
    let cur = '';
    let quote = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"'){
        if(quote && line[i+1] === '"'){ cur += '"'; i++; }
        else quote = !quote;
      } else if(!quote && (ch === ',' || ch === ';' || ch === '\t')){
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseFlexibleDate(v){
    const s = String(v||'').trim();
    if(!s) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
    const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if(m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    const d = new Date(s);
    if(!Number.isNaN(d.getTime())){
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return s;
  }

  function startOfWeekMonday(dateStr){
    const d = new Date(dateStr + 'T12:00:00');
    if(Number.isNaN(d.getTime())) return dateStr;
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function endOfNextWeekSunday(dateStr){
    const d = new Date(dateStr + 'T12:00:00');
    if(Number.isNaN(d.getTime())) return dateStr;
    const day = d.getDay();
    const offsetToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offsetToMonday + 13);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function getCurrentAdminTabId(){
    const active = document.querySelector('.admin-tab.active');
    return active ? active.getAttribute('data-tab') : 'tabResidents';
  }

  function showAdminTab(tabId){
    closeResidentModal();
    $$('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId));
    $$('.admin-tab-content').forEach(p => { p.style.display = (p.id === tabId) ? 'block' : 'none'; });
  }

  function showResidentSubtab(id){
    closeResidentModal();
    $$('.resident-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-subtab') === id));
    const mode = id === 'subPending' ? 'pending' : id === 'subApproved' ? 'approved' : 'all';
    renderResidents(mode);
  }

  function showElectionSubtab(id){
    closeResidentModal();
    $$('.elect-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-subtab') === id));
    $$('.elect-subtab').forEach(p => p.style.display = (p.id === id ? 'block' : 'none'));
  }

  function adminApplyRoleVisibility(role){
    const normalized = String(role||'').toLowerCase();
    const allowAll = hasAllowedAdminRole(normalized);
    document.body.classList.toggle('admin-allowed', allowAll);
  }

  function adminGuardPending(on){
    try{
      document.documentElement.classList.toggle('admin-guard-pending', !!on);
    }catch(_){}
  }

  function getNetlifyCurrentUser(){
    try{
      return (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function')
        ? (window.netlifyIdentity.currentUser() || null)
        : null;
    }catch(_){
      return null;
    }
  }

  function hasIdentitySessionHint(){
    try{
      for(const key of Object.keys(localStorage)){
        if(/gotrue/i.test(key)){
          const raw = localStorage.getItem(key);
          if(raw && String(raw).trim()) return true;
        }
      }
    }catch(_){}
    return false;
  }

  function redirectAdminDenied(target){
    adminGuardPending(false);
    try{
      location.replace(target);
    }catch(_){
      try{ location.href = target; }catch(__){}
    }
    setTimeout(() => {
      try{ location.href = target; }catch(_){}
    }, 80);
  }

  async function waitForAclFunction(timeoutMs){
    const started = Date.now();
    while(Date.now() - started < Number(timeoutMs || 6000)){
      if(typeof window.anwAclAllows === 'function') return true;
      await new Promise(r => setTimeout(r, 80));
    }
    return false;
  }

  async function waitForAdminDecision(timeoutMs){
    const started = Date.now();
    const limit = Number(timeoutMs || 7000);
    const hadSessionHint = hasIdentitySessionHint();

    while(Date.now() - started < limit){
      const currentUser = getNetlifyCurrentUser();
      const aclReady = typeof window.anwAclAllows === 'function';

      if(aclReady && currentUser && window.anwAclAllows('page:admin')){
        return 'allow';
      }

      if(aclReady && currentUser && !window.anwAclAllows('page:admin')){
        return 'deny-dashboard';
      }

      if(aclReady && !currentUser && !hadSessionHint){
        return 'deny-login';
      }

      await new Promise(r => setTimeout(r, 100));
    }

    const currentUser = getNetlifyCurrentUser();
    if(currentUser){
      try{
        if(typeof window.anwAclAllows === 'function' && window.anwAclAllows('page:admin')){
          return 'allow';
        }
      }catch(_){}
      return 'deny-dashboard';
    }

    return 'deny-login';
  }

  function adminMarkReady(){
    document.documentElement.classList.remove('admin-booting');
    document.body.classList.remove('admin-booting');
  }

  async function runAdminGate(){
    const msg = byId('adminGateMsg');
    try{
      let allowed = false;
      let role = '';
      const currentUser = (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function')
        ? window.netlifyIdentity.currentUser()
        : null;

      if(currentUser && currentUser.email){
        const email = String(currentUser.email || '').trim().toLowerCase();
        if(email === OWNER_EMAIL.toLowerCase()){
          allowed = true;
          role = 'owner';
        }else{
          const users = await anwLoadSafe(KEY_USERS, []);
          const row = users.find(u => String((u && (u.email || u.userEmail || '')) || '').trim().toLowerCase() === email);
          if(row){
            const roles = []
              .concat(normList(row.type))
              .concat(normList(row.role))
              .concat(normList(row.roles))
              .concat(normList(row.userRole))
              .concat(normList(row.userRoles))
              .concat(normList(row.residentType));
            allowed = hasAllowedAdminRole(roles);
            role = (typeof window.anwGetCanonicalRole === 'function') ? window.anwGetCanonicalRole(row, email) : (roles[0] || '');
          }
        }
      }

      adminApplyRoleVisibility(role);

      if(msg){
        if(allowed){
          msg.style.display = 'none';
          msg.textContent = '';
        }else{
          msg.style.display = 'block';
          msg.textContent = 'Admin access is restricted to approved admin roles. Some sections may be hidden until your role is confirmed.';
        }
      }
    }catch(err){
      console.error(err);
      if(msg){
        msg.style.display = 'block';
        msg.textContent = 'Unable to fully verify admin access right now. Local admin tools are still available.';
      }
    }finally{
      showAdminTab(getCurrentAdminTabId());
      showElectionSubtab('subManage');
    }
  }
  // ---------- Residents ----------
  let RESIDENTS_CACHE = [];
  let CURRENT_RESIDENT = null;

  async function loadResidents(){
    RESIDENTS_CACHE = await anwLoadSafe(KEY_USERS, []);
    if(assignMissingResidentNumbers(RESIDENTS_CACHE)){
      await anwSaveSafe(KEY_USERS, RESIDENTS_CACHE);
    }
    renderResidents($('.resident-tab.active')?.getAttribute('data-subtab') === 'subApproved' ? 'approved'
      : $('.resident-tab.active')?.getAttribute('data-subtab') === 'subAll' ? 'all'
      : 'pending');
  }

  function getResidentRolesLabel(u){
    const roles = [];
    if(u.streetCoordinator || u.isStreetCoordinator || normList(u.roles).includes('street_admin') || normList(u.role).includes('street_admin')) roles.push('Street Coordinator');
    if(u.volunteer || normList(u.roles).includes('volunteer') || normList(u.role).includes('volunteer')) roles.push('Volunteer');
    if(normList(u.roles).includes('admin') || normList(u.role).includes('admin')) roles.push('Admin');
    return roles.length ? roles.join(', ') : '—';
  }

  function renderResidents(mode){
    const body = byId('resBody');
    const empty = byId('resEmpty');
    const summary = byId('resSummary');
    if(!body) return;

    const rows = (RESIDENTS_CACHE || []).filter(u => {
      const status = String((u && u.status) || '').toLowerCase();
      if(mode === 'pending') return !['approved','active'].includes(status);
      if(mode === 'approved') return ['approved','active'].includes(status);
      return true;
    });

    body.innerHTML = rows.map((u, idx) => `
      <tr>
        <td>${esc(formatResidentRegId(u.regId || u.regNo) || '—')}</td>
        <td>${esc(u.name || '—')}</td>
        <td>${esc(u.email || '—')}</td>
        <td>${esc(u.eircode || '—')}</td>
        <td>${esc(u.status || 'pending')}</td>
        <td>${esc(getResidentRolesLabel(u))}</td>
        <td class="resident-actions-col">
          <div class="resident-action-cell">
            <button type="button" class="btn-line small" data-res-index="${idx}" data-act="openResident">
              ${String((u.status||'')).toLowerCase() === 'approved' || String((u.status||'')).toLowerCase() === 'active' ? 'Edit' : 'Open'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    summary.textContent = `${rows.length} resident(s) shown`;
    empty.style.display = rows.length ? 'none' : 'block';

    $$('[data-act="openResident"]', body).forEach(btn => {
      btn.addEventListener('click', () => {
        const u = rows[Number(btn.getAttribute('data-res-index'))];
        openResidentModal(u);
      });
    });
  }

  function openResidentModal(user){
    CURRENT_RESIDENT = user || null;
    if(!CURRENT_RESIDENT) return;

    const modal = byId('modalResident');
    if(modal) modal.style.display = 'block';

    const regLabel = formatResidentRegId(CURRENT_RESIDENT.regId || CURRENT_RESIDENT.regNo) || '—';
    const statusLabel = CURRENT_RESIDENT.status || 'pending';
    const residentType = CURRENT_RESIDENT.residentType || CURRENT_RESIDENT.type || '—';

    if(byId('mStatus')) byId('mStatus').value = statusLabel;
    if(byId('mEmail')) byId('mEmail').value = CURRENT_RESIDENT.email || '';
    if(byId('mEir')) byId('mEir').value = CURRENT_RESIDENT.eircode || '';
    if(byId('mPhone')) byId('mPhone').value = CURRENT_RESIDENT.phone || '';
    if(byId('mAddress')) byId('mAddress').value = CURRENT_RESIDENT.address || '';
    if(byId('mType')) byId('mType').value = CURRENT_RESIDENT.residentType || CURRENT_RESIDENT.type || '';
    if(byId('mMgmt')) byId('mMgmt').value = CURRENT_RESIDENT.managementCompany || CURRENT_RESIDENT.mgmt || '';

    const roles = normList(CURRENT_RESIDENT.roles).concat(normList(CURRENT_RESIDENT.role));
    const primaryRole = roles.includes('admin') ? 'Admin'
      : roles.includes('owner') ? 'Owner'
      : roles.includes('street_admin') ? 'Street Coordinator'
      : roles.includes('volunteer') ? 'Volunteer'
      : (residentType || 'Resident');

    if(byId('mCoord')) byId('mCoord').checked = roles.includes('street_admin') || !!CURRENT_RESIDENT.streetCoordinator;
    if(byId('mVol')) byId('mVol').checked = roles.includes('volunteer') || !!CURRENT_RESIDENT.volunteer;

    const vrList = normList(CURRENT_RESIDENT.volunteerRoles);
    const vrObj = CURRENT_RESIDENT.vol_roles || CURRENT_RESIDENT.volunteer_roles || {};
    if(byId('mVStreet')) byId('mVStreet').checked = vrList.includes('Street watch / patrols') || !!vrObj.streetWatch;
    if(byId('mVLeaf')) byId('mVLeaf').checked = vrList.includes('Distribute leaflets') || !!vrObj.leaflets;
    if(byId('mVTech')) byId('mVTech').checked = vrList.includes('Tech support') || !!vrObj.tech || !!vrObj.techSupport;
    if(byId('mVEld')) byId('mVEld').checked = vrList.includes('Elderly checks') || !!vrObj.elderly;
    if(byId('mVClean')) byId('mVClean').checked = vrList.includes('Community clean-up') || !!vrObj.cleanUp || !!vrObj.cleanup;
    if(byId('mVPark')) byId('mVPark').checked = vrList.includes('Parking assistance') || !!vrObj.parkingAssistance || !!vrObj.parking;
    if(byId('mVMeet')) byId('mVMeet').checked = vrList.includes('Meeting organiser') || !!vrObj.meetings;
    if(byId('mVTrans')) byId('mVTrans').checked = vrList.includes('Translation') || !!vrObj.translation;

    const volunteerRoleMap = [
      ['mVStreet', 'Street watch / patrols'],
      ['mVLeaf', 'Distribute leaflets'],
      ['mVTech', 'Tech support'],
      ['mVEld', 'Elderly checks'],
      ['mVClean', 'Community clean-up'],
      ['mVPark', 'Parking assistance'],
      ['mVMeet', 'Meeting organiser'],
      ['mVTrans', 'Translation']
    ];

    volunteerRoleMap.forEach(([id]) => {
      const input = byId(id);
      if(input) input.disabled = true;
    });

    const activeVolunteerRoles = volunteerRoleMap.filter(([id]) => byId(id) && byId(id).checked).map(([, label]) => label);
    const availableVolunteerRoles = volunteerRoleMap.filter(([id]) => byId(id) && !byId(id).checked).map(([, label]) => label);

    const chips = byId('mVolunteerRolesChips');
    if(chips){
      chips.innerHTML = activeVolunteerRoles.length
        ? activeVolunteerRoles.map(label => `<span class="role-chip">${esc(label)}</span>`).join('')
        : `<span class="role-chip available">No volunteer roles yet</span>`;
    }

    const currentAccess = [];
    if(byId('mCoord') && byId('mCoord').checked) currentAccess.push('Street Coordinator');
    if(byId('mVol') && byId('mVol').checked) currentAccess.push('Volunteer');
    if(primaryRole && !currentAccess.includes(primaryRole)) currentAccess.unshift(primaryRole);

    const accessBox = byId('mCurrentAccessChips');
    if(accessBox){
      accessBox.innerHTML = currentAccess.length
        ? currentAccess.map(label => `<span class="role-chip current">${esc(label)}</span>`).join('')
        : `<span class="role-chip available">Resident</span>`;
    }

    const householdBox = byId('mHouseholdList');
    if(householdBox){
      const householdCandidates = []
        .concat(Array.isArray(CURRENT_RESIDENT.household) ? CURRENT_RESIDENT.household : [])
        .concat(Array.isArray(CURRENT_RESIDENT.households) ? CURRENT_RESIDENT.households : [])
        .concat(Array.isArray(CURRENT_RESIDENT.familyMembers) ? CURRENT_RESIDENT.familyMembers : [])
        .concat(Array.isArray(CURRENT_RESIDENT.members) ? CURRENT_RESIDENT.members : [])
        .concat(Array.isArray(CURRENT_RESIDENT.householdVolunteers) ? CURRENT_RESIDENT.householdVolunteers : []);

      const members = householdCandidates.filter(Boolean);
      if(members.length){
        householdBox.innerHTML = members.map((m) => {
          const name = m.name || m.fullName || m.memberName || 'Unnamed resident';
          const phone = m.phone || m.mobile || m.tel || '';
          const email = m.email || m.mail || '';
          const relation = m.relation || m.relationship || m.kinship || '';
          const photo = m.photo || m.photoUrl || m.photoURL || m.image || '';
          const parts = [relation, phone, email].filter(Boolean);
          const photoHtml = photo
            ? `<img class="household-photo" src="${esc(photo)}" alt="">`
            : `<span class="household-photo-fallback">👤</span>`;
          return `<div class="household-line">${photoHtml}<div class="household-text">${esc(name)}${parts.length ? ` · <span class="muted">${esc(parts.join(' · '))}</span>` : ''}</div></div>`;
        }).join('');
      } else {
        householdBox.innerHTML = `<div class="household-empty">No household members recorded.</div>`;
      }
    }

    const currentVolBox = byId('mVolunteerCurrentChips');
    if(currentVolBox){
      currentVolBox.innerHTML = activeVolunteerRoles.length
        ? activeVolunteerRoles.map(label => `<span class="role-chip current">${esc(label)}</span>`).join('')
        : `<span class="role-chip available">No volunteer roles yet</span>`;
    }

    const availableVolBox = byId('mVolunteerAvailableChips');
    if(availableVolBox){
      availableVolBox.innerHTML = availableVolunteerRoles.length
        ? availableVolunteerRoles.map(label => `<span class="role-chip available">${esc(label)}</span>`).join('')
        : `<span class="role-chip current">All volunteer roles already active</span>`;
    }

    if(byId('mRegIdBadge')) byId('mRegIdBadge').textContent = regLabel;
    if(byId('mStatusBadge')) byId('mStatusBadge').textContent = String(statusLabel || 'pending').replace(/^./, c => c.toUpperCase());
    if(byId('mNameHeading')) byId('mNameHeading').textContent = CURRENT_RESIDENT.name || 'Resident profile';
    if(byId('mPrimaryRoleView')) byId('mPrimaryRoleView').textContent = primaryRole || '—';
    if(byId('mAddressView')) byId('mAddressView').textContent = CURRENT_RESIDENT.address || '—';
    if(byId('mEirView')) byId('mEirView').textContent = CURRENT_RESIDENT.eircode || '—';
    if(byId('mTypeView')) byId('mTypeView').textContent = residentType || '—';

    const photoUrl = CURRENT_RESIDENT.profilePhoto || CURRENT_RESIDENT.photo || CURRENT_RESIDENT.photoURL || '';
    const photoBox = byId('mPhotoPreview');
    if(photoBox){
      if(photoUrl){
        photoBox.classList.add('has-photo');
        photoBox.innerHTML = `<img src="${esc(photoUrl)}" alt="Resident profile photo">`;
      }else{
        photoBox.classList.remove('has-photo');
        photoBox.textContent = '👤';
      }
    }

    if(byId('mMsg')) byId('mMsg').textContent = '';

    const status = String(CURRENT_RESIDENT.status || '').toLowerCase();
    const alreadyApproved = ['approved','active'].includes(status);
    if(byId('btnApprove')) byId('btnApprove').style.display = alreadyApproved ? 'none' : 'inline-flex';
    if(byId('btnReject')) byId('btnReject').style.display = alreadyApproved ? 'none' : 'inline-flex';

    try{ document.body.style.overflow = 'hidden'; }catch(_){}
  }

  function closeResidentModal(){
    if(byId('modalResident')) byId('modalResident').style.display = 'none';
    try{ document.body.style.overflow = ''; }catch(_){}
    CURRENT_RESIDENT = null;
  }

  async function saveCurrentResident(nextStatus){
    if(!CURRENT_RESIDENT) return;
    const users = await anwLoadSafe(KEY_USERS, []);
    const idx = users.findIndex(u => String(u.email||'').toLowerCase() === String(CURRENT_RESIDENT.email||'').toLowerCase());
    if(idx < 0) return;

    const roles = [];
    if(byId('mCoord').checked) roles.push('street_admin');
    if(byId('mVol').checked) roles.push('volunteer');
    if(normList(users[idx].roles).includes('admin')) roles.push('admin');

    const volunteerRoles = [
      byId('mVStreet').checked ? 'Street watch / patrols' : '',
      byId('mVLeaf').checked ? 'Distribute leaflets' : '',
      byId('mVTech').checked ? 'Tech support' : '',
      byId('mVEld').checked ? 'Elderly checks' : '',
      byId('mVClean').checked ? 'Community clean-up' : '',
      byId('mVPark').checked ? 'Parking assistance' : '',
      byId('mVMeet').checked ? 'Meeting organiser' : '',
      byId('mVTrans').checked ? 'Translation' : ''
    ].filter(Boolean);
    const volunteerRoleFlags = {
      streetWatch: byId('mVStreet').checked,
      leaflets: byId('mVLeaf').checked,
      tech: byId('mVTech').checked,
      elderly: byId('mVEld').checked,
      cleanUp: byId('mVClean').checked,
      parkingAssistance: byId('mVPark').checked,
      meetings: byId('mVMeet').checked,
      translation: byId('mVTrans').checked
    };

    users[idx].name = byId('mName').value.trim();
    users[idx].phone = byId('mPhone').value.trim();
    users[idx].residentType = byId('mType').value;
    users[idx].type = byId('mType').value;
    users[idx].managementCompany = byId('mMgmt').value.trim();
    users[idx].roles = uniqueBy(roles, x => x);
    users[idx].role = users[idx].roles[0] || '';
    users[idx].volunteerRoles = volunteerRoles;
    users[idx].vol_roles = volunteerRoleFlags;
    users[idx].volunteer_roles = volunteerRoleFlags;
    users[idx].streetCoordinator = byId('mCoord').checked;
    users[idx].volunteer = byId('mVol').checked;

    if(nextStatus){
      users[idx].status = nextStatus;
      if(['approved','active'].includes(nextStatus) && !(users[idx].regId || users[idx].regNo)){
        const nextId = anwNextRegId(users);
        users[idx].regId = nextId;
        users[idx].regNo = nextId;
      }
    }

    assignMissingResidentNumbers(users);
    await anwSaveSafe(KEY_USERS, users);
    RESIDENTS_CACHE = users;
    byId('mMsg').textContent = 'Resident saved.';
    renderResidents($('.resident-tab.active')?.getAttribute('data-subtab') === 'subApproved' ? 'approved'
      : $('.resident-tab.active')?.getAttribute('data-subtab') === 'subAll' ? 'all'
      : 'pending');
  }

  // ---------- Notices ----------
  let NOTICE_EDITING_ID = '';

  function sanitizeNoticeCollection(list){
    const now = Date.now();
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(n => {
      if(!n || typeof n !== 'object') return false;
      const title = String(n.title || '').trim();
      const message = String(n.message || '').trim();
      const isBinImport = !!(n.meta && n.meta.type === 'bin_collection_import');
      if(!isBinImport && !title && !message) return false;
      if(!isBinImport && /^\d+$/.test(title)) return false;
      if(!isBinImport && /^(null|undefined|untitled)$/i.test(title)) return false;
      const exp = n.expires || n.expiresAt || n.endsOn || n.endDate;
      if(exp){
        const t = Date.parse(exp);
        if(!Number.isNaN(t) && t < now) return false;
      }
      const key = [String(n.id || ''), title.toLowerCase(), message.toLowerCase()].join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadNoticesFresh(){
    const key = window.getNoticesKey();
    const raw = await anwLoadSafe(key, []);
    const cleaned = sanitizeNoticeCollection(raw);
    if(JSON.stringify(cleaned) !== JSON.stringify(Array.isArray(raw) ? raw : [])){
      try{ await anwSaveSafe(key, cleaned); }catch(_){}
    }
    return cleaned;
  }

  function collectNoticeForm(){
    return {
      title: byId('ntTitle').value.trim(),
      message: byId('ntMessage').value.trim(),
      category: byId('ntCategory').value || 'General',
      expires: byId('ntExpires').value || '',
      targets: {
        allLogged: !!byId('ntAllLogged').checked,
        nonAdminOnly: !!byId('ntNonAdminOnly').checked,
        roles: $$('.ntRole').filter(x => x.checked).map(x => x.value),
        eirPrefixes: normList(byId('ntEirPrefixes').value),
        streets: normList(byId('ntStreets').value),
        eircodes: byId('ntEircodes').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        emails: byId('ntEmails').value.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean)
      },
      home: {
        enabled: !!byId('ntHomeEnabled').checked,
        visibility: byId('ntHomeVisibility').value || 'private'
      }
    };
  }

  function resetNoticeForm(message){
    NOTICE_EDITING_ID = '';
    ['ntTitle','ntMessage','ntExpires','ntEirPrefixes','ntStreets','ntEircodes','ntEmails'].forEach(id => { if(byId(id)) byId(id).value = ''; });
    if(byId('ntCategory')) byId('ntCategory').value = 'General';
    if(byId('ntHomeEnabled')) byId('ntHomeEnabled').checked = false;
    if(byId('ntHomeVisibility')) byId('ntHomeVisibility').value = 'private';
    if(byId('ntAllLogged')) byId('ntAllLogged').checked = true;
    if(byId('ntNonAdminOnly')) byId('ntNonAdminOnly').checked = false;
    $$('.ntRole').forEach(x => x.checked = false);
    if(byId('btnNtPublish')) byId('btnNtPublish').textContent = 'Publish notice';
    if(byId('ntMsg')) byId('ntMsg').textContent = message || '';
  }

  function populateNoticeForm(notice){
    const n = notice && typeof notice === 'object' ? notice : {};
    const targets = n.targets || n.target || {};
    const home = n.home || {};

    NOTICE_EDITING_ID = String(n.id || '');
    if(byId('ntTitle')) byId('ntTitle').value = String(n.title || '');
    if(byId('ntMessage')) byId('ntMessage').value = String(n.message || '');
    if(byId('ntCategory')) byId('ntCategory').value = String(n.category || 'General') || 'General';
    if(byId('ntExpires')) byId('ntExpires').value = String(n.expires || n.expiresAt || n.endsOn || n.endDate || '').slice(0, 10);
    if(byId('ntHomeEnabled')) byId('ntHomeEnabled').checked = !!(home.enabled || n.showOnHome);
    if(byId('ntHomeVisibility')) byId('ntHomeVisibility').value = String(home.visibility || ((n.public || n.isPublic) ? 'public' : 'private')) || 'private';
    if(byId('ntAllLogged')) byId('ntAllLogged').checked = ('allLogged' in targets) ? !!targets.allLogged : true;
    if(byId('ntNonAdminOnly')) byId('ntNonAdminOnly').checked = !!targets.nonAdminOnly;
    if(byId('ntEirPrefixes')) byId('ntEirPrefixes').value = Array.isArray(targets.eirPrefixes) ? targets.eirPrefixes.join(', ') : '';
    if(byId('ntStreets')) byId('ntStreets').value = Array.isArray(targets.streets) ? targets.streets.join(', ') : '';
    if(byId('ntEircodes')) byId('ntEircodes').value = Array.isArray(targets.eircodes) ? targets.eircodes.join('\n') : '';
    if(byId('ntEmails')) byId('ntEmails').value = Array.isArray(targets.emails) ? targets.emails.join('\n') : '';
    $$('.ntRole').forEach(x => {
      x.checked = Array.isArray(targets.roles) && targets.roles.includes(x.value);
    });
    if(byId('btnNtPublish')) byId('btnNtPublish').textContent = 'Update notice';
    if(byId('ntMsg')) byId('ntMsg').textContent = 'Editing selected notice.';
  }

  async function startEditNotice(id){
    const list = await loadNoticesFresh();
    const notice = (list || []).find(n => String((n && n.id) || '') === String(id || ''));
    if(!notice){
      if(byId('ntMsg')) byId('ntMsg').textContent = 'Notice not found.';
      return;
    }
    populateNoticeForm(notice);
    try{ byId('ntTitle')?.focus(); }catch(_){ }
  }

  async function publishNotice(){
    const msg = byId('ntMsg');
    const form = collectNoticeForm();
    if(!form.title || !form.message){
      msg.textContent = 'Title and message are required.';
      return;
    }

    const list = await loadNoticesFresh();
    const editId = String(NOTICE_EDITING_ID || '').trim();
    const nowIso = new Date().toISOString();
    const current = editId ? (list || []).find(n => String((n && n.id) || '') === editId) : null;
    const payload = Object.assign({}, current || {}, {
      id: editId || ('nt_' + Date.now()),
      title: form.title,
      message: form.message,
      category: form.category,
      createdAt: current && current.createdAt ? current.createdAt : nowIso,
      updatedAt: nowIso,
      expires: form.expires,
      public: form.home.enabled && form.home.visibility === 'public',
      isPublic: form.home.enabled && form.home.visibility === 'public',
      showOnHome: !!form.home.enabled,
      published: true,
      status: (form.home.enabled && form.home.visibility === 'public') ? 'public' : 'private',
      targets: form.targets,
      home: form.home
    });

    const filtered = (list || []).filter(n => String((n && n.id) || '') !== String(payload.id || ''));
    const next = [payload].concat(filtered);

    await anwSaveSafe(window.getNoticesKey(), next);
    resetNoticeForm(editId ? 'Notice updated.' : 'Notice published.');
    await renderNoticesList();
  }

  function renderNoticeRowActions(n){
    return `
      <div class="notice-actions">
        <button type="button" class="btn btn-line small" data-edit-notice="${esc(n.id || '')}">Edit</button>
        <button type="button" class="btn btn-line small" data-del-notice="${esc(n.id || '')}">Delete</button>
      </div>
    `;
  }

  async function deleteNoticeById(id){
    const list = await loadNoticesFresh();
    const next = (list || []).filter(n => String((n && n.id) || '') !== String(id || ''));
    await anwSaveSafe(window.getNoticesKey(), next);
    await renderNoticesList();
  }

  async function clearImportedBinNotices(){
    const list = await loadNoticesFresh();
    const next = (list || []).filter(n => !(n && n.meta && n.meta.type === 'bin_collection_import'));
    await anwSaveSafe(window.getNoticesKey(), next);
    byId('binMsg').textContent = 'Imported bin notices removed from dashboard notices.';
    await renderNoticesList();
  }

  async function renderNoticesList(){
    const listEl = byId('ntList');
    const notes = await loadNoticesFresh();
    const sorted = (notes || []).slice().sort((a,b)=> Date.parse(b?.createdAt||0) - Date.parse(a?.createdAt||0));

    if(byId('ntListMsg')){
      byId('ntListMsg').textContent = sorted.length ? `${sorted.length} notice(s) saved.` : 'No notices found.';
    }

    listEl.innerHTML = sorted.map(n => `
      <div class="card" style="padding:12px; margin-bottom:10px;">
        <div>
          <strong>${esc(n.title || 'Untitled')}</strong>
          <div class="tiny muted">${esc(n.category || 'General')} · ${esc(fmtDate(n.createdAt || n.date || ''))}</div>
          <div style="margin-top:6px;">${esc(n.message || '')}</div>

          <div class="notice-card-meta">
            <span class="notice-chip">Home: ${(n.home && n.home.enabled) ? esc(n.home.visibility || 'private') : 'disabled'}</span>
            ${n.date ? `<span class="notice-chip">Collection date: ${esc(fmtDateShort(n.date))}</span>` : ''}
            ${n.startsOn ? `<span class="notice-chip">Show from: ${esc(fmtDateShort(n.startsOn))}</span>` : ''}
            ${n.endsOn ? `<span class="notice-chip">Show until: ${esc(fmtDateShort(n.endsOn))}</span>` : ''}
          </div>

          ${renderNoticeRowActions(n)}
        </div>
      </div>
    `).join('') || '<p class="tiny muted">No notices found.</p>';

    $$('[data-edit-notice]', listEl).forEach(btn => {
      btn.addEventListener('click', async () => {
        await startEditNotice(btn.getAttribute('data-edit-notice'));
      });
    });

    $$('[data-del-notice]', listEl).forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-notice');
        if(String(NOTICE_EDITING_ID || '') === String(id || '')){
          resetNoticeForm('Notice removed.');
        }
        await deleteNoticeById(id);
      });
    });
  }

  async function importPandaSchedule(){
    const fileEl = byId('binCsvFile');
    const msg = byId('binMsg');
    const file = fileEl && fileEl.files && fileEl.files[0];
    if(!file){
      msg.textContent = 'Please select the CSV file first.';
      return;
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    const imported = [];
    for(const line of lines){
      const cols = parseCsvLine(line);
      if(!cols.length) continue;

      const headerLike = cols.join(' ').toLowerCase();
      if(headerLike.includes('date') && headerLike.includes('provider')) continue;
      if(cols.length < 3) continue;

      const date = parseFlexibleDate(cols[0]);
      if(!date) continue;

      const provider = String(cols[1] || '').trim();
      const bin = String(cols[2] || '').trim();
      const visibility = String(cols[3] || 'public').trim().toLowerCase();

      const startsOn = startOfWeekMonday(date);
      const endsOn = endOfNextWeekSunday(date);

      imported.push({
        id: `bin_${date}_${slugify(bin)}`,
        title: 'Bin collection update',
        message: `${bin} bin collection scheduled for ${date}.`,
        category: 'Bins',
        provider,
        bin,
        date,
        startsOn,
        endsOn,
        startDate: startsOn,
        endDate: endsOn,
        createdAt: new Date().toISOString(),
        showOnHome: true,
        public: true,
        isPublic: true,
        published: true,
        status: visibility === 'private' ? 'private' : 'public',
        home: { enabled: true, visibility: 'public' },
        meta: { type: 'bin_collection_import' }
      });
    }

    const current = sanitizeNoticeCollection(await anwLoadSafe(KEY_NOTICES, []));
    const kept = current.filter(n => !(n && n.meta && n.meta.type === 'bin_collection_import'));
    const merged = sanitizeNoticeCollection([...kept, ...imported]);

    await anwSaveSafe(KEY_NOTICES, merged);

    msg.textContent = `${imported.length} collection row(s) imported and saved.`;
    if(fileEl) fileEl.value = '';
    await renderNoticesList();
  }

  // ---------- Light stubs for remaining tabs ----------
  async function renderSimpleTable(key, tbodyId, emptyId, mapRow){
    const rows = await anwLoadSafe(key, []);
    const body = byId(tbodyId);
    const empty = byId(emptyId);
    if(!body) return;
    body.innerHTML = rows.map(mapRow).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  const REPORT_STATUS_LABELS = {
    submitted:'Submitted',
    open:'Open',
    in_review:'In review',
    review:'Review',
    pending:'Pending',
    sent_to_garda:'Sent to Gardaí',
    resolved:'Resolved',
    closed:'Closed',
    historical:'Historical',
    blocked:'Blocked',
    suspended:'Suspended',
    deleted:'Deleted'
  };
  let REPORTS_CACHE = [];
  let CURRENT_REPORT_ID = '';

  function normStatus(value){
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '_');
  }
  function reportStatusLabel(value){
    const key = normStatus(value) || 'submitted';
    return REPORT_STATUS_LABELS[key] || String(value || 'submitted').replace(/_/g, ' ').replace(/(^|\s)\S/g, s => s.toUpperCase());
  }
  function reportStatusClass(value){
    const key = normStatus(value);
    if(['resolved','closed'].includes(key)) return 'tag ok';
    if(['historical','blocked','suspended','deleted'].includes(key)) return 'tag gray';
    return 'tag';
  }
  function reportAttachmentSummary(report){
    const list = Array.isArray(report?.attachments) ? report.attachments : [];
    if(!list.length) return 'No attachment metadata stored.';
    return list.map((item) => {
      if(typeof item === 'string') return item;
      const parts = [item.filename || item.name || 'attachment'];
      if(item.size != null && item.size !== '') parts.push(String(item.size));
      if(item.type) parts.push(String(item.type));
      return parts.join(' — ');
    }).join('\n');
  }
  function reportSearchHaystack(report){
    return [
      report.id,
      report.category,
      report.location,
      report.address,
      report.email,
      report.reporterEmail,
      report.status,
      report.description,
      report.notes,
      report.adminNotes
    ].map(v => String(v || '').toLowerCase()).join(' ');
  }
  function reportSortValue(report){
    return Date.parse(report.updatedAt || report.createdAt || report.created || report.date || 0) || 0;
  }
  function closeReportDetail(){
    CURRENT_REPORT_ID = '';
    const card = byId('repDetailCard');
    if(card) card.style.display = 'none';
  }
  function openReportDetail(reportId){
    const report = REPORTS_CACHE.find(r => String(r.id || '') === String(reportId || ''));
    if(!report) return;
    CURRENT_REPORT_ID = String(report.id || '');
    byId('repDetailId').value = report.id || '';
    byId('repDetailCreated').value = fmtDate(report.createdAt || report.created || report.date || '');
    byId('repDetailCategory').value = report.category || '—';
    byId('repDetailLocation').value = report.location || report.address || '—';
    byId('repDetailEmail').value = report.email || report.reporterEmail || '—';
    byId('repDetailDescription').value = report.description || report.notes || '';
    byId('repDetailAttachments').value = reportAttachmentSummary(report);
    byId('repDetailStatus').value = normStatus(report.status || 'submitted') || 'submitted';
    byId('repDetailNotes').value = report.adminNotes || '';
    const card = byId('repDetailCard');
    if(card) card.style.display = 'block';
  }
  async function updateReportStatus(nextStatus){
    if(!CURRENT_REPORT_ID) return;
    const rows = await anwLoadSafe(KEY_REPORTS, []);
    const next = Array.isArray(rows) ? rows.slice() : [];
    const idx = next.findIndex(r => String(r && r.id || '') === CURRENT_REPORT_ID);
    if(idx < 0) return;
    const existing = Object.assign({}, next[idx]);
    existing.status = normStatus(nextStatus || byId('repDetailStatus')?.value || existing.status || 'submitted');
    existing.adminNotes = String(byId('repDetailNotes')?.value || '').trim();
    existing.updatedAt = new Date().toISOString();
    next[idx] = existing;
    await anwSaveSafe(KEY_REPORTS, next);
    byId('repMsg').textContent = `Report ${existing.id || ''} saved with status ${reportStatusLabel(existing.status)}.`.trim();
    await loadReports();
    openReportDetail(existing.id);
  }
  async function loadReports(){
    const rows = await anwLoadSafe(KEY_REPORTS, []);
    REPORTS_CACHE = (Array.isArray(rows) ? rows.slice() : []).sort((a,b) => reportSortValue(b) - reportSortValue(a));
    const filterStatus = normStatus(byId('repStatusFilter')?.value || 'all');
    const query = String(byId('repSearch')?.value || '').trim().toLowerCase();
    const filtered = REPORTS_CACHE.filter((report) => {
      const statusOk = filterStatus === 'all' || normStatus(report.status || 'submitted') === filterStatus;
      const queryOk = !query || reportSearchHaystack(report).includes(query);
      return statusOk && queryOk;
    });
    const body = byId('repBody');
    const empty = byId('repEmpty');
    if(!body) return;
    body.innerHTML = filtered.map((r) => `
      <tr>
        <td>${esc(r.id || '—')}</td>
        <td>${esc(fmtDate(r.createdAt || r.created || r.date || ''))}</td>
        <td>${esc(r.category || '—')}</td>
        <td>${esc(r.location || r.address || '—')}</td>
        <td>${esc(r.email || r.reporterEmail || '—')}</td>
        <td><span class="${reportStatusClass(r.status)}">${esc(reportStatusLabel(r.status || 'submitted'))}</span></td>
        <td>
          <div class="actions" style="justify-content:flex-start; gap:0.4rem; flex-wrap:wrap;">
            <button type="button" class="btn-line small" data-rep-view="${esc(r.id || '')}">View</button>
            <button type="button" class="btn-line small" data-rep-historical="${esc(r.id || '')}">Historical</button>
          </div>
        </td>
      </tr>
    `).join('');
    if(empty) empty.style.display = filtered.length ? 'none' : 'block';
    byId('repMsg').textContent = filtered.length ? `${filtered.length} report${filtered.length === 1 ? '' : 's'} shown.` : 'No reports match the current filters.';
    $$('#repBody [data-rep-view]').forEach((btn) => btn.addEventListener('click', () => openReportDetail(btn.getAttribute('data-rep-view'))));
    $$('#repBody [data-rep-historical]').forEach((btn) => btn.addEventListener('click', async () => {
      openReportDetail(btn.getAttribute('data-rep-historical'));
      await updateReportStatus('historical');
    }));
  }

  async function loadProjects(){
    await renderSimpleTable(KEY_PROJECTS, 'pmBody', 'pmEmpty', p => `
      <tr>
        <td>${esc(p.id || '—')}</td>
        <td>${esc(p.title || p.project || '—')}</td>
        <td>${esc(p.status || '—')}</td>
        <td>${esc(p.owner || '—')}</td>
        <td>${esc(fmtDate(p.updatedAt || p.updated || ''))}</td>
        <td><button type="button" class="btn-line small" disabled>View</button></td>
      </tr>
    `);
    await renderSimpleTable(KEY_PROJECT_RECIPIENTS, 'pmRecipientsBody', 'pmRecipientsEmpty', p => `
      <tr>
        <td>${esc(p.project || p.projectTitle || '—')}</td>
        <td>${esc(p.recipient || p.name || '—')}</td>
        <td>${esc([p.address, p.eircode].filter(Boolean).join(' · ') || '—')}</td>
        <td>${esc(p.status || '—')}</td>
        <td>${esc(fmtDate(p.updatedAt || p.updated || ''))}</td>
      </tr>
    `);
  }

  
  
  const ACL_ROLES = ['public','resident','street_coordinator','assistant_area_coordinator','area_coordinator','projects','owner'];

  const ACL_ITEMS = [
    { key:'page:home', label:'Home', group:'Site pages', indent:0, defaults:{ public:true } },
    { key:'page:about', label:'About', group:'Site pages', indent:0, defaults:{ public:true } },
    { key:'page:report', label:'Report Incident', group:'Site pages', indent:0, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'report:tab_incident', label:'Report · Report incident', group:'Site pages', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'report:tab_status', label:'Report · My reports status', group:'Site pages', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'report:tab_map', label:'Report · Incidents overview', group:'Site pages', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'page:alerts', label:'Community Alerts', group:'Site pages', indent:0, defaults:{ assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'alerts:tab_send_alert', label:'Alerts · Send alert', group:'Site pages', indent:1, defaults:{ assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'alerts:tab_send_action', label:'Alerts · Send action', group:'Site pages', indent:1, defaults:{ assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'alerts:tab_authorised_contacts', label:'Alerts · Authorised contacts', group:'Site pages', indent:1, defaults:{ assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'page:projects', label:'Community Projects page', group:'Projects', indent:0, defaults:{ projects:true, area_coordinator:true, owner:true } },
    { key:'projects:tab_monitoring', label:'Projects · Monitoring', group:'Projects', indent:1, defaults:{ projects:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'projects:tab_builder', label:'Projects · Build project', group:'Projects', indent:1, defaults:{ projects:true, area_coordinator:true, owner:true } },
    { key:'projects:tab_published', label:'Projects · Confirm sending', group:'Projects', indent:1, defaults:{ projects:true, area_coordinator:true, owner:true } },
    { key:'page:handbook', label:'Handbook', group:'Site pages', indent:0, defaults:{ public:true } },
    { key:'page:help_center', label:'Help', group:'Site pages', indent:0, defaults:{ public:true } },
    { key:'page:privacy', label:'Privacy Policy', group:'Site pages', indent:0, defaults:{ public:true } },
    { key:'page:login', label:'Login / Register', group:'Site pages', indent:0, defaults:{ public:true } },

    { key:'page:dashboard', label:'Dashboard', group:'Dashboard', indent:0, defaults:{ public:true } },
    { key:'dashboard:tab_profile', label:'Dashboard · Profile', group:'Dashboard', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'dashboard:tab_parking', label:'Dashboard · Parking & Vehicles', group:'Dashboard', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'dashboard:tab_interest', label:'Dashboard · Interest', group:'Dashboard', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'dashboard:tab_elections', label:'Dashboard · Elections', group:'Dashboard', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'dashboard:tab_notices', label:'Dashboard · Notices', group:'Dashboard', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, projects:true, owner:true } },
    { key:'dashboard:tab_garda', label:'Dashboard · Garda & Safety', group:'Dashboard', indent:1, defaults:{ public:true } },

    { key:'page:household', label:'Household', group:'Residents', indent:0, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'household:tab_volunteers', label:'Household · Household volunteers', group:'Residents', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'household:tab_tasks', label:'Household · Volunteer tasks', group:'Residents', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'page:resident-profile', label:'Resident profile data', group:'Residents', indent:1, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'page:street-management', label:'Street management', group:'Residents', indent:1, defaults:{ street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
    { key:'page:regional-management', label:'Regional management', group:'Residents', indent:1, defaults:{ assistant_area_coordinator:true, area_coordinator:true, owner:true } },

    { key:'page:admin', label:'Admin panel', group:'Owner controls', indent:0, defaults:{ owner:true } },
    { key:'page:access-control', label:'Access Control sub-tab', group:'Owner controls', indent:1, defaults:{ owner:true } },
    { key:'page:admin-parking', label:'Admin · Parking & Vehicles', group:'Owner controls', indent:1, defaults:{ owner:true } },
    { key:'page:report-map', label:'Report Map', group:'Site pages', indent:0, defaults:{ resident:true, street_coordinator:true, assistant_area_coordinator:true, area_coordinator:true, owner:true } },
  ];

  const ROLE_RANK = {
    public: 0,
    resident: 1,
    street_coordinator: 2,
    assistant_area_coordinator: 3,
    area_coordinator: 4,
    projects: 4,
    owner: 5
  };

  let ACCESS_RULES_CACHE = [];

  function aclEmptyRule(item){
    const out = { key:item.key, label:item.label, group:item.group || '', indent:Number(item.indent || 0) };
    ACL_ROLES.forEach(role => { out[role] = false; });
    const defaults = item.defaults || {};
    Object.keys(defaults).forEach(k => { out[k] = !!defaults[k]; });
    return out;
  }

  function classifyMatrixToRule(entry){
    if(entry.public) return 'Public';

    const selected = ACL_ROLES.filter(role => role !== 'public' && !!entry[role]);
    if(!selected.length) return 'owner';

    if(selected.length === ACL_ROLES.length - 1) return 'Authenticated';

    const rankMap = selected.map(role => ROLE_RANK[role] ?? 999);
    const minRank = Math.min(...rankMap);
    const rankMatchedRoles = selected.filter(role => (ROLE_RANK[role] ?? 999) === minRank);

    if(rankMatchedRoles.length === 1){
      return rankMatchedRoles[0];
    }

    if(rankMatchedRoles.includes('projects') && rankMatchedRoles.length === 1){
      return 'projects';
    }

    return 'Authenticated';
  }

  function applyRuleToRow(row, rule){
    const clean = String(rule == null ? '' : rule).trim();
    ACL_ROLES.forEach(role => { row[role] = false; });

    if(clean === 'Public'){
      row.public = true;
      return;
    }

    if(clean === 'Authenticated'){
      ACL_ROLES.filter(role => role !== 'public').forEach(role => { row[role] = true; });
      return;
    }

    if(clean === 'projects'){
      row.projects = true;
      row.owner = true;
      return;
    }

    const rank = ROLE_RANK[clean];
    if(typeof rank === 'number'){
      ACL_ROLES.filter(role => role !== 'public').forEach(role => {
        const roleRank = ROLE_RANK[role];
        if(typeof roleRank === 'number' && roleRank >= rank){
          row[role] = true;
        }
      });
    }
  }

  function mapSavedAclToMatrix(saved){
    const matrix = ACL_ITEMS.map(aclEmptyRule);

    const source = (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
    const matrixSource = (source.__matrix && typeof source.__matrix === 'object') ? source.__matrix : {};

    matrix.forEach((row) => {
      const fromMatrix = matrixSource[row.key];
      if(fromMatrix && typeof fromMatrix === 'object'){
        ACL_ROLES.forEach(role => {
          if(role in fromMatrix) row[role] = !!fromMatrix[role];
        });
        return;
      }

      const direct = (
        Object.prototype.hasOwnProperty.call(source, row.key) ? source[row.key] :
        source.features && Object.prototype.hasOwnProperty.call(source.features, row.key) ? source.features[row.key] :
        null
      );

      applyRuleToRow(row, direct);
    });

    return matrix;
  }

  function matrixToAclPayload(matrix){
    const payload = {
      features:{},
      pages:{},
      publicFeatures:[],
      __matrix:{},
      rolesMeta:{
        order:['public','resident','street_coordinator','assistant_area_coordinator','area_coordinator','projects','owner'],
        rank: ROLE_RANK
      }
    };

    matrix.forEach((row) => {
      const rule = classifyMatrixToRule(row);
      payload[row.key] = rule;
      payload.__matrix[row.key] = Object.fromEntries(ACL_ROLES.map(role => [role, !!row[role]]));

      if(row.key.startsWith('dashboard:') || row.key.startsWith('projects:')){
        payload.features[row.key] = rule;
        if(row.public) payload.publicFeatures.push(row.key);
      }

      if(row.key === 'page:dashboard'){
        payload.pages['page:dashboard'] = payload.pages['page:dashboard'] || { shell: rule, features:{} };
        payload.pages['page:dashboard'].shell = rule;
      }

      if(row.key.startsWith('dashboard:tab_')){
        payload.pages['page:dashboard'] = payload.pages['page:dashboard'] || { shell:'resident', features:{} };
        payload.pages['page:dashboard'].features[row.key] = rule;
      }

      if(row.key === 'page:projects'){
        payload.pages['page:projects'] = payload.pages['page:projects'] || { shell: rule, features:{} };
        payload.pages['page:projects'].shell = rule;
      }

      if(row.key.startsWith('projects:tab_')){
        payload.pages['page:projects'] = payload.pages['page:projects'] || { shell:'projects', features:{} };
        payload.pages['page:projects'].features[row.key] = rule;
      }
    });

    return payload;
  }

  function renderAccessControlFromData(rules){
    const body = byId('acBody');
    if(!body) return;

    let lastGroup = '';
    body.innerHTML = rules.map((r, idx) => {
      const groupHeader = (r.group && r.group !== lastGroup)
        ? `<tr class="ac-group"><td colspan="8"><strong>${esc(r.group)}</strong></td></tr>`
        : '';
      lastGroup = r.group || lastGroup;

      return `${groupHeader}
      <tr data-ac-row="${idx}">
        <td>
          <div class="ac-item">
            <div>
              <div class="ac-indent-${Math.min(Number(r.indent || 0), 3)}">${esc(r.label)}</div>
              <div class="ac-key">${esc(r.key)}</div>
            </div>
          </div>
        </td>
        ${ACL_ROLES.map(role => `
          <td>
            <button
              type="button"
              class="ac-toggle ${r[role] ? 'allowed' : 'denied'}"
              data-role="${role}"
              data-row="${idx}"
              title="${role === 'public' ? 'Visible without login' : role.replaceAll('_',' ')}"
            >${r[role] ? '✓' : '—'}</button>
          </td>
        `).join('')}
      </tr>`;
    }).join('');

    $$('.ac-toggle', body).forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = Number(btn.getAttribute('data-row'));
        const role = btn.getAttribute('data-role');
        if(!Number.isFinite(row) || !rules[row]) return;

        if(role === 'public'){
          const next = !rules[row].public;
          ACL_ROLES.forEach(k => { rules[row][k] = false; });
          rules[row].public = next;
        } else {
          rules[row][role] = !rules[row][role];
          if(rules[row][role]) rules[row].public = false;
        }

        ACCESS_RULES_CACHE = rules;
        renderAccessControlFromData(rules);
      });
    });

    byId('btnAcSave').onclick = async () => {
      const payload = matrixToAclPayload(rules);
      await anwSaveSafe(KEY_ACCESS, payload);
      try{
        if(typeof window.anwSave === 'function') window.anwSave(KEY_ACCESS, payload);
      }catch(_){}
      byId('acMsg').textContent = 'Access rules saved. Pages and sub-tabs are now linked to the new role-based ACL.';
    };

    byId('btnAcPrint').onclick = () => {
      document.body.classList.add('print-access-control');
      window.print();
      setTimeout(() => document.body.classList.remove('print-access-control'), 200);
    };

    byId('btnAcRefresh').onclick = loadAccessControl;
  }

  async function loadAccessControl(){
    const saved = await anwLoadSafe(KEY_ACCESS, {});
    ACCESS_RULES_CACHE = mapSavedAclToMatrix(saved);
    renderAccessControlFromData(ACCESS_RULES_CACHE);
  }



  async function loadDiagnostics(){
    const data = {
      users: (await anwLoadSafe(KEY_USERS, [])).length,
      notices: (await anwLoadSafe(window.getNoticesKey(), [])).length,
      reports: (await anwLoadSafe(KEY_REPORTS, [])).length,
      projects: (await anwLoadSafe(KEY_PROJECTS, [])).length
    };
    byId('diagOut').textContent = JSON.stringify(data, null, 2);
  }

  // ---------- Events ----------
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.admin-tab');
    if(btn){ showAdminTab(btn.getAttribute('data-tab')); }

    const rtab = ev.target.closest('.resident-tab');
    if(rtab){ showResidentSubtab(rtab.getAttribute('data-subtab')); }

    const etab = ev.target.closest('.elect-tab');
    if(etab){ showElectionSubtab(etab.getAttribute('data-subtab')); }
  });

  byId('btnCloseResident')?.addEventListener('click', closeResidentModal);
  byId('modalResident')?.addEventListener('click', (ev) => {
    if(ev.target === byId('modalResident')) closeResidentModal();
  });
  byId('btnSaveResident')?.addEventListener('click', () => saveCurrentResident());
  byId('btnApprove')?.addEventListener('click', async () => { await saveCurrentResident('approved'); closeResidentModal(); });
  byId('btnReject')?.addEventListener('click', async () => { await saveCurrentResident('rejected'); closeResidentModal(); });
  byId('btnSuspendResident')?.addEventListener('click', async () => { await saveCurrentResident('suspended'); closeResidentModal(); });
  byId('btnRemoveResident')?.addEventListener('click', async () => {
    if(!CURRENT_RESIDENT) return;
    const users = await anwLoadSafe(KEY_USERS, []);
    const next = users.filter(u => String(u.email||'').toLowerCase() !== String(CURRENT_RESIDENT.email||'').toLowerCase());
    await anwSaveSafe(KEY_USERS, next);
    RESIDENTS_CACHE = next;
    closeResidentModal();
    renderResidents('all');
  });

  byId('btnNtPublish')?.addEventListener('click', publishNotice);
  byId('btnNtClear')?.addEventListener('click', () => resetNoticeForm(''));

  byId('btnBinImport')?.addEventListener('click', importPandaSchedule);
  byId('btnClearBinNotices')?.addEventListener('click', clearImportedBinNotices);

  byId('btnRepRefresh')?.addEventListener('click', loadReports);
  byId('repStatusFilter')?.addEventListener('change', loadReports);
  byId('repSearch')?.addEventListener('input', loadReports);
  byId('btnRepExport')?.addEventListener('click', async () => downloadText('reports.json', JSON.stringify(await anwLoadSafe(KEY_REPORTS, []), null, 2)));
  byId('btnRepCloseDetail')?.addEventListener('click', closeReportDetail);
  byId('btnRepSaveDetail')?.addEventListener('click', async () => { await updateReportStatus(); });
  byId('btnRepMarkHistorical')?.addEventListener('click', async () => { byId('repDetailStatus').value = 'historical'; await updateReportStatus('historical'); });
  byId('btnPmRefresh')?.addEventListener('click', loadProjects);
  byId('btnAcRefresh')?.addEventListener('click', loadAccessControl);
  byId('btnDiagRun')?.addEventListener('click', loadDiagnostics);

  byId('btnExportUsers')?.addEventListener('click', async () => downloadText('residents.json', JSON.stringify(await anwLoadSafe(KEY_USERS, []), null, 2)));
  byId('btnExportNotices')?.addEventListener('click', async () => downloadText('notices.json', JSON.stringify(await loadNoticesFresh(), null, 2)));
  byId('btnExportReports')?.addEventListener('click', async () => downloadText('reports.json', JSON.stringify(await anwLoadSafe(KEY_REPORTS, []), null, 2)));
  byId('btnExportProjects')?.addEventListener('click', async () => downloadText('projects.json', JSON.stringify(await anwLoadSafe(KEY_PROJECTS, []), null, 2)));

  
  async function getAdminAuthHeaders(extra){
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    try{
      const u = (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === 'function')
        ? window.netlifyIdentity.currentUser()
        : null;
      if(u && typeof u.jwt === 'function'){
        const token = await u.jwt();
        if(token) headers.Authorization = 'Bearer ' + token;
      }
    }catch(_){}
    return headers;
  }

  async function ensureBackupSettings(){
    try{
      const current = await anwLoadSafe('anw_backup_settings', null);
      if(current && typeof current === 'object' && current.enabled === true) return current;
      const next = Object.assign({}, current || {}, {
        enabled: true,
        schedule: '0 2 * * *',
        timezone: 'UTC',
        updatedAt: new Date().toISOString()
      });
      await anwSaveSafe('anw_backup_settings', next);
      return next;
    }catch(_){
      return { enabled:true, schedule:'0 2 * * *', timezone:'UTC' };
    }
  }

  function formatBackupSize(bytes){
    const n = Number(bytes || 0);
    if(!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    let size = n;
    let idx = 0;
    while(size >= 1024 && idx < units.length - 1){
      size /= 1024;
      idx += 1;
    }
    const unit = units[idx];
    const decimals = size >= 100 || unit === 'B' ? 0 : size >= 10 ? 1 : 2;
    return size.toFixed(decimals) + ' ' + unit;
  }

  function buildBackupDisplayName(item){
    const id = String(item && item.id ? item.id : '').trim();
    return id ? (id + '.json') : 'latest backup';
  }

  async function getLatestBackupDetails(){
    const headers = await getAdminAuthHeaders();
    const listRes = await fetch('/.netlify/functions/backup-list', {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    const listData = await listRes.json().catch(() => ({}));
    if(!listRes.ok || listData.ok === false){
      throw new Error(listData.error || 'Unable to load backup list');
    }

    const items = Array.isArray(listData.items) ? listData.items : [];
    const latest = items[0] || null;
    if(!latest || !latest.id){
      throw new Error('No backup is available to restore yet.');
    }

    const downloadRes = await fetch('/.netlify/functions/backup-download?id=' + encodeURIComponent(latest.id), {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    const raw = await downloadRes.text();
    let snapshot = null;
    try{
      snapshot = raw ? JSON.parse(raw) : null;
    }catch(_){
      snapshot = null;
    }
    if(!downloadRes.ok || !snapshot || typeof snapshot !== 'object'){
      const fallbackError = snapshot && snapshot.error ? snapshot.error : 'Unable to load latest backup file';
      throw new Error(fallbackError);
    }

    const sizeBytes = new Blob([raw]).size;
    return {
      id: String(snapshot.id || latest.id || '').trim(),
      name: buildBackupDisplayName(snapshot.id ? snapshot : latest),
      createdAt: snapshot.createdAt || latest.createdAt || '',
      sizeBytes,
      sizeLabel: formatBackupSize(sizeBytes),
      snapshot
    };
  }

  function normalizePreviewValue(value){
    return JSON.stringify(value == null ? null : value);
  }

  function getCollectionCount(value){
    if(Array.isArray(value)) return value.length;
    if(value && typeof value === 'object') return Object.keys(value).length;
    return value == null ? 0 : 1;
  }

  function buildKeyLabel(key){
    return String(key || '')
      .replace(/^anw_/,'')
      .replace(/_/g,' ')
      .replace(/\bv1\b/gi,'')
      .replace(/\s+/g,' ')
      .trim()
      .replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  async function loadLiveStoreValue(key, headers){
    const res = await fetch('/.netlify/functions/store?key=' + encodeURIComponent(key), {
      method: 'GET',
      headers,
      cache: 'no-store'
    });
    if(!res.ok){
      throw new Error('Unable to load current live data for ' + key);
    }
    return await res.json().catch(() => null);
  }

  async function buildRestorePreview(){
    const headers = await getAdminAuthHeaders();
    const latest = await getLatestBackupDetails();
    const snapshot = latest.snapshot;
    if(!snapshot || typeof snapshot !== 'object' || !snapshot.data){
      throw new Error('Unable to load latest backup contents');
    }

    const keys = Array.isArray(snapshot.includes) && snapshot.includes.length
      ? snapshot.includes
      : Object.keys(snapshot.data || {});
    const lines = [];
    let changed = 0;

    for(const key of keys){
      const backupValue = Object.prototype.hasOwnProperty.call(snapshot.data, key) ? snapshot.data[key] : null;
      const liveValue = await loadLiveStoreValue(key, headers);
      const backupCount = getCollectionCount(backupValue);
      const liveCount = getCollectionCount(liveValue);
      const changedHere = normalizePreviewValue(backupValue) !== normalizePreviewValue(liveValue);
      if(changedHere) changed += 1;

      const delta = backupCount - liveCount;
      const deltaText = delta === 0 ? '0' : (delta > 0 ? ('+' + delta) : String(delta));
      lines.push(
        buildKeyLabel(key) + ': current ' + liveCount + ' → backup ' + backupCount +
        ' (delta ' + deltaText + ')' +
        (changedHere ? ' [will change]' : ' [no change]')
      );
    }

    const summary = [
      'Preview of latest backup restore',
      '',
      'File: ' + latest.name,
      'Date: ' + (latest.createdAt ? fmtDate(latest.createdAt) : 'Unknown date'),
      'Size: ' + latest.sizeLabel,
      'Data groups checked: ' + keys.length,
      'Groups that will change: ' + changed,
      '',
      lines.join('\n')
    ].join('\n');

    return {
      latest: latest,
      snapshot: snapshot,
      changed: changed,
      keys: keys,
      text: summary
    };
  }

  function renderRestorePreview(preview){
    const card = byId('backupPreviewCard');
    const meta = byId('backupPreviewMeta');
    const textEl = byId('backupPreviewText');
    const badge = byId('backupPreviewBadge');
    if(card) card.style.display = 'block';
    if(meta){
      meta.textContent = [
        preview.latest.name,
        preview.latest.createdAt ? fmtDate(preview.latest.createdAt) : 'Unknown date',
        preview.latest.sizeLabel
      ].join(' • ');
    }
    if(textEl) textEl.textContent = preview.text;
    if(badge){
      badge.textContent = preview.changed > 0 ? 'Changes detected' : 'No changes';
      badge.className = preview.changed > 0 ? 'tag ok' : 'tag gray';
    }
  }

  async function refreshBackupStatus(){
    const statusText = byId('backupStatusText');
    const statusBadge = byId('backupStatusBadge');
    const lastRun = byId('backupLastRun');
    const msg = byId('backupMsg');
    if(statusText) statusText.textContent = 'Checking backup status…';
    if(statusBadge){
      statusBadge.textContent = 'Checking';
      statusBadge.className = 'tag gray';
    }
    if(lastRun) lastRun.textContent = 'Last run: —';

    try{
      const settings = await ensureBackupSettings();
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/.netlify/functions/backup-list', {
        method: 'GET',
        headers,
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false){
        throw new Error(data.error || 'Unable to load backup status');
      }
      const items = Array.isArray(data.items) ? data.items : [];
      const latest = items[0] || null;
      if(statusText){
        statusText.textContent = settings.enabled
          ? 'Automatic backup is active (daily at 02:00 UTC). You can also run a manual backup now.'
          : 'Automatic backup is disabled.';
      }
      if(statusBadge){
        statusBadge.textContent = settings.enabled ? 'Active' : 'Disabled';
        statusBadge.className = settings.enabled ? 'tag ok' : 'tag gray';
      }
      if(lastRun){
        lastRun.textContent = latest && latest.createdAt
          ? ('Last run: ' + fmtDate(latest.createdAt))
          : 'Last run: none yet';
      }
      if(msg && latest && latest.id){
        msg.textContent = 'Latest backup ID: ' + latest.id;
      }else if(msg){
        msg.textContent = '';
      }
    }catch(err){
      if(statusText) statusText.textContent = 'Backup status could not be loaded.';
      if(statusBadge){
        statusBadge.textContent = 'Error';
        statusBadge.className = 'tag gray';
      }
      if(lastRun) lastRun.textContent = 'Last run: unavailable';
      if(msg) msg.textContent = String(err && err.message ? err.message : err || 'Unknown backup error');
    }
  }

  byId('btnBackupRefresh')?.addEventListener('click', refreshBackupStatus);

  byId('btnBackupNow')?.addEventListener('click', async () => {
    const msg = byId('backupMsg');
    if(msg) msg.textContent = 'Running backup now…';
    try{
      await ensureBackupSettings();
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/.netlify/functions/backup-now', {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: 'admin-manual' })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false){
        throw new Error(data.error || 'Backup failed');
      }
      if(msg) msg.textContent = 'Backup created successfully. Backup ID: ' + (data.id || 'unknown');
      await refreshBackupStatus();
    }catch(err){
      if(msg) msg.textContent = 'Backup failed: ' + String(err && err.message ? err.message : err || 'Unknown error');
    }
  });

  byId('btnPreviewRestoreBackup')?.addEventListener('click', async () => {
    const msg = byId('backupMsg');
    if(msg) msg.textContent = 'Preparing secure restore preview…';
    try{
      const preview = await buildRestorePreview();
      renderRestorePreview(preview);
      if(msg){
        msg.textContent = preview.changed > 0
          ? ('Preview ready. ' + preview.changed + ' data group(s) will change if you restore this backup.')
          : 'Preview ready. The latest backup matches the current live data.';
      }
    }catch(err){
      if(msg) msg.textContent = 'Preview failed: ' + String(err && err.message ? err.message : err || 'Unknown error');
    }
  });

  byId('btnRestoreBackup')?.addEventListener('click', async () => {
    const msg = byId('backupMsg');
    if(msg) msg.textContent = 'Checking latest backup…';
    try{
      const preview = await buildRestorePreview();
      renderRestorePreview(preview);

      const latest = preview.latest;
      const when = latest.createdAt ? fmtDate(latest.createdAt) : 'Unknown date';
      const confirmed = window.confirm([
        'Confirm secure restore of the latest backup?',
        '',
        'File: ' + latest.name,
        'Date: ' + when,
        'Size: ' + latest.sizeLabel,
        'Data groups checked: ' + preview.keys.length,
        'Groups that will change: ' + preview.changed
      ].join('\n'));
      if(!confirmed){
        if(msg) msg.textContent = 'Restore cancelled.';
        return;
      }

      if(msg) msg.textContent = 'Restoring latest backup…';
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/.netlify/functions/restore-backup', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: latest.id })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok || data.ok === false){
        throw new Error(data.error || 'Restore failed');
      }
      if(msg){
        msg.textContent = 'Restore completed successfully from backup ' +
          String(data.id || latest.id || 'latest backup') +
          (data.safetyBackupId ? (' (safety backup: ' + data.safetyBackupId + ')') : '');
      }
      await refreshBackupStatus();
    }catch(err){
      if(msg) msg.textContent = 'Restore failed: ' + String(err && err.message ? err.message : err || 'Unknown error');
    }
  });


  // ---------- Parking & Vehicles ----------
  function parkingRegistryLoad(){ return (window.anwParkingLoadRegistry && window.anwParkingLoadRegistry()) || { allocations:[], submissions:{}, policy:null }; }
  function parkingRegistrySave(data){ return (window.anwParkingSaveRegistry && window.anwParkingSaveRegistry(data)) || data; }
  function parkingNorm(v){ try{return window.anwParkingNormalizeText(v);}catch(_){return String(v||'').toLowerCase().trim();} }
  function parkingEmail(v){ try{return window.anwNormEmail(v);}catch(_){return String(v||'').toLowerCase().trim();} }
  function parkingUsers(){ return Array.isArray(RESIDENTS_CACHE) ? RESIDENTS_CACHE : []; }
  function parkingResidentName(u){ return String(u?.name || u?.fullName || [u?.firstName,u?.lastName].filter(Boolean).join(' ') || u?.email || 'Resident'); }
  function parkingFindUserForAllocation(allocation){ const users = parkingUsers(); const eir = String(allocation?.eircode || '').toUpperCase().replace(/\s+/g,''); const addr = parkingNorm(allocation?.address || ''); return users.find(u => String(u?.eircode || '').toUpperCase().replace(/\s+/g,'') === eir && eir) || users.find(u => parkingNorm(u?.address || '') === addr && addr) || null; }
  function parkingSubmissionKeyForUser(user){ const email = parkingEmail(user?.email || user?.userEmail || ''); const eir = String(user?.eircode || '').toUpperCase().replace(/\s+/g,''); return email || ('eir:' + eir); }
  function parkingBuildRows(){ const reg = parkingRegistryLoad(); const allocations = Array.isArray(reg.allocations) ? reg.allocations : []; const rows = allocations.map((allocation, idx) => { const user = parkingFindUserForAllocation(allocation) || {}; const key = parkingSubmissionKeyForUser(user); const sub = (reg.submissions && key && reg.submissions[key]) ? reg.submissions[key] : null; const type = allocation.hasParking === false ? 'No Parking' : (allocation.type || 'Single'); const status = allocation.hasParking === false ? 'No Parking' : sub?.noVehicleDeclared ? 'No Vehicle Declared' : (Array.isArray(sub?.vehicles) && sub.vehicles.some(v => !v.deletedAt) ? 'Completed' : 'Pending'); return {
      id: allocation.id || ('alloc-' + idx),
      resident: parkingResidentName(user),
      residentEmail: user?.email || user?.userEmail || '',
      address: allocation.address || user?.address || '',
      eircode: allocation.eircode || user?.eircode || '',
      space: allocation.hasParking === false ? 'N/A' : (allocation.spaceDisplay || allocation.spaceNo || allocation.space1 || ''),
      type, status, vehicles: sub?.noVehicleDeclared ? 0 : ((sub?.vehicles || []).filter(v => !v.deletedAt).length), ownerCheck: sub?.ownerConfirmed ? 'Confirmed' : (sub?.noVehicleDeclared ? 'Declared Empty' : 'Pending'), policy: sub?.acceptanceHistory?.length ? 'Accepted' : (allocation.hasParking === false ? 'N/A' : 'Pending'), updated: sub?.lastUpdatedAt || allocation.updatedAt || 'Imported', subKey:key, allocation, submission:sub
    }; }); return rows; }
  function parkingFilterRows(rows){ const q = String(byId('pkAdminSearch')?.value || '').toLowerCase().trim(); const status = String(byId('pkAdminStatusFilter')?.value || 'all'); return rows.filter(row => { const okStatus = status === 'all' || row.status === status; const hay = [row.resident,row.address,row.eircode,row.space,row.type,row.status].join(' ').toLowerCase(); return okStatus && (!q || hay.includes(q)); }); }
  function parkingStatusPill(status){ if(status==='Completed') return 'parking-admin-pill completed'; if(status==='Pending') return 'parking-admin-pill pending'; if(status==='No Parking') return 'parking-admin-pill noparking'; if(status==='No Vehicle Declared') return 'parking-admin-pill novehicle'; return 'parking-admin-pill'; }
  function parkingTypePill(type){ if(type==='Double') return 'parking-admin-pill double'; if(type==='Single') return 'parking-admin-pill single'; return 'parking-admin-pill none'; }
  function parkingRenderAdmin(){ const rows = parkingBuildRows(); const filtered = parkingFilterRows(rows); byId('pkAdminTotal').textContent = String(rows.length); byId('pkAdminCompleted').textContent = String(rows.filter(r=>r.status==='Completed').length); byId('pkAdminPending').textContent = String(rows.filter(r=>r.status==='Pending').length); byId('pkAdminNoParking').textContent = String(rows.filter(r=>r.status==='No Parking').length); byId('pkAdminNoVehicle').textContent = String(rows.filter(r=>r.status==='No Vehicle Declared').length); const body = byId('pkAdminBody'); if(!body) return; body.innerHTML = filtered.map((row, idx)=>`<tr><td>${esc(row.resident||'—')}</td><td>${esc(row.address||'—')}</td><td>${esc(row.eircode||'—')}</td><td><span class="parking-space-chip">${esc(row.space||'—')}</span></td><td><span class="${parkingTypePill(row.type)}">${esc(row.type)}</span></td><td><span class="${parkingStatusPill(row.status)}">${esc(row.status)}</span></td><td>${row.vehicles}</td><td>${esc(row.ownerCheck)}</td><td>${esc(String(row.updated||'').replace('T',' ').slice(0,16) || '—')}</td><td class="parking-admin-actions"><button type="button" class="btn-line small" data-pk-msg="${idx}">Message</button></td></tr>`).join(''); byId('pkAdminEmpty').style.display = filtered.length ? 'none' : 'block'; Array.from(body.querySelectorAll('[data-pk-msg]')).forEach(btn=>btn.addEventListener('click', ()=> parkingSendNotice(filtered[Number(btn.getAttribute('data-pk-msg'))]))); byId('parkingImportName').textContent = (parkingRegistryLoad().importMeta && parkingRegistryLoad().importMeta.name) || 'No file uploaded'; byId('parkingPolicyName').textContent = (parkingRegistryLoad().policy && parkingRegistryLoad().policy.name) || 'No file uploaded'; }
  function parkingCsvParse(text){ const lines = String(text||'').replace(/\r/g,'').split('\n').filter(Boolean); if(!lines.length) return []; const split = (line)=>{ const out=[]; let cur=''; let q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='\"'){ if(q && line[i+1]==='\"'){ cur+='\"'; i++; } else q=!q; } else if(ch===',' && !q){ out.push(cur); cur=''; } else cur+=ch; } out.push(cur); return out.map(v=>v.trim()); }; const headers = split(lines.shift()).map(h=>parkingNorm(h)); return lines.map(line=>{ const cols=split(line); const obj={}; headers.forEach((h,i)=>obj[h]=cols[i]||''); return obj; }); }
  function parkingMapAllocations(rows){ return rows.map((row, idx)=>{ const hasParkingRaw = String(row['has parking'] || row['hasparking'] || row['parking'] || row['possui vaga'] || '').toLowerCase(); const type = String(row['type'] || row['parking type'] || row['space type'] || row['tipo'] || '').trim() || ''; const hasParking = hasParkingRaw ? !['no','false','nao','não','0'].includes(hasParkingRaw) : (String(type).toLowerCase() !== 'no parking'); const s1 = row['parking space no.'] || row['parking space'] || row['space no'] || row['space'] || row['vaga'] || ''; const s2 = row['parking space no. 2'] || row['space 2'] || row['secondary space'] || row['vaga 2'] || ''; const finalType = !hasParking ? 'No Parking' : (type || (s2 ? 'Double' : 'Single')); const spaceDisplay = !hasParking ? 'N/A' : (s2 ? `${s1} / ${s2}` : s1); return { id:'alloc-'+(idx+1), address: row['address'] || row['endereco'] || row['morada'] || '', eircode: row['eircode'] || '', residentName: row['resident name'] || row['name'] || '', hasParking, type: finalType, spaceNo: s1, space1:s1, space2:s2, spaceDisplay, updatedAt:new Date().toISOString() }; }); }
  async function parkingHandleImport(file){ const txt = await file.text(); let allocations = []; if(file.name.toLowerCase().endsWith('.json')) allocations = JSON.parse(txt); else allocations = parkingMapAllocations(parkingCsvParse(txt)); const reg = parkingRegistryLoad(); reg.allocations = allocations; reg.importMeta = { name:file.name, uploadedAt:new Date().toISOString() }; parkingRegistrySave(reg); parkingRenderAdmin(); }
  async function parkingHandlePolicy(file){ const dataUrl = await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(reader.error||new Error('Failed to read file')); reader.readAsDataURL(file); }); const reg = parkingRegistryLoad(); reg.policy = { name:file.name, type:file.type || 'application/octet-stream', dataUrl, updatedAt:new Date().toISOString() }; parkingRegistrySave(reg); parkingRenderAdmin(); }
  function parkingClearImport(){ const reg = parkingRegistryLoad(); reg.allocations = []; reg.importMeta = null; parkingRegistrySave(reg); parkingRenderAdmin(); }
  function parkingRemovePolicy(){ const reg = parkingRegistryLoad(); reg.policy = null; parkingRegistrySave(reg); try{ localStorage.removeItem(window.ANW_KEYS.PARKING_POLICY); }catch(_){} parkingRenderAdmin(); }
  function parkingExportCsv(){ const rows = parkingFilterRows(parkingBuildRows()); const head = ['Resident','Address','Eircode','Parking Space No.','Type','Status','Vehicles','Owner Check','Policy','Updated']; const lines = [head.join(',')].concat(rows.map(r=>[r.resident,r.address,r.eircode,r.space,r.type,r.status,r.vehicles,r.ownerCheck,r.policy,r.updated].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','))); downloadText('parking-registry.csv', lines.join('\n')); }
  function parkingExportPdf(){ const rows = parkingFilterRows(parkingBuildRows()); const win = window.open('', '_blank'); if(!win) return; win.document.write('<html><head><title>Parking Registry</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left}h1{font-size:20px}</style></head><body><h1>Parking & Vehicles Report</h1><table><thead><tr><th>Resident</th><th>Address</th><th>Eircode</th><th>Parking Space No.</th><th>Type</th><th>Status</th><th>Vehicles</th><th>Owner Check</th><th>Updated</th></tr></thead><tbody>'+rows.map(r=>`<tr><td>${esc(r.resident)}</td><td>${esc(r.address)}</td><td>${esc(r.eircode)}</td><td>${esc(r.space)}</td><td>${esc(r.type)}</td><td>${esc(r.status)}</td><td>${esc(r.vehicles)}</td><td>${esc(r.ownerCheck)}</td><td>${esc(r.updated)}</td></tr>`).join('')+'</tbody></table></body></html>'); win.document.close(); win.focus(); setTimeout(()=>win.print(), 300); }

  async function parkingSendNotice(row){ if(!row) return; const message = prompt('Message to resident about Parking & Vehicles:', 'Your parking registration needs attention. Please review your Parking & Vehicles section and update the required details.'); if(!message) return; const notices = sanitizeNoticeCollection(await anwLoadSafe(KEY_NOTICES, [])); notices.push({ id:'parking-'+Date.now(), title:'Parking & Vehicles update required', message:String(message), createdAt:new Date().toISOString(), createdBy:'admin', targetEmails:[row.residentEmail].filter(Boolean), category:'parking' }); await anwSaveSafe(KEY_NOTICES, notices); await renderNoticesList(); alert('Notice created for the selected resident.'); }
  function parkingBindAdmin(){ byId('parkingImportInput')?.addEventListener('change', async (e)=>{ const file=e.target.files && e.target.files[0]; if(file) await parkingHandleImport(file); e.target.value=''; }); byId('parkingPolicyInput')?.addEventListener('change', async (e)=>{ const file=e.target.files && e.target.files[0]; if(file) await parkingHandlePolicy(file); e.target.value=''; }); byId('btnParkingClearImport')?.addEventListener('click', parkingClearImport); byId('btnParkingRemovePolicy')?.addEventListener('click', parkingRemovePolicy); byId('btnParkingTemplate')?.addEventListener('click', ()=>downloadText('parking-template.csv', `address,eircode,parking space no.,parking space no. 2,type,has parking
12 Example Avenue,D15X9T2,101,102,Double,Yes
8 River Court,D15H2K4,104,,Single,Yes
16 Oak Lane,D15T8R1,,,No Parking,No`)); byId('btnParkingImportRules')?.addEventListener('click', ()=>alert('Use one row per residence. Double spaces must be linked in one row using both parking space numbers.')); byId('btnParkingExportCsv')?.addEventListener('click', parkingExportCsv); byId('btnParkingExportPdf')?.addEventListener('click', parkingExportPdf); byId('pkAdminSearch')?.addEventListener('input', parkingRenderAdmin); byId('pkAdminStatusFilter')?.addEventListener('change', parkingRenderAdmin); }


  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', async () => {
    try{
      adminGuardPending(true);

      const aclReady = await waitForAclFunction(6000);
      if(!aclReady){
        redirectAdminDenied('/login.html');
        return;
      }

      const decision = await waitForAdminDecision(7000);
      if(decision === 'deny-login'){
        redirectAdminDenied('/login.html');
        return;
      }
      if(decision === 'deny-dashboard'){
        redirectAdminDenied('/dashboard.html');
        return;
      }

      showAdminTab('tabResidents');
      showElectionSubtab('subManage');

      adminGuardPending(false);
      adminMarkReady();

      await Promise.all([
        loadResidents(),
        renderNoticesList(),
        loadReports(),
        loadProjects(),
        loadAccessControl(),
        loadDiagnostics()
      ]);

      parkingBindAdmin();
      parkingRenderAdmin();

      await runAdminGate();
    }catch(err){
      console.error(err);
      adminGuardPending(false);
      adminMarkReady();
    }
  });
})();

(function(){
  const INACTIVITY_LIMIT_MS = 10 * 60 * 1000;
  let logoutTimer = null;

  async function doLogout(){
    try{ if(window.netlifyIdentity && typeof window.netlifyIdentity.logout === 'function'){ await window.netlifyIdentity.logout(); } }catch(_){}
    window.location.href = 'login.html';
  }

  function resetInactivity(){
    if(logoutTimer) clearTimeout(logoutTimer);
    logoutTimer = setTimeout(doLogout, INACTIVITY_LIMIT_MS);
  }

  function initAdminSessionUi(){
    document.getElementById('btnLogoutAdmin')?.addEventListener('click', doLogout);
    ['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach((evt)=>{
      window.addEventListener(evt, resetInactivity, { passive:true });
    });
    resetInactivity();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAdminSessionUi, { once:true });
  }else{
    initAdminSessionUi();
  }
})();

(function(){
  'use strict';

  const byId = (id) => document.getElementById(id);
  const TASK_KEY = (window.ANW_KEYS && window.ANW_KEYS.TASKS) || 'anw_tasks';
  const TASK_SEQ_KEY = 'anw_task_sequence_global';
  let currentTaskId = null;
  let taskCache = [];

  async function loadStore(key, fallback){
    try{
      const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, { cache:'no-store' });
      if(!res.ok) throw new Error('store load failed');
      const data = await res.json();
      try{ if(typeof window.anwSave === 'function') window.anwSave(key, data); }catch(_){}
      return data;
    }catch(_){
      try{
        if(typeof window.anwLoad === 'function') return await window.anwLoad(key, fallback);
      }catch(__){}
      try{
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }catch(__){
        return fallback;
      }
    }
  }

  async function saveStore(key, value){
    try{
      const res = await fetch(`/.netlify/functions/store?key=${encodeURIComponent(key)}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(value)
      });
      if(!res.ok) throw new Error('store save failed');
    }catch(_){}
    try{ if(typeof window.anwSave === 'function') window.anwSave(key, value); }catch(__){}
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(__){}
  }

  function normList(v){
    if(Array.isArray(v)) return v.filter(Boolean);
    return String(v || '').split(/[;,|]/).map(s => s.trim()).filter(Boolean);
  }

  function esc(s){
    return String(s == null ? '' : s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatDateShort(v){
    if(!v) return '—';
    const d = new Date(String(v).length <= 10 ? (v + 'T12:00:00') : v);
    if(Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString();
  }

  function formatDateTime(v){
    if(!v) return '—';
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }

  function taskTargetLabel(task){
    const eircodes = normList(task.eircodes);
    const streets = normList(task.streets);
    if(task.type === 'eircode' && eircodes.length) return 'Eircode: ' + eircodes.join(', ');
    if(task.type === 'street' && streets.length) return 'Street: ' + streets.join(', ');
    return 'General';
  }

  function zeroPad(num, size){
    return String(num).padStart(size, '0');
  }

  async function nextTaskCode(){
    let seq = Number(await loadStore(TASK_SEQ_KEY, 0)) || 0;
    seq += 1;
    await saveStore(TASK_SEQ_KEY, seq);
    return `Task-${zeroPad(seq, 3)}`;
  }

  function taskFormIds(){
    return ['admTaskCode','admTaskTitle','admTaskDesc','admTaskType','admTaskDue','admTaskEircodes','admTaskStreets','admTaskRoles','admTaskStatus'];
  }

  function clearTaskMessage(){
    const el = byId('admTaskMsg');
    if(el) el.textContent = '';
  }

  function setTaskMessage(msg){
    const el = byId('admTaskMsg');
    if(el) el.textContent = msg || '';
  }

  function fillTaskForm(task){
    currentTaskId = task && task.id ? task.id : null;
    byId('admTaskCode').value = task && task.code ? task.code : '';
    byId('admTaskTitle').value = task && task.title ? task.title : '';
    byId('admTaskDesc').value = task && task.description ? task.description : '';
    byId('admTaskType').value = task && task.type ? task.type : 'general';
    byId('admTaskDue').value = task && task.dueDate ? task.dueDate : '';
    byId('admTaskEircodes').value = task && Array.isArray(task.eircodes) ? task.eircodes.join('; ') : '';
    byId('admTaskStreets').value = task && Array.isArray(task.streets) ? task.streets.join('; ') : '';
    byId('admTaskRoles').value = task && Array.isArray(task.roles) ? task.roles.join('; ') : '';
    byId('admTaskStatus').value = task && task.status ? task.status : 'open';
    const delBtn = byId('btnTaskDelete');
    if(delBtn) delBtn.style.display = currentTaskId ? 'inline-flex' : 'none';
    clearTaskMessage();
  }

  function collectTaskForm(){
    return {
      title: byId('admTaskTitle').value.trim(),
      description: byId('admTaskDesc').value.trim(),
      type: byId('admTaskType').value || 'general',
      dueDate: byId('admTaskDue').value || '',
      eircodes: normList(byId('admTaskEircodes').value),
      streets: normList(byId('admTaskStreets').value),
      roles: normList(byId('admTaskRoles').value),
      status: byId('admTaskStatus').value || 'open'
    };
  }

  async function loadTasks(){
    const raw = await loadStore(TASK_KEY, []);
    taskCache = Array.isArray(raw) ? raw : [];
    renderTasks();
  }

  function filteredTasks(){
    const statusFilter = (byId('admTasksFilter') && byId('admTasksFilter').value) || 'all';
    const q = ((byId('admTasksSearch') && byId('admTasksSearch').value) || '').trim().toLowerCase();
    return taskCache.filter(task => {
      if(statusFilter !== 'all' && String(task.status || '').toLowerCase() !== statusFilter) return false;
      if(!q) return true;
      const hay = [
        task.code, task.title, task.description, task.assignedTo,
        ...(Array.isArray(task.eircodes) ? task.eircodes : []),
        ...(Array.isArray(task.streets) ? task.streets : []),
        ...(Array.isArray(task.roles) ? task.roles : [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    }).sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function renderTasks(){
    const body = byId('admTasksTbody');
    const empty = byId('admTasksEmpty');
    const summary = byId('admTasksSummary');
    if(!body) return;
    const rows = filteredTasks();
    body.innerHTML = rows.map(task => `
      <tr>
        <td><strong>${esc(task.code || '—')}</strong></td>
        <td>${esc(task.title || '—')}</td>
        <td>${esc(taskTargetLabel(task))}</td>
        <td>${esc(formatDateShort(task.dueDate))}</td>
        <td>${esc(task.status || 'open')}</td>
        <td>${esc(task.assignedTo || '—')}</td>
        <td>${esc(formatDateTime(task.updatedAt || task.createdAt))}</td>
        <td>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-line small" data-task-edit="${esc(task.id)}">Edit</button>
          </div>
        </td>
      </tr>
    `).join('');
    if(summary) summary.textContent = `${rows.length} task(s) shown`;
    if(empty) empty.style.display = rows.length ? 'none' : 'block';

    body.querySelectorAll('[data-task-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const task = taskCache.find(t => String(t.id) === String(btn.getAttribute('data-task-edit')));
        fillTaskForm(task || null);
        const panel = byId('tabTasks');
        if(panel) panel.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    });
  }

  async function saveTask(){
    const form = collectTaskForm();
    if(!form.title){
      setTaskMessage('Title is required.');
      return;
    }
    if(form.type === 'eircode' && !form.eircodes.length){
      setTaskMessage('Add at least one Eircode for this targeting mode.');
      return;
    }
    if(form.type === 'street' && !form.streets.length){
      setTaskMessage('Add at least one street for this targeting mode.');
      return;
    }

    let code = byId('admTaskCode').value.trim();
    const now = new Date().toISOString();
    if(!currentTaskId){
      code = await nextTaskCode();
    }

    const task = {
      id: currentTaskId || ('task_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)),
      code,
      title: form.title,
      description: form.description,
      type: form.type,
      dueDate: form.dueDate,
      eircodes: form.eircodes,
      streets: form.streets,
      roles: form.roles,
      status: form.status,
      assignedTo: '',
      createdAt: currentTaskId ? (taskCache.find(t => t.id === currentTaskId)?.createdAt || now) : now,
      updatedAt: now
    };

    const next = taskCache.filter(t => t.id !== task.id);
    next.unshift(task);
    taskCache = next;
    await saveStore(TASK_KEY, taskCache);
    fillTaskForm(task);
    setTaskMessage(currentTaskId ? 'Task updated.' : 'Task created.');
    renderTasks();
  }

  async function deleteTask(){
    if(!currentTaskId) return;
    taskCache = taskCache.filter(t => t.id !== currentTaskId);
    await saveStore(TASK_KEY, taskCache);
    fillTaskForm(null);
    setTaskMessage('Task removed.');
    renderTasks();
  }

  function bindTaskEvents(){
    byId('btnTaskNew')?.addEventListener('click', () => fillTaskForm(null));
    byId('btnTaskClear')?.addEventListener('click', () => fillTaskForm(null));
    byId('btnTaskRefresh')?.addEventListener('click', loadTasks);
    byId('btnTaskSave')?.addEventListener('click', saveTask);
    byId('btnTaskDelete')?.addEventListener('click', deleteTask);
    byId('admTasksFilter')?.addEventListener('change', renderTasks);
    byId('admTasksSearch')?.addEventListener('input', renderTasks);
  }

  function init(){
    if(!byId('tabTasks') || !byId('admTaskCode')) return;
    const codeInput = byId('admTaskCode');
    codeInput.setAttribute('readonly', 'readonly');
    codeInput.setAttribute('disabled', 'disabled');
    fillTaskForm(null);
    bindTaskEvents();
    loadTasks();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  }else{
    init();
  }
})();

(function(){
  'use strict';
  const KEYS = window.ANW_KEYS || {};
  const KEY_HANDBOOK = KEYS.HANDBOOK || 'anw_handbook';
  const KEY_USERS = KEYS.USERS || 'anw_users';
  const KEY_HANDBOOK_READ_RECEIPTS = KEYS.HANDBOOK_READ_RECEIPTS || 'anw_handbook_read_receipts';

  const $id = (id) => document.getElementById(id);

  let categories = [];
  let items = [];
  let currentCategoryId = '';
  let currentItemId = '';
  let currentImageData = '';
  let handbookReadReceipts = {};
  let totalHandbookResidents = 0;

  function slugify(value){
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function esc(value){
    return String(value == null ? '' : value)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  async function loadStore(key, fallback){
    try{
      const res = await fetch('/.netlify/functions/store?key=' + encodeURIComponent(key), { cache:'no-store' });
      if(!res.ok) throw new Error('store load failed');
      return await res.json();
    }catch(_){
      try{
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }catch(__){
        return fallback;
      }
    }
  }

  async function saveStore(key, value){
    try{
      const res = await fetch('/.netlify/functions/store?key=' + encodeURIComponent(key), {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(value)
      });
      if(!res.ok) throw new Error('store save failed');
    }catch(_){
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  function suggestCategoryIcon(value){
    const title = String(value || '').toLowerCase();
    if(!title) return '📘';
    if(title.includes('security') || title.includes('gate') || title.includes('cctv') || title.includes('watch')) return '🛡️';
    if(title.includes('parking') || title.includes('vehicle') || title.includes('traffic')) return '🚗';
    if(title.includes('emergency') || title.includes('fire') || title.includes('medical')) return '🚨';
    if(title.includes('waste') || title.includes('recycling') || title.includes('bin')) return '♻️';
    if(title.includes('volunteer')) return '🤝';
    if(title.includes('service')) return '🏢';
    if(title.includes('rule') || title.includes('guidance') || title.includes('policy')) return '📋';
    if(title.includes('community') || title.includes('event')) return '🏘️';
    if(title.includes('pet') || title.includes('animal')) return '🐾';
    return '📘';
  }

  function normalizeCategories(list){
    return (Array.isArray(list) ? list : []).map((cat, index) => {
      const title = String((cat && (cat.title || cat.name)) || '').trim();
      if(!title) return null;
      return {
        id: String(cat.id || slugify(title) || ('category-' + (index + 1))),
        title,
        icon: String(cat.icon || suggestCategoryIcon(title) || '📘').trim() || '📘',
        order: Number(cat.order) || (index + 1),
        active: cat.active !== false
      };
    }).filter(Boolean).sort((a,b) => (a.order - b.order) || a.title.localeCompare(b.title));
  }

  function normalizeItems(list){
    return (Array.isArray(list) ? list : []).map((item, index) => {
      const hero = String(item.imageData || (item.image && item.image.dataUrl) || item.heroUrl || '').trim();
      const attachments = Array.isArray(item.attachments) ? item.attachments.filter(Boolean) : [];
      return {
        id: String(item.id || item.slug || ('hb-item-' + (index + 1))),
        categoryId: String(item.categoryId || item.category || '').trim(),
        categoryTitle: String(item.categoryTitle || '').trim(),
        title: String((item && (item.title || item.name)) || '').trim(),
        summary: String(item.summary || item.excerpt || '').trim(),
        content: String(item.content || '').trim(),
        status: String(item.status || 'published').toLowerCase() === 'draft' ? 'draft' : 'published',
        type: String(item.type || (item.url ? 'link' : 'page')).toLowerCase() === 'link' ? 'link' : 'page',
        url: String(item.url || item.linkUrl || '').trim(),
        linkLabel: String(item.linkLabel || (attachments[0] && attachments[0].label) || '').trim(),
        heroUrl: hero,
        imageData: hero,
        imageName: String(item.imageName || '').trim(),
        attachments,
        createdAt: item.createdAt || '',
        updatedAt: item.updatedAt || ''
      };
    }).filter(item => item.title);
  }

  function normalizeReadReceipts(value){
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function countApprovedResidents(list){
    return (Array.isArray(list) ? list : []).filter(user => {
      const status = String((user && user.status) || '').toLowerCase();
      return status === 'approved' || status === 'active';
    }).length;
  }

  function ensureCategoriesFromItems(){
    const known = new Set(categories.map(cat => cat.id));
    items.forEach(item => {
      const explicit = String(item.categoryId || item.category || '').trim();
      if(explicit && !known.has(explicit)){
        categories.push({
          id: explicit,
          title: String(item.categoryTitle || explicit).replace(/-/g,' ').replace(/\b\w/g, m => m.toUpperCase()),
          icon: suggestCategoryIcon(item.categoryTitle || explicit),
          order: categories.length + 1,
          active: true
        });
        known.add(explicit);
      }
    });
    categories = normalizeCategories(categories);
  }

  function setCategoryMessage(message){
    const el = $id('hbSimpleCatMsg');
    if(el) el.textContent = message || '';
  }

  function setItemMessage(message){
    const el = $id('hbSimpleItemMsg');
    if(el) el.textContent = message || '';
  }

  function getCategoryInputValue(){
    const preset = $id('hbSimpleCatPreset');
    const other = $id('hbSimpleCatTitle');
    const presetValue = String((preset && preset.value) || '').trim();
    if(presetValue && presetValue !== 'Other') return presetValue;
    return String((other && other.value) || '').trim();
  }

  function syncCategoryInput(title){
    const preset = $id('hbSimpleCatPreset');
    const other = $id('hbSimpleCatTitle');
    const normalized = String(title || '').trim();
    const presetValues = ['General','Security','Parking','Emergency','Volunteering','Waste & Recycling','Community Services','Rules & Guidance'];
    const matched = presetValues.find(value => value.toLowerCase() === normalized.toLowerCase());

    if(preset) preset.value = matched ? matched : 'Other';
    if(other){
      other.style.display = matched ? 'none' : 'block';
      other.value = matched ? '' : normalized;
    }
    if($id('hbSimpleCatIconPreview')){
      $id('hbSimpleCatIconPreview').textContent = suggestCategoryIcon(normalized || matched || 'General');
    }
  }

  function renderCategorySelect(){
    const select = $id('hbSimpleItemCategory');
    if(!select) return;
    const active = categories.filter(cat => cat.active !== false);
    select.innerHTML = active.length
      ? active.map(cat => '<option value="' + esc(cat.id) + '">' + esc(cat.icon + ' ' + cat.title) + '</option>').join('')
      : '<option value="">Create a category first</option>';
    if(currentCategoryId && active.some(cat => cat.id === currentCategoryId)){
      select.value = currentCategoryId;
    }else if(active.length){
      currentCategoryId = active[0].id;
      select.value = currentCategoryId;
    }
  }

  function renderCategoryList(){
    const wrap = $id('hbSimpleCatList');
    if(!wrap) return;
    if(!categories.length){
      wrap.innerHTML = '<p class="tiny muted" style="margin:0;">No categories yet.</p>';
      return;
    }
    wrap.innerHTML = categories.map(cat => {
      return '<div class="hb-admin-category-row">'
        + '<div class="hb-admin-category-meta">'
        + '<div class="hb-admin-category-title">' + esc(cat.icon + ' ' + cat.title) + '</div>'
        + '<div class="hb-admin-category-sub">' + esc(cat.id) + ' · ' + (cat.active ? 'Active' : 'Hidden') + '</div>'
        + '</div>'
        + '<div class="hb-admin-row-actions">'
        + '<button type="button" class="btn btn-line small" data-hb-cat-edit="' + esc(cat.id) + '">Edit</button>'
        + '<button type="button" class="btn btn-line small" data-hb-cat-delete="' + esc(cat.id) + '">Delete</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderPreview(){
    const preview = $id('hbSimpleImagePreview');
    if(!preview) return;
    if(currentImageData){
      preview.innerHTML = '<img src="' + currentImageData + '" alt="Handbook preview" />';
    }else{
      preview.textContent = 'No image selected';
    }
  }

  function getCategoryLabel(categoryId){
    const found = categories.find(cat => cat.id === categoryId);
    return found ? found.title : categoryId;
  }

  function getItemReadStats(itemId){
    const bucket = handbookReadReceipts[itemId] && typeof handbookReadReceipts[itemId] === 'object'
      ? handbookReadReceipts[itemId]
      : {};
    const read = Object.keys(bucket).length;
    const pending = Math.max(0, Number(totalHandbookResidents || 0) - read);
    return { read, pending };
  }

  function renderItems(){
    const wrap = $id('hbSimpleItemList');
    const empty = $id('hbSimpleItemEmpty');
    if(!wrap || !empty) return;

    const query = String(($id('hbSimpleItemSearch') && $id('hbSimpleItemSearch').value) || '').trim().toLowerCase();
    const filtered = items.filter(item => {
      if(!query) return true;
      return [item.title, item.summary, item.content].join(' ').toLowerCase().includes(query);
    });

    empty.style.display = filtered.length ? 'none' : 'block';
    if(!filtered.length){
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = filtered
      .sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .map(item => {
        const stats = getItemReadStats(item.id);
        return '<div class="hb-admin-item-row">'
          + '<div class="hb-admin-item-meta">'
          + '<div class="hb-admin-item-title">' + esc(item.title) + '</div>'
          + '<div class="hb-admin-item-sub">' + esc(item.summary || 'No summary added') + '</div>'
          + '<div class="hb-admin-item-sub">' + esc(getCategoryLabel(item.categoryId)) + ' · ' + esc(item.heroUrl ? 'Image saved' : 'No image') + (item.url ? ' · Link added' : '') + '</div>'
          + '</div>'
          + '<div class="hb-admin-row-actions">'
          + '<span class="hb-admin-read-metrics">'
          + '<span class="hb-admin-read-chip">Read ' + esc(String(stats.read)) + '</span>'
          + '<span class="hb-admin-read-chip pending">Unread ' + esc(String(stats.pending)) + '</span>'
          + '</span>'
          + '<span class="hb-status-pill ' + esc(item.status) + '">' + esc(item.status === 'published' ? 'Published' : 'Draft') + '</span>'
          + '<button type="button" class="btn btn-line small" data-hb-item-edit="' + esc(item.id) + '">Edit</button>'
          + '<button type="button" class="btn btn-line small" data-hb-item-delete="' + esc(item.id) + '">Delete</button>'
          + '</div>'
          + '</div>';
      }).join('');
  }

  function clearCategoryForm(){
    currentCategoryId = '';
    if($id('hbSimpleCatPreset')) $id('hbSimpleCatPreset').value = 'General';
    if($id('hbSimpleCatTitle')){
      $id('hbSimpleCatTitle').value = '';
      $id('hbSimpleCatTitle').style.display = 'none';
    }
    if($id('hbSimpleCatIconPreview')) $id('hbSimpleCatIconPreview').textContent = suggestCategoryIcon('General');
    if($id('hbSimpleCatActive')) $id('hbSimpleCatActive').checked = true;
    setCategoryMessage('');
  }

  function fillCategoryForm(categoryId){
    const cat = categories.find(entry => entry.id === categoryId);
    if(!cat) return;
    currentCategoryId = cat.id;
    syncCategoryInput(cat.title);
    if($id('hbSimpleCatActive')) $id('hbSimpleCatActive').checked = cat.active !== false;
    setCategoryMessage('Editing category.');
  }

  function clearItemForm(){
    currentItemId = '';
    currentImageData = '';
    if($id('hbSimpleItemTitle')) $id('hbSimpleItemTitle').value = '';
    if($id('hbSimpleItemSummary')) $id('hbSimpleItemSummary').value = '';
    if($id('hbSimpleItemContent')) $id('hbSimpleItemContent').value = '';
    if($id('hbSimpleItemStatus')) $id('hbSimpleItemStatus').value = 'published';
    if($id('hbSimpleItemLinkLabel')) $id('hbSimpleItemLinkLabel').value = '';
    if($id('hbSimpleItemLinkUrl')) $id('hbSimpleItemLinkUrl').value = '';
    if($id('hbSimpleItemImage')) $id('hbSimpleItemImage').value = '';
    if($id('btnHbSimpleItemDelete')) $id('btnHbSimpleItemDelete').style.display = 'none';
    renderPreview();
    setItemMessage('');
  }

  function fillItemForm(itemId){
    const item = items.find(entry => entry.id === itemId);
    if(!item) return;
    currentItemId = item.id;
    currentImageData = item.heroUrl || '';
    if($id('hbSimpleItemCategory')) $id('hbSimpleItemCategory').value = item.categoryId;
    if($id('hbSimpleItemTitle')) $id('hbSimpleItemTitle').value = item.title;
    if($id('hbSimpleItemSummary')) $id('hbSimpleItemSummary').value = item.summary || '';
    if($id('hbSimpleItemContent')) $id('hbSimpleItemContent').value = item.content || '';
    if($id('hbSimpleItemStatus')) $id('hbSimpleItemStatus').value = item.status || 'published';
    if($id('hbSimpleItemLinkLabel')) $id('hbSimpleItemLinkLabel').value = item.linkLabel || '';
    if($id('hbSimpleItemLinkUrl')) $id('hbSimpleItemLinkUrl').value = item.url || '';
    if($id('btnHbSimpleItemDelete')) $id('btnHbSimpleItemDelete').style.display = 'inline-flex';
    renderPreview();
    setItemMessage('Editing item.');
  }

  async function saveCategory(){
    const title = getCategoryInputValue();
    const active = !!($id('hbSimpleCatActive') && $id('hbSimpleCatActive').checked);

    if(!title){
      setCategoryMessage('Please enter a category.');
      return;
    }

    const existing = categories.find(cat => cat.title.toLowerCase() === title.toLowerCase() && cat.id !== currentCategoryId);
    if(existing){
      setCategoryMessage('This category already exists.');
      return;
    }

    const base = categories.find(cat => cat.id === currentCategoryId) || {};
    const category = {
      id: base.id || slugify(title) || ('hb-cat-' + Date.now()),
      title: title,
      icon: suggestCategoryIcon(title),
      order: base.order || (categories.length + 1),
      active: active
    };

    categories = categories.filter(cat => cat.id !== category.id);
    categories.push(category);
    categories = normalizeCategories(categories);
    await saveCombinedHandbook();
    renderCategorySelect();
    renderCategoryList();
    renderItems();
    currentCategoryId = category.id;
    if($id('hbSimpleItemCategory')) $id('hbSimpleItemCategory').value = category.id;
    setCategoryMessage('Category saved.');
    clearCategoryForm();
  }

  async function deleteCategory(categoryId){
    const itemCount = items.filter(item => item.categoryId === categoryId).length;
    if(itemCount){
      setCategoryMessage('Move or delete the ' + itemCount + ' item(s) in this category first.');
      return;
    }
    categories = categories.filter(cat => cat.id !== categoryId);
    await saveCombinedHandbook();
    renderCategorySelect();
    renderCategoryList();
    setCategoryMessage('Category removed.');
    clearCategoryForm();
  }

  async function saveItem(){
    const categoryId = String(($id('hbSimpleItemCategory') && $id('hbSimpleItemCategory').value) || '').trim();
    const title = String($id('hbSimpleItemTitle').value || '').trim();
    const summary = String($id('hbSimpleItemSummary').value || '').trim();
    const content = String($id('hbSimpleItemContent').value || '').trim();
    const status = String($id('hbSimpleItemStatus').value || 'published');
    const linkLabel = String($id('hbSimpleItemLinkLabel').value || '').trim();
    const linkUrl = String($id('hbSimpleItemLinkUrl').value || '').trim();

    if(!categoryId){
      setItemMessage('Please choose a category.');
      return;
    }
    if(!title){
      setItemMessage('Please enter a title.');
      return;
    }
    if(!content && !linkUrl){
      setItemMessage('Add content or a link before saving.');
      return;
    }

    const now = new Date().toISOString();
    const previous = items.find(entry => entry.id === currentItemId) || {};
    const next = {
      id: currentItemId || ('hb-' + Date.now()),
      categoryId,
      category: categoryId,
      categoryTitle: (categories.find(cat => cat.id === categoryId) || {}).title || '',
      title,
      summary,
      content,
      status,
      type: linkUrl ? 'link' : 'page',
      url: linkUrl,
      linkLabel: linkLabel,
      heroUrl: currentImageData || '',
      imageData: currentImageData || '',
      imageName: previous.imageName || '',
      attachments: linkUrl ? [{ label: linkLabel || 'Open link', url: linkUrl }] : [],
      createdAt: previous.createdAt || now,
      updatedAt: now
    };

    items = items.filter(entry => entry.id !== next.id);
    items.push(next);
    await saveCombinedHandbook();
    renderItems();
    setItemMessage('Item saved.');
    fillItemForm(next.id);
  }

  async function deleteItem(itemId){
    const item = items.find(entry => entry.id === itemId);
    if(!item) return;
    if(!window.confirm('Delete this handbook item? The image saved inside it will be deleted too.')) return;
    items = items.filter(entry => entry.id !== itemId);
    await saveCombinedHandbook();
    if(currentItemId === itemId) clearItemForm();
    renderItems();
    setItemMessage('Item removed. Image space has been cleared together with the item.');
  }

  async function compressImage(file){
    if(!file) return '';
    if(file.size > 8 * 1024 * 1024){
      throw new Error('Please choose an image smaller than 8 MB.');
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not process the image.'));
      img.src = dataUrl;
    });

    const maxWidth = 1400;
    const scale = image.width > maxWidth ? (maxWidth / image.width) : 1;
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.78);
  }

  async function handleImageUpload(event){
    const file = event.target && event.target.files && event.target.files[0];
    if(!file) return;
    try{
      currentImageData = await compressImage(file);
      renderPreview();
      setItemMessage('Image ready. It will be saved inside this handbook item.');
    }catch(err){
      currentImageData = '';
      renderPreview();
      setItemMessage(err && err.message ? err.message : 'Could not process the image.');
    }
  }

  async function boot(){
    if(!$id('tabHandbook') || !$id('hbSimpleItemTitle')) return;

    const combined = await loadStore(KEY_HANDBOOK, { categories: [] });
    hydrateFromCombinedHandbook(combined);
    handbookReadReceipts = normalizeReadReceipts(await loadStore(KEY_HANDBOOK_READ_RECEIPTS, {}));
    totalHandbookResidents = countApprovedResidents(await loadStore(KEY_USERS, []));
    ensureCategoriesFromItems();

    if(categories.length){
      await saveCombinedHandbook();
    }

    renderCategorySelect();
    renderCategoryList();
    renderPreview();
    renderItems();
    clearCategoryForm();
    syncCategoryInput('General');
    clearItemForm();

    $id('hbSimpleCatPreset')?.addEventListener('change', function(){
      syncCategoryInput(this.value);
    });
    $id('hbSimpleCatTitle')?.addEventListener('input', function(){
      if($id('hbSimpleCatIconPreview')) $id('hbSimpleCatIconPreview').textContent = suggestCategoryIcon(this.value);
    });
    $id('btnHbSimpleCatClear')?.addEventListener('click', clearCategoryForm);
    $id('btnHbSimpleCatSave')?.addEventListener('click', saveCategory);
    $id('btnHbSimpleItemClear')?.addEventListener('click', clearItemForm);
    $id('btnHbSimpleItemSave')?.addEventListener('click', saveItem);
    $id('btnHbSimpleItemDelete')?.addEventListener('click', function(){
      if(currentItemId) deleteItem(currentItemId);
    });
    $id('btnHbRemoveImage')?.addEventListener('click', function(){
      currentImageData = '';
      if($id('hbSimpleItemImage')) $id('hbSimpleItemImage').value = '';
      renderPreview();
      setItemMessage('Image removed from this item draft. Save to apply.');
    });
    $id('hbSimpleItemImage')?.addEventListener('change', handleImageUpload);
    $id('hbSimpleItemSearch')?.addEventListener('input', renderItems);
    $id('hbSimpleItemCategory')?.addEventListener('change', function(){
      currentCategoryId = this.value;
    });

    $id('hbSimpleCatList')?.addEventListener('click', function(event){
      const editId = event.target && event.target.getAttribute('data-hb-cat-edit');
      const deleteId = event.target && event.target.getAttribute('data-hb-cat-delete');
      if(editId) fillCategoryForm(editId);
      if(deleteId) deleteCategory(deleteId);
    });

    $id('hbSimpleItemList')?.addEventListener('click', function(event){
      const editId = event.target && event.target.getAttribute('data-hb-item-edit');
      const deleteId = event.target && event.target.getAttribute('data-hb-item-delete');
      if(editId) fillItemForm(editId);
      if(deleteId) deleteItem(deleteId);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  }else{
    boot();
  }
})();

(function(){
  const HC_KEY = 'anw_help_center_admin';
  let state = { topics: [], ownerArticles: [], importedPackage: null };
  let currentTopicId = '';
  let currentOwnerId = '';

  function byId(id){ return document.getElementById(id); }
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function slugify(v){ return String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function hcId(prefix){ return prefix + '-' + Math.random().toString(36).slice(2, 10); }

  async function hcLoad(){
    try{
      if(typeof window.anwLoadSafe === 'function'){
        const data = await window.anwLoadSafe(HC_KEY, null);
        if(data && typeof data === 'object') return Object.assign({ topics: [], ownerArticles: [], importedPackage: null }, data);
      }
    }catch(_){}
    try{
      const raw = localStorage.getItem(HC_KEY);
      if(raw) return Object.assign({ topics: [], ownerArticles: [], importedPackage: null }, JSON.parse(raw));
    }catch(_){}
    return { topics: [], ownerArticles: [], importedPackage: null };
  }

  async function hcSave(next){
    state = Object.assign({ topics: [], ownerArticles: [], importedPackage: null }, next || {});
    try{
      if(typeof window.anwSaveSafe === 'function'){ await window.anwSaveSafe(HC_KEY, state); return; }
    }catch(_){}
    try{ localStorage.setItem(HC_KEY, JSON.stringify(state)); }catch(_){}
  }

  function showMsg(id, msg){ const el = byId(id); if(el) el.textContent = msg || ''; }

  function showHcSubtab(id){
    document.querySelectorAll('.hc-subtab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-hc-subtab') === id));
    document.querySelectorAll('.hc-subsection').forEach(p => p.classList.toggle('active', p.id === id));
  }

  function renderTopicOptions(){
    const select = byId('hcOwnerTopic'); if(!select) return;
    select.innerHTML = '<option value="">Select topic…</option>' + state.topics.map(t => '<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('');
  }

  function clearTopicForm(){ currentTopicId=''; byId('hcTopicTitle').value=''; byId('hcTopicSlug').value=''; }
  function fillTopicForm(id){ const item = state.topics.find(t => t.id === id); if(!item) return; currentTopicId=item.id; byId('hcTopicTitle').value=item.title||''; byId('hcTopicSlug').value=item.slug||''; }

  function renderTopics(){
    const wrap = byId('hcTopicList'); if(!wrap) return;
    wrap.innerHTML = state.topics.length ? state.topics.map(item => '<details class="hc-item"><summary><span>'+esc(item.title||'Untitled topic')+'</span><span class="tiny muted">'+esc(item.slug||'')+'</span></summary><div class="hc-meta">Topic key: '+esc(item.slug||'')+'</div><div class="hc-actions"><button type="button" class="btn-line small" data-hc-topic-edit="'+esc(item.id)+'">Edit</button><button type="button" class="btn-line small" data-hc-topic-delete="'+esc(item.id)+'">Delete</button></div></details>').join('') : '<p class="tiny muted">No topics yet.</p>';
    wrap.querySelectorAll('[data-hc-topic-edit]').forEach(btn => btn.addEventListener('click', () => fillTopicForm(btn.getAttribute('data-hc-topic-edit'))));
    wrap.querySelectorAll('[data-hc-topic-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-hc-topic-delete');
      state.topics = state.topics.filter(t => t.id !== id);
      state.ownerArticles = state.ownerArticles.filter(a => a.topicId !== id);
      await hcSave(state); renderAll(); showMsg('hcTopicMsg','Topic deleted.');
    }));
  }

  function clearOwnerForm(){ currentOwnerId=''; byId('hcOwnerTitle').value=''; byId('hcOwnerTopic').value=''; byId('hcOwnerSummary').value=''; byId('hcOwnerBody').value=''; }
  function fillOwnerForm(id){ const item = state.ownerArticles.find(a => a.id === id); if(!item) return; currentOwnerId=item.id; byId('hcOwnerTitle').value=item.title||''; byId('hcOwnerTopic').value=item.topicId||''; byId('hcOwnerSummary').value=item.summary||''; byId('hcOwnerBody').value=item.body||''; }

  function renderOwnerArticles(){
    const wrap = byId('hcOwnerList'); if(!wrap) return;
    wrap.innerHTML = state.ownerArticles.length ? state.ownerArticles.map(item => {
      const topic = state.topics.find(t => t.id === item.topicId);
      return '<details class="hc-item"><summary><span>'+esc(item.title||'Untitled owner article')+'</span><span class="tiny muted">'+esc(topic ? topic.title : 'No topic')+'</span></summary><div class="hc-meta">'+esc(item.summary||'')+'</div><div class="hc-actions"><button type="button" class="btn-line small" data-hc-owner-edit="'+esc(item.id)+'">Edit</button><button type="button" class="btn-line small" data-hc-owner-delete="'+esc(item.id)+'">Delete</button></div></details>';
    }).join('') : '<p class="tiny muted">No owner articles yet.</p>';
    wrap.querySelectorAll('[data-hc-owner-edit]').forEach(btn => btn.addEventListener('click', () => fillOwnerForm(btn.getAttribute('data-hc-owner-edit'))));
    wrap.querySelectorAll('[data-hc-owner-delete]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-hc-owner-delete');
      state.ownerArticles = state.ownerArticles.filter(a => a.id !== id);
      await hcSave(state); renderAll(); showMsg('hcOwnerMsg','Owner article deleted.');
    }));
  }

  function renderAll(){ renderTopicOptions(); renderTopics(); renderOwnerArticles(); }

  async function importFile(file){
    const raw = await file.text();
    const json = JSON.parse(raw);
    state.importedPackage = json;
    if(Array.isArray(json.topics)) state.topics = json.topics.map(t => ({ id: t.id || hcId('topic'), title: t.title || '', slug: t.slug || slugify(t.title || '') }));
    if(Array.isArray(json.ownerArticles)) state.ownerArticles = json.ownerArticles.map(a => ({ id: a.id || hcId('owner'), title: a.title || '', topicId: a.topicId || '', summary: a.summary || '', body: a.body || '' }));
    await hcSave(state); renderAll();
  }

  async function bootHelpCenterAdmin(){
    state = await hcLoad();
    renderAll();
    document.querySelectorAll('.hc-subtab').forEach(btn => btn.addEventListener('click', () => showHcSubtab(btn.getAttribute('data-hc-subtab'))));

    byId('btnHcImport')?.addEventListener('click', async () => {
      const file = byId('hcImportFile')?.files?.[0];
      if(!file){ showMsg('hcImportMsg','Select help-centre-seed.json first.'); return; }
      try{ await importFile(file); showMsg('hcImportMsg','Help Center package imported successfully.'); }catch(err){ console.error(err); showMsg('hcImportMsg','Import failed. Check the JSON package.'); }
    });

    byId('btnHcExport')?.addEventListener('click', () => {
      try{
        const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='help-centre-seed.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 200);
        showMsg('hcImportMsg','Current package exported.');
      }catch(err){ console.error(err); showMsg('hcImportMsg','Export failed.'); }
    });

    byId('btnHcClear')?.addEventListener('click', async () => {
      state = { topics: [], ownerArticles: [], importedPackage: null };
      await hcSave(state); clearTopicForm(); clearOwnerForm(); renderAll(); showMsg('hcImportMsg','Current package cleared.');
    });

    byId('btnHcTopicNew')?.addEventListener('click', clearTopicForm);
    byId('btnHcTopicClear')?.addEventListener('click', clearTopicForm);
    byId('btnHcTopicSave')?.addEventListener('click', async () => {
      const title = byId('hcTopicTitle')?.value.trim() || '';
      const slug = slugify(byId('hcTopicSlug')?.value || title);
      if(!title){ showMsg('hcTopicMsg','Enter a topic title.'); return; }
      if(currentTopicId){
        const item = state.topics.find(t => t.id === currentTopicId);
        if(item){ item.title=title; item.slug=slug; }
      } else {
        state.topics.push({ id: hcId('topic'), title, slug });
      }
      await hcSave(state); renderAll(); clearTopicForm(); showMsg('hcTopicMsg','Topic saved.');
    });

    byId('btnHcOwnerNew')?.addEventListener('click', clearOwnerForm);
    byId('btnHcOwnerClear')?.addEventListener('click', clearOwnerForm);
    byId('btnHcOwnerSave')?.addEventListener('click', async () => {
      const title = byId('hcOwnerTitle')?.value.trim() || '';
      const topicId = byId('hcOwnerTopic')?.value || '';
      const summary = byId('hcOwnerSummary')?.value.trim() || '';
      const body = byId('hcOwnerBody')?.value.trim() || '';
      if(!title){ showMsg('hcOwnerMsg','Enter an article title.'); return; }
      if(currentOwnerId){
        const item = state.ownerArticles.find(a => a.id === currentOwnerId);
        if(item){ item.title=title; item.topicId=topicId; item.summary=summary; item.body=body; }
      } else {
        state.ownerArticles.push({ id: hcId('owner'), title, topicId, summary, body });
      }
      await hcSave(state); renderAll(); clearOwnerForm(); showMsg('hcOwnerMsg','Owner article saved.');
    });
  }

  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', bootHelpCenterAdmin, { once:true }); }
  else { bootHelpCenterAdmin(); }
})();
