// Tab switching + phase filter + render helpers
(function(){
  function qs(s,el=document){return el.querySelector(s)}
  function qsa(s,el=document){return [...el.querySelectorAll(s)]}

  // --- Tabs ---
  const TAB_KEY = 'zsp_tab';
  function activateTab(name){
    qsa('[data-tab]').forEach(el=>{
      el.classList.toggle('hidden', el.getAttribute('data-tab')!==name);
    });
    qsa('.topbar nav button').forEach(b=>{
      b.classList.toggle('active', b.getAttribute('data-target')===name);
    });
    try{localStorage.setItem(TAB_KEY,name)}catch(e){}
    window.scrollTo(0,0);
  }
  window.addEventListener('DOMContentLoaded',()=>{
    qsa('.topbar nav button').forEach(b=>{
      b.addEventListener('click',()=>activateTab(b.getAttribute('data-target')));
    });
    let start = 'overview';
    try{start = localStorage.getItem(TAB_KEY) || start}catch(e){}
    if(!qs(`[data-tab="${start}"]`)) start = 'overview';
    activateTab(start);
    renderAll();
  });

  // --- Render: Gantt ---
  function renderGantt(){
    const host = qs('#gantt');
    if(!host) return;
    let html = '';
    // header — single grid, 240px label + 12 × 120px quarters
    html += '<div class="gantt-header">';
    html += '<div class="lane-label">Track / Owner</div>';
    for(let y=1;y<=3;y++){
      for(let q=1;q<=4;q++){
        const yStart = q===1 ? 'year-start' : '';
        html += `<div class="qh ${yStart}">Y${y} · Q${q}</div>`;
      }
    }
    html += '</div>';
    // rows
    window.GANTT.forEach(row=>{
      html += `<div class="gantt-row">`;
      html += `<div class="who"><span class="dot ${row.role}"></span>${row.who}</div>`;
      html += `<div class="track">`;
      row.bars.forEach(b=>{
        const col = b.start+1;
        const span = Math.max(1, b.end - b.start);
        const title = (b.title || b.name || '').replace(/"/g,'&quot;');
        html += `<div class="gbar ${b.color}" style="grid-column:${col} / span ${span}" title="${title}">${b.name}</div>`;
      });
      html += `</div></div>`;
    });
    host.innerHTML = html;
  }

  // --- Render: Milestone strip ---
  function renderMilestones(){
    const host = qs('#milestones');
    if(!host) return;
    host.innerHTML = window.MILESTONES.map(m=>`
      <div class="ms">
        <div class="q">${m.q}</div>
        <div class="name">${m.name}</div>
        <div class="goal">${m.goal}</div>
      </div>
    `).join('');
  }

  // --- Render: Phases table ---
  function renderPhases(){
    const host = qs('#phases-table tbody');
    if(!host) return;
    host.innerHTML = window.PHASES.map(p=>`
      <tr>
        <td class="mono">P${p.num}</td>
        <td><b>${p.name}</b></td>
        <td class="mono">${p.quarters}</td>
        <td>${p.goal}</td>
        <td><span class="chip ${p.color}">${p.color}</span></td>
      </tr>
    `).join('');
  }

  // --- Render: Characters ---
  function renderCharacters(){
    const host = qs('#characters');
    if(!host) return;
    host.innerHTML = window.CHARACTERS.map(c=>{
      const isReady = c.statusChip.includes('HP');
      const chip = isReady
        ? `<span class="chip char dot">${c.statusChip}</span>`
        : `<span class="chip">${c.statusChip}</span>`;
      return `
        <div class="card" style="padding:22px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <div>
              <div class="label">${c.role}</div>
              <h3 style="font-size:18px">${c.name}</h3>
              <div class="small" style="margin-top:2px">${c.culture} · ${c.weapon}</div>
            </div>
            ${chip}
          </div>
          <p style="margin:10px 0 14px 0;color:var(--ink-2);font-size:13px">${c.summary}</p>
          <div class="table-wrap" style="border-radius:6px">
            <table class="sheet">
              <thead><tr>
                <th style="width:42px">Key</th>
                <th>Ability</th>
                <th style="width:90px">Type</th>
                <th>Description</th>
                <th style="width:110px">Status</th>
              </tr></thead>
              <tbody>
                ${c.abilities.map(a=>`
                  <tr>
                    <td class="mono" style="font-weight:600">${a.key}</td>
                    <td><b>${a.name}</b></td>
                    <td class="dim">${a.type}</td>
                    <td>${a.desc}</td>
                    <td><span class="chip ${a.impl==='Implemented'?'done':''}">${a.impl}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Render: Items ---
  function renderItems(){
    const host = qs('#items-table tbody');
    if(!host) return;
    host.innerHTML = window.ITEMS.map((it,i)=>`
      <tr>
        <td class="mono dim">${String(i+1).padStart(2,'0')}</td>
        <td><b>${it.name}</b></td>
        <td>${it.kind}</td>
        <td>${it.effect}</td>
        <td class="num">${it.stack}</td>
        <td>${it.existing ? '<span class="chip done">Implemented</span>' : '<span class="chip">To build</span>'}</td>
        <td class="dim">${it.notes}</td>
      </tr>
    `).join('');
  }

  // --- Render: Maps ---
  function renderMaps(){
    const host = qs('#maps');
    if(!host) return;
    host.innerHTML = window.MAPS.map((m,i)=>`
      <div class="card">
        <div class="label">Map ${String(i+1).padStart(2,'0')} · ${m.difficulty}</div>
        <h3>${m.name}</h3>
        <p style="margin:6px 0 12px 0">${m.theme}</p>
        <dl class="kv">
          <dt>Size</dt><dd class="mono-cell">${m.size}</dd>
          <dt>Enemies</dt><dd>${m.enemies}</dd>
          <dt>Boss</dt><dd>${m.boss}</dd>
          <dt>Layout</dt><dd style="font-size:12.5px;color:var(--ink-2)">${m.biomeNotes}</dd>
        </dl>
      </div>
    `).join('');
  }

  // --- Render: Systems ---
  function renderSystems(){
    const host = qs('#systems-table tbody');
    if(!host) return;
    host.innerHTML = window.SYSTEMS.map(s=>`
      <tr>
        <td><b>${s.sys}</b></td>
        <td>${s.status==='In code' ? '<span class="chip done">In code</span>' : '<span class="chip">'+s.status+'</span>'}</td>
        <td class="dim">${s.dep}</td>
        <td>${s.owner}</td>
        <td>${s.notes}</td>
      </tr>
    `).join('');
  }

  // --- Task Board · Google Sheets backed ---
  const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbypjQj-_CrxjEovmHt5vzc0Iaysbwt3n0MglkG7MAsDMJII8B8YCqFOBM6eE4GKAFuc/exec';
  const POLL_MS = 30000;
  const STATUSES = [
    { v:'todo',     label:'To Do' },
    { v:'progress', label:'In Progress' },
    { v:'blocked',  label:'Blocked' },
    { v:'done',     label:'Done' },
  ];
  const PRIORITIES = [
    { v:'P0', label:'P0 — Must have' },
    { v:'P1', label:'P1 — Should have' },
    { v:'P2', label:'P2 — Nice to have' },
  ];
  const ROLE_KEYS = [
    { v:'programmer', label:'Programmer' },
    { v:'char',       label:'Character Artist' },
    { v:'env',        label:'Environment & Concept' },
    { v:'vfx',        label:'VFX & Rigging' },
  ];
  const SEED_TEAM = [
    { MemberId:'jeff',     Name:'Jeff',     RoleKey:'programmer', RoleLabel:'Programmer',            Order:1, Active:true },
    { MemberId:'christie', Name:'Christie', RoleKey:'char',       RoleLabel:'Character Artist',      Order:2, Active:true },
    { MemberId:'tachi',    Name:'Tachi',    RoleKey:'env',        RoleLabel:'Environment & Concept', Order:3, Active:true },
    { MemberId:'jason',    Name:'Jason',    RoleKey:'vfx',        RoleLabel:'VFX & Rigging',         Order:4, Active:true },
  ];
  const LEGACY_COL_TO_MEMBER = { programmer:'jeff', char:'christie', env:'tachi', vfx:'jason' };
  const USER_KEY = 'zsp_user_name';
  const TAB_FILTER_KEY_CURRENT = 'zsp_phase_filter';

  let currentPhaseFilter = 'all';
  try{ currentPhaseFilter = localStorage.getItem(TAB_FILTER_KEY_CURRENT) || 'all'; }catch(e){}

  // Module state
  let teamState = [];        // array of { MemberId, Name, RoleKey, RoleLabel, Order, Active, ... }
  let taskState = [];        // array of task objects from sheet
  let userName = '';         // cached identity
  let syncStatus = 'idle';
  let lastSyncAt = null;
  let pendingWrites = 0;

  function genId(prefix){
    return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1e6).toString(36)}`;
  }
  function legacyTaskId(colKey, t, idx){
    const slug = (t.title||'').replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,40);
    return `${colKey}-p${t.phase}-${t.p}-${slug}-${idx}`;
  }
  function getUserName(){
    let n = '';
    try{ n = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    if(!n){
      n = (prompt('Your name (shown as "last updated by" on tasks):') || '').trim();
      if(n){ try{ localStorage.setItem(USER_KEY, n); }catch(e){} }
    }
    userName = n || '';
    return userName;
  }

  async function fetchAll(){
    setSyncStatus('syncing');
    try{
      const res = await fetch(SHEET_ENDPOINT, { method:'GET' });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'fetch failed');
      taskState = (json.tasks || []).map(normalizeTaskRow);
      teamState = (json.team  || []).map(normalizeTeamRow);
      lastSyncAt = new Date();
      setSyncStatus('ok');
      if(teamState.length === 0 && taskState.length === 0){
        await bootstrapIfEmpty();
      }
      renderBoard();
    }catch(err){
      console.warn('[sync] fetch error:', err);
      setSyncStatus('error');
    }
  }

  async function pushRow(tab, key, fields){
    pendingWrites++;
    updateSyncPill();
    try{
      const body = { Tab: tab, Key: key, Fields: fields, UpdatedBy: userName || 'anonymous' };
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'push failed');
      lastSyncAt = new Date();
      setSyncStatus('ok');
      // Optimistic local update so UI doesn't wait on next poll
      const nowIso = new Date().toISOString();
      if(tab === 'Tasks'){
        const i = taskState.findIndex(t => t.TaskId === key);
        const patch = Object.assign({}, fields, { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous' });
        if(i >= 0) taskState[i] = Object.assign({}, taskState[i], patch);
        else taskState.push(Object.assign({ TaskId: key, CreatedAt: nowIso }, patch));
      } else if(tab === 'Team'){
        const i = teamState.findIndex(m => m.MemberId === key);
        const patch = Object.assign({}, fields, { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous' });
        if(i >= 0) teamState[i] = Object.assign({}, teamState[i], patch);
        else teamState.push(Object.assign({ MemberId: key }, patch));
      }
    }catch(err){
      console.warn('[sync] push error:', err);
      setSyncStatus('error');
      alert('Could not save to Google Sheet. Check your connection and try again.\n\n' + err.message);
    }finally{
      pendingWrites--;
      updateSyncPill();
    }
  }

  function normalizeTaskRow(r){
    return {
      TaskId:    String(r.TaskId || ''),
      MemberId:  String(r.MemberId || ''),
      Title:     String(r.Title || ''),
      Body:      String(r.Body || ''),
      Phase:     Number(r.Phase) || 1,
      Priority:  String(r.Priority || 'P1'),
      Status:    String(r.Status || 'todo'),
      Notes:     String(r.Notes || ''),
      Assignee:  String(r.Assignee || ''),
      Hidden:    r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder: Number(r.SortOrder) || 0,
      CreatedAt: String(r.CreatedAt || ''),
      UpdatedAt: String(r.UpdatedAt || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
    };
  }
  function normalizeTeamRow(r){
    return {
      MemberId:  String(r.MemberId || ''),
      Name:      String(r.Name || ''),
      RoleKey:   String(r.RoleKey || 'programmer'),
      RoleLabel: String(r.RoleLabel || ''),
      Order:     Number(r.Order) || 0,
      Active:    r.Active !== false && r.Active !== 'FALSE' && r.Active !== 'false',
    };
  }

  function setSyncStatus(s){ syncStatus = s; updateSyncPill(); }
  function updateSyncPill(){
    const pill = qs('#sync-pill');
    if(!pill) return;
    let text = '', cls = '';
    if(pendingWrites > 0){ text = `Saving… (${pendingWrites})`; cls = 'sync-syncing'; }
    else if(syncStatus === 'syncing'){ text = 'Syncing…'; cls = 'sync-syncing'; }
    else if(syncStatus === 'error'){ text = 'Offline · retry in 30s'; cls = 'sync-error'; }
    else if(syncStatus === 'ok' && lastSyncAt){
      const s = Math.round((Date.now() - lastSyncAt.getTime())/1000);
      text = `Synced ${s<5?'just now':s+'s ago'}`;
      cls = 'sync-ok';
    } else { text = 'Connecting…'; cls = 'sync-syncing'; }
    pill.className = 'sync-pill ' + cls;
    pill.textContent = text;
    const whoEl = qs('#sync-user');
    if(whoEl){
      let u = '';
      try{ u = localStorage.getItem(USER_KEY) || ''; }catch(e){}
      whoEl.textContent = u ? `signed in as ${u}` : 'not identified';
    }
  }

  async function bootstrapIfEmpty(){
    // Build seed tasks from window.TASKS
    const seedTasks = [];
    const src = window.TASKS || {};
    Object.keys(src).forEach(colKey => {
      const memberId = LEGACY_COL_TO_MEMBER[colKey];
      if(!memberId) return;
      (src[colKey] || []).forEach((t, idx) => {
        seedTasks.push({
          TaskId:    legacyTaskId(colKey, t, idx),
          MemberId:  memberId,
          Title:     t.title || '',
          Body:      t.body  || '',
          Phase:     t.phase || 1,
          Priority:  t.p     || 'P1',
          Status:    'todo',
          Notes:     '',
          Assignee:  '',
          Hidden:    false,
          SortOrder: (idx + 1) * 1000,
          CreatedAt: '',
          UpdatedAt: '',
          UpdatedBy: '',
        });
      });
    });

    try{
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ Action:'bootstrap', Tasks: seedTasks, Team: SEED_TEAM }),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'bootstrap failed');
      if(json.seeded){
        // Re-fetch so state reflects the seeded rows
        const r2 = await fetch(SHEET_ENDPOINT, { method:'GET' });
        const j2 = await r2.json();
        taskState = (j2.tasks || []).map(normalizeTaskRow);
        teamState = (j2.team  || []).map(normalizeTeamRow);
      }
    }catch(err){
      console.warn('[bootstrap] error:', err);
    }
  }

  function renderBoard(){
    const host = qs('#board');
    if(!host) return;
    const activeTeam = teamState.filter(m => m.Active).slice().sort((a,b) => a.Order - b.Order);
    const visibleTasks = taskState.filter(t => !t.Hidden);
    const canEdit = !!userName;

    host.innerHTML = activeTeam.map(m => {
      const roleClass = (ROLE_KEYS.find(r => r.v === m.RoleKey) || {}).v === 'programmer' ? 'code' : (m.RoleKey || 'code');
      const mine = visibleTasks
        .filter(t => t.MemberId === m.MemberId)
        .sort((a,b) => a.SortOrder - b.SortOrder);
      const filtered = mine.filter(t => currentPhaseFilter === 'all' || String(t.Phase) === currentPhaseFilter);
      const counts = { todo:0, progress:0, blocked:0, done:0 };
      mine.forEach(t => { counts[t.Status] = (counts[t.Status] || 0) + 1; });

      return `
        <div class="col" data-member-id="${escapeAttr(m.MemberId)}">
          <div class="col-head">
            <span class="chip ${roleClass}">${escapeHtml(m.RoleKey)}</span>
            <span class="role">${escapeHtml(m.RoleLabel)}</span>
            <span class="who">${escapeHtml(m.Name)}</span>
            <button class="col-add-btn" data-member-id="${escapeAttr(m.MemberId)}" ${canEdit?'':'disabled title="Set your name first"'}>＋</button>
          </div>
          <div class="col-count small mono-cell" style="margin-bottom:4px">${filtered.length} showing · ${mine.length} total</div>
          <div class="status-summary">
            <span><b>${counts.done}</b> done</span>
            <span><b>${counts.progress}</b> wip</span>
            <span><b>${counts.blocked}</b> blocked</span>
            <span><b>${counts.todo}</b> todo</span>
          </div>
          <div style="height:10px"></div>
          ${filtered.map(t => renderTaskCard(t, canEdit)).join('') || '<div class="small" style="padding:8px">No tasks in this phase.</div>'}
        </div>
      `;
    }).join('');

    wireBoardEvents(host);
  }

  function renderTaskCard(t, canEdit){
    const upBy = t.UpdatedBy || '';
    const upAt = t.UpdatedAt ? formatTimeAgo(t.UpdatedAt) : '';
    const metaLine = (upBy || upAt) ? `<div class="t-lastupdate">↻ ${escapeHtml(upBy || 'someone')}${upAt ? ' · '+upAt : ''}</div>` : '';
    return `
      <div class="task phase-${t.Phase} st-${t.Status}" data-task-id="${escapeAttr(t.TaskId)}">
        <div class="t-head">
          <div class="t-title">${escapeHtml(t.Title)}</div>
          <div class="t-meta">Phase ${t.Phase} · Pri ${t.Priority.replace(/^P/,'')}</div>
          <button class="t-menu-btn" data-task-id="${escapeAttr(t.TaskId)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
        </div>
        <div class="t-body">${escapeHtml(t.Body)}</div>
        <textarea class="t-notes" data-task-id="${escapeAttr(t.TaskId)}" placeholder="Notes (blockers, context, handoff)…" rows="2">${escapeHtml(t.Notes)}</textarea>
        <div class="t-footer">
          <select class="status-select" data-task-id="${escapeAttr(t.TaskId)}">
            ${STATUSES.map(s=>`<option value="${s.v}" ${t.Status===s.v?'selected':''}>${s.label}</option>`).join('')}
          </select>
          ${metaLine}
        </div>
      </div>
    `;
  }

  function wireBoardEvents(host){
    qsa('.status-select', host).forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-task-id');
        const v = sel.value;
        const card = sel.closest('.task');
        if(card){
          card.classList.remove('st-todo','st-progress','st-blocked','st-done');
          card.classList.add('st-'+v);
        }
        pushRow('Tasks', id, { Status: v }).then(() => renderBoardSummaryOnly());
      });
    });
    qsa('.t-notes', host).forEach(ta => {
      let timer = null;
      let lastSaved = ta.value;
      const flush = () => {
        if(ta.value === lastSaved) return;
        lastSaved = ta.value;
        const id = ta.getAttribute('data-task-id');
        pushRow('Tasks', id, { Notes: ta.value });
      };
      ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 1200); });
      ta.addEventListener('blur',  () => { clearTimeout(timer); flush(); });
    });
    qsa('.col-add-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openEditModal(null, btn.getAttribute('data-member-id'));
      });
    });
    qsa('.t-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openEditModal(btn.getAttribute('data-task-id'), null);
      });
    });
  }

  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

  function renderBoardSummaryOnly(){
    const host = qs('#board');
    if(!host) return;
    const activeTeam = teamState.filter(m => m.Active).slice().sort((a,b) => a.Order - b.Order);
    const visibleTasks = taskState.filter(t => !t.Hidden);
    qsa('.col', host).forEach(colEl => {
      const memberId = colEl.getAttribute('data-member-id');
      const mine = visibleTasks.filter(t => t.MemberId === memberId);
      const counts = { todo:0, progress:0, blocked:0, done:0 };
      mine.forEach(t => { counts[t.Status] = (counts[t.Status] || 0) + 1; });
      const sum = qs('.status-summary', colEl);
      if(sum){
        sum.innerHTML = `
          <span><b>${counts.done}</b> done</span>
          <span><b>${counts.progress}</b> wip</span>
          <span><b>${counts.blocked}</b> blocked</span>
          <span><b>${counts.todo}</b> todo</span>
        `;
      }
    });
  }

  function formatTimeAgo(iso){
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if(s < 60) return 'just now';
    if(s < 3600) return Math.floor(s/60) + 'm ago';
    if(s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderAll(){
    renderGantt();
    renderMilestones();
    renderPhases();
    renderCharacters();
    renderItems();
    renderMaps();
    renderSystems();
    renderBoard();

    // phase filter wiring
    qsa('.phase-filter button').forEach(b=>{
      b.addEventListener('click',()=>{
        qsa('.phase-filter button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        currentPhaseFilter = b.getAttribute('data-phase');
        try{ localStorage.setItem(TAB_FILTER_KEY_CURRENT, currentPhaseFilter); }catch(e){}
        renderBoard();
      });
    });
    // pre-select saved phase button
    const activeBtn = qs(`.phase-filter button[data-phase="${currentPhaseFilter}"]`);
    if(activeBtn){
      qsa('.phase-filter button').forEach(x=>x.classList.remove('active'));
      activeBtn.classList.add('active');
    }
    // refresh now button
    const refreshBtn = qs('#refresh-now-btn');
    if(refreshBtn){ refreshBtn.addEventListener('click', ()=>fetchAll()); }
    // change name button
    const nameBtn = qs('#change-name-btn');
    if(nameBtn){
      nameBtn.addEventListener('click', ()=>{
        const cur = localStorage.getItem(USER_KEY) || '';
        const n = (prompt('Your name:', cur) || '').trim();
        if(n){ try{ localStorage.setItem(USER_KEY, n); }catch(e){} updateSyncPill(); }
      });
    }

    // kick off initial fetch + polling
    fetchAll();
    setInterval(fetchAll, POLL_MS);
    // update the "synced Xs ago" pill every second
    setInterval(updateSyncPill, 1000);
  }

  function openEditModal(taskId, preMemberId){ console.log('openEditModal stub', taskId, preMemberId); }
  function openTeamModal(){ console.log('openTeamModal stub'); }
})();
