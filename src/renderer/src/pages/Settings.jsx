import React, { useEffect, useState } from 'react';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  const [offline, setOffline] = useState(null);
  const [apkStatus, setApkStatus] = useState(null);
  const [importMsg, setImportMsg] = useState('');

  const isMobile = !!window.api?.isMobileRuntime;

  const refreshStatus = async () => {
    try {
      if (window.api.getOfflineStatus) {
        setOffline(await window.api.getOfflineStatus());
      }
      if (window.api.getMobileBuildStatus) {
        setApkStatus(await window.api.getMobileBuildStatus());
      }
    } catch {}
  };

  useEffect(() => {
    window.api.getSettings().then(setS);
    refreshStatus();
    const t = setInterval(refreshStatus, 2000);
    return () => clearInterval(t);
  }, []);

  if (!s) return <div className="sub">Đang tải...</div>;

  const update = (patch) => { setS({ ...s, ...patch }); setSaved(false); };

  const save = async () => {
    await window.api.setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleStartOffline = async () => {
    if (!window.api.startOfflineDownload) return;
    setOffline(await window.api.startOfflineDownload());
  };

  const handleStopOffline = async () => {
    if (!window.api.stopOfflineDownload) return;
    setOffline(await window.api.stopOfflineDownload());
  };

  const handleBuildApk = async () => {
    if (!window.api.buildMobileApk) return;
    setApkStatus(await window.api.buildMobileApk());
  };

  const handleExportMobileJson = async () => {
    if (!window.api.exportBackupJson) return;
    const json = await window.api.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ielts-vocab-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMobileJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !window.api.importBackupJson) return;
    try {
      const text = await file.text();
      const res = await window.api.importBackupJson(text);
      setImportMsg(`✓ Đã nạp thành công ${res.totalCards} thẻ từ vựng!`);
    } catch (err) {
      setImportMsg(`✗ Lỗi: ${err.message}`);
    }
  };

  return (
    <div>
      <h1>Cài đặt</h1>
      <div className="sub">Điều chỉnh lộ trình Band IELTS (0 → 7.0+), nhịp học, kho ảnh Offline và đóng gói APK</div>

      <div className="settings-grid">
        <div className="setting-item">
          <div className="name">🎯 Trình độ hiện tại (Band khởi điểm)</div>
          <div className="desc">Từ mới sẽ được mở khóa từ mức này trở lên theo thứ tự dễ → khó</div>
          <select
            value={s.currentBand ?? 0}
            onChange={(e) => update({ currentBand: Number(e.target.value) })}
          >
            <option value={0}>Band 0 – 2.5 (Mất gốc / Bắt đầu từ A1)</option>
            <option value={3}>Band 3.0 – 3.5 (Sơ cấp A2)</option>
            <option value={4}>Band 4.0 – 5.0 (Cơ bản B1)</option>
            <option value={5.5}>Band 5.5 – 6.5 (Trung cấp B2)</option>
            <option value={7}>Band 7.0 (Nâng cao C1)</option>
          </select>
        </div>

        <div className="setting-item">
          <div className="name">🏆 Band mục tiêu</div>
          <div className="desc">Tập trung mở khóa từ vựng đến trình độ mục tiêu của bạn</div>
          <select
            value={s.targetBand ?? 7}
            onChange={(e) => update({ targetBand: Number(e.target.value) })}
          >
            <option value={4}>Band 4.5 – 5.0 (Đến B1)</option>
            <option value={6}>Band 5.5 – 6.5 (Đến B2)</option>
            <option value={7}>Band 7.0 (Đến C1)</option>
          </select>
        </div>

        <div className="setting-item">
          <div className="name">📚 Giữ toàn bộ từ nâng cao C2 (7.5+)</div>
          <div className="desc">Bật để giữ nguyên toàn bộ kho từ (mở khóa C2 sau khi xong C1)</div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={s.includeC2 !== false}
              onChange={(e) => update({ includeC2: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="setting-item">
          <div className="name">📅 Ngày thi IELTS</div>
          <div className="desc">Để đếm ngược và cảnh báo tiến độ trên Dashboard</div>
          <input
            type="date"
            value={s.examDate || ''}
            onChange={(e) => update({ examDate: e.target.value || null })}
          />
        </div>
        <div className="setting-item">
          <div className="name">🆕 Số từ mới mỗi ngày</div>
          <div className="desc">Mặc định 10 — điều chỉnh theo quỹ thời gian của bạn</div>
          <input
            type="number" min="1" max="100"
            value={s.newPerDay}
            onChange={(e) => update({ newPerDay: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div className="setting-item">
          <div className="name">⏱ Khoảng cách giữa các popup (phút)</div>
          <div className="desc">Popup nhắc ôn chỉ xuất hiện tối đa 1 lần trong khoảng này</div>
          <input
            type="number" min="5" max="240"
            value={s.popupIntervalMin}
            onChange={(e) => update({ popupIntervalMin: Math.max(5, Number(e.target.value) || 25) })}
          />
        </div>
        <div className="setting-item">
          <div className="name">👻 Popup tự ẩn sau (giây)</div>
          <div className="desc">Không tương tác thì popup tự trượt đi, thẻ dời lại 15 phút</div>
          <input
            type="number" min="5" max="120"
            value={s.popupAutoHideSec}
            onChange={(e) => update({ popupAutoHideSec: Math.max(5, Number(e.target.value) || 20) })}
          />
        </div>
        <div className="setting-item">
          <div className="name">🌙 Giờ yên tĩnh — bắt đầu</div>
          <div className="desc">Không hiện popup trong khung giờ này</div>
          <input
            type="time"
            value={s.quietStart}
            onChange={(e) => update({ quietStart: e.target.value })}
          />
        </div>
        <div className="setting-item">
          <div className="name">☀️ Giờ yên tĩnh — kết thúc</div>
          <div className="desc">Sau giờ này popup hoạt động trở lại</div>
          <input
            type="time"
            value={s.quietEnd}
            onChange={(e) => update({ quietEnd: e.target.value })}
          />
        </div>
        <div className="setting-item">
          <div className="name">😴 Thời gian Snooze (phút)</div>
          <div className="desc">Khi bấm nút Snooze trên popup</div>
          <input
            type="number" min="5" max="240"
            value={s.snoozeMin}
            onChange={(e) => update({ snoozeMin: Math.max(5, Number(e.target.value) || 30) })}
          />
        </div>
        <div className="setting-item">
          <div className="name">🔕 Không làm phiền (DND)</div>
          <div className="desc">Tạm dừng toàn bộ popup nhắc nhở</div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={!!s.dnd}
              onChange={(e) => update({ dnd: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <button className="btn primary" onClick={save}>💾 Lưu cài đặt</button>
        {saved && <span style={{ marginLeft: 12, color: 'var(--green)' }}>✓ Đã lưu</span>}
      </div>

      {!isMobile && offline && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>🖼️ Kho Ảnh & Audio Offline (Dùng không cần Internet)</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            Đã lưu offline trên máy: <b>{offline.imagesCached}</b> / {offline.totalCards} ảnh minh họa ·{' '}
            <b>{offline.audioCached}</b> file phát âm MP3. Khi tải xong, bạn có thể học hoàn toàn không cần mạng và đóng gói toàn bộ ảnh này vào file APK.
          </p>
          {offline.running && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                Đang tải: {offline.done} / {offline.total} thẻ...
              </div>
              <div className="progress-line" style={{ margin: 0 }}>
                <div style={{ width: `${offline.total ? (offline.done / offline.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {!offline.running ? (
              <button className="btn primary" onClick={handleStartOffline}>
                ⬇️ Tải toàn bộ ảnh & audio về máy (Offline)
              </button>
            ) : (
              <button className="btn" onClick={handleStopOffline}>
                ⏸ Tạm dừng tải
              </button>
            )}
          </div>
        </div>
      )}

      {!isMobile && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>📱 Đóng gói ứng dụng Android (APK mới nhất)</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            Mỗi khi bạn thêm/sửa từ vựng hoặc tải thêm ảnh trên PC, bấm nút bên dưới để đóng gói toàn bộ từ vựng + ảnh offline mới nhất thành file <code>release/IELTS-Vocab-latest.apk</code> (kèm file backup <code>release/ielts-vocab-latest-backup.json</code>).
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <button
              className="btn primary"
              disabled={apkStatus?.running}
              onClick={handleBuildApk}
            >
              {apkStatus?.running ? '⏳ Đang đóng gói APK...' : '⚡ Đóng gói APK mới nhất (từ dữ liệu PC)'}
            </button>
            <button className="btn" onClick={() => window.api.openReleaseDir()}>
              📂 Mở thư mục chứa APK (release/)
            </button>
          </div>
          {apkStatus?.step && (
            <div style={{ fontSize: 13, color: apkStatus.error ? 'var(--amber)' : 'var(--green)', marginTop: 6 }}>
              {apkStatus.step}
            </div>
          )}
          {apkStatus?.error && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
              {apkStatus.error}
            </div>
          )}
          {apkStatus?.logs?.length > 0 && (
            <pre style={{ maxHeight: 150, overflow: 'auto', fontSize: 11, marginTop: 8, padding: 8, background: '#0b0d13', borderRadius: 6 }}>
              {apkStatus.logs.slice(-15).join('\n')}
            </pre>
          )}
        </div>
      )}

      {isMobile && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🔄 Đồng bộ dữ liệu với PC (.json)</h3>
          <p className="sub" style={{ marginBottom: 10 }}>
            Bạn có thể nạp file <code>ielts-vocab-latest-backup.json</code> từ PC vào điện thoại (hoặc xuất tiến độ từ điện thoại ra file).
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              📥 Nạp file dữ liệu từ PC (.json)
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportMobileJson} />
            </label>
            <button className="btn" onClick={handleExportMobileJson}>
              📤 Xuất tiến độ ra file (.json)
            </button>
          </div>
          {importMsg && <div style={{ marginTop: 8, fontSize: 13 }}>{importMsg}</div>}
        </div>
      )}
    </div>
  );
}
