import { useEffect, useState } from 'react';

/** Phat am tu: uu tien audio that (dictionaryapi.dev cache), fallback giong Windows */
export async function playAudio(card) {
  try {
    const url = await window.api.getAudio(card.id);
    if (url) {
      const a = new Audio(url);
      await a.play();
      return;
    }
  } catch {}
  try {
    const u = new SpeechSynthesisUtterance(card.word.replace(/\(.*?\)/g, ''));
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

/** Doc to mot doan van ban (cau vi du) bang giong doc he thong (Windows) */
export function playSentence(text) {
  if (!text) return;
  try {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = 0.92;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

/** Hook lay anh minh hoa (media:// url) cua the */
export function useCardImage(cardId) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    if (!cardId) return;
    window.api.getImage(cardId).then((url) => {
      if (alive) setSrc(url);
    }).catch(() => {});
    return () => { alive = false; };
  }, [cardId]);
  return src;
}

export const TOPIC_LABELS = {
  education: 'Giáo dục',
  environment: 'Môi trường',
  technology: 'Công nghệ',
  health: 'Sức khỏe',
  work_business: 'Công việc & Kinh doanh',
  society: 'Xã hội',
  travel_transport: 'Du lịch & Giao thông',
  media_advertising: 'Truyền thông & Quảng cáo',
  crime_law: 'Tội phạm & Pháp luật',
  art_culture: 'Nghệ thuật & Văn hóa',
  food_nutrition: 'Ẩm thực & Dinh dưỡng',
  urbanisation_housing: 'Đô thị & Nhà ở',
  family_relationships: 'Gia đình & Quan hệ',
  money_economy: 'Tiền bạc & Kinh tế',
  science_research: 'Khoa học & Nghiên cứu',
  sport_leisure: 'Thể thao & Giải trí',
  government_politics: 'Chính phủ & Chính sách',
  communication_language: 'Giao tiếp & Ngôn ngữ',
  writing_phrases: 'Cụm từ Writing',
  common_phrases: 'Cụm từ thông dụng',
  writing_task1: 'Writing Task 1',
  custom: 'Từ của tôi'
};

export const WRITING_FUNCTIONS = {
  opinion: 'Quan điểm',
  cause: 'Nguyên nhân – Kết quả',
  contrast: 'Đối lập',
  solution: 'Giải pháp',
  conclusion: 'Kết luận',
  task1: 'Task 1 (biểu đồ)'
};

export function functionLabel(fn) {
  return WRITING_FUNCTIONS[fn] || fn || 'Khác';
}

export function topicLabel(t) {
  return TOPIC_LABELS[t] || t;
}

export const RATE_LABELS = {
  1: { key: 'Quên', cls: 'r1' },
  2: { key: 'Khó', cls: 'r2' },
  3: { key: 'Nhớ', cls: 'r3' },
  4: { key: 'Dễ', cls: 'r4' }
};

/** In dam tu vung xuat hien trong cau vi du */
export function highlightWord(example, word) {
  if (!example) return example;
  const base = word.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0];
  if (!base) return example;
  const stem = base.length > 5 ? base.slice(0, -2) : base;
  const re = new RegExp(`(\\b${escapeReg(stem)}\\w*)`, 'i');
  const parts = example.split(re);
  return parts;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
