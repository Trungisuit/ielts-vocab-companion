/**
 * Lop du lieu SQLite dung node:sqlite (co san trong Node cua Electron,
 * khong can native module ngoai — an toan khi dong goi portable .exe).
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let db = null;

const DEFAULT_SETTINGS = {
  newPerDay: 10,
  popupIntervalMin: 25,
  popupAutoHideSec: 20,
  snoozeMin: 30,
  quietStart: '22:00',
  quietEnd: '08:00',
  dnd: false,
  examDate: null, // 'YYYY-MM-DD'
  startDate: null // ngay bat dau hoc, tu dong set lan dau mo app
};

function getDataDir() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function init() {
  const dbPath = path.join(getDataDir(), 'vocab.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      pos TEXT DEFAULT '',
      ipa TEXT DEFAULT '',
      cefr TEXT DEFAULT '',
      vn TEXT DEFAULT '',
      def TEXT DEFAULT '',
      example TEXT DEFAULT '',
      example_vn TEXT DEFAULT '',
      collocations TEXT DEFAULT '[]',
      synonyms TEXT DEFAULT '[]',
      topic TEXT DEFAULT '',
      image_path TEXT DEFAULT NULL,
      image_tried INTEGER DEFAULT 0,
      audio_path TEXT DEFAULT NULL,
      audio_tried INTEGER DEFAULT 0,
      custom INTEGER DEFAULT 0,
      starred INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      state TEXT DEFAULT 'new',
      ease REAL DEFAULT 2.5,
      interval_days REAL DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      due_at INTEGER DEFAULT NULL,
      introduced_at INTEGER DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      reviewed_at INTEGER NOT NULL,
      interval_days REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(state, due_at);
    CREATE INDEX IF NOT EXISTS idx_cards_topic ON cards(topic);
    CREATE INDEX IF NOT EXISTS idx_reviews_time ON reviews(reviewed_at);
  `);
  seedIfEmpty();
  // set ngay bat dau hoc lan dau tien
  if (!getSetting('startDate')) {
    setSetting('startDate', todayStr());
  }
  return db;
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---------- Seed ---------- */

const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM cards').get();
  if (row.n > 0) return;
  const seedDir = path.join(__dirname, '..', '..', 'data', 'seed');
  if (!fs.existsSync(seedDir)) return;
  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  const insert = db.prepare(`
    INSERT INTO cards (word, pos, ipa, cefr, vn, def, example, example_vn,
      collocations, synonyms, topic, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let entries = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
      const topic = data.topic || f.replace('.json', '');
      for (const e of data.cards || []) entries.push({ ...e, topic });
    } catch (err) {
      console.error('Seed file error', f, err.message);
    }
  }
  // sap xep: CEFR de truoc kho sau, de lo trinh hoc tu can ban len
  entries.sort((a, b) => {
    const ca = CEFR_ORDER[a.cefr] ?? 3;
    const cb = CEFR_ORDER[b.cefr] ?? 3;
    if (ca !== cb) return ca - cb;
    return (a.w || '').localeCompare(b.w || '');
  });
  db.exec('BEGIN');
  try {
    entries.forEach((e, i) => {
      insert.run(
        e.w || '', e.pos || '', e.ipa || '', e.cefr || '',
        e.vn || '', e.def || '', e.ex || '', e.exVn || '',
        JSON.stringify(e.coll || []), JSON.stringify(e.syn || []),
        e.topic, i
      );
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`Seeded ${entries.length} cards`);
}

/* ---------- Settings ---------- */

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return DEFAULT_SETTINGS[key] ?? null;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function getAllSettings() {
  const out = { ...DEFAULT_SETTINGS };
  const rows = db.prepare('SELECT key, value FROM settings').all();
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) setSetting(k, v);
}

/* ---------- Cards ---------- */

function parseCard(row) {
  if (!row) return null;
  return {
    ...row,
    collocations: JSON.parse(row.collocations || '[]'),
    synonyms: JSON.parse(row.synonyms || '[]')
  };
}

function getCard(id) {
  return parseCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
}

function getDueCards(limit = 50) {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT * FROM cards
    WHERE state != 'new' AND due_at IS NOT NULL AND due_at <= ?
    ORDER BY due_at ASC LIMIT ?
  `).all(now, limit);
  return rows.map(parseCard);
}

function countDue() {
  const now = Date.now();
  return db.prepare(`
    SELECT COUNT(*) AS n FROM cards
    WHERE state != 'new' AND due_at IS NOT NULL AND due_at <= ?
  `).get(now).n;
}

