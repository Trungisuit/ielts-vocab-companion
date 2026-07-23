import React, { useEffect, useState } from 'react';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { window.api.getSettings().then(setS); }, []);

  if (!s) return <div className="sub">Đang tải...</div>;

  const update = (patch) => { setS({ ...s, ...patch }); setSaved(false); };

  const save = async () => {
    await window.api.setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1>Cài đặt</h1>
      <div className="sub">Điều chỉnh nhịp học và cách nhắc nhở cho phù hợp với bạn</div>

      <div className="settings-grid">
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
          <div className="desc">Mặc định 10 — đủ học hết ~1000 từ trong 5 tháng</div>
          <input
            type="number" min="1" max="50"
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

      <div style={{ marginTop: 22 }}>
        <button className="btn primary" onClick={save}>💾 Lưu cài đặt</button>
        {saved && <span style={{ marginLeft: 12, color: 'var(--green)' }}>✓ Đã lưu</span>}
      </div>
    </div>
  );
}
