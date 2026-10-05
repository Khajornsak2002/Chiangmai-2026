/**
 * สคริปต์บันทึกกำหนดการจากหน้าเว็บ ลงแท็บ "แพลนเว็บ"
 * เป็นสคริปต์แยกจากของหน้าค่าใช้จ่าย ไม่กระทบของเดิม
 *
 * ก่อนบันทึกทุกครั้ง จะสำรองข้อมูลเดิมไว้ในแท็บ "แพลนเว็บ_สำรอง"
 */
const SHEET_ID = "1g6TUgi-lsjH7V-GZ_DfPVEWCNYqz2OyLvq09_fQpO-4";
const TAB = "แพลนเว็บ";
const BACKUP_TAB = "แพลนเว็บ_สำรอง";
const PIN = "ใส่รหัสทริปตรงนี้";   // ← ใช้รหัสเดียวกับหน้าค่าใช้จ่าย จะได้ไม่ต้องใส่ใหม่
const TYPES = ["สถานที่", "เดินทาง", "กิน", "ที่พัก", "กิจกรรม"];
const COLS = ["วัน", "เวลา", "กิจกรรม", "ประเภท", "ค้นหาในแผนที่", "หัวข้อวัน"];

function doGet() {
  return out({ ok: true, msg: "plan api พร้อมใช้งาน" });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (String(req.pin || "") !== PIN) return out({ ok: false, error: "รหัสไม่ถูกต้อง" });
    if (req.action === "savePlan") return out(savePlan(req.days));
    return out({ ok: false, error: "ไม่รู้จักคำสั่ง" });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function savePlan(days) {
  if (!Array.isArray(days) || !days.length || days.length > 14) throw new Error("ข้อมูลวันไม่ถูกต้อง");
  const rows = [];
  days.forEach(function (d, i) {
    const items = (d && Array.isArray(d.items)) ? d.items : [];
    if (!items.length) throw new Error("วันที่ " + (i + 1) + " ไม่มีรายการ");
    if (items.length > 60) throw new Error("วันที่ " + (i + 1) + " มีรายการมากเกินไป");
    items.forEach(function (it, j) {
      const text = clean(it.text, 200);
      if (!text) throw new Error("วันที่ " + (i + 1) + " มีรายการที่ไม่มีชื่อ");
      const type = TYPES.indexOf(it.type) >= 0 ? it.type : "กิจกรรม";
      rows.push({ "วัน": i + 1, "เวลา": clean(it.time, 40), "กิจกรรม": text, "ประเภท": type,
                  "ค้นหาในแผนที่": clean(it.map, 200), "หัวข้อวัน": j === 0 ? clean(d.title, 150) : "" });
    });
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(TAB);
    if (!sh) throw new Error("ไม่พบแท็บ " + TAB);

    // สำรองข้อมูลเดิมก่อน
    const backup = ss.getSheetByName(BACKUP_TAB) || ss.insertSheet(BACKUP_TAB);
    backup.clearContents();
    const old = sh.getDataRange().getDisplayValues();
    if (old.length && old[0].length) backup.getRange(1, 1, old.length, old[0].length).setValues(old);

    // หัวตาราง: ใช้ลำดับคอลัมน์เดิม เพิ่มคอลัมน์ที่ขาด
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
    while (head.length && !head[head.length - 1]) head.pop();
    COLS.forEach(function (c) { if (head.indexOf(c) < 0) head.push(c); });
    sh.getRange(1, 1, 1, head.length).setValues([head]);

    // ล้างข้อมูลเดิมแล้วเขียนใหม่
    const lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, Math.max(head.length, sh.getLastColumn())).clearContent();
    const values = rows.map(function (r) { return head.map(function (h) { return r.hasOwnProperty(h) ? r[h] : ""; }); });
    const range = sh.getRange(2, 1, values.length, head.length);
    range.setNumberFormat("@");   // เก็บเป็นข้อความ ไม่ให้ Google แปลงเวลาเอง
    range.setValues(values);
    SpreadsheetApp.flush();
    return { ok: true, rows: values.length };
  } finally {
    lock.releaseLock();
  }
}
