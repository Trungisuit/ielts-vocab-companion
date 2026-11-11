/**
 * Dang ky toan bo IPC handlers giua renderer va main process.
 */
const { ipcMain, shell } = require('electron');
const db = require('./db');
const srs = require('./srs');
const media = require('./media');
const apiServer = require('./api-server');
const apkBuilder = require('./apk-builder');

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
  // Hoc them tu moi ngay lap tuc, bo qua gioi han newPerDay
  ipcMain.handle('study:learnMore', (e, n) => {
    db.introduceMoreCards(n || 10);
    actions.updateTray(db.countDue());
    const cards = db.getDueCards(200);
    return cards.map((c) => ({ ...c, preview: srs.previewIntervals(c) }));
  });

  /* ----- Media ----- */
  ipcMain.handle('media:image', async (e, cardId) => {
    const p = await media.getImage(cardId);
    return p ? `media://image/${cardId}?t=${Date.now()}` : null;
  });
  ipcMain.handle('media:audio', async (e, cardId) => {
    const p = await media.getAudio(cardId);
    return p ? `media://audio/${cardId}?t=${Date.now()}` : null;
  });
  ipcMain.handle('media:offlineStatus', () => media.getOfflineStatus());
  ipcMain.handle('media:offlineStart', () => media.startOfflineDownload(4));
  ipcMain.handle('media:offlineStop', () => media.stopOfflineDownload());

  /* ----- Mobile / APK Packager ----- */
  ipcMain.handle('mobile:status', () => apkBuilder.getBuildStatus());
  ipcMain.handle('mobile:prepareBundle', () => apkBuilder.prepareMobileBundle());
  ipcMain.handle('mobile:buildApk', () => apkBuilder.runScriptBuild());
  ipcMain.handle('mobile:openReleaseDir', () => {
    shell.openPath(apkBuilder.RELEASE_DIR);
    return apkBuilder.RELEASE_DIR;
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

  /* ----- Writing Lab ----- */
  ipcMain.handle('writing:stats', () => db.getWritingStats());
  ipcMain.handle('writing:cards', (e, opts) => {
    const o = opts || {};
    // dam bao co the de hoc: mo khoa them neu thieu
    let cards = db.listWritingCards({
      function: o.function || null,
      limit: o.limit || 40,
      dueOnly: !!o.dueOnly
    });
    if (cards.length < 5) {
      db.introduceWritingCards(10, o.function || null);
      cards = db.listWritingCards({
        function: o.function || null,
        limit: o.limit || 40
      });
    }
    return cards.map((c) => ({ ...c, preview: srs.previewIntervals(c) }));
  });
  ipcMain.handle('writing:learnMore', (e, n, fn) => {
    db.introduceWritingCards(n || 10, fn || null);
    const cards = db.listWritingCards({ function: fn || null, limit: 40 });
    return cards.map((c) => ({ ...c, preview: srs.previewIntervals(c) }));
  });
  ipcMain.handle('writing:frames', (e, opts) => db.getWritingFrames(opts || {}));
  ipcMain.handle('writing:paraphraseBank', (e, limit) => db.getParaphraseBank(limit || 25));

  /* ----- API Lab ----- */
  ipcMain.handle('apiLab:info', () => apiServer.getInfo());
  ipcMain.handle('apiLab:openDocs', () => {
    const info = apiServer.getInfo();
    if (info.docsUrl && actions.openExternal) actions.openExternal(info.docsUrl);
    return info;
  });
};
