// Amigo Hand Off Data: bound to the Google Sheet "Amigo Hand Off Data".
// Deployed as a web app (execute as me, access: Anyone).
// GET  ?k=KEY            -> {ok, values:{key:{v,t,by}}}
// POST text/plain JSON {k, by, items:[{key,value}]} -> {ok, saved}
var KEY = '65_3msr2FMBSXzrQ';
var SHEET = 'data';

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['key', 'value', 'updated_at', 'updated_by']);
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
    sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 420);
  }
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readAll_(sh) {
  var rows = sh.getDataRange().getValues();
  var values = {}, index = {};
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0]);
    if (!k) continue;
    var t = rows[i][2];
    values[k] = { v: String(rows[i][1]), t: t instanceof Date ? t.toISOString() : String(t || ''), by: String(rows[i][3] || '') };
    index[k] = i + 1;
  }
  return { values: values, index: index };
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.k !== KEY) return out_({ ok: false, error: 'key' });
  return out_({ ok: true, values: readAll_(sheet_()).values });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'json' }); }
  if (d.k !== KEY) return out_({ ok: false, error: 'key' });
  var items = d.items || [];
  var by = String(d.by || '').slice(0, 60);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var idx = readAll_(sh).index;
    var now = new Date();
    var append = [];
    items.forEach(function (it) {
      var key = String(it.key || '').slice(0, 200);
      if (!key) return;
      var val = String(it.value == null ? '' : it.value).slice(0, 20000);
      var row = [key, val, now, by];
      if (idx[key] > 0) sh.getRange(idx[key], 1, 1, 4).setValues([row]);
      else if (idx[key] < 0) append[-idx[key] - 1] = row;
      else { append.push(row); idx[key] = -append.length; }
    });
    if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, 4).setValues(append);
    return out_({ ok: true, saved: items.length, t: now.toISOString() });
  } finally {
    lock.releaseLock();
  }
}
