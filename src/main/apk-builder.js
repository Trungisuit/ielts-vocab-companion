/**
 * Dong goi du lieu moi nhat tu PC (DB + anh + audio offline) sang bundle cho Mobile
 * va goi quy trinh build file APK (Android).
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('./db');

const ROOT_DIR = path.join(__dirname, '..', '..');
const BUNDLE_DIR = path.join(ROOT_DIR, 'src', 'renderer', 'public', 'mobile-bundle');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

let buildState = {
  running: false,
  step: '',
  logs: [],
  apkPath: null,
  bundlePath: null,
  error: null,
  finishedAt: null
};

function pushLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  buildState.logs.push(line);
  if (buildState.logs.length > 120) buildState.logs.shift();
}

function copyDirFiles(srcDir, destDir, extFilter) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const name of fs.readdirSync(srcDir)) {
    if (extFilter && !name.toLowerCase().endsWith(extFilter)) continue;
    const s = path.join(srcDir, name);
    const d = path.join(destDir, name);
    try {
      fs.copyFileSync(s, d);
      count += 1;
    } catch {}
  }
  return count;
}

/**
 * Xuat goi du lieu moi nhat tu PC sang thu muc mobile-bundle
 * (gom snapshot.json + toan bo anh & audio da cache).
 */
function prepareMobileBundle() {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
  const snapshot = db.exportSnapshot();

  const dataDir = db.getDataDir();
  const imgSrc = path.join(dataDir, 'images');
  const audSrc = path.join(dataDir, 'audio');
  const imgDest = path.join(BUNDLE_DIR, 'images');
  const audDest = path.join(BUNDLE_DIR, 'audio');

  const imgCount = copyDirFiles(imgSrc, imgDest, '.jpg');
  const audCount = copyDirFiles(audSrc, audDest, '.mp3');

  // Danh dau the nao da co file offline trong bundle
  const imgSet = new Set(
    fs.existsSync(imgDest) ? fs.readdirSync(imgDest).map((f) => Number(path.parse(f).name)) : []
  );
  const audSet = new Set(
    fs.existsSync(audDest) ? fs.readdirSync(audDest).map((f) => Number(path.parse(f).name)) : []
  );

  snapshot.cards = snapshot.cards.map((c) => ({
    ...c,
    bundled_image: imgSet.has(c.id) ? `./mobile-bundle/images/${c.id}.jpg` : null,
    bundled_audio: audSet.has(c.id) ? `./mobile-bundle/audio/${c.id}.mp3` : null
  }));

  const snapshotPath = path.join(BUNDLE_DIR, 'snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');

  // Luu them 1 ban backup JSON ra release/ de co the import nhanh tren dien thoai
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const backupPath = path.join(RELEASE_DIR, 'ielts-vocab-latest-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(snapshot), 'utf8');

  return {
    totalCards: snapshot.cards.length,
    imagesBundled: imgCount,
    audioBundled: audCount,
    snapshotPath,
    backupPath
  };
}

function getBuildStatus() {
  const defaultApk = path.join(RELEASE_DIR, 'IELTS-Vocab-latest.apk');
  return {
    ...buildState,
    apkExists: fs.existsSync(defaultApk),
    apkPath: fs.existsSync(defaultApk) ? defaultApk : buildState.apkPath
  };
}

function runScriptBuild() {
  if (buildState.running) return getBuildStatus();
  buildState = {
    running: true,
    step: 'Đang đóng gói dữ liệu & media từ PC...',
    logs: [],
    apkPath: null,
    bundlePath: null,
    error: null,
    finishedAt: null
  };

  (async () => {
    try {
      const info = prepareMobileBundle();
      buildState.bundlePath = info.backupPath;
      pushLog(`Đã xuất ${info.totalCards} từ vựng, ${info.imagesBundled} ảnh, ${info.audioBundled} audio.`);

      const psScript = path.join(ROOT_DIR, 'scripts', 'build-apk.ps1');
      if (!fs.existsSync(psScript)) {
        buildState.step = 'Đã xuất gói dữ liệu mobile (chưa có script build-apk.ps1)';
        buildState.running = false;
        buildState.finishedAt = Date.now();
        return;
      }

      buildState.step = 'Đang chạy tiến trình đóng gói APK (Vite + Android)...';
      pushLog('Khởi chạy scripts/build-apk.ps1...');

      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript],
        { cwd: ROOT_DIR, windowsHide: true }
      );

      child.stdout.on('data', (d) => {
        String(d)
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((line) => {
            pushLog(line);
            buildState.step = line.slice(0, 90);
          });
      });
      child.stderr.on('data', (d) => {
        String(d)
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((line) => pushLog('[WARN] ' + line));
      });

      child.on('close', (code) => {
        const outApk = path.join(RELEASE_DIR, 'IELTS-Vocab-latest.apk');
        if (code === 0 && fs.existsSync(outApk)) {
          buildState.apkPath = outApk;
          buildState.step = 'Hoàn tất! File APK mới nhất đã sẵn sàng tại release/IELTS-Vocab-latest.apk';
          pushLog('Đóng gói APK thành công: ' + outApk);
        } else {
          buildState.error =
            code === 0
              ? null
              : `Tiến trình đóng gói dừng (mã ${code}). Đã cập nhật sẵn gói dữ liệu mobile mới nhất — xem hướng dẫn hoặc log bên dưới.`;
          buildState.step = 'Đã cập nhật gói dữ liệu mới nhất (xem chi tiết log)';
        }
        buildState.running = false;
        buildState.finishedAt = Date.now();
      });
    } catch (err) {
      buildState.error = err.message || String(err);
      buildState.running = false;
      buildState.finishedAt = Date.now();
    }
  })();

  return getBuildStatus();
}

module.exports = {
  prepareMobileBundle,
  getBuildStatus,
  runScriptBuild,
  RELEASE_DIR
};

