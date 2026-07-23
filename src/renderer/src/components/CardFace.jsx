import React from 'react';
import { playAudio, useCardImage, topicLabel, highlightWord } from '../lib.js';

/** Mat truoc cua the: tu + IPA + anh */
export function CardFront({ card, showImage = true }) {
  const img = useCardImage(showImage ? card.id : null);
  return (
    <>
      <div className="word-big">{card.word}</div>
      <div>
        <span className="pos-tag">{card.pos}</span>{' '}
        <span className="ipa">{card.ipa}</span>
        <button className="audio-btn" title="Phát âm" onClick={() => playAudio(card)}>🔊</button>
      </div>
      {img && <img className="card-img" src={img} alt="" />}
    </>
  );
}

/** Mat sau cua the: nghia + dinh nghia + vi du + collocations + synonyms */
export function CardBack({ card, compact = false }) {
  const exParts = highlightWord(card.example, card.word);
  return (
    <>
      <div className="vn-big">{card.vn}</div>
      {card.def && <div className="def-text">{card.def}</div>}
      {card.example && (
        <div className="example-box">
          <div className="en">
            {Array.isArray(exParts)
              ? exParts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : p))
              : exParts}
          </div>
          {card.example_vn && <div className="vi">{card.example_vn}</div>}
        </div>
      )}
      {!compact && (
        <div style={{ marginTop: 6 }}>
          {(card.collocations || []).map((c, i) => (
            <span key={'c' + i} className="chip accent">{c}</span>
          ))}
          {(card.synonyms || []).map((s, i) => (
            <span key={'s' + i} className="chip">≈ {s}</span>
          ))}
        </div>
      )}
    </>
  );
}

export function TopicTag({ topic, cefr }) {
  return (
    <span className="topic-tag chip">
      {topicLabel(topic)}{cefr ? ` · ${cefr}` : ''}
    </span>
  );
}
