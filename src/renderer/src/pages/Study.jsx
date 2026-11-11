import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardFront, CardBack, TopicTag } from '../components/CardFace.jsx';
import { RATE_LABELS, playAudio, useCardImage } from '../lib.js';

export default function Study({ onDone }) {
  const [queue, setQueue] = useState(null); // null = dang tai
  const [total, setTotal] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [mode, setMode] = useState('flip');

  const [checking, setChecking] = useState(false);

  const load = async () => {
    setChecking(true);
    const cards = await window.api.getDueCards(60);
    setQueue(cards);
    setTotal(cards.length);
    setDoneCount(0);
    setChecking(false);
  };

  // Hoc them tu moi ngay lap tuc (bo qua gioi han moi ngay)
  const learnMore = async () => {
    setChecking(true);
    const cards = await window.api.learnMore(10);
    setQueue(cards);
    setTotal(cards.length);
    setDoneCount(0);
    setChecking(false);
    onDone && onDone();
  };

  useEffect(() => { load(); }, []);

  const card = queue && queue[0];
  const ratingRef = useRef(false); // chong cham diem 2 lan khi bam phim nhanh

  const handleRated = useCallback(async (rating) => {
    if (!card || ratingRef.current) return;
    ratingRef.current = true;
    let res;
    try {
      res = await window.api.rateCard(card.id, rating);
    } finally {
      ratingRef.current = false;
    }
    // Neu the van dang trong buoc hoc (Quen/Kho tren tu moi) -> luyen lai
    // trong cung phien (day xuong cuoi hang doi). Chi tinh "xong" khi tot nghiep.
    const stillLearning = res && res.state === 'learning';
    setQueue((q) => {
      const rest = q.slice(1);
      if (stillLearning) return [...rest, { ...card, state: 'learning', reps: 0 }];
      return rest;
    });
    if (!stillLearning) setDoneCount((d) => d + 1);
    onDone && onDone();
  }, [card, onDone]);

  if (queue === null) return <div className="sub">Đang tải...</div>;

  if (!card) {
    return (
      <div className="study-wrap">
        <div className="done-box panel">
          <div className="big">🎉</div>
          <h2>Tuyệt vời! Bạn đã ôn hết thẻ đến hạn</h2>
          <p className="sub">
            Bạn có thể học thêm từ mới ngay bây giờ, hoặc kiểm tra lại xem có thẻ nào vừa đến hạn ôn không.
          </p>
          <div className="rating-row" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn primary" disabled={checking} onClick={learnMore}>
              ➕ Học thêm 10 từ mới
            </button>
            <button className="btn" disabled={checking} onClick={load}>
              🔄 Kiểm tra lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  return (
    <div className="study-wrap">
      <h1>Học phiên</h1>
      <div className="sub">Còn {queue.length} thẻ trong phiên này</div>
      <div className="study-modes">
        {[['flip', '🃏 Lật thẻ'], ['quiz', '✅ Trắc nghiệm'], ['type', '⌨️ Điền từ']].map(([m, l]) => (
          <button key={m} className={'mode-btn' + (mode === m ? ' active' : '')} onClick={() => setMode(m)}>
            {l}
          </button>
        ))}
      </div>
      <div className="progress-line"><div style={{ width: `${progress}%` }} /></div>
      {mode === 'flip' && <FlipCard key={card.id + '-f'} card={card} onRate={handleRated} />}
      {mode === 'quiz' && <QuizCard key={card.id + '-q'} card={card} onRate={handleRated} />}
      {mode === 'type' && <TypeCard key={card.id + '-t'} card={card} onRate={handleRated} />}
    </div>
  );
}

/* ---------- Che do lat the ---------- */

function FlipCard({ card, onRate }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); setFlipped(true); }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) onRate(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, onRate]);

  return (
    <div className="flashcard">
      <TopicTag topic={card.topic} cefr={card.cefr} />
      <StarBtn card={card} />
      <CardFront card={card} />
      {flipped ? (
        <>
          <CardBack card={card} />
          <RatingRow card={card} onRate={onRate} />
        </>
      ) : (
        <button className="reveal-btn" onClick={() => setFlipped(true)}>
          Hiện nghĩa (Space)
        </button>
      )}
    </div>
  );
}

