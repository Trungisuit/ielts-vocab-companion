import React, { useEffect, useState } from 'react';
import { CardBack } from '../components/CardFace.jsx';
import { playAudio, topicLabel } from '../lib.js';

const EMPTY_FORM = {
  word: '', pos: 'noun', ipa: '', cefr: 'B2', vn: '', def: '',
  example: '', example_vn: '', collocations: '', synonyms: '', topic: 'custom'
};

export default function Browse() {
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState(null);
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null); // form data | null

  const loadTopics = () => window.api.listTopics().then(setTopics);
  const loadCards = async () => {
    const res = await window.api.listCards({ topic, search, limit: 300 });
    setCards(res.cards);
    setTotal(res.total);
  };

  useEffect(() => { loadTopics(); }, []);
  useEffect(() => { loadCards(); }, [topic, search]);

  const openAdd = () => setEditing({ ...EMPTY_FORM, id: null });
  const openEdit = (c) => setEditing({
    ...c,
    collocations: (c.collocations || []).join('; '),
    synonyms: (c.synonyms || []).join('; ')
  });

  const save = async () => {
    const data = {
      ...editing,
      collocations: editing.collocations.split(';').map((s) => s.trim()).filter(Boolean),
      synonyms: editing.synonyms.split(';').map((s) => s.trim()).filter(Boolean)
    };
    if (editing.id) await window.api.updateCard(editing.id, data);
    else await window.api.addCard(data);
    setEditing(null);
    loadCards();
    loadTopics();
  };

  const remove = async (id) => {
    if (!confirm('Xóa thẻ này?')) return;
    await window.api.deleteCard(id);
    setExpanded(null);
    loadCards();
    loadTopics();
  };

  return (
    <div>
      <h1>Duyệt từ vựng</h1>
      <div className="sub">{total} thẻ · bấm vào từ để xem chi tiết</div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          style={{ flex: 1, maxWidth: 380 }}
          placeholder="🔍 Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn primary" onClick={openAdd}>+ Thêm từ của tôi</button>
      </div>

      <div className="browse-layout">
        <div className="topic-list panel" style={{ padding: 10 }}>
          <button className={'topic-item' + (topic === null ? ' active' : '')} onClick={() => setTopic(null)}>
            <span>Tất cả chủ đề</span>
          </button>
          {topics.map((t) => (
            <button
              key={t.topic}
              className={'topic-item' + (topic === t.topic ? ' active' : '')}
              onClick={() => setTopic(t.topic)}
            >
              <span>{topicLabel(t.topic)}</span>
              <span className="cnt">{t.started}/{t.total}</span>
            </button>
          ))}
        </div>

        <div className="word-list panel" style={{ padding: 0, overflow: 'hidden' }}>
          {cards.map((c) => (
            <React.Fragment key={c.id}>
              <div className="word-row" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                <span className={`state-dot state-${c.state}`} title={c.state} />
                <span className="w">{c.word}</span>
                <span className="v">{c.vn}</span>
                <span className="chip">{c.cefr}</span>
                {!!c.starred && <span>⭐</span>}
              </div>
              {expanded === c.id && (
                <div className="word-detail">
                  <div style={{ marginBottom: 6 }}>
                    <span className="pos-tag">{c.pos}</span>{' '}
                    <span className="ipa">{c.ipa}</span>
                    <button className="audio-btn" onClick={() => playAudio(c)}>🔊</button>
                  </div>
                  <CardBack card={c} />
                  <div className="row-actions">
                    <button className="btn sm" onClick={() => openEdit(c)}>✏️ Sửa</button>
                    <button className="btn sm" onClick={() => { window.api.toggleStar(c.id); loadCards(); }}>
                      {c.starred ? '☆ Bỏ đánh dấu' : '⭐ Đánh dấu khó'}
                    </button>
                    <button className="btn sm danger" onClick={() => remove(c.id)}>🗑 Xóa</button>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
          {cards.length === 0 && (
            <div style={{ padding: 24, color: 'var(--text2)' }}>Không tìm thấy từ nào.</div>
          )}
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <h2>{editing.id ? 'Sửa thẻ từ vựng' : 'Thêm từ của tôi'}</h2>
            <div className="form-grid">
              <div className="form-row">
                <label>Từ / cụm từ *</label>
                <input value={editing.word} onChange={(e) => setEditing({ ...editing, word: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Loại từ</label>
                <select value={editing.pos} onChange={(e) => setEditing({ ...editing, pos: e.target.value })}>
                  {['noun', 'verb', 'adjective', 'adverb', 'phrase', 'phrasal verb', 'idiom'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>IPA (phiên âm)</label>
                <input value={editing.ipa} onChange={(e) => setEditing({ ...editing, ipa: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Mức độ (CEFR)</label>
                <select value={editing.cefr} onChange={(e) => setEditing({ ...editing, cefr: e.target.value })}>
                  {['A2', 'B1', 'B2', 'C1', 'C2'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label>Nghĩa tiếng Việt *</label>
              <input value={editing.vn} onChange={(e) => setEditing({ ...editing, vn: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Định nghĩa tiếng Anh</label>
              <input value={editing.def} onChange={(e) => setEditing({ ...editing, def: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Câu ví dụ</label>
              <textarea rows={2} value={editing.example} onChange={(e) => setEditing({ ...editing, example: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Dịch câu ví dụ</label>
              <textarea rows={2} value={editing.example_vn} onChange={(e) => setEditing({ ...editing, example_vn: e.target.value })} />
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Collocations (cách nhau bằng dấu ;)</label>
                <input value={editing.collocations} onChange={(e) => setEditing({ ...editing, collocations: e.target.value })} />
              </div>
              <div className="form-row">
                <label>Từ đồng nghĩa (cách nhau bằng dấu ;)</label>
                <input value={editing.synonyms} onChange={(e) => setEditing({ ...editing, synonyms: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>Hủy</button>
              <button className="btn primary" disabled={!editing.word || !editing.vn} onClick={save}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
