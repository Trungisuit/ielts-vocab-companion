/**
 * Enrich tu vung: dictionaryapi.dev (POS/IPA/def/syn/audio)
 * + MyMemory (VN) + Openverse (anh) + CEFR heuristic.
 * Dung cho POST /api/v1/vocab — giong "server lam giau du lieu" trong banking API.
 */
const path = require('path');
const fs = require('fs');
const db = require('./db');
const media = require('./media');

const BANKING_GLOSSARY = {
  competencies: { vn: 'năng lực / kỹ năng chuyên môn', topic: 'work_business', cefr: 'B2' },
  liquidity: { vn: 'tính thanh khoản', topic: 'money_economy', cefr: 'C1' },
  collateral: { vn: 'tài sản thế chấp', topic: 'money_economy', cefr: 'C1' },
  compliance: { vn: 'tuân thủ quy định', topic: 'government_politics', cefr: 'C1' },
  settlement: { vn: 'thanh toán / quyết toán', topic: 'money_economy', cefr: 'B2' },
  reconciliation: { vn: 'đối soát', topic: 'money_economy', cefr: 'C1' },
  kyc: { vn: 'xác minh khách hàng (Know Your Customer)', topic: 'money_economy', cefr: 'B2' },
  interest: { vn: 'lãi suất / lãi', topic: 'money_economy', cefr: 'B1' },
  portfolio: { vn: 'danh mục đầu tư', topic: 'money_economy', cefr: 'B2' },
  underwriting: { vn: 'thẩm định / bảo lãnh phát hành', topic: 'money_economy', cefr: 'C1' },
  default: { vn: 'vỡ nợ / không trả được nợ', topic: 'money_economy', cefr: 'B2' },
  exposure: { vn: 'mức độ rủi ro tín dụng', topic: 'money_economy', cefr: 'C1' },
  leverage: { vn: 'đòn bẩy tài chính', topic: 'money_economy', cefr: 'C1' },
  audit: { vn: 'kiểm toán', topic: 'work_business', cefr: 'B2' },
  transaction: { vn: 'giao dịch', topic: 'money_economy', cefr: 'B1' },
  beneficiary: { vn: 'người thụ hưởng', topic: 'money_economy', cefr: 'B2' },
  remittance: { vn: 'chuyển tiền / kiều hối', topic: 'money_economy', cefr: 'B2' },
  overdraft: { vn: 'thấu chi', topic: 'money_economy', cefr: 'B2' },
  amortisation: { vn: 'khấu hao / trả góp gốc', topic: 'money_economy', cefr: 'C1' },
  amortization: { vn: 'khấu hao / trả góp gốc', topic: 'money_economy', cefr: 'C1' }
};

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'IELTSVocabCompanion/1.0' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function guessCefr(word, pos) {
  const w = word.toLowerCase();
  if (BANKING_GLOSSARY[w]?.cefr) return BANKING_GLOSSARY[w].cefr;
  if (w.length <= 4) return 'A2';
  if (w.length <= 6) return 'B1';
  if (w.length <= 9) return 'B2';
  if (pos === 'noun' || pos === 'verb') return 'B2';
  return 'C1';
}

async function translateVi(text) {
  if (!text) return '';
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text.slice(0, 400)) +
    '&langpair=en|vi';
  const json = await fetchJson(url, 6000);
  const out = json?.responseData?.translatedText || '';
  // MyMemory đôi khi trả về chính câu EN khi lỗi quota
  if (!out || out.toLowerCase() === text.toLowerCase()) return '';
  return out;
}

async function lookupDictionary(word) {
  const json = await fetchJson(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  );
  if (!Array.isArray(json) || !json.length) return null;
  const entry = json[0];
  let pos = '';
  let def = '';
  let example = '';
  const synonyms = new Set();
  for (const m of entry.meanings || []) {
    if (!pos) pos = m.partOfSpeech || '';
    for (const d of m.definitions || []) {
      if (!def && d.definition) def = d.definition;
      if (!example && d.example) example = d.example;
      (d.synonyms || []).forEach((s) => synonyms.add(s));
    }
    (m.synonyms || []).forEach((s) => synonyms.add(s));
    if (def && example) break;
  }
  let ipa = '';
  let audioUrl = null;
  for (const ph of entry.phonetics || []) {
    if (!ipa && ph.text) ipa = ph.text;
    if (!audioUrl && ph.audio) audioUrl = ph.audio;
  }
  return {
    pos,
    def,
    example,
    ipa,
    audioUrl,
    synonyms: [...synonyms].slice(0, 6)
  };
}

