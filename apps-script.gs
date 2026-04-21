// Reference copy of the Google Apps Script backing the Task Board + Design Doc.
// Deployed from the Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
// This file is NOT loaded by the site — it's a mirror so the script is version-controlled.
// To change behavior: edit in Apps Script editor (Extensions → Apps Script on the sheet),
// then Deploy → Manage deployments → New version → Deploy. Update this file to match.

const TASKS_SHEET        = 'Tasks';
const TEAM_SHEET         = 'Team';
const CHARACTERS_SHEET   = 'Characters';
const ITEMS_SHEET        = 'Items';
const MAPS_SHEET         = 'Maps';
const SYSTEMS_SHEET      = 'Systems';
const GANTT_TRACKS_SHEET = 'GanttTracks';
const GANTT_BARS_SHEET   = 'GanttBars';
const MILESTONES_SHEET   = 'Milestones';
const CONFIG_SHEET       = 'Config'; // private — NEVER returned in GET

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonOut({
    ok: true,
    tasks:        readTab(ss.getSheetByName(TASKS_SHEET)),
    team:         readTab(ss.getSheetByName(TEAM_SHEET)),
    characters:   readTab(ss.getSheetByName(CHARACTERS_SHEET)),
    items:        readTab(ss.getSheetByName(ITEMS_SHEET)),
    maps:         readTab(ss.getSheetByName(MAPS_SHEET)),
    systems:      readTab(ss.getSheetByName(SYSTEMS_SHEET)),
    ganttTracks:  readTab(ss.getSheetByName(GANTT_TRACKS_SHEET)),
    ganttBars:    readTab(ss.getSheetByName(GANTT_BARS_SHEET)),
    milestones:   readTab(ss.getSheetByName(MILESTONES_SHEET)),
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.Action === 'bootstrap') return handleBootstrap(body);
    if (body.Action === 'unlock')    return handleUnlock(body);
    return handleUpsert(body);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function handleUnlock(body) {
  const submitted = (body && body.Password != null) ? String(body.Password) : '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) return jsonOut({ ok: false, error: 'Config tab missing' });
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonOut({ ok: false, error: 'Config empty' });
  const headers = data[0];
  const keyCol = headers.indexOf('Key');
  const valCol = headers.indexOf('Value');
  if (keyCol < 0 || valCol < 0) return jsonOut({ ok: false, error: 'Config headers must be Key|Value' });
  let expected = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]) === 'password') { expected = String(data[i][valCol]); break; }
  }
  if (expected == null) return jsonOut({ ok: false, error: 'password row missing in Config' });
  return jsonOut({ ok: true, unlocked: submitted === expected });
}

function handleUpsert(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.Tab);
  if (!sheet) return jsonOut({ ok: false, error: 'Unknown tab: ' + body.Tab });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  // First column is always the primary key by convention.
  const keyColName = headers[0];
  const keyCol = 0;

  const now = new Date().toISOString();
  const updatedBy = body.UpdatedBy || '';
  const fields = body.Fields || {};

  // find existing row
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyCol] === body.Key) { rowIdx = i + 1; break; }
  }

  if (rowIdx === -1) {
    const row = headers.map(h => {
      if (h === keyColName) return body.Key;
      if (h === 'CreatedAt') return now;
      if (h === 'UpdatedAt') return now;
      if (h === 'UpdatedBy') return updatedBy;
      if (h === 'Status' && fields[h] == null) return 'todo';
      if (h === 'Hidden' && fields[h] == null) return false;
      if (h === 'Active' && fields[h] == null) return true;
      if (fields[h] != null) return fields[h];
      return '';
    });
    sheet.appendRow(row);
  } else {
    headers.forEach((h, i) => {
      if (h === 'UpdatedAt') { sheet.getRange(rowIdx, i + 1).setValue(now); return; }
      if (h === 'UpdatedBy') { sheet.getRange(rowIdx, i + 1).setValue(updatedBy); return; }
      if (fields[h] !== undefined) sheet.getRange(rowIdx, i + 1).setValue(fields[h]);
    });
  }

  return jsonOut({ ok: true });
}

function handleBootstrap(body) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) {
    return jsonOut({ ok: false, error: 'Could not acquire lock' });
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Generic shape: { Action: "bootstrap", Tabs: { <TabName>: [rows], ... } }
    // Legacy shape (one release of compat): top-level Tasks/Team/Characters/...
    let tabs = body.Tabs;
    if (!tabs) {
      tabs = {};
      ['Tasks', 'Team', 'Characters', 'Items', 'Maps', 'Systems'].forEach(name => {
        if (body[name]) tabs[name] = body[name];
      });
    }

    const now = new Date().toISOString();
    const updatedBy = body.UpdatedBy || 'bootstrap';
    const seeded = {};

    Object.keys(tabs).forEach(name => {
      const rows = tabs[name];
      if (!rows || !rows.length) return;
      const sheet = ss.getSheetByName(name);
      if (!sheet) return;
      if (sheet.getLastRow() > 1) { seeded[name] = false; return; }
      writeRows(sheet, rows, now, updatedBy);
      seeded[name] = true;
    });
    return jsonOut({ ok: true, seeded });
  } finally {
    lock.releaseLock();
  }
}

function writeRows(sheet, rows, now, updatedBy) {
  if (!rows.length) return;
  const headers = sheet.getDataRange().getValues()[0];
  const matrix = rows.map(r => headers.map(h => {
    if (h === 'CreatedAt' || h === 'UpdatedAt') return r[h] != null ? r[h] : (now || new Date().toISOString());
    if (h === 'UpdatedBy')                     return r[h] != null ? r[h] : (updatedBy || 'bootstrap');
    return r[h] != null ? r[h] : '';
  }));
  sheet.getRange(sheet.getLastRow() + 1, 1, matrix.length, headers.length).setValues(matrix);
}

function readTab(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
