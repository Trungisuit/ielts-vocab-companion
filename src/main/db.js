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
  startDate: null, // ngay bat dau hoc, tu dong set lan dau mo app
  currentBand: 0, // band IELTS hien tai (0 - 7.0) -> bo qua tu duoi trinh do
  targetBand: 7, // band muc tieu -> khong mo khoa tu vuot trinh do
  includeC2: true // giu toan bo bo tu (gom ca C2); tat di neu chi muon hoc den targetBand
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
  ensureColumn('cards', 'function', "TEXT DEFAULT ''");
  seedIfEmpty();
  syncNewSeeds(); // nap them the moi tu seed vao DB da ton tai (khong xoa tien do)
  syncWritingFunctions(); // gan nhan chuc nang Writing cho the phrase
  dedupeCards(); // xoa the trung tu (chi xoa ban 'new', giu ban co tien do)
  resetMediaTriedOnce(); // cho thu tai lai anh/audio tung that bai (co the do offline)
  // set ngay bat dau hoc lan dau tien
  if (!getSetting('startDate')) {
    setSetting('startDate', todayStr());
  }
  return db;
}

function ensureColumn(table, column, typeDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
  }
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---------- Seed ---------- */

const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/* ---------- Band IELTS <-> CEFR ---------- */
// A1 ~ band 0-2.5 · A2 ~ 3.0-3.5 · B1 ~ 4.0-5.0 · B2 ~ 5.5-6.5 · C1 ~ 7.0-8.0 · C2 ~ 8.5+

/** Chi so CEFR (0=A1 .. 4=C1) ung voi mot band IELTS */
function bandToCefrIndex(band) {
  const b = Number(band) || 0;
  if (b < 3) return 0;
  if (b < 4) return 1;
  if (b < 5.5) return 2;
  if (b < 7) return 3;
  return 4;
}

/** Khoang CEFR duoc phep mo khoa theo cai dat band hien tai / muc tieu */
function cefrRange(settings) {
  const max = settings.includeC2 ? 5 : bandToCefrIndex(settings.targetBand ?? 7);
  const min = Math.min(bandToCefrIndex(settings.currentBand ?? 0), max);
  return { min, max };
}

/**
 * Dieu kien SQL chon the 'new' trong khoang band.
 * The tu tao (custom) va the khong co CEFR chuan luon duoc phep.
 */
function bandFilterSql(settings, { ignoreMin = false } = {}) {
  const { min, max } = cefrRange(settings);
  const allowed = CEFR_LEVELS.slice(ignoreMin ? 0 : min, max + 1);
  const all = CEFR_LEVELS.map((l) => `'${l}'`).join(',');
  const list = allowed.map((l) => `'${l}'`).join(',');
  return `(custom = 1 OR cefr NOT IN (${all}) OR cefr IN (${list}))`;
}

// Thu tu mo khoa: tu cua toi truoc, roi de -> kho theo CEFR, roi thu tu seed
const NEW_CARD_ORDER = `
  ORDER BY custom DESC,
    CASE cefr WHEN 'A1' THEN 0 WHEN 'A2' THEN 1 WHEN 'B1' THEN 2
      WHEN 'B2' THEN 3 WHEN 'C1' THEN 4 WHEN 'C2' THEN 5 ELSE 3 END,
    sort_order ASC`;

