/**
 * Script doc lap (chay bang node hoac ELECTRON_RUN_AS_NODE=1 electron.exe)
 * de ket xuat du lieu moi nhat tu DB tren PC (%APPDATA%\IELTS Vocab\vocab.db)
 * hoac tu data/seed/*.json + copy toan bo anh/audio offline sang src/renderer/public/mobile-bundle/
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'data', 'seed');
const BUNDLE_DIR = path.join(ROOT, 'src', 'renderer', 'public', 'mobile-bundle');
const RELEASE_DIR = path.join(ROOT, 'release');

const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

function getPcAppDataDir() {
  const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'IELTS Vocab');
}

function copyDirFiles(srcDir, destDir, extFilter) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const name of fs.readdirSync(srcDir)) {
    if (extFilter && !name.toLowerCase().endsWith(extFilter)) continue;
    try {
      fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
      count += 1;
    } catch {}
  }
  return count;
}

function loadSeedsFromDisk() {
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
  const seen = new Set();
  const entries = [];
  let frames = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
      if (Array.isArray(data.frames) && data.frames.length) {
        frames = data.frames;
      }
      if (!Array.isArray(data.cards) || !data.cards.length) continue;
      const topic = data.topic || f.replace('.json', '');
      for (const e of data.cards) {
        const key = (e.w || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push({ ...e, topic });
      }
    } catch (err) {
      console.error('Seed read error:', f, err.message);
    }
  }
  entries.sort((a, b) => {
    const ca = CEFR_ORDER[a.cefr] ?? 3;
    const cb = CEFR_ORDER[b.cefr] ?? 3;
    if (ca !== cb) return ca - cb;
    return (a.w || '').localeCompare(b.w || '');
  });
  return { entries, frames };
}

function main() {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  const pcDir = getPcAppDataDir();
  const dbPath = path.join(pcDir, 'vocab.db');
  const { entries: seedEntries, frames } = loadSeedsFromDisk();

  let cards = [];
  let reviews = [];
  let settings = {};

  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath);
    const dbCards = db.prepare('SELECT * FROM cards ORDER BY id ASC').all().map((r) => ({
      ...r,
      collocations: JSON.parse(r.collocations || '[]'),
      synonyms: JSON.parse(r.synonyms || '[]')
    }));
    const existingWords = new Set(dbCards.map((c) => (c.word || '').toLowerCase().trim()));
    let maxId = dbCards.reduce((m, c) => Math.max(m, c.id || 0), 0);
    let maxOrder = dbCards.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);

    // Bo sung cac the seed moi chua co trong DB cua PC
    for (const e of seedEntries) {
      const key = (e.w || '').toLowerCase().trim();
      if (!key || existingWords.has(key)) continue;
      existingWords.add(key);
      maxId += 1;
      maxOrder += 1;
      dbCards.push({
        id: maxId,
        word: e.w || '',
        pos: e.pos || '',
        ipa: e.ipa || '',
        cefr: e.cefr || 'B1',
        vn: e.vn || '',
        def: e.def || '',
        example: e.ex || '',
        example_vn: e.exVn || '',
        collocations: e.coll || [],
        synonyms: e.syn || [],
        topic: e.topic,
        image_path: null,
        image_tried: 0,
        audio_path: null,
        audio_tried: 0,
        custom: 0,
        starred: 0,
        sort_order: maxOrder,
        state: 'new',
        ease: 2.5,
        interval_days: 0,
        reps: 0,
        lapses: 0,
        due_at: null,
        introduced_at: null,
        function: e.fn || ''
      });
    }

    cards = dbCards;
    reviews = db.prepare('SELECT * FROM reviews ORDER BY id ASC').all();
    for (const r of db.prepare('SELECT key, value FROM settings').all()) {
      try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
    }
    db.close();
  } else {
    cards = seedEntries.map((e, idx) => ({
      id: idx + 1,
      word: e.w || '',
      pos: e.pos || '',
      ipa: e.ipa || '',
      cefr: e.cefr || 'B1',
      vn: e.vn || '',
      def: e.def || '',
      example: e.ex || '',
      example_vn: e.exVn || '',
      collocations: e.coll || [],
      synonyms: e.syn || [],
      topic: e.topic,
      custom: 0,
      starred: 0,
      sort_order: idx,
      state: 'new',
      ease: 2.5,
      interval_days: 0,
      reps: 0,
      lapses: 0,
      due_at: null,
      introduced_at: null,
      function: e.fn || ''
    }));
  }

  const imgDest = path.join(BUNDLE_DIR, 'images');
  const audDest = path.join(BUNDLE_DIR, 'audio');
  const imgCount = copyDirFiles(path.join(pcDir, 'images'), imgDest, '.jpg');
  const audCount = copyDirFiles(path.join(pcDir, 'audio'), audDest, '.mp3');

  const imgSet = new Set(
    fs.existsSync(imgDest) ? fs.readdirSync(imgDest).map((f) => Number(path.parse(f).name)) : []
  );
  const audSet = new Set(
    fs.existsSync(audDest) ? fs.readdirSync(audDest).map((f) => Number(path.parse(f).name)) : []
  );

  cards = cards.map((c) => ({
    ...c,
    bundled_image: imgSet.has(c.id) ? `./mobile-bundle/images/${c.id}.jpg` : null,
    bundled_audio: audSet.has(c.id) ? `./mobile-bundle/audio/${c.id}.mp3` : null
  }));

  const snapshot = {
    exportedAt: Date.now(),
    version: '1.1.0',
    settings,
    cards,
    reviews,
    frames
  };

  const snapPath = path.join(BUNDLE_DIR, 'snapshot.json');
  fs.writeFileSync(snapPath, JSON.stringify(snapshot), 'utf8');
  const backupPath = path.join(RELEASE_DIR, 'ielts-vocab-latest-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(snapshot), 'utf8');

  console.log(`[BUNDLE] Exported ${cards.length} cards, ${imgCount} images, ${audCount} audio files.`);
}

main();

