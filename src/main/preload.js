const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* Stats */
  getStats: () => ipcRenderer.invoke('stats:get'),

  /* Settings */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (obj) => ipcRenderer.invoke('settings:set', obj),

  /* Cards */
  listCards: (query) => ipcRenderer.invoke('cards:list', query),
  listTopics: () => ipcRenderer.invoke('cards:topics'),
  getCard: (id) => ipcRenderer.invoke('cards:get', id),
  addCard: (data) => ipcRenderer.invoke('cards:add', data),
  updateCard: (id, data) => ipcRenderer.invoke('cards:update', id, data),
  deleteCard: (id) => ipcRenderer.invoke('cards:delete', id),
  toggleStar: (id) => ipcRenderer.invoke('cards:star', id),

  /* Study / SRS */
  getDueCards: (limit) => ipcRenderer.invoke('study:due', limit),
  rateCard: (id, rating) => ipcRenderer.invoke('cards:rate', id, rating),
  getDistractors: (cardId, n) => ipcRenderer.invoke('study:distractors', cardId, n),
  learnMore: (n) => ipcRenderer.invoke('study:learnMore', n),

  /* Writing Lab */
  getWritingStats: () => ipcRenderer.invoke('writing:stats'),
  getWritingCards: (opts) => ipcRenderer.invoke('writing:cards', opts),
  learnMoreWriting: (n, fn) => ipcRenderer.invoke('writing:learnMore', n, fn),
  getWritingFrames: (opts) => ipcRenderer.invoke('writing:frames', opts),
  getParaphraseBank: (limit) => ipcRenderer.invoke('writing:paraphraseBank', limit),

  /* API Lab */
  getApiLabInfo: () => ipcRenderer.invoke('apiLab:info'),
  openApiDocs: () => ipcRenderer.invoke('apiLab:openDocs'),

  /* Media */
  getImage: (cardId) => ipcRenderer.invoke('media:image', cardId),
  getAudio: (cardId) => ipcRenderer.invoke('media:audio', cardId),

  /* Popup */
  onPopupCard: (cb) => {
    const listener = (e, payload) => cb(payload);
    ipcRenderer.on('popup:card', listener);
    return () => ipcRenderer.removeListener('popup:card', listener);
  },
  popupRate: (id, rating) => ipcRenderer.invoke('popup:rate', id, rating),
  popupSnooze: () => ipcRenderer.invoke('popup:snooze'),
  popupHide: (cardId) => ipcRenderer.invoke('popup:hide', cardId),
  popupOpenMain: (page) => ipcRenderer.invoke('popup:openMain', page),

  /* App */
  openMain: (page) => ipcRenderer.invoke('app:openMain', page),
  onNavigate: (cb) => {
    const listener = (e, page) => cb(page);
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  }
});
