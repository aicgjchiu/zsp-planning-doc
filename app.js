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
    const canEdit = !!userName;
    const rows = itemsState
      .filter(it => !it.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map((it, i) => `
      <tr>
        <td class="mono dim">${String(i+1).padStart(2,'0')}</td>
        <td><b>${escapeHtml(it.Name)}</b></td>
        <td>${escapeHtml(it.Kind)}</td>
        <td>${escapeHtml(it.Effect)}</td>
        <td class="num">${it.Stack}</td>
        <td>${it.Existing ? '<span class="chip done">Implemented</span>' : '<span class="chip">To build</span>'}</td>
        <td class="dim">${escapeHtml(it.Notes)} <button class="row-menu-btn" data-item-id="${escapeAttr(it.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>
    `).join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openItemModal(btn.getAttribute('data-item-id'));
      });
    });
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
  const ABILITY_KEYS = ['Q', 'R', 'T']; // fixed slot count per design
  const ABILITY_TYPES = [
    { v:'Skill',    label:'Skill' },
    { v:'Ultimate', label:'Ultimate' },
  ];
  const ABILITY_IMPLS = [
    { v:'Implemented', label:'Implemented' },
    { v:'Partial',     label:'Partial' },
    { v:'Design only', label:'Design only' },
  ];
  const MAP_DIFFICULTIES = [
    { v:'Tutorial map / Run 1', label:'Tutorial map / Run 1' },
    { v:'Run 2',                label:'Run 2' },
    { v:'Run 3',                label:'Run 3' },
    { v:'Final map / Run 4+',   label:'Final map / Run 4+' },
  ];
  const SYS_STATUSES = [
    { v:'In code',     label:'In code' },
    { v:'Partial',     label:'Partial' },
    { v:'Not started', label:'Not started' },
    { v:'Design',      label:'Design' },
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
  let teamState       = [];        // array of Team objects
  let taskState       = [];        // array of Task objects
  let charactersState = [];        // array of Character objects (AbilitiesJson parsed to .abilities)
  let itemsState      = [];        // array of Item objects
  let mapsState       = [];        // array of Map objects
  let systemsState    = [];        // array of System object
  let userName        = '';        // cached identity
  let syncStatus      = 'idle';
  let lastSyncAt      = null;
  let pendingWrites   = 0;

  function genId(prefix){
    return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1e6).toString(36)}`;
  }
  function legacyTaskId(colKey, t, idx){
    const slug = (t.title||'').replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,40);
    return `${colKey}-p${t.phase}-${t.p}-${slug}-${idx}`;
  }
  function getUserName(){
    if(userName) return userName;
    try{ userName = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    if(!userName){
      userName = (prompt('Your name (shown as "last updated by" on tasks):') || '').trim();
      if(userName){ try{ localStorage.setItem(USER_KEY, userName); }catch(e){} }
    }
    return userName;
  }

  async function fetchAll(){
    setSyncStatus('syncing');
    try{
      const res = await fetch(SHEET_ENDPOINT, { method:'GET' });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'fetch failed');
      taskState       = (json.tasks      || []).map(normalizeTaskRow);
      teamState       = (json.team       || []).map(normalizeTeamRow);
      charactersState = (json.characters || []).map(normalizeCharacterRow);
      itemsState      = (json.items      || []).map(normalizeItemRow);
      mapsState       = (json.maps       || []).map(normalizeMapRow);
      systemsState    = (json.systems    || []).map(normalizeSystemRow);
      lastSyncAt = new Date();
      setSyncStatus('ok');
      const anyEmpty =
        teamState.length === 0 || taskState.length === 0 ||
        charactersState.length === 0 || itemsState.length === 0 ||
        mapsState.length === 0 || systemsState.length === 0;
      if(anyEmpty){
        await bootstrapIfEmpty();
      }
      renderBoard();
      renderCharacters();
      renderItems();
      renderMaps();
      renderSystems();
      if(!userName){
        const n = (prompt('Enter your name — shown on tasks you create or update. You can change it later.') || '').trim();
        if(n){
          userName = n;
          try{ localStorage.setItem(USER_KEY, n); }catch(e){}
          updateSyncPill();
          renderBoard();
        }
      }
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
  function normalizeCharacterRow(r){
    let abilities = [];
    try {
      const parsed = JSON.parse(r.AbilitiesJson || '[]');
      if (Array.isArray(parsed)) abilities = parsed;
    } catch(e) {}
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Culture:    String(r.Culture || ''),
      RoleText:   String(r.RoleText || ''),
      Weapon:     String(r.Weapon || ''),
      Status:     String(r.Status || ''),
      StatusChip: String(r.StatusChip || ''),
      Summary:    String(r.Summary || ''),
      abilities:  abilities,
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeItemRow(r){
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Kind:       String(r.Kind || ''),
      Effect:     String(r.Effect || ''),
      Stack:      Number(r.Stack) || 0,
      Existing:   r.Existing === true || r.Existing === 'TRUE' || r.Existing === 'true',
      Notes:      String(r.Notes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeMapRow(r){
    return {
      Id:         String(r.Id || ''),
      Name:       String(r.Name || ''),
      Theme:      String(r.Theme || ''),
      Size:       String(r.Size || ''),
      Enemies:    String(r.Enemies || ''),
      Boss:       String(r.Boss || ''),
      Difficulty: String(r.Difficulty || 'Run 2'),
      BiomeNotes: String(r.BiomeNotes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
    };
  }
  function normalizeSystemRow(r){
    return {
      Id:         String(r.Id || ''),
      System:     String(r.System || ''),
      SysStatus:  String(r.SysStatus || 'Design'),
      Dep:        String(r.Dep || ''),
      Owner:      String(r.Owner || ''),
      Notes:      String(r.Notes || ''),
      Hidden:     r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:  Number(r.SortOrder) || 0,
      CreatedAt:  String(r.CreatedAt || ''),
      UpdatedAt:  String(r.UpdatedAt || ''),
      UpdatedBy:  String(r.UpdatedBy || ''),
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
    const body = { Action: 'bootstrap' };

    if (taskState.length === 0 || teamState.length === 0) {
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
      if (taskState.length === 0) body.Tasks = seedTasks;
      if (teamState.length === 0) body.Team  = SEED_TEAM;
    }

    if (charactersState.length === 0 && Array.isArray(window.CHARACTERS)) {
      body.Characters = window.CHARACTERS.map((c, idx) => ({
        Id:            c.id || `char-seed-${idx}`,
        Name:          c.name || '',
        Culture:       c.culture || '',
        RoleText:      c.role || '',
        Weapon:        c.weapon || '',
        Status:        c.status || '',
        StatusChip:    c.statusChip || '',
        Summary:       c.summary || '',
        AbilitiesJson: JSON.stringify(Array.isArray(c.abilities) ? c.abilities : []),
        Hidden:        false,
        SortOrder:     (idx + 1) * 1000,
        CreatedAt:     '',
        UpdatedAt:     '',
        UpdatedBy:     '',
      }));
    }

    if (itemsState.length === 0 && Array.isArray(window.ITEMS)) {
      body.Items = window.ITEMS.map((it, idx) => ({
        Id:        it.id || `item-seed-${idx}`,
        Name:      it.name || '',
        Kind:      it.kind || '',
        Effect:    it.effect || '',
        Stack:     Number(it.stack) || 0,
        Existing:  !!it.existing,
        Notes:     it.notes || '',
        Hidden:    false,
        SortOrder: (idx + 1) * 1000,
        CreatedAt: '',
        UpdatedAt: '',
        UpdatedBy: '',
      }));
    }

    if (mapsState.length === 0 && Array.isArray(window.MAPS)) {
      body.Maps = window.MAPS.map((m, idx) => ({
        Id:         m.id || `map-seed-${idx}`,
        Name:       m.name || '',
        Theme:      m.theme || '',
        Size:       m.size || '',
        Enemies:    m.enemies || '',
        Boss:       m.boss || '',
        Difficulty: m.difficulty || 'Run 2',
        BiomeNotes: m.biomeNotes || '',
        Hidden:     false,
        SortOrder:  (idx + 1) * 1000,
        CreatedAt:  '',
        UpdatedAt:  '',
        UpdatedBy:  '',
      }));
    }

    if (systemsState.length === 0 && Array.isArray(window.SYSTEMS)) {
      body.Systems = window.SYSTEMS.map((s, idx) => ({
        Id:        s.id || `sys-seed-${idx}`,
        System:    s.sys || '',
        SysStatus: s.status || 'Design',
        Dep:       s.dep || '',
        Owner:     s.owner || '',
        Notes:     s.notes || '',
        Hidden:    false,
        SortOrder: (idx + 1) * 1000,
        CreatedAt: '',
        UpdatedAt: '',
        UpdatedBy: '',
      }));
    }

    // If nothing to seed, nothing to do.
    if (!body.Tasks && !body.Team && !body.Characters && !body.Items && !body.Maps && !body.Systems) return;

    try{
      const res = await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'bootstrap failed');
      // Re-fetch so state reflects seeded rows.
      const r2 = await fetch(SHEET_ENDPOINT, { method:'GET' });
      const j2 = await r2.json();
      taskState       = (j2.tasks      || []).map(normalizeTaskRow);
      teamState       = (j2.team       || []).map(normalizeTeamRow);
      charactersState = (j2.characters || []).map(normalizeCharacterRow);
      itemsState      = (j2.items      || []).map(normalizeItemRow);
      mapsState       = (j2.maps       || []).map(normalizeMapRow);
      systemsState    = (j2.systems    || []).map(normalizeSystemRow);
    }catch(err){
      console.warn('[bootstrap] error:', err);
    }
  }

  function renderLegend(){
    const host = qs('#phase-priority-legend');
    if(!host) return;
    const phases = (window.PHASES || [])
      .map(p => `${p.num} ${escapeHtml(p.name)}`)
      .join(' · ');
    host.innerHTML = `<b>Phase</b> ${phases || '1–6'} &nbsp;·&nbsp;·&nbsp;·&nbsp; <b>Priority</b> P0 Must · P1 Should · P2 Nice`;
  }

  function renderBoard(){
    renderLegend();
    mountSectionAddButtons();
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
        pushRow('Tasks', id, { Status: v }).then(() => fetchAll());
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
    mountSectionAddButtons();
    renderBoard();
    renderLegend();

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
        const cur = (localStorage.getItem(USER_KEY) || '');
        const n = (prompt('Your name:', cur) || '').trim();
        if(n){
          userName = n;
          try{ localStorage.setItem(USER_KEY, n); }catch(e){}
          updateSyncPill();
          renderBoard();
        }
      });
    }
    // team button
    const teamBtn = qs('#team-btn');
    if(teamBtn){
      teamBtn.addEventListener('click', () => {
        if(!userName){ alert('Set your name first (click "Change name").'); return; }
        openTeamModal();
      });
    }

    // kick off initial fetch + polling
    // Identity: read from localStorage on load. If not present, prompt after first fetch.
    try{ userName = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    fetchAll();
    setInterval(fetchAll, POLL_MS);
    // update the "synced Xs ago" pill every second
    setInterval(updateSyncPill, 1000);
  }

  function closeModal(){
    const root = qs('#modal-root');
    if(!root) return;
    root.innerHTML = '';
    root.classList.remove('open');
    document.removeEventListener('keydown', modalKeyHandler);
  }
  function modalKeyHandler(e){ if(e.key === 'Escape') closeModal(); }
  function openModal(panelHtml, onMount){
    const root = qs('#modal-root');
    if(!root) return;
    root.innerHTML = `<div class="modal-overlay" data-overlay>${panelHtml}</div>`;
    root.classList.add('open');
    document.addEventListener('keydown', modalKeyHandler);
    const overlay = qs('[data-overlay]', root);
    overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
    if(typeof onMount === 'function') onMount(root);
  }

  // Real implementations come in later tasks — keep stubs functional so wiring works
  function openEditModal(taskId, preMemberId){
    const isNew = !taskId;
    const t = isNew
      ? { TaskId:'', MemberId: preMemberId || (teamState[0] && teamState[0].MemberId) || '', Title:'', Body:'', Phase:1, Priority:'P1', Status:'todo', Notes:'', Assignee:'', Hidden:false, SortOrder:0 }
      : taskState.find(x => x.TaskId === taskId);
    if(!t){ alert('Task not found.'); return; }

    const phaseOpts = (window.PHASES || []).map(p => `<option value="${p.num}" ${t.Phase===p.num?'selected':''}>Phase ${p.num} — ${escapeHtml(p.name)}</option>`).join('')
      || [1,2,3,4,5,6].map(n => `<option value="${n}" ${t.Phase===n?'selected':''}>Phase ${n}</option>`).join('');
    const prioOpts = PRIORITIES.map(p => `<option value="${p.v}" ${t.Priority===p.v?'selected':''}>${escapeHtml(p.label)}</option>`).join('');
    const memberOpts = teamState.filter(m => m.Active).slice().sort((a,b)=>a.Order-b.Order)
      .map(m => `<option value="${escapeAttr(m.MemberId)}" ${t.MemberId===m.MemberId?'selected':''}>${escapeHtml(m.Name)} (${escapeHtml(m.RoleLabel)})</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Task':'Edit Task'}</h3>
        <label>Title<input type="text" data-f="Title" value="${escapeAttr(t.Title)}"></label>
        <label>Description<textarea data-f="Body">${escapeHtml(t.Body)}</textarea></label>
        <div class="modal-row">
          <label>Phase<select data-f="Phase">${phaseOpts}</select></label>
          <label>Priority<select data-f="Priority">${prioOpts}</select></label>
        </div>
        <div class="modal-row">
          <label>Column / Member<select data-f="MemberId">${memberOpts}</select></label>
          <label>Assignee (optional override)<input type="text" data-f="Assignee" value="${escapeAttr(t.Assignee)}" placeholder="Leave blank for default"></label>
        </div>
        <div class="modal-footer">
          ${isNew ? '' : '<button class="modal-btn danger" data-action="delete">Delete</button>'}
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">${isNew?'Create':'Save'}</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const fields = {};
        qsa('[data-f]', panel).forEach(el => {
          const k = el.getAttribute('data-f');
          let v = el.value;
          if(k === 'Phase') v = Number(v);
          fields[k] = v;
        });
        if(!fields.Title || !String(fields.Title).trim()){
          alert('Title is required.');
          return;
        }
        const key = isNew ? genId('task') : t.TaskId;
        if(isNew){
          const maxSo = taskState
            .filter(x => x.MemberId === fields.MemberId)
            .reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Status = 'todo';
          fields.Hidden = false;
          fields.Notes = '';
        }
        closeModal();
        await pushRow('Tasks', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this task? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Tasks', t.TaskId, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
  function openTeamModal(){
    const draft = teamState.map(m => Object.assign({}, m));

    function panelHtml(){
      const roleOpts = (sel) => ROLE_KEYS.map(r => `<option value="${r.v}" ${sel===r.v?'selected':''}>${escapeHtml(r.label)}</option>`).join('');
      const rows = draft.slice().sort((a,b)=>a.Order-b.Order).map((m, i) => `
        <tr data-member-id="${escapeAttr(m.MemberId)}">
          <td><input type="text" data-f="Name" value="${escapeAttr(m.Name)}"></td>
          <td><select data-f="RoleKey">${roleOpts(m.RoleKey)}</select></td>
          <td><input type="text" data-f="RoleLabel" value="${escapeAttr(m.RoleLabel)}"></td>
          <td class="mono-cell">${m.Order}</td>
          <td>
            <button class="modal-btn" data-action="up" ${i===0?'disabled':''}>↑</button>
            <button class="modal-btn" data-action="down" ${i===draft.length-1?'disabled':''}>↓</button>
          </td>
          <td><label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" data-f="Active" ${m.Active?'checked':''}> active</label></td>
        </tr>
      `).join('');
      return `
        <div class="modal-panel" data-panel style="max-width:720px">
          <h3>Manage Team</h3>
          <table class="sheet">
            <thead><tr><th>Name</th><th>Role</th><th>Role label</th><th>Order</th><th style="width:90px">Reorder</th><th style="width:80px">Active</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div><button class="modal-btn" data-action="add-member">+ Add member</button></div>
          <div class="modal-footer">
            <div class="right">
              <button class="modal-btn" data-action="cancel">Cancel</button>
              <button class="modal-btn primary" data-action="save">Save</button>
            </div>
          </div>
        </div>
      `;
    }

    function rerender(root){
      root.innerHTML = `<div class="modal-overlay" data-overlay>${panelHtml()}</div>`;
      wire(root);
    }

    function wire(root){
      const overlay = qs('[data-overlay]', root);
      overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });
      const panel = qs('[data-panel]', root);
      qsa('tr[data-member-id]', panel).forEach(tr => {
        const id = tr.getAttribute('data-member-id');
        const m = draft.find(x => x.MemberId === id);
        qsa('[data-f]', tr).forEach(el => {
          el.addEventListener('change', () => {
            const k = el.getAttribute('data-f');
            m[k] = (el.type === 'checkbox') ? el.checked : el.value;
          });
        });
        qs('[data-action="up"]', tr).addEventListener('click', () => {
          const sorted = draft.slice().sort((a,b)=>a.Order-b.Order);
          const idx = sorted.findIndex(x => x.MemberId === id);
          if(idx > 0){
            const a = sorted[idx-1], b = sorted[idx];
            const t = a.Order; a.Order = b.Order; b.Order = t;
            rerender(root);
          }
        });
        qs('[data-action="down"]', tr).addEventListener('click', () => {
          const sorted = draft.slice().sort((a,b)=>a.Order-b.Order);
          const idx = sorted.findIndex(x => x.MemberId === id);
          if(idx < sorted.length - 1){
            const a = sorted[idx], b = sorted[idx+1];
            const t = a.Order; a.Order = b.Order; b.Order = t;
            rerender(root);
          }
        });
      });
      qs('[data-action="add-member"]', panel).addEventListener('click', () => {
        const maxOrder = draft.reduce((m,x) => Math.max(m, x.Order||0), 0);
        draft.push({
          MemberId: genId('mbr'),
          Name: 'New member',
          RoleKey: 'programmer',
          RoleLabel: 'Role',
          Order: maxOrder + 1,
          Active: true,
          _isNew: true,
        });
        rerender(root);
      });
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const anyActive = draft.some(m => m.Active);
        if(!anyActive){
          alert('At least one member must be Active.');
          return;
        }
        closeModal();
        for(const m of draft){
          const orig = teamState.find(x => x.MemberId === m.MemberId);
          const changed = !orig
            || orig.Name !== m.Name
            || orig.RoleKey !== m.RoleKey
            || orig.RoleLabel !== m.RoleLabel
            || orig.Order !== m.Order
            || orig.Active !== m.Active;
          if(changed){
            await pushRow('Team', m.MemberId, {
              Name: m.Name, RoleKey: m.RoleKey, RoleLabel: m.RoleLabel, Order: m.Order, Active: m.Active,
            });
          }
        }
        fetchAll();
      });
    }

    const root = qs('#modal-root');
    rerender(root);
    root.classList.add('open');
    document.addEventListener('keydown', modalKeyHandler);
  }

  function mountSectionAddButtons(){
    const canEdit = !!userName;
    const mounts = [
      { id:'add-character-btn', label:'＋ Character', onClick:() => openCharacterModal(null) },
      { id:'add-item-btn',      label:'＋ Item',      onClick:() => openItemModal(null) },
      { id:'add-map-btn',       label:'＋ Map',       onClick:() => openMapModal(null) },
      { id:'add-system-btn',    label:'＋ System',    onClick:() => openSystemModal(null) },
    ];
    mounts.forEach(m => {
      const host = qs('#' + m.id);
      if(!host) return;
      host.innerHTML = `<button ${canEdit?'':'disabled title="Set your name first"'}>${m.label}</button>`;
      const btn = qs('button', host);
      if(btn && canEdit) btn.addEventListener('click', m.onClick);
    });
  }

  function openCharacterModal(id){ alert('Character editor coming in Stage C.'); }
  function openMapModal(id){ alert('Map editor coming in Stage B.'); }
  function openItemModal(id){
    const isNew = !id;
    const it = isNew
      ? { Id:'', Name:'', Kind:'', Effect:'', Stack:1, Existing:false, Notes:'', Hidden:false, SortOrder:0 }
      : itemsState.find(x => x.Id === id);
    if(!it){ alert('Item not found.'); return; }

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add Item':'Edit Item'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(it.Name)}"></label>
        <label>Kind<input type="text" data-f="Kind" value="${escapeAttr(it.Kind)}" placeholder="Consumable / Thrown / Utility / Buff / Revive / Key Item"></label>
        <label>Effect<textarea data-f="Effect">${escapeHtml(it.Effect)}</textarea></label>
        <div class="modal-row">
          <label>Stack<input type="number" data-f="Stack" min="1" value="${it.Stack}"></label>
          <label style="flex-direction:row;align-items:center;gap:6px;margin-top:20px"><input type="checkbox" data-f="Existing" ${it.Existing?'checked':''}> Already implemented in code</label>
        </div>
        <label>Notes<textarea data-f="Notes">${escapeHtml(it.Notes)}</textarea></label>
        <div class="modal-footer">
          ${isNew ? '' : '<button class="modal-btn danger" data-action="delete">Delete</button>'}
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">${isNew?'Create':'Save'}</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', async () => {
        const fields = {};
        qsa('[data-f]', panel).forEach(el => {
          const k = el.getAttribute('data-f');
          let v;
          if (el.type === 'checkbox')      v = el.checked;
          else if (el.type === 'number')   v = Number(el.value) || 0;
          else                             v = el.value;
          fields[k] = v;
        });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Name is required.');
          return;
        }
        const key = isNew ? genId('item') : it.Id;
        if(isNew){
          const maxSo = itemsState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        await pushRow('Items', key, fields);
        fetchAll();
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this item? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', async () => {
            closeModal();
            await pushRow('Items', it.Id, { Hidden: true });
            fetchAll();
          });
        });
      }
    });
  }
  // openSystemModal is implemented in Task 9 (next).
})();