/** Mo khoa tu moi cho hom nay (goi moi lan tick scheduler / mo app) */
function introduceNewCards() {
  const settings = getAllSettings();
  const today = todayStr();
  const startOfDay = new Date(today + 'T00:00:00').getTime();
  const introducedToday = db.prepare(
    'SELECT COUNT(*) AS n FROM cards WHERE introduced_at >= ?'
  ).get(startOfDay).n;
  const remain = Math.max(0, settings.newPerDay - introducedToday);
  if (remain === 0) return 0;
  const now = Date.now();
  const rows = db.prepare(
    "SELECT id FROM cards WHERE state = 'new' ORDER BY sort_order ASC LIMIT ?"
  ).all(remain);
  const upd = db.prepare(
    "UPDATE cards SET state = 'learning', due_at = ?, introduced_at = ? WHERE id = ?"
  );
  for (const r of rows) upd.run(now, now, r.id);
  return rows.length;
}

/**
 * Mo khoa THEM tu moi ngay lap tuc, BO QUA gioi han newPerDay
 * (dung khi nguoi dung chu dong bam "Hoc them tu moi" hoac khi mo app
 *  ma khong con the den han). Tra ve so the vua mo khoa.
 */
function introduceMoreCards(n = 10) {
  const now = Date.now();
  const rows = db.prepare(
    "SELECT id FROM cards WHERE state = 'new' ORDER BY sort_order ASC LIMIT ?"
  ).all(n);
  const upd = db.prepare(
    "UPDATE cards SET state = 'learning', due_at = ?, introduced_at = ? WHERE id = ?"
  );
  for (const r of rows) upd.run(now, now, r.id);
  return rows.length;
}

/**
 * Dam bao luon co the de on khi mo app:
 * - Mo khoa batch tu moi trong ngay (theo newPerDay) nhu binh thuong.
 * - Neu van khong co the nao den han (da het batch hom nay) thi mo khoa
 *   them 1 batch nua de nguoi dung khong bao gio bi "het thE". 
 * Tra ve so the dang den han sau khi xu ly.
 */
function ensureReviewAvailable() {
  introduceNewCards();
  if (countDue() > 0) return countDue();
  const settings = getAllSettings();
  introduceMoreCards(settings.newPerDay || 10);
  return countDue();
}

function updateCardSrs(id, { state, ease, interval_days, reps, lapses, due_at }) {
  db.prepare(`
    UPDATE cards SET state = ?, ease = ?, interval_days = ?, reps = ?, lapses = ?, due_at = ?
    WHERE id = ?
  `).run(state, ease, interval_days, reps, lapses, due_at, id);
}

function addReview(cardId, rating, intervalDays) {
  db.prepare(
    'INSERT INTO reviews (card_id, rating, reviewed_at, interval_days) VALUES (?, ?, ?, ?)'
  ).run(cardId, rating, Date.now(), intervalDays);
}

function postponeCard(id, minutes) {
  db.prepare('UPDATE cards SET due_at = ? WHERE id = ?')
    .run(Date.now() + minutes * 60000, id);
}

