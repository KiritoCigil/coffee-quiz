/**
 * Приёмник ответов квиза → Google Таблица.
 * Вставить в таблицу: Расширения → Apps Script → заменить код → Сохранить → Развернуть (см. инструкцию).
 *
 * Одна строка = один человек (по id). Сначала приходят ответы (action=answers),
 * затем, если человек оставил номер, та же строка дополняется контактом (action=contact).
 */

const SHEET_NAME = 'Ответы';

// Порядок колонок в таблице. Ключ → заголовок.
const COLUMNS = [
  ['created_at',   'Дата'],
  ['id',           'ID'],
  ['status',       'Статус'],
  ['lang',         'Язык'],
  ['age',          'Возраст'],
  ['occupation',   'Занятость'],
  ['frequency',    'Частота кофе'],
  ['where',        'Где берёт'],
  ['price',        'Цена капучино'],
  ['order',        'Как заказывать'],
  ['name',         'Название'],
  ['custom_name',  'Своё название'],
  ['palette',      'Палитра'],
  ['custom_colors','Свои цвета'],
  ['mascot',       'Маскот'],
  ['first_name',   'Имя'],
  ['phone',        'Телефон'],
  ['consent',      'Согласие'],
  ['name_order',   'Порядок названий (показ)'],
  ['seconds',      'Время, сек'],
  ['device',       'Устройство'],
  ['utm_source',   'utm_source'],
  ['utm_medium',   'utm_medium'],
  ['utm_campaign', 'utm_campaign'],
  ['utm_content',  'utm_content'],
  ['utm_term',     'utm_term'],
  ['fbclid',       'fbclid'],
  ['updated_at',   'Обновлено']
];
const KEYS = COLUMNS.map(c => c[0]);
const CLIENT_KEYS = KEYS.filter(k => !['created_at', 'updated_at', 'status'].includes(k));
const MAX_LEN = 200;

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, error: 'empty' });
    if (e.postData.contents.length > 10000) return json_({ ok: false, error: 'too_large' });

    let data;
    try { data = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'bad_json' }); }

    const action = data.action;
    if (action !== 'answers' && action !== 'contact') return json_({ ok: false, error: 'bad_action' });
    if (typeof data.id !== 'string' || !/^[A-Za-z0-9-]{8,48}$/.test(data.id)) return json_({ ok: false, error: 'bad_id' });

    if (action === 'contact') {
      const phone = String(data.phone || '');
      if (!/^\+998\d{9}$/.test(phone)) return json_({ ok: false, error: 'bad_phone' });
      if (data.consent !== 'yes') return json_({ ok: false, error: 'no_consent' });
    }

    // Только известные поля, обрезка длины, защита от формул в ячейках.
    const clean = {};
    CLIENT_KEYS.forEach(k => { if (data[k] !== undefined && data[k] !== null) clean[k] = safe_(data[k]); });
    clean.status = action === 'contact' ? 'лид' : 'ответы';

    lock.waitLock(10000);
    const sheet = getSheet_();
    const now = new Date();
    const row = findRow_(sheet, data.id);

    if (row) {
      const range = sheet.getRange(row, 1, 1, KEYS.length);
      const values = range.getValues()[0];
      KEYS.forEach((k, i) => {
        if (clean[k] === undefined || clean[k] === '') return;
        // Статус «лид» не откатываем назад в «ответы».
        if (k === 'status' && values[i] === 'лид') return;
        values[i] = clean[k];
      });
      values[KEYS.indexOf('updated_at')] = now;
      range.setValues([values]);
    } else {
      const values = KEYS.map(k => clean[k] !== undefined ? clean[k] : '');
      values[KEYS.indexOf('created_at')] = now;
      values[KEYS.indexOf('updated_at')] = now;
      sheet.appendRow(values);
    }
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Проверка, что веб-приложение живо: открыть URL …/exec в браузере.
function doGet() {
  return json_({ ok: true, service: 'coffee-quiz' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(c => c[1]));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    // Телефон — текстом, чтобы «+998…» не превратился в число.
    sheet.getRange(1, KEYS.indexOf('phone') + 1, sheet.getMaxRows()).setNumberFormat('@');
  }
  return sheet;
}

function findRow_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const col = KEYS.indexOf('id') + 1;
  const hit = sheet.getRange(2, col, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : null;
}

function safe_(v) {
  let s = String(v).trim().slice(0, MAX_LEN);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // не даём ячейке стать формулой
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Запустить один раз вручную из редактора: создаст лист с заголовками и попросит доступы. */
function setup() {
  getSheet_();
}
