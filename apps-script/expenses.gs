/**
 * ตัวรับข้อมูลจากหน้า expenses.html แล้วเขียนลง Google Sheet
 * วิธีติดตั้ง: ส่วนขยาย → Apps Script → วางโค้ดนี้ทั้งหมด → แก้ PIN ด้านล่าง → ทำให้ใช้งานได้ (Deploy) เป็น "เว็บแอป"
 * ไฟล์ pay.gs (ช่องทางรับเงิน) ต้องอยู่ในโปรเจกต์เดียวกันด้วย
 */

// รหัสที่เพื่อนต้องพิมพ์ก่อนแก้ไขได้ (เปลี่ยนเป็นของกลุ่มเอง)
const PIN = "ใส่รหัสทริปตรงนี้";
// gid ของแท็บค่าใช้จ่าย (ตัวเลขหลัง #gid= ใน URL)
const SHEET_GID = 490426652;
// คอลัมน์ในแท็บค่าใช้จ่าย (A=1, B=2, ...)
const COL = { item: 1, total: 3, note: 5, status: 6, payer: 7, firstCheck: 8 };
const PEOPLE_COUNT = 6;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const req = JSON.parse(e.postData.contents);
    if (String(req.pin) !== PIN) return reply({ ok: false, error: "รหัสไม่ถูกต้อง" });
    if (req.action === "savePay") return reply(savePay(req));   // อยู่ใน pay.gs
    const sh = getSheet();
    const { headerRow, totalRow } = findTable(sh);

    if (req.action === "check") return reply({ ok: true });

    if (req.action === "add") {
      const name = String(req.item || "").trim();
      if (!name) return reply({ ok: false, error: "ไม่มีชื่อรายการ" });
      const row = findEmptyRow(sh, headerRow, totalRow) || insertRow(sh, totalRow);
      sh.getRange(row, COL.item).setValue(name);
      sh.getRange(row, COL.total).setValue(Number(req.total) || 0);
      sh.getRange(row, COL.note).setValue(String(req.note || ""));
      sh.getRange(row, COL.status).setValue(req.status === "จ่ายแล้ว" ? "จ่ายแล้ว" : "ยังไม่จ่าย");
      sh.getRange(row, COL.payer).setValue(String(req.payer || ""));
      const checks = (req.paid || []).slice(0, PEOPLE_COUNT);
      const rowChecks = Array.from({ length: PEOPLE_COUNT }, (_, i) => !!checks[i]);
      sh.getRange(row, COL.firstCheck, 1, PEOPLE_COUNT).setValues([rowChecks]);
      return reply({ ok: true, row });
    }

    if (req.action === "toggle") {
      const row = findItemRow(sh, headerRow, totalRow, req.item);
      if (!row) return reply({ ok: false, error: "ไม่พบรายการ " + req.item });
      const k = Number(req.person);
      if (!(k >= 0 && k < PEOPLE_COUNT)) return reply({ ok: false, error: "ไม่พบคน" });
      sh.getRange(row, COL.firstCheck + k).setValue(!!req.value);
      return reply({ ok: true, row });
    }

    if (req.action === "status") {
      const row = findItemRow(sh, headerRow, totalRow, req.item);
      if (!row) return reply({ ok: false, error: "ไม่พบรายการ " + req.item });
      sh.getRange(row, COL.status).setValue(req.status === "จ่ายแล้ว" ? "จ่ายแล้ว" : "ยังไม่จ่าย");
      if (req.payer !== undefined) sh.getRange(row, COL.payer).setValue(String(req.payer));
      return reply({ ok: true, row });
    }

    return reply({ ok: false, error: "ไม่รู้จักคำสั่ง" });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  const sh = SpreadsheetApp.getActive().getSheets().find(s => s.getSheetId() === SHEET_GID);
  if (!sh) throw new Error("ไม่พบแท็บค่าใช้จ่าย");
  return sh;
}

// หาแถวหัวตาราง ("รายการ") และแถว "รวมทั้งหมด" แรก
function findTable(sh) {
  const col = sh.getRange(1, COL.item, sh.getLastRow(), 1).getValues().map(r => String(r[0]).trim());
  const headerRow = col.indexOf("รายการ") + 1;
  const totalRow = col.indexOf("รวมทั้งหมด", headerRow) + 1;
  if (!headerRow || !totalRow) throw new Error("ไม่พบตารางค่าใช้จ่าย");
  return { headerRow, totalRow };
}

function findEmptyRow(sh, headerRow, totalRow) {
  const n = totalRow - headerRow - 1;
  const names = sh.getRange(headerRow + 1, COL.item, n, 1).getValues();
  const i = names.findIndex(r => String(r[0]).trim() === "");
  return i < 0 ? 0 : headerRow + 1 + i;
}

// แทรกแถวใหม่ไว้เหนือแถวสุดท้ายของตาราง เพื่อให้สูตรรวมนับแถวใหม่ด้วย แล้วคัดลอกรูปแบบ/สูตร
function insertRow(sh, totalRow) {
  const last = totalRow - 1;
  sh.insertRowBefore(last);
  const newRow = last;
  sh.getRange(last + 1, 1, 1, sh.getLastColumn()).copyTo(sh.getRange(newRow, 1, 1, sh.getLastColumn()));
  sh.getRange(newRow, 2).clearContent();
  return newRow;
}

function findItemRow(sh, headerRow, totalRow, item) {
  const target = String(item || "").trim();
  const n = totalRow - headerRow - 1;
  const names = sh.getRange(headerRow + 1, COL.item, n, 1).getValues();
  const i = names.findIndex(r => String(r[0]).trim() === target);
  return i < 0 ? 0 : headerRow + 1 + i;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "pay") return reply(getPay());   // อยู่ใน pay.gs
    const sh = getSheet();
    const { headerRow, totalRow } = findTable(sh);
    const n = totalRow - headerRow - 1;

    // ดึงหัวคอลัมน์ชื่อคน (H, I, J, ...)
    const headerRange = sh.getRange(headerRow, COL.firstCheck, 1, PEOPLE_COUNT);
    const people = headerRange.getValues()[0].map(v => String(v).trim());

    // ดึงรายการทั้งหมด
    const dataRange = sh.getRange(headerRow + 1, 1, n, COL.firstCheck + PEOPLE_COUNT - 1);
    const rows = dataRange.getValues();

    const items = rows
      .filter(r => String(r[COL.item - 1]).trim() !== "")
      .map(r => ({
        item:    String(r[COL.item - 1]).trim(),
        total:   Number(r[COL.total - 1]) || 0,
        note:    String(r[COL.note - 1]).trim(),
        status:  String(r[COL.status - 1]).trim(),
        payer:   String(r[COL.payer - 1]).trim(),
        paid:    Array.from({ length: PEOPLE_COUNT }, (_, i) => !!r[COL.firstCheck - 1 + i])
      }));

    // ดึงข้อมูลบัญชีรับเงิน
    const payData = getPay();

    return reply({ ok: true, people, items, payInfo: payData.people });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}
