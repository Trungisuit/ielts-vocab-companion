import React, { useEffect, useMemo, useState } from 'react';
import { CEFR_BAND_LABELS } from '../lib.js';

export default function Dashboard({ onGoStudy }) {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    window.api.getStats().then(setStats);
    window.api.getSettings().then(setSettings);
  }, []);

  if (!stats || !settings) return <div className="sub">Đang tải...</div>;

  const examDays = settings.examDate
    ? Math.ceil((new Date(settings.examDate + 'T00:00:00') - new Date()) / 86400000)
    : null;

  // canh bao tut tien do: so tu can hoc moi ngay trong pham vi band muc tieu de kip ky thi
  const remainWords = stats.targetRemaining ?? (stats.total - stats.learned);
  const neededPerDay = examDays && examDays > 30 && remainWords > 0
    ? Math.ceil(remainWords / (examDays - 30)) // chua 30 ngay cuoi de on tong
    : null;
  const behind = neededPerDay && neededPerDay > settings.newPerDay;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="sub">Chào bạn! Cùng tiến gần hơn tới band điểm mục tiêu nhé.</div>

      {examDays !== null && examDays >= 0 && (
        <div className="exam-banner">
          <div className="days">{examDays}</div>
          <div>
            <b>ngày nữa đến kỳ thi IELTS</b> ({settings.examDate})
            {behind && (
              <div style={{ color: 'var(--amber)', fontSize: 13, marginTop: 2 }}>
                ⚠ Để học hết bộ từ trước kỳ thi (chừa 1 tháng ôn tổng), bạn cần
                nâng lên ~{neededPerDay} từ mới/ngày trong Cài đặt.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="label">🔥 Chuỗi ngày học</div>
          <div className="value">{stats.streak} <small>ngày</small></div>
          <div className="hint">{stats.reviewedToday > 0 ? 'Hôm nay đã học ✓' : 'Hôm nay chưa học'}</div>
        </div>
        <div className="stat">
          <div className="label">⏰ Thẻ đến hạn</div>
          <div className="value" style={{ color: stats.due > 0 ? 'var(--amber)' : undefined }}>
            {stats.due}
          </div>
          <div className="hint">{stats.newToday} từ mới hôm nay</div>
        </div>
        <div className="stat">
          <div className="label">📖 Đã học</div>
          <div className="value">{stats.learned} <small>/ {stats.total}</small></div>
          <div className="hint">{Math.round((stats.learned / Math.max(1, stats.total)) * 100)}% bộ từ vựng</div>
        </div>
        <div className="stat">
          <div className="label">🏆 Đã thuộc lòng</div>
          <div className="value">{stats.mastered}</div>
          <div className="hint">nhớ trên 3 tuần</div>
        </div>
      </div>

      {stats.due > 0 && (
        <button className="btn primary" style={{ marginBottom: 22 }} onClick={onGoStudy}>
          🎓 Ôn ngay {stats.due} thẻ đến hạn
        </button>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="chart-title">Lộ trình từ vựng theo Band IELTS (0 → 7.0+)</div>
        <BandBreakdown byCefr={stats.byCefr || []} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="chart-title">Tiến độ tích lũy từ vựng</div>
        <CumulativeChart weekly={stats.weekly} total={stats.total} />
      </div>
      <div className="panel">
        <div className="chart-title">Lượt ôn tập 30 ngày gần nhất</div>
        <DailyBars daily={stats.daily} />
      </div>
    </div>
  );
}

/* Tien do theo tung tang CEFR / Band */
function BandBreakdown({ byCefr }) {
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const map = Object.fromEntries((byCefr || []).map((r) => [r.cefr, r]));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
      {order.map((lv) => {
        const row = map[lv] || { total: 0, learned: 0, mastered: 0 };
        const pct = row.total > 0 ? Math.round((row.learned / row.total) * 100) : 0;
        return (
          <div key={lv} style={{ background: 'var(--bg3, #171b26)', padding: '10px 12px', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <b>{lv} · {CEFR_BAND_LABELS[lv] || lv}</b>
              <span style={{ color: 'var(--text2)' }}>{row.learned}/{row.total} ({pct}%)</span>
            </div>
            <div className="progress-line" style={{ margin: 0, height: 6 }}>
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Duong tich luy so tu da hoc */
function CumulativeChart({ weekly, total }) {
  const points = useMemo(() => {
    let sum = 0;
    return weekly.map((r) => { sum += r.n; return { d: r.d, v: sum }; });
  }, [weekly]);

  const W = 860, H = 160, P = 8;
  if (points.length === 0) {
    return <div className="sub" style={{ margin: 0 }}>Chưa có dữ liệu — hãy bắt đầu học để thấy tiến độ!</div>;
  }
  const maxV = Math.max(total, points[points.length - 1].v, 1);
  const xs = (i) => P + (i / Math.max(1, points.length - 1)) * (W - 2 * P);
  const ys = (v) => H - P - (v / maxV) * (H - 2 * P);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(p.v)}`).join(' ');
  const area = `${path} L${xs(points.length - 1)},${H - P} L${xs(0)},${H - P} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#grad)" />
      <path d={path} fill="none" stroke="#818cf8" strokeWidth="2.5" />
      <text x={W - P} y={ys(points[points.length - 1].v) - 8} fill="#e8eaf0" fontSize="13" textAnchor="end">
        {points[points.length - 1].v} / {total} từ
      </text>
    </svg>
  );
}

/* Cot so luot on moi ngay */
function DailyBars({ daily }) {
  const days = useMemo(() => {
    const map = Object.fromEntries(daily.map((r) => [r.d, r.n]));
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ d: key, n: map[key] || 0, label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
    return out;
  }, [daily]);

  const W = 860, H = 130, P = 6;
  const maxN = Math.max(...days.map((x) => x.n), 5);
  const bw = (W - 2 * P) / days.length - 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130 }}>
      {days.map((x, i) => {
        const h = (x.n / maxN) * (H - 30);
        return (
          <g key={x.d}>
            <rect
              x={P + i * (bw + 4)} y={H - 20 - h} width={bw} height={Math.max(h, 2)}
              rx="3" fill={x.n > 0 ? '#6366f1' : '#2a3040'}
            />
            {i % 5 === 0 && (
              <text x={P + i * (bw + 4) + bw / 2} y={H - 5} fill="#9aa3b5" fontSize="10" textAnchor="middle">
                {x.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
