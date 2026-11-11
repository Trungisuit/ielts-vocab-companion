import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CardFront, CardBack } from './components/CardFace.jsx';
import { RATE_LABELS } from './lib.js';

/**
 * Popup nhac on tap o goc man hinh.
 * Flow: hien mat truoc -> bam "Hien nghia" -> cham diem 1-4 -> the tiep theo (neu con)
 * Khong tuong tac trong N giay -> tu an, the don lai 15 phut.
 */
export default function Popup() {
  const [card, setCard] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [settings, setSettings] = useState({ popupAutoHideSec: 20, snoozeMin: 30 });
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [engaged, setEngaged] = useState(false); // da tuong tac -> khong tu an nua
  const reviewedRef = useRef(0);
  const ratingRef = useRef(false);

  /* nhan the tu main process */
  useEffect(() => {
    const off = window.api.onPopupCard(({ card, settings, dueCount }) => {
      setCard(card);
      setSettings(settings);
      setDueCount(dueCount);
      setFlipped(false);
      setDone(false);
      setEngaged(false);
      setSecondsLeft(settings.popupAutoHideSec || 20);
      reviewedRef.current = 0;
    });
    return off;
  }, []);

  /* dem nguoc tu an */
  useEffect(() => {
    if (!card || engaged || done) return;
    if (secondsLeft <= 0) {
      window.api.popupHide(card.id);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [card, engaged, done, secondsLeft]);

  const engage = () => setEngaged(true);

  const flip = () => { engage(); setFlipped(true); };

  const rate = useCallback(async (rating) => {
    if (ratingRef.current) return; // chong cham diem 2 lan khi bam phim nhanh
    ratingRef.current = true;
    engage();
    let res;
    try {
      res = await window.api.popupRate(card.id, rating);
    } finally {
      ratingRef.current = false;
    }
    reviewedRef.current += 1;
    // on toi da 5 the moi lan popup de khong chiem qua nhieu thoi gian
    if (res.card && reviewedRef.current < 5) {
      setCard(res.card);
      setDueCount(res.dueCount);
      setFlipped(false);
    } else {
      setDone(true);
      setDueCount(res.dueCount);
      setTimeout(() => window.api.popupHide(null), 1600);
    }
  }, [card]);

  /* phim tat khi popup co focus */
  useEffect(() => {
    const onKey = (e) => {
      if (!card || done) return;
      if (e.code === 'Space') { e.preventDefault(); flip(); }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key));
      if (e.key === 'Escape') window.api.popupHide(card.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, flipped, done, rate]);

  if (!card) return null;

  const pct = engaged ? 100 : (secondsLeft / (settings.popupAutoHideSec || 20)) * 100;

  return (
    <div className="popup-card" onMouseEnter={engage}>
      <div className="popup-countdown"><div style={{ width: `${pct}%` }} /></div>
      <div className="popup-head">
        <span className="title">🎯 Ôn từ vựng</span>
        <span>· còn {dueCount} thẻ</span>
        <span className="spacer" />
        <button title={`Nhắc lại sau ${settings.snoozeMin} phút`} onClick={() => window.api.popupSnooze()}>
          😴 {settings.snoozeMin}p
        </button>
        <button title="Mở app" onClick={() => window.api.popupOpenMain('study')}>⤢</button>
        <button title="Đóng (Esc)" onClick={() => window.api.popupHide(card.id)}>✕</button>
      </div>

      {done ? (
        <div className="popup-done">
          <div className="big">🎉</div>
          <b>Tuyệt vời!</b>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            {dueCount > 0 ? `Còn ${dueCount} thẻ — mở app để ôn tiếp` : 'Đã ôn hết thẻ đến hạn'}
          </span>
        </div>
      ) : (
        <>
          <div className="popup-body">
            {!flipped ? (
              <CardFront card={card} />
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{card.word}</div>
                <CardBack card={card} showImage />
              </>
            )}
            {!flipped && (
              <button className="popup-reveal" onClick={flip}>Hiện nghĩa</button>
            )}
          </div>
          {flipped && (
            <div className="popup-rates">
              {[1, 2, 3, 4].map((r) => (
                <button key={r} className={`rate-btn ${RATE_LABELS[r].cls}`} onClick={() => rate(r)}>
                  <span className="k">{RATE_LABELS[r].key}</span>
                  <span className="t">{(card.preview || {})[r] || ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
