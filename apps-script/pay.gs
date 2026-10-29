/**
 * ช่องทางรับเงินของแต่ละคน (QR / เลขบัญชี) สำหรับหน้าค่าใช้จ่าย
 * วางไฟล์นี้ไว้ในโปรเจกต์ Apps Script เดียวกับ plan.gs (ใช้ SHEET_ID และ PIN ร่วมกัน)
 * ข้อมูลเก็บในแท็บ "บัญชีรับเงิน" แถวละหนึ่งคน
 */
const PAY_TAB = "บัญชีรับเงิน";
const PAY_COLS = ["ชื่อ", "ธนาคาร", "เลขบัญชี", "ชื่อบัญชี", "พร้อมเพย์", "QR", "อัปเดตล่าสุด"];
const QR_MAX = 45000;   // หนึ่งช่องในชีตเก็บข้อความได้ไม่เกิน 50,000 ตัวอักษร

function findPaySheet(ss) {
  let sh = ss.getSheetByName(PAY_TAB);
  if (!sh) {
    sh = ss.insertSheet(PAY_TAB);
    sh.getRange(1, 1, 1, PAY_COLS.length).setValues([PAY_COLS]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function getPay() {
  const sh = findPaySheet(SpreadsheetApp.openById(SHEET_ID));
  const rows = sh.getDataRange().getDisplayValues();
  const people = {};
  rows.slice(1).forEach(function (r) {
    const name = String(r[0] || "").trim();
    if (!name) return;
    people[name] = { bank: r[1], account: r[2], accName: r[3], promptpay: r[4], qr: r[5], updated: r[6] };
  });
  return { ok: true, people: people };
}

function savePay(req) {
  const name = clean(req.name, 60);
  if (!name) throw new Error("ไม่มีชื่อ");
  const qr = String(req.qr || "");
  if (qr && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(qr) || qr.length > QR_MAX))
    throw new Error("รูป QR ไม่ถูกต้องหรือใหญ่เกินไป");
  const row = [name, clean(req.bank, 60), clean(req.account, 40), clean(req.accName, 100), clean(req.promptpay, 40), qr,
               Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm")];

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = findPaySheet(SpreadsheetApp.openById(SHEET_ID));
    const names = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
    const at = names.indexOf(name, 1);
    const range = sh.getRange(at > 0 ? at + 1 : sh.getLastRow() + 1, 1, 1, row.length);
    range.setNumberFormat("@");   // เก็บเลขบัญชีเป็นข้อความ ไม่ให้เลข 0 ด้านหน้าหาย
    range.setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
