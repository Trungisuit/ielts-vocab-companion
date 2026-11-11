/**
 * Mobile / Standalone Web Adapter cho IELTS Vocab Companion.
 * Khi chay trong file APK (Android Capacitor / WebView) khong co Electron preload,
 * module nay cung cap day du window.api bang du lieu dong goi trong ./mobile-bundle/snapshot.json
 * ket hop voi localStorage (hoac IndexedDB) + anh/audio offline trong APK.
 */

const STORAGE_KEY = 'ielts_vocab_mobile_db_v1';
const DAY_MS = 86400000;
const MIN_EASE = 1.3;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };
const WRITING_TOPICS = new Set(['writing_phrases', 'common_phrases', 'writing_task1']);

const DEFAULT_SETTINGS = {
  newPerDay: 10,
  popupIntervalMin: 25,
  popupAutoHideSec: 20,
  snoozeMin: 30,
  quietStart: '22:00',
  quietEnd: '08:00',
  dnd: false,
  examDate: null,
  startDate: null,
  currentBand: 0,
  targetBand: 7,
  includeC2: true
};

let state = null;
let initPromise = null;

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function saveState() {
  if (!state) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save mobile state error:', e);
  }
}

async function ensureInit() {
  if (state) return state;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    let bundle = null;
    try {
      const res = await fetch('./mobile-bundle/snapshot.json');
      if (res.ok) bundle = await res.json();
    } catch {}

    if (!saved && bundle) {
      state = {
        bundleExportedAt: bundle.exportedAt || Date.now(),
        settings: { ...DEFAULT_SETTINGS, ...(bundle.settings || {}) },
        cards: bundle.cards || [],
        reviews: bundle.reviews || [],
        frames: bundle.frames || []
      };
      if (!state.settings.startDate) state.settings.startDate = todayStr();
      saveState();
      return state;
    }

    if (saved && bundle) {
      // Hop nhat tu vung moi tu ban APK moi ma van giu tien do hoc tren dien thoai
      const byWord = new Map();
      for (const c of saved.cards || []) {
        byWord.set((c.word || '').toLowerCase().trim(), c);
      }
      let maxId = (saved.cards || []).reduce((m, c) => Math.max(m, c.id || 0), 0);
      for (const bc of bundle.cards || []) {
        const key = (bc.word || '').toLowerCase().trim();
        if (!key) continue;
        const existing = byWord.get(key);
        if (!existing) {
          maxId += 1;
          const added = { ...bc, id: bc.id && !saved.cards.some((x) => x.id === bc.id) ? bc.id : maxId };
          saved.cards.push(added);
          byWord.set(key, added);
        } else {
          // Cap nhat duong dan anh/audio bundled neu APK moi co bo sung
          if (bc.bundled_image && !existing.bundled_image) existing.bundled_image = bc.bundled_image;
          if (bc.bundled_audio && !existing.bundled_audio) existing.bundled_audio = bc.bundled_audio;
          if (bc.function && !existing.function) existing.function = bc.function;
        }
      }
      if (bundle.frames && bundle.frames.length) saved.frames = bundle.frames;
      saved.bundleExportedAt = bundle.exportedAt || saved.bundleExportedAt;
      state = saved;
      saveState();
      return state;
    }

    state = saved || {
      bundleExportedAt: Date.now(),
      settings: { ...DEFAULT_SETTINGS, startDate: todayStr() },
      cards: [],
      reviews: [],
      frames: []
    };
    return state;
  })();

  return initPromise;
}

function bandToCefrIndex(band) {
  const b = Number(band) || 0;
  if (b < 3) return 0;
  if (b < 4) return 1;
  if (b < 5.5) return 2;
  if (b < 7) return 3;
  return 4;
}

function isCardInBandRange(card, settings, ignoreMin = false) {
  if (card.custom) return true;
  const idx = CEFR_ORDER[card.cefr];
  if (idx === undefined) return true;
  const max = settings.includeC2 ? 5 : bandToCefrIndex(settings.targetBand ?? 7);
  const min = ignoreMin ? 0 : Math.min(bandToCefrIndex(settings.currentBand ?? 0), max);
  return idx >= min && idx <= max;
}