/** Chon toi da n id the 'new' theo lo trinh band */
function pickNewCardIds(n, settings, opts) {
  if (n <= 0) return [];
  return db.prepare(`
    SELECT id FROM cards WHERE state = 'new' AND ${bandFilterSql(settings, opts)}
    ${NEW_CARD_ORDER} LIMIT ?
  `).all(n).map((r) => r.id);
}

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM cards').get();
  if (row.n > 0) return;
  const seedDir = path.join(__dirname, '..', '..', 'data', 'seed');
  if (!fs.existsSync(seedDir)) return;
  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  const insert = db.prepare(`
    INSERT INTO cards (word, pos, ipa, cefr, vn, def, example, example_vn,
      collocations, synonyms, topic, sort_order, function)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let entries = [];
  const seen = new Set(); // cung 1 tu co the nam o nhieu file chu de -> chi nap 1 lan
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
      if (!data.cards || !data.cards.length) continue; // bo qua writing_frames.json
      const topic = data.topic || f.replace('.json', '');
      for (const e of data.cards || []) {
        const key = (e.w || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push({
          ...e,
          topic,
          fn: e.fn || inferFunction(e.w || '', topic)
        });
      }
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
        e.topic, i, e.fn || ''
      );
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`Seeded ${entries.length} cards`);
}

/**
 * Nap them the moi tu file seed vao DB da ton tai (vd bo cum tu moi bo sung),
 * KHONG dung neu DB dang rong (seedIfEmpty lo phan do) va KHONG xoa/ghi de the cu.
 * The moi them vao cuoi (state='new') nen se duoc mo khoa dan, giu nguyen tien do.
 */
function syncNewSeeds() {
  const seedDir = path.join(__dirname, '..', '..', 'data', 'seed');
  if (!fs.existsSync(seedDir)) return;
  const count = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  if (count === 0) return; // DB rong -> seedIfEmpty da xu ly
  const existing = new Set(
    db.prepare('SELECT LOWER(TRIM(word)) AS w FROM cards').all().map((r) => r.w)
  );
  let order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM cards').get().m;
  const insert = db.prepare(`
    INSERT INTO cards (word, pos, ipa, cefr, vn, def, example, example_vn,
      collocations, synonyms, topic, sort_order, function)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json'));
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const f of files) {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
      } catch (err) {
        console.error('Seed file error', f, err.message);
        continue;
      }
      if (!data.cards || !data.cards.length) continue;
      const topic = data.topic || f.replace('.json', '');
      for (const e of data.cards || []) {
        const w = (e.w || '').toLowerCase().trim();
        if (!w || existing.has(w)) continue;
        order += 1;
        const fn = e.fn || inferFunction(e.w || '', topic);
        insert.run(
          e.w || '', e.pos || '', e.ipa || '', e.cefr || '',
          e.vn || '', e.def || '', e.ex || '', e.exVn || '',
          JSON.stringify(e.coll || []), JSON.stringify(e.syn || []),
          topic, order, fn
        );
        existing.add(w);
        added += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('syncNewSeeds error', err.message);
    return;
  }
  if (added) console.log(`Synced ${added} new cards from seed`);
}

const WRITING_TOPICS = new Set(['writing_phrases', 'common_phrases', 'writing_task1']);

/** Gan nhan chuc nang Writing (opinion/cause/contrast/solution/conclusion/task1) */
function inferFunction(word, topic) {
  if (topic === 'writing_task1') return 'task1';
  if (!WRITING_TOPICS.has(topic) && topic !== 'writing_phrases' && topic !== 'common_phrases') {
    return '';
  }
  const w = (word || '').toLowerCase();
  if (/increase|decline|rise|fall|peak|fluctuat|stable|proportion|figure|overall|respectively|account for|make up|just under|just over|level off|halve|double|surpass|trend|stand at|narrow|widen|minority|majority|approximately|from \.\.\. to|twice as|three times|second highest|by far|similar pattern|experience growth|witness|plateau|it is clear/.test(w)) {
    return 'task1';
  }
  if (/in conclusion|to sum up|in the long run|on the whole|by and large|in a nutshell|last but not least|overall/.test(w)) {
    return 'conclusion';
  }
  if (/on the one hand|on the other hand|in contrast|by contrast|whereas|nevertheless|despite|albeit|at the expense|conversely|in spite/.test(w)) {
    return 'contrast';
  }
  if (/result in|stem from|as a result|owing to|consequently|contribute to|give rise|pose a threat|exacerbate|hinder|undermine|on the grounds/.test(w)) {
    return 'cause';
  }
  if (/take measures|address the issue|viable solution|deal with|cut down|give priority|strike a balance|implement|curb|mitigate|facilitate|foster|advocate|with a view|in order to|play a crucial|pave the way/.test(w)) {
    return 'solution';
  }
  if (/believed|point of view|as far as|no doubt|no denying|goes without saying|furthermore|in terms of|when it comes|it could be argued|first and foremost|for instance|in other words|put simply|double-edged|case in point|bear in mind|to a certain/.test(w)) {
    return 'opinion';
  }
  // mac dinh cho writing topics
  if (WRITING_TOPICS.has(topic)) return 'opinion';
  return '';
}

