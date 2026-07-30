import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CardFront, CardBack, TopicTag } from '../components/CardFace.jsx';
import { RatingRow } from './Study.jsx';
import { WRITING_FUNCTIONS, functionLabel, playSentence } from '../lib.js';

/**
 * Writing Lab — hoc cum Writing theo chuc nang + dien khung cau + paraphrase nhe.
 */
export default function Writing({ onDone }) {
  const [view, setView] = useState('hub'); // hub | phrases | frames | paraphrase
  const [stats, setStats] = useState(null);

  const refresh = async () => {
    try {
      setStats(await window.api.getWritingStats());
    } catch {}
  };

  useEffect(() => { refresh(); }, [view]);

  if (view === 'phrases') {
    return <PhrasesMode onBack={() => setView('hub')} onDone={() => { onDone && onDone(); refresh(); }} />;
  }
  if (view === 'frames') {
    return <FramesMode onBack={() => setView('hub')} />;
  }
  if (view === 'paraphrase') {
    return <ParaphraseMode onBack={() => setView('hub')} onDone={() => { onDone && onDone(); refresh(); }} />;
  }

  const learned = stats?.learned || 0;
  const total = stats?.total || 0;

  return (
    <div className="writing-wrap">
      <h1>Writing Lab</h1>
      <p className="sub">
        Học cụm & khung câu IELTS theo chức năng — không viết cả bài, tập trung band 6.5.
      </p>
      {total > 0 && (
        <div className="writing-progress panel">
          <div className="writing-progress-label">
            Cụm Writing đã mở khóa: <b>{learned}</b> / {total}
          </div>
          <div className="progress-line" style={{ margin: 0 }}>
            <div style={{ width: `${total ? (learned / total) * 100 : 0}%` }} />
          </div>
          <div className="fn-chips">
            {(stats?.byFn || []).filter((x) => x.fn).map((x) => (
              <span key={x.fn} className="chip">
                {functionLabel(x.fn)} · {x.started}/{x.total}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="writing-modes">
        <button className="writing-mode-card" onClick={() => setView('phrases')}>
          <div className="wmc-icon">📚</div>
          <div className="wmc-title">Cụm theo chức năng</div>
          <div className="wmc-sub">Mở bài · Đối lập · Kết luận · Task 1</div>
        </button>
        <button className="writing-mode-card" onClick={() => setView('frames')}>
          <div className="wmc-icon">✏️</div>
          <div className="wmc-title">Điền khung câu</div>
          <div className="wmc-sub">Chọn đúng cụm vào chỗ trống</div>
        </button>
        <button className="writing-mode-card" onClick={() => setView('paraphrase')}>
          <div className="wmc-icon">🔄</div>
          <div className="wmc-title">Paraphrase</div>
          <div className="wmc-sub">Viết lại câu bằng cụm đồng nghĩa</div>
        </button>
      </div>
    </div>
  );
}

/* ========== 1. Cum theo chuc nang ========== */

function PhrasesMode({ onBack, onDone }) {
  const [fn, setFn] = useState(null); // null = all
  const [queue, setQueue] = useState(null);
  const [doneCount, setDoneCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const load = async (functionFilter) => {
    setQueue(null);
    setFlipped(false);
    const cards = await window.api.getWritingCards({
      function: functionFilter || undefined,
      limit: 40
    });
    setQueue(cards);
    setTotal(cards.length);
    setDoneCount(0);
  };

  useEffect(() => { load(fn); }, [fn]);

  const card = queue && queue[0];

  const handleRated = useCallback(async (rating) => {
    if (!card) return;
    const res = await window.api.rateCard(card.id, rating);
    const stillLearning = res && res.state === 'learning';
    setQueue((q) => {
      const rest = q.slice(1);
      if (stillLearning) return [...rest, { ...card, state: 'learning', reps: 0 }];
      return rest;
    });
    if (!stillLearning) setDoneCount((d) => d + 1);
    setFlipped(false);
    onDone && onDone();
  }, [card, onDone]);

  const learnMore = async () => {
    const cards = await window.api.learnMoreWriting(10, fn || null);
    setQueue(cards);
    setTotal(cards.length);
    setDoneCount(0);
    setFlipped(false);
  };

  if (queue === null) {
    return (
      <div className="writing-wrap">
        <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
        <div className="sub">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="writing-wrap">
      <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
      <h1>Cụm theo chức năng</h1>
      <div className="fn-filter">
        <button className={'fn-chip' + (fn === null ? ' active' : '')} onClick={() => setFn(null)}>Tất cả</button>
        {Object.entries(WRITING_FUNCTIONS).map(([k, label]) => (
          <button key={k} className={'fn-chip' + (fn === k ? ' active' : '')} onClick={() => setFn(k)}>
            {label}
          </button>
        ))}
      </div>

      {!card ? (
        <div className="done-box panel">
          <div className="big">🎉</div>
          <h2>Hết thẻ trong nhóm này</h2>
          <p className="sub">Học thêm cụm mới hoặc đổi nhóm chức năng.</p>
          <button className="btn primary" onClick={learnMore}>➕ Học thêm 10 cụm</button>
        </div>
      ) : (
        <>
          <div className="sub">Còn {queue.length} thẻ · đã xong {doneCount}/{total || doneCount}</div>
          <div className="progress-line">
            <div style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
          </div>
          <div className="flashcard">
            <TopicTag topic={card.topic} cefr={card.cefr} />
            {card.function && <span className="chip accent">{functionLabel(card.function)}</span>}
            <CardFront card={card} />
            {flipped ? (
              <>
                <CardBack card={card} showImage />
                <RatingRow card={card} onRate={handleRated} />
              </>
            ) : (
              <button className="reveal-btn" onClick={() => setFlipped(true)}>
                Hiện nghĩa (Space)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ========== 2. Dien khung cau ========== */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FramesMode({ onBack }) {
  const [fn, setFn] = useState(null);
  const [queue, setQueue] = useState(null);
  const [picked, setPicked] = useState(null);
  const [doneCount, setDoneCount] = useState(0);

  const load = async (functionFilter) => {
    setQueue(null);
    setPicked(null);
    const frames = await window.api.getWritingFrames({
      function: functionFilter || undefined,
      limit: 30
    });
    setQueue(frames);
    setDoneCount(0);
  };

  useEffect(() => { load(fn); }, [fn]);

  const frame = queue && queue[0];
  const options = useMemo(() => {
    if (!frame) return [];
    return shuffle([frame.answer, ...(frame.distractors || []).slice(0, 3)]);
  }, [frame]);

  const next = () => {
    setPicked(null);
    setQueue((q) => q.slice(1));
    setDoneCount((d) => d + 1);
  };

  if (queue === null) {
    return (
      <div className="writing-wrap">
        <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
        <div className="sub">Đang tải...</div>
      </div>
    );
  }

  if (!frame) {
    return (
      <div className="writing-wrap">
        <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
        <div className="done-box panel">
          <div className="big">🎉</div>
          <h2>Đã luyện hết khung câu</h2>
          <p className="sub">Đã làm {doneCount} câu. Đổi nhóm hoặc luyện lại.</p>
          <button className="btn primary" onClick={() => load(fn)}>🔄 Luyện lại</button>
        </div>
      </div>
    );
  }

  const isCorrect = picked === frame.answer;

  return (
    <div className="writing-wrap">
      <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
      <h1>Điền khung câu</h1>
      <div className="fn-filter">
        <button className={'fn-chip' + (fn === null ? ' active' : '')} onClick={() => setFn(null)}>Tất cả</button>
        {Object.entries(WRITING_FUNCTIONS).map(([k, label]) => (
          <button key={k} className={'fn-chip' + (fn === k ? ' active' : '')} onClick={() => setFn(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sub">Còn {queue.length} câu · đã làm {doneCount}</div>

      <div className="frame-card panel">
        <div className="chip accent">{functionLabel(frame.function)}{frame.hint ? ` · ${frame.hint}` : ''}</div>
        <p className="frame-vn">{frame.promptVn}</p>
        <p className="frame-en">
          {frame.frameEn.split('_____').map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className={'frame-blank' + (picked ? (isCorrect ? ' ok' : ' no') : '')}>
                  {picked ? (isCorrect ? frame.answer : picked) : '_____'}
                </span>
              )}
            </React.Fragment>
          ))}
          <button
            className="audio-btn sentence"
            title="Đọc câu đầy đủ"
            onClick={() => playSentence(frame.frameEn.replace('_____', frame.answer))}
          >
            🔊
          </button>
        </p>

        <div className="frame-options">
          {options.map((opt) => {
            let cls = 'quiz-opt';
            if (picked !== null) {
              if (opt === frame.answer) cls += ' correct';
              else if (opt === picked) cls += ' wrong';
            }
            return (
              <button
                key={opt}
                className={cls}
                disabled={picked !== null}
                onClick={() => setPicked(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <div className="frame-feedback">
            <div className={isCorrect ? 'ok-text' : 'no-text'}>
              {isCorrect ? '✓ Đúng rồi!' : `✗ Đáp án: ${frame.answer}`}
            </div>
            <button className="btn primary" onClick={next}>Tiếp tục</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== 3. Paraphrase ========== */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ParaphraseMode({ onBack, onDone }) {
  const [queue, setQueue] = useState(null);
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(null); // null | true | false
  const [doneCount, setDoneCount] = useState(0);

  const load = async () => {
    setQueue(null);
    setValue('');
    setChecked(null);
    const bank = await window.api.getParaphraseBank(25);
    setQueue(bank);
    setDoneCount(0);
  };

  useEffect(() => { load(); }, []);

  const item = queue && queue[0];

  const check = () => {
    if (!item || checked !== null) return;
    const ans = normalize(value);
    const target = normalize(item.targetPhrase);
    const syns = (item.synonyms || []).map(normalize);
    const ok = ans.includes(target) || syns.some((s) => s && ans.includes(s));
    // cung chap nhan neu cau co giong goc nhung da doi bang syn (do dai hop ly)
    setChecked(ok && ans.length >= Math.min(12, target.length));
  };

  const next = async (rating) => {
    if (item?.id && rating) {
      await window.api.rateCard(item.id, rating);
      onDone && onDone();
    }
    setValue('');
    setChecked(null);
    setQueue((q) => q.slice(1));
    setDoneCount((d) => d + 1);
  };

  if (queue === null) {
    return (
      <div className="writing-wrap">
        <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
        <div className="sub">Đang tải...</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="writing-wrap">
        <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
        <div className="done-box panel">
          <div className="big">🎉</div>
          <h2>Đã luyện hết paraphrase</h2>
          <p className="sub">Đã làm {doneCount} câu.</p>
          <button className="btn primary" onClick={load}>🔄 Luyện lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="writing-wrap">
      <button className="btn ghost" onClick={onBack}>← Writing Lab</button>
      <h1>Paraphrase</h1>
      <div className="sub">Còn {queue.length} câu · đã làm {doneCount}</div>

      <div className="frame-card panel">
        {item.function && <div className="chip accent">{functionLabel(item.function)}</div>}
        <p className="frame-label">Câu gốc</p>
        <div className="example-box">
          <div className="en">{item.original}</div>
          {item.originalVn && <div className="vi">{item.originalVn}</div>}
        </div>
        <p className="frame-label">Viết lại — hãy dùng cụm học thuật hơn</p>
        <div className="para-hints">
          <span className="chip accent">Gợi ý: {item.targetPhrase}</span>
          {(item.synonyms || []).slice(0, 3).map((s) => (
            <span key={s} className="chip">≈ {s}</span>
          ))}
        </div>
        <textarea
          className={'para-input' + (checked === true ? ' ok' : checked === false ? ' no' : '')}
          rows={3}
          placeholder="Gõ câu paraphrase bằng tiếng Anh..."
          value={value}
          disabled={checked !== null}
          onChange={(e) => setValue(e.target.value)}
        />
        {checked === null ? (
          <button className="btn primary" disabled={!value.trim()} onClick={check}>
            Kiểm tra
          </button>
        ) : (
          <div className="frame-feedback">
            <div className={checked ? 'ok-text' : 'no-text'}>
              {checked
                ? '✓ Tốt! Bạn đã dùng cụm mục tiêu / đồng nghĩa.'
                : `✗ Hãy đưa cụm "${item.targetPhrase}" (hoặc đồng nghĩa) vào câu.`}
            </div>
            <div className="rating-row" style={{ width: '100%', marginTop: 8 }}>
              <button className="btn" onClick={() => next(checked ? 3 : 1)}>
                {checked ? 'Tiếp (Nhớ)' : 'Tiếp (Học lại)'}
              </button>
              {checked && (
                <button className="btn primary" onClick={() => next(4)}>Dễ — tiếp</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
