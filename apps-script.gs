// Reference copy of the Google Apps Script backing the Task Board.
// Deployed from the Google Sheet:
//   https://docs.google.com/spreadsheets/d/1Od7n8hbOO24SIJiyGR7ctfYTkkLdUXLVf06KiUCY0hQ/edit
// This file is NOT loaded by the site — it's a mirror so the script is version-controlled.
// To change behavior: edit in Apps Script editor (Extensions → Apps Script on the sheet),
// then Deploy → Manage deployments → New version → Deploy. Update this file to match.

const SHEET_NAME = 'Tasks';

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = headers.indexOf('TaskId');
    const statusCol = headers.indexOf('Status');
    const notesCol = headers.indexOf('Notes');
    const assigneeCol = headers.indexOf('Assignee');
    const updatedAtCol = headers.indexOf('UpdatedAt');
    const updatedByCol = headers.indexOf('UpdatedBy');

    // find existing row
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idCol] === body.TaskId) { rowIdx = i + 1; break; }
    }

    const now = new Date().toISOString();
    if (rowIdx === -1) {
      // append new row
      const newRow = headers.map(h => {
        if (h === 'TaskId') return body.TaskId || '';
        if (h === 'Status') return body.Status || 'todo';
        if (h === 'Notes') return body.Notes || '';
        if (h === 'Assignee') return body.Assignee || '';
        if (h === 'UpdatedAt') return now;
        if (h === 'UpdatedBy') return body.UpdatedBy || '';
        return '';
      });
      sheet.appendRow(newRow);
    } else {
      // update in place — only fields present in body
      if (body.Status !== undefined)   sheet.getRange(rowIdx, statusCol + 1).setValue(body.Status);
      if (body.Notes !== undefined)    sheet.getRange(rowIdx, notesCol + 1).setValue(body.Notes);
      if (body.Assignee !== undefined) sheet.getRange(rowIdx, assigneeCol + 1).setValue(body.Assignee);
      sheet.getRange(rowIdx, updatedAtCol + 1).setValue(now);
      if (body.UpdatedBy !== undefined) sheet.getRange(rowIdx, updatedByCol + 1).setValue(body.UpdatedBy);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
