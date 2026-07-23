/**
 * Tai va cache anh minh hoa (Openverse API, khong can API key)
 * va audio phat am (dictionaryapi.dev).
 * File cache luu tai %APPDATA%/ielts-vocab/images va /audio.
 */
const path = require('path');
const fs = require('fs');
const db = require('./db');

function cacheDir(sub) {
  const dir = path.join(db.getDataDir(), sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

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

async function downloadFile(url, destPath, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'IELTSVocabCompanion/1.0' }
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return false;
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Tu khoa tim anh: bo phan trong ngoac, lay tu chinh */
function imageQuery(card) {
  let q = card.word.replace(/\(.*?\)/g, '').trim();
  return q;
}

const pendingImages = new Map();

/**
 * Tra ve duong dan local cua anh minh hoa cho the tu vung.
 * Neu chua co cache thi tai tu Openverse. Tra null neu khong tim duoc.
 */
async function getImage(cardId) {
  const card = db.getCard(cardId);
  if (!card) return null;
  if (card.image_path && fs.existsSync(card.image_path)) return card.image_path;
  if (card.image_tried) return null; // da thu va that bai, khong thu lai lien tuc
  if (pendingImages.has(cardId)) return pendingImages.get(cardId);

  const promise = (async () => {
    const q = encodeURIComponent(imageQuery(card));
    const url = `https://api.openverse.org/v1/images/?q=${q}&page_size=3&mature=false&fields=thumbnail,url`;
    const json = await fetchJson(url);
    const results = (json && json.results) || [];
    for (const r of results) {
      const imgUrl = r.thumbnail || r.url;
      if (!imgUrl) continue;
      const dest = path.join(cacheDir('images'), `${cardId}.jpg`);
      if (await downloadFile(imgUrl, dest)) {
        db.setCardMedia(cardId, { image_path: dest, image_tried: 1 });
        return dest;
      }
    }
    db.setCardMedia(cardId, { image_tried: 1 });
    return null;
  })();
  pendingImages.set(cardId, promise);
  promise.finally(() => pendingImages.delete(cardId));
  return promise;
}

const pendingAudio = new Map();

/**
 * Tra ve duong dan local file audio phat am (mp3) tu dictionaryapi.dev.
 * Dong thoi cap nhat IPA neu the chua co. Tra null neu khong co.
 */
async function getAudio(cardId) {
  const card = db.getCard(cardId);
  if (!card) return null;
  if (card.audio_path && fs.existsSync(card.audio_path)) return card.audio_path;
  if (card.audio_tried) return null;
  if (pendingAudio.has(cardId)) return pendingAudio.get(cardId);

  // chi tra cuu tu don / cum ngan (API khong co cum dai)
  const word = card.word.replace(/\(.*?\)/g, '').trim();
  if (word.split(/\s+/).length > 2) {
    db.setCardMedia(cardId, { audio_tried: 1 });
    return null;
  }

  const promise = (async () => {
    const json = await fetchJson(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    const entries = Array.isArray(json) ? json : [];
    for (const entry of entries) {
      for (const ph of entry.phonetics || []) {
        if (ph.audio) {
          const dest = path.join(cacheDir('audio'), `${cardId}.mp3`);
          if (await downloadFile(ph.audio, dest)) {
            db.setCardMedia(cardId, { audio_path: dest, audio_tried: 1 });
            return dest;
          }
        }
      }
    }
    db.setCardMedia(cardId, { audio_tried: 1 });
    return null;
  })();
  pendingAudio.set(cardId, promise);
  promise.finally(() => pendingAudio.delete(cardId));
  return promise;
}

module.exports = { getImage, getAudio };