function sortCardsForStudy(cards) {
  return [...cards].sort((a, b) => {
    if (!!b.custom !== !!a.custom) return (b.custom ? 1 : 0) - (a.custom ? 1 : 0);
    const ca = CEFR_ORDER[a.cefr] ?? 3;
    const cb = CEFR_ORDER[b.cefr] ?? 3;
    if (ca !== cb) return ca - cb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}

function intervalLabel(days) {
  if (days < 1 / 24) return `${Math.round(days * 24 * 60)} phút`;
  if (days < 1) return `${Math.round(days * 24)} giờ`;
  if (days < 30) return `${Math.round(days)} ngày`;
  return `${(days / 30).toFixed(1)} tháng`;
}

function previewIntervals(card) {
  const ease = card.ease || 2.5;
  const interval = card.interval_days || 0;
  const isNew = card.reps === 0 || card.state === 'learning';
  const preview = {};
  preview[1] = intervalLabel(10 / (60 * 24));
  if (isNew) {
    preview[2] = intervalLabel(30 / (60 * 24));
    preview[3] = intervalLabel(1);
    preview[4] = intervalLabel(4);
  } else {
    preview[2] = intervalLabel(Math.min(Math.max(interval * 1.2, interval + 0.5), 180));
    preview[3] = intervalLabel(Math.min(interval * ease, 180));
    preview[4] = intervalLabel(Math.min(interval * ease * 1.3, 180));
  }
  return preview;
}

function introduceNewCardsSync() {
  const s = state.settings;
  const startOfDay = new Date(todayStr() + 'T00:00:00').getTime();
  const introducedToday = state.cards.filter((c) => c.introduced_at && c.introduced_at >= startOfDay).length;
  const remain = Math.max(0, (s.newPerDay || 10) - introducedToday);
  if (remain <= 0) return 0;
  const candidates = sortCardsForStudy(
    state.cards.filter((c) => c.state === 'new' && isCardInBandRange(c, s, false))
  ).slice(0, remain);
  const now = Date.now();
  for (const c of candidates) {
    c.state = 'learning';
    c.due_at = now;
    c.introduced_at = now;
  }
  if (candidates.length) saveState();
  return candidates.length;
}

function introduceMoreCardsSync(n = 10) {
  const s = state.settings;
  let candidates = sortCardsForStudy(
    state.cards.filter((c) => c.state === 'new' && isCardInBandRange(c, s, false))
  ).slice(0, n);
  if (candidates.length < n) {
    const more = sortCardsForStudy(
      state.cards.filter((c) => c.state === 'new' && !candidates.includes(c) && isCardInBandRange(c, s, true))
    ).slice(0, n - candidates.length);
    candidates = [...candidates, ...more];
  }
  const now = Date.now();
  for (const c of candidates) {
    c.state = 'learning';
    c.due_at = now;
    c.introduced_at = now;
  }
  if (candidates.length) saveState();
  return candidates.length;
}

function rateCardSync(cardId, rating) {
  const card = state.cards.find((c) => c.id === cardId);
  if (!card) return null;
  let { state: st, ease, interval_days: interval, reps, lapses } = card;
  ease = ease || 2.5;
  reps = reps || 0;
  lapses = lapses || 0;

  if (rating === 1) {
    if (st === 'review') lapses += 1;
    reps = 0;
    st = 'learning';
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 10 / (60 * 24);
  } else if (rating === 2 && (reps === 0 || st === 'learning')) {
    st = 'learning';
    reps = 0;
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = 30 / (60 * 24);
  } else if (reps === 0 || st === 'learning') {
    st = 'review';
    reps += 1;
    interval = rating === 3 ? 1 : 4;
    if (rating === 4) ease += 0.15;
  } else {
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
    interval = Math.min(interval, 180);
  }

  const now = Date.now();
  const due_at = now + Math.round(interval * DAY_MS);
  card.state = st;
  card.ease = ease;
  card.interval_days = interval;
  card.reps = reps;
  card.lapses = lapses;
  card.due_at = due_at;
  if (!card.introduced_at) card.introduced_at = now;

  state.reviews.push({
    id: (state.reviews.length ? state.reviews[state.reviews.length - 1].id : 0) + 1,
    card_id: cardId,
    rating,
    reviewed_at: now,
    interval_days: interval
  });
  saveState();
  return { interval, due_at, state: st };
}

export function installMobileApiIfNeeded() {
  if (typeof window === 'undefined' || window.api) return;

  window.api = {
    isMobileRuntime: true,

    getStats: async () => {
      await ensureInit();
      const now = Date.now();
      const total = state.cards.length;
      const learned = state.cards.filter((c) => c.state !== 'new').length;
      const mastered = state.cards.filter((c) => c.state === 'review' && (c.interval_days || 0) >= 21).length;
      const due = state.cards.filter((c) => c.state !== 'new' && c.due_at && c.due_at <= now).length;
      const startOfDay = new Date(todayStr() + 'T00:00:00').getTime();
      const reviewedToday = new Set(
        state.reviews.filter((r) => r.reviewed_at >= startOfDay).map((r) => r.card_id)
      ).size;
      const newToday = state.cards.filter((c) => c.introduced_at && c.introduced_at >= startOfDay).length;

      const daySet = new Set(state.reviews.map((r) => todayStr(new Date(r.reviewed_at))));
      const days = [...daySet].sort().reverse();
      let streak = 0;
      let cursor = todayStr();
      if (days.length && days[0] !== cursor) {
        cursor = todayStr(new Date(Date.now() - DAY_MS));
      }
      for (const d of days) {
        if (d === cursor) {
          streak += 1;
          cursor = todayStr(new Date(new Date(cursor + 'T00:00:00').getTime() - DAY_MS));
        } else if (d < cursor) break;
      }

      const dailyMap = {};
      for (const r of state.reviews) {
        if (r.reviewed_at >= now - 30 * DAY_MS) {
          const d = todayStr(new Date(r.reviewed_at));
          dailyMap[d] = (dailyMap[d] || 0) + 1;
        }
      }
      const daily = Object.entries(dailyMap)
        .map(([d, n]) => ({ d, n }))
        .sort((a, b) => a.d.localeCompare(b.d));

      const weeklyMap = {};
      for (const c of state.cards) {
        if (c.introduced_at) {
          const d = todayStr(new Date(c.introduced_at));
          weeklyMap[d] = (weeklyMap[d] || 0) + 1;
        }
      }
      const weekly = Object.entries(weeklyMap)
        .map(([d, n]) => ({ d, n }))
        .sort((a, b) => a.d.localeCompare(b.d));

      const byCefrMap = {};
      for (const c of state.cards) {
        const k = c.cefr || 'B2';
        if (!byCefrMap[k]) byCefrMap[k] = { cefr: k, total: 0, learned: 0, mastered: 0 };
        byCefrMap[k].total += 1;
        if (c.state !== 'new') byCefrMap[k].learned += 1;
        if (c.state === 'review' && (c.interval_days || 0) >= 21) byCefrMap[k].mastered += 1;
      }
      const byCefr = Object.values(byCefrMap);
      const targetRemaining = state.cards.filter(
        (c) => c.state === 'new' && isCardInBandRange(c, state.settings, false)
      ).length;

      return {
        total,
        learned,
        mastered,
        due,
        reviewedToday,
        newToday,
        streak,
        daily,
        weekly,
        byCefr,
        targetRemaining
      };
    },

    getSettings: async () => {
      await ensureInit();
      return { ...DEFAULT_SETTINGS, ...state.settings };
    },
    setSettings: async (obj) => {
      await ensureInit();
      state.settings = { ...state.settings, ...obj };
      saveState();
      return state.settings;
    },

    listCards: async ({ topic = null, cefr = null, search = '', state: st = null, starred = false, limit = 100, offset = 0 } = {}) => {
      await ensureInit();
      const q = (search || '').toLowerCase().trim();
      const filtered = sortCardsForStudy(
        state.cards.filter((c) => {
          if (topic && c.topic !== topic) return false;
          if (cefr && c.cefr !== cefr) return false;
          if (st && c.state !== st) return false;
          if (starred && !c.starred) return false;
          if (q && !(c.word || '').toLowerCase().includes(q) && !(c.vn || '').toLowerCase().includes(q)) return false;
          return true;
        })
      );
      return {
        cards: filtered.slice(offset, offset + limit),
        total: filtered.length
      };
    },

    listTopics: async () => {
      await ensureInit();
      const map = {};
      for (const c of state.cards) {
        const t = c.topic || 'custom';
        if (!map[t]) map[t] = { topic: t, total: 0, started: 0, mastered: 0 };
        map[t].total += 1;
        if (c.state !== 'new') map[t].started += 1;
        if (c.state === 'review' && (c.interval_days || 0) >= 21) map[t].mastered += 1;
      }
      return Object.values(map).sort((a, b) => a.topic.localeCompare(b.topic));
    },

    getCard: async (id) => {
      await ensureInit();
      return state.cards.find((c) => c.id === id) || null;
    },

    addCard: async (data) => {
      await ensureInit();
      const maxId = state.cards.reduce((m, c) => Math.max(m, c.id || 0), 0);
      const maxOrder = state.cards.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
      const card = {
        id: maxId + 1,
        word: data.word || '',
        pos: data.pos || 'noun',
        ipa: data.ipa || '',
        cefr: data.cefr || 'B2',
        vn: data.vn || '',
        def: data.def || '',
        example: data.example || '',
        example_vn: data.example_vn || '',
        collocations: data.collocations || [],
        synonyms: data.synonyms || [],
        topic: data.topic || 'custom',
        custom: 1,
        starred: 0,
        sort_order: maxOrder + 1,
        state: 'new',
        ease: 2.5,
        interval_days: 0,
        reps: 0,
        lapses: 0,
        due_at: null,
        introduced_at: null,
        function: data.function || ''
      };
      state.cards.push(card);
      saveState();
      return card.id;
    },

    updateCard: async (id, data) => {
      await ensureInit();
      const c = state.cards.find((x) => x.id === id);
      if (!c) return;
      Object.assign(c, {
        word: data.word ?? c.word,
        pos: data.pos ?? c.pos,
        ipa: data.ipa ?? c.ipa,
        cefr: data.cefr ?? c.cefr,
        vn: data.vn ?? c.vn,
        def: data.def ?? c.def,
        example: data.example ?? c.example,
        example_vn: data.example_vn ?? c.example_vn,
        collocations: data.collocations ?? c.collocations,
        synonyms: data.synonyms ?? c.synonyms,
        topic: data.topic ?? c.topic
      });
      saveState();
    },

    deleteCard: async (id) => {
      await ensureInit();
      state.cards = state.cards.filter((c) => c.id !== id);
      state.reviews = state.reviews.filter((r) => r.card_id !== id);
      saveState();
    },

    toggleStar: async (id) => {
      await ensureInit();
      const c = state.cards.find((x) => x.id === id);
      if (c) {
        c.starred = c.starred ? 0 : 1;
        saveState();
      }
    },

    getDueCards: async (limit = 100) => {
      await ensureInit();
      introduceNewCardsSync();
      const now = Date.now();
      return state.cards
        .filter((c) => c.state !== 'new' && c.due_at && c.due_at <= now)
        .sort((a, b) => a.due_at - b.due_at)
        .slice(0, limit)
        .map((c) => ({ ...c, preview: previewIntervals(c) }));
    },

    rateCard: async (id, rating) => {
      await ensureInit();
      return rateCardSync(id, rating);
    },

    getDistractors: async (cardId, n = 3) => {
      await ensureInit();
      const target = state.cards.find((c) => c.id === cardId);
      const targetVn = (target?.vn || '').toLowerCase().trim();
      const pool = [...new Set(
        state.cards
          .filter((c) => c.id !== cardId && c.vn && c.vn.toLowerCase().trim() !== targetVn)
          .map((c) => c.vn)
      )];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, n);
    },

    learnMore: async (n = 10) => {
      await ensureInit();
      introduceMoreCardsSync(n);
      const now = Date.now();
      return state.cards
        .filter((c) => c.state !== 'new' && c.due_at && c.due_at <= now)
        .sort((a, b) => a.due_at - b.due_at)
        .slice(0, 200)
        .map((c) => ({ ...c, preview: previewIntervals(c) }));
    },

    getWritingStats: async () => {
      await ensureInit();
      const wCards = state.cards.filter((c) => WRITING_TOPICS.has(c.topic));
      const byFnMap = {};
      for (const c of wCards) {
        const fn = c.function || 'opinion';
        if (!byFnMap[fn]) byFnMap[fn] = { fn, total: 0, started: 0 };
        byFnMap[fn].total += 1;
        if (c.state !== 'new') byFnMap[fn].started += 1;
      }
      return {
        total: wCards.length,
        learned: wCards.filter((c) => c.state !== 'new').length,
        byFn: Object.values(byFnMap)
      };
    },

    getWritingCards: async (opts = {}) => {
      await ensureInit();
      const now = Date.now();
      const filterWriting = () =>
        state.cards
          .filter((c) => {
            if (!WRITING_TOPICS.has(c.topic)) return false;
            if (opts.function && c.function !== opts.function) return false;
            if (opts.dueOnly && !(c.state !== 'new' && c.due_at && c.due_at <= now)) return false;
            return true;
          })
          .sort((a, b) => {
            const rank = (x) =>
              x.state !== 'new' && x.due_at && x.due_at <= now ? 0 : x.state === 'learning' ? 1 : x.state === 'new' ? 2 : 3;
            return rank(a) - rank(b) || (a.sort_order || 0) - (b.sort_order || 0);
          })
          .slice(0, opts.limit || 40);

      let cards = filterWriting();
      if (cards.length < 5) {
        const toUnlock = state.cards
          .filter((c) => WRITING_TOPICS.has(c.topic) && c.state === 'new' && (!opts.function || c.function === opts.function))
          .slice(0, 10);
        for (const c of toUnlock) {
          c.state = 'learning';
          c.due_at = now;
          c.introduced_at = now;
        }
        saveState();
        cards = filterWriting();
      }
      return cards.map((c) => ({ ...c, preview: previewIntervals(c) }));
    },

    learnMoreWriting: async (n = 10, fn = null) => {
      await ensureInit();
      const now = Date.now();
      const toUnlock = state.cards
        .filter((c) => WRITING_TOPICS.has(c.topic) && c.state === 'new' && (!fn || c.function === fn))
        .slice(0, n);
      for (const c of toUnlock) {
        c.state = 'learning';
        c.due_at = now;
        c.introduced_at = now;
      }
      saveState();
      return window.api.getWritingCards({ function: fn, limit: 40 });
    },

    getWritingFrames: async ({ function: fn = null, limit = 30 } = {}) => {
      await ensureInit();
      let frames = [...(state.frames || [])];
      if (fn) frames = frames.filter((f) => f.function === fn);
      for (let i = frames.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [frames[i], frames[j]] = [frames[j], frames[i]];
      }
      return frames.slice(0, limit);
    },

    getParaphraseBank: async (limit = 25) => {
      await ensureInit();
      const pool = state.cards.filter(
        (c) => WRITING_TOPICS.has(c.topic) && c.example && Array.isArray(c.synonyms) && c.synonyms.length > 0
      );
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, limit).map((card) => ({
        id: card.id,
        word: card.word,
        vn: card.vn,
        original: card.example,
        originalVn: card.example_vn,
        targetPhrase: card.word,
        synonyms: card.synonyms || [],
        function: card.function || 'opinion'
      }));
    },

    getImage: async (cardId) => {
      await ensureInit();
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return null;
      if (card.bundled_image) return card.bundled_image;
      if (card.remote_image_url) return card.remote_image_url;
      // Fallback: neu dien thoai co mang va the chua co anh trong APK thi lay tu Openverse
      try {
        const q = encodeURIComponent(card.word.replace(/\(.*?\)/g, '').trim());
        const res = await fetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=1&mature=false&fields=thumbnail,url`);
        if (res.ok) {
          const json = await res.json();
          const url = json?.results?.[0]?.thumbnail || json?.results?.[0]?.url || null;
          if (url) {
            card.remote_image_url = url;
            saveState();
            return url;
          }
        }
      } catch {}
      return null;
    },

    getAudio: async (cardId) => {
      await ensureInit();
      const card = state.cards.find((c) => c.id === cardId);
      if (!card) return null;
      if (card.bundled_audio) return card.bundled_audio;
      return null;
    },

    exportBackupJson: async () => {
      await ensureInit();
      return JSON.stringify(state, null, 2);
    },

    importBackupJson: async (rawJson) => {
      await ensureInit();
      const data = JSON.parse(rawJson);
      if (!Array.isArray(data.cards)) throw new Error('File JSON không hợp lệ');
      state = {
        bundleExportedAt: data.exportedAt || Date.now(),
        settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
        cards: data.cards,
        reviews: data.reviews || [],
        frames: data.frames || state.frames || []
      };
      saveState();
      return { totalCards: state.cards.length };
    },

    getApiLabInfo: async () => ({ running: false, baseUrl: null, docsUrl: null }),
    openApiDocs: async () => {},
    onNavigate: () => () => {}
  };
}