function listCards({ topic = null, search = '', state = null, starred = false, limit = 100, offset = 0 } = {}) {
  const conds = [];
  const params = [];
  if (topic) { conds.push('topic = ?'); params.push(topic); }
  if (state) { conds.push('state = ?'); params.push(state); }
  if (starred) { conds.push('starred = 1'); }
  if (search) {
    conds.push('(word LIKE ? OR vn LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = db.prepare(
    `SELECT * FROM cards ${where} ORDER BY sort_order ASC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cards ${where}`).get(...params).n;
  return { cards: rows.map(parseCard), total };
}

function listTopics() {
  return db.prepare(`
    SELECT topic, COUNT(*) AS total,
      SUM(CASE WHEN state != 'new' THEN 1 ELSE 0 END) AS started,
      SUM(CASE WHEN state = 'review' AND interval_days >= 21 THEN 1 ELSE 0 END) AS mastered
    FROM cards GROUP BY topic ORDER BY topic
  `).all();
}

function addCard(data) {
  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM cards').get().m || 0;
  const res = db.prepare(`
    INSERT INTO cards (word, pos, ipa, cefr, vn, def, example, example_vn,
      collocations, synonyms, topic, custom, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    data.word || '', data.pos || '', data.ipa || '', data.cefr || 'B2',
    data.vn || '', data.def || '', data.example || '', data.example_vn || '',
    JSON.stringify(data.collocations || []), JSON.stringify(data.synonyms || []),
    data.topic || 'custom', maxOrder + 1
  );
  return Number(res.lastInsertRowid);
}

function updateCard(id, data) {
  db.prepare(`
    UPDATE cards SET word = ?, pos = ?, ipa = ?, cefr = ?, vn = ?, def = ?,
      example = ?, example_vn = ?, collocations = ?, synonyms = ?, topic = ?
    WHERE id = ?
  `).run(
    data.word || '', data.pos || '', data.ipa || '', data.cefr || 'B2',
    data.vn || '', data.def || '', data.example || '', data.example_vn || '',
    JSON.stringify(data.collocations || []), JSON.stringify(data.synonyms || []),
    data.topic || 'custom', id
  );
}

function deleteCard(id) {
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  db.prepare('DELETE FROM reviews WHERE card_id = ?').run(id);
}

function toggleStar(id) {
  db.prepare('UPDATE cards SET starred = 1 - starred WHERE id = ?').run(id);
}

/** Lay n nghia tieng Viet nhieu (lam dap an sai cho trac nghiem) */
function getDistractors(cardId, n = 3) {
  return db.prepare(`
    SELECT vn FROM cards WHERE id != ? AND vn != '' ORDER BY RANDOM() LIMIT ?
  `).all(cardId, n).map((r) => r.vn);
}

function setCardMedia(id, { image_path, image_tried, audio_path, audio_tried }) {
  if (image_path !== undefined || image_tried !== undefined) {
    db.prepare('UPDATE cards SET image_path = COALESCE(?, image_path), image_tried = COALESCE(?, image_tried) WHERE id = ?')
      .run(image_path ?? null, image_tried ?? null, id);
  }
  if (audio_path !== undefined || audio_tried !== undefined) {
    db.prepare('UPDATE cards SET audio_path = COALESCE(?, audio_path), audio_tried = COALESCE(?, audio_tried) WHERE id = ?')
      .run(audio_path ?? null, audio_tried ?? null, id);
  }
}

/* ---------- Stats / Dashboard ---------- */

function getStats() {
  const now = Date.now();
  const total = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  const learned = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE state != 'new'").get().n;
  const mastered = db.prepare(
    "SELECT COUNT(*) AS n FROM cards WHERE state = 'review' AND interval_days >= 21"
  ).get().n;
  const due = countDue();
  const startOfDay = new Date(todayStr() + 'T00:00:00').getTime();
  const reviewedToday = db.prepare(
    'SELECT COUNT(DISTINCT card_id) AS n FROM reviews WHERE reviewed_at >= ?'
  ).get(startOfDay).n;
  const newToday = db.prepare(
    'SELECT COUNT(*) AS n FROM cards WHERE introduced_at >= ?'
  ).get(startOfDay).n;

  // streak: so ngay lien tiep co it nhat 1 review
  const days = db.prepare(`
    SELECT DISTINCT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS d
    FROM reviews ORDER BY d DESC
  `).all().map((r) => r.d);
  let streak = 0;
  const dayMs = 86400000;
  let cursor = todayStr();
  if (days.length && days[0] !== cursor) {
    // hom nay chua hoc — streak tinh tu hom qua
    cursor = todayStr(new Date(Date.now() - dayMs));
  }
  for (const d of days) {
    if (d === cursor) {
      streak += 1;
      cursor = todayStr(new Date(new Date(cursor + 'T00:00:00').getTime() - dayMs));
    } else if (d < cursor) {
      break;
    }
  }

  // hoat dong 26 tuan gan nhat (bieu do): so review moi ngay 30 ngay
  const daily = db.prepare(`
    SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS n
    FROM reviews WHERE reviewed_at >= ?
    GROUP BY d ORDER BY d
  `).all(now - 30 * dayMs);

  // luy ke tu da hoc theo tuan (de ve duong tien do 6 thang)
  const weekly = db.prepare(`
    SELECT date(introduced_at / 1000, 'unixepoch', 'localtime') AS d, COUNT(*) AS n
    FROM cards WHERE introduced_at IS NOT NULL
    GROUP BY d ORDER BY d
  `).all();

  return { total, learned, mastered, due, reviewedToday, newToday, streak, daily, weekly };
}

module.exports = {
  init, todayStr,
  getSetting, getAllSettings, setSetting, setSettings,
  getCard, getDueCards, countDue, introduceNewCards, introduceMoreCards, ensureReviewAvailable,
  updateCardSrs, addReview, postponeCard,
  listCards, listTopics, addCard, updateCard, deleteCard, toggleStar, getDistractors,
  setCardMedia, getStats, getDataDir
};