export function RatingRow({ card, onRate }) {
  const preview = card.preview || {};
  return (
    <div className="rating-row" style={{ width: '100%' }}>
      {[1, 2, 3, 4].map((r) => (
        <button key={r} className={`rate-btn ${RATE_LABELS[r].cls}`} onClick={() => onRate(r)}>
          <span className="k">{r}. {RATE_LABELS[r].key}</span>
          <span className="t">{preview[r] || ''}</span>
        </button>
      ))}
    </div>
  );
}

function StarBtn({ card }) {
  const [on, setOn] = useState(!!card.starred);
  return (
    <button
      className={'star-btn' + (on ? ' on' : '')}
      title="Đánh dấu từ khó"
      onClick={() => { window.api.toggleStar(card.id); setOn(!on); }}
    >
      {on ? '⭐' : '☆'}
    </button>
  );
}

/* ---------- Che do trac nghiem ---------- */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function QuizCard({ card, onRate }) {
  const [options, setOptions] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    window.api.getDistractors(card.id, 3).then((ds) => {
      setOptions(shuffle([card.vn, ...ds]));
    });
  }, [card.id]);

  const pick = (opt) => {
    if (picked !== null) return;
    setPicked(opt);
  };

  const isCorrect = picked === card.vn;

  return (
    <div className="flashcard">
      <TopicTag topic={card.topic} cefr={card.cefr} />
      <CardFront card={card} />
      <div style={{ width: '100%', maxWidth: 460, marginTop: 12 }}>
        {(options || []).map((opt, i) => {
          let cls = 'quiz-opt';
          if (picked !== null) {
            if (opt === card.vn) cls += ' correct';
            else if (opt === picked) cls += ' wrong';
          }
          return (
            <button key={i} className={cls} onClick={() => pick(opt)}>
              {String.fromCharCode(65 + i)}. {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <>
          <CardBack card={card} compact />
          <button className="reveal-btn" onClick={() => onRate(isCorrect ? 3 : 1)}>
            {isCorrect ? '✓ Đúng rồi — Tiếp tục' : '✗ Sai — Học lại sau'}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- Che do dien tu ---------- */

function TypeCard({ card, onRate }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(null); // null | true | false
  const inputRef = useRef(null);
  const img = useCardImage(card.id);

  const answer = card.word.replace(/\(.*?\)/g, '').trim();
  const blanked = useMemo(() => {
    const base = answer.split(/\s+/)[0];
    const stem = base.length > 5 ? base.slice(0, -2) : base;
    const re = new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'gi');
    return (card.example || '').replace(re, '_____');
  }, [card]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const check = () => {
    if (checked !== null) return;
    const ok = value.trim().toLowerCase() === answer.toLowerCase();
    setChecked(ok);
    playAudio(card);
  };

  return (
    <div className="flashcard">
      <TopicTag topic={card.topic} cefr={card.cefr} />
      <div className="vn-big" style={{ marginTop: 20 }}>{card.vn}</div>
      <div className="def-text">{card.def}</div>
      {img && <img className="card-img" src={img} alt="" />}
      {card.example && (
        <div className="example-box"><div className="en">{blanked}</div></div>
      )}
      <input
        ref={inputRef}
        className={'type-input' + (checked === true ? ' ok' : checked === false ? ' no' : '')}
        placeholder="Gõ từ tiếng Anh..."
        value={value}
        disabled={checked !== null}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') check(); }}
      />
      {checked === null ? (
        <button className="reveal-btn" onClick={check}>Kiểm tra (Enter)</button>
      ) : (
        <>
          <div style={{ margin: '4px 0 12px' }}>
            {checked ? '✓ Chính xác!' : <>✗ Đáp án: <b style={{ color: 'var(--accent2)' }}>{answer}</b></>}
          </div>
          <button className="reveal-btn" onClick={() => onRate(checked ? 3 : 1)}>Tiếp tục</button>
        </>
      )}
    </div>
  );
}
