// Reference copy of the Google Apps Script backing the Task Board.
// Deployed from the Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
// This file is NOT loaded by the site — it's a mirror so the script is version-controlled.
// To change behavior: edit in Apps Script editor (Extensions → Apps Script on the sheet),
// then Deploy → Manage deployments → New version → Deploy. Update this file to match.

const TASKS_SHEET  = 'Tasks';
const TEAM_SHEET   = 'Team';
const CONFIG_SHEET = 'Config'; // private — NEVER returned in GET

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Only tasks/team are exposed. Config is intentionally omitted.
  return jsonOut({
    ok: true,
    tasks: readTab(ss.getSheetByName(TASKS_SHEET)),
    team:  readTab(ss.getSheetByName(TEAM_SHEET)),
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
  // Compares submitted password against Config tab row where Key === 'password'.
  // Returns only { ok: true, unlocked: <bool> } — password itself never leaves the server.
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
  const keyColName = body.Tab === TEAM_SHEET ? 'MemberId' : 'TaskId';
  const keyCol = headers.indexOf(keyColName);
  if (keyCol < 0) return jsonOut({ ok: false, error: 'Missing key column: ' + keyColName });

  const now = new Date().toISOString();
  const updatedBy = body.UpdatedBy || '';
  const fields = body.Fields || {};

  // find existing row
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][keyCol] === body.Key) { rowIdx = i + 1; break; }
  }

  if (rowIdx === -1) {
    // append new row
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
    // update only provided fields, always stamp UpdatedAt/UpdatedBy
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
    const tasks = ss.getSheetByName(TASKS_SHEET);
    const team  = ss.getSheetByName(TEAM_SHEET);
    if (!tasks || !team) return jsonOut({ ok: false, error: 'Tabs Tasks/Team must exist' });

    const tasksHasData = tasks.getLastRow() > 1;
    const teamHasData  = team.getLastRow()  > 1;
    if (tasksHasData || teamHasData) {
      return jsonOut({ ok: true, seeded: false });
    }

    writeRows(tasks, body.Tasks || []);
    writeRows(team,  body.Team  || []);
    return jsonOut({ ok: true, seeded: true });
  } finally {
    lock.releaseLock();
  }
}

function writeRows(sheet, rows) {
  if (!rows.length) return;
  const headers = sheet.getDataRange().getValues()[0];
  const matrix = rows.map(r => headers.map(h => (r[h] != null ? r[h] : '')));
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