/**
 * Lam giau 1 tu → object san sang de addCard.
 * opts: { word, topic?, vn?, cefr?, skipImage? }
 * Neu tu khong co trong dictionary (va khong nam glossary banking) → 400 WORD_NOT_FOUND.
 */
async function enrichWord(opts) {
  const raw = String(opts.word || '').trim();
  if (!raw) {
    const err = new Error('Field "word" is required');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  // chi cho phep chu cai / khoang / gach / apostrophe (tranh spam)
  if (!/^[a-zA-Z][a-zA-Z\s\-']{0,79}$/.test(raw)) {
    const err = new Error('Field "word" must be an English word or short phrase (letters only)');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const word = raw.replace(/\s+/g, ' ');
  const key = word.toLowerCase();
  const gloss = BANKING_GLOSSARY[key] || {};

  // Lookup: full phrase truoc, roi head word (cho cum ngan)
  let dict = await lookupDictionary(key);
  if (!dict && key.includes(' ')) {
    dict = await lookupDictionary(key.split(/\s+/)[0]);
  }

  // Sai chinh ta / tu khong ton tai: khong tao the fake
  if (!dict && !gloss.vn) {
    const err = new Error(
      `Word "${word}" was not found in the English dictionary. Check spelling (e.g. "inspire", not "inspirez").`
    );
    err.status = 400;
    err.code = 'WORD_NOT_FOUND';
    err.hint = 'Fix the spelling and POST again. Banking analogy: invalid input rejected at validation / KYC check.';
    throw err;
  }

  let vn = opts.vn || gloss.vn || '';
  let def = dict?.def || '';
  let example = dict?.example || '';
  let exampleVn = '';
  let pos = dict?.pos || '';
  let ipa = dict?.ipa || '';
  let synonyms = dict?.synonyms || [];
  const topic = opts.topic || gloss.topic || 'custom';
  const cefr = opts.cefr || gloss.cefr || guessCefr(key, pos);

  if (!vn && def) vn = await translateVi(def.split('.')[0]);
  if (!vn) vn = await translateVi(word);
  if (example) exampleVn = await translateVi(example);

  if (!example) {
    example = `Understanding ${word} is useful in academic and professional contexts.`;
    exampleVn = exampleVn || (vn ? `Hiểu về ${vn} hữu ích trong ngữ cảnh học thuật và nghề nghiệp.` : '');
  }

  const collocations = [];
  if (gloss.vn) {
    collocations.push(`core ${key}`, `develop ${key}`);
  }

  return {
    word,
    pos: pos || 'noun',
    ipa,
    cefr,
    vn: vn || '(chưa có nghĩa Việt — hãy PATCH để bổ sung)',
    def: def || `A term related to ${word}.`,
    example,
    example_vn: exampleVn,
    collocations: collocations.slice(0, 4),
    synonyms,
    topic,
    function: '',
    _audioUrl: dict?.audioUrl || null
  };
}

/**
 * Enrich + luu DB + tai anh/audio. Tra ve card day du.
 * Thu tu: validate tu dien (400) → check trung (409) → save.
 */
async function enrichAndSave(opts) {
  // 1) Enrich/validate TRUOC — sai chinh ta → 400, khong bi 409 do lan POST cu
  const enriched = await enrichWord(opts);

  // 2) Trung tu hop le → 409
  const existing = db.findCardByWord(enriched.word);
  if (existing) {
    const err = new Error(`Word already exists (id=${existing.id})`);
    err.status = 409;
    err.code = 'CONFLICT';
    err.existing = existing;
    throw err;
  }

  const { _audioUrl, ...data } = enriched;
  const id = db.addCard(data);

  // media async best-effort
  try {
    await media.getImage(id);
  } catch {}
  if (_audioUrl) {
    try {
      const dest = path.join(db.getDataDir(), 'audio', `${id}.mp3`);
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(_audioUrl, { signal: ctrl.signal });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 100) {
            fs.writeFileSync(dest, buf);
            db.setCardMedia(id, { audio_path: dest, audio_tried: 1 });
          }
        }
      } finally {
        clearTimeout(t);
      }
    } catch {}
  }

  const card = db.getCard(id);
  return {
    ...card,
    image_url: card.image_path ? `/api/v1/vocab/${id}/image` : null,
    audio_url: card.audio_path ? `/api/v1/vocab/${id}/audio` : null,
    banking_analogy: 'POST tạo resource mới — giống mở tài khoản / tạo hồ sơ KYC rồi hệ thống enrich dữ liệu.'
  };
}

module.exports = { enrichWord, enrichAndSave, BANKING_GLOSSARY };
