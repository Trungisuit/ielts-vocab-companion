/**
 * Scheduler: chay nen, quyet dinh khi nao hien popup nhac on tap.
 * - Mo khoa tu moi moi ngay (theo newPerDay)
 * - Hien popup khi co the den han, ton trong DND / quiet hours / tan suat
 */
const db = require('./db');

let timer = null;
let lastPopupAt = 0;
let snoozeUntil = 0;
let showPopupFn = null;
let updateTrayFn = null;

const TICK_MS = 30000;
const FIRST_POPUP_DELAY_MS = 60000; // sau khi mo app 1 phut moi bat dau chu ky nhac dinh ky
const OPEN_POPUP_DELAY_MS = 6000;   // moi lan mo app -> nhac sau 6 giay
let startedAt = 0;

function isQuietHours(settings) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [qsH, qsM] = (settings.quietStart || '22:00').split(':').map(Number);
  const [qeH, qeM] = (settings.quietEnd || '08:00').split(':').map(Number);
  const qs = qsH * 60 + qsM;
  const qe = qeH * 60 + qeM;
  if (qs === qe) return false;
  if (qs < qe) return cur >= qs && cur < qe;   // vd 12:00 - 13:00
  return cur >= qs || cur < qe;                 // vd 22:00 - 08:00 (qua dem)
}

function tick(force = false) {
  try {
    db.introduceNewCards();
    const settings = db.getAllSettings();
    const due = db.countDue();
    if (updateTrayFn) updateTrayFn(due);

    if (!force) {
      if (settings.dnd) return;
      if (isQuietHours(settings)) return;
      const now = Date.now();
      if (now < snoozeUntil) return;
      if (now - startedAt < FIRST_POPUP_DELAY_MS) return;
      const intervalMs = (settings.popupIntervalMin || 25) * 60000;
      if (now - lastPopupAt < intervalMs) return;
    }
    if (due === 0) return;
    const cards = db.getDueCards(1);
    if (cards.length && showPopupFn) {
      lastPopupAt = Date.now();
      showPopupFn(cards[0]);
    }
  } catch (err) {
    console.error('Scheduler tick error:', err);
  }
}

function start({ showPopup, updateTray }) {
  showPopupFn = showPopup;
  updateTrayFn = updateTray;
  startedAt = Date.now();
  db.introduceNewCards();
  if (updateTrayFn) updateTrayFn(db.countDue());
  timer = setInterval(() => tick(false), TICK_MS);
  reviewOnOpen();
}

/**
 * Nhac ngay khi mo app: sau vai giay hien popup mot the de on.
 * Luon dam bao co the (mo khoa them tu moi neu can) — khong bi gioi han
 * "10 tu/ngay". Ton trong che do Do Not Disturb, bo qua gioi han tan suat.
 */
function reviewOnOpen() {
  setTimeout(() => {
    try {
      const settings = db.getAllSettings();
      if (settings.dnd) return; // dang bat "Khong lam phien" thi thoi
      db.ensureReviewAvailable();
      const cards = db.getDueCards(1);
      if (updateTrayFn) updateTrayFn(db.countDue());
      if (cards.length && showPopupFn) {
        lastPopupAt = Date.now();
        showPopupFn(cards[0]);
      }
    } catch (err) {
      console.error('reviewOnOpen error:', err);
    }
  }, OPEN_POPUP_DELAY_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Nguoi dung bam "On ngay" tu tray */
function forceReview() {
  tick(true);
}

function snooze(minutes) {
  snoozeUntil = Date.now() + minutes * 60000;
}

/** Sau khi popup dong, tinh lai moc thoi gian cho lan nhac tiep theo */
function popupClosed() {
  lastPopupAt = Date.now();
}

module.exports = { start, stop, forceReview, snooze, popupClosed, reviewOnOpen };