/**
 * Cap nhat cot function cho the Writing (tu seed fn + suy luan),
 * khong ghi de neu da co function dung.
 */
function syncWritingFunctions() {
  const seedDir = path.join(__dirname, '..', '..', 'data', 'seed');
  const fnByWord = new Map();
  if (fs.existsSync(seedDir)) {
    for (const f of fs.readdirSync(seedDir).filter((x) => x.endsWith('.json'))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8'));
        const topic = data.topic || f.replace('.json', '');
        for (const e of data.cards || []) {
          const key = (e.w || '').toLowerCase().trim();
          if (!key) continue;
          fnByWord.set(key, e.fn || inferFunction(e.w, topic));
        }
      } catch {}
    }
  }
  const rows = db.prepare(`
    SELECT id, word, topic, function FROM cards
    WHERE topic IN ('writing_phrases','common_phrases','writing_task1')
       OR function IS NULL OR function = ''
  `).all();
  const upd = db.prepare('UPDATE cards SET function = ? WHERE id = ?');
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const key = (r.word || '').toLowerCase().trim();
      let fn = fnByWord.get(key) || r.function || inferFunction(r.word, r.topic);
      if (!fn && WRITING_TOPICS.has(r.topic)) fn = 'opinion';
      if (fn && fn !== r.function) {
        upd.run(fn, r.id);
        n += 1;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('syncWritingFunctions error', err.message);
    return;
  }
  if (n) console.log(`Updated function tags on ${n} cards`);
}

/**
 * Xoa the trung tu (khong phan biet hoa/thuong): CHI xoa ban dang o trang thai 'new'
 * va khong co lich su review, de khong bao gio mat tien do hoc.
 */
