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
  // Quarter strings: "Y1 Q2" -> 1 (0-based quarter index across the 12-quarter span).
  function parseQuarter(s){
    const m = /^Y(\d)\s*Q(\d)$/.exec(String(s || '').trim());
    if(!m) return -1;
    const idx = (Number(m[1]) - 1) * 4 + (Number(m[2]) - 1);
    return (idx >= 0 && idx < 12) ? idx : -1;
  }

  function renderGantt(){
    const host = qs('#gantt');
    if(!host) return;
    const canEdit = !!userName;
    const gateAttr = canEdit ? '' : 'disabled title="Set your name first"';
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

    // User tracks — rendered from ganttTracksState/ganttBarsState
    const tracks = ganttTracksState
      .filter(t => !t.Hidden)
      .slice()
      .sort((a,b) => (a.Order||0) - (b.Order||0));

    tracks.forEach(track => {
      const bars = ganttBarsState
        .filter(b => b.TrackId === track.TrackId && !b.Hidden)
        .slice()
        // Stable ordering by BarId (creation time) — NOT by Start.
        // Sorting by Start would cause bars to swap lanes on drag; this keeps
        // each bar's lane stable so dragging moves only that bar.
        .sort((a,b) => String(a.BarId).localeCompare(String(b.BarId)));
      // Pack into lanes: per-lane list of { start, end } ranges. A bar takes
      // the lowest-index lane where it doesn't overlap any existing range.
      const laneRanges = []; // laneRanges[i] = array of {s, e}
      const laneByBar = {};
      bars.forEach(b => {
        const s = Number(b.Start), en = Number(b.End);
        let lane = laneRanges.findIndex(ranges =>
          ranges.every(r => en <= r.s || s >= r.e)
        );
        if(lane < 0){ lane = laneRanges.length; laneRanges.push([{s, e: en}]); }
        else { laneRanges[lane].push({s, e: en}); }
        laneByBar[b.BarId] = lane;
      });
      const laneCount = Math.max(1, laneRanges.length);

      html += `<div class="gantt-row" data-track-id="${escapeHtml(track.TrackId)}" style="--lane-count:${laneCount}">`;
      html += `<div class="who"><span class="dot ${escapeHtml(track.Role)}"></span>${escapeHtml(track.Name)}</div>`;
      html += `<div class="track">`;
      bars.forEach(b => {
        const col = Number(b.Start) + 1;
        const span = Math.max(1, Number(b.End) - Number(b.Start));
        const lane = (laneByBar[b.BarId] || 0) + 1;
        html += `<div class="gbar ${escapeHtml(b.Color || 'code')}${b._pending ? ' pending' : ''}" data-bar-id="${escapeHtml(b.BarId)}" style="grid-column:${col} / span ${span};grid-row:${lane}" title="${escapeHtml(b.Name)}">`
              + `<span class="gbar-name">${escapeHtml(b.Name)}</span>`
              + `<button class="gbar-more" data-bar-id="${escapeHtml(b.BarId)}" ${gateAttr || 'title="Edit bar"'}>⋯</button>`
              + `</div>`;
      });
      html += `<button class="gbar-add" data-track-id="${escapeHtml(track.TrackId)}" ${gateAttr || 'title="Add bar to this track"'}>＋</button>`;
      html += `</div></div>`;
    });

    // Auto-derived read-only milestone row (no drag, no ⋯ button)
    html += `<div class="gantt-row gantt-milestone-row">`;
    html += `<div class="who"><span class="dot" style="background:var(--c-milestone)"></span>Milestones</div>`;
    html += `<div class="track">`;
    milestonesState
      .filter(m => !m.Hidden)
      .forEach(m => {
        const qIdx = parseQuarter(m.Quarter);
        if(qIdx < 0){
          console.warn(`[gantt] invalid milestone quarter: ${m.Quarter}`);
          return;
        }
        const title = (m.Goal ? `${m.Name} — ${m.Goal}` : m.Name);
        html += `<div class="gbar milestone${m._pending ? ' pending' : ''}" style="grid-column:${qIdx + 1} / span 1" title="${escapeHtml(title)}">`
              + `<span class="gbar-name">${escapeHtml(m.Name)}</span>`
              + `<button class="gbar-more ms-row-more" data-milestone-id="${escapeHtml(m.MilestoneId)}" ${gateAttr || 'title="Edit milestone"'}>⋯</button>`
              + `</div>`;
      });
    html += `</div></div>`;

    host.innerHTML = html;
  }

  // --- Render: Milestone strip ---
  function renderMilestones(){
    const host = qs('#milestones');
    if(!host) return;
    const canEdit = !!userName;
    const gateAttr = canEdit ? '' : 'disabled title="Set your name first"';
    const active = milestonesState
      .filter(m => !m.Hidden)
      .slice()
      .sort((a,b) => parseQuarter(a.Quarter) - parseQuarter(b.Quarter));

    const cards = active.map(m => `
      <div class="ms${m._pending ? ' pending' : ''}" data-milestone-id="${escapeHtml(m.MilestoneId)}">
        <button class="ms-more" data-milestone-id="${escapeHtml(m.MilestoneId)}" ${gateAttr || 'title="Edit milestone"'}>⋯</button>
        <div class="q">${escapeHtml(m.Quarter)}</div>
        <div class="name">${escapeHtml(m.Name)}</div>
        <div class="goal">${escapeHtml(m.Goal || '')}</div>
      </div>
    `).join('');

    host.innerHTML = cards + `<button class="ms-add" id="milestone-add-btn" ${gateAttr || 'title="Add milestone"'}>＋</button>`;
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
    const canEdit = !!userName;
    const rows = charactersState
      .filter(c => !c.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map(c => {
      const isReady = (c.StatusChip || '').includes('HP');
      const chip = isReady
        ? `<span class="chip char dot">${escapeHtml(c.StatusChip)}</span>`
        : `<span class="chip">${escapeHtml(c.StatusChip)}</span>`;
      const abilitiesRows = (c.abilities || []).map(a => `
        <tr>
          <td class="mono" style="font-weight:600">${escapeHtml(a.key || '')}</td>
          <td><b>${escapeHtml(a.name || '')}</b></td>
          <td class="dim">${escapeHtml(a.type || '')}</td>
          <td>${escapeHtml(a.desc || '')}</td>
          <td><span class="chip ${a.impl==='Implemented'?'done':''}">${escapeHtml(a.impl || '')}</span></td>
        </tr>
      `).join('');
      return `
        <div class="card${c._pending ? ' pending' : ''}" data-char-id="${escapeAttr(c.Id)}" style="padding:22px">
          <button class="card-menu-btn" data-char-id="${escapeAttr(c.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <div>
              <div class="label">${escapeHtml(c.RoleText)}</div>
              <h3 style="font-size:18px">${escapeHtml(c.Name)}</h3>
              <div class="small" style="margin-top:2px">${escapeHtml(c.Culture)} · ${escapeHtml(c.Weapon)}</div>
            </div>
            ${chip}
          </div>
          <p style="margin:10px 0 14px 0;color:var(--ink-2);font-size:13px">${escapeHtml(c.Summary)}</p>
          <div class="table-wrap" style="border-radius:6px">
            <table class="sheet">
              <thead><tr>
                <th style="width:42px">Key</th>
                <th>Ability</th>
                <th style="width:90px">Type</th>
                <th>Description</th>
                <th style="width:110px">Status</th>
              </tr></thead>
              <tbody>${abilitiesRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
    qsa('.card-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openCharacterModal(btn.getAttribute('data-char-id'));
      });
    });
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
      <tr class="${it._pending ? 'pending' : ''}">
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
    const canEdit = !!userName;
    const rows = mapsState
      .filter(m => !m.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map((m, i) => `
      <div class="card${m._pending ? ' pending' : ''}" data-map-id="${escapeAttr(m.Id)}">
        <button class="card-menu-btn" data-map-id="${escapeAttr(m.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button>
        <div class="label">Map ${String(i+1).padStart(2,'0')} · ${escapeHtml(m.Difficulty)}</div>
        <h3>${escapeHtml(m.Name)}</h3>
        <p style="margin:6px 0 12px 0">${escapeHtml(m.Theme)}</p>
        <dl class="kv">
          <dt>Size</dt><dd class="mono-cell">${escapeHtml(m.Size)}</dd>
          <dt>Enemies</dt><dd>${escapeHtml(m.Enemies)}</dd>
          <dt>Boss</dt><dd>${escapeHtml(m.Boss)}</dd>
          <dt>Layout</dt><dd style="font-size:12.5px;color:var(--ink-2)">${escapeHtml(m.BiomeNotes)}</dd>
        </dl>
      </div>
    `).join('');
    qsa('.card-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openMapModal(btn.getAttribute('data-map-id'));
      });
    });
  }

  // --- Render: Systems ---
  function renderSystems(){
    const host = qs('#systems-table tbody');
    if(!host) return;
    const canEdit = !!userName;
    const rows = systemsState
      .filter(s => !s.Hidden)
      .slice()
      .sort((a,b) => a.SortOrder - b.SortOrder);
    host.innerHTML = rows.map(s => `
      <tr class="${s._pending ? 'pending' : ''}">
        <td><b>${escapeHtml(s.System)}</b></td>
        <td>${s.SysStatus==='In code' ? '<span class="chip done">In code</span>' : '<span class="chip">'+escapeHtml(s.SysStatus)+'</span>'}</td>
        <td class="dim">${escapeHtml(s.Dep)}</td>
        <td>${escapeHtml(s.Owner)}</td>
        <td>${escapeHtml(s.Notes)} <button class="row-menu-btn" data-sys-id="${escapeAttr(s.Id)}" ${canEdit?'':'disabled title="Set your name first"'}>⋯</button></td>
      </tr>
    `).join('');
    qsa('.row-menu-btn', host).forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
        openSystemModal(btn.getAttribute('data-sys-id'));
      });
    });
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
  let ganttTracksState = [];       // array of GanttTrack objects
  let ganttBarsState   = [];       // array of GanttBar objects
  let milestonesState  = [];       // array of Milestone objects
  let userName        = '';        // cached identity
  let syncStatus      = 'idle';
  let lastSyncAt      = null;
  let pendingWrites   = 0;

  function genId(prefix){
    return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1e6).toString(36)}`;
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
      ganttTracksState = (json.ganttTracks || []).map(normalizeGanttTrackRow);
      ganttBarsState   = (json.ganttBars   || []).map(normalizeGanttBarRow);
      milestonesState  = (json.milestones  || []).map(normalizeMilestoneRow);
      lastSyncAt = new Date();
      setSyncStatus('ok');
      const anyEmpty =
        teamState.length === 0 || taskState.length === 0 ||
        charactersState.length === 0 || itemsState.length === 0 ||
        mapsState.length === 0 || systemsState.length === 0;
      if(anyEmpty){
        console.warn('[zsp] One or more sheet tabs are empty. Populate Tasks/Team/Characters/Items/Maps/Systems in the Google Sheet.');
      }
      renderBoard();
      renderCharacters();
      renderItems();
      renderMaps();
      renderSystems();
      renderGantt();
      renderMilestones();
      if(!userName){
        const n = (prompt('Enter your name — shown on tasks you create or update. You can change it later.') || '').trim();
        if(n){
          userName = n;
          try{ localStorage.setItem(USER_KEY, n); }catch(e){}
          updateSyncPill();
          renderBoard();
          renderGantt();
          renderMilestones();
        }
      }
      await bootstrapIfEmpty();
    }catch(err){
      console.warn('[sync] fetch error:', err);
      setSyncStatus('error');
    }
  }

  async function bootstrapIfEmpty(){
    // Idempotent: only seeds the three new Roadmap tabs when they're all empty.
    if(ganttTracksState.length || ganttBarsState.length || milestonesState.length) return;
    if(!window.GANTT || !window.MILESTONES) return;

    const tracks = [];
    const bars = [];
    window.GANTT.forEach((lane, laneIdx) => {
      // Skip the legacy "Milestones" lane — that data lives in the Milestones tab now.
      if((lane.role || '').toLowerCase() === 'milestone') return;
      const trackId = genId('track');
      tracks.push({
        TrackId: trackId,
        Name: lane.who || lane.name || 'Track',
        Role: lane.role || 'code',
        Order: laneIdx,
        Hidden: false,
        SortOrder: laneIdx,
      });
      (lane.bars || []).forEach((b, bi) => {
        bars.push({
          BarId: genId('bar'),
          TrackId: trackId,
          Name: b.name,
          Start: b.start,
          End: b.end,
          Color: b.color || lane.role || 'code',
          Hidden: false,
          SortOrder: bi,
        });
      });
    });

    const milestones = window.MILESTONES.map((m, i) => ({
      MilestoneId: genId('ms'),
      Quarter: m.q || m.quarter || '',
      Name: m.name || '',
      Goal: m.goal || '',
      Hidden: false,
      SortOrder: i,
    }));

    try{
      await fetch(SHEET_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          Action: 'bootstrap',
          UpdatedBy: userName || 'bootstrap',
          Tabs: { GanttTracks: tracks, GanttBars: bars, Milestones: milestones },
        }),
      });
      await fetchAll();
    }catch(err){
      console.warn('[bootstrap] failed:', err);
    }
  }

  function applyOptimisticPatch(tab, key, fields){
    const nowIso = new Date().toISOString();
    const stamp = { UpdatedAt: nowIso, UpdatedBy: userName || 'anonymous', _pending: true };
    if(tab === 'Tasks'){
      const i = taskState.findIndex(t => t.TaskId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) taskState[i] = Object.assign({}, taskState[i], patch);
      else       taskState.push(Object.assign({ TaskId: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Team'){
      const i = teamState.findIndex(m => m.MemberId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) teamState[i] = Object.assign({}, teamState[i], patch);
      else       teamState.push(Object.assign({ MemberId: key }, patch));
    } else if(tab === 'Characters'){
      const i = charactersState.findIndex(c => c.Id === key);
      let abilities;
      if(fields.AbilitiesJson !== undefined){
        try { const p = JSON.parse(fields.AbilitiesJson); abilities = Array.isArray(p) ? p : []; }
        catch(e){ abilities = []; }
      } else if(i >= 0){ abilities = charactersState[i].abilities; }
      else { abilities = []; }
      const patch = Object.assign({}, fields, { abilities }, stamp);
      if(i >= 0) charactersState[i] = Object.assign({}, charactersState[i], patch);
      else       charactersState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Items'){
      const i = itemsState.findIndex(x => x.Id === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) itemsState[i] = Object.assign({}, itemsState[i], patch);
      else       itemsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Maps'){
      const i = mapsState.findIndex(x => x.Id === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) mapsState[i] = Object.assign({}, mapsState[i], patch);
      else       mapsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Systems'){
      const i = systemsState.findIndex(x => x.Id === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) systemsState[i] = Object.assign({}, systemsState[i], patch);
      else       systemsState.push(Object.assign({ Id: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'GanttTracks'){
      const i = ganttTracksState.findIndex(x => x.TrackId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) ganttTracksState[i] = Object.assign({}, ganttTracksState[i], patch);
      else       ganttTracksState.push(Object.assign({ TrackId: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'GanttBars'){
      const i = ganttBarsState.findIndex(x => x.BarId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) ganttBarsState[i] = Object.assign({}, ganttBarsState[i], patch);
      else       ganttBarsState.push(Object.assign({ BarId: key, CreatedAt: nowIso }, patch));
    } else if(tab === 'Milestones'){
      const i = milestonesState.findIndex(x => x.MilestoneId === key);
      const patch = Object.assign({}, fields, stamp);
      if(i >= 0) milestonesState[i] = Object.assign({}, milestonesState[i], patch);
      else       milestonesState.push(Object.assign({ MilestoneId: key, CreatedAt: nowIso }, patch));
    }
  }

  function clearPendingFlag(tab, key){
    const target =
      tab === 'Tasks'       ? { arr: taskState,        idField: 'TaskId'      } :
      tab === 'Team'        ? { arr: teamState,        idField: 'MemberId'    } :
      tab === 'Characters'  ? { arr: charactersState,  idField: 'Id'          } :
      tab === 'Items'       ? { arr: itemsState,       idField: 'Id'          } :
      tab === 'Maps'        ? { arr: mapsState,        idField: 'Id'          } :
      tab === 'Systems'     ? { arr: systemsState,     idField: 'Id'          } :
      tab === 'GanttTracks' ? { arr: ganttTracksState, idField: 'TrackId'     } :
      tab === 'GanttBars'   ? { arr: ganttBarsState,   idField: 'BarId'       } :
      tab === 'Milestones'  ? { arr: milestonesState,  idField: 'MilestoneId' } : null;
    if(!target) return;
    const i = target.arr.findIndex(x => x[target.idField] === key);
    if(i >= 0 && target.arr[i]._pending){
      const copy = Object.assign({}, target.arr[i]);
      delete copy._pending;
      target.arr[i] = copy;
    }
  }

  // Runs fetchAll only when no writes are in flight. Used by every caller
  // that wants to reconcile local state with the server after a push. If
  // multiple pushRow calls are chained (e.g. bulk-save, rapid drags), only
  // the last one to resolve will actually trigger the GET, preventing stale
  // reads that snap the UI back to an older server state.
  function fetchIfIdle(){
    if(pendingWrites === 0) fetchAll();
  }

  async function pushRow(tab, key, fields){
    applyOptimisticPatch(tab, key, fields);
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
      clearPendingFlag(tab, key);
    }catch(err){
      console.warn('[sync] push error:', err);
      setSyncStatus('error');
      clearPendingFlag(tab, key);
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
  function normalizeGanttTrackRow(r){
    return {
      TrackId:   String(r.TrackId || ''),
      Name:      String(r.Name || ''),
      Role:      String(r.Role || 'code'),
      Order:     Number(r.Order) || 0,
      Hidden:    r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder: Number(r.SortOrder) || 0,
      CreatedAt: String(r.CreatedAt || ''),
      UpdatedAt: String(r.UpdatedAt || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
    };
  }
  function normalizeGanttBarRow(r){
    return {
      BarId:     String(r.BarId || ''),
      TrackId:   String(r.TrackId || ''),
      Name:      String(r.Name || ''),
      Start:     Number(r.Start) || 0,
      End:       Number(r.End) || 1,
      Color:     String(r.Color || 'code'),
      Hidden:    r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder: Number(r.SortOrder) || 0,
      CreatedAt: String(r.CreatedAt || ''),
      UpdatedAt: String(r.UpdatedAt || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
    };
  }
  function normalizeMilestoneRow(r){
    return {
      MilestoneId: String(r.MilestoneId || ''),
      Quarter:     String(r.Quarter || ''),
      Name:        String(r.Name || ''),
      Goal:        String(r.Goal || ''),
      Hidden:      r.Hidden === true || r.Hidden === 'TRUE' || r.Hidden === 'true',
      SortOrder:   Number(r.SortOrder) || 0,
      CreatedAt:   String(r.CreatedAt || ''),
      UpdatedAt:   String(r.UpdatedAt || ''),
      UpdatedBy:   String(r.UpdatedBy || ''),
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
      <div class="task phase-${t.Phase} st-${t.Status}${t._pending ? ' pending' : ''}" data-task-id="${escapeAttr(t.TaskId)}">
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
          card.classList.add('pending');
        }
        pushRow('Tasks', id, { Status: v }).then(() => renderBoard());
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
          renderGantt();
          renderMilestones();
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
    // tracks button (Roadmap tab)
    const tracksBtn = qs('#tracks-btn');
    if(tracksBtn){
      tracksBtn.addEventListener('click', () => {
        if(!userName){ alert('Set your name first (click "Change name").'); return; }
        openTracksModal();
      });
    }

    // Gantt bar drag — pointerdown delegation on #gantt (user tracks only)
    const ganttForDrag = qs('#gantt');
    if(ganttForDrag){
      ganttForDrag.addEventListener('pointerdown', onGanttPointerDown);
    }

    // Gantt bar actions — event delegation on #gantt
    const gantt = qs('#gantt');
    if(gantt){
      gantt.addEventListener('click', async (e) => {
        const moreBtn = e.target.closest('.gbar-more');
        if(moreBtn){
          e.stopPropagation();
          if(!userName){ alert('Set your name first (click "Change name").'); return; }
          const msId = moreBtn.getAttribute('data-milestone-id');
          if(msId){ openMilestoneModal(msId); return; }
          openBarModal(moreBtn.getAttribute('data-bar-id'));
          return;
        }
        const addBtn = e.target.closest('.gbar-add');
        if(addBtn){
          if(!userName){ alert('Set your name first (click "Change name").'); return; }
          const trackId = addBtn.getAttribute('data-track-id');
          const track = ganttTracksState.find(t => t.TrackId === trackId);
          if(!track) return;
          const newId = genId('bar');
          const fields = {
            BarId: newId,
            TrackId: trackId,
            Name: 'New bar',
            Start: 0,
            End: 1,
            Color: track.Role || 'code',
            Hidden: false,
            SortOrder: 0,
          };
          const p = pushRow('GanttBars', newId, fields);
          renderGantt();
          openBarModal(newId);
          p.then(fetchIfIdle);
        }
      });
    }

    // Milestone strip actions — event delegation
    const msStrip = qs('#milestones');
    if(msStrip){
      msStrip.addEventListener('click', async (e) => {
        const moreBtn = e.target.closest('.ms-more');
        if(moreBtn){
          if(!userName){ alert('Set your name first (click "Change name").'); return; }
          openMilestoneModal(moreBtn.getAttribute('data-milestone-id'));
          return;
        }
        if(e.target.closest('#milestone-add-btn')){
          if(!userName){ alert('Set your name first (click "Change name").'); return; }
          await addMilestone();
        }
      });
    }

    // kick off initial fetch + polling
    // Identity: read from localStorage on load. If not present, prompt after first fetch.
    try{ userName = localStorage.getItem(USER_KEY) || ''; }catch(e){}
    fetchAll();
    setInterval(fetchIfIdle, POLL_MS);
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
        const p = pushRow('Tasks', key, fields);
        renderBoard();
        p.then(fetchIfIdle);
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
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Tasks', t.TaskId, { Hidden: true });
            renderBoard();
            p.then(fetchIfIdle);
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
            pushRow('Team', m.MemberId, {
              Name: m.Name, RoleKey: m.RoleKey, RoleLabel: m.RoleLabel, Order: m.Order, Active: m.Active,
            });
          }
        }
        setTimeout(fetchIfIdle, 100);
      });
    }

    const root = qs('#modal-root');
    rerender(root);
    root.classList.add('open');
    document.addEventListener('keydown', modalKeyHandler);
  }

  // --- Gantt bar drag (user tracks only, identity-gated) ---
  const GANTT_COLUMN_PX = 120;
  let dragState = null;

  function onGanttPointerDown(e){
    if(!userName) return;
    // Ignore clicks on the ⋯ and ＋ buttons — let them bubble to the click handler.
    if(e.target.closest('.gbar-more') || e.target.closest('.gbar-add')) return;
    const el = e.target.closest('.gbar');
    if(!el) return;
    // Milestone row is read-only.
    if(el.closest('.gantt-milestone-row')) return;
    const barId = el.getAttribute('data-bar-id');
    const bar = ganttBarsState.find(b => b.BarId === barId);
    if(!bar) return;

    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    let zone;
    if(offsetX < 8) zone = 'start';
    else if(offsetX > rect.width - 8) zone = 'end';
    else zone = 'move';

    dragState = {
      barId, zone, el,
      origStart: Number(bar.Start),
      origEnd: Number(bar.End),
      startX: e.clientX,
      newStart: Number(bar.Start),
      newEnd: Number(bar.End),
      moved: false,
    };
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
    el.classList.add('dragging');
    document.body.style.cursor = (zone === 'move') ? 'grabbing' : 'ew-resize';
    el.addEventListener('pointermove', onBarPointerMove);
    el.addEventListener('pointerup', onBarPointerUp);
    el.addEventListener('pointercancel', onBarPointerCancel);
    e.preventDefault();
  }

  function onBarPointerMove(e){
    if(!dragState) return;
    const delta = Math.round((e.clientX - dragState.startX) / GANTT_COLUMN_PX);
    let s = dragState.origStart, en = dragState.origEnd;
    if(dragState.zone === 'move'){ s += delta; en += delta; }
    else if(dragState.zone === 'start'){ s += delta; }
    else if(dragState.zone === 'end'){ en += delta; }
    // Clamps
    if(s < 0){
      if(dragState.zone === 'move') en += (0 - s);
      s = 0;
    }
    if(en > 12){
      if(dragState.zone === 'move') s -= (en - 12);
      en = 12;
    }
    if(en - s < 1){
      if(dragState.zone === 'start') s = en - 1;
      else if(dragState.zone === 'end') en = s + 1;
      else { en = s + 1; }
    }
    dragState.el.style.gridColumn = `${s + 1} / span ${en - s}`;
    dragState.newStart = s;
    dragState.newEnd = en;
    if(s !== dragState.origStart || en !== dragState.origEnd) dragState.moved = true;
  }

  function onBarPointerUp(e){
    if(!dragState) return;
    const { barId, origStart, origEnd, newStart, newEnd, moved } = dragState;
    cleanupDrag(e);
    if(!moved || (newStart === origStart && newEnd === origEnd)) return;
    const p = pushRow('GanttBars', barId, { Start: newStart, End: newEnd });
    renderGantt();
    p.then(fetchIfIdle);
  }

  function onBarPointerCancel(e){
    if(!dragState) return;
    const { el, origStart, origEnd } = dragState;
    el.style.gridColumn = `${origStart + 1} / span ${origEnd - origStart}`;
    cleanupDrag(e);
  }

  function cleanupDrag(e){
    if(!dragState) return;
    const { el } = dragState;
    el.classList.remove('dragging');
    document.body.style.cursor = '';
    el.removeEventListener('pointermove', onBarPointerMove);
    el.removeEventListener('pointerup', onBarPointerUp);
    el.removeEventListener('pointercancel', onBarPointerCancel);
    try{ el.releasePointerCapture(e.pointerId); }catch(err){}
    dragState = null;
  }

  function openBarModal(barId){
    const bar = ganttBarsState.find(b => b.BarId === barId);
    if(!bar){ alert('Bar not found.'); return; }
    const COLOR_OPTS = ['portal','code','char','env','vfx'];

    const startOpts = [];
    for(let i = 0; i <= 11; i++){
      const y = Math.floor(i/4) + 1, q = (i % 4) + 1;
      startOpts.push(`<option value="${i}" ${Number(bar.Start)===i?'selected':''}>Y${y} Q${q}</option>`);
    }
    const endOpts = [];
    for(let i = 1; i <= 12; i++){
      const y = Math.floor((i-1)/4) + 1, q = ((i-1) % 4) + 1;
      const label = (i === 12) ? 'end of Y3 Q4' : `Y${y} Q${q} (end)`;
      endOpts.push(`<option value="${i}" ${Number(bar.End)===i?'selected':''}>${label}</option>`);
    }
    const colorOpts = COLOR_OPTS.map(c => `<option value="${c}" ${bar.Color===c?'selected':''}>${c}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel style="max-width:520px">
        <h3>Edit bar</h3>
        <label>Name <input type="text" id="bar-name" value="${escapeAttr(bar.Name)}"></label>
        <label>Color <select id="bar-color">${colorOpts}</select></label>
        <label>Start <select id="bar-start">${startOpts.join('')}</select></label>
        <label>End <select id="bar-end">${endOpts.join('')}</select></label>
        <div class="modal-footer">
          <button class="modal-btn danger" data-action="delete">Delete</button>
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="delete"]', panel).addEventListener('click', () => {
        if(!confirm('Delete this bar?')) return;
        closeModal();
        const p = pushRow('GanttBars', bar.BarId, { Hidden: true });
        renderGantt();
        p.then(fetchIfIdle);
      });
      qs('[data-action="save"]', panel).addEventListener('click', () => {
        const name = qs('#bar-name', panel).value.trim();
        const color = qs('#bar-color', panel).value;
        const start = Number(qs('#bar-start', panel).value);
        const end = Number(qs('#bar-end', panel).value);
        if(end <= start){ alert('End must be after Start.'); return; }
        closeModal();
        const patch = { Name: name, Color: color, Start: start, End: end };
        const p = pushRow('GanttBars', bar.BarId, patch);
        renderGantt();
        p.then(fetchIfIdle);
      });
    });
  }

  function openMilestoneModal(milestoneId){
    const m = milestonesState.find(x => x.MilestoneId === milestoneId);
    if(!m){ alert('Milestone not found.'); return; }

    const quarterOpts = [];
    for(let y = 1; y <= 3; y++) for(let q = 1; q <= 4; q++){
      const s = `Y${y} Q${q}`;
      quarterOpts.push(`<option value="${s}" ${m.Quarter===s?'selected':''}>${s}</option>`);
    }

    const html = `
      <div class="modal-panel" data-panel style="max-width:520px">
        <h3>Edit milestone</h3>
        <label>Quarter <select id="ms-quarter">${quarterOpts.join('')}</select></label>
        <label>Name <input type="text" id="ms-name" value="${escapeAttr(m.Name)}"></label>
        <label>Goal <textarea id="ms-goal" rows="4">${escapeHtml(m.Goal || '')}</textarea></label>
        <div class="modal-footer">
          <button class="modal-btn danger" data-action="delete">Delete</button>
          <div class="right">
            <button class="modal-btn" data-action="cancel">Cancel</button>
            <button class="modal-btn primary" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `;
    openModal(html, (root) => {
      const panel = qs('[data-panel]', root);
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="delete"]', panel).addEventListener('click', () => {
        if(!confirm('Delete this milestone?')) return;
        closeModal();
        const p = pushRow('Milestones', m.MilestoneId, { Hidden: true });
        renderGantt();
        renderMilestones();
        p.then(fetchIfIdle);
      });
      qs('[data-action="save"]', panel).addEventListener('click', () => {
        const quarter = qs('#ms-quarter', panel).value;
        const name = qs('#ms-name', panel).value.trim();
        const goal = qs('#ms-goal', panel).value;
        closeModal();
        const patch = { Quarter: quarter, Name: name, Goal: goal };
        const p = pushRow('Milestones', m.MilestoneId, patch);
        renderGantt();
        renderMilestones();
        p.then(fetchIfIdle);
      });
    });
  }

  function addMilestone(){
    const taken = new Set(
      milestonesState.filter(m => !m.Hidden).map(m => m.Quarter)
    );
    let quarter = 'Y1 Q1';
    outer: for(let y = 1; y <= 3; y++) for(let q = 1; q <= 4; q++){
      const s = `Y${y} Q${q}`;
      if(!taken.has(s)){ quarter = s; break outer; }
    }
    const newId = genId('ms');
    const fields = {
      MilestoneId: newId,
      Quarter: quarter,
      Name: 'New milestone',
      Goal: '',
      Hidden: false,
      SortOrder: 0,
    };
    const p = pushRow('Milestones', newId, fields);
    renderGantt();
    renderMilestones();
    openMilestoneModal(newId);
    p.then(fetchIfIdle);
  }

  function openTracksModal(){
    const draft = ganttTracksState.filter(t => !t.Hidden).map(t => Object.assign({}, t));
    const ROLE_OPTS = ['portal','code','char','env','vfx'];

    function panelHtml(){
      const sorted = draft.slice().sort((a,b) => (a.Order||0) - (b.Order||0));
      const roleOpts = (sel) => ROLE_OPTS.map(r => `<option value="${r}" ${sel===r?'selected':''}>${r}</option>`).join('');
      const rows = sorted.map((t, i) => `
        <tr data-track-id="${escapeAttr(t.TrackId)}">
          <td><input type="text" data-f="Name" value="${escapeAttr(t.Name)}"></td>
          <td><select data-f="Role">${roleOpts(t.Role)}</select></td>
          <td class="mono-cell">${t.Order}</td>
          <td>
            <button class="modal-btn" data-action="up" ${i===0?'disabled':''}>↑</button>
            <button class="modal-btn" data-action="down" ${i===sorted.length-1?'disabled':''}>↓</button>
          </td>
          <td><button class="modal-btn danger" data-action="delete">Delete</button></td>
        </tr>
      `).join('');
      return `
        <div class="modal-panel" data-panel style="max-width:720px">
          <h3>Manage Roadmap Tracks</h3>
          <p class="small" style="color:var(--ink-3);margin-top:-8px">Delete soft-hides the track; its bars stay in the sheet.</p>
          <table class="sheet">
            <thead><tr><th>Name</th><th>Role</th><th>Order</th><th style="width:90px">Reorder</th><th style="width:90px">Delete</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div><button class="modal-btn" data-action="add-track">+ Add track</button></div>
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
      qsa('tr[data-track-id]', panel).forEach(tr => {
        const id = tr.getAttribute('data-track-id');
        const t = draft.find(x => x.TrackId === id);
        qsa('[data-f]', tr).forEach(el => {
          el.addEventListener('change', () => {
            const k = el.getAttribute('data-f');
            t[k] = el.value;
          });
        });
        qs('[data-action="up"]', tr).addEventListener('click', () => {
          const sorted = draft.filter(x => !x._delete).slice().sort((a,b) => (a.Order||0) - (b.Order||0));
          const idx = sorted.findIndex(x => x.TrackId === id);
          if(idx > 0){
            const a = sorted[idx-1], b = sorted[idx];
            const tmp = a.Order; a.Order = b.Order; b.Order = tmp;
            rerender(root);
          }
        });
        qs('[data-action="down"]', tr).addEventListener('click', () => {
          const sorted = draft.filter(x => !x._delete).slice().sort((a,b) => (a.Order||0) - (b.Order||0));
          const idx = sorted.findIndex(x => x.TrackId === id);
          if(idx >= 0 && idx < sorted.length - 1){
            const a = sorted[idx], b = sorted[idx+1];
            const tmp = a.Order; a.Order = b.Order; b.Order = tmp;
            rerender(root);
          }
        });
        qs('[data-action="delete"]', tr).addEventListener('click', () => {
          if(!confirm(`Delete track "${t.Name}"? Its bars will be hidden too.`)) return;
          t._delete = true;
          rerender(root);
        });
      });
      qs('[data-action="add-track"]', panel).addEventListener('click', () => {
        const maxOrder = draft.reduce((m,x) => Math.max(m, x.Order||0), -1);
        draft.push({
          TrackId: genId('track'),
          Name: 'New track',
          Role: 'code',
          Order: maxOrder + 1,
          Hidden: false,
          SortOrder: maxOrder + 1,
          _isNew: true,
        });
        rerender(root);
      });
      qs('[data-action="cancel"]', panel).addEventListener('click', closeModal);
      qs('[data-action="save"]', panel).addEventListener('click', () => {
        closeModal();
        for(const t of draft){
          if(t._delete){
            if(!t._isNew){
              pushRow('GanttTracks', t.TrackId, { Hidden: true });
            }
            continue;
          }
          const orig = ganttTracksState.find(x => x.TrackId === t.TrackId);
          const changed = !orig
            || orig.Name !== t.Name
            || orig.Role !== t.Role
            || orig.Order !== t.Order;
          if(changed){
            pushRow('GanttTracks', t.TrackId, {
              TrackId: t.TrackId, Name: t.Name, Role: t.Role, Order: t.Order,
            });
          }
        }
        setTimeout(fetchIfIdle, 100);
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
      { id:'add-character-btn', tip:'Add character', onClick:() => openCharacterModal(null) },
      { id:'add-item-btn',      tip:'Add item',      onClick:() => openItemModal(null) },
      { id:'add-map-btn',       tip:'Add map',       onClick:() => openMapModal(null) },
      { id:'add-system-btn',    tip:'Add system',    onClick:() => openSystemModal(null) },
    ];
    mounts.forEach(m => {
      const host = qs('#' + m.id);
      if(!host) return;
      const tip = canEdit ? m.tip : 'Set your name first';
      host.innerHTML = `<button title="${tip}" ${canEdit?'':'disabled'}>+</button>`;
      const btn = qs('button', host);
      if(btn && canEdit) btn.addEventListener('click', m.onClick);
    });
  }

  function openSystemModal(id){
    const isNew = !id;
    const s = isNew
      ? { Id:'', System:'', SysStatus:'Design', Dep:'', Owner:'', Notes:'', Hidden:false, SortOrder:0 }
      : systemsState.find(x => x.Id === id);
    if(!s){ alert('System not found.'); return; }

    const statusOpts = SYS_STATUSES.map(o => `<option value="${o.v}" ${s.SysStatus===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel>
        <h3>${isNew?'Add System':'Edit System'}</h3>
        <label>System<input type="text" data-f="System" value="${escapeAttr(s.System)}" placeholder="e.g. GAS, Inventory, Quest System"></label>
        <div class="modal-row">
          <label>Status<select data-f="SysStatus">${statusOpts}</select></label>
          <label>Owner<input type="text" data-f="Owner" value="${escapeAttr(s.Owner)}" placeholder="e.g. Jeff, Jeff + Shared"></label>
        </div>
        <label>Depends on<textarea data-f="Dep" placeholder="e.g. Core Loop, GAS">${escapeHtml(s.Dep)}</textarea></label>
        <label>Notes<textarea data-f="Notes">${escapeHtml(s.Notes)}</textarea></label>
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
        qsa('[data-f]', panel).forEach(el => { fields[el.getAttribute('data-f')] = el.value; });
        if(!fields.System || !String(fields.System).trim()){
          alert('System name is required.');
          return;
        }
        const key = isNew ? genId('sys') : s.Id;
        if(isNew){
          const maxSo = systemsState.reduce((m,x) => Math.max(m, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        const p = pushRow('Systems', key, fields);
        renderSystems();
        p.then(fetchIfIdle);
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this system? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Systems', s.Id, { Hidden: true });
            renderSystems();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }

  function openCharacterModal(id){
    const isNew = !id;
    const c = isNew
      ? { Id:'', Name:'', Culture:'', RoleText:'', Weapon:'', Status:'', StatusChip:'', Summary:'', abilities:[], Hidden:false, SortOrder:0 }
      : charactersState.find(x => x.Id === id);
    if(!c){ alert('Character not found.'); return; }

    // Ensure exactly 3 ability slots in draft, pre-filled by key
    const abDraft = ABILITY_KEYS.map((k, i) => {
      const existing = (c.abilities || []).find(a => a && a.key === k)
        || (c.abilities || [])[i]
        || {};
      return {
        key:  k,
        name: existing.name || '',
        type: existing.type || 'Skill',
        desc: existing.desc || '',
        impl: existing.impl || 'Design only',
      };
    });

    function abilityRowHtml(row, i){
      const typeOpts = ABILITY_TYPES.map(o => `<option value="${o.v}" ${row.type===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
      const implOpts = ABILITY_IMPLS.map(o => `<option value="${o.v}" ${row.impl===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
      return `
        <tr data-ability-idx="${i}">
          <td class="key-cell">${escapeHtml(row.key)}</td>
          <td><input type="text" data-ab="name" value="${escapeAttr(row.name)}"></td>
          <td><select data-ab="type">${typeOpts}</select></td>
          <td><textarea data-ab="desc">${escapeHtml(row.desc)}</textarea></td>
          <td><select data-ab="impl">${implOpts}</select></td>
        </tr>
      `;
    }

    const html = `
      <div class="modal-panel" data-panel style="max-width:760px">
        <h3>${isNew?'Add Character':'Edit Character'}</h3>
        <div class="modal-row">
          <label>Name<input type="text" data-f="Name" value="${escapeAttr(c.Name)}" placeholder="e.g. Daoshi · 道士"></label>
          <label>Culture<input type="text" data-f="Culture" value="${escapeAttr(c.Culture)}" placeholder="e.g. Chinese Taoist"></label>
        </div>
        <div class="modal-row">
          <label>Role<input type="text" data-f="RoleText" value="${escapeAttr(c.RoleText)}" placeholder="e.g. Ranged Caster / Area Control"></label>
          <label>Weapon<input type="text" data-f="Weapon" value="${escapeAttr(c.Weapon)}"></label>
        </div>
        <div class="modal-row">
          <label>Status (long)<input type="text" data-f="Status" value="${escapeAttr(c.Status)}"></label>
          <label>Status chip (short)<input type="text" data-f="StatusChip" value="${escapeAttr(c.StatusChip)}" placeholder="e.g. asset: HP ready"></label>
        </div>
        <label>Summary<textarea data-f="Summary">${escapeHtml(c.Summary)}</textarea></label>
        <div>
          <div class="label" style="margin-top:6px">Abilities (Q / R / T — exactly 3 slots)</div>
          <table class="abilities-subtable" data-abilities>
            <thead><tr><th>Key</th><th>Name</th><th style="width:90px">Type</th><th>Description</th><th style="width:110px">Impl</th></tr></thead>
            <tbody>${abDraft.map(abilityRowHtml).join('')}</tbody>
          </table>
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
        qsa('[data-f]', panel).forEach(el => { fields[el.getAttribute('data-f')] = el.value; });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Name is required.');
          return;
        }
        // Collect abilities from sub-table
        const abs = [];
        qsa('tr[data-ability-idx]', panel).forEach(tr => {
          const i = Number(tr.getAttribute('data-ability-idx'));
          abs.push({
            key:  ABILITY_KEYS[i],
            name: qs('[data-ab="name"]', tr).value,
            type: qs('[data-ab="type"]', tr).value,
            desc: qs('[data-ab="desc"]', tr).value,
            impl: qs('[data-ab="impl"]', tr).value,
          });
        });
        fields.AbilitiesJson = JSON.stringify(abs);
        const key = isNew ? genId('char') : c.Id;
        if(isNew){
          const maxSo = charactersState.reduce((acc,x) => Math.max(acc, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        const p = pushRow('Characters', key, fields);
        renderCharacters();
        p.then(fetchIfIdle);
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this character? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Characters', c.Id, { Hidden: true });
            renderCharacters();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }
  function openMapModal(id){
    const isNew = !id;
    const m = isNew
      ? { Id:'', Name:'', Theme:'', Size:'', Enemies:'', Boss:'', Difficulty:'Run 2', BiomeNotes:'', Hidden:false, SortOrder:0 }
      : mapsState.find(x => x.Id === id);
    if(!m){ alert('Map not found.'); return; }

    const difOpts = MAP_DIFFICULTIES.map(o => `<option value="${o.v}" ${m.Difficulty===o.v?'selected':''}>${escapeHtml(o.label)}</option>`).join('');

    const html = `
      <div class="modal-panel" data-panel style="max-width:640px">
        <h3>${isNew?'Add Map':'Edit Map'}</h3>
        <label>Name<input type="text" data-f="Name" value="${escapeAttr(m.Name)}" placeholder="e.g. NightMarket · 夜市"></label>
        <div class="modal-row">
          <label>Size<input type="text" data-f="Size" value="${escapeAttr(m.Size)}" placeholder="e.g. 250m × 250m"></label>
          <label>Difficulty<select data-f="Difficulty">${difOpts}</select></label>
        </div>
        <label>Theme<textarea data-f="Theme">${escapeHtml(m.Theme)}</textarea></label>
        <label>Enemies<textarea data-f="Enemies">${escapeHtml(m.Enemies)}</textarea></label>
        <label>Boss<input type="text" data-f="Boss" value="${escapeAttr(m.Boss)}"></label>
        <label>Biome / Layout notes<textarea data-f="BiomeNotes">${escapeHtml(m.BiomeNotes)}</textarea></label>
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
        qsa('[data-f]', panel).forEach(el => { fields[el.getAttribute('data-f')] = el.value; });
        if(!fields.Name || !String(fields.Name).trim()){
          alert('Name is required.');
          return;
        }
        const key = isNew ? genId('map') : m.Id;
        if(isNew){
          const maxSo = mapsState.reduce((acc,x) => Math.max(acc, x.SortOrder), 0);
          fields.SortOrder = maxSo + 1000;
          fields.Hidden = false;
        }
        closeModal();
        const p = pushRow('Maps', key, fields);
        renderMaps();
        p.then(fetchIfIdle);
      });
      if(!isNew){
        qs('[data-action="delete"]', panel).addEventListener('click', () => {
          const footer = qs('.modal-footer', panel);
          footer.innerHTML = `
            <div class="modal-confirm-inline">
              Hide this map? Recoverable from the sheet.
              <button class="modal-btn danger" data-action="confirm-delete">Yes, hide</button>
              <button class="modal-btn" data-action="cancel-delete">No</button>
            </div>
          `;
          qs('[data-action="cancel-delete"]', footer).addEventListener('click', closeModal);
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Maps', m.Id, { Hidden: true });
            renderMaps();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }
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
        const p = pushRow('Items', key, fields);
        renderItems();
        p.then(fetchIfIdle);
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
          qs('[data-action="confirm-delete"]', footer).addEventListener('click', () => {
            closeModal();
            const p = pushRow('Items', it.Id, { Hidden: true });
            renderItems();
            p.then(fetchIfIdle);
          });
        });
      }
    });
  }
})();
