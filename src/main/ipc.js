/**
 * Dang ky toan bo IPC handlers giua renderer va main process.
 */
const { ipcMain } = require('electron');
const db = require('./db');
const srs = require('./srs');
const media = require('./media');

module.exports = function registerIpc(actions) {
  /* ----- Stats / Dashboard ----- */
  ipcMain.handle('stats:get', () => db.getStats());

  /* ----- Settings ----- */
  ipcMain.handle('settings:get', () => db.getAllSettings());
  ipcMain.handle('settings:set', (e, obj) => {
    db.setSettings(obj);
    actions.updateTray(db.countDue());
    return db.getAllSettings();
  });

  /* ----- Cards / Browse ----- */
  ipcMain.handle('cards:list', (e, query) => db.listCards(query || {}));
  ipcMain.handle('cards:topics', () => db.listTopics());
  ipcMain.handle('cards:get', (e, id) => db.getCard(id));
  ipcMain.handle('cards:add', (e, data) => db.addCard(data));
  ipcMain.handle('cards:update', (e, id, data) => db.updateCard(id, data));
  ipcMain.handle('cards:delete', (e, id) => db.deleteCard(id));
  ipcMain.handle('cards:star', (e, id) => db.toggleStar(id));

  /* ----- Study / SRS ----- */
  ipcMain.handle('study:due', (e, limit) => {
    db.introduceNewCards();
    const cards = db.getDueCards(limit || 100);
    return cards.map((c) => ({ ...c, preview: srs.previewIntervals(c) }));
  });
  ipcMain.handle('cards:rate', (e, id, rating) => {
    const result = srs.rate(id, rating);
    actions.updateTray(db.countDue());
    return result;
  });
  ipcMain.handle('study:distractors', (e, cardId, n) => db.getDistractors(cardId, n || 3));

  /* ----- Media ----- */
  ipcMain.handle('media:image', async (e, cardId) => {
    const p = await media.getImage(cardId);
    return p ? `media://image/${cardId}?t=${Date.now()}` : null;
  });
  ipcMain.handle('media:audio', async (e, cardId) => {
    const p = await media.getAudio(cardId);
    return p ? `media://audio/${cardId}?t=${Date.now()}` : null;
  });

  /* ----- Popup ----- */
  ipcMain.handle('popup:rate', (e, id, rating) => {
    srs.rate(id, rating);
    actions.updateTray(db.countDue());
    // tra ve the tiep theo de on lien mach trong cung popup (neu con)
    const next = db.getDueCards(1);
    if (next.length) {
      return { card: { ...next[0], preview: srs.previewIntervals(next[0]) }, dueCount: db.countDue() };
    }
    return { card: null, dueCount: 0 };
  });
  ipcMain.handle('popup:snooze', () => {
    const settings = db.getAllSettings();
    actions.snooze(settings.snoozeMin || 30);
  });
  ipcMain.handle('popup:hide', (e, cardId) => {
    // khong tuong tac: don the lai 15 phut de khoi hien lai ngay
    if (cardId) db.postponeCard(cardId, 15);
    actions.hidePopup();
  });
  ipcMain.handle('popup:openMain', (e, page) => {
    actions.hidePopup();
    actions.showMainWindow(page || 'study');
  });

  /* ----- App ----- */
  ipcMain.handle('app:openMain', (e, page) => actions.showMainWindow(page));
};