function dedupeCards() {
  const dups = db.prepare(`
    SELECT LOWER(TRIM(word)) AS w FROM cards GROUP BY w HAVING COUNT(*) > 1
  `).all();
  if (!dups.length) return;
  const rowsByWord = db.prepare(`
    SELECT id, state, reps, custom,
      (SELECT COUNT(*) FROM reviews WHERE card_id = cards.id) AS rev_cnt
    FROM cards WHERE LOWER(TRIM(word)) = ?
    ORDER BY (state != 'new') DESC, rev_cnt DESC, custom DESC, id ASC
  `);
  const del = db.prepare('DELETE FROM cards WHERE id = ?');
  let removed = 0;
  db.exec('BEGIN');
  try {
    for (const { w } of dups) {
      if (!w) continue;
      const rows = rowsByWord.all(w);
      // giu ban dau tien (uu tien ban da hoc / co review), xoa cac ban thua con 'new'
      for (const r of rows.slice(1)) {
        if (r.state === 'new' && r.rev_cnt === 0) {
          del.run(r.id);
          removed += 1;
        }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('dedupeCards error', err.message);
  }
  if (removed) console.log(`Removed ${removed} duplicate new cards`);
}

/**
 * Mot lan duy nhat: reset image_tried/audio_tried cho cac the chua co file
 * (truoc day khi offline van bi danh dau tried=1 vinh vien).
 */
function resetMediaTriedOnce() {
  if (getSetting('mediaTriedResetV1')) return;
  db.exec(`
    UPDATE cards SET image_tried = 0 WHERE image_path IS NULL AND image_tried = 1;
    UPDATE cards SET audio_tried = 0 WHERE audio_path IS NULL AND audio_tried = 1;
  `);
  setSetting('mediaTriedResetV1', true);
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
  return unlockCardIds(pickNewCardIds(remain, settings));
}

function unlockCardIds(ids) {
  if (!ids.length) return 0;
  const now = Date.now();
  const upd = db.prepare(
    "UPDATE cards SET state = 'learning', due_at = ?, introduced_at = ? WHERE id = ?"
  );
  for (const id of ids) upd.run(now, now, id);
  return ids.length;
}

/**
 * Mo khoa THEM tu moi ngay lap tuc, BO QUA gioi han newPerDay
 * (dung khi nguoi dung chu dong bam "Hoc them tu moi" hoac khi mo app
 *  ma khong con the den han). Tra ve so the vua mo khoa.
 */
function introduceMoreCards(n = 10) {
  const settings = getAllSettings();
  let ids = pickNewCardIds(n, settings);
  // neu da het tu tu currentBand..targetBand thi lay not cac tu de hon con sot
  if (ids.length < n) {
    const more = pickNewCardIds(n - ids.length, settings, { ignoreMin: true })
      .filter((id) => !ids.includes(id));
    ids = [...ids, ...more];
  }
  return unlockCardIds(ids);
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
  // introduced_at: neu the duoc cham diem khi con 'new' (vd Paraphrase, API review)
  // thi ghi nhan moc mo khoa de thong ke / bieu do tich luy khong bo sot
  db.prepare(`
    UPDATE cards SET state = ?, ease = ?, interval_days = ?, reps = ?, lapses = ?, due_at = ?,
      introduced_at = COALESCE(introduced_at, ?)
    WHERE id = ?
  `).run(state, ease, interval_days, reps, lapses, due_at, Date.now(), id);
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

function listCards({ topic = null, cefr = null, search = '', state = null, starred = false, limit = 100, offset = 0 } = {}) {
  const conds = [];
  const params = [];
  if (topic) { conds.push('topic = ?'); params.push(topic); }
  if (cefr) { conds.push('cefr = ?'); params.push(cefr); }
  if (state) { conds.push('state = ?'); params.push(state); }
  if (starred) { conds.push('starred = 1'); }
  if (search) {
    conds.push('(word LIKE ? OR vn LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT * FROM cards ${where}
    ORDER BY CASE cefr WHEN 'A1' THEN 0 WHEN 'A2' THEN 1 WHEN 'B1' THEN 2
      WHEN 'B2' THEN 3 WHEN 'C1' THEN 4 WHEN 'C2' THEN 5 ELSE 3 END,
      sort_order ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
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
      collocations, synonyms, topic, custom, sort_order, function)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    data.word || '', data.pos || '', data.ipa || '', data.cefr || 'B2',
    data.vn || '', data.def || '', data.example || '', data.example_vn || '',
    JSON.stringify(data.collocations || []), JSON.stringify(data.synonyms || []),
    data.topic || 'custom', maxOrder + 1, data.function || ''
  );
  return Number(res.lastInsertRowid);
}

function findCardByWord(word) {
  if (!word) return null;
  const row = db.prepare(
    'SELECT * FROM cards WHERE LOWER(TRIM(word)) = LOWER(TRIM(?)) LIMIT 1'
  ).get(word);
  return parseCard(row);
}

function updateCard(id, data) {
  db.prepare(`
    UPDATE cards SET word = ?, pos = ?, ipa = ?, cefr = ?, vn = ?, def = ?,
      example = ?, example_vn = ?, collocations = ?, synonyms = ?, topic = ?,
      function = COALESCE(?, function)
    WHERE id = ?
  `).run(
    data.word || '', data.pos || '', data.ipa || '', data.cefr || 'B2',
    data.vn || '', data.def || '', data.example || '', data.example_vn || '',
    JSON.stringify(data.collocations || []), JSON.stringify(data.synonyms || []),
    data.topic || 'custom', data.function ?? null, id
  );
}

function deleteCard(id) {
  // don file anh/audio da cache cua the
  const row = db.prepare('SELECT image_path, audio_path FROM cards WHERE id = ?').get(id);
  for (const p of [row?.image_path, row?.audio_path]) {
    if (!p) continue;
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
  }
  db.prepare('DELETE FROM cards WHERE id = ?').run(id);
  db.prepare('DELETE FROM reviews WHERE card_id = ?').run(id);
}

function toggleStar(id) {
  db.prepare('UPDATE cards SET starred = 1 - starred WHERE id = ?').run(id);
}

/** Lay n nghia tieng Viet nhieu (lam dap an sai cho trac nghiem) */
function getDistractors(cardId, n = 3) {
  // loai nghia trung voi dap an dung va trung lap giua cac dap an sai
  return db.prepare(`
    SELECT vn FROM (
      SELECT DISTINCT vn FROM cards
      WHERE id != ? AND vn != ''
        AND LOWER(TRIM(vn)) != LOWER(TRIM(COALESCE((SELECT vn FROM cards WHERE id = ?), '')))
    ) ORDER BY RANDOM() LIMIT ?
  `).all(cardId, cardId, n).map((r) => r.vn);
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

function getMediaCounts() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  const images = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE image_path IS NOT NULL AND image_path != ''").get().n;
  const audio = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE audio_path IS NOT NULL AND audio_path != ''").get().n;
  return { total, images, audio };
}

function getCardsMissingMediaIds() {
  return db.prepare(`
    SELECT id FROM cards
    WHERE (image_path IS NULL AND image_tried = 0)
       OR (audio_path IS NULL AND audio_tried = 0)
    ORDER BY (state != 'new') DESC, sort_order ASC
  `).all().map((r) => r.id);
}

/** Xuat toan bo snapshot DB (cards + reviews + settings + writing frames) de dong goi APK hoac backup */
function exportSnapshot() {
  const cards = db.prepare('SELECT * FROM cards ORDER BY id ASC').all().map(parseCard);
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY id ASC').all();
  const settings = getAllSettings();
  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed', 'writing_frames.json');
  let frames = [];
  if (fs.existsSync(seedPath)) {
    try {
      frames = JSON.parse(fs.readFileSync(seedPath, 'utf8')).frames || [];
    } catch {}
  }
  return {
    exportedAt: Date.now(),
    version: '1.1.0',
    settings,
    cards,
    reviews,
    frames
  };
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

  // thong ke theo CEFR / band + so the con phai hoc trong pham vi muc tieu
  const byCefr = db.prepare(`
    SELECT cefr, COUNT(*) AS total,
      SUM(CASE WHEN state != 'new' THEN 1 ELSE 0 END) AS learned,
      SUM(CASE WHEN state = 'review' AND interval_days >= 21 THEN 1 ELSE 0 END) AS mastered
    FROM cards GROUP BY cefr
  `).all();
  const settings = getAllSettings();
  const targetRemaining = db.prepare(
    `SELECT COUNT(*) AS n FROM cards WHERE state = 'new' AND ${bandFilterSql(settings)}`
  ).get().n;

  return {
    total, learned, mastered, due, reviewedToday, newToday,
    streak, daily, weekly, byCefr, targetRemaining
  };
}

/* ---------- Writing Lab ---------- */

const WRITING_TOPIC_LIST = ['writing_phrases', 'common_phrases', 'writing_task1'];

function listWritingCards({ function: fn = null, limit = 40, dueOnly = false } = {}) {
  const now = Date.now();
  const conds = [`topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')})`];
  const params = [...WRITING_TOPIC_LIST];
  if (fn) {
    conds.push('function = ?');
    params.push(fn);
  }
  if (dueOnly) {
    conds.push("state != 'new' AND due_at IS NOT NULL AND due_at <= ?");
    params.push(now);
  }
  const where = 'WHERE ' + conds.join(' AND ');
  // uu tien the den han, roi learning, roi new
  const rows = db.prepare(`
    SELECT * FROM cards ${where}
    ORDER BY
      CASE
        WHEN state != 'new' AND due_at IS NOT NULL AND due_at <= ${now} THEN 0
        WHEN state = 'learning' THEN 1
        WHEN state = 'new' THEN 2
        ELSE 3
      END,
      CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,
      due_at ASC,
      sort_order ASC
    LIMIT ?
  `).all(...params, limit);
  return rows.map(parseCard);
}

/** Mo khoa them the Writing (bo qua gioi han ngay), uu tien theo function */
function introduceWritingCards(n = 10, fn = null) {
  const now = Date.now();
  const conds = [`topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')})`, "state = 'new'"];
  const params = [...WRITING_TOPIC_LIST];
  if (fn) {
    conds.push('function = ?');
    params.push(fn);
  }
  params.push(n);
  const rows = db.prepare(`
    SELECT id FROM cards WHERE ${conds.join(' AND ')} ORDER BY sort_order ASC LIMIT ?
  `).all(...params);
  const upd = db.prepare(
    "UPDATE cards SET state = 'learning', due_at = ?, introduced_at = ? WHERE id = ?"
  );
  for (const r of rows) upd.run(now, now, r.id);
  return rows.length;
}

function getWritingFrames({ function: fn = null, limit = 30 } = {}) {
  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed', 'writing_frames.json');
  if (!fs.existsSync(seedPath)) return [];
  let frames = [];
  try {
    const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    frames = data.frames || [];
  } catch {
    return [];
  }
  if (fn) frames = frames.filter((f) => f.function === fn);
  // shuffle nhe
  for (let i = frames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [frames[i], frames[j]] = [frames[j], frames[i]];
  }
  return frames.slice(0, limit);
}

function getParaphraseBank(limit = 25) {
  const rows = db.prepare(`
    SELECT * FROM cards
    WHERE topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')})
      AND example != '' AND synonyms != '[]'
    ORDER BY RANDOM() LIMIT ?
  `).all(...WRITING_TOPIC_LIST, limit);
  return rows.map((r) => {
    const card = parseCard(r);
    return {
      id: card.id,
      word: card.word,
      vn: card.vn,
      original: card.example,
      originalVn: card.example_vn,
      targetPhrase: card.word,
      synonyms: card.synonyms || [],
      function: card.function || inferFunction(card.word, card.topic)
    };
  });
}

function getWritingStats() {
  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM cards WHERE topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')})
  `).get(...WRITING_TOPIC_LIST).n;
  const learned = db.prepare(`
    SELECT COUNT(*) AS n FROM cards
    WHERE topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')}) AND state != 'new'
  `).get(...WRITING_TOPIC_LIST).n;
  const byFn = db.prepare(`
    SELECT function AS fn, COUNT(*) AS total,
      SUM(CASE WHEN state != 'new' THEN 1 ELSE 0 END) AS started
    FROM cards
    WHERE topic IN (${WRITING_TOPIC_LIST.map(() => '?').join(',')})
    GROUP BY function
  `).all(...WRITING_TOPIC_LIST);
  return { total, learned, byFn };
}

module.exports = {
  init, todayStr,
  getSetting, getAllSettings, setSetting, setSettings,
  getCard, getDueCards, countDue, introduceNewCards, introduceMoreCards, ensureReviewAvailable,
  updateCardSrs, addReview, postponeCard,
  listCards, listTopics, addCard, updateCard, deleteCard, toggleStar, getDistractors,
  findCardByWord,
  setCardMedia, getMediaCounts, getCardsMissingMediaIds, exportSnapshot, getStats, getDataDir,
  listWritingCards, introduceWritingCards, getWritingFrames, getParaphraseBank, getWritingStats
};
