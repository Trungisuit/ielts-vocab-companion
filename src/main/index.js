const { app, BrowserWindow, Tray, Menu, screen, protocol, net, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const db = require('./db');
const srs = require('./srs');
const scheduler = require('./scheduler');
const registerIpc = require('./ipc');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || '';
const IS_SMOKE = process.argv.includes('--smoke');
const IS_SMOKE_UI = process.argv.includes('--smoke-ui');

// media:// phuc vu anh/audio cache — phai dang ky truoc khi app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true } }
]);

let mainWindow = null;
let popupWindow = null;
let tray = null;
let isQuitting = false;

/* ---------- Cua so chinh ---------- */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL + '/index.html');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Dong cua so = an xuong tray, app van chay de nhac nho
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMainWindow(page) {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (page) mainWindow.webContents.send('app:navigate', page);
  mainWindow.show();
  mainWindow.focus();
}

/* ---------- Popup goc man hinh ---------- */

const POPUP_W = 384;
const POPUP_H = 400;

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_H,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  popupWindow.setAlwaysOnTop(true, 'screen-saver');
  if (DEV_URL) {
    popupWindow.loadURL(DEV_URL + '/popup.html');
  } else {
    popupWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'popup.html'));
  }
  popupWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      popupWindow.hide();
    }
  });
}

function positionPopup() {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - POPUP_W - 16;
  const y = workArea.y + workArea.height - POPUP_H - 16;
  popupWindow.setPosition(x, y);
}

/** Hien popup voi the tu vung — khong cuop focus cua nguoi dung */
function showPopup(card) {
  if (!popupWindow || popupWindow.isDestroyed()) createPopupWindow();
  const send = () => {
    positionPopup();
    popupWindow.webContents.send('popup:card', {
      card: { ...card, preview: srs.previewIntervals(card) },
      settings: db.getAllSettings(),
      dueCount: db.countDue()
    });
    popupWindow.showInactive();
  };
  if (popupWindow.webContents.isLoading()) {
    popupWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function hidePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.hide();
  scheduler.popupClosed();
}

/* ---------- Tray ---------- */

function trayIconPath() {
  return path.join(__dirname, '..', '..', 'build', 'tray.png');
}

function updateTrayMenu(dueCount) {
  if (!tray) return;
  const settings = db.getAllSettings();
  const menu = Menu.buildFromTemplate([
    { label: `IELTS Vocab — ${dueCount} thẻ đến hạn`, enabled: false },
    { type: 'separator' },
    { label: 'Mở Dashboard', click: () => showMainWindow('dashboard') },
    { label: 'Học ngay (Study)', click: () => showMainWindow('study') },
    { label: 'Ôn ngay (popup)', click: () => scheduler.forceReview() },
    { type: 'separator' },
    {
      label: 'Không làm phiền (DND)',
      type: 'checkbox',
      checked: !!settings.dnd,
      click: (item) => db.setSetting('dnd', item.checked)
    },
    { type: 'separator' },
    {
      label: 'Thoát hẳn',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`IELTS Vocab — ${dueCount} thẻ đến hạn ôn`);
}

function createTray() {
  let icon = nativeImage.createFromPath(trayIconPath());
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.on('click', () => showMainWindow());
  updateTrayMenu(db.countDue());
}

/* ---------- App lifecycle ---------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Mo lai file .exe khi app da chay -> hien cua so va nhac on luon
  app.on('second-instance', () => {
    showMainWindow();
    scheduler.reviewOnOpen();
  });

  app.whenReady().then(() => {
    db.init();

    if (IS_SMOKE) {
      // Che do kiem thu nhanh: khoi tao DB + seed roi thoat, khong mo cua so
      const stats = db.getStats();
      console.log('[SMOKE] total cards =', stats.total);
      console.log('[SMOKE] settings =', JSON.stringify(db.getAllSettings()));
      const introduced = db.introduceNewCards();
      console.log('[SMOKE] introduced today =', introduced, ', due =', db.countDue());
      const due = db.getDueCards(3);
      console.log('[SMOKE] sample due:', due.map((c) => c.word).join(', '));
      app.exit(0);
      return;
    }

    // Serve file cache (anh/audio) qua protocol media://<type>/<cardId>
    protocol.handle('media', (request) => {
      try {
        const u = new URL(request.url);
        const type = u.hostname; // 'image' | 'audio'
        const id = Number(u.pathname.replace('/', ''));
        const card = db.getCard(id);
        const p = type === 'image' ? card?.image_path : card?.audio_path;
        if (p) return net.fetch(pathToFileURL(p).toString());
      } catch {}
      return new Response('', { status: 404 });
    });

    registerIpc({
      showMainWindow,
      hidePopup,
      showPopup,
      updateTray: updateTrayMenu,
      snooze: (min) => {
        scheduler.snooze(min);
        hidePopup();
      }
    });

    createMainWindow();
    createPopupWindow();
    createTray();

    scheduler.start({
      showPopup,
      updateTray: updateTrayMenu
    });

    // Che do kiem thu UI: chup man hinh cua so chinh + popup roi thoat
    if (IS_SMOKE_UI) {
      const fs = require('fs');
      const outDir = path.join(__dirname, '..', '..', 'build');
      const logConsole = (win, name) => {
        win.webContents.on('console-message', (e, level, msg) => {
          if (level >= 2) console.log(`[${name} console]`, msg);
        });
      };
      logConsole(mainWindow, 'main');
      logConsole(popupWindow, 'popup');
      setTimeout(async () => {
        try {
          const img1 = await mainWindow.webContents.capturePage();
          fs.writeFileSync(path.join(outDir, 'smoke-main.png'), img1.toPNG());
          const due = db.getDueCards(1);
          if (due.length) showPopup(due[0]);
          setTimeout(async () => {
            try {
              const img2 = await popupWindow.webContents.capturePage();
              fs.writeFileSync(path.join(outDir, 'smoke-popup.png'), img2.toPNG());
            } catch (err) { console.error('popup capture error', err); }
            console.log('[SMOKE-UI] done');
            app.exit(0);
          }, 4000);
        } catch (err) {
          console.error('capture error', err);
          app.exit(1);
        }
      }, 5000);
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    scheduler.stop();
  });

  // Khong thoat khi dong het cua so — app song o tray
  app.on('window-all-closed', () => {});
}
