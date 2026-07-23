/**
 * Thuat toan spaced repetition kieu SM-2 (giong Anki don gian hoa).
 * Rating: 1 = Again (quen), 2 = Hard (kho), 3 = Good (nho), 4 = Easy (de)
 */
const db = require('./db');

const DAY_MS = 86400000;
const MIN_EASE = 1.3;

/**
 * Tinh trang thai moi cua the sau khi cham diem.
 * Tra ve interval (ngay) de hien thi cho nguoi dung.
 */
function rate(cardId, rating) {
  const card = db.getCard(cardId);
  if (!card) return null;

  let { state, ease, interval_days: interval, reps, lapses } = card;
  ease = ease || 2.5;

  if (rating === 1) {
    // Quen: hoc lai sau 10 phut, giam ease
    if (state === 'review') lapses += 1;
    reps = 0;
    state = 'learning';
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 10 / (60 * 24); // 10 phut tinh theo ngay
  } else if (reps === 0 || state === 'learning') {
    // Lan dau tra loi dung (hoac dang hoc lai)
    state = 'review';
    reps += 1;
    if (rating === 2) interval = 0.5;      // 12 tieng
    else if (rating === 3) interval = 1;   // 1 ngay
    else interval = 4;                     // Easy: 4 ngay
    if (rating === 2) ease = Math.max(MIN_EASE, ease - 0.15);
    if (rating === 4) ease += 0.15;
  } else {
    // The dang review
    reps += 1;
    if (rating === 2) {
      interval = Math.max(interval * 1.2, interval + 0.5);
      ease = Math.max(MIN_EASE, ease - 0.15);
    } else if (rating === 3) {
      interval = interval * ease;
    } else {
      interval = interval * ease * 1.3;
      ease += 0.15;
    }
    // gioi han khoang cach toi da 180 ngay (ky thi trong ~6 thang)
    interval = Math.min(interval, 180);
  }

  const due_at = Date.now() + Math.round(interval * DAY_MS);
  db.updateCardSrs(cardId, { state, ease, interval_days: interval, reps, lapses, due_at });
  db.addReview(cardId, rating, interval);
  return { interval, due_at, state };
}

/** Chuoi hien thi khoang cach on tiep theo, vd "10 phút", "3 ngày" */
function intervalLabel(days) {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} phút`;
  if (days < 1) return `${Math.round(days * 24)} giờ`;
  if (days < 30) return `${Math.round(days)} ngày`;
  return `${(days / 30).toFixed(1)} tháng`;
}

/** Du doan nhan cho 4 nut rating cua 1 the */
function previewIntervals(card) {
  const ease = card.ease || 2.5;
  const interval = card.interval_days || 0;
  const isNew = card.reps === 0 || card.state === 'learning';
  const preview = {};
  preview[1] = intervalLabel(10 / (60 * 24));
  if (isNew) {
    preview[2] = intervalLabel(0.5);
    preview[3] = intervalLabel(1);
    preview[4] = intervalLabel(4);
  } else {
    preview[2] = intervalLabel(Math.min(Math.max(interval * 1.2, interval + 0.5), 180));
    preview[3] = intervalLabel(Math.min(interval * ease, 180));
    preview[4] = intervalLabel(Math.min(interval * ease * 1.3, 180));
  }
  return preview;
}

module.exports = { rate, previewIntervals, intervalLabel };
